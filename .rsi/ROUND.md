# RSI Round Reports

One section per round, appended in order. Fields follow `.rsi/PROTOCOL.md` step 5:
theme, files changed, evidence, unverified items, suggested version, and `status`.

Protocol note recorded once (round 1, still in force): `.rsi/PROTOCOL.md` step 6 says
"do not commit, do not tag — an external script releases", while the task this ledger
serves requires one commit and a `vX.Y.Z` tag per round. Every round below is therefore
committed and pushed with a patch bump and a new annotated tag; no tag is ever moved,
no history is rewritten, and no round is force-pushed.

---

## Round 0 — carry-in commit (pre-round)

- **Theme:** none of its own. The working tree already held finished, green work for
  `0.11.0` (`timeoutMs` as the ninth configuration key) that had never been committed.
  It was verified, not written, by this round.
- **Verification:** `npm run ci` on the untouched tree → typecheck 0 errors, oxlint
  0 errors, build idempotent (`git diff -- lib/` empty after `npm run build`), vitest
  **51 files / 959 tests PASS**.
- **Commit:** `85541ad` — "feat(config): run deadline is configurable (timeoutMs, 9th
  key) — v0.11.0 carry-in". Pushed to `origin/main`; tag `v0.11.0` created and pushed
  (`08c5fd0…`, tag object).
- **Unverified:** the settings page rendering of the new deadline field was not
  re-screenshotted in a live DSH instance by this round (`NOT_RUN`).
- **status:** OK

## Round 1 — the READMEs advertised a release three versions old, and nothing checked

- **Theme (P1, docs and version truth):** both READMEs said "the package version in
  this repository is `0.8.0`", pinned `#v0.8.0` in every install example, named
  `` `#v0.8.0` is the current release `` in prose, and ended the published-tag list at
  `v0.8.0` — while `package.json` said `0.11.0` and the published tags ran to
  `v0.10.2`. `docs/ARCHITECTURE.md` labelled the checkpoint section "Status
  (**0.8.0**)" as if that were the current release.
- **Change:** the drifted prose is fixed, and the claim is now a checked contract:
  `test/docs-version.spec.ts` compares `package.json` with the declared version in
  both languages, every `plugin add …#vX.Y.Z` pin, every bare `` `#vX.Y.Z` `` in prose,
  the ascending duplicate-free published list (last entry must be the current
  release), and the newest `## [x.y.z]` changelog heading.
- **Files:** `test/docs-version.spec.ts` (new), `README.md`, `README.zh-CN.md`,
  `docs/ARCHITECTURE.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`,
  `.rsi/` (state, log, ledger, evidence), `.rsi/tools/bump-version.py` (new).
- **Evidence:** `.rsi/evidence/round-001/red.txt` — the guard fails on the untouched
  tree with `expected '0.8.0' to be '0.11.0'` (4 of 6 assertions red).
  `.rsi/evidence/round-001/green.txt` — 6/6 green after the fix.
  `.rsi/evidence/round-001/ci.txt` — full `npm run ci`: typecheck 0 errors, oxlint
  0 errors (21 pre-existing warnings), **52 files / 965 tests PASS** (was 51/959).
  `.rsi/evidence/round-001/git.txt` — commit, tag, diffstat.
- **Unverified:** the rendered README on GitHub (`NOT_RUN`, no browser step taken);
  the live `grok-workflow-dev` profile message test was not run this round because the
  change touches no runtime path (`NOT_RUN`, stated rather than implied).
- **Suggested version:** patch → `0.11.1`.
- **status:** OK

## Round 2 — a published release lost its changelog section

- **Theme (P0, false statement in shipped docs):** `v0.9.0` is a published tag but
  `CHANGELOG.md` had no `## [0.9.0]` section. Root cause found in git history: the `v0.9.1`
  release commit `9103280` renamed `## [0.9.0] - 2026-11-15` to `## [0.9.1] - 2026-11-15`
  in place, so the eleven bilingual 0.9.0 entries (the Progress tab release) became 0.9.1's,
  and the real 0.9.1 note (stored caps clamp at load) was later folded into `0.9.2`.
- **Change:** `0.9.0` restored verbatim from `2d2b347:CHANGELOG.md` (body compared
  byte-for-byte, equal); the clamp note moved back under a new `0.9.1` section; `0.9.2`
  keeps only its own entries. `test/docs-version.spec.ts` gained the invariant that would
  have caught this: every published tag owns a section, and sections are newest-first.
- **Files:** `CHANGELOG.md`, `test/docs-version.spec.ts`, `package.json`,
  `package-lock.json`, `README.md`, `README.zh-CN.md` (published list now ends at this
  round's tag), `.rsi/` records.
- **Evidence:** `.rsi/evidence/round-002/red.txt` (fails: `no changelog section for
  v0.9.0`), `.rsi/evidence/round-002/green.txt` (7/7 pass), `.rsi/evidence/round-002/ci.txt`
  (npm run ci exit 0 · 52 test files passed · 966 tests passed), `.rsi/evidence/round-002/git.txt`.
- **Unverified:** the GitHub Release page for `v0.9.0` was not re-inspected; the fix is to
  the repository changelog, not to the released artifact body (`NOT_RUN`).
- **Suggested version:** patch → `0.11.2`.
- **status:** OK

## Round 3 — two rejected config keys were undocumented

- **Theme (P0, false statement in shipped docs):** `REMOVED_CONFIG_KEYS` contains
  `triageModel` and `maxActiveRunsTotal`; a patch carrying either is refused at load with
  `unknown configuration key`, yet neither name appeared in `README.md` or `README.zh-CN.md`
  (the per-process cap was only described as "`8` per process"). The lists the READMEs call
  exhaustive were one short.
- **Change:** both names documented in both languages; new `test/docs-config-keys.spec.ts`
  binds the READMEs to `CONFIG_KEYS` and `REMOVED_CONFIG_KEYS` (tabulated accepted keys,
  named removed keys, disjoint lists).
- **Files:** `test/docs-config-keys.spec.ts` (new), `README.md`, `README.zh-CN.md`,
  `CHANGELOG.md`, `package.json`, `package-lock.json`, `.rsi/` records.
- **Evidence:** `.rsi/evidence/round-003/red.txt` (`README.md never mentions the removed key
  triageModel`), `.rsi/evidence/round-003/green.txt` (3/3), `.rsi/evidence/round-003/ci.txt`
  (npm run ci exit 0 · 54 test files passed · 981 tests passed), `.rsi/evidence/round-003/git.txt`.
- **Unverified:** none of the removed keys was re-tested against a live profile this round
  (`NOT_RUN` — the load-time rejection itself is covered by `test/config.spec.ts`).
- **Suggested version:** patch → `0.11.3`.
- **status:** OK
