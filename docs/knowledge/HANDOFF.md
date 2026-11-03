# Agent Handoff

## 2026-11-01 — v0.2.4 install matrix recorded: 8 PASS + 2 NOT_RUN (memory only)

- **From:** matrix-memory · **To:** lead
- **Base commit:** `7357e5e` (`origin/main`, PR #28 merge = the v0.2.4 release commit; tag `v0.2.4`
  已打，Release 已建：`https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.2.4`，
  资产 `dsh-grok-workflow-0.2.4.tgz`)
- **Work commit:** the docs-only commit carrying this section on `docs/matrix-024-memory`. No
  `src/`, `lib/` or `test/` file changed (`git diff --stat 7357e5e HEAD -- src lib test` is empty);
  this branch exists only to record the result.
- **Matrix result (read-only evidence, not committed):**
  `.workflow-artifacts/matrix-024/EVIDENCE.md` + `logs/` (item1~item8). Items 1–7 **PASS**,
  item 8 部分通过（composition + boot 确认；`settings`/`describe` 经 query-token + Bearer 均
  `401 unauthorized`，namespace 未确认），items 9–10 **NOT_RUN**（本环境无浏览器自动化；
  Round 15 已在真 GUI 上覆盖设置页与 web 聊天）。
- **Anomaly on record:** item 7 run3 首轮 EXIT 0 直接答 `apple, banana, cherry` 无报告
  (`logs/item7-run3.jsonl`，563 bytes)；同 prompt 重跑 `COMPLETED` verified
  (`logs/item7-run3-rerun.jsonl`，3667 bytes)；异常之后连续 3 个 EXIT 0 + 报告。样本保留，
  未掩盖。原文引用见 `VALIDATION.md` Round 16 §2。
- **Details:** `VALIDATION.md` Round 16（逐项 1–10 + 异常原文引用 + `EVIDENCE.md` 路径）；
  `STATE.md` 已对齐（Current phase = v0.2.4 已发布，Next priority = 下一版规划，
  NR-1/7/8 与 Round 15/16 对齐）。
- **Tests run this round:** no source test suite was executed (docs-only change). Read-only checks:
  `git status`, `git diff --stat`, secret grep over the three files (0 hits). `npm run ci` on
  `main` `7357e5e` is still `NOT_RUN` — the last full run (27 files / 487 tests) was on the
  PR #26 branch, see Round 13.
- **Next action:** merge `docs/matrix-024-memory` into `main`, then plan the next version scope
  (`relay`/`append` 投递、item 8 的 API 认证、质量矩阵、U-6 chain editor 候选）.

## 2026-11-01 — real Web GUI verified: `/grok` switch + settings card (memory only)

- **From:** local (gui-verify-memory) · **To:** lead / captain / next local agent
- **Base commit:** `6806426` (`origin/main`, PR #27 merge — the tree this verification ran against)
- **Work commit:** the docs-only commit carrying this section on `docs/gui-verify-memory`. No
  `src/`, `lib/` or `test/` file changed (`git diff --stat 6806426 HEAD -- src lib test` is empty);
  this branch exists only to record the result.
- **What is now `CONFIRMED`** (previously `NOT_RUN` since Round 14 §5): on an isolated instance
  (`DSH_HOME=.workflow-artifacts/gui-verify/dsh-home`, profile `gw-gui` from the stock `web`
  template, `127.0.0.1:3199`, real Chromium, live `:3090` untouched):
  1. **`/grok` is switchable in the real GUI** — default `off` gives a plain answer with no report;
     `/grok` gives the command row, the `3 subagents` badge and a full `GROK-WORKFLOW-REPORT`
     (`COMPLETED`, 1 verified, model routes, 3600000 ms deadline) in 1m41s; `/grok off` in the same
     session returns to plain chat in 11s. Command events, `plugin:grok-workflow/mode` events and
     the report text were each re-read from `session.v4.jsonl.zstd` this round.
  2. **The settings card renders and saves** — Plugins → `Grok workflow` card → generated page with
     `Grok mode default` / `grokDefault` `off | on`; edit → `Save (1)` → save takes `revision 0` to
     `revision 1`; a full page reload keeps `revision 1` / `on`; the write lands in the profile's
     `cordis.patch.yml` (md5 `d7830129…` → `1f628a0c…`) as `grokDefault: on`; and a **new** session
     with no `/grok` runs the workflow (fast lane, 1 subagent, 30s), so the value is functional.
- **Boundaries to repeat whenever this result is quoted:** the browser was **offscreen (headless)
  Chromium** (no X11 display on this host) and the model was **`wb/cn:glm-5.3-flash`** because the
  suggested `wb/cn:deepseek-v4.1-flash` returned `400 model_unavailable` (per-model cooldown) on
  2026-11-01. Delivery verified is the default **`in-turn`**; `relay`/`append` in a long-lived GUI
  session remain `NOT_RUN`. No quality/per-model claim follows. Five environment deviations are
  listed in `VALIDATION.md` Round 15 §4.
- **Evidence:** `.workflow-artifacts/gui-verify/README.md`, `shots/` (20 PNGs), `logs/`
  (`stepB2.log`, `stepC.log`, `stepD.log`, `stepE.log`, `dumpconfig-step*.txt`,
  `patch-before-settings.md5`), `scripts/` (the Playwright scripts). **These artifacts are not
  committed** — `.workflow-artifacts/` is untracked; only the paths and the quoted text are in the
  memory files.
- **Tests run this round:** no source test suite was executed (docs-only change); the verification
  evidence is the GUI run above. `npm run ci` on `main` `6806426` is still `NOT_RUN` — the last full
  run (27 files / 487 tests) was on the PR #26 branch, see Round 13.
- **Repository state:** `main` = `6806426` with PR **#23** (`2e9c26a`, Phase 1 dialogue reliability),
  **#24** (`334daf6`, task-grouped progress panel), **#25** (`54083ea`, 32,000-char objective
  limit), **#26** (`a000983`, segmented fallback) and **#27** (`6806426`, `/grok` switch) merged.
  `v0.2.3` is released (tag `538d1ab`); `package.json` still reads `0.2.3`.
- **Next action:** merge this docs branch, then prepare the **`0.2.4`** release from `main`
  (`npm run ci` + `git diff --exit-code -- lib/` on `main`, move `[Unreleased]` under
  `## [0.2.4]`, bump `package.json`/`package-lock.json` together). Do not tag, publish or restart
  the running service without the captain.

## 2026-11-01 — PR #26 review close-out (three fallback findings)

- **From:** local (pr26-closer) · **To:** lead / next local agent
- **Base commit:** `2e9c26a` (`origin/main` after PR #23; the branch was rebased onto it, originally
  cut from `334daf6`)
- **Work commit:** `68f3d15` on `fix/fallback-shards` (rebased: `6e902e0` → `bba5dc9`, `5cbccf2` → `68f3d15`)
- **Changed:** `src/shards.ts` (new: one splitter, rendered into the script and reused by host
  validation), `src/script.ts`, `src/report.ts`, `test/fallback-shards.spec.ts` (16 cases),
  `test/helpers.ts` (`taskFromPrompt`), `test/objective-limit.spec.ts`, `test/report.spec.ts`,
  `docs/ARCHITECTURE.md`, `CHANGELOG.md`, `lib/**`.
- **Tests:** `npm run ci` = exit 0, **27 files / 487 tests** (post-rebase, includes the PR #23 specs);
  `npm run build && git diff --exit-code -- lib/` = exit 0.
- **Not found:** the "1 medium test gap + 1 low boundary issue" an earlier review round was said to
  have recorded is **not** in `.workflow-artifacts/` (that directory holds the objective-limit round
  only: `baseline/`, `limit-core*`, `test-report.md`, `github-recon.md`, `pr-fallback-shards.md`), nor
  in `docs/knowledge/`, `.agent-teams/`, or `.session-stage/`. Closest but unconfirmed:
  `test-report.md` §9 items 1–3 (fallback sharding not yet implemented; the generated script has no
  `objectiveChars` enforcement point; upstream boundary tests incomplete).
- **Open, not fixed here:** the generated script still does not enforce `TASK_LIMITS.objectiveChars`
  itself (`src/script.ts` declares it, nothing reads it); the host enforces it at gate/tool/input, so
  bypassing the host a 32,001-character objective still yields a `partial` fallback.
- **Next action:** review `68f3d15` on `origin/fix/fallback-shards`, then decide on merging PR #26
  (merge is the lead's call). PR #26 is rebased on `2e9c26a` and no longer conflicts.

## 2026-10-27 — v0.2.0 released and installed on the operator machine

- **Released:** `v0.2.0` tag + GitHub Release (tgz 42 files / 108,428 B, sha256 recorded by GitHub). CI and Release workflows green. `v0.1.0` untouched.
- **Installed:** real profiles `headless` and `web` (layerfs root), locked to `#v0.2.0`. Web GUI service restarted with the plugin composed.
- **Test matrix:** 8/10 PASS on real installs with real models (VALIDATION.md "0.2.0 real-profile install matrix"); 2 NOT_RUN are GUI-interactive checks for the operator (settings page rendering in browser, web chat behavior).
- **Rollback:** `dsh plugin --profile <p> remove dsh-grok-workflow`; backups under `~/dsh-profile-backups/`.
- **Operator checklist (morning):** send a chat message in the GUI and confirm a workflow report (not a direct answer); open Settings and confirm the auto-generated `grok-workflow` page renders; judge in-turn latency comfort (adjust timeoutMs/maxTasks or request progress hints per U-9).
- **Next action:** fix loop per D-011 on any failure (patch bump, new tag, reinstall, retest); backlog: chain-editor UI (Phase 9), streaming progress, relay/append GUI evidence (NR-1 half).
- **Then (0.2.1):** the Web GUI settings page (plugin-owned browser bundle) and the documented
  activation prerequisite are prepared on `main`; `v0.2.1` is created by the captain after the
  acceptance pass. `v0.2.0` stays where it is.


## 2026-10-26 — Security observation (captain integration note)

- During t15's writesPaths experiment a workflow subagent inherited session tools including git and committed `docs/plan-a.md` as `e38ac8e` (`dsh-agent@localhost`) without authorization. Artifacts removed in the v0.2.0 release batch; history kept intact deliberately (audit trail).
- Risk: subagents of the workflow inherit the parent session's toolset — including VCS write access. Operators running the workflow in profiles with git-capable tools should treat this as a documented limitation (see WORKFLOW-DESIGN limits). Mitigation options for future versions: tool pre-execute deny list for subagents, or documented operator guidance.
- The plugin's own recursion guard blocks workflow re-entry in subagents, but it cannot (and does not) restrict which unrelated tools a workflow subagent may call.


## 2026-10-26 — Round 2 (phases 1–7): mandatory entry, routing, settings, reliability, release prep

- **From:** local team (AgentTeams dshgw-workflow-planning), implementer + independent reviewers
- **To:** captain / next local agent / independent reviewer
- **Base commit:** `bd1f261` (U-4 write-path isolation; phase 6 landed in `32a7f4a`)
- **Package version:** `0.2.0` — **released** as `v0.2.0` on 2026-10-26 (tag on `f7a244c`,
  GitHub Release 2026-10-26T17:10:16Z, 42 files / 108,428 B). This section was written before that
  tag existed; the version in the tree today is `0.2.1` (its tag is still pending).
- **Release-readiness artefacts:**
  - `docs/releases/RELEASE-NOTES-0.2.0.md` — the announcement as published, artifact table
    (`0.1.0`: 33 files / 61,281 B → `0.2.0`: 42 files / 108,428 B as released) and operator steps
    pointing at [RELEASING](../RELEASING.md). (`0.2.1` has its own notes file next to it.)
  - `scripts/smoke-settings-identity.mjs` — feeds the **built** plugin the descriptor produced by
    the DSH installation's own `dsh-settings` projection and prints the diagnostics line; the
    end-to-end check for the t31/F1 identity fix.
  - `test/settings-fixture.ts` + `test/settings-projection.spec.ts` — the settings descriptor is
    no longer hand-shaped: the runtime's projection rules are applied, the measured facts are
    pinned, and the transcription is cross-checked against the real module when discoverable.
- **What is now true:**
  - The gate claims every user message through `agent/pre-step` and answers it
    from a validated report in the same turn (`in-turn`, the default;
    `enforceGate: true` is the default, `gateRequired` turns a missing hook into a
    load error).
  - Per-role ordered fallback chains (`roles.{planner,worker,verifier,synthesizer}`,
    ≤3 routes), a `switchOn` whitelist, and routing recorded in the report.
  - Failure `class` + `category` (`infrastructure`/`quality`/`configuration`/
    `cancelled`/`unknown`) end to end, including a rendered `Failures:` line.
  - A live settings surface derived from the exported `Config`: unknown keys
    rejected with a suggestion, chains validated against the runtime's providers,
    edits apply to the next message with a last-good fallback.
  - Write-path isolation (U-4): `writesPaths` per task, conflict-aware pool,
    normalized lexical overlap, echoed in the report.
  - Documentation set synchronized: README (EN + zh), CHANGELOG (bilingual
    `0.2.0`), DESIGN (DD-1..DD-9b + NR ledger), ROADMAP (phases marked), STATE,
    DECISIONS (D-009..D-012), ARCHITECTURE, VALIDATION.
- **Tests run:** `npm run ci` — PASS: typecheck, lint 0/0, build, **264 tests / 18
  files**. `lib/` reproducible (identical md5 before/after rebuild). Clean-copy
  `npm ci` + `npm run ci` PASS. `npm pack` contents verified. Isolated-profile
  install of the packed tarball PASS.
- **Local runtime verified:** real headless one-shot run with a live model passes
  the delivery assertion (`scripts/e2e-headless-in-turn.sh`: PASS, `Grok workflow:
  COMPLETED`), and the explicit-refusal path was measured twice in t14.
- **Honest gaps (do not read these as done):** NR-1 (GUI/long-lived delivery
  half), NR-5 (real provider failure texts), NR-6 (real-provider route switching
  end to end), NR-7 (stock form rendering of `roles`), NR-8 (in-place settings
  `update()` against a live holder), NR-9 (planner fill-rate for `writesPaths`).
- **Blockers:** none technical. The remaining release steps need the captain:
  create `v0.2.0`, publish the GitHub Release, and never move `v0.1.0`.
- **Next action:** t16 final acceptance on the packed artifact, then tag + Release
  per `docs/RELEASING.md`.

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

## 2026-11-03 — P0-5（首条消息不可见）已修复，等待复核与发布决定

- **做了什么**：定位并修复"`in-turn` 在 `agent/pre-step` 里 await 整个工作流 → 运行期间
  transcript 里没有 `user/message`"（`src/gate.ts`），新增回归测试，`lib/` 重建，真机前后截图入库。
  细节与命令见 [VALIDATION.md](VALIDATION.md) Round 17；源码事实见 [RESEARCH.md](RESEARCH.md) A13。
- **契约变化，接手前务必读**：`in-turn` 的 `enter.messages` 现在**只带报告**，被 claim 的用户消息
  由网关在等待前写入 surface（`commitClaimed` + `withoutClaimed`）。任何新的 pre-step 监听器
  都不要既 `session.append('user/message', …)` 又把它放进 `enter.messages`（会渲染两份）。
- **下一步（按优先级）**：
  1. 复核本次改动（单文件 `src/gate.ts` + 两个测试文件 + 文档）。
  2. 决定是否在 :3090 实例上做一次热重载验证 —— 注意会中断该实例上正在跑的运行（D-013），
     队长拍板后再做；本轮的 AFTER 证据来自隔离实例（同版本 `0.2.1-rc.2`）。
  3. `relay` / `append` 在长驻 GUI 的投递仍是 `NOT_RUN`（NR-1 剩余半边）。
- **未提交/未同步**：无。本轮未向 `[COORDINATION]` Issue 发状态块（`NOT_RUN`）。

## 2026-11-03 — route-concurrency 每路由并发上限收尾（待提交/PR）

- **做了什么**：`ModelRoute.maxInFlight?` + `HARD_LIMITS.routeInFlight={min:1,max:64}`；
  `resolveChain` 整数范围校验；script `normalizeChain` 保留/clamp 上限，
  `routeInFlight` 计数 + waiter 队列，`callRole` 选有空位的首条路由、全满等待，
  `traceRoute` 带 `skippedBusy`/`queuedMs`；report 校验透传 + `Route overflows …`
  单独渲染；records 台账透传溢出证据；`describeResolvedConfig` 显示 `(cap N)`；
  设置页每行第三框 + 中英 `capLabel/capPlaceholder/capHint` + `error.badCap`；
  导出 `GROK_WORKFLOW_ROUTE_INFLIGHT_MIN/MAX`；ARCHITECTURE 溢出-vs-回退小节 +
  CHANGELOG Unreleased + D-030 + 新手指南并发上限注记。
- **测试**：新增 `test/route-concurrency.spec.ts` 7 例（校验拒绝/溢出分流/排队峰值/
  clamp 钉死/预算不变/渲染与台账透传）；`test/client.spec.ts` bounds parity +
  `error.badCap` 双语 + 上限校验回归钉；`test/config.spec.ts` script clamp 钉。
- **下一步**：`npm run build` 重建 `lib/` → `git diff --exit-code -- lib/` 为 0 →
  `npm run ci` 全绿 → commit/push `origin feat/route-concurrency` → 开 PR
  `base:main`（标题见 STATE）→ 向 lead 回报 FROM/TO/TASK/BASE_COMMIT/WORK_COMMIT/
  CHANGES/TESTS_RUN/TEST_RESULTS/PR/BLOCKERS/NEXT_ACTION。
