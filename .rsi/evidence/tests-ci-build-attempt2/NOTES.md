# tests_ci_build — attempt 2 verification evidence (2026-11-19 ~01:50–02:05+08:00)

Attempt 1 failed one criterion: the committed `lib/` at tag `v0.11.14` (`20eafea`) was one
build behind its own `src/` (missing `callSchedule`). That was repaired by the release round:
`8c8e367` (rebuild `lib/` on main), `3c24f92` (`verify:lib` gate now inside `npm run ci`),
`50c0321` + tag `v0.11.15` (patch release built from its own source). This round re-verifies
all three criteria independently on the tree as it stands, without trusting any earlier
self-report.

## Landed tree (what the release carries)

- HEAD = origin/main = `37cb0fc`. Build inputs (`src lib scripts test package.json
  package-lock.json tsconfig.json tsconfig.build.json`) are byte-identical to release tag
  `v0.11.15` (`50c0321`): `git diff --stat 50c0321 37cb0fc -- <those paths>` is empty
  (git-state.txt). A gate result at HEAD therefore also describes the released tag.
- Clean-checkout gate: a temp git repo was created from `git archive 37cb0fc` (node_modules
  copied), then `npm run ci` — typecheck && lint && verify:lib && build && vitest:
  **CI-EXIT=0**, oxlint `22 warnings and 0 errors`, `verify:lib` = “lib/ is the build of
  src/ (141 files, byte-identical)”, vitest **60 files / 1081 tests passed**, and
  `git status --untracked-files=no` after the build is empty (the build changed no committed
  file). head-ci.txt, lines 235/242/351-352/355-363.
- Idempotence: a second `npm run build` after the gate (BUILD2-EXIT=0) produced `lib/`
  whose 141-file md5 manifest is byte-identical to the gate build's manifest (diff exit 0).
  lib-manifest-build1.txt / lib-manifest-build2.txt / lib-idempotence-diff.txt /
  build-second.txt.
- Independent corroboration at the tag itself: `.rsi/evidence/round-015/ci-committed.txt`
  ran `npm run ci` in a clean checkout at `50c0321` — `verify:lib` “141 files,
  byte-identical”, 60 files / 1081 tests, EXIT=0; remote CI run `44359410024` = success,
  Release run `44359422843` = success (GitHub Release `v0.11.15` with
  `dsh-grok-workflow-0.11.15.tgz`).
- `v0.11.14` (`20eafea`) remains artifact-stale by design: published tags are immutable, it
  has no GitHub Release, and both READMEs tell installers to pin `v0.11.15`. Documented in
  `.rsi/STATE.md` and CHANGELOG `[0.11.15]`.

## Criterion checks

1. **Unit tests cover switch state machine, breaker counters, config schema — MET.**
   `test/loop.spec.ts` at HEAD (27 tests, all passing in the clean-checkout gate) has named
   blocks: “the switch state machine: open, refresh, resume, replace, close”,
   “repeat-run policy: the counts a loop may not exceed” (interval floor/ceiling,
   rounds/failStreak clamps), “the stored rule is the bound Schedule enforces”, “the switch
   refuses what it cannot honestly do”, and “the repeat-run configuration surface”
   (`loopEnabled`/`loopMaxRounds`/`loopFailStreak`/`loopIntervalMin` defaults, bounds,
   refusals). The in-flight worktree extends it to 30 tests (still passing) and adds
   `test/loop-brakes.spec.ts` (35 tests, passing) for the new brake counters
   (fail-streak / daily-cap / token-cap / time-cap) — uncommitted, another writer's round.
   `grep -rnE "\b(it|test|describe)\.(skip|only|todo)\(" test/**/*.spec.ts` = 0 matches.
   Mutation proof for the landed suite stands: `.rsi/evidence/round-014/mutation.txt`
   (landed `test/` is identical between `50c0321` and HEAD).
2. **npm run ci exits 0 with test count non-decreasing — MET.** Clean-checkout ci EXIT=0,
   60 files / 1081 tests at `37cb0fc`; chain 57/1022 (`v0.11.13`) → 60/1081 (`v0.11.14`,
   `v0.11.15`) → 60/1081 (HEAD): non-decreasing, nothing removed or skipped.
3. **lib build idempotent; version bump patch-only — MET.** `verify:lib` byte-identical at
   HEAD and at `50c0321`; double-build md5 manifests identical (141 files). Version chain
   `0.11.13 → 0.11.14 → 0.11.15` — patch, patch. package.json and package-lock.json (root
   and `packages[""]`) = 0.11.15; both READMEs pin `#v0.11.15` (published list ends
   `v0.11.15`, with the explicit “`v0.11.14` is not a release” note); CHANGELOG newest
   section `## [0.11.15] - 2026-11-19` bilingual; docs guards (`docs-version` 8,
   `docs-config-keys` 12) green inside the gate. version.txt.

## Live worktree (NOT the landed tree; another writer's in-flight round)

Point-in-time read-only snapshot (verify:lib / typecheck / lint / vitest run — no in-place
build, to avoid clobbering the concurrent writer): verify:lib, typecheck, lint EXIT=0;
vitest **1131 passed / 2 failed** in `test/loader.spec.ts` at 02:00:52, re-confirmed
02:03:07. Root cause measured: the built `lib/gate.js:57` imports `./loop-brakes.js`, but
`lib/loop-brakes.js` is absent from the worktree (untracked build output deleted while
`src/gate.ts` still imports it), so loading the bundle throws at module resolution and the
plugin registers no tools. The writer's own `npm test` build will re-emit it. Worktree
observations are a moving target (lib mtimes changed during this verification:
`lib/loop.js`/`lib/client.js` rebuilt at 01:55:27 mid-run).

## Not committed, deliberately

This evidence directory is left uncommitted: the working tree carried another writer's
in-flight feature (`src/loop-brakes.ts`, gate/client/config edits, loop-brakes tests) for
the whole session, PROTOCOL gives each round's owner the commit/tag step (`finish-round.py`),
and LOG round 15 warns to never run it on a tree another writer is editing.

## NOT_RUN

- npm publish (never authorized; the release itself ran via the Release workflow at the tag).
- Live DSH heartbeat delivery / HTTP loop route end-to-end with a real profile (unchanged
  from round-14's NOT_RUN; this verification is unit/gate level only).
- New mutation replay: the landed test files are byte-identical to the tree that round-14's
  `mutation.txt` already covered (diff `50c0321..HEAD` on `test/` is empty), so re-running
  mutations would reproduce it exactly.
