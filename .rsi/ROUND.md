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

## Round 4 — README config-surface drift + docs guard extension (incl. TS7016)

- **Theme (P0/P1, shipped docs false statements):** README prose still claimed
  "three routes", "17 fields", "seven scalars", limits-table `| 3 |` and a
  `synthesis: deterministic` + `switchOn` example the loader refuses — while
  `src/config.ts` enforces `chainLength: 50`, `CONFIG_KEYS` 9, `synthesis:
  layered|model`, 5 roles. `test/docs-config-keys.spec.ts` grew a `js-yaml`
  import with no type shim, so `npm run typecheck` failed (TS7016).
- **Change:** both READMEs aligned to code (50 routes, 9 field(s), eight
  scalars, five roles, `layered` example, limits-table `| 50 |`);
  `test/docs-config-keys.spec.ts` 3→7 its (size, loadable examples, chain
  wording, hard-limit row pin); `test/types/js-yaml.d.ts` local shim (no new
  dependency); `CHANGELOG.md` `## [0.11.4]` bilingual; `package.json` +
  `package-lock.json` → `0.11.4`.
- **Files:** `README.md`, `README.zh-CN.md`, `test/docs-config-keys.spec.ts`
  (new its), `test/types/js-yaml.d.ts` (new), `CHANGELOG.md`,
  `package.json`, `package-lock.json`.
- **Evidence:** `.rsi/evidence/round-004/ci.txt` (npm run ci exit 0 · 54 files /
  985 tests), `typecheck.txt` (0 error), `vitest-docs-config-keys.txt` (7/7).
- **Review:** first review FAIL (rsi-agent-d: limits `| 3 |`, `17 field(s)`,
  untracked shim); rework by rsi-agent-b2 closed all three; re-verify
  rsi-agent-c2 green (985 tests); second review PASS (rsi-agent-d2).
- **Commit/tag/push:** `bcb601d`, tag `v0.11.4`, both pushed (`ls-remote`
  confirms `main` and `v0.11.4` at `bcb601d`).
- **Unverified:** live `grok-workflow-dev` profile message test `NOT_RUN` —
  zero `src/` change, zero runtime path; Loader coverage via CI
  `loader.spec.ts` (2 tests PASS).
- **Suggested version:** patch → `0.11.4`.
- **status:** OK

## Round 5 — redaction missed four shapes and rewrote non-secret code

- **Theme (P2-02, `src/redact.ts`):** the pool's redaction section, probed on the
  built `lib/redact.js` before touching anything. Seven behaviours, five of them
  leaks or corruptions:
  | probe | before |
  | --- | --- |
  | `curl -H 'Cookie: PHPSESSID=abc123def' …` | unchanged (rule anchored at `^\|\n`) |
  | `?X-Amz-Signature=…`, `?X-Goog-Signature=…`, `?auth=…` | unchanged (only Azure `sig`) |
  | `-----BEGIN PGP PRIVATE KEY BLOCK-----` | unchanged (PEM banner only) |
  | `SECRET_KEY=x`, `PRIVATE_TOKEN=y` | unchanged (key alternation lacked both) |
  | `const token = await refreshToken()` | `const token = [REDACTED] refreshToken()` |
  | `if (password == null)` | `if (password =[REDACTED] null)` |
  | `db_pass=hunter2;user=app` | `db_pass=[REDACTED]` (loses `;user=app`) |
  | `X-Amz-Credential=[REDACTED AWS ACCESS KEY]` | `[REDACTED] AWS ACCESS KEY]` |
- **Change:**
  1. `cookie-header` also matches inside a quoted shell argument / JSON string and
     stops at the closing quote, so the rest of the command survives.
  2. `url-signature-query` (renamed from `azure-sas-signature`) adds
     `X-Amz-Signature`, `X-Goog-Signature` and `auth` to the existing
     `sig`/`signature`/`sharedaccesssignature`.
  3. New `pgp-private-key` rule for `BEGIN PGP PRIVATE KEY BLOCK` /
     `SECRET KEY BLOCK` armor.
  4. `key-value-env` gains `secret[_-]?key` / `private[_-]?token`, no longer matches
     a comparison (`==`/`===`) or a code keyword (`await`, `new`, `process`, …), and
     requires the value to end at a token boundary (whitespace, EOL, `,;}&|<>})]`),
     so a call expression is left alone and `;user=app` survives.
  5. The env rule also refuses a value that is already a `[REDACTED …]` placeholder
     or a quote/brace, which is what corrupted placeholders.
  6. `isSensitiveKey` compares hyphenated header names (`x-api-key`) against the
     same composite list as their snake_case spellings.
- **Docs:** both READMEs' redaction bullet and a new `docs/ARCHITECTURE.md`
  "Credential redaction" section name the covered families, the two deliberate
  asymmetries (over-redaction preferred to rewriting code; a value ends at a token
  boundary) and the known base64-PEM gap.
- **Evidence:** `.rsi/evidence/round-005/red.txt` — 6 failed / 24 passed before the
  fix. `green.txt` — `test/redact.spec.ts` 32/32. `ci.txt` — `npm run ci` exit 0,
  typecheck 0 errors, lint 22 warnings / 0 errors (baseline), **54 files / 993 tests
  PASS** (was 54/985).
- **One existing assertion changed** (`test/phase1-dialogue.spec.ts:655`): it required
  a bare `[REDACTED]` after `api_key=sk-live-…`. The provider-token rule fires before
  the assignment rule, so the honest marker is `[REDACTED API KEY]`; the assertion now
  pins that exact string (stronger) and still asserts the raw secret is absent. No
  assertion was deleted, skipped or loosened.
- **New tests:** `test/redact.spec.ts` 24 → 32 `it`s (six behaviour cases, one
  docs guard over README + README.zh-CN + ARCHITECTURE, one deep-copy key case); the
  prompt-parity corpus 22 → 29 samples so the generated script mirror is checked on
  the new shapes.
- **Unverified:** base64-wrapped PEM still has no rule (`NOT_RUN` by design, recorded
  in ARCHITECTURE); the live `grok-workflow-dev` message path was not exercised this
  round (`NOT_RUN` — the change is inside `redact.ts`, and `test/loader.spec.ts` (2
  tests) in `npm run ci` covers the real Loader activation path).
- **Suggested version:** patch → `0.11.5`.
- **status:** OK

## Round 6 — LOCAL-TESTING promised a tarball, a rejection and a notation it did not have

- **Theme (P1-03, `docs/LOCAL-TESTING.md` vs `src/config.ts`):** the guide an operator
  follows to install and run the plugin. Audited every numeric claim against the code
  before changing a word.
  | claim | code | verdict |
  | --- | --- | --- |
  | "exactly nine keys" + all nine names | `CONFIG_KEYS` (9) | correct |
  | `maxRetries=1` | `FIXED_MAX_RETRIES` | correct |
  | `maxActiveRuns=2` per session, `8` per process | `FIXED_MAX_ACTIVE_RUNS` / `_TOTAL` | correct |
  | `timeoutMs` defaults to `3600000`, `0` unlimited | `DEFAULT_TIMEOUT_MS` | correct |
  | install examples `dsh-grok-workflow-0.2.0.tgz` / `-0.2.1.tgz` | `package.json` 0.11.5 | **stale, 4 occurrences** |
  | troubleshooting `roles.synthesizer is set but synthesis is "deterministic"` | `apply()` repairs `deterministic` → `layered` (src/index.ts:94-101, config.ts:556-568); no such message exists | **wrong** |
  | zh README `maxActiveRuns` 每会话 `2` / `maxActiveRunsTotal` 每进程 `8` | same facts, different notation from the English `key=value` | **inconsistent** |
- **Change:**
  1. All four tarball names follow `package.json`; `.rsi/tools/bump-version.py` now
     rewrites `dsh-grok-workflow-X.Y.Z.tgz` in `docs/LOCAL-TESTING.md` on every bump
     (printed as `local-testing.tgz=3`), so the guide cannot go stale again.
  2. The troubleshooting entry quotes the two messages the build really produces
     (`unknown configuration key "triageModel"; accepted keys: …`,
     `synthesis must be "model" or "layered", got "…"`) and names the two stored values
     that are *repaired* rather than refused.
  3. `README.zh-CN.md` fixed-cap sentence uses the English `key=value` notation; no
     number changed.
- **Guard:** `test/docs-config-keys.spec.ts` 7 → 12 `its` — LOCAL-TESTING must name
  every `CONFIG_KEYS` entry and the spelled-out count, quote
  `FIXED_MAX_RETRIES`/`FIXED_MAX_ACTIVE_RUNS`/`FIXED_MAX_ACTIVE_RUNS_TOTAL`/
  `DEFAULT_TIMEOUT_MS`, name only tarballs equal to the package version, and quote only
  messages present in `src/config.ts`; both READMEs must state all seven fixed caps read
  from the constants.
- **Evidence:** `.rsi/evidence/round-006/red.txt` — the new spec against the pre-fix
  document: **2 failed / 9 passed** (`pins every packed-artifact name…`,
  `quotes only load-time messages…`). `green.txt` — 12/12. `ci.txt` — exit 0, typecheck
  0 errors, lint 22 warnings / 0 errors, **54 files / 998 tests PASS** (was 54/993).
- **Unverified:** the GitHub-rendered guide was not re-read in a browser (`NOT_RUN`); the
  live `grok-workflow-dev` install was not repeated this round (`NOT_RUN` — round 8 owns
  the runtime disposition).
- **Suggested version:** patch → `0.11.6`.
- **status:** OK
