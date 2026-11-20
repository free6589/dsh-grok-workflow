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

## Round 7 — the tag inventory audited tag by tag; one tag is not a release

- **Theme (verification, remote tag inventory):** the backend carried an open question
  from the baseline round — "remote tags only tail-observed v0.2.7..v0.9.4 vs README 28
  tags v0.1.0..v0.11.3". This round closed it with a full comparison instead of a tail.
- **Method (exact commands, outputs in evidence):**
  `git fetch origin --prune`; `git ls-remote --tags origin` (61 lines → 32 tags, 26
  annotated); per tag `git show <tag>:package.json` + `git merge-base --is-ancestor
  <peeled> origin/main`; `git rev-parse HEAD` vs `git rev-parse origin/main`; README
  published lists extracted from both languages; local tag objects vs remote tag objects.
- **Result:** 32/32 tags exist locally and remotely with **identical objects** (no moved
  tag), every peeled commit is an ancestor of `main`, both README lists are ascending,
  duplicate-free, complete (0 missing, 0 extra) and end at the current release, and
  `HEAD == origin/main`. 31 of 32 tags have `package.json` equal to the tag; the
  exception is `v0.2.0-rc.1`, which predates the release workflow and sits on a `0.1.0`
  commit. It is a published tag, so it is **not moved**; both READMEs now say it is not a
  release, and `test/docs-version.spec.ts` fails if that note disappears.
- **Change:** README + README.zh-CN note about `v0.2.0-rc.1`; one new `it` in
  `test/docs-version.spec.ts` pinning the note (7 → 8).
- **Evidence:** `.rsi/evidence/round-007/` — `remote-tags.txt` (raw `ls-remote`),
  `audit.txt` (tag-by-tag table, README-list comparison, main sync), 
  `local-vs-remote-objects.txt` (32/32 identical objects), `ci.txt`.
- **Unverified:** GitHub Release *assets* for the older tags were not re-downloaded
  (`NOT_RUN` — this round audits refs, not release bodies); whether the Release workflow
  would reject a prerelease tag is not tested (`NOT_RUN`, no workflow change made).
- **Suggested version:** patch → `0.11.7`.
- **status:** OK

## Round 8 — the plugin really activates on DSH 0.2.2-rc.3; the model-backed run is blocked

- **Theme (live runtime disposition):** the backend carried "live `grok-workflow-dev` message
  test NOT_RUN" and the docs claimed the bundle "installs and composes" on `0.2.2-rc.3`
  while behaviour was verified only on `0.2.1-rc.2`.
- **What ran (exact commands in `.rsi/evidence/round-008/activation.txt`):** an isolated
  `DSH_HOME=$PWD/.dsh-home/rsi-r8` (gitignored, inside the workspace — `dsh` cannot write
  `~/.dsh` under this sandbox: `EROFS … /home/fish/.dsh/profiles/headless/cordis.yml`),
  `dsh --profile grok-workflow-dev --from-default-profile web`,
  `dsh plugin --profile grok-workflow-dev add $PWD` (installed as `link:`), the `workflow-ptc`
  row re-enabled, then a boot on `127.0.0.1:3199`.
- **Result — PASS for installation, composition and activation:**
  - bundles after `plugin add`: `["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app","dsh-grok-workflow"]`;
  - `--dump-config` shows `workflow-ptc` `disabled: false` (provider `spawn`) and the
    `grok-workflow` row;
  - boot output was one line — `dsh web: http://127.0.0.1:3199/?token=…` — with no `pending`
    row and no `did not activate` warning (acceptance check 1);
  - `POST /api/settings/describe` (after minting the launch cookie with `GET /?token=…`)
    returned **200 / 43 056 bytes, 23 namespaces, `grok-workflow` present with
    `autoGenerate: true`** (acceptance check 2).
- **Result — BLOCKED for a real model-backed message (acceptance check 4):** the isolated
  profile has no credential; `dsh --profile grok-workflow-dev headless "Use the grok_workflow
  tool …"` exits 1 with
  `dsh: MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"; …`.
  Copying the operator's key out of another profile is forbidden by this task, so the run is
  recorded as blocked, **not** as a pass. The real Loader path is still covered by
  `test/loader.spec.ts` (2 tests) inside `npm run ci`.
- **Two real traps found while doing it** (both now in `docs/LOCAL-TESTING.md`): a
  `web`-template profile rejects `dsh --profile <name> headless "task"` with `too many
  arguments` and treats `--host` as unknown; and `--from-default-profile web` *boots* the web
  app, so it fails when the operator's instance already owns `:3080` (the profile is still
  written, which is all that step needs).
- **Cleanup:** every instance started this round was stopped; `ss -ltn` shows no listener on
  3199/3201/3203/3205/3207/3209/3211/3213. The boot log that carried the launch token was
  redacted in place, and the evidence files contain no credential (`grep` for `token=` and
  `API_KEY=` over `.rsi/evidence/round-008/` is empty).
- **Evidence:** `.rsi/evidence/round-008/` — `activation.txt` (disposition + commands),
  `settings-describe.txt` (namespace list and the `grok-workflow` entry), `headless-run.txt`
  (`MISSING_CREDENTIAL`), `profile-create*.txt`, `plugin-add.txt`, `boot-raw.txt` (redacted),
  `ci.txt` (exit 0, 54 files / 999 tests).
- **Suggested version:** patch → `0.11.8` (docs now state a verified runtime that was not
  claimed before).
- **status:** OK

## Round 9 — P0-02 Progress page `执行`/`检查` said "not reported" (2026-11-18)

- **STOP probe (round start):** `.rsi/tools/stop-probe.sh 9` → `round=9 … 'test -e .rsi/STOP' ->
  STOP ABSENT`, appended to `.rsi/evidence/stop-probes.txt`.
- **Read-first recon:** `src/script.ts:1852/1886/1912/1950` puts `taskGroupTitle(...)`
  (`任务 n · 标题`) in `phase`; `src/progress-tab.ts` bound rows by `phase` alone against
  `PROGRESS_STAGES` tokens; `src/client/index.js` renders `progress.notReported` for a node with
  no members. So the two stages every run performs were always empty. Pool anchor:
  `.rsi/POOL.md` "Progress panel" P0.
- **Fix (minimal):** second channel — a row whose phase names no stage is matched by its role
  label (`STAGE_ROLE_LABELS`, words produced by `memberLabel()`) and cross-referenced onto that
  stage's new `evidence` list. `members` stays the one home per row; state prefers own rows;
  `blockedReason` follows the same rows. Mirrored in `src/client/index.js`; the stage meta line
  and tooltip now read `{count} 行在下方任务节点中执行` / `{count} rows ran inside the plan
  tasks below` instead of the not-reported copy (new keys in both locales).
- **Red → green:** `.rsi/evidence/round-009/red-ts.txt` = `Tests 5 failed | 29 passed (34)` →
  `.rsi/evidence/round-009/green.txt` = `Tests 112 passed (112)` (progress-tab 34 + client 78).
  Two pre-existing decoy tests went red because their fixture used the default label `执行 N`
  — i.e. the real worker label; they now use a neutral `Member` label and assert `members` **and**
  `evidence` are empty, so they test the phase channel and nothing else.
- **Gates:** `npm run typecheck` exit 0 (`.rsi/evidence/round-009/typecheck.txt`); `npm run ci`
  = `Test Files 54 passed` / `Tests 1006 passed` / lint 22 warnings 0 errors / exit 0
  (`.rsi/evidence/round-009/ci.txt`). Baseline v0.11.4 = 54/985; previous round 54/999.
- **Docs:** `docs/knowledge/DESIGN-progress-tab.md` §4.1 (two binding channels, the invariant)
  and §12 item 6 (the gap is closed, unknown labels still say "not reported"); CHANGELOG
  [0.11.9] in English and Simplified Chinese.
- **Version:** patch → `0.11.9` (`package.json` + `package-lock.json` together).
- **Evidence:** `.rsi/evidence/round-009/` — `stop-probes.txt`, `red-ts.txt`, `green.txt`,
  `typecheck.txt`, `ci.txt`, `git.txt`.
- **status:** OK

## Round 10 — P1-02 `docs/ARCHITECTURE.md` version statuses (2026-11-18)

- **STOP probe (round start):** `.rsi/tools/stop-probe.sh 10` → `round=10 … -> STOP ABSENT`
  (`.rsi/evidence/stop-probes.txt`).
- **Read-first recon:** `grep -nE "in this release|current version|0\.1[01]\.[0-9]+" docs/ARCHITECTURE.md`
  found no `current version` phrase and no stale package version, so the pool's literal wording
  was not reproducible. What *was* there: four release-relative claims (`:405`, `:416`, `:419`,
  `:554`) and a DSH boundary dated only to `0.2.1-rc.2` (`:413`), while round 8 verified
  install/activation/settings on `0.2.2-rc.3`. The relative phrasing is the same defect the pool
  named — a status nobody can resolve to a version.
- **Fix:** §Checkpoint status → `ship since **0.8.0**`; §What the user sees → `Since **0.8.0**:`;
  the two "no production caller / not in the tree" claims → `as of **0.11.9**` (verified:
  `grep -rn "resume/" src` shows only a comment in `src/checkpoint/wiring.ts`, and
  `src/run.ts:21` imports the checkpoint recorder); the boundary line now separates the measured
  version (`0.2.1-rc.2`) from round 8's re-check (`0.2.2-rc.3`, which `did *not* re-measure`
  that journaling boundary).
- **Guard:** `test/docs-architecture-version.spec.ts` (3 its) — no release-relative phrase, every
  `Status (` claim carries a `since **X.Y.Z**` that does not lead the package version, and the
  boundary paragraph keeps both versions and the "not re-measured" clause.
- **Red → green:** `.rsi/evidence/round-010/red.txt` is a deliberate replay of the new spec
  against the previous document (`2 failed | 1 passed`); `green.txt` = `3 passed`.
- **Gates:** `npm run typecheck` exit 0 (`.rsi/evidence/round-010/typecheck.txt`); `npm run ci`
  = `Test Files 55 passed` / `Tests 1009 passed` / lint 22 warnings 0 errors / exit 0
  (`.rsi/evidence/round-010/ci.txt`). Baseline v0.11.4 = 54/985.
- **Version:** patch → `0.11.10` (`package.json` + `package-lock.json` together); README
  published list rewritten by `bump-version.py` (`published=35`).
- **Evidence:** `.rsi/evidence/round-010/` — `stop-probes.txt` (shared), `red.txt`, `green.txt`,
  `typecheck.txt`, `ci.txt`, `git.txt`.
- **status:** OK

## Round 11 — P2-01 client i18n key parity (2026-11-18)

- **STOP probe (round start):** `.rsi/tools/stop-probe.sh 11` → `round=11 … -> STOP ABSENT`.
- **Read-first recon:** the bundle carries two dictionaries — the plugin's `DICT`
  (`src/client/index.js:409`, exported as `GROK_WORKFLOW_DICT`) and `PANEL_DICT` (`:1445`,
  registered as `grok-workflow-panel` at `:3624`). Panel call sites (`:1664` `statusCount.*`,
  `:1726` `member.empty`, `:1790` `phase.*`, `:1835` `run.empty`) receive a translator bound to
  `PANEL_DICT` (`:1556 panelTranslate`), so their keys are correct there and deliberately absent
  from `DICT`.
- **Audit result (no defect):** 137 keys per plugin locale, 19 per panel locale, both tables
  symmetric (`leftOnly`/`rightOnly` empty), no empty copy; every literal `t('…')` key resolves,
  every concatenated key (`unit.jobs|tasks|ms`, `mode.auto|full.title|.detail`,
  `option.mode.triage|full`) resolves, and every dynamic expansion resolves in the table that
  consumes it (`progress.stage.*` 7, `progress.field.*` 7, `role.*` 5, `progress.derived.*` 2,
  `progress.source.*` 3 in `DICT`; `status.*` / `statusCount.*` 6+6 in `PANEL_DICT`).
- **Change:** `test/i18n-parity.spec.ts` (6 its). A key missing from the plugin table must be one
  of the six panel-scope keys, so a key that moves between tables fails instead of being excused
  by "exists somewhere"; the panel dict is asserted symmetric on its own.
- **Red → green:** `.rsi/evidence/round-011/red.txt` is a **deliberate mutation replay** — one
  `zh` key (`unit.ms`) removed from the bundle → `2 failed | 4 passed`; the file was restored
  immediately (`git diff --stat src/client/index.js` empty) and `green.txt` = `6 passed`.
  The spec's own first run also failed on two of my shape assumptions (`progress.detailFields`
  is a string array; the self-test passed dicts to a function expecting one) — test bugs, fixed
  before the replay, and no product code was changed by them.
- **Gates:** `npm run typecheck` exit 0 (`.rsi/evidence/round-011/typecheck.txt`); `npm run ci`
  = `Test Files 56 passed` / `Tests 1015 passed` / lint 22 warnings 0 errors / exit 0
  (`.rsi/evidence/round-011/ci.txt`).
- **Version:** patch → `0.11.11` (`package.json` + `package-lock.json` together);
  README published list rewritten (`published=36`).
- **Evidence:** `.rsi/evidence/round-011/` — `red.txt`, `green.txt`, `typecheck.txt`, `ci.txt`,
  `git.txt`, plus the shared `stop-probes.txt`.
- **status:** OK

## Backlog state after round 11

- Pool P1 and P2 are now **empty**: P1-01/P1-02/P1-03 done, P2-01/P2-02 done.
- Remaining pool items are P3-01 (settings page wording for the per-route cap and the deadline
  field), P3-02 (progress detail rows for members with no reported facts), and the `P ·`-prefixed
  call-site items (records.ts raw `error.message`, history.ts truncate-before-redact,
  base64-PEM rule, and the six configuration fail-closed branches without tests).

## Loop stop (2026-11-18) — VOID (correction 2026-11-18, superseded by rounds 12–13)

- ~~**Reason:** P1/P2 backlog empty — a permitted stop.~~ **No longer valid:** the
  authorizing task text (§§6–7) forbids stopping on backlog shape; `P ·`, P3 and
  fresh-audit findings are valid continuation themes. `.rsi/STOP` absent at every
  round start; no round limit reached. Kept for history, not authority.
- **Final verification:** `npm run typecheck` exit 0 (`.rsi/evidence/final-typecheck.txt`);
  `npm run ci` exit 0 with `Test Files 56 passed` / `Tests 1015 passed` / lint 22 warnings
  0 errors (`.rsi/evidence/final-ci.txt`); `npm run build` exit 0 with an empty
  `git diff -- lib/` (`.rsi/evidence/final-build.txt`, `final-lib-idempotent.txt`);
  37/37 tag objects identical to the remote, 0 non-ancestors, HEAD == `origin/main`.
- **Baseline:** v0.11.4 = 54 files / 985 tests; the loop added 2 files and 30 tests and removed
  none (`grep -rnE "\.(skip|todo|only)\(" test/ src/` is empty).

## Round 12 — redaction call-site hardening (P0 data safety)

- **Theme:** POOL `P ·` items still valid in HEAD: `src/records.ts` three warn
  paths logged raw `error.message` (`:292/:664/:756` vs `redactError` at
  `:555/:690/:376`); `src/history.ts` redacted *after* truncating to 1500 chars,
  so spaceless secrets straddling the cap and PEM blocks cut without `END`
  leaked into logs / the next prompt. (A12 audit; POOL Docs P items verified STALE.)
- **Change:** records 3× `redactError(error)`; history windowed redact-first
  (`MESSAGE_CAP 1500 + REDACT_SPAN 8192`) + `dropDanglingKeyBlock` fail-closed;
  benign text byte-identical. Tests: new `test/records-redaction.spec.ts` (4),
  `test/history.spec.ts` (+3); CHANGELOG `## [0.11.12]` bilingual;
  `package.json` + `package-lock.json` + READMEs + LOCAL-TESTING tarball → `0.11.12`.
- **Files:** `src/records.ts`, `src/history.ts`, `test/history.spec.ts`,
  `test/records-redaction.spec.ts` (new), `CHANGELOG.md`, version files, `lib/`
  rebuilt (history.js +46 / records.js +9, idempotent rebuild confirmed), evidence.
- **Evidence:** `.rsi/evidence/round-012/` (`ci.txt` 57/1022, `typecheck.txt` 0 error,
  `vitest-redaction.txt` 52/52 incl. redact.spec, `mutation.txt` 4-fail-without-fix,
  `git.txt`). DSH live message test NOT_RUN (no config/event/threshold change;
  Loader coverage via CI `loader.spec.ts`).
- **Process notes:** B12 finished the src fix but timed out without reporting (work
  recovered from the tree, confirmed via blame + stash); B13 timed out with zero
  delivery and was stood down; lead took over single-writer for tests + CHANGELOG
  (2 test bugs of mine fixed: commit-spy typing, PEM BEGIN placement, Session
  append vs commit interception). C12 verify green (incl. mutation replay);
  D12 independent review PASS.
- **Commit/tag/push:** `be64d56`, tag `v0.11.12`, both pushed (`ls-remote`
  confirms `main` and `v0.11.12`).
- **status:** OK

## Round 13 — gate landing: counts, NR reconciliation, baselines, probe (P1 docs)

- **Theme:** land one round of uncommitted gate work (5/5 verified per gate report):
  readme-counts (366/22 → 1022/57 both languages), nr-reconcile (NR-7/8 consistent,
  NR-4/OQ-018 stale → measured record prevails), git-baseline (HEAD == origin/main,
  full tag inventory), lib-idempotence (build twice identical), live-probe (real DSH
  load + stub-model interaction).
- **Change:** `README.md:311`, `README.zh-CN.md:301` count sentences; VALIDATION.md
  Round-15 reconciliation note (NR-4/OQ-018 pre-t32 wording superseded by t32 + Round 15
  measurements, bilingual); `CHANGELOG.md` `## [0.11.13]` bilingual (counts + note);
  version files `0.11.13`. Zero `src/`/`test/`/`lib/` changes (`diff --stat` empty).
- **Files:** READMEs, CHANGELOG, package.json/lock, LOCAL-TESTING tarball names,
  VALIDATION.md note, `.rsi/evidence/round-013/` (6 groups, 25 files; `*.log` members
  gitignored per repo rule, summaries committed).
- **Evidence:** gate `readme-counts/` (ci 57/1022 raw+after-fix), `nr-reconcile/report.md`,
  `git-baseline/` (sync.txt/tags.txt), `lib-idempotence/build-twice.log`,
  `live-probe/` (13 files), `release-verify/` (C13: ci.txt 57/1022, typecheck 0 error).
  C13 verify green; D13 independent review PASS (counts match, history logs untouched,
  versions consistent, bilingual, no secret, no overreach).
- **Commit/tag/push:** `7a79efb`, tag `v0.11.13`, both pushed (`ls-remote` confirms).
- **Unverified:** live model-backed `grok_workflow` message still BLOCKED
  (MISSING_CREDENTIAL; copying the operator key forbidden) — probe covered load +
  stub interaction only.
- **status:** OK

## Round 14 — repeat-run (loop) surface + bilingual docs + release (P4 before P3, D-068)

- **Theme:** the four `loop*` keys were stored, validated and projected, and nothing read them —
  "repeat runs" existed only as configuration. This round ships the driver and makes the claim
  checkable in both languages. Order is authorized: the repeat-run item is P4 (deferred / blocked on
  the Host Schedule surface) by the demand audit's own definition
  (`.rsi/incoming/github-demand-audit-2026-11-18.md:92`), while PROTOCOL §2 would have put the two
  open P3 UX items first — the operator authorized P4 first, recorded as `D-068`, scope = order only.
- **Change (runtime, landed by this commit):** `src/loop.ts` (service: policy, RRULE building, row
  selection, serialized mutations, cleanup), `src/loop-surface.ts` (`grok_loop` tool + `POST
  /grok-workflow/loop` route + unload/stop/archive cleanups), `src/config.ts` (four keys into
  `CONFIG_KEYS`, `HARD_LIMITS` 100/20/10080, `LIMIT_CAPS` driving both clamp and load-time repair),
  `src/index.ts` (service wired to the live config at open time), `src/client/index.js` (settings
  group `loop` with four fields), `src/settings.ts` + `src/types.ts` surface updates. Semantics:
  user-only open (`loop/user-only` for any defined actor, so the route opens and the tool cannot),
  interval floor `max(60, ceil(timeoutMs/60000), loopIntervalMin)` capped at 10080, round cap stored
  as RRULE `COUNT` (hard stop), fail streak carried as text only (a receipt proves an inbox write,
  not a successful round), close/unload/archive delete rows instead of pausing.
- **Change (docs, this task):** `README.md` + `README.zh-CN.md` gain a section each — switch,
  parameters, heartbeat behaviour, breaker semantics — plus one known-limitation line; the
  `loopEnabled` table row and the paragraph after the table no longer claim a composer switch that
  does not exist (`grep -rn "grok-workflow/loop" src/` = one hit, the constant at `src/loop.ts:56`;
  no client caller). `CHANGELOG.md` `## [0.11.14] - 2026-11-18` bilingual. `DECISIONS.md` `D-068`
  (P4-before-P3 authorization, scope stated) and `D-069` (loop ownership, who may open, what stops
  it, what closing means, and the "no shipped control yet" fact). `STATE.md`/`HANDOFF.md`/
  `VALIDATION.md` refreshed for this round.
- **Files:** `src/loop.ts`, `src/loop-surface.ts`, `src/config.ts`, `src/index.ts`, `src/settings.ts`,
  `src/types.ts`, `src/client/index.js`, `test/loop.spec.ts`, `test/loop-surface.spec.ts`,
  `test/heartbeat-guard.spec.ts`, `test/client.spec.ts`, `test/config.spec.ts`,
  `test/config-limits-repair.spec.ts`, `test/settings-fixture.ts`, `test/settings-projection.spec.ts`,
  `test/docs-config-keys.spec.ts`, `lib/` (rebuilt), READMEs, CHANGELOG, package.json/lock,
  `docs/LOCAL-TESTING.md`, `docs/knowledge/{DECISIONS,STATE,HANDOFF,VALIDATION,RESEARCH}.md`,
  `.rsi/{STATE,HEARTBEAT}.md`, `.rsi/tools/heartbeat-guard.sh`, `.rsi/PROTOCOL.md`,
  `.rsi/evidence/round-014/`, `.rsi/evidence/heartbeat-guard/`.
- **Gates:** `npm run typecheck` exit 0. `npm run ci` = npm run ci exit 0 · 60 test files passed · 1081 tests passed (`.rsi/evidence/round-014/ci.txt`;
  the doc-side run before it is `pre-release-ci.txt`, same counts). Baseline `v0.11.13` = 57 files /
  1022 tests → +3 files / +58 tests, none removed, none skipped.
- **Version:** patch → `0.11.14`, applied in-tree during this task by a parallel process in the same
  working tree (package.json/lock + README version sentences/pins/published list + LOCAL-TESTING
  tarball names, 23:46–23:50). This round did not invent a second number: it re-ran the full gate
  after that bump and released `0.11.14`. The same tree also received the `[0.11.14]` changelog
  heading from that process at 00:02; the release ran after notifying the lead and taking
  single-writer ownership of the memory files and of this script.
- **Evidence:** `.rsi/evidence/round-014/` — `pre-release-ci.txt` (doc-side full CI), `ci.txt`
  (this script's run), `mutation.txt` (user-only guard mutation replay: 1 failed without the guard),
  `ci-baseline.txt`, `git.txt`; `.rsi/evidence/heartbeat-guard/` (guard verdict in the real repo +
  the spec run).
- **Commit/tag/push:** `v0.11.14` — one commit, annotated tag, `push origin main` then `push origin
  v0.11.14`; no old tag moved or overwritten, no force-push, nothing published to npm.
- **Unverified (NOT_RUN):** a real heartbeat delivery (no scheduled task was created, modified or
  deleted — D-066 makes the first heartbeat an operator action); a live-GUI click on a control that
  POSTs the loop route (the client has no such control yet, D-069「现状」).
- **status:** OK

- **Landed as:** commit `20eafea` (`20eafea150d34d18dc99bae7523db62c1d8fcb38`), annotated tag
  `v0.11.14` (object `2a7b074`, peel = `20eafea`), `git push origin main` then
  `git push origin v0.11.14`; `origin/main` = `20eafea` (`merge-base --is-ancestor` passes),
  `git ls-remote --tags origin` compared with `git tag -l 'v*'`: same tag set (40 tags), every old
  tag untouched (`v0.11.13` object `bac26e3`, peel `7a79efb` — unchanged), no force-push, nothing
  published to npm. Count reconciliation: the doc-side run measured 60/1080, the release run
  60/1081 (one extra route case in `test/loop-surface.spec.ts`); `.rsi/evidence/round-014/ci.txt`
  is the number the tag carries. Tree note: after this commit another process in the same working
  tree continued editing `src/loop.ts`/`src/loop-surface.ts`/`test/loop-surface.spec.ts` (route
  `413`/`409` cases) — those edits are **not** part of this commit and were left uncommitted rather
  than folded into a release unverified.

- **Post-release incident (CONFIRMED, appended after the records commit):** the tag commit `20eafea`
  is red on the remote CI (run `44345615218`) and the Release workflow failed at `Verify committed
  build artifacts` (run `44345622700`), so **`v0.11.14` has no GitHub Release**. Cause: a concurrent
  writer changed `src/loop.ts` between this round's `npm test` and `git add`, so the committed `lib/`
  was one build behind the committed `src/` (`git show 20eafea:src/loop.ts | grep -c callSchedule` =
  12; `…:lib/loop.js` = 0; reproduced by `npm run build` in a clean worktree at the tag, ±41/−16 in
  `lib/loop.js`). Local `npm run ci` was green because it measures the working tree, not the commit.
  Repaired on main by `8c8e367` (build output only, no source change, pushed fast-forward; remote CI
  run `44349708692` = success). The tag was **not** moved or deleted: published tags are immutable
  and `workflow_dispatch` re-checks the same commit, so the remedy is a patch release from `main`,
  which needs explicit authorization and was not taken here. Also: `20eafea` shipped the
  `loop/schedule-refused` mapping without its 413/409 route tests (grep = 0 in that commit); those
  tests are still uncommitted in the working tree and belong to the next round.

## Round 15 — 2026-11-19 — 发布事故收口：`0.11.15`（patch），`v0.11.14` 标签原地保留

- **主题**：round 14 的 `v0.11.14` 只推了标签；其提交 `20eafea` 的 `lib/` 是更早的 `src/loop.ts`
  构建的（`callSchedule`：src 12 / lib 0），Release 工作流停在 `Verify committed build artifacts`
  （run `44345622700`），该标签既没有 GitHub Release，也没有压缩包发布。本轮按 D-070 从 `main`
  打 `0.11.15` 收口。
- **为什么在独立克隆里做**：主工作树有另一位写入者的 21 tracked + 6 untracked 未提交工作
  （客户端开关、`src/loop-brakes.ts`、`scripts/verify-lib.mjs` 等）；直接跑 R6 的
  `git add -A -- src test lib …` 会把未经审阅的半成品塞进发布提交。克隆
  `.worktrees/release-015`，基线 `b0d6d10`，`origin` 指回 GitHub。
- **改动**：`src/`、`test/` 零改动；`npm run build` 后 `git diff --stat -- lib/` 为空，所以本版本是
  「同一份源码、正确的产物」；README 中英测试数 `1022/57` → `1081/60`，并在安装区写明
  `v0.11.14` 不是发布版本、请固定 `v0.11.15`；`CHANGELOG.md` 双语 `## [0.11.15]`；
  `DECISIONS.md` `D-070`；`STATE.md` / `HANDOFF.md` / `VALIDATION.md` 本轮记录；
  `bump-version.py` 同步 `package.json` / `package-lock.json` / 两份 README / `docs/LOCAL-TESTING.md`。
- **门禁**：npm run ci exit 0 · 60 test files passed · 1081 tests passed（`.rsi/evidence/round-015/ci.txt`；文档侧先跑的一次在 `pre-release-ci.txt`）。
  CI 重建后 `git diff --exit-code -- lib/` 仍为空；文档守卫（docs-version 8、docs-config-keys 12、
  docs-architecture-version 3）通过；基线 `v0.11.13` = 57 / 1022，本轮 +3 文件 / +59 测试，
  无删除、无 skip。
- **证据**：`.rsi/evidence/round-015/`（`pre-release-ci.txt`、`ci.txt`、`git.txt`）；事故复述与 run id
  见 `VALIDATION.md` Round 61、`DECISIONS.md` D-070。
- **未验证（`NOT_RUN`）**：npm 发布（未授权）；真机心跳投递（D-066，操作者动作）；主工作树里另一位
  写入者的客户端开关与 `verify:lib`（不属于本轮，未提交、未审阅）。
- **status:** OK

- **Landed as:** commit `50c0321e371db076908d5fb6cec94bb8be25f37b`, annotated tag `v0.11.15`
  (object `e52a8f4c415a7619891be4fbad04c247439baba9`, peel = `50c0321`), `git push origin main`
  then `git push origin v0.11.15`; `origin/main` = `50c0321` before the record commit and the tag
  is an ancestor of it. Remote CI run `44359410024` = success; Release run `44359422843` =
  success with all 16 steps green, including `Verify committed build artifacts` and
  `Create GitHub Release` → https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.11.15
  with asset `dsh-grok-workflow-0.11.15.tgz` (523743 B), marked Latest.
  `npm run verify:lib` at `50c0321`: `141 files, byte-identical`
  (`.rsi/evidence/round-015/ci-committed.txt`). Old tags untouched (`v0.11.14` object `2a7b074`,
  peel `20eafea`; `v0.11.13` object `bac26e3`, peel `7a79efb`). No force-push, no npm publish.
- **Concurrency note:** the first `push origin main` was rejected (non-fast-forward) because
  another agent landed `3c24f92` (`verify:lib` gate) and `09d5daa` (evidence) while this round
  ran. The release commit was rebased `e46a302` → `50c0321` onto `09d5daa`, and the **local,
  never-pushed** tag was deleted and re-created on the rebased commit before pushing. The tree
  was clean at the tag commit, `git diff --exit-code -- lib/` empty.


## Round 16 — 2026-11-19 — 续跑开关进 composer dock + 心跳刹车（未发版）

- **主题**：round 14 落地的续跑面只有一条 `POST /grok-workflow/loop`，D-069 当时把「客户端没有控件」
  写成**现状**；round 15 之后主工作树里攒着一份未提交的实现（composer dock 开关、`src/loop-brakes.ts`、
  两者各自的测试）。本轮就是**收口**：核对、记录、落地。
- **改动（本轮新增的文件内容）**：`CHANGELOG.md` `[Unreleased]` 两条 Added（dock 开关 / 心跳可提前停，
  双语）；`DECISIONS.md` **D-072**（开关放 dock 不放设置页、开关不带数字、停=拒绝+删行、六道刹车的输入
  全是既有事实、token 是预算不是计量、失败轮=没写出助手消息），并把 D-069「现状」段与 D-071 的过时一句
  指回 D-072；`docs/knowledge/STATE.md`、`VALIDATION.md`、`HANDOFF.md`、`.rsi/STATE.md` 记本轮。
  `src/`、`test/` 的代码内容**没有**在本轮改动（开工/收工 sha256 指纹一致）。
- **代码归属**：`src/client/index.js`（`:3527` 路径常量、`:3529` order、`:3665-3718` `LoopSwitch`、
  `:3730-3743` 注册、`:3935` 挂载、`:4115-4120` 导出面）、`src/loop-brakes.ts`（六道刹车与
  `plugin:grok-workflow/loop-round` 记录）、`src/gate.ts:1535-1575`（gate 里唯一入口与 `loop-stop`）、
  `src/config.ts:388-399` + `:792-795`（四键与 clamp）、`test/loop-brakes.spec.ts`（35）、
  `test/loop-runtime-wiring.spec.ts`（5）、`test/client.spec.ts` 的 dock 用例（92 条中的一部分）。
- **门禁（`CONFIRMED`）**：`npm run typecheck` exit 0；`npx oxlint src test` = 22 warnings / 0 errors；
  `npm run build` = `client bundle: 224412 bytes`，构建前后 `lib/` 145 文件 md5 清单 diff 为空（幂等）；
  `npx vitest run` = **62 文件 / 1139 测试 PASS**（24.21s，比 `v0.11.15` 的 60/1081 多 2 文件 / 58 测试）。
- **证据**：`.rsi/evidence/segment-5/`（`pre-head.txt`、`pre-status.txt`、`pre-fingerprints.txt`、
  `build-seg5-attempt2.txt`、`lib-before.md5`、`lib-after-build.md5`、`lib-build-idempotence.txt`、
  `typecheck-attempt2.txt`、`lint-attempt2.txt`、`full-vitest-attempt2.txt`、`verify-lib-precommit.txt`、
  以及 attempt 1 的日志与 `NOTES.md`）。
- **未验证（`NOT_RUN`）**：真实 Web GUI 点击开关；真实心跳投递（D-066，操作者动作）；插件 reload 时
  Schedule 子 fiber 的重启语义（A27 §5 仍是 `HYPOTHESIS`）。
- **发版**：本轮**不发版**（未 bump、未打标签、未建 Release、未 npm 发布）；`[Unreleased]` 留着，
  下一次 patch 发版时搬进版本段。开关是用户可见的新增，版本纪律上属于 patch。
- **status:** OK

- **Landed as:** commit `e11d1009e0fc8b89a1ec8f1e20260c0802427336`（84 文件 / +8136 / −119），
  `git push origin main` 快进 `37cb0fc..e11d100`，`origin/main` = `e11d100`；远端 CI run `44425357004`
  = **success**（`Node 22` 与 `Node 24` 两个 job 全绿）。提交后 `npm run verify:lib` =
  `lib/ at e11d100 is the build of src/ at e11d100 (145 files, byte-identical)`（对比父提交那次是
  141 文件）。**没有** bump 版本、没有打标签、没有 GitHub Release、没有 npm 发布——开关是用户可见的新增，
  下一次经授权的发版应为 patch（`0.11.16`），把 `[Unreleased]` 两条搬进版本段。
- **Allowed untracked（未入库）：** `settings-simple-mock.html`（草稿 mock，round 15 的结论未变）。

## Round 17 — 心跳识别修 + 设置面说法统一 + 发版 `0.11.16` (patch)

- **主题**：round 17 四个验证片（`.rsi/evidence/round-017/`：baseline GO、ci GO、heartbeat-live 机制 GO、install 除 F1 外 PASS）交出两个 FAIL，逐项修完再发版。Q5：真机投递被 DSH 包成 `[SCHEDULE REMINDER] … reminder_prompt_json`，旧 `isLoopHeartbeat` 只认开头 → 心跳分支与六道刹车在真机上不可达（CONTRADICTED）；F1：13/11/“21 volatile”三处说法打架。另统一 README 测试数 60/1081→62/1142。
- **改动**：`src/loop.ts`（识别接受两种形状，source 配对不变）、`src/config.ts` / `src/settings.ts` / `src/client/index.js`（注释 11/13）、`src/settings.ts`（`describeSurface` 新文案）、`test/loop.spec.ts`（framing 用例）、`test/gate.spec.ts`（heartbeat classification 2 条）、`test/config.spec.ts` / `test/reliability.spec.ts`（显式新文案断言）、`CHANGELOG [Unreleased]`（两条 Fixed，双语）、README 中英计数、记忆文件 D-073/A28/VALIDATION Round 62/STATE/HANDOFF。`src/index.ts:292` 注释未动（仍 HYPOTHESIS）；P3-01/P3-02 仍 OPEN。
- **门禁（`CONFIRMED`）**：npm run ci exit 0 · 62 test files passed · 1142 tests passed；另有隔离真机证据（open→投递→turn→close→删行、user-only 双拒、minimal 503、stopAll/forgetSession 操作体、安装 10/11 PASS）。
- **发版**：patch `0.11.16`（用户可见修复：真机心跳刹车此前不生效；日志行说法修正）。`v0.11.14` 仍无 Release、原地不动。
- **未验证（`NOT_RUN`）**：rrule 定时到点、真模型整轮、GUI 点击、unload/归档监听 firing。
- **status:** OK

## Round 19 — 2026-11-19 — 载入期路由校验漏掉 `supervisor`（P0，patch `0.11.18`）

- **主题**：`src/settings.ts` 的 `ROLE_ORDER` 只列 planner/worker/verifier/synthesizer，
  而 `validateRoutes` 与「2+ 路由全空 `maxInFlight`」提示都从这张表取角色。于是
  `roles.supervisor` 完全不在载入期校验里：provider 不在注册表、模型不在 provider 目录，
  都能装载成功，直到**那个任务**核验完、supervisor 环节真被调用时才炸——那时该任务的
  worker 与 verifier 孩子调用已经付过费（`src/script.ts:1945`）。README 与 `docs/ARCHITECTURE.md` 当时都写「每个配置的路由
  都校验」，实测只校验四个，按「记忆不覆盖实测」以实测为准。
- **为什么不是 P3**：待办池里 P0/P1/P2 已清，P3-01/P3-02 是文案与面板详情行。这条属于
  「错误行为 + 假陈述」，按 P0 优先于 P3；它在池里原本就标着 `R5 PENDING`。
- **改动**：`src/settings.ts`（`ROLE_ORDER` 补 `supervisor`，与 `src/report.ts` 的
  `ROLE_NAMES` 同序，常量注释写明两个循环共用它）；`test/config.spec.ts`（新用例
  「checks every routed role, the supervisor included」，五角色 × 好/坏 provider/坏模型）；
  `test/route-concurrency.spec.ts`（supervisor 的 2 条空 cap 出提示、有一条 cap 不出提示）；
  `README.md` / `README.zh-CN.md`（载入校验清单补 provider 与模型存在性并写明含 supervisor）；
  `docs/ARCHITECTURE.md`（all five routed roles, `supervisor` included）；
  `DECISIONS.md` D-075；`VALIDATION.md` Round 64；`CHANGELOG.md` 双语节。`lib/` 只重生成
  `settings.js`（+ 两个 map）。没有新增依赖、没有联网、没有碰任何 profile 或 `.github/`。
- **红→绿（`CONFIRMED`）**：修前探针五角色里 supervisor 两种错配置各 0 条 error、其余各 1 条
  （`probe-supervisor-route-RED.txt`）；只 stash `src/settings.ts` 跑两条 spec =
  **2 failed / 49 passed**（`red-spec-run.txt`），恢复后 **51 passed**（`green-spec-run.txt`）；
  修后探针五角色各 1 条（`probe-supervisor-route-GREEN.txt`）。
- **门禁（`CONFIRMED`）**：npm run ci exit 0 · 63 test files passed · 1155 tests passed（基线 `6ee2e68` 是 63 文件 / 1154 测试，本轮 +1 测试，
  无删除无 skip）；`tsc --noEmit` 0 error；oxlint 22 warnings / 0 errors；
  `npm run build` 连跑两次产物目录 `diff -r` 一致（幂等，`client bundle: 224525 bytes`）。
- **独立评审（R5）**：第一轮 fresh-context 子代理判 **FAIL**，四条全部是文档准确性问题
  （①「唯一在核验之后跑的角色」不成立——综合也在核验之后；②迁移建议「清空 supervisor 链 =
  继承 run 路由」是错的，空链 = 监督门不跑；③ README 的模型条件写成了不可能的形状，且漏掉
  「运行时无法判断时降级为警告」；④「一轮的最后一步」高估了——supervisor 按任务按 attempt）。
  逐条核对源码后已改：`src/settings.ts` 注释、`docs/ARCHITECTURE.md`、README 中英、
  `DECISIONS.md` D-075、`VALIDATION.md` Round 64、`STATE.md`、`CHANGELOG` 双语，并重建 `lib/`。
  第二轮评审结论见下方「Landed as」。
- **证据**：`.rsi/evidence/round-019/`（`baseline-git.txt`、`baseline-ci.txt`、
  `probe-supervisor-route*.txt`、`red-spec-run.txt`、`green-spec-run.txt`、`ci-post-fix.txt`、
  `lib-build-idempotence.txt`、`review-diff.txt`）。
- **未验证（`NOT_RUN`）**：在真实 profile 的 patch 里放一条错 supervisor 路由看装载被拒
  （操作者环境，本轮不碰）；真模型整轮。
- **发版**：patch `0.11.18`（用户可见修复：错配 supervisor 路由此前延迟到一轮末尾才失败）。
- **status:** OK

- **Landed as:** commit `3b131c418b9d89451a5a8567fcf9d9cb6addf18a`（15 文件 / +210 / −12），
  annotated tag `v0.11.18`（object `40be048ec0f5e7787f365ca9a4a5ee2ecd478f31`，peel
  `3b131c4`）；`git push origin main` 快进 `6ee2e68..3b131c4`，随后 `git push origin v0.11.18`。
  远端核对：`git ls-remote origin refs/heads/main refs/tags/v0.11.18` 与本地一致
  （`refs/heads/main` = `3b131c4`，`refs/tags/v0.11.18^{}` = `3b131c4`）；提交后
  `npm run verify:lib` = `lib/ at 3b131c4 is the build of src/ at 3b131c4 (149 files, byte-identical)`。
  远端 CI run `44465623532` = **success**；Release run `44465627146` = **success**，Release
  https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.11.18 已建（非 draft、非
  prerelease，asset `dsh-grok-workflow-0.11.18.tgz`，560685 B）。老标签未动（`v0.11.17` =
  `5fc3e1d`），无 force-push，无 npm 发布。
- **Review 结论：** R5 第 1 轮 FAIL（4 条文档准确性）→ 逐条核对源码后修复（`src/settings.ts`
  注释、README 中英、ARCHITECTURE、D-075、VALIDATION、STATE、CHANGELOG）→ 第 2 轮 **PASS**，
  并顺手改掉它留下的两处行级 nit（HANDOFF 措辞、`:2419`→`:2418`）。两次评审都是 fresh-context
  子代理，自行跑 `npx vitest run test/config.spec.ts test/route-concurrency.spec.ts`（51 passed）
  与 `npx tsc -p tsconfig.json --noEmit`（exit 0），并逐字节比对 `src/settings.ts` 与
  `lib/settings.js` 的注释块与数组。
- **工具缺陷（本轮发现，未修）**：`.rsi/tools/finish-round.py` 只在 `report` 正文里替换
  `{{CI}}` / `{{TAG}}`，不碰 `log` 字段。本轮 LOG 行因此一度留下 `{{TAG}}` 字面量，已就地
  改成 `v0.11.18`；round 14 / round 17 的同类占位符属于历史记录，不重写。下一轮若动
  `.rsi/tools/`，顺手把 `log` 也走同一套替换。

## Round 20 — 2026-11-19 — 诊断台账漏掉 `supervisor`（`CONFIRMED`，patch `0.11.19`）

- **主题**：`src/delivery/index.ts` 的 `machineLedger()` 只列四个角色，而
  `src/report.ts` 的 `renderReport()` 列五个（`ROLE_NAMES` 含 supervisor）——round 19
  在载入期修好了同一类遗漏（D-075），交付层的 durable copy 还漏着。有 supervisor
  链的 run 在台账里读成「无监督」。
- **为什么现在值得做**：P0（错误行为 + 假陈述）优先于 P3。载入校验修好后，配了
  supervisor 链的 run 能装载、能跑，但台账仍撒谎——修载入不修台账等于修了一半。
  同一位置还发现：旧分支 `rsi/round-8` 的 `644897b` 当年修过同一处（red 2 failed
  → green 14/14，含 `Synthesis:` 拆标签），但从未合入 `main`
  （`git merge-base --is-ancestor 644897b HEAD` 为空）。本轮只收角色修复 + parity
  守卫；`Synthesis:` 拆标签改的是用户可见行标签，独立成轮；`run.ts:141`
  `configRouteLabels` 四角色是 C1 hint 输入，也留给下一轮。
- **外部研究**：本轮无外部研究。候选是 DSH 上游的 route/delivery 约定，但一手来源
  （本仓源码 `src/report.ts:835`、`src/settings.ts:103`）已足够判定这是内部不一致，
  无需引用外部文档。`Synthesis:` 拆标签若独立成轮，需先查 carry-over 回解析
  （`src/carryover.ts`）是否认新标签，再定。
- **改动**：`src/delivery/index.ts`（角色表四改五，与 `ROLE_NAMES` / `ROLE_ORDER`
  同序 + 注释；`MACHINE_DETAIL` 的 `role=` 剥离正则补 `supervisor`）；
  `test/delivery.spec.ts`（新用例：supervisor 链具名 + 与 `renderReport` 同行逐行
  相等，另补 `renderReport` 进口）；`test/report.spec.ts`（既有链用例补一条
  supervisor 链断言）；`DECISIONS.md` D-076；`VALIDATION.md` Round 65；
  `CHANGELOG.md` 双语 `## [0.11.19]`；`package.json` + `package-lock.json` +
  两份 README + `docs/LOCAL-TESTING.md` → `0.11.19`；`lib/` 重建（delivery 三文件）。
- **红→绿（`CONFIRMED`）**：临时探针修前 `1 failed`
  （`AssertionError: expected '…Model routes: planner=inherit; worker=inherit;
  verifier=inherit; synthesizer=inherit' to contain 'supervisor=p1/m-sv'`，
  `.rsi/evidence/round-020/red-spec-run.txt`）；修后 4 文件 75 passed
  （`.rsi/evidence/round-020/green.txt`），临时探针已删，守卫留在
  `test/delivery.spec.ts`。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0 · **63 文件 / 1156 测试 PASS**
  （基线 `762becc` 改前 63/1155，+1，无删除无 skip；`.rsi/evidence/round-020/ci.txt`
  是改后初验，`ci-release.txt` 是 bump + changelog 后的发版门）；
  `tsc --noEmit` 0 error；oxlint 22 warnings / 0 errors；
  `npm run build` 连跑产物一致（幂等，`client bundle: 224525 bytes`）；
  `npm run verify:lib` = 149 files byte-identical（对 HEAD，工作树 lib 改动即本轮提交内容）。
- **独立审查（R5）**：fresh-context 子代理判 **PASS**（6 条：缺陷定位准、正则安全、
  无需新标签、parity 低误报、范围纪律、文档与代码一致）。零修回。
- **版本**：patch → `0.11.19`（诊断台账补漏，用户可见但无配置面/报告 schema 变化；
  不升 minor，更不碰 major / 1.0.0）。
- **未验证（`NOT_RUN`）**：真模型整轮（渲染层改动，Loader 路径由 `loader.spec.ts`
  覆盖）；GUI 点击；rrule 定时到点；tag 安装验证（本轮未做，下轮发版前若动安装面再补）。
- **status:** OK

- **Landed as:** commit `b38d23a` + annotated tag `v0.11.19` (object `a1f36c9`, peel = `b38d23a`).
  `git push origin main` fast-forward `762becc..b38d23a`; `git push origin v0.11.19` new tag;
  old tags untouched, no force-push, no npm publish. Evidence `.rsi/evidence/round-020/`.
  Remote CI run `44469902581` success; Release run `44469906522` success →
  https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.11.19
  with asset `dsh-grok-workflow-0.11.19.tgz`. Records follow-up commit `3019490`
  (STATE 99 lines / LOG row / ledger) pushed fast-forward.

## Round 21 — 2026-11-19 — C1 跨 run 路由提示漏掉 `supervisor`（`CONFIRMED`，未发版）

- **主题**：`src/run.ts` 的 `configRouteLabels()` 只摊平四个角色，而路由实际有五个。
  `roles.supervisor` 链因此从不进入 C1 跨 run 忙闲快照：另一个活跃 run 打满的
  supervisor 路由对下一次 run 不可见，它仍会往那条链里排 supervisor 调用，也不先避让
  备选路由。与 round 19（`ROLE_ORDER`）、round 20（诊断台账）同一遗漏类的第三处，
  round 20 的 LOG 已把它点名为「its own round」。
- **来源与归属**：改动与红/绿证据是 2026-11-19 17:04:54–17:05:02 由一个并发写入者
  留下的未提交工作（`M src/run.ts`、`M test/route-concurrency.spec.ts`、
  `?? .rsi/evidence/round-021/`），它没走完收尾就停了。清理脏树的这次任务把这段工作
  核实、重跑门禁后落地，没有重写它的证据，也没有替它编造结论。
- **改动**：`src/run.ts`（角色元组四改五，按 `src/report.ts` `ROLE_NAMES` /
  `src/settings.ts` `ROLE_ORDER` 的同一顺序 `planner, worker, verifier, supervisor,
  synthesizer`，注释写明漏掉 supervisor 的后果）；`test/route-concurrency.spec.ts`
  （新用例：五角色完整标签列表 `['plan-a', 'p1/m1', 'check-a', 'sup/watcher',
  'synth-a']`，顺序即报告顺序）；`CHANGELOG.md` `[Unreleased]` 双语一条 Fixed；
  `lib/` 用 `npm run build` 重建（`lib/run.js`、`run.js.map`、`run.d.ts`、
  `run.d.ts.map` 四个文件，无手工改动）。
- **红→绿（`CONFIRMED`）**：修前只加用例时 `test/route-concurrency.spec.ts`
  **1 failed / 14 passed**，`AssertionError` 显示实收少了 `"sup/watcher"`
  （`.rsi/evidence/round-021/red-spec-run.txt`）；修后同文件 **15 passed**
  （`green-spec-run.txt`）。本轮收工前用当前树复跑同文件仍 15 passed。
- **门禁（`CONFIRMED`，本树实跑）**：`npm run typecheck` exit 0（0 error）；
  `npm run ci` exit 0 · **63 文件 / 1157 测试 PASS**（`ci.txt` 是并发写入者的改后门，
  `ci-cleanup.txt` 是本次清理后的收尾门，两者数字一致）· oxlint 22 warnings / 0 errors；
  `npm run build` 连跑产物逐字节一致（`sha256sum -c` 全 OK，`build-twice.diff` 空）；
  `npm run verify:lib` = `lib/ at 3cd68eb is the build of src/ at 3cd68eb`
  （149 files byte-identical，`verify-lib.txt`）。
- **未验证（`NOT_RUN`）**：真模型整轮的跨 run 忙闲避让（提示只在脚本侧降权，需要两个
  真实并发 run）；GUI 里看提示落地；发版（本轮是开发提交，不动 `package.json` 版本、
  不建 tag、不建 Release、不发布 npm）。
- **status:** OK

## Round 22 — 2026-11-19 — checkpoint `durationMs` 按行数上限丢时长（`CONFIRMED`，未发版）

- **主题（P2，测试与可靠性缺口）**：`src/checkpoint/wiring.ts:786` 的 `snapshot()`
  用 `countCeiling`（1e6，行数上限）卡 `time.durationMs`，而读侧
  `schema.ts:624` 接受到 `msCeiling`。跑超 16 分 40 秒的 run（默认 60 分钟死线的
  run 全在此列）写成功但没有 `durationMs`——「跑了多久」这个唯一字段丢了。
- **为什么现在值得做**：P0 三处 supervisor 遗漏已在 rounds 19/20/21 收完，P1/P2
  待办清零，剩下 P3-UX 两条和池子里的 `P ·` 项。候选排序：① 本轮 `durationMs`
 （静默丢数据 + 读写不一致，有红探针实证）；② `Synthesis:` 双标签（改用户可见行
  标签，需先评估 carry-over 回解析影响——`carryover.ts` 无 `Synthesis` 依赖，
  `triage.ts:1227` 与 `delivery` 守卫认 `Synthesis:` 前缀，改标签要同步三处，
  风险高于收益，留给独立成轮）；③ P3-01/P3-02（纯文案，无行为变化，价值更低）。
  外部研究：无——一手来源（本仓 `wiring.ts:786` 与 `schema.ts:624`）已足够判定，
  无需外部文档。
- **改动**：`src/checkpoint/wiring.ts`（上限 `countCeiling` 改 `msCeiling` + 注释；
  「超限省略、永不截断」语义不变）；`test/checkpoint-wiring.spec.ts`（新增 48h
  用例）；`CHANGELOG.md` `[Unreleased]` 双语 Fixed；`DECISIONS.md` D-077；
  `VALIDATION.md` Round 67；`lib/` 重建（checkpoint wiring 三文件）。版本号未动
  （未发版，按 AGENTS.md 发版纪律：一次代码提交不等于公开发版）。
- **红→绿（`CONFIRMED`）**：临时探针修前 `1 failed`
  （`AssertionError: expected undefined to be 2000000`，
  `.rsi/evidence/round-022/red-spec-run.txt`）；修后 3 文件 69 passed
  （`green.txt`），探针已删，守卫留在 `checkpoint-wiring.spec.ts`。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0 · **63 文件 / 1158 测试 PASS**
  （基线 `2748e4a` 改前 63/1157，+1，无删除无 skip；`ci.txt`）；`tsc --noEmit`
  0 error；oxlint 22 warnings / 0 errors；`npm run build` 连跑一致（幂等）；
  `npm run verify:lib` 149 files byte-identical。
- **独立审查（R5）**：fresh-context 子代理判 **PASS**（5 条：上限选对、守卫有效、
  范围纪律、文档一致、无红旗）。零修回。
- **未验证（`NOT_RUN`）**：真实 16 分钟以上 run 的 checkpoint 回读；发版。
- **status:** OK

- **Landed as:** commit `6c8b0dc` — pushed `origin/main` fast-forward, no tag, no
  Release, no npm publish. Evidence `.rsi/evidence/round-022/`.

## Round 25 — 2026-11-20 — 自迭代默认模板改为仓库自己的轮次提示词（`CONFIRMED`，patch `0.12.1`）

- **主题**：自迭代心跳的内置默认模板。`DEFAULT_ITERATE_TEMPLATE` 原本是 12 行通用提示词，
  新档案武装出来的心跳不知道这个仓库怎么选题、怎么判一轮完成——等于把「该做什么」留给模型即兴。
  任务要求默认模板覆盖：双源选题（POOL 优先，其次 TODO/失败行、GitHub issue、论文）、
  每轮至少落地一项、小修不研究 / 大改必须 RESEARCH 且池内获批且不编造来源、R1–R6 执行、
  三重评审（自审 + `npm run ci` + `npm run verify:lib` + 复制档案真机）、四道刹车与禁区。
- **为什么不是「再加一份文档」**：文档只写建议，默认值才决定实际投递的提示词；所以文档成为
  真源，`DEFAULT_ITERATE_TEMPLATE` 与它逐字节相同，`test/iterate-template.spec.ts` 钉死。
  另一个可选方案是运行时读文件——投递的是 Schedule 提示词，不能依赖宿主工作目录，故拒绝。
- **改动**：新增 `docs/iterate-template.md`（模板 + 每节为何存在 + 三个读者）；
  `src/config.ts`（常量改为该文本，JSDoc 指向文档）；`src/client/index.js`（bundle 副本同步）；
  新增 `test/iterate-template.spec.ts`（文档↔常量逐字节、4000 上限、每个必需章节一条断言）；
  `test/loop-surface.spec.ts`（自迭代路由 `status` 用例；模板断言改读常量）；
  README 双语配置表指向文档；`CHANGELOG.md` `[Unreleased]` → `[0.12.1]` 双语 Changed 一条；
  `DECISIONS.md` D-082、`RESEARCH.md` A32、`VALIDATION.md` 新节；`lib/` 由 `npm run build` 重建。
- **门禁（`CONFIRMED`）**：`npm run ci` exit 0 = **68 文件 / 1227 测试 PASS**
  （基线 63 文件只增不减，新增 1 文件 7 例 + 路由 1 例），`tsc` 0 error，
  oxlint 24 warnings / 0 errors；提交后 `npm run verify:lib` =
  `lib/ at 23d3369 is the build of src/ at 23d3369`（153 files byte-identical）。
- **真机（`CONFIRMED`）**：复制档案 `loopfix-verify`（link 本树，`:3451`，实例已停）。
  `live-iterate.mjs` 用真实 bundle 的开关、真实 page fetch，档案模板为空白（回退路径真正走到）：
  开 → `RSI heartbeat` 行 3239 字符、与默认模板逐字节相同；关 → 只删自己那行，
  会话无 Schedule 残留、未误删他人行；二次开关同样干净。证据 `.rsi/evidence/round-025/`。
- **未验证（`NOT_RUN`）**：真实定时投递（D-066）；GUI 手动点击拍照。
- **status:** OK

- **Landed as:** commit `23d3369`，annotated tag `v0.12.1` 已推；远端 CI `44595376323`
  success（Node 22/24），Release `44595391505` success（`dsh-grok-workflow-0.12.1.tgz`）。
  旧标签未动、无 force-push、未发布 npm。

## Round 27 — 2026-11-20 — 检查点读侧把「载荷字节数」按行数上限卡死（`CONFIRMED`，patch `0.12.3`）

- **选题（R2）**：先把 `POOL.md` 与 `HEAD fd241c8` 逐条对表。六条被判「stale」的项已有代码
  证据（`records.ts` 全部 `redactError`、`history.ts` 先脱敏后截断、`answerLead` 走三段候选、
  R6/R9 随 `0.12.2` 落地、R10 随 `0.11.20` 落地），`R11` 仍成立（`gate.ts:611-644` 仍组合
  `relayText`）。仍能取的最高优先级「功能错误」类：检查点写入成功但读回 `invalid`。
- **缺陷**：`sealCheckpoint`（`src/checkpoint/schema.ts:451`）接受规范化载荷到 `maxBytes`
  （1,048,576），`writeCheckpoint`（`src/checkpoint/writer.ts:88`）对整文件再卡同一上限；
  读侧 `assertCheckpoint` 却把 `integrity.bytes` 卡在 `countCeiling`（1,000,000，行数上限，
  `schema.ts:859`）。载荷落在两者之间的检查点：封装、落盘都成功，读回即
  `CheckpointError('invalid', '… integrity.bytes must be between 1 and 1000000')`——续跑永远起不来。
- **改动**：`src/checkpoint/schema.ts` 一行上限（`countCeiling` → `maxBytes`）+ 说明注释；
  `test/checkpoint-schema.spec.ts` 新用例「reads back a payload the writer accepted above the
  row-count ceiling」（按最大宽度证据行把载荷顶过边界，再落盘、读回、验完整性），两个小助手
  函数（`evidenceSizedInput`、`payloadBytesForRows`/`rowsAboveRowCeiling`）。
- **实测边界**：一条最大宽度证据行 2,055 字节；481 行 → 1,001,015 字节（带内），503 行仍在
  文件上限内 → 带内至少 22 行宽，用例落中间而非刀尖。
- **门禁**：`npx vitest run test/checkpoint-schema.spec.ts -t "reads back a payload the writer
  accepted"` 修前 **1 failed**（`red-test.txt`）；修后整文件 **37 passed**（原 36，`test-green.txt`）；
  `npm run ci` exit 0 = **68 文件 / 1230 测试 PASS**、typecheck 0 错、oxlint 24w/0e（`ci.txt`）。
- **证据**：`.rsi/evidence/round-027/`（`test-red.txt`、`test-green.txt`、`ci.txt`、
  `verify-lib.txt`、`profile-check.txt`）。
- **未验证（`NOT_RUN`）**：真实定时投递（D-066）、GUI 手动点击截图。
- **建议版本**：patch → `0.12.3`（读侧拒绝语义修复，无新配置面、无 API 变化）。
- **status:** OK
- **Landed as:** commit `fd6a5ee`，annotated tag `v0.12.3`（对象 `0c66263`）已推；远端 CI
  `44647313571` success，Release `44647317251` success（`dsh-grok-workflow-0.12.3.tgz`，
  597,237 B，sha256 `78e7e5f9…`）。旧标签未动、无 force-push、未发布 npm。
- **档案**：`~/.dsh/profiles/web` 升到 `#v0.12.3`，`lib/` 与标签 `diff -r` = 0，宿主 pid `154637`
  未重启；装好的产物自身跑通 1,001,051 B 载荷的落盘→读回（`.rsi/evidence/round-027/shipped-roundtrip.txt`）。

## Round 28 — 2026-11-20 — R11：取消终结不再套跑完的包装（`CONFIRMED`，patch `0.12.4`）

- **选题（R2）**：`POOL.md` 与树对表后最高优先级仍是 `R11 PENDING`
 （`cancelledText` 走 `relayText`，取消终结带成功前言+markers+折叠台账）。
  小修（单文件行为修正，无新配置面），免研究。
- **缺陷**：`src/gate.ts` `cancelledText` 把保留的部分报告经 `relayText` 组合，
  终结里出现 `finished and produced the result` 前言、`REPORT_BEGIN/END` 标记与
  `Failures:`/`Confirmed evidence:`/`Model routes:` 台账——取消读起来像跑完。
- **改动**：`cancelledText` 改走 `humanConclusion`（纯人话结论）+ 注释与文档同步；
  `test/gate-partial-head.spec.ts` +4 断言（无前言/无 markers/无台账）；
  `test/phase1-dialogue.spec.ts` 3 个旧断言随行为更新
  （`PARTIAL` 状态词、证据原文、未开始任务标题原文不再出现在终结里；
  行为断言 reject/保留一次/cancelled/无 COMPLETED 未动）。
- **红→绿（`CONFIRMED`）**：旧代码上新断言 **1 failed / 11 passed**；
  修后 `gate-partial-head` **12 passed**、`phase1-dialogue` **33 passed**。
- **门禁**：`npm run ci` exit 0 = **68 文件 / 1230 测试 PASS**，
  typecheck 0 错、oxlint 24w/0e；`npm run build` 后 `lib/gate.*` 随 `src/` 重建；
  `npm run verify:lib` 提交后复核。
- **证据**：`.rsi/evidence/round-028/`（`green-spec-run.txt`、`ci.txt`、`ci-release.txt`）。
- **未验证（`NOT_RUN`）**：真机 GUI 手动取消一次看终结；真实定时投递。
- **建议版本**：patch → `0.12.4`（取消终结文案修正，无新配置面、无 API 变化）。
- **status:** OK

## Round 30 — a base64-wrapped GnuPG private key reached reports verbatim

- **Theme:** `.rsi/POOL.md` redaction section, first non-DONE entry (`P · Base64-wrapped *PGP
  armor*`), the gap round 29 left behind when it closed the PEM half. Re-checked against
  `HEAD df6cf4b` before choosing it: `grep -c QR1AgUF src/redact.ts` → 0, so the rule still knew
  only the three PEM encodings. Not stale.
- **Defect:** `-----BEGIN PGP PRIVATE KEY BLOCK-----` base64'd (a keyring export, a key in a JSON
  field) contains no decoded banner, so every armor rule missed it and the whole block — with its
  wrapped continuation lines — reached reports, diagnostics and verifier/retry prompts.
- **Change:** `src/redact.ts` `base64-private-key` grows from three literals to nine: the `PRIVATE`
  and legacy `SECRET` GnuPG banner at all three base64 group alignments. The windows reach byte 17
  of the banner, where `PRI`/`SEC` separate from `PUB` — measured that a marker built from the
  shared `-----BEGIN PGP ` prefix matches a base64 *public* key blob, i.e. would over-redact public
  material. `docs/ARCHITECTURE.md` covered shapes + known gaps, `CHANGELOG.md` bilingual entry,
  README version pins, `lib/` rebuilt (rule table is rendered into the script at module load, so
  `lib/script.js` is byte-identical).
- **Files changed:** `src/redact.ts`, `test/redact.spec.ts`, `lib/redact.js` (+ maps),
  `package.json`, `package-lock.json`, `CHANGELOG.md`, `README.md`, `README.zh-CN.md`,
  `docs/ARCHITECTURE.md`, `docs/LOCAL-TESTING.md`, `docs/knowledge/{DECISIONS,RESEARCH,VALIDATION}.md`,
  `.rsi/POOL.md`.
- **Red/green:** pre-fix tree (`git archive df6cf4b` into `/tmp/rsi-old-030`, new spec copied in,
  `node_modules` symlinked): `npx vitest run test/redact.spec.ts -t "GnuPG"` → **2 failed | 35
  skipped**, the received value being the entire encoded block. Fixed tree → **37 passed**
  (baseline 35, +2). The negative case (base64 `CERTIFICATE`, base64 `PGP PUBLIC KEY BLOCK`, PNG)
  passes on both sides — a guard, not a probe.
- **Gates:** `npm run ci` exit 0 on the committed tree = **68 files / 1235 tests PASS**, typecheck
  0 errors, oxlint 24w/0e; `npm run verify:lib` = `lib/ at e7150ab is the build of src/ at e7150ab
  (153 files, byte-identical)`.
- **Release:** patch, warranted (user-visible security fix). `e7150ab` → annotated tag `v0.12.6`
  (object `167b475`); remote CI `44659057507` success, Release `44659061505` success with asset
  `dsh-grok-workflow-0.12.6.tgz` (600,316 B, uploaded).
- **Measured, not fixed:** a blob wrapped narrower than 24 columns splits the 20-character marker
  across lines and is not redacted at all (wraps 8–23 leave 180–184 of 184 encoded characters;
  24 is the first width that redacts). Pre-existing for PEM since round 29 — the marker width, not
  the PGP literals, sets the floor. Recorded in `RESEARCH.md` A35, `docs/ARCHITECTURE.md` known
  gaps and pooled as an M / low item with a suggested fix direction.
- **Evidence:** `.rsi/evidence/round-030/` (`red-old.txt`, `red-new.txt`, `ci.txt`, `ci-post.txt`,
  `verify-lib-post.txt`, `wrap-widths.txt`, `release.txt`, `schedule-row.txt`).
- **Unverified (`NOT_RUN`):** GUI click-through (pasting a base64 GnuPG key into the running plugin
  and reading the report) needs an authenticated browser session; real scheduled delivery of the
  heartbeat beyond 2026-11-20T10:01:50Z, because this subagent is refused `schedule_*`
  (`A delegated subagent cannot use scheduled tasks`) and the row's rrule ends there.
- **status:** OK

## Round 31 — the checkpoint comment claimed a payload ceiling 129 bytes too high

- **Theme:** `.rsi/POOL.md` checkpoint section, first non-DONE entry — the round-27 comment that said
  the refused band runs to 1,048,576, which is also the first carried uncertainty named in the 0.12.5
  handoff.
- **What was wrong, exactly:** the integrity record is not a fixed 129 bytes; it is
  `,"integrity":{"algorithm":"sha256","checksum":"<64 hex>","bytes":<n>}`, i.e. **122 bytes plus the
  decimal digits of `n`** — 126 for a 4,000-byte payload, 129 at 1,048,447. The writer refuses from
  1,048,448, so the prose was 129 bytes optimistic. The behaviour had been correct since round 27:
  this round is measurement plus a guard, not a behaviour fix.
- **Change:** `src/checkpoint/schema.ts` comment now states 1,048,447 with the arithmetic and names the
  guard; `test/checkpoint-schema.spec.ts` gained one test that measures the record from a real sealed
  file, solves for the ceiling, writes at it (file exactly 1,048,576 bytes, reads back intact) and one
  byte over (`too-large`), then reads `src/checkpoint/schema.ts` back and requires the comment to name
  the ceiling. `lib/` rebuilt. `D-087`, `A36`, VALIDATION Round 83.
- **Red/green:** pre-round tree (`git archive 949c1c1` + new spec, `/tmp/rsi-old-031`):
  `npx vitest run test/checkpoint-schema.spec.ts -t "bounds the payload"` → **1 failed | 37 skipped**
  at the comment assertion. Fixed tree → **38 passed** (baseline 37). `npm run ci` **68 files / 1236
  tests PASS**, typecheck 0, oxlint 24w/0e.
- **No release, on purpose:** comment and test only — no user-visible change, no config/API/report
  change, so no version bump, no tag, and no `[Unreleased]` entry (`docs/RELEASING.md` version rule).
  `lib/checkpoint/schema.js` is rebuilt anyway; `npm run verify:lib` after the commit is the check that
  the pair still matches.
- **Evidence:** `.rsi/evidence/round-031/` (`red-old.txt`, `red-new.txt`, `ci.txt`, `verify-lib-post.txt`).
- **Unverified (`NOT_RUN`):** nothing behavioural; the changed line is a comment and the added test
  runs offline against real writer calls.
- **status:** OK

## Round 32 — 2026-11-20 — 删除零生产调用者的面板投影模块（`CONFIRMED`）

- **选题（R2）**：POOL `Open questions` 唯一 H 项——`src/panel.ts` 无生产导入者。
  先证实后动手：`src/` 零 import、`src/index.ts` 不导出、`src/client/index.js` 不用；
  唯一引用是 `test/panel.spec.ts` + `test/gui-fold.ts` 的类型 import。
  活面板走 `progress-tab.ts` + bundle 渲染器（`test/panel-links.spec.ts` 钉住）。
  删减（M/medium，POOL 已批准"delete or wire"，选 delete），原因与迁移见 CHANGELOG。
- **改动**：删 `src/panel.ts`（286 行）+ `test/panel.spec.ts`（557 行）；
  `test/gui-fold.ts` 自带 `PanelEvent` 类型（`test/progress.spec.ts` 仍用它，保留）。
- **红绿（`CONFIRMED`，本树实跑）**：删文件即红（死代码存在）；
  修后 `test/progress.spec.ts` **12 passed**；`npm run ci` exit 0 =
  **67 文件 / 1223 测试 PASS**（基线 68/1236，-13 例皆为所删模块的自有测试，
  无既有断言被放宽）；typecheck 0 错；`npm run verify:lib` 153 files byte-identical。
- **证据**：`.rsi/evidence/round-032/`（`ci.txt`、`red-note.txt`）。
- **未验证（`NOT_RUN`）**：真机 GUI 手点；真实定时投递。
- **建议版本**：patch（删减死代码，用户可见行为不变；CHANGELOG 记 Removed 双语）。
- **status:** OK
