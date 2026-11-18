# RSI State (overwritten every round; keep under 100 lines)

Updated: 2026-11-19T01:12+08:00 · round 15 complete · version `0.11.15` (tag `v0.11.15`;
commit and remote run ids in `ROUND.md` Round 15) · release repair of `v0.11.14` (tagged,
never released) + bilingual docs corrections

## Facts

- Repo: `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`, remote `origin`
  = https://github.com/free6589/dsh-grok-workflow.git (pushed, tag pushed).
- Rounds 4–14 (see `ROUND.md`): `v0.11.4` bcb601d · `v0.11.5` bf0dc91 · `v0.11.6` 88d133b ·
  `v0.11.7` 1760d50 · `v0.11.8` a045154 · `v0.11.9` 596239a · `v0.11.10` 000a56e ·
  `v0.11.11` 6ff6373 · `v0.11.12` be64d56 · `v0.11.13` 7a79efb · `v0.11.14` 20eafea.
  Test-count line: 54/985 → 54/999 → 55/1009 → 56/1015 → 57/1022 → 60/1081.
- Round 15 (release repair, patch `0.11.15`): `v0.11.14`'s tag commit `20eafea` has a `lib/`
  one build behind its `src/` (`callSchedule` 12 in src, 0 in lib), remote CI red
  (`44345615218`), Release workflow failed at `Verify committed build artifacts`
  (`44345622700`) → that tag has **no GitHub Release** and shipped no tarball. `8c8e367`
  rebuilt `lib/` on main (CI green `44349708692`) but cannot repair a published tag.
  Round 15 was cut from a clean clone at `b0d6d10` (`.worktrees/release-015`) so the other
  writer's uncommitted work stayed out: same source, rebuilt `lib/` (no src/test diff),
  README test counts 1022/57 → 1081/60, a README note that `v0.11.14` is not a release,
  CHANGELOG `[0.11.15]`, D-070. No tag moved, no force-push, no npm publish.
- The repeat-run surface (round 14) stands unchanged: one loop = one durable `rrule` task in
  the Host Schedule (title `Loop heartbeat`, prompt prefix `[grok-workflow loop]`, target =
  same session); the plugin arms no timer; `open` is user-only (`loop/user-only` for any
  defined actor); the tool is `status`/`close`; no Schedule service → `loop/unavailable`
  (503); rule = `DTSTART` + `FREQ=MINUTELY;INTERVAL=<min>;COUNT=<rounds>`; interval floor
  `max(60, ceil(timeoutMs/60000), loopIntervalMin)`, ceiling 10080; close/stop/
  forgetSession delete rows.
- Ledger: `.rsi/ledger.jsonl` (one JSON line per round). Resume from the highest `round`
  with `status: OK`; do not redo logged rounds.
- Evidence: `.rsi/evidence/round-NNN/` (round 15: `pre-release-ci.txt`, `ci.txt`, `git.txt`).
- Process tooling: `.rsi/tools/bump-version.py` and `.rsi/tools/finish-round.py` (R6: bump →
  changelog → CI → records → commit → tag → push; refuses red CI and existing tags, never
  forces). Run release rounds from a clean clone/worktree when the primary tree is dirty:
  `npm test` rebuilds `lib/`, so a local green says nothing about the committed artifacts —
  only `git diff --exit-code -- lib/` does, which is why the CI workflow and the Release
  workflow both run it.

## Pool (value / risk / size)

P0 — wrong behaviour or false statements

- No open P0.

P1 — docs and version truth

- P1-01/P1-02/P1-03 done. Round 15 fixed the stale README test count (1022/57 → 1081/60)
  and the misleading "published" list entry for `v0.11.14`.
- Remaining: `docs/knowledge/WORKFLOW-DESIGN.md:1042/:999` docs-sync lines (later task).

P2 — tests and reliability

- P2-01/P2-02 done.

P3 — UX (still OPEN, unchanged)

- P3-01 OPEN Settings page wording for the per-route cap and the deadline field.
- P3-02 OPEN Progress tab detail rows for members with no reported facts (relates P0-02).

Candidate (not a round yet): a client control that actually POSTs `/grok-workflow/loop`
(D-069「现状」). The primary working tree already holds an unfinished version of it plus
`scripts/verify-lib.mjs`; it needs its own tests and its own round.

## Failures

- Round 4 first review FAIL (closed in rework; second review PASS).
- Round 5: one existing test failed after the fix; assertion tightened.
- Round 8: model-backed runtime check recorded BLOCKED, not failed.
- Round 9: the new spec was red by design first and exposed substring decoys; fixed.
- Round 12: B12 timed out without reporting; B13 stood down.
- Round 14: published `v0.11.14` from a tree a concurrent writer was editing → stale `lib/`,
  red CI, no Release. Owned and repaired in round 15 (patch release), not hidden.
- Consecutive failed rounds: 0. Consecutive valueless rounds: 0.

## Final verification (latest landed tree: round 15)

- `npm run typecheck` exit 0 · `npm run ci` exit 0 — **60 files / 1081 tests PASS**, lint
  `Found 22 warnings and 0 errors` (`.rsi/evidence/round-015/pre-release-ci.txt`).
- `git diff --stat -- lib/` empty after a clean build at the release base and after CI.
- NOT_RUN: npm publish (unauthorized), real heartbeat delivery (D-066), the other writer's
  client-switch work (untouched by this round).

## Loop status (this session)

- Rounds 5–15 landed: P2-02, P1-03, tag inventory, live runtime, P0-02, P1-02, P2-01,
  redaction call-site, gate landing, repeat-run surface + release, release repair.
- Remaining: P3-01, P3-02, the `P ·` items, and the client switch.

## Open decisions

- PROTOCOL says "do not commit, do not tag" while the task text requires a commit and a tag
  per round. Resolution used since round 1: every round is committed and pushed with a bump
  and an annotated tag, never forced, never moved; recorded in ROUND.md.
- D-068: operator authorized P4 (repeat-run) before P3-01/P3-02; order only, no gate relaxed.
- D-070: `0.11.15` is the authorized patch release that repairs the `v0.11.14` incident;
  scope = one patch tag + the existing Release workflow, no tag moves, no npm publish.
- Allowed untracked files (deliberate, never committed): `settings-simple-mock.html` and
  `docs/knowledge/evidence/test-baseline-2026-11-18/` (its `*.log` members are gitignored).
