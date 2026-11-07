# Project State

Last updated: 2026-11-07 (local, release-closer)

## Repository

- Local path: `/home/fish/projects_mine/dsh-grok-workflow`
- Branch: `main`
- Git history: initial commit `beb55c6`; planner/recursion update `7b78db9`; remote evidence updates follow on `main`
- Remote: `origin` = https://github.com/free6589/dsh-grok-workflow.git (main pushed)
- Target GitHub repository: `https://github.com/free6589/dsh-grok-workflow`
- Target repository: **CONFIRMED public and reachable** after creation on 2026-10-25; it was confirmed absent immediately before creation.
- GitHub CLI: **CONFIRMED authenticated** as `free6589` with `repo` scope.

## Reference environments

- DSH checkout: `/home/fish/projects_mine/deepseek-harness` at `687f282e8625c6b8d11ff58211a90524be2e4317` (release `0.2.1-rc.2`).
- Installed DSH: `/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@deepseek-ai/dsh` version `0.2.1-rc.2`.
- Grok Build checkout: `/home/fish/dsh-tasks/grok-build` at `2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8`.

## Current phase

Last updated 2026-11-07 route-cap B+C1（`release/0.5.1` 工作树内，已合入未发布，见 D-038 / VALIDATION Round 25）。

`0.5.1` **released**. Base of this state: **`origin/main` = `5cc66be`** (Merge PR #42,
release `0.5.1`; local `release/0.5.1` HEAD `720eeb6` is the merged second-parent commit).

`v0.5.1` **is released** (tag `v0.5.1` → `5cc66be`, `git ls-remote --tags origin` CONFIRMED;
far-end sha matches `origin/main`; GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.5.1`
published **2026-11-07T02:08:32Z**, asset `dsh-grok-workflow-0.5.1.tgz` **294,363 B**).
`v0.5.0` **is released** (tag `v0.5.0` → `af82a34`). `package.json` + `package-lock.json` both
read `0.5.1`; `CHANGELOG.md` carries bilingual `## [0.5.1] - 2026-11-07` (PR #41 / `45d721a`:
quick-worker receives bounded conversation/carry-over context).

Authoritative numbers for this state (measured, not planned):

- `npm run ci` on `release/0.5.1` HEAD `720eeb6` (merge second-parent commit): **PASS** —
  typecheck 0 errors, lint **3 warnings / 0 errors** (pre-existing baseline), vitest
  **35 files / 617 tests PASS**; `git diff --exit-code -- lib/` = exit 0 (no diff).
- `v0.5.1` live check (Round 23, `CONFIRMED`): isolated profile `v051f`, model
  `wb/cn:deepseek-v4.1-flash`; session A follow-up answered `391` from the bounded context
  block without restatement; session B team round PASS then resume BLOCKED by the
  orphan-receipt defect (F3, same orphan class as Round 24). Evidence:
  `docs/knowledge/evidence/v051-fast-context/` (13 files).
- Round 24 (2026-11-07) is a **read-only diagnosis, no code change** (`CONFIRMED`):
  instant receipt written outside any step breaks `tokenMeter.measure()` from seq 2339 on,
  so auto-compaction never fires again after turn 4 while the GUI percentage keeps climbing
  92–95%. Full report `docs/knowledge/evidence/diag-ctx-compaction-2026-11-07.md` +
  replay script `docs/knowledge/evidence/diag-ctx-compaction-verify-metric.mjs`;
  `/compact` live test `NOT_RUN` (would mutate the session); Web GUI API fetch `BLOCKED`
  (endpoint 401, no credential read per policy). Fix left to user decision.
- Operator `web` profile on `:3090` still runs `dsh-grok-workflow@0.2.7` (`CONFIRMED`,
  unchanged); any reload/upgrade awaits explicit user approval (D-013), not done.

Prior releases (unchanged): `v0.4.0` → `708c315` (PR #38, Round 20: 32 files / 545 tests);
`v0.3.0` → `3f5ad0a`; `v0.2.7` → `16a11b7`. `0.4.0`-era detail below is history, not the
current baseline.

History (unchanged detail, kept for reference): `v0.4.0` was released (tag `v0.4.0` on `708c315`, Release workflow run
[42075318386](https://github.com/free6589/dsh-grok-workflow/actions/runs/42075318386) green,
GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.4.0`, asset
`dsh-grok-workflow-0.4.0.tgz` 250,693 B, sha256 `e10802ca…`). At that time `package.json` read `0.4.0` and `CHANGELOG.md` carried
`## [0.4.0] - 2026-11-06` (Round 20). Prior: `v0.3.0` **is released** (tag `v0.3.0` on `3f5ad0a`, Release green
[41665410667](https://github.com/free6589/dsh-grok-workflow/actions/runs/41665410667), asset
`dsh-grok-workflow-0.3.0.tgz` 246,493 B). Earlier: `v0.2.7` **is released** (tag `v0.2.7` on `16a11b7`,
GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.2.7`, asset
`dsh-grok-workflow-0.2.7.tgz`), after `v0.2.6` (`f6ec5f1`), `v0.2.5` (`bf853ac`),
`v0.2.4` (`7357e5e`), `v0.2.3` (`538d1ab`). Operator `web` profile on
`/home/fish/dsh-layerfs` runs `dsh-grok-workflow@0.2.7` (upgraded 2026-11-03
from `0.2.6` via tag-pinned `add`; `CONFIRMED` in `plugin list`/`why`).

Merged into `main` since `v0.2.3` (each `CONFIRMED` in `git log`):

| PR | Merge commit | What it landed |
| --- | --- | --- |
| #25 | `54083ea` | the 32,000-character objective limit |
| #24 | `334daf6` | task-grouped progress panel (per-task groups, locale-following copy) |
| #23 | `2e9c26a` | Phase 1 dialogue reliability (P0) |
| #26 | `a000983` | segmented planner-failure fallback (`src/shards.ts`); review close-out is Round 13 |
| #27 | `6806426` | `/grok` session switch (mode/command/gate, D-028/D-029) |
| #28 | `7357e5e` | release `0.2.4` (prepare: opt-in `/grok` switch, Phase 1, sharded fallback, task panel, 32000 limit, GUI notes; Round 15 memory) |
| #29 | `bf853ac` | novice settings page + relaxed limits (v6: `grokDefault` off, 50-route chains, single-locale UI) |
| #30 | `e6d434d` | settings visual polish R1–R3 (hierarchy, rhythm, details; live screenshots) |
| P0-5 | `d8cc6cc` | first user message published before the run (no longer hidden) |
| #32 | `1b5ad75` | per-route concurrency cap (`maxInFlight`) + overflow to next route (D-030) |
| #33 | `16a11b7` | release `0.2.7` (per-route concurrency + first-message fix) |
| #35 | `af0394a` | synthesis/synthesizer mismatch warns + repairs instead of deactivating (D-031; closes #34) |
| #36 | `3f5ad0a` | release `0.3.0` (bump + bilingual changelog + `RELEASE-NOTES-0.3.0.md`; Round 19) |
| #37 | `9438b3d` | history-aware follow-up + hybrid classifier + instant receipt/summary (D-032/D-033/D-034; Round 20) |
| #38 | `708c315` | release `0.4.0` (bump + bilingual changelog + `RELEASE-NOTES-0.4.0.md`; Round 20) |

So the `0.2.4` cut carries the `/grok` switch, the task-grouped progress panel, the
32,000-character objective limit and the segmented fallback — all four are on `main` and tagged.

Authoritative numbers for this state (measured, not planned):

- `npm test` on the `0.4.0` release commit `472d043` (identical tree to the merge `708c315`):
  **32 files / 545 tests PASS**, exit 0 (Round 20); the Release workflow re-ran the same suite on
  `v0.4.0` and passed (run `42075318386`, step `Test` success). `npm run ci` on `472d043` = PASS
  (typecheck clean, lint 3 warnings / 0 errors pre-existing baseline, build clean, `lib/` in sync).
- `npm run ci` — last full run before this release was `npm run ci` on `472d043` (Round 20):
  32 files / 545 tests PASS, exit 0; quoted `main` number is the CI-script figure, not `npm test` alone.
- `lib/` reproducible: `npm run build && git diff --exit-code -- lib/` = exit 0 on `472d043`
  (Round 20, client bundle 81,835 B).
- Real-instance evidence, newest first: `VALIDATION.md` Round 16 (v0.2.4 install matrix on
  `7357e5e`: 8 PASS + 2 NOT_RUN, item 7 anomaly on record, item 8 partial), Round 15 (real Web
  GUI on `6806426`: `/grok` switch + settings card, isolated instance), Round 14 (real-model E2E,
  two bugs + fixes), Round 13 (PR #26 close-out); `docs/knowledge/evidence/t42`…`t49` cover the
  0.2.2 era. `src`/`lib`/`test` are identical between `6806426` and `7357e5e` (`git diff --stat
  6806426 7357e5e -- src lib test` is empty), so Round 15's GUI result carries over to `v0.2.4`.
- **Quality claims are bounded by measurement**: Round 8's 1 `COMPLETED` in 12 reports was the
  verifier-decision defect (fixed in 0.2.2), and Round 15's GUI round plus Round 16's matrix ran
  `glm-5.3-flash`, not `deepseek-v4.1-flash`. None of these results may be generalised into "the
  workflow accepts what it did not accept", nor into a per-model quality claim.

## Where the open questions live

- `docs/knowledge/VALIDATION.md` — Rounds 1–20. Round 6 row (g) is annotated: stability 5/5,
  accepted results 0/5, root cause fixed in 0.2.2. Round 7 closed the notice/route/deadline
  questions; Round 8 answers the quality question and records the operational caveat that the
  Plugins-page switch — not `cordis.patch.yml` — is what says whether the gate is armed. Round 13
  closed the PR #26 review, Round 14 the real-model E2E, and **Round 15 the two GUI checks that had
  been `NOT_RUN` since Round 14** (`/grok` switchable in the real GUI, settings card rendering and
  saving). Round 17 is the P0-5 first-message root cause, Round 18 the synthesis-mismatch fix,
  Round 19 records the PR #35 merge plus the `0.3.0` release checks and workflow run, and
  Round 20 records the PR #37 feature (`follow-up`/`hybrid`/receipt/summary) plus the `0.4.0`
  release checks, workflow run and isolated-profile live verification.
- `docs/knowledge/DECISIONS.md` — D-016…D-019 (per-session caps, 60-minute default, plugin-owned
  deadline, notice downgrade). D-020 covers the verifier-decision rule.
- Deferred to 0.2.3: rendering a plugin-authored chat row (needs a DSH-side API), see D-019.

## What `0.2.0` changed (short form)

| Area | State |
|---|---|
| Mandatory entry (gate on `agent/pre-step`) | implemented and the default (`enforceGate: true`); one-shot delivery measured (E-38/E-41); **long-lived GUI half measured in Round 15 for `in-turn`** (real Web GUI, gate claims the message, report rendered in the same turn) — `relay`/`append` in a long-lived GUI remain NOT_RUN (NR-1) |
| Per-role model routing + ordered chains | implemented (L1 in the generated script, U-2); real-provider switching NOT_RUN (NR-6) |
| Failure taxonomy (class + category) | implemented, rendered in the answer; real provider texts NOT_RUN (NR-5) |
| Settings surface (live values, validation) | implemented; the generated page is identified by the runtime; **a live GUI edit is measured — t32 for the 21-key page, and Round 15 re-measured it on `6806426`** (card renders, `grokDefault` `off`→`on`, revision 0→1, survives reload, applies to a new session) — NR-7/NR-8 |
| Write-path isolation (U-4) | implemented (`src/paths.ts` + `mapLimitIsolated`); planner fill-rate NOT_RUN (NR-9) |
| Reliability and safety set | implemented (cancellation, deadline, concurrency, duplicates, recursion, context bounds, redaction, partial, unload/reload) |

## Completed

- External bundle (`src/`, `cordis.patch.yml`, `package.json`), `lib/` output,
  composed by a real DSH Loader.
- Bounded plan → parallel execute → independent verify → bounded retry →
  synthesis, with report validation, cancellation/deadline handling, active-run
  caps, credential redaction and a routing/delivery ledger.
- The gate: `agent/pre-step` interception, `in-turn`/`relay`/`append` delivery,
  per-message de-duplication, queue bounds, explicit refusal, live configuration.
- Configuration surface: 26 keys (+`showProgress` since t44, +`maxActiveRunsTotal` since t45,
  +`mode`, `triageAsk`, `triageModel` since t52),
  unknown-key rejection, `configVersion` gate,
  route shorthand migration, chain validation against the live runtime.
- Documentation set kept in step with the code: DESIGN (DD-1..DD-9b, A/E/R/NR
  ledgers), ROADMAP (phases, U ledger, D-009 decisions), ARCHITECTURE, ACCEPTANCE,
  LOCAL-TESTING, RELEASING, VALIDATION, this STATE, HANDOFF, DECISIONS.
- `0.1.0` was published (tag `v0.1.0` → `a7d5a62`, Release run `40182751006`).

## Remaining / optional

- A clean-DSH-profile install check in CI (currently a local scripted smoke).
- **NR-1, NR-7 and NR-8 are no longer open GUI questions** — Round 15 measured all three on a real
  Web GUI against `6806426` (isolated instance `127.0.0.1:3199`, real Chromium), and Round 16's
  install matrix (against `7357e5e`, identical `src`/`lib`/`test`) leaves the GUI halves exactly
  where Round 15 put them: items 9–10 are `NOT_RUN` in the matrix **because** Round 15 already
  covered settings-page render and web-chat behaviour on the same code. What remains, and
  what must be stated with the result: the browser was **offscreen (headless) Chromium** because the
  host has no X11 display, and the model was **`wb/cn:glm-5.3-flash`** because the suggested
  `wb/cn:deepseek-v4.1-flash` answered `400 model_unavailable` (per-model cooldown) that day. So the
  GUI halves are verified for `in-turn` delivery and for the plugin settings card; **`relay` /
  `append` delivery in a long-lived GUI session is still NOT_RUN** (NR-1's remaining half), and no per-model quality claim
  follows from either round. Round 16's own boundaries: item 7's one direct-answer anomaly is on
  record (Rerun + run4 + run5 = 3 consecutive EXIT 0 + reports after it); item 8's web-profile
  check stopped at HTTP `401 unauthorized` on `settings`/`describe` (composition + boot
  `CONFIRMED`, API namespace not confirmed).
- L2 host-level routing (registering `agent/request-error` consumers) stays out
  of scope for `0.2.0` by decision U-2.
- Client-side chain editor (settings UI with model dropdowns) is Phase 9 / U-6.

## Blockers

None.

## Next priority

**`0.5.1` is released; nothing is blocked on review.** PR #41 was merged (`45d721a`) and the
release went out as PR #42 (`5cc66be`) + tag `v0.5.1` (Round 23 live check PASS).
This close-out commit archives VALIDATION.md Round 24 (read-only diagnosis) + the
`v051-fast-context/` live evidence (13 files) + STATE/HANDOFF refresh. The one open action is outside
this repo: the live DSH service on `:3090` still runs `dsh-grok-workflow@0.2.7` and any
profile reload/upgrade (to `v0.5.1`) — **that reload awaits explicit user approval (D-013); it is not done**.

B组+C1 已合入工作树、未发布（2026-11-07，route-cap-closer 收尾）：设置页 `warn.emptyCap`
黄字提醒不拦 Save + `validateRoutes` notes + 单 run 作用域（ARCHITECTURE），C1 `busyRoutes`
run 级估计重排未试顺序 + `skippedBusy '(cross-run hint)'` 标记 + 报告分开渲染，C2 按 A16 不做；
`npm run ci` 35 文件 / 624 测试 PASS（Round 25）；随本轮 commit 进 `origin release/0.5.1`，
未 bump 版本、未打 tag、未发布 npm、未重启 live。D-038 / VALIDATION.md Round 25 为准。

Older candidates — none decided, all `HYPOTHESIS` until the captain picks:
`relay`/`append` delivery in a long-lived GUI session (NR-1's remaining half), item 8's
API-side auth/namespace confirmation, a quality matrix (not a 1-run claim), and the
client-side chain editor (Phase 9 / U-6).

Any future live matrix must follow [docs/knowledge/TESTING.md](TESTING.md) (isolated workspace, one
turn at a time; Round 16's isolation proof is in `.workflow-artifacts/matrix-024/EVIDENCE.md`).
`v0.2.0` was released on 2026-10-26, `v0.2.1` on 2026-10-27, `v0.2.2` and `v0.2.3` on 2026-10-28.

## Homepage redesign — merged

- **Status:** PR #16 merged to `main` as `ea3e8e31`; GitHub Actions runs `40178081351`, `40178539805`, and `40178848058` PASS on Node 22 and Node 24.
- **Scope:** English quick-start landing page, complete Simplified Chinese README, matching SVG workflow illustrations, and `README.zh-CN.md` in package files.
- **Local follow-up:** Restored the compact reference sections required for configuration, disable/uninstall, testing, security, and exact compatibility, in both languages. Corrected the install order so a missing headless profile is created before `plugin add`; running `--from-default-profile` afterward would remove the installed plugin. Added local SVG XML and pack checks.
- **Validation:** SVG XML parsing PASS for both diagrams; current `npm pack --dry-run` lists 33 files and both READMEs. Detailed DSH runtime behavior is unchanged and covered by the existing 56-test suite.
- **Next action:** Keep `README.md` and `README.zh-CN.md` synchronized for future changes; do not remove the reference sections when editing the landing page.


## Release/versioning rollout — merged and released

- **Status:** PR #18 merged as `7904e23`; `v0.1.0` tag points to `a7d5a62`; GitHub Release published on 2026-10-25.
- **Release workflow:** first run `40182588171` failed on a JavaScript regex escaping bug in the changelog extractor; fixed in `a7d5a62`. The tag was recreated at the fixed commit before any Release existed. Run `40182751006` passed and created the Release.
- **Artifact:** `dsh-grok-workflow-0.1.0.tgz` (61,281 bytes) attached to the GitHub Release; URL `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.1.0`. Tag-pinned install from `#v0.1.0` was smoke-tested in an isolated profile; config row present, real model call NOT_RUN.
- **Validation:** main CI `40182707932` PASS on Node 22/24; release workflow `40182751006` PASS on Node 22 only, including typecheck, lint, build, committed `lib/`, tests, package checks, and release creation.
- **Backup boundary:** Git history/Releases are version recovery, not independent disaster-recovery backup. Repository mirror and local DSH data backups remain a separate operational task.
- **Next action:** follow `docs/RELEASING.md` for future versions; do not move the published `v0.1.0` tag.

## Mandatory workflow, model routing, fallback — implemented

- **Status:** implemented and merged (phases 1–6); the design discussion below is
  history, not a plan.
- **Requirement:** every user message, including greetings and trivial
  questions, goes through the full workflow; the gate never silently falls back
  to ordinary direct answering (`enforceGate: true`, `gateRequired` for
  deployments that must fail instead of warn).
- **Capabilities delivered:** per-role model selection, ordered fallback chains
  per role, a switch policy (`switchOn`), failure classification with categories,
  a live settings surface, and write-path isolation for parallel tasks.
- **Persistent notes:** [WORKFLOW-DESIGN.md](WORKFLOW-DESIGN.md) (evidence ledger
  A/E/R + decisions DD + NOT_RUN ledger NR); decisions in
  [DECISIONS.md](DECISIONS.md) D-009/D-010/D-011.
- **Delivered after the first draft (2026-10-27, t32):** a plugin-owned settings page in
  the Web GUI — all 26 keys, per-role chain editing, validation, save applied to the next
  message. This closes NR-7 and NR-8 as *measured*; see
  [VALIDATION.md](VALIDATION.md) Round 3 and WORKFLOW-DESIGN.md DD-9c.
- **Activation (t33/t32, D-014):** installing the bundle puts the row into the composed
  graph, but the plugin only activates when a workflow provider is enabled — the web app
  ships `workflow-ptc` disabled. `docs/LOCAL-TESTING.md#enable` now carries the four
  checks that prove activation.
- **What is deliberately not delivered:** L2 host routing (U-2), model dropdowns in the
  chain editor (free-text provider/model fields today), and the long-lived GUI delivery
  measurement NR-1. 运维两条硬规则见 **D-013**（不重启在跑的 dsh 服务；队长只计划、实施交给子代理）。

## Overall roadmap — round 2 (phases 1–7), 2026-10-26

- **Roadmap:** [WORKFLOW-ROADMAP.md](WORKFLOW-ROADMAP.md) is the project-wide plan and phase order.
- **Design record:** [WORKFLOW-DESIGN.md](WORKFLOW-DESIGN.md) holds the confirmed
  requirements, the evidence ledger (A/E/R), the decisions (DD) and the NOT_RUN
  ledger (NR).
- **Decisions:** U-1..U-9 are answered in [DECISIONS.md](DECISIONS.md) **D-009**
  (user-approved 2026-10-26); the `0.2.0` breaking boundary is **D-011**; overnight
  execution and release discipline are **D-010**; the post-install strict-testing
  loop is **D-012**.
- **Version (t35, corrected in t37):** `0.2.1` — an **incremental** release on top of the published
  `0.2.0`; the changelog carries `## [0.2.0] - 2026-10-26` (unchanged history) and a separate
  `## [0.2.1] - 2026-10-27` section that only lists what is new. The evidence chain is stated as a
  **client-bundle invariant**, not as a tarball hash (a repack changes the tarball md5 whenever a
  shipped file such as `README`/`CHANGELOG` changes): `src/client/index.js` = `lib/client.js` =
  `package/lib/client.js` inside the tarball = the copy installed in the debug profile =
  **`68324a754a54ce36e6775618314592c5`** (`docs/knowledge/VALIDATION.md`, Round 3).
- **Known gap (t35):** the settings page validates the *shape* of a chain (bounds, missing model,
  duplicates, three-route limit), while *catalog membership* is enforced by the Host at load — a
  saved model the provider does not enumerate stops the row from activating and the boot line
  names it. A provider-aware model picker is not in 0.2.1.
- **Risk register (t35):** the settings page binds to whichever Loader row projects the plugin's
  fields, so a renamed row moves the page instead of losing it, and the console names the case
  when no row projects them (DD-9d). The entry point itself is the plugin manager's `plugins.item`
  slot — a Host-side contract, deliberately depended on and registered as a risk, not discovered
  later.
- **Release preparation:** the announcement for the current release lives in
  [docs/releases/RELEASE-NOTES-0.2.1.md](../releases/RELEASE-NOTES-0.2.1.md), and the text the
  release workflow publishes is the `## [0.2.1]` section of [CHANGELOG.md](../../CHANGELOG.md).
  The **published** `0.2.0` announcement is kept as
  [docs/releases/RELEASE-NOTES-0.2.0.md](../releases/RELEASE-NOTES-0.2.0.md) (tag `v0.2.0` on
  `f7a244c`, GitHub Release 2026-10-26T17:10:16Z, 42 files / 108,428 B).
- **Phase status:** 1 (environment/API audit), 2 (target design), 3–4 (role
  routing + ordered chains), 5 (configuration + settings surface), 6 (reliability
  and safety) and 7 (documentation, compatibility, release preparation) are
  implemented and `0.2.0` shipped on 2026-10-26; only the `0.2.1` tag and its GitHub Release
  remain, and they are created after the final acceptance pass.
- **Implementation boundary:** code changes go through the team's single-writer
  implementer with an independent review per batch; DSH core and global installs
  remain out of bounds.

## 2026-11-01 — PR #26 review close-out (`fix/fallback-shards`, work commit `68f3d15`, base `2e9c26a`)

- **Status:** the three codex P2 findings on the segmented planner-failure fallback are
  `CONFIRMED` and fixed (surrogate-adjusted segment count, JSON-escape aggregate false
  rejection, arbitrary-slice segments). Details and numbers: VALIDATION.md Round 13.
- **Shape:** `src/shards.ts` is now the only splitter — the generated script runs it, host
  validation re-derives the expected segments with it, and a fallback plan carrying anything
  else is rejected.
- **Verification (after rebasing onto `origin/main` `2e9c26a`):** `npm run ci` exit 0, **27 files /
  487 tests**; committed `lib/` matches a fresh build (`git diff --exit-code -- lib/` = 0). The
  rebase left `src/gate.ts`, `src/run.ts` and `src/triage.ts` (PR #23 P0 semantics) untouched.
- **Still open:** the generated script does not enforce `TASK_LIMITS.objectiveChars` itself; the
  host does (gate/tool/input). Not a regression, not fixed in this branch.

## 2026-11-02/03 — P0-5 首条消息不可见：根因 `CONFIRMED` + 修复（工作提交见 `git log`）

- **缺陷**：默认 `in-turn` 策略在 `agent/pre-step` 里 `await` 整个工作流之后才返回 `enter`，
  而 `AgentLoop.step()` 是被 claim 批次的唯一写入者 —— 运行期间会话里没有 `user/message`，
  GUI 只剩「正在分析请求 / 深度求索中」。真实会话 `session-d3d9375f-…`（qqbot，「机器猫人格」）
  的 transcript 51 条事件里 `user/message` = 0，`turnOutline.turns[0].prompt = ""`，
  `titleInput.count = 0`，首轮 1h41m 未关闭。
- **修复**：`src/gate.ts` `answerInTurn()` 在等待运行**之前**先 `commitClaimed()` 把原消息写进
  surface（同 id/source，保留 `rpcId`），并先取历史快照；运行结束后 `enter.messages` 只带报告
  （`withoutClaimed` 剔除已发布批次），`commitCancelled(..., alreadySurfaced)` 避免重复写。
- **验证**：新增回归测试（修复前 FAIL / 修复后 PASS，离线确定性）；`npm run ci` exit 0，
  **29 files / 522 tests**；`git diff --exit-code -- lib/` = 0；真机 Web GUI 前后对比截图见
  [VALIDATION.md](VALIDATION.md) Round 17 与 `docs/knowledge/evidence/first-message-visible/`。
- **契约变化（对后续 agent 重要）**：`in-turn` 的 `enter.messages` **不再**包含被 claim 的用户消息；
  P0-1 的准确表述改为"用户原话在会话 surface 里恰好一次"，写入者随策略不同而不同
  （`in-turn` 在等待前写、`relay`/`append` 在 reject 后写）。
- **未做**：`:3090` 实例未热加载（D-013）；`relay`/`append` 长驻 GUI 投递仍 `NOT_RUN`。

## 2026-11-03 — route-concurrency 每路由并发上限（`feat/route-concurrency`，未合并）

- **分支**：worktree `.worktrees/route-concurrency`，分支 `feat/route-concurrency`，基线
  `origin/main` `d8cc6cc`（v0.2.6 之后）。
- **设计（D-030）**：`ModelRoute.maxInFlight?`（1–64，留空=不限）；
  `HARD_LIMITS.routeInFlight={min:1,max:64}` 单一来源；打满=溢出到下一条未试路由，
  全满才排队等腾位（`queuedMs`）；溢出不算失败，不推进备用链、不耗重试、不动 `switchOn`；
  证据 `skippedBusy`/`queuedMs` 进 trail（`Route overflows …` 单独渲染）与台账。
- **验证**：`npm run ci` 全绿（待本轮最终跑）；回归 `test/route-concurrency.spec.ts`
  7 例（校验/溢出分流/排队峰值/预算不变/渲染与台账透传），`test/client.spec.ts`
  bounds parity + `error.badCap` 双语，`test/config.spec.ts` script clamp 钉；
  `git diff --exit-code -- lib/` 必须为 0（`src` 改必重建 `lib/`）。
- **交付**：push 到 `origin feat/route-concurrency`，开 PR `base:main`
  标题 `feat(routing): per-route concurrency with overflow to next route`。

## 2026-11-06 — 跨轮上下文延续：有界 digest 注入每一轮子代理（v0.5 未发布，工作树内）

- **状态**：实现 + 确定性测试完成（`npm test` **33 文件 / 568 测试 PASS**，`npm run lint`
  0 error / 3 个既有 warning），真机两轮实测 PASS（VALIDATION.md Round 21）。**未提交、未发布**。
- **做了什么**：新增 `src/carryover.ts`（从会话里插件自己写的报告编译轮次 → 有界结构化 digest，
  脱敏、双向预算、超限保留最新轮并写明丢弃数、无前序信息时返回空）；`src/script.ts`
  在 planner/worker/verifier/synthesizer 四个提示词里注入 `args.carryover` 并自带
  `CARRYOVER_MAX_CHARS` 夹取；`src/run.ts`/`src/gate.ts`（仅 `runTeam`）/`src/index.ts`（工具路径）
  各加一层注入。首轮不带该键，payload 与此前逐字节一致（`test/carryover.spec.ts` 钉住）。
- **测试**：`test/carryover.spec.ts` 21 例（解析/脱敏/降级/上限 6 档/轮数上限/代理对切割/
  真实脚本第 1 轮→第 2 轮提示词含研究结果/首轮不变/脚本 clamp/请求 payload）；
  `test/gate.spec.ts` 新增 2 例（真 Session + 真网关：第 2 轮 `args.carryover` 含第 1 轮证据、
  而 `args.objective` 不含；首轮无该键）。
- **真机**：隔离 home（`.carryover-e2e/home`，用后即删）+ 隔离工作区 `.carryover-e2e/work`，
  `headless` 模板 profile，模型 `wb/cn:deepseek-v4.1-flash`；第 1 轮 391 已验证，第 2 轮
  "再加 9" 直接答 `391 + 9 = 400`，未要求用户重述；3 个第 2 轮子代理日志出现 `PRIOR ROUNDS`，
  第 1 轮子代理 0 次（`docs/knowledge/evidence/carryover-e2e/`）。
- **新发现（未修，`CONFIRMED`）**：会话首条消息被 `in-turn` 在 `pre-step` 抢先写成
  `user/message` 后，`--session-id` 恢复报
  `SessionFormatError: system/message requires a protected first surface head`（F1）。
  与本次改动无关（P0-5 语义），已记入 VALIDATION Round 21 与 D-035。
- **未做**：`:3090` 未热加载（D-013）；未 bump 版本、未 tag、未发 npm；`relay`/`append` 长驻 GUI
  投递仍 `NOT_RUN`（NR-1 剩余半边）。

## 2026-11-06 — 增量记忆归档：轮次结算即写入、单次会话可读回（v0.5 未发布，工作树内）

- **状态**：实现 + 确定性测试完成（`npm test` **34 文件 / 589 测试 PASS**，`npm run lint`
  0 error / 3 个既有 warning），真机「团队档真跑 + 另一会话读回」实测 PASS（VALIDATION.md Round 22）。
  **未提交、未发布**。
- **做了什么**：新增 `src/memory/archive.ts`（只追加 JSONL 存储：`$DSH_HOME/memory/grok-workflow/
  archive.jsonl`，`GROK_WORKFLOW_MEMORY_DIR` 可改；`ARCHIVE_LIMITS` 全部有界；`appendArchiveEntry()`
  返回 `{written,id,reason}` 永不抛；`readArchive()` 新到旧 + 按 id 去重 + 4 MiB 尾部扫描），
  `src/memory/recorder.ts`（引擎事件 → `run:<runId>:agent:<seq>` 与 `run:<runId>` 条目；
  `agent-start` 捕获子会话、结算时读其 `ownEvents()`；子代理发现优先取结构化提交，退而取散文；
  `archiveRoundNow()` 给前台档用），`src/memory/cli.ts`（`node lib/memory/cli.js recent|path`，
  零依赖读回，不需要 DSH/插件在线）。`src/run.ts` 两处接线：引擎事件订阅与 `finally` 里的轮次
  结算（都**不**受 `showProgress` 控制），以及 `runSingleCall` 成功路径的前台档归档。
- **测试**：`test/memory-archive.spec.ts` 21 例——写入时刻（真引擎 harness 中途读只见 agent 条目
  且 `runSettled === false`，结束后出现 round 条目）、独立进程读回（`node --input-type=module -e`
  + 随包 CLI）、幂等/只追加（旧字节逐字节保留）、脱敏、写入失败不拖垮运行、子代理发现三形态
  （`plan: N task(s)` / 申报结果 / `verdict pass · N criteria`）、`agent-start` 捕获语义、
  会话服务不可达时的降级。
- **真机**：隔离 home `.workflow-artifacts/incr-archive-e2e/home`（`headless` 模板 + patch
  `grokDefault: "on"`）+ 隔离工作区 `…/work`，模型 `wb/cn:deepseek-v4.1-flash`；一轮两步骤任务
  结算后归档 4 条（3 agent + 1 round），随后**新起一个会话**跑 CLI 直接读到该轮条目与
  `verdict pass · 8 criterion/criteria checked`（`docs/knowledge/evidence/incremental-archive/`）。
- **新发现（`CONFIRMED`，见 RESEARCH A15）**：①`ctx.sessions` 在插件 fiber 上抛
  `cannot get property "sessions" without inject`，须用 `ctx.get('sessions')`；②引擎在
  `agent-end` 送达宿主前就 dispose 子会话，必须在 `agent-start` 捕获；③结构化子代理不产出
  assistant 文本，结论在 `tool-call.arguments`（JSON 字符串）；④`grokDefault` 默认 `off`，
  闸门没开时根本没有轮次可归档。
- **未做**：`:3090` 未热加载（D-013）；未 bump 版本、未 tag、未发 npm；两进程并发追加同一文件的
  压测 `NOT_RUN`；换引擎的子代理形状复测 `NOT_RUN`。

## 2026-11-06 — 先回捞后提问：ask 档提问前先读上文与磁盘记忆（v0.5 未发布，工作树内）

- **状态**：实现 + 确定性测试完成（`npm run ci` **35 文件 / 617 测试 PASS**，`Found 3 warnings and
  0 errors`，3 个均为既有 warning）；真机在线回放 `NOT_RUN`。**未提交、未发布**。
- **做了什么**：`src/triage.ts` 加 `recallFromPrior()`（双字/词锚点 ≥2，或指针式引用 + ≥120 字符实质
  材料）、`RECALL_LIMITS`、`TriageInput.prior`、`DETAIL.recalled`、`recallPrompt()`、`recalledNote()`、
  `missingNote()`，并把 4 处 ask 判定收敛成 `ambiguousVerdict()`（无 `prior` 时行为不变）；
  `src/gate.ts` 加 `memoryDocRoots()` / `readMemoryDocs()` / `collectRecallSources()` 并在
  `produceAnswer()` 的 ask 档前接线：命中→快手档据材料作答（回答注明出处），未命中且查过→提问后追加
  「先查后问，还缺 X」，无来源→提问逐字节不变。
- **测试**：新增 `test/triage-recall.spec.ts` 28 例（命中/未命中/指针式/确定性/摘录上限/脱敏/默认根目录
  与环境变量/ask 与 chat 逐字节回归/`session-7e079b80` 形态的回放成对用例/`readMemoryDocs` 降级）。
  全量套件从 34 文件 589 测试 → **35 文件 617 测试**，既有 triage/gate/followup 89 例全绿。
- **现场发现（`CONFIRMED`，已修）**：`relay` 在 `produceAnswer()` 之前就 `commitClaimed()`，首版召回把
  本轮消息读成"历史"→ 自命中；`collectRecallSources(…, exclude)` 修复。
- **决策**：D-037。**证据**：`docs/knowledge/evidence/history-first/`。
- **未做**：真机在线模型两轮回放、`:3090` 热加载（D-013）、版本号与发布。
