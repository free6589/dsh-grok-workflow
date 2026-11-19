# RSI State (overwritten every round; keep under 100 lines)

Updated: 2026-11-19T14:10+08:00 · round 20 complete · commit `b38d23a` on `main`, annotated tag
`v0.11.19` pushed and verified remotely (CI 44469902581 success, Release with asset) · `npm run ci`
63 files / 1156 tests PASS · `verify:lib` = 149 files byte-identical · previous release `0.11.18` (commit `3b131c4`)

## Facts

- Repo: `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`, remote `origin`
  = https://github.com/free6589/dsh-grok-workflow.git (pushed, fast-forward).
- Release line (rounds 4–20): `v0.11.4` bcb601d · `v0.11.5` bf0dc91 · `v0.11.6` 88d133b ·
  `v0.11.7` 1760d50 · `v0.11.8` a045154 · `v0.11.9` 596239a · `v0.11.10` 000a56e ·
  `v0.11.11` 6ff6373 · `v0.11.12` be64d56 · `v0.11.13` 7a79efb · `v0.11.14` 20eafea (no Release) ·
  `v0.11.15` 50c0321 · `v0.11.16` 63a4fbb · `v0.11.17` 5fc3e1d · `v0.11.18` 3b131c4 · `v0.11.19` b38d23a.
  Test-count line: 54/985 → … → 62/1139 (round 16) → 62/1142 (0.11.16) → 63/1154 (0.11.17) →
  **63/1155** (0.11.18) → **63/1156** (0.11.19).
- Round 20 (this round): `machineLedger()` rendered four roles while `renderReport()` renders five.
  Role table four→five in report order + parity assertion against the canonical route line;
  `MACHINE_DETAIL` strips `supervisor=` like every other role. Tests: +1 delivery (named +
  parity), +1 report assertion. Docs: D-076, VALIDATION Round 65, CHANGELOG `## [0.11.19]`
  bilingual. Re-landed from abandoned `rsi/round-8:644897b` (never merged; Synthesis split
  stays out of scope). Evidence: `.rsi/evidence/round-020/`.
- Round 19 (previous): load-time route validation covered four of the five routed roles.
  `src/settings.ts` `ROLE_ORDER` now lists `supervisor` too (report order, same as
  `src/report.ts` `ROLE_NAMES`), so `validateRoutes` + the empty-cap note cover it.
  Evidence: `.rsi/evidence/round-019/`.
- Round 18 (two rounds ago): resident parallel `RunGuardian` beside the serial supervisor
  (`src/guardian.ts`), `0.11.17`.
- Ledger: `.rsi/ledger.jsonl`. Resume from the highest `round` with `status: OK`.
- Process tooling: `bump-version.py` + `finish-round.py` (R6; refuses red CI/existing tags, never forces).
  `npm test` rebuilds `lib/` — committed artifacts need `verify:lib`, which CI runs.

## Pool (value / risk / size)

P0 — wrong behaviour or false statements

- No open P0. Round 19 closed the load-time route gap.

P1 — docs and version truth

- Remaining: `docs/knowledge/WORKFLOW-DESIGN.md:1042/:999` docs-sync lines (later task).

P2 — tests and reliability

- P2-01/P2-02 done.

P3 — UX (still OPEN, unchanged)

- P3-01 OPEN Settings page wording for the per-route cap and the deadline field.
- P3-02 OPEN Progress tab detail rows for members with no reported facts.

`P ·` items (see `POOL.md`) — same class as round 19's finding, each its own round:

- `src/run.ts:141` — `configRouteLabels` omits `supervisor`, so supervisor routes never enter
  the cross-run busy hint (C1 input, not ledger rendering). Next single-theme round.
- Proposal: DONE for the two renderers (parity assertion this round); extend the pin to
  `configRouteLabels` when that round lands.

## Failures

- Round 4 first review FAIL (closed in rework). Round 5: one existing test failed, assertion
  tightened. Rounds 8/9/12: BLOCKED or red-by-design, recorded.
- Round 14: published from a tree a concurrent writer was editing → stale `lib/`, red CI, no
  Release; repaired in round 15 (patch), not hidden.
- Round 20: fresh-context review **PASS** (6 findings, zero rework rounds).
- Round 19: first fresh-context review **FAIL** — four documentation-accuracy defects (a false
  "only role after verification" claim, a migration instruction that would have silently
  disabled the supervisor gate, an inverted model condition in README, and an overstated
  "last step of a run"). All four verified against source and fixed; second review **PASS**
  with two line-level nits also fixed (HANDOFF phrasing, `2419`→`2418`).
- Consecutive failed rounds: 0. Consecutive valueless rounds: 0. Remote: CI `44469902581` success, Release `v0.11.19` published with `dsh-grok-workflow-0.11.19.tgz`.

## Final verification (round 20, commit `b38d23a`)

- `npm run ci` exit 0 · **63 files / 1156 tests PASS** · `tsc --noEmit` 0 errors ·
  oxlint 22 warnings / 0 errors · `npm run build` twice → consistent (idempotent,
  `client bundle: 224525 bytes`) · `npm run verify:lib` = 149 files byte-identical.
- Baseline before the change (`762becc`): 63 files / 1155 tests PASS; red proof = 1 failed
  (temp probe asserting `supervisor=p1/m-sv` in the ledger).
- NOT_RUN: a real model-backed run; GUI click; rrule timed delivery; tag-install verification.

## Loop status (this session)

- Rounds 5–20 landed: P0-02, P1-02/03, P2-01/02, redaction call sites, gate landing,
  repeat-run surface + release, release repair, composer switch + heartbeat brakes,
  heartbeat recognition + settings wording, resident guardian, supervisor route
  validation, ledger supervisor parity.
- Remaining: P3-01, P3-02, `run.ts:141` configRouteLabels, and the `P ·` items above.

## Open decisions

- PROTOCOL says "do not commit, do not tag" while the task text requires a commit and a tag per
  round. Resolution used since round 1: every round is committed and pushed, never forced, never
  moved; one tag only when a release is authorized.
- D-068: operator authorized P4 (repeat-run) before P3-01/P3-02; order only, no gate relaxed.
- D-075: every routed role is in `ROLE_ORDER`; `supervisor` included. Migration for a bad
  supervisor route = fix the route or blank its `provider` (inherits the run's provider);
  deleting the chain leaves the run unsupervised.
- Allowed untracked files (deliberate, never committed): `settings-simple-mock.html`.
