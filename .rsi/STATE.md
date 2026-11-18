# RSI State (overwritten every round; keep under 100 lines)

Updated: 2026-11-18T14:29+08:00 · round 10 complete · version `0.11.10` (tag `v0.11.10`) ·
loop continues into the remaining pool

## Facts

- Repo: `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`, remote `origin`
  = https://github.com/free6589/dsh-grok-workflow.git (pushed, tag pushed).
- Round 4 commit: `bcb601d` (tag `v0.11.4`). Its bookkeeping + evidence were left
  uncommitted by that round; landed by `2f999eb` (chore, no version bump).
- Round 5: `bf0dc91` (tag `v0.11.5`), 54 files / 993 tests PASS.
- Round 6: `88d133b` (tag `v0.11.6`), 54 files / 998 tests PASS.
- Round 7: `1760d50` (tag `v0.11.7`), 54 files / 999 tests PASS.
- Round 8: `a045154` (tag `v0.11.8`), 54 files / 999 tests PASS.
- Round 9: `596239a` (tag `v0.11.9`), P0-02 fixed — 54 files / 1006 tests PASS.
- Round 10: P1-02 fixed (round 10 commit, tag `v0.11.10`) — **55 files / 1009 tests PASS**,
  0 type errors, lint 22 warnings / 0 errors.
- P0-02 (`CONFIRMED`): the script records the plan-task group title (`任务 n · 标题`) as a
  worker/verifier `phase`, and the tab bound rows by `phase` alone, so `执行`/`检查` — the two
  stages every run performs — never claimed a row and rendered `Not reported in the events`.
  Fixed with a second channel: a row whose phase names no stage is matched by its **role
  label** and cross-referenced onto that stage's new `evidence` list. `members` stays the one
  home per row (track and percentage still count the same rows); state prefers the stage's own
  rows. Role tokens never match a phase, so a task titled `check the build` stays out of `检查`.
- Live runtime (round 8, `CONFIRMED` on DSH 0.2.2-rc.3): install + activation + settings
  projection PASS; a model-backed `grok_workflow` message is **BLOCKED**
  (`MISSING_CREDENTIAL … "deepseek-official"` in the isolated profile; copying the operator's
  key is forbidden).
- Tag inventory (round 7, `CONFIRMED`): 32 remote tags at audit time, identical local/remote
  objects, all peeled commits ancestors of `main`; 31 tags match `package.json`,
  `v0.2.0-rc.1` does not (predates the release workflow) and is documented instead of moved.
- Ledger: `.rsi/ledger.jsonl` (one JSON line per round). Resume from the highest `round`
  whose `status` is `OK`; do not redo rounds already logged.
- Evidence: `.rsi/evidence/round-NNN/` (`red-*.txt` before, `green.txt` after, `ci.txt` full
  run, `git.txt` commit + tag + diffstat).
- Process tooling: `.rsi/tools/bump-version.py` keeps `package.json`, `package-lock.json` and
  both READMEs in step; `test/docs-version.spec.ts` is the contract it satisfies.
  `.rsi/tools/stop-probe.sh <round>` writes the round-start STOP verdict to
  `.rsi/evidence/stop-probes.txt` (added in round 9 to close a review finding: rounds 5–8
  recorded the probe only as prose).

## Pool (value / risk / size)

P0 — wrong behaviour or false statements

- P0-01 done (round 2: `## [0.9.0]` restored, guard requires per-tag section).
- P0-02 done (round 9: role-label evidence channel; `members` still one home per row).
- P0-03 done (round 3: README names every `REMOVED_CONFIG_KEYS` entry; guard pins it).

P1 — docs and version truth

- P1-01 done (round 1: version claims checked against `package.json`).
- P1-02 done (round 10: four `in this release` claims anchored to `since **0.8.0**` /
  `as of **0.11.9**`; the `resume`/DSH boundary now separates the measured version from round
  8's activation re-check; guard `test/docs-architecture-version.spec.ts`, 3 its).
- P1-03 done (round 6: nine keys and the fixed `1` / `2` / `8` / `3600000` claims already
  matched `src/config.ts`; four tarball names, one "rejection" example and the zh fixed-cap
  notation did not. Guard 7 → 12 its).

P2 — tests and reliability

- P2-01 OPEN Settings client i18n: every key referenced by `src/client/index.js` exists in
  both locales; a missing key renders as `—` and no guard notices. (medium / low / S) — next.
- P2-02 done (round 5: quoted Cookie headers, presigned signatures, PGP armor,
  `SECRET_KEY`/`PRIVATE_TOKEN`, env value termination, placeholder stability, `x-api-key`
  deep keys; docs + docs guard; 985 → 993 tests).

P3 — UX

- P3-01 OPEN Settings page wording for the per-route cap and the deadline field.
- P3-02 OPEN Progress tab detail rows for members with no reported facts (relates P0-02).

Hypothesis-only items are audited before they become a round; nothing enters a round
on a guess.

## Failures

- Round 4 first review FAIL (rsi-agent-d): limits-table `| 3 |`, diagnostics
  `17 field(s)`, untracked shim — all closed in rework, re-verified (985 tests),
  second review PASS (rsi-agent-d2).
- Round 5: the first full `npm run ci` after the fix failed one existing test
  (`test/phase1-dialogue.spec.ts`, `[REDACTED]` vs `[REDACTED API KEY]`); the assertion was
  tightened to the exact placeholder and the second run was green.
- Round 6: no failed ci run (red evidence was a deliberate replay of the new spec against the
  pre-fix document, 2 failed / 9 passed).
- Round 8: no failed round; the model-backed runtime check is recorded BLOCKED, not failed.
- Round 9: the first run of the new spec was red by design (5 failed / 29 passed) and did
  expose a real coupling — two substring-decoy tests used the default fixture label `执行 N`,
  which is the real worker label, so they now say what they test (phase channel) with a
  neutral label and stronger assertions (`members` **and** `evidence` empty). No assertion
  was removed, skipped or loosened.
- Consecutive failed rounds: 0. Consecutive valueless rounds: 0.

## Final verification (round 10 tree)

- `npm run typecheck` exit 0 · `npm run ci` exit 0 — **55 files / 1009 tests PASS**, lint 22
  warnings / 0 errors.
- Evidence: `.rsi/evidence/round-009/typecheck.txt`, `ci.txt`, `red-ts.txt`, `green.txt`,
  `stop-probes.txt`.
- Baseline for comparison: `v0.11.4` = 54 files / 985 tests; every round since added tests and
  none were removed or skipped.

## Loop status (this session)

- Rounds 5–10 landed: P2-02 (5), P1-03 (6), tag inventory (7), live runtime (8), P0-02 (9),
  P1-02 (10).
  `.rsi/STOP` was absent at every round start, and from round 9 on that verdict is written to
  `.rsi/evidence/stop-probes.txt` and `.rsi/LOG.md` instead of being a prose claim.
- The loop has **not** reached a permitted stop: no STOP file, no round limit, and the P1/P2
  backlog is not empty.
- Remaining backlog, in pool priority order: P2-01 (settings client i18n key parity),
  P3-01/P3-02 (settings wording, progress detail rows), plus the P-labelled call-site items in
  `.rsi/POOL.md` (`records.ts` raw `error.message`, `history.ts` truncate-before-redact,
  base64-PEM rule).

## Open decisions

- PROTOCOL says "do not commit, do not tag" (external script releases) while the task text
  requires a commit and a `vX.Y.Z` tag per round. Resolution used since round 1: every round is
  committed and pushed with a patch bump and an annotated tag, never forced, never moved;
  recorded in `ROUND.md` round 1.
- Allowed untracked files (deliberate, never committed): `settings-simple-mock.html` (the
  operator's approved settings mock) and
  `docs/knowledge/evidence/test-baseline-2026-11-18/` (local baseline bundle whose `*.log`
  members are gitignored, so the directory cannot be committed as a unit).
