# Agent Handoff

## 2026-10-25 — Workflow planning round 1 (audits → synthesis → review → revision)

- **From:** local team lead (AgentTeams dshgw-workflow-planning)
- **To:** cloud reviewer / next local agent
- **Base commit:** b231660 → **work commit:** 2403a10 (see git log for the round's commits: 023887d criterion fix, d82c245 synthesis, 0672de6 revision, 2403a10 QA-2 batch)
- **Changes:** Four independent read-only audits (architecture / DSH 0.2.1-rc.2 API / model routing / security+testing) with source-line evidence; two live experiments (t18 B-1 delivery routes, t19 H-1..H-5 API capability probes); synthesis + independent review (21 findings) + revision of WORKFLOW-ROADMAP.md and WORKFLOW-DESIGN.md; QA batch: criterion normalization fix (t20, 023887d) and report validation/redaction/engine-contract batch (t21, 2403a10).
- **Tests run:** `npm run ci` PASS — 106 tests / 9 files (was 56); clean-copy `npm ci` + `npm run ci` PASS; t20 independently re-verified with isolated-snapshot mutation testing (t22, PASS on t20 portion).
- **Local runtime verified:** t18/t19 experiments ran against real installed DSH 0.2.1-rc.2 in isolated DSH_HOME profiles (enter/reject/relay/source.kind/plugin-record behaviors). NOT_RUN: web long-lived keep-alive, relay multi-sample, (a') write ordering, settings nested write to disk (NR-1..NR-4 in WORKFLOW-DESIGN).
- **Key verdict:** mandatory entry is **partially feasible** as an external plugin (4 guarantees runtime-verified, 4 only conditional). See WORKFLOW-ROADMAP §5.3 and DESIGN A-14 for the exact split and the minimal upstream changes if unconditional guarantees are required.
- **Blockers:** none technical. U-1..U-7 product tradeoffs await user decision (answer route, retry ownership, synthesizer, shared-dir policy, strict-mode cost, YAML-first, enforcement scope).
- **Next action:** user decides U-1..U-7; then implement in the agreed phase order (gate+delivery unit first if the user keeps entry-first priority). QA-2 independent re-review (t22b) runs in parallel.


## 2026-10-25 — First release v0.1.0

- **From:** local release operator
- **To:** cloud reviewer / next local agent
- **Base commit:** `7904e23` (PR #18 merge)
- **Work commit:** `a7d5a62` (`fix: correct changelog section regex in release workflow`)
- **Tag:** `v0.1.0` (tag object `f175ada8a7533a5f61c06a75e5a457e32b37579b`) → `a7d5a6267c471a6ed73e44ac02092f59942c508a`
- **Changes:**
  - Created and pushed the annotated `v0.1.0` tag after PR #18 merged and main CI passed.
  - First release run `40182588171` failed because the changelog-boundary regex had an extra backslash from YAML/heredoc escaping; fixed `a7d5a62`, then recreated the tag before any release existed.
  - Final release run `40182751006` created the GitHub Release and attached `dsh-grok-workflow-0.1.0.tgz`.
- **Tests run:** release workflow `40182751006` — PASS on Node 22 only, including typecheck, lint, build, `lib/` consistency, tests, package checks, and attachment. Main CI `40182707932` covered Node 22/24.
- **Test results:** PASS.
- **Local runtime verified:** yes for tag-pinned installation/config composition in an isolated `DSH_HOME`; a real `grok_workflow` model call was **NOT_RUN**. Release publication is confirmed by GitHub.
- **Blockers:** none.
- **Next action:** optionally smoke-test `dsh plugin ... add github:free6589/dsh-grok-workflow#v0.1.0` in an isolated profile; do not move the published tag.

## 2026-10-25 — Issue #17 fallback partial validation

- **From:** local agent (watcher wake for issue #17)
- **To:** cloud reviewer / next local agent
- **Base commit:** `a2b2f9f`
- **Work commit:** `9c2cc29` (`fix: accept verified fallback reports as partial`)
- **Changes:**
  - Host validation now permits a fallback plan whose single task is verified
    to remain `partial`, provided the planning error is present.
  - Non-fallback `partial` still requires both verified and failed tasks;
    fallback plans can never be `completed`; `partial` still requires at least
    one verified task.
  - Added a host-validation regression test using the real generated fallback
    report, plus the existing orchestrator coverage.
- **Tests run:**
  - `npx vitest run test/orchestrator.spec.ts` — PASS, 17 tests.
  - `npm run ci` — PASS, 6 files / 56 tests.
  - `git diff --exit-code -- lib/` — PASS after build.
- **Test results:** PASS.
- **Local runtime verified:** no; this is deterministic report validation
  logic, not a DSH lifecycle change.
- **Blockers:** none.
- **Next action:** cloud review `9c2cc29`; issue #17 remains open until review.

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
- **Local runtime verified:** yes after restart at `08:54:06Z` (PID `568469`);
  the previous live wake (`WATCH_WAKE_OK`, status 0) was on the prior script.
- **Blockers:** none.
- **Next action:** cloud review `e26e297`; PR #16 needs separate README review.

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


## 2026-10-25 — Cloud homepage redesign

- **From:** cloud
- **To:** local
- **Task:** Beginner-friendly bilingual repository homepage.
- **Base commit:** `99454d1a830ca42ed051d232de4104161357b581`.
- **Branch:** `docs/beginner-friendly-bilingual-homepage`.
- **Changes:** Replaced root `README.md` with a shorter English quick-start homepage; added `README.zh-CN.md`; added separate English and Chinese SVG workflow illustrations; updated `package.json` files allowlist to include the Chinese README; installation command and DSH/Node requirements are derived from current project files.
- **Tests:** GitHub Actions run `40178081351` PASS on Node 22/24: `npm ci`, typecheck, lint, build, `git diff --exit-code -- lib/`, `npm test`, and `npm pack --dry-run`. No real DSH runtime is claimed for this documentation-only change.
- **PR:** https://github.com/free6589/dsh-grok-workflow/pull/16 (merged as `ea3e8e31`).
- **Next action:** PR merged. Local follow-up restored the compact configuration, disable/uninstall, testing, security, and compatibility sections in both READMEs, and corrected the install order: create a missing headless profile before `plugin add`. Keep the English and Chinese pages synchronized.
