# RSI State (overwritten every round; keep under 100 lines)

Updated: 2026-11-18T01:24+08:00 · round 1 complete · version `0.11.1` (tag `v0.11.1`)

## Facts

- Repo: `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`, remote `origin`
  = https://github.com/free6589/dsh-grok-workflow.git
- Baseline into round 1: `85541ad` (carry-in of the 0.11.0 `timeoutMs` work, pushed,
  tag `v0.11.0`). `npm run ci` on that tree: 51 files / 959 tests PASS.
- Round 1: `npm run ci` = 52 files / 965 tests PASS, 0 type errors, lint 0 errors
  (21 warnings, pre-existing).
- Ledger: `.rsi/ledger.jsonl` (one JSON line per round: round, theme, status,
  commit, tag, ci counts, evidence path). Resume from the highest `round` whose
  `status` is `OK`; do not redo rounds already logged.
- Evidence: `.rsi/evidence/round-NNN/` (`red.txt` before the change, `green.txt`
  after, `ci.txt` full run, `git.txt` commit + tag + diffstat).
- Process tooling: `.rsi/tools/bump-version.py` keeps `package.json`,
  `package-lock.json` and both READMEs in step; `test/docs-version.spec.ts` is the
  contract it satisfies.

## Pool (value / risk / size)

P0 — wrong behaviour or false statements

- P0-01 `CHANGELOG.md` has no `## [0.9.0]` section although `v0.9.0` is a published
  tag: backfill from `git log v0.8.0..v0.9.0` and extend the docs guard to require a
  changelog section for every published tag. (high value / low risk / S)
- P0-02 The Progress page reports `Not reported in the events` for the Execute and
  Verify segments (known gap, `docs/knowledge/STATE.md` 2026-11-17). (high / medium / M)
- P0-03 README "fixed inside the plugin" list and `src/config.ts`
  `REMOVED_CONFIG_KEYS` must agree; verify count and membership. (medium / low / S)

P1 — docs and version truth

- P1-01 README/zh declared version + published list + install pins (round 1, done).
- P1-02 `docs/ARCHITECTURE.md` section statuses that name a version as "current"
  rather than "since". (low / low / S)
- P1-03 `docs/LOCAL-TESTING.md` key count and defaults vs `src/config.ts`. (medium / low / S)

P2 — tests and reliability

- P2-01 Settings client i18n: every key referenced by `src/client/index.js` exists in
  both locales; missing keys render as `—`. (medium / low / S)
- P2-02 `src/redact.ts` secret shapes: add failing-then-passing cases for shapes the
  current patterns miss. (high / low / M)

P3 — UX

- P3-01 Settings page wording for the per-route cap and the deadline field.
- P3-02 Progress tab detail rows for members with no reported facts (relates P0-02).

Hypothesis-only items are audited before they become a round; nothing enters a round
on a guess.

## Failures

- none yet. Consecutive failed rounds: 0. Consecutive valueless rounds: 0.

## Open decisions

- PROTOCOL says "do not commit, do not tag" (external script releases) while the task
  text requires a commit and a `vX.Y.Z` tag per round. Resolution used from round 1:
  every round is committed and pushed with a patch bump and an annotated tag, never
  forced, never moved; the conflict is recorded in `ROUND.md` round 1.
