# RSI State (overwritten every round; keep under 100 lines)

Updated: 2026-11-19T13:30+08:00 · round 19 complete · commit `3b131c4` on `main`, annotated tag
`v0.11.18` pushed and verified remotely · `npm run ci` 63 files / 1155 tests PASS · `verify:lib`
at `3b131c4` = 149 files byte-identical · previous release `0.11.17` (commit `5fc3e1d`)

## Facts

- Repo: `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`, remote `origin`
  = https://github.com/free6589/dsh-grok-workflow.git (pushed, fast-forward).
- Release line (rounds 4–19): `v0.11.4` bcb601d · `v0.11.5` bf0dc91 · `v0.11.6` 88d133b ·
  `v0.11.7` 1760d50 · `v0.11.8` a045154 · `v0.11.9` 596239a · `v0.11.10` 000a56e ·
  `v0.11.11` 6ff6373 · `v0.11.12` be64d56 · `v0.11.13` 7a79efb · `v0.11.14` 20eafea (no Release) ·
  `v0.11.15` 50c0321 · `v0.11.16` 63a4fbb · `v0.11.17` 5fc3e1d · `v0.11.18` 3b131c4.
  Test-count line: 54/985 → … → 62/1139 (round 16) → 62/1142 (0.11.16) → 63/1154 (0.11.17) →
  **63/1155** (0.11.18).
- Round 19 (this round): load-time route validation covered four of the five routed roles.
  `src/settings.ts` `ROLE_ORDER` now lists `supervisor` too (report order, same as
  `src/report.ts` `ROLE_NAMES`), so `validateRoutes` checks its provider/model catalog and the
  empty-`maxInFlight` note covers it. Tests: five-role matrix in `test/config.spec.ts`,
  supervisor note cases in `test/route-concurrency.spec.ts`. Docs: README (EN/ZH), ARCHITECTURE,
  D-075, VALIDATION Round 64. Evidence: `.rsi/evidence/round-019/`.
- Round 18 (previous): resident parallel `RunGuardian` beside the serial supervisor
  (`src/guardian.ts`), released as `0.11.17`.
- Ledger: `.rsi/ledger.jsonl` (one JSON line per round). Resume from the highest `round` with
  `status: OK`; do not redo logged rounds.
- Process tooling: `.rsi/tools/bump-version.py` and `.rsi/tools/finish-round.py` (R6: bump →
  changelog → CI → records → commit → tag → push; refuses red CI and existing tags, never forces).
  `npm test` rebuilds `lib/`, so a local green says nothing about committed artifacts — only
  `git diff --exit-code -- lib/` and `npm run verify:lib` do, which is why CI runs both.

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

- `src/delivery/index.ts:695` — the diagnostics `Model routes:` line enumerates four roles and
  never shows the supervisor chain (also pushes a duplicate `Synthesis:` label).
- `src/run.ts:141` — `configRouteLabels` omits `supervisor`, so supervisor routes never enter
  the cross-run busy hint. Both found/confirmed during round 19's review.
- Proposal: pin `ROLE_ORDER` against `src/report.ts` `ROLE_NAMES` in a test so a role list
  cannot drift again.

## Failures

- Round 4 first review FAIL (closed in rework). Round 5: one existing test failed, assertion
  tightened. Rounds 8/9/12: BLOCKED or red-by-design, recorded.
- Round 14: published from a tree a concurrent writer was editing → stale `lib/`, red CI, no
  Release; repaired in round 15 (patch), not hidden.
- Round 19: first fresh-context review **FAIL** — four documentation-accuracy defects (a false
  "only role after verification" claim, a migration instruction that would have silently
  disabled the supervisor gate, an inverted model condition in README, and an overstated
  "last step of a run"). All four verified against source and fixed; second review **PASS**
  with two line-level nits also fixed (HANDOFF phrasing, `2419`→`2418`).
- Consecutive failed rounds: 0. Consecutive valueless rounds: 0.

## Final verification (round 19, commit `3b131c4`)

- `npm run ci` exit 0 · **63 files / 1155 tests PASS** · `tsc --noEmit` 0 errors ·
  oxlint 22 warnings / 0 errors · `npm run build` twice → `diff -r` empty (idempotent,
  `client bundle: 224525 bytes`) · `npm run verify:lib` = 149 files byte-identical.
- Baseline before the change (`6ee2e68`): 63 files / 1154 tests PASS; red proof = 2 failed /
  49 passed with only `src/settings.ts` stashed.
- NOT_RUN: a bad supervisor route in a real profile patch (operator environment); a real
  model-backed run; npm publish (unauthorized).

## Loop status (this session)

- Rounds 5–19 landed: P2-02, P1-03, tag inventory, live runtime, P0-02, P1-02, P2-01,
  redaction call sites, gate landing, repeat-run surface + release, release repair, composer
  switch + heartbeat brakes, heartbeat recognition + settings wording, resident guardian,
  supervisor route validation.
- Remaining: P3-01, P3-02, and the `P ·` items above.

## Open decisions

- PROTOCOL says "do not commit, do not tag" while the task text requires a commit and a tag per
  round. Resolution used since round 1: every round is committed and pushed, never forced, never
  moved; one tag only when a release is authorized.
- D-068: operator authorized P4 (repeat-run) before P3-01/P3-02; order only, no gate relaxed.
- D-075: every routed role is in `ROLE_ORDER`; `supervisor` included. Migration for a bad
  supervisor route = fix the route or blank its `provider` (inherits the run's provider);
  deleting the chain leaves the run unsupervised.
- Allowed untracked files (deliberate, never committed): `settings-simple-mock.html`.
