# RSI State (overwritten every round; keep under 100 lines)

Updated: 2026-11-19T20:45+08:00 · round 22 landed as commit `6c8b0dc` on `main` (not pushed, no
tag, no release — development commit) · `npm run ci` 63 files / 1158 tests PASS ·
`verify:lib` = 149 files byte-identical ·
last published release `v0.11.20` (commit `c911e6e`, CI `44530885058`, Release + `dsh-grok-workflow-0.11.20.tgz`)

## Facts

- Repo: `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`, remote `origin`
  = https://github.com/free6589/dsh-grok-workflow.git.
- Release line (rounds 4–20): `v0.11.4` bcb601d · `v0.11.5` bf0dc91 · `v0.11.6` 88d133b ·
  `v0.11.7` 1760d50 · `v0.11.8` a045154 · `v0.11.9` 596239a · `v0.11.10` 000a56e ·
  `v0.11.11` 6ff6373 · `v0.11.12` be64d56 · `v0.11.13` 7a79efb · `v0.11.14` 20eafea (no Release) ·
  `v0.11.15` 50c0321 · `v0.11.16` 63a4fbb · `v0.11.17` 5fc3e1d · `v0.11.18` 3b131c4 · `v0.11.19` b38d23a.
  Test-count line: 54/985 → … → 63/1156 (0.11.19) → 63/1157 (round 21) → 63/1158 (round 22) → **`0.11.20`** c911e6e.
- Round 22 (this round): `snapshot()` (`src/checkpoint/wiring.ts`) gated `time.durationMs` on
  `countCeiling` (rows, 1e6) while the reader takes `msCeiling`: runs past 16m40s recorded no
  duration. One-line ceiling swap + comment; +1 test (48h clock). Docs: D-077, VALIDATION Round 67,
  CHANGELOG `[Unreleased]` bilingual. Evidence `.rsi/evidence/round-022/`.
- Round 21 (previous): `configRouteLabels()` (`src/run.ts`) flattened four roles while five are
  routed, so a `roles.supervisor` chain never entered the C1 cross-run busy hint. Five roles now,
  report order (`ROLE_NAMES` / `ROLE_ORDER`); `test/route-concurrency.spec.ts` pins the full label
  list. Third instance of the round-19/20 omission class; `POOL.md` R21 DONE. Evidence
  `.rsi/evidence/round-021/`. The change and its red/green evidence were left uncommitted by a
  concurrent writer at 17:05; the 2026-11-19 cleanup task verified and landed them.
- Round 20: `machineLedger()` rendered four roles while `renderReport()` renders five → role table
  four→five + parity assertion, `MACHINE_DETAIL` strips `supervisor=`. `0.11.19`. Evidence
  `.rsi/evidence/round-020/`. (`POOL.md` R8 now DONE.)
- Round 19 (older): `src/settings.ts` `ROLE_ORDER` gained `supervisor`, so `validateRoutes` and the empty-cap
  note cover every routed role. `0.11.18`. Evidence `.rsi/evidence/round-019/`.
- Round 18 (older): resident parallel `RunGuardian` beside the serial supervisor (`src/guardian.ts`), `0.11.17`.
- Ledger: `.rsi/ledger.jsonl`. Resume from the highest `status: OK` round.
- Process tooling: `bump-version.py` + `finish-round.py` (R6; refuses red CI/existing tags).

## Pool (value / risk / size)

P0 — wrong behaviour or false statements

- No open P0. Rounds 19/20/21 closed the supervisor-omission sites; round 22 fixed a silent data drop.

P1 — docs and version truth

- Remaining: `docs/knowledge/WORKFLOW-DESIGN.md:1042/:999` docs-sync lines (later task).

P2 — tests and reliability

- P2-01/P2-02 done.

P3 — UX (still OPEN, unchanged)

- P3-01 OPEN Settings page wording for the per-route cap and the deadline field.
- P3-02 OPEN Progress tab detail rows for members with no reported facts.

`P ·` items (see `POOL.md`) — each its own round:

- Remaining highlights: redaction call sites (`records.ts`, `history.ts`), dropped keys one level
  down in `config.ts`, `R6` `grokDefault` validation, `R9`/`R11` report wording, the duplicate
  `Synthesis: <mode>` ledger label.

## Working tree policy

- No deliberately untracked file any more. `settings-simple-mock.html` (operator mock, design input
  for D-055, formerly whitelisted as untracked) is archived byte-identically at
  `.rsi/archive/settings-simple-mock.html` with provenance in `.rsi/archive/README.md`; restore by
  copying it back to the repository root. `.rsi/` is not part of the published package.
- Scratch area for one-off probes: `.tmp/` (gitignored). Nothing else may sit untracked at the
  root — a stray root file makes every `git status` noisy and hides real work.

## Failures

- Round 4 first review FAIL (closed in rework). Round 5: one existing test failed, assertion
  tightened. Rounds 8/9/12: BLOCKED or red-by-design, recorded.
- Round 14: published from a tree a concurrent writer was editing → stale `lib/`, red CI, no
  Release; repaired in round 15 (patch), not hidden.
- Round 20 fresh-context review **PASS** (6 findings, zero rework). Round 19 first review **FAIL**
  (four doc-accuracy defects, all fixed), second review **PASS**.
- Rounds 20/21 concurrency: a second writer edited `src/run.ts` + `test/route-concurrency.spec.ts`
  at 17:04:54–17:05:02 while a read-only verification round was running. The edits survived as
  uncommitted work and were landed in round 21; nothing was lost and nothing was silently dropped.
- Consecutive failed rounds: 0. Consecutive valueless rounds: 0. Remote `main` = `337b061`
  (= `v0.11.19` tree) as of round 21; local is one round ahead and unpushed.

## Final verification (round 22, commit `6c8b0dc`)

- `npm run ci` exit 0 · **63 files / 1158 tests PASS** · `tsc --noEmit` 0 errors ·
  oxlint 22 warnings / 0 errors · build idempotent · `verify:lib` 149 files byte-identical.
- Red proof: 33m20s clock run recorded `durationMs: undefined` pre-fix, exact value post-fix.
- NOT_RUN: a real 16+ min run's checkpoint re-read; release.

## Open decisions

- PROTOCOL says "do not commit, do not tag" while the task text requires a commit and a tag per
  round. Resolution used since round 1: every round is committed; pushed only when the round
  publishes, never forced, never moved.
- D-068: operator authorized P4 (repeat-run) before P3-01/P3-02; order only, no gate relaxed.
- D-075: every routed role is in `ROLE_ORDER`; `supervisor` included. Migration for a bad
  supervisor route = fix the route or blank its `provider` (inherits the run's provider);
  deleting the chain leaves the run unsupervised.
- 2026-11-19 cleanup: the "allowed untracked" whitelist is retired — see Working tree policy.
