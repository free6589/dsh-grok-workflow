# RSI State (overwritten every round; keep under 100 lines)

Updated: 2026-11-18T13:51+08:00 · round 5 complete · version `0.11.5` (tag `v0.11.5`)

## Facts

- Repo: `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`, remote `origin`
  = https://github.com/free6589/dsh-grok-workflow.git (pushed, tag pushed).
- Round 4 commit: `bcb601d` (tag `v0.11.4`). Its bookkeeping + evidence were left
  uncommitted by that round; landed by `2f999eb` (chore, no version bump).
- Round 5 commit: this round's commit (tag `v0.11.5` → same sha). `npm run ci`:
  54 files / 993 tests PASS, 0 type errors, lint 22 warnings / 0 errors (baseline).
- Ledger: `.rsi/ledger.jsonl` (one JSON line per round). Resume from the highest
  `round` whose `status` is `OK`; do not redo rounds already logged.
- Evidence: `.rsi/evidence/round-NNN/` (`red.txt` before, `green.txt` after,
  `ci.txt` full run, `git.txt` commit + tag + diffstat).
- Process tooling: `.rsi/tools/bump-version.py` keeps `package.json`,
  `package-lock.json` and both READMEs in step; `test/docs-version.spec.ts` is the
  contract it satisfies. `.rsi/tools/finish-round.py` is the round finisher.

## Pool (value / risk / size)

P0 — wrong behaviour or false statements

- P0-01 done (round 2: `## [0.9.0]` restored, guard requires per-tag section).
- P0-02 The Progress page reports `Not reported in the events` for Execute/Verify
  (known gap, `docs/knowledge/STATE.md` 2026-11-17). (high / medium / M)
- P0-03 done (round 3: README names every `REMOVED_CONFIG_KEYS` entry; guard pins it).

P1 — docs and version truth

- P1-01 done (round 1: version claims checked against `package.json`).
- P1-02 `docs/ARCHITECTURE.md` section statuses naming a version as "current"
  rather than "since". (low / low / S)
- P1-03 `docs/LOCAL-TESTING.md` key count and defaults vs `src/config.ts`. (medium / low / S)
  Recon for round 6: the nine keys and the fixed `1` / `2` / `8` / `3600000`
  claims are correct; the stale `0.2.0.tgz`/`0.2.1.tgz` install examples and the
  `synthesis is "deterministic"` rejection example are not (`deterministic` is
  repaired at load, not rejected).

P2 — tests and reliability

- P2-01 Settings client i18n: every key referenced by `src/client/index.js` exists in
  both locales; missing keys render as `—`. (medium / low / S)
- P2-02 done (round 5: quoted Cookie headers, presigned signatures, PGP armor,
  `SECRET_KEY`/`PRIVATE_TOKEN`, env value termination, placeholder stability,
  `x-api-key` deep keys; docs + docs guard; 985 → 993 tests).

P3 — UX

- P3-01 Settings page wording for the per-route cap and the deadline field.
- P3-02 Progress tab detail rows for members with no reported facts (relates P0-02).

Hypothesis-only items are audited before they become a round; nothing enters a round
on a guess.

## Failures

- Round 4 first review FAIL (rsi-agent-d): limits-table `| 3 |`, diagnostics
  `17 field(s)`, untracked shim — all closed in rework, re-verified (985 tests),
  second review PASS (rsi-agent-d2).
- Round 5: the first full `npm run ci` after the fix failed one existing test
  (`test/phase1-dialogue.spec.ts`, `[REDACTED]` vs `[REDACTED API KEY]`); the
  assertion was tightened to the exact placeholder and the second run was green.
- Consecutive failed rounds: 0. Consecutive valueless rounds: 0.

## Open decisions

- PROTOCOL says "do not commit, do not tag" (external script releases) while the task
  text requires a commit and a `vX.Y.Z` tag per round. Resolution used since round 1:
  every round is committed and pushed with a patch bump and an annotated tag, never
  forced, never moved; recorded in `ROUND.md` round 1.
- Allowed untracked files (deliberate, never committed): `settings-simple-mock.html`
  (the operator's approved settings mock) and
  `docs/knowledge/evidence/test-baseline-2026-11-18/` (local baseline bundle whose
  `*.log` members are gitignored, so the directory cannot be committed as a unit).
