# RSI State (overwritten every round; keep under 100 lines)

Updated: 2026-11-19T08:0x+08:00 · round 16 complete · **no new version** (the repeat-run switch and
the heartbeat brakes landed on `main` with no bump, no tag, no Release — see "Open decisions") ·
last release remains `0.11.15` (tag `v0.11.15`, commit `50c0321`, CI `44359410024`, Release
`44359422843`)

## Facts

- Repo: `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`, remote `origin`
  = https://github.com/free6589/dsh-grok-workflow.git (pushed).
- Rounds 4–14 (see `ROUND.md`): `v0.11.4` bcb601d · `v0.11.5` bf0dc91 · `v0.11.6` 88d133b ·
  `v0.11.7` 1760d50 · `v0.11.8` a045154 · `v0.11.9` 596239a · `v0.11.10` 000a56e ·
  `v0.11.11` 6ff6373 · `v0.11.12` be64d56 · `v0.11.13` 7a79efb · `v0.11.14` 20eafea.
  Test-count line: 54/985 → 54/999 → 55/1009 → 56/1015 → 57/1022 → 60/1081 → 62/1139.
- Round 15 (release repair, patch `0.11.15`): `v0.11.14`'s tag commit `20eafea` has a `lib/`
  one build behind its `src/` (`callSchedule` 12 in src, 0 in lib), remote CI red
  (`44345615218`), Release workflow failed at `Verify committed build artifacts`
  (`44345622700`) → that tag has **no GitHub Release** and shipped no tarball. `8c8e367`
  rebuilt `lib/` on main (CI green `44349708692`) but cannot repair a published tag.
  Round 15 was cut from a clean clone at `b0d6d10` (`.worktrees/release-015`) so the other
  writer's uncommitted work stayed out: same source, rebuilt `lib/` (no src/test diff),
  README test counts 1022/57 → 1081/60, a README note that `v0.11.14` is not a release,
  CHANGELOG `[0.11.15]`, D-070. No tag moved, no force-push, no npm publish.
- Round 16 (this round, no version): the repeat-run surface now has its **user-facing switch**
  and a **stop that runs before the round cap**. Switch = `conversation.composer.dock`
  (`id grok-workflow-loop`, order 90, additive `list` registration, `src/client/index.js:3730-3743`),
  reads the loop once with `status` on mount, sends `open`/`close` with no numbers of its own,
  and a refused click never flips the state. Brakes = `src/loop-brakes.ts`, one verdict per
  heartbeat from facts that already exist: operator stop file (`.rsi/STOP`, `GROK_WORKFLOW_STOP_FILE`),
  disposed plugin, rounds without an assistant message, 24 rounds/day, 200 000 tokens/round up to
  2 000 000, elapsed time since the day's first round. A `loop-stop` verdict deletes the Schedule
  row and rejects the step with zero model calls (`src/gate.ts:1535-1575`). No timer, no queue;
  accounting is the session record `plugin:grok-workflow/loop-round`.
- The repeat-run core (round 14) stands unchanged: one loop = one durable `rrule` task in
  the Host Schedule (title `Loop heartbeat`, prompt prefix `[grok-workflow loop]`, target =
  same session); the plugin arms no timer; `open` is user-only (`loop/user-only` for any
  defined actor); the tool is `status`/`close`; no Schedule service → `loop/unavailable`
  (503); rule = `DTSTART` + `FREQ=MINUTELY;INTERVAL=<min>;COUNT=<rounds>`; interval floor
  `max(60, ceil(timeoutMs/60000), loopIntervalMin)`, ceiling 10080; close/stop/
  forgetSession delete rows.
- Ledger: `.rsi/ledger.jsonl` (one JSON line per round). Resume from the highest `round`
  with `status: OK`; do not redo logged rounds.
- Evidence: `.rsi/evidence/round-NNN/`; round 16 kept its logs in `.rsi/evidence/segment-5/`
  (`build-seg5-attempt2.txt`, `lib-build-idempotence.txt`, `full-vitest-attempt2.txt`,
  `verify-lib-precommit.txt`, `NOTES.md`).
- Process tooling: `.rsi/tools/bump-version.py` and `.rsi/tools/finish-round.py` (R6: bump →
  changelog → CI → records → commit → tag → push; refuses red CI and existing tags, never
  forces). Run release rounds from a clean clone/worktree when the primary tree is dirty:
  `npm test` rebuilds `lib/`, so a local green says nothing about the committed artifacts —
  only `git diff --exit-code -- lib/` does, which is why the CI workflow and the Release
  workflow both run it. `npm run verify:lib` checks the committed pair (exports `HEAD`,
  rebuilds it in a temp dir) and is part of `npm run ci`.

## Pool (value / risk / size)

P0 — wrong behaviour or false statements

- No open P0.

P1 — docs and version truth

- P1-01/P1-02/P1-03 done. Round 15 fixed the stale README test count (1022/57 → 1081/60)
  and the misleading "published" list entry for `v0.11.14`. Round 16 retired D-069's
  "no client control" paragraph and D-071's matching sentence by pointing them at D-072.
- Remaining: `docs/knowledge/WORKFLOW-DESIGN.md:1042/:999` docs-sync lines (later task).

P2 — tests and reliability

- P2-01/P2-02 done.

P3 — UX (still OPEN, unchanged)

- P3-01 OPEN Settings page wording for the per-route cap and the deadline field.
- P3-02 OPEN Progress tab detail rows for members with no reported facts (relates P0-02).

Former candidate, now landed in round 16: the client control that POSTs `/grok-workflow/loop`
(composer dock switch, D-072). Its tests exist: `test/client.spec.ts` (92), `test/loop-brakes.spec.ts`
(35), `test/loop-runtime-wiring.spec.ts` (5).

## Failures

- Round 4 first review FAIL (closed in rework; second review PASS).
- Round 5: one existing test failed after the fix; assertion tightened.
- Round 8: model-backed runtime check recorded BLOCKED, not failed.
- Round 9: the new spec was red by design first and exposed substring decoys; fixed.
- Round 12: B12 timed out without reporting; B13 stood down.
- Round 14: published `v0.11.14` from a tree a concurrent writer was editing → stale `lib/`,
  red CI, no Release. Owned and repaired in round 15 (patch release), not hidden.
- Round 16 kept a dirty tree's implementation out of a release on purpose: it landed the work
  as a plain commit and left the version alone (no tag, no Release).
- Consecutive failed rounds: 0. Consecutive valueless rounds: 0.

## Final verification (latest landed tree: round 16)

- `npm run typecheck` exit 0 · `npx oxlint src test` = 22 warnings / 0 errors ·
  `npm run build` = `client bundle: 224412 bytes` with the 145-file `lib/` md5 manifest identical
  before and after the build (idempotent) · `npx vitest run` = **62 files / 1139 tests PASS**.
- `npm run verify:lib` before the commit proved the old `HEAD` (`37cb0fc`, 141 files); the run
  after the commit proves this round's pair (see `ROUND.md` Round 16 "Landed as").
- NOT_RUN: npm publish (unauthorized), real heartbeat delivery (D-066), a click on the switch in
  a live Web GUI, the plugin-reload semantics of the Schedule sub-fiber (A27 §5 HYPOTHESIS).

## Loop status (this session)

- Rounds 5–16 landed: P2-02, P1-03, tag inventory, live runtime, P0-02, P1-02, P2-01,
  redaction call-site, gate landing, repeat-run surface + release, release repair,
  composer switch + heartbeat brakes.
- Remaining: P3-01, P3-02 and the `P ·` items. `/loop`-style unattended start is unchanged by
  design (D-066/D-071): the first heartbeat is an operator action.

## Open decisions

- PROTOCOL says "do not commit, do not tag" while the task text requires a commit and a tag
  per round. Resolution used since round 1: every round is committed and pushed, never forced,
  never moved; a tag is added only when a release is authorized.
- D-068: operator authorized P4 (repeat-run) before P3-01/P3-02; order only, no gate relaxed.
- D-070: `0.11.15` is the authorized patch release that repairs the `v0.11.14` incident;
  scope = one patch tag + the existing Release workflow, no tag moves, no npm publish.
- D-072: the switch lives in the composer dock (per session), not the settings page (per
  profile); stop = delete the row; token allowance is a budget, not a meter; a round counts as
  failed only when it wrote no assistant message.
- Round 16 deliberately shipped **without** a version bump or tag: the switch is user-visible,
  so the next authorized release should be a patch (`0.11.16`) that moves `[Unreleased]` into
  its own section.
- Allowed untracked files (deliberate, never committed): `settings-simple-mock.html` and
  `docs/knowledge/evidence/test-baseline-2026-11-18/` (its `*.log` members are gitignored).
