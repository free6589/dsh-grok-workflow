# Round 14 evidence — loop unit tests, CI green, idempotent build, version linkage

Owner: tests_ci_build agent (agent-7). Scope: the repeat-run feature's unit tests, the
full gate run, the `lib/` idempotence proof and the patch version linkage. The feature
itself (`src/loop.ts`, `src/loop-surface.ts`, `src/index.ts` wiring, settings page, docs)
was written by the sibling agents of the same round; this record does not claim authorship
of it.

Tree: `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`, base commit `7a79efb`
(`v0.11.13`) plus the uncommitted round-14 work. Nothing in this round was committed,
tagged or pushed by this agent.

## Files in this directory

| file | command it records | result |
| --- | --- | --- |
| `green.txt` | `npx vitest run test/loop.spec.ts` | 27 passed (27), exit 0 |
| `mutation.txt` | three deliberate mutations of `src/loop.ts` in a throwaway copy, each followed by `npx vitest run test/loop.spec.ts` | each mutation fails exactly the test that pins it (3 × `1 failed / 26 passed`) |
| `build-twice.txt` | `npm run build` twice, `md5sum` of every `lib/**` file between runs | `lib/` byte-identical across two builds; both builds exit 0 |
| `typecheck.txt` | `npm run typecheck` | exit 0, no diagnostics |
| `ci.txt` | `npm run ci` (typecheck → oxlint → build → vitest) | exit 0 · **60 files / 1080 tests passed** · 21 oxlint warnings, 0 errors |
| `version.txt` | version linkage read back from package.json / package-lock / both READMEs / CHANGELOG / LOCAL-TESTING, plus the two docs guards | 0.11.14 everywhere; `docs-version` 8/8, `docs-config-keys` 12/12 |
| `git.txt` | `git status`, `git log -1` | base commit, untracked new files, diffstat |

`ci-baseline.txt` is the first full run of this round, taken before the version bump
(0.11.13, 59 files / 1065 tests). It is kept because it is the "test count non-decreasing"
comparison point; `ci.txt` is the final tree.

## What `test/loop.spec.ts` covers (27 tests)

New file. Real module under test: `src/loop.ts` (`createLoopService`, `loopPolicyFromConfig`,
`loopRrule`, `intervalMinutesOf`, `roundsOf`, `defaultLoopPrompt`, `isLoopTask`,
`scheduleServiceOf`, `LoopError`). The one boundary fake is DSH's Schedule service
(`FakeSchedule`: `create` appends an active row, `catalog` reads, `edit` updates/deletes by
id), which is a Host service this bundle does not depend on; the clock is injected, no timer
is armed and nothing touches the network or a model.

- **Switch state machine** — open mints exactly one row (title, ownership marker, session
  target, rule); a second open with unchanged policy writes nothing and keeps the anchor; a
  changed round bound edits the rule in place, keeping the row id; a paused row is resumed
  by edit instead of duplicated; an `ended` row is deleted and replaced (an exhausted rule
  cannot resume); close deletes every row this plugin owns for the session and leaves foreign
  rows (other title, other kind, other session) untouched; two concurrent opens produce one
  row (the mutation queue); a refused delete is logged with its id and never reported as a
  clean close; `status` reports the stored interval/rounds/nextAt/last delivery and `open:
  false` when nothing is stored; `stopAll` / `forgetSession` count only owned rows.
- **Refusals** — an acting agent cannot open (`loop/user-only`, and the fake records *no*
  Schedule call, so the refusal is structural rather than rollback); close is allowed for
  either caller; a composition without Schedule answers `loop/unavailable` for open/status/
  close and returns 0 for the cleanups; unusable session ids (`''`, whitespace, 129 chars,
  embedded NUL, non-string) are refused before any call; an interval must be a whole positive
  number and may only raise the floor; an empty or over-long prompt is refused, a padded one
  is trimmed.
- **Breaker counters** — the interval floor is the largest of 60 minutes, one worst-case
  round (`timeoutMs`) and `loopIntervalMin`, capped at seven days and equal to
  `HARD_LIMITS.loopIntervalMin`; the round cap and the failure streak are clamped to
  1…1000 with documented fallbacks, and the defaults resolve to the same
  `{60, 10, 3}` the config documents; the failure streak is carried into the heartbeat text
  as an instruction (the Host records delivery, not round success) and the round cap is the
  rule's `COUNT`, so the bound Schedule enforces is the configured one.
- **Schema** — the four `loop*` keys resolve, default to `false / 10 / 3 / 0`, accept their
  documented boundaries (`1`…`100`, `1`…`20`, `0`…`10080`), and are refused outside them with
  the key and both bounds in the message; a non-boolean switch is refused by both the
  resolver (`loopEnabled must be true or false`) and the schema.

`mutation.txt` is why these assertions are load-bearing rather than decorative. Three
mutations, each on a throwaway copy under the gitignored `out/` (the product source was
restored and verified by md5 afterwards):

| mutation | test that failed |
| --- | --- |
| `if (actorSessionId !== undefined)` → `if (false)` (user-only guard disabled) | `lets only the user open a loop; an acting agent is refused before any write` |
| `failStreak: clampInteger(...)` → `failStreak` (breaker clamp removed) | `keeps the round cap and the failure streak inside their hard counts` |
| `tail.then(...)` → `work()` (mutation queue removed) | `serializes concurrent opens so one session cannot end up with two rows` |

## Version linkage

`0.11.13` → `0.11.14` (patch, no major/minor change), applied with
`.rsi/tools/bump-version.py 0.11.14`:

- `package.json`, `package-lock.json` (version and `packages[""].version`);
- both READMEs: declared version, every `plugin add …#vX.Y.Z` pin, the prose `` `#vX.Y.Z` ``,
  and the regenerated published-tag list ending at `v0.11.14`;
- `docs/LOCAL-TESTING.md`: the three `dsh-grok-workflow-0.11.14.tgz` names. Its "accepts
  exactly thirteen keys" sentence was corrected from `0.11.13` (which shipped nine) to
  `0.11.14`, the release that first accepts thirteen;
- `CHANGELOG.md`: the sibling agents' `[Unreleased]` block was folded into a new
  `## [0.11.14]` section (bilingual), `[Unreleased]` left empty, and one accuracy clause was
  added — `loopEnabled` is a deployment default no run path reads yet, so the switch itself
  is not an automatic driver;
- `package.json` `test:unit` now includes `test/loop.spec.ts` (the hand-maintained unit
  subset), so the new file runs in both `npm test` and `npm run test:unit`.

## Verified vs not verified

**Verified in this round** (`CONFIRMED`, files above): the loop state machine, its breaker
counts and the four config keys behave as asserted; `npm run ci` exits 0 with 60 files / 1080
tests; `npm run build` is idempotent; version strings agree across the six places the release
discipline names.

**Not verified here** (`NOT_RUN`, stated rather than implied):

- **A real heartbeat delivery.** Every case here is a unit test over an injected clock and a
  fake Schedule service. That DSH actually delivers a `rrule` row to the target session, that
  occurrences coalesce while a round runs, and that a crash catches up only the latest
  delivery is the Host's behaviour and was not exercised (`NOT_RUN`; needs a live profile,
  the ≥60 s floor and a real model credential).
- **The browser switch and the `grok_loop` tool end to end.** The route handler and the tool
  adapter live in `src/loop-surface.ts`; the authorization asymmetry they rely on is pinned
  at the service level (`loop/user-only`) but their HTTP/tool paths were not driven here
  (`NOT_RUN`; no owned suite for that file in this round).
- **Plugin lifecycle.** That an unload really deletes the rows in a running DSH instance is
  covered by the sibling's lifecycle wiring and by `test/loader.spec.ts` activation, not by
  this file (`NOT_RUN` for a live unload).
- **The release itself.** No commit, tag or push was made by this agent; the release
  workflow's tag-vs-`package.json` validation was not run (`NOT_RUN` — out of scope, and
  publishing needs the operator's authorization).

## Process notes

Other agents were writing the same tree while this file was produced (`src/loop.ts` changed
at 23:56 after the first CI run). The final `ci.txt` and `build-twice.txt` were re-taken at
00:07 and 00:05 on the settled tree, and `test/loop.spec.ts` was re-run against the changed
`src/loop.ts` (27/27) before the final gate. The mutation replays ran on a copy, never on the
product source.

---

# Correction appended after the round-2 verification (agent-25, 2026-11-19T01:10+08:00)

The verifier's FAIL is correct and this file's idempotence claim was too narrow.

**What was wrong.** `build-twice.txt` proved that two consecutive `npm run build` runs on the
*working tree* produce identical `lib/`. It did not prove that the *committed* `lib/` is the
build of the *committed* `src/`, and it was not: at the tag commit `20eafea` and again at
`81a76ec`, `lib/loop.js` contained 0 occurrences of `callSchedule` while `src/loop.ts`
defined and called it 12 times. The v0.11.14 bundle therefore shipped without the
`loop/schedule-refused` mapping. The round's `npm run ci` was green because `npm test` =
`npm run build && vitest run` — it regenerates `lib/` and then tests the regenerated files, so
it cannot see a stale artifact. Remote CI had always checked it (`git diff --exit-code --
lib/`) and did fire: runs 44345615218 (CI), 44345622700 (Release v0.11.14), 44347643600 (CI).

**Repairs, in order.**

| commit | what it does |
| --- | --- |
| `8c8e367` (lead) | rebuilds `lib/loop.js`, `lib/loop.js.map`, `lib/loop.d.ts.map` so the committed artifacts match the released source — build output only, no source change |
| `b0d6d10` (lead) | records the incident in `.rsi/ROUND.md`, `.rsi/STATE.md`, `docs/knowledge/{HANDOFF,VALIDATION}.md` |
| `3c24f92` (this agent) | adds `scripts/verify-lib.mjs` + `npm run verify:lib`, wired into `npm run ci`: exports `HEAD`, rebuilds it in a scratch directory, byte-compares with `HEAD`'s `lib/`. Red on `81a76ec` (the same three files), green on `b0d6d10` and `3c24f92` (141 files). Plus the `[Unreleased]` changelog note and this evidence |

**Measured state of the landed tree** (`CONFIRMED`, see `ci-landed.txt` / `build-twice-landed.txt`):
clean clone of `3c24f92`, `npm run ci` exit 0 — typecheck clean, oxlint 22 warnings / 0 errors,
`lib/ at 3c24f92 is the build of src/ at 3c24f92 (141 files, byte-identical)`, **60 files /
1081 tests passed**. Two builds of that clone are byte-identical (141 files) and leave no
tracked file changed. Remote CI on `main` for `3c24f92` is **success** (run 44354906962);
the two preceding commits are green as well, so `main` is no longer red.

**Test count, honestly.** The baseline I measured myself — pristine archive of `81a76ec`,
`npx vitest run` — is 60 files / 1081 tests. The landed tree is 60 / 1081. Equal, not
increased: the +4 tests written after that commit (2 route cases for the 413/409 answers,
3 anchor regressions minus 1, `test/loop.spec.ts` 27 → 30) are **still uncommitted** in the
working tree, owned by other agents of this round. No test was deleted, skipped or loosened
(`grep -rnE "\b(it|test|describe)\.(skip|only|todo)\(" test/` → 0).

**Still uncommitted when this note was written** (not mine to land; each needs its author's
"done", and each must be committed together with a rebuilt `lib/`): the `loopRrule` anchor fix
in `src/loop.ts` (ceil + one interval, with 3 regression tests), the 413/409 route cases in
`test/loop-surface.spec.ts` + `src/loop-surface.ts`, the bilingual schema descriptions in
`src/config.ts` / `test/config.spec.ts`, and the in-flight `src/loop-brakes.ts` / `src/gate.ts`
brake feature. `verify:lib` will fail on the next commit that lands source without its build —
that is the guard working, not a false alarm.

**NOT_RUN, unchanged.** A real heartbeat delivery, the HTTP switch / `grok_loop` tool end to
end, a live unload deleting rows, and the release workflow's tag validation. `v0.11.14` has no
GitHub Release and its tag still carries the stale bundle; per the lead's recorded decision the
tag is not moved, and the corrected artifact ships in the next patch release.
