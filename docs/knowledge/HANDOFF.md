# Agent Handoff

## 2026-10-25 — Issue #15 watcher credential-env allowlist

- **From:** local agent
- **To:** cloud reviewer / next local agent
- **Base commit:** `0476fa7` (`docs: record issue 14 redaction fix`)
- **Work commit:** `61d63b4` (`fix: restrict watcher credential env keys`)
- **Changes:**
  - Replaced the watcher's permissive env-file denylist with an explicit
    allowlist for provider credentials/configuration (`BIFROST_*`, `*_API_KEY`,
    `*_TOKEN`, `*_BASE_URL`, `*_API_VERSION`, and selected cloud settings).
  - Runtime/code-loading names such as `NODE_OPTIONS`, `NODE_PATH`,
    `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_*`, `PYTHONPATH`, `PYTHONHOME`,
    `PERL5OPT`, `RUBYOPT`, `BASH_ENV`, and `ENV` are denied even if a future
    pattern becomes broader.
  - Updated `--help` and `docs/ISSUE-WATCHER.md` to state that the file is
    parsed as `KEY=VALUE`, never sourced.
- **Tests run:**
  - `bash -n scripts/watch-issues.sh` — PASS.
  - `npx vitest run test/issue-watch.spec.ts` — PASS, 2 tests.
  - `npm run ci` — PASS, 6 files / 55 tests.
- **Test results:** PASS.
- **Local runtime verified:** watcher restart is pending; the prior live wake
  (`WATCH_WAKE_OK`, status 0) used the previous script.
- **Blockers:** none.
- **Next action:** restart the watcher, verify it stays healthy, then cloud
  review `61d63b4`.

## 2026-10-25 — Issue #14 credential redaction fix

- **From:** local agent
- **To:** cloud reviewer / next local agent
- **Base commit:** `99454d1a830ca42ed051d232de4104161357b581`
- **Work commit:** `24b6619` (`fix: redact non-HTTP URL userinfo and scoped tokens`); docs follow-up commit after it
- **Changes:**
  - Extended `src/redact.ts` URL userinfo matching from `http(s)` to any
    `scheme://` URI (covers `postgres`, `postgresql`, `mongodb+srv`, `redis`,
    etc., including empty-username `redis://:password@host`).
  - Added `glpat-` (GitLab) and `npm_` token patterns.
  - Mirrored the same patterns in the `redactPromptText` copy inside
    `src/script.ts`.
  - Added `redactSecrets`, `redactDeep`, and verifier/retry prompt regression
    tests with fake values.
- **Tests run:**
  - `npm run typecheck` — PASS.
  - `npm run lint` — PASS, 0 warnings/0 errors.
  - `npx vitest run test/redact.spec.ts test/orchestrator.spec.ts` — PASS,
    26 tests.
  - `npm run ci` — PASS, 6 files / 55 tests.
- **Test results:** PASS.
- **Local runtime verified:** no for this change; it is redaction logic covered
  by deterministic unit and prompt-rendering tests, not a DSH lifecycle change.
- **Blockers:** none.
- **Next action:** cloud review of `24b6619`; do not use real credentials in
  future regression vectors.

## 2026-10-25 — Implementation and local runtime verification

- **From:** local lead agent
- **To:** next local/cloud agent
- **Base commit:** none (empty repo; first push `beb55c6`)
- **Work commit:** remote `main` at final handoff (use `git rev-parse origin/main`)
- **Changes:**
  - Added the full external DSH bundle (`src/`, `lib/`, `cordis.patch.yml`,
    package manifest, README, docs).
  - Added deterministic and real-Loader tests.
  - Updated `STATE.md`, `VALIDATION.md`, `ACCEPTANCE.md`, `RESEARCH.md`.
- **Tests run:**
  - `npm run ci` — typecheck, lint, 51 tests pass.
  - `npm run test:loader` — 2 real Loader tests pass.
  - `npm pack --dry-run` — package contents verified.
  - Real DSH install from local checkout and from GitHub; `--dump-config`
    shows the bundle row in both profiles.
  - Real headless model smoke and real `grok_workflow` runs (see
    `VALIDATION.md`).
- **Test results:** PASS; GitHub Actions run `40176627051` passed Node 22/24, including watcher security tests, build-artifact consistency, and pack checks (51 tests).
- **Local runtime verified:** yes for plugin load, model route, completed
  caller-plan workflow, completed parallel timing workflow, completed
  planner-only workflow, fresh GitHub-installed workflow, a partial
  strict-failure workflow, and a live deadline cancellation.
- **Blockers:** none.
- **Next action:** independent re-review of the current head; optionally add a
  clean-profile install check to CI. Do not modify the active
  `/home/fish/dsh-layerfs` home; the verified install is isolated under the
  workspace `.dsh-home`.
