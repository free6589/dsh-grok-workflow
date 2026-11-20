# Release and version discipline audit — 2026-11-21

Scope: release slice only (version sync, tags, changelog, lib artifacts, release workflow).
Repo: `dsh-grok-workflow`, branch `main` @ `bffd0b4` (= `origin/main`).
No version bump, changelog edit, tag move, or publish was performed.

## 1. Version sync — PASS

| Source | Version |
| --- | --- |
| `package.json` `version` | `0.12.14` |
| `package-lock.json` `version` | `0.12.14` |
| `package-lock.json` `packages[""].version` | `0.12.14` |
| `lockfileVersion` | `3` |
| newest `v*` tag | `v0.12.14` |

- `node -p "require('./package.json').version"` → `0.12.14`
- `node -e` over `package-lock.json` → top-level and root-package version both `0.12.14`.
- Lock and manifest agree, and both agree with the newest tag. No unpublished bump is pending on `main`.

## 2. Tag inventory — 62 tags, 62 on the remote, none moved

`git tag -l | wc -l` → **62**; `git ls-remote --tags origin` → **62** distinct tag names.
Scripted 1:1 comparison of every local tag's peeled commit against the remote's peeled
(`refs/tags/x^{}`) or direct object:

```
MISSING_ON_REMOTE: none
REMOTE_ONLY: none
MOVED: none
```

Tag form: 61 of 62 match `vMAJOR.MINOR.PATCH`. Annotated: 56; lightweight: 6
(`v0.3.0 v0.4.0 v0.5.0 v0.5.1 v0.6.0 v0.8.0`, all pre-dating the annotated-tag norm).

Tag ↔ `package.json` at the tagged commit (both `package.json` and `package-lock.json`
root version read from each tag):

- 61/62: tag name == manifest version (e.g. `v0.12.14` → `0.12.14`, `v0.3.0` → `0.3.0`).
- **1 mismatch — `v0.2.0-rc.1`**: tag name `0.2.0-rc.1`, but `package.json` and
  `package-lock.json` at that commit are both **`0.1.0`**. The tag predates the Release
  workflow; it is documented in both READMEs and pinned by
  `test/docs-version.spec.ts` ("names the one prerelease tag that is not a release").
  It cannot be fixed without moving a published tag, which is forbidden.
- Ancestry: every tag's commit `git merge-base --is-ancestor … origin/main` → all pass.
- All version tags listed: v0.1.0, v0.2.0, v0.2.0-rc.1, v0.2.1–v0.2.7, v0.3.0, v0.4.0,
  v0.5.0, v0.5.1, v0.6.0, v0.7.0, v0.8.0, v0.9.0–v0.9.4, v0.10.0–v0.10.2,
  v0.11.0–v0.11.21, v0.12.0–v0.12.14.

GitHub Releases: **59** for 62 tags (`gh release list --limit 200`). Tags without a release:

| Tag | Reason (observed) |
| --- | --- |
| `v0.2.0-rc.1` | prerelease tag, rejected by the Release workflow's strict `vX.Y.Z` regex; predates the workflow |
| `v0.11.14` | Release run `44345622700` failed at step **Verify committed build artifacts** (tagged with a stale `lib/`); repaired forward by `v0.11.15`, tag left in place |
| `v0.12.10` | Release run `44679697160` failed at step **Test**; repaired forward by `v0.12.11` ("release repair") |

None of these can be repaired by re-pointing a tag; both failed-run tags are permanent
"tag without Release" records and should stay documented as such.

## 3. Changelog adequacy — sections complete, `[Unreleased]` empty

- `CHANGELOG.md` has 62 `## [...]` headings: `[Unreleased]` + 61 released versions.
- Every tag except `v0.2.0-rc.1` has a section; no version section lacks a tag.
- Newest section `## [0.12.14]` equals `package.json`'s version, and the section order is
  descending (`test/docs-version.spec.ts` enforces this; 11/11 guard tests pass).
- `## [Unreleased]` contains **zero entries** — the heading plus one blank line (15 bytes).
  Since `v0.12.14` the only commit on `main` is `bffd0b4` (docs/RSI memory: `HANDOFF.md`,
  `STATE.md`, `VALIDATION.md`), so an empty Unreleased section is *consistent* with the
  committed tree.
- Bilingual requirement: all 61 released sections contain Simplified Chinese text; the
  `[Unreleased]` section has no entries, so there is nothing bilingual or otherwise to
  assess there. Structure is inconsistent, not absent: most entries use
  `- **English / 中文** — …`, but several (e.g. `[0.11.4]`, `[0.12.1]`, `[0.9.2]`) put the
  Chinese block on continuation lines instead of the bold heading.
- Risk, not a committed defect: the working tree holds an uncommitted user-visible change
  (`src/delivery/index.ts`, `test/delivery-human-block.spec.ts`, +576/−25) with **no
  `[Unreleased]` entry**. If that lands as-is, it ships user-visible behavior without the
  bilingual changelog record AGENTS.md requires.

## 4. `lib/` artifacts — present and byte-identical at HEAD

- `git ls-tree -r --name-only HEAD lib | wc -l` → **153** committed files under `lib/`
  (`*.js`, `*.d.ts`, `*.js.map`, `*.d.ts.map`; e.g. `lib/answer.js`, `lib/checkpoint/schema.js`).
- `npm run verify:lib` (exports HEAD, builds it in a temp dir, byte-compares with HEAD's `lib/`):
  `lib/ at bffd0b4 is the build of src/ at bffd0b4 (153 files, byte-identical)` — exit 0.
- `npm pack --dry-run` includes the artifacts: `package.json` `files` is
  `["lib/**/*.js","lib/**/*.d.ts",…]` and the tarball contents list `lib/answer.d.ts`,
  `lib/answer.js`, `lib/carryover.js`, `lib/checkpoint/schema.js`, … (exit 0).
  First attempt failed with `EROFS` on `~/.npm/_cacache` (sandbox); rerun with
  `npm_config_cache=$PWD/.tmp-npm-cache` succeeded.
- Uncommitted drift: `lib/delivery/index.{js,d.ts,js.map,d.ts.map}` are modified in the
  working tree, in lockstep with the uncommitted `src/delivery/index.ts`
  (`cutCodeUnits` appears 5× in both). The pair is internally consistent but is **not** the
  committed state, so a release cut from the working tree today would fail
  `git diff --exit-code -- lib/` if `src` and `lib` were not committed together.
- Also untracked: `test/tmp-ledger-probe.spec.ts` (probe spec). Not part of any tag checkout,
  but a local `npm test` collects it.

## 5. Release workflow requirements — `.github/workflows/release.yml`

| AGENTS.md requirement | Enforced? | Where |
| --- | --- | --- |
| tag is `vMAJOR.MINOR.PATCH` | yes | `^v(0\|[1-9][0-9]*)\.(0\|[1-9][0-9]*)\.(0\|[1-9][0-9]*)$`; `v0.2.0-rc.1` fails this (verified locally) |
| publish from merged `main` | partial | `git merge-base --is-ancestor HEAD origin/main` — an *older* `main` commit also passes |
| tag matches `package.json` | yes | `node -p "require('./package.json').version"` vs `RELEASE_TAG` |
| `package-lock.json` bumped together | **no** | lock version is never read |
| tests run | yes | `npm run typecheck`, `npm run lint`, `npm test` (which rebuilds), `npm pack --dry-run` |
| committed `lib/` artifacts verified | yes | `git diff --exit-code -- lib/` + no untracked files under `lib/` |
| matching changelog notes | partial | section for the tag version must exist and be ≥4 lines; no bilingual check, no `[Unreleased]`-is-empty check |
| release created only after all of the above | yes | `gh release create --verify-tag --notes-file release-notes.md` is the last step |

Additional observations:

- Trigger is `tags: v*.*.*` plus `workflow_dispatch`; a prerelease-shaped tag such as
  `v0.2.0-rc.1` reaches the job and is then rejected by the regex (fail-loud, but noisy).
- `gh release create --verify-tag` checks the tag exists, not that a Release does not; a
  re-dispatch on an already-released tag fails at the last step after the full build.
- `.github/workflows/ci.yml` does build + `git diff --exit-code -- lib/` but does not run
  `npm run verify:lib`; the CI path still catches stale artifacts because it rebuilds first.
- The changelog step's minimum is `section.split('\n').length < 4`, i.e. any four lines count
  as "notes"; bilingual parity is unguarded by the workflow (only `test/docs-version.spec.ts`
  guards README versions and section presence/order).

## 6. RSI "one tag per round" norm

`.rsi/ROUND.md:8` states the ledger's rounds are each "committed and pushed with a patch bump
and a new annotated tag". `ROUND.md` ends at **Round 38**; `v0.12.14` is the release of the
`/compact` fix. Rounds 39–40 exist only as untracked evidence
(`.rsi/evidence/round-039/`, `baseline-round39*.md`, `checkpoint-round40.md`) with
uncommitted `src`/`lib`/`test` changes: the in-flight round has **no commit and no tag yet**,
which is a state observation, not an observed tag-discipline breach (no tag was moved, and
`package.json` was not bumped ahead of a tag).

## 7. Verdict

**Release-consistent, not release-ready for the next cut.**

- Committed `main` is disciplined: manifest = lock = newest tag = newest changelog section,
  all 62 tags present on the remote with identical targets, no moved tags, `lib/` byte-identical
  to its own source, 59 published Releases, latest `v0.12.14` non-draft/non-prerelease with
  `dsh-grok-workflow-0.12.14.tgz`.
- Gaps, highest first:
  1. `[Unreleased]` is empty while an uncommitted user-visible delivery change exists — that
     change needs bilingual Unreleased entries before it is released.
  2. `v0.12.10` and `v0.11.14` are published tags with no GitHub Release (both Release runs
     failed: `Test`, `Verify committed build artifacts`); unrecoverable without moving tags.
  3. Release workflow never validates `package-lock.json` against `package.json`, although
     AGENTS.md requires both to bump together.
  4. Release workflow accepts any `main` ancestor commit, not the `main` tip — publishing
     stale `main` code is possible.
  5. Changelog gate is line-count-only: bilingual notes, and "Unreleased drained into the
     version section", are unenforced.
  6. `v0.2.0-rc.1` is a prerelease-named tag whose commit declares `0.1.0`; permanently
     documented rather than fixable (moving it is forbidden).

## Commands used

```
git status --short --branch ; git log --oneline -10
node -p "require('./package.json').version" ; node -e …package-lock.json
git tag -l --sort=v:refname ; git for-each-ref … refs/tags
git show <tag>:package.json ; git show <tag>:package-lock.json   (all 62 tags)
git ls-remote --tags origin ; git fetch origin main
git merge-base --is-ancestor <tag>^{commit} origin/main          (all 62 tags)
gh release list --limit 200 ; gh release view v0.12.14|v0.11.14|v0.12.10
gh run list --workflow Release --limit 12 ; gh run view 44345622700|44679697160 --json jobs
npm run verify:lib        # exit 0, 153 files byte-identical at bffd0b4
npx vitest run test/docs-version.spec.ts test/docs-architecture-version.spec.ts   # 11 passed
npm_config_cache=$PWD/.tmp-npm-cache npm pack --dry-run          # lib/*.js + lib/*.d.ts listed
```

Not run: `npm run ci` (full suite) — outside this slice and the working tree currently holds
another round's uncommitted changes.
