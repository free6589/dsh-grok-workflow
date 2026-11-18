# RSI State (overwritten every round; keep under 100 lines)

Updated: 2026-11-18T00:10+08:00 · round 14 complete · version `0.11.14` (tag `v0.11.14`,
commit `20eafea`, both pushed) ·
repeat-run (loop) surface shipped + bilingual docs + D-068/D-069; P3-01/P3-02 still OPEN

## Facts

- Repo: `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`, remote `origin`
  = https://github.com/free6589/dsh-grok-workflow.git (pushed, tag pushed).
- Rounds 4–13 (see `ROUND.md`): `v0.11.4` bcb601d · `v0.11.5` bf0dc91 · `v0.11.6` 88d133b ·
  `v0.11.7` 1760d50 · `v0.11.8` a045154 · `v0.11.9` 596239a · `v0.11.10` 000a56e ·
  `v0.11.11` 6ff6373 · `v0.11.12` be64d56 · `v0.11.13` 7a79efb. Test-count line:
  54/985 → 54/999 → 55/1009 → 56/1015 → 57/1022, no test removed or skipped at any point.
- Round 14: repeat-run (loop) surface (`20eafea`, tag `v0.11.14`; `origin/main` = `20eafea`,
  tag object `2a7b074`, peel = `20eafea`, old tags untouched). One loop = **one** durable `rrule` task in the Host
  Schedule service (title `Loop heartbeat`, prompt prefix `[grok-workflow loop]`, target =
  same session); the plugin arms no timer and only calls `create`/`catalog`/`edit`.
  `open` is user-only (`loop/user-only` for any defined actor, so the route can open and
  `grok_loop` cannot); the tool exposes `status`/`close` only; the route
  `POST /grok-workflow/loop` sits behind the composition's `connection.requestRejection`
  fence; no Schedule service → `loop/unavailable` (503). Rule = `DTSTART` +
  `FREQ=MINUTELY;INTERVAL=<min>;COUNT=<rounds>`; interval floor
  `max(60, ceil(timeoutMs/60000), loopIntervalMin)`, ceiling 10080; `close`/`stopAll`/
  `forgetSession` **delete** rows (never pause); repeated opens refresh one row (serialized).
- Config surface 9 → 13 keys (`loopEnabled`/`loopMaxRounds`/`loopFailStreak`/
  `loopIntervalMin`), hard limits 100/20/10080, defaults false/10/3/0, `LIMIT_CAPS` feeds
  both the stored-value clamp and the load-time repair (`repairLimitOverruns` now iterates
  `LIMIT_CAPS`, not only the legacy table).
- Tests added this round: `test/loop.spec.ts` (27), `test/loop-surface.spec.ts` (14),
  `test/heartbeat-guard.spec.ts` (14); plus client/config/settings case updates.
- Dev tooling already on the tree and landed by this round: `.rsi/HEARTBEAT.md` (heartbeat
  prompt template + guard contract), `.rsi/tools/heartbeat-guard.sh` (RESUME/SKIP/STOP).
  `.rsi/HEARTBEAT.md` is the entry point of a heartbeat turn; step 0 runs the guard.
- Ledger: `.rsi/ledger.jsonl` (one JSON line per round). Resume from the highest `round`
  whose `status` is `OK`; do not redo rounds already logged.
- Evidence: `.rsi/evidence/round-NNN/` (`pre-release-ci.txt` here is the doc-side CI run,
  `ci.txt` the release-script run, `git.txt` commit + tag + diffstat, `mutation.txt` the
  user-only mutation replay).
- Process tooling: `.rsi/tools/bump-version.py` (version claims in package.json,
  package-lock.json, both READMEs, LOCAL-TESTING tarball name) and
  `.rsi/tools/finish-round.py` (R6: bump → changelog → CI → records → commit → tag → push,
  refuses red CI and existing tags, never forces).

## Pool (value / risk / size)

P0 — wrong behaviour or false statements

- P0-01/P0-02/P0-03 done (rounds 2/9/3). No open P0.

P1 — docs and version truth

- P1-01/P1-02/P1-03 done (rounds 1/10/6). Round 14 additionally made the repeat-run claim
  checkable: the READMEs no longer say a composer switch exists (`grep -rn
  "grok-workflow/loop" src/` = one hit, the constant at `src/loop.ts:56`).
- README/NR `not measured with real settings GUI` reconciled in round 13; the remaining
  `docs/knowledge/WORKFLOW-DESIGN.md:1042/:999` lines are still a later docs-sync task.

P2 — tests and reliability

- P2-01/P2-02 done (rounds 11/5).

P3 — UX (still OPEN, unchanged by round 14 — see D-068)

- P3-01 OPEN Settings page wording for the per-route cap and the deadline field.
- P3-02 OPEN Progress tab detail rows for members with no reported facts (relates P0-02).

P· redaction call-site: done in round 12 (records 3× `redactError`, history windowed
redact-first + dangling-block fail-closed).

New candidate from round 14 (not yet pooled as a round): a client control that actually
POSTs `/grok-workflow/loop`. It is a `src/` change, needs its own tests and its own theme
(D-069「现状」), so it is recorded as a next-round candidate rather than started here.

## Failures

- Round 4 first review FAIL (closed in rework, second review PASS).
- Round 5: one existing test failed after the fix (`[REDACTED]` vs `[REDACTED API KEY]`);
  assertion tightened to the exact placeholder, second run green.
- Round 8: model-backed runtime check recorded BLOCKED, not failed.
- Round 9: the new spec was red by design first (5 failed / 29 passed) and exposed two
  substring decoys; labels fixed, no assertion loosened.
- Round 12: B12 timed out without reporting (work recovered from the tree); B13 stood down.
- Round 14: a `test/loop.spec.ts` typecheck error (`snapshotConfig`) was inherited from the
  in-flight work and is fixed in the landed tree — current `npm run typecheck` = exit 0.
- Consecutive failed rounds: 0. Consecutive valueless rounds: 0.

## Final verification (latest landed tree: round 14)

- `npm run typecheck` exit 0 · `npm run ci` exit 0 — **60 files / 1081 tests PASS**,
  lint `Found 22 warnings and 0 errors` (`.rsi/evidence/round-014/ci.txt`, the release-script run).
  The doc-side run before the release measured 60 / 1080 (`pre-release-ci.txt`): one extra route
  case landed in `test/loop-surface.spec.ts` between that run and the release run. Both numbers are
  quoted with their run; the release number is the one the tag carries.
- Evidence: `.rsi/evidence/round-014/` (`pre-release-ci.txt`, `ci.txt`, `mutation.txt`, `git.txt`).
- **Release incident (CONFIRMED, must be read before the next round):** tag commit `20eafea` is red on
  the remote CI (run `44345615218`) and the Release workflow failed at `Verify committed build
  artifacts` (run `44345622700`) — the committed `lib/` was one build behind the committed `src/`
  because a concurrent writer touched `src/loop.ts` between `npm test` and `git add`. Therefore
  **`v0.11.14` has no GitHub Release**. Repaired on main by `8c8e367` (build output only; remote CI
  run `44349708692` = success). The tag was not moved or deleted (published tags are immutable), so
  the remedy is a patch release from main — a new Release needs explicit authorization.
  Consequence for the next round: `20eafea` carries `loop/schedule-refused` without its 413/409 route
  tests; those tests plus more `src/` edits are still uncommitted in the working tree.
- Baseline for comparison: `v0.11.4` = 54 files / 985 tests; `v0.11.13` = 57 / 1022.

## Loop status (this session)

- Rounds 5–14 landed: P2-02, P1-03, tag inventory, live runtime, P0-02, P1-02, P2-01,
  redaction call-site, gate landing, repeat-run surface + release.
- **Correction 2026-11-18 (kept):** the "Loop stop (after round 11)" record is VOID —
  backlog shape alone never stops the loop; a stop needs `.rsi/STOP` or PROTOCOL §7 items
  2–7. Rounds 12–14 prove continuation.
- Remaining: P3-01, P3-02, the `P ·` items (base64-PEM rule, six untested config
  fail-closed branches), and the round-14 candidate above.

## Open decisions

- PROTOCOL says "do not commit, do not tag" while the task text requires a commit and a
  `vX.Y.Z` tag per round. Resolution used since round 1: every round is committed and
  pushed with a bump and an annotated tag, never forced, never moved; recorded in ROUND.md.
- D-068: operator authorized P4 (repeat-run) before P3-01/P3-02; the authorization covers
  order only and does not relax any gate.
- Allowed untracked files (deliberate, never committed): `settings-simple-mock.html` and
  `docs/knowledge/evidence/test-baseline-2026-11-18/` (its `*.log` members are gitignored).
