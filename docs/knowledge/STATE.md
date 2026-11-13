# Project State

Last updated: 2026-11-08 (**v0.7.0 released** — tag `v0.7.0` → `146dce7` on `main`; Release
`42474831253` green, asset `dsh-grok-workflow-0.7.0.tgz` 317,470 B. Round 37: merged `origin/main`
(PR #44) resolving the `src/run.ts` startup conflict by keeping main's deadline race **and** routing
both entry points through `teamWorkflowEngine`; 37 files / 660 tests PASS; `[Unreleased]` promoted to
`## [0.7.0] - 2026-11-08`; `package.json`+`package-lock.json` = `0.7.0`. Content of the release:
Round 36's B plan — `full` mode now opens with `【人话结论】` (completed/partial only), `showDiagnostics`
(default off) gates Model routes/Deadline/Route switches/overflows/Errors, `Uncertainties` stays
visible; and Round 35's fix — a saved role/model setting now actually reaches the run. Live `:3090`
still needs a restart to load any of it — user-reserved, `NOT_RUN`)

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

Last updated 2026-11-07 v0.6.0 released（`origin/main` = `1f9065d`，PR #43；tag `v0.6.0` 同 sha；见 VALIDATION Round 26 隔离验证）。

`0.6.0` **released**. Base of this state: **`origin/main` = `1f9065d`** (Merge PR #43,
release `0.6.0`; tag `v0.6.0` points at the same sha).

`v0.6.0` **is released** (tag `v0.6.0` → `1f9065d`, `git ls-remote --tags origin` CONFIRMED;
GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.6.0`
published **2026-11-07T10:09:17Z**, asset `dsh-grok-workflow-0.6.0.tgz` **299,146 B**,
Release workflow run `42362674837` green). `package.json` + `package-lock.json` both
read `0.6.0`; `CHANGELOG.md` carries bilingual `## [0.6.0] - 2026-11-07` (B-group empty-cap
heads-up + single-run scope + C1 cross-run hint; C2 ruled out per A16). Minor rationale:
C1 is backward-compatible (hint only reorders untried routes; solitary runs byte-identical),
so minor per RELEASING.md.

`v0.5.1` **is released** (tag `v0.5.1` → `5cc66be`, `git ls-remote --tags origin` CONFIRMED;
far-end sha matches `origin/main`; GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.5.1`
published **2026-11-07T02:08:32Z**, asset `dsh-grok-workflow-0.5.1.tgz` **294,363 B**).
`v0.5.0` **is released** (tag `v0.5.0` → `af82a34`). `package.json` + `package-lock.json` both
read `0.5.1`; `CHANGELOG.md` carries bilingual `## [0.5.1] - 2026-11-07` (PR #41 / `45d721a`:
quick-worker receives bounded conversation/carry-over context).

Authoritative numbers for this state (measured, not planned):

- `npm run ci` on `release/0.6.0` HEAD `ca040e4` (release-prep commit): **PASS** —
  typecheck 0 errors, lint **4 warnings / 0 errors** (3 pre-existing + 1 new unused `RoleName` import in `src/run.ts:29`, not fixed in this release), vitest
  **35 files / 624 tests PASS**; `git diff --exit-code -- lib/` = exit 0; build client bundle 84123 B; `npm pack --dry-run` 64 files / 299.1 kB. CI on PR #43 (run `42362505851`) Node 22 + 24 both pass.
- Round 26 (2026-11-07) is the **v0.6.0 isolated verification** (`CONFIRMED`): fresh profile `v060r`, models `wb/cn:deepseek-v4-pro` + `agnes-3.0-flash` (v4.1-flash was in per-model cooldown that day, stated not hidden); one gated team round with 2 tasks + 2-route worker chain (cap 1 each) → `Grok workflow: COMPLETED`, 2 verified, report carries `Route overflows (full lane yielded, not failures):` with `skipped full …` and both worker routes in `Model routes:`. Cross-run `(cross-run hint)` kind stays unit-covered (`test/route-concurrency.spec.ts`), no second concurrent live run staged. Evidence: `docs/knowledge/evidence/v060-route-cap/` (README + report-full + session-events 52 events).
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
- Operator `web` profile on `:3090` runs released `dsh-grok-workflow@0.6.0` (read-only check
  2026-11-08: installed 2026-11-07 21:54, `lib/team-engine.js` absent → **without** the
  fix_child_names build; corrects the earlier `0.2.7` note). Any deployment of the fix build
  plus profile reload awaits explicit user approval (D-013), not done.
  Round 33 (2026-11-08) sharpens this: the fix build is absent from the whole live home
  (`find /home/fish/dsh-layerfs -name team-engine.js` → 0), the live GUI is 401-guarded on
  loopback too (no loopback bypass), and the durable panel data of the current orchestrator
  run shows generic `任务团队 child 15–28` labels for all 14 newest children — including
  attempt 5's own executor child (28). Round 34 (attempt 6/6 final, 2026-11-08) re-extracted
  the 8 newest children: labels `任务团队 child 25–32`, zero descriptive; attempt 6's own
  children (identified via the task marker in their logs) are among them. `origin/main` has
  since advanced to `3b1d9a8` (Merge PR #44, a different task's P1 fix) and still does not
  contain `ad66118`, so `pnpm update` on the live profile still will not fetch the fix.

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

**`0.6.0` is released; nothing is blocked on review.** PR #43 was merged (`1f9065d`) and the
release went out as tag `v0.6.0` + GitHub Release (Round 26 isolated verification PASS).
The one open action is outside this repo: the live DSH service on `:3090` runs released
`dsh-grok-workflow@0.6.0` (2026-11-08 read-only check), which predates the fix_child_names build
(`ad66118` on `release/0.6.0`, unpublished); deploying that build awaits explicit user
approval (D-013); it is not done. Round 33 adds two deploy notes: the repo default branch is
`main` @ `1f9065d`, which lacks `ad66118`, so `pnpm update` of the live profile's
`github:` dependency will NOT fetch the fix — install the `ad66118` build explicitly
(HANDOFF); until then the live top panel keeps rendering generic `任务团队 child N` labels
for every new orchestrator run (durable descriptor data, Round 33).

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

## 2026-11-07 — 子代理顶栏显示名：诊断完成（当时判定 BLOCKED；**2026-11-08 已被第四次执行推翻并落地**，见下一节）

- **状态**：只读源码取证诊断，**无插件源码改动、无 DSH core 改动、未起隔离 profile、未碰 live `:3090`**。
  用户目标（顶栏每个子代理显示具体任务名、不出现 `任务团队 child N` / 提示词原文）在当前约束下不可达。
- **根因（`CONFIRMED`，行号即证据）**：插件已经传了标签
  （`src/script.ts:1188/1213/1324/1438` → `规划助手`/`执行`/`检查`/`汇总助手`），DSH 自己的工具文档也把
  `label` 写作 "(display)"（`dsh-tool-workflow/lib/index.js:143`）；但引擎运行时
  `packages/workflow/workflow-ptc/src/runtime.ts:183-188` 不把 `label` 转给 `startAgent`，
  宿主 `host.ts:200-205` 直接写死 `` `${this.meta.name} child ${callId}` ``，
  该值落成子会话首个 `subagent/descriptor`（`dsh-subagent/lib/index.js:1404,1800`）并被
  `foldSubagentDescriptor` 锁成不可改写（同文件 `:686-698`），GUI 顶栏主标签直接取它
  （`dsh-client-ui-subagent/lib/client.js:201`）。
- **否决的绕行**：追加描述符 / 自定义 `SubagentProvider` / 改 `meta.name` / 插件自建 `startActivation` / 改 core，
  逐条理由见 `DECISIONS.md` D-039 与 `VALIDATION.md` Round 27。
- **上游 ask（`NOT_RUN`）**：`runtime.ts` 转发 `opts.label` + `host.ts` 的 `childRequest()/startChild()`
  接 `label`（约 3 行），改完插件零改动即生效。
- **未做**：`CHANGELOG.md` 不加条目（无用户可见变更）；live `:3090` 版本查询 `NOT_RUN`
  （`GET /` → `401`，本会话无凭据）；真机 GUI 复验 `NOT_RUN`。
- **并发注意**：开工时工作树已有**另一任务**的改动（`src/client/index.js`、`lib/client.js`、
  `test/client.spec.ts`、未跟踪 `test/panel-links.spec.ts`），本轮未触碰、未提交。
- **第二次尝试补充（2026-11-07 晚，Round 28，`CONFIRMED`）**：结论**维持 BLOCKED**。上一轮的两项 `NOT_RUN`
  升级——①源码链逐条**独立重验**（本轮自己读的行号见 `VALIDATION.md` Round 28 表）；
  ②**隔离 profile 真机复现成功**：`out/childname-verify/`（profile `cnamer`，headless，模型
  v4-pro + agnes-3.0-flash，密钥仅布尔存在检查）跑一轮团队档 COMPLETED（2 任务 verified，6 个子代理），
  父会话 `tool-workflow/agent-start` 证明插件标签（`规划助手`/`执行`/`检查`）确实在传，
  而 6 个子会话首个 `subagent/descriptor` **全部**是 `"label":"任务团队 child N"`（N=1..6）——
  与用户截图逐字一致。证据：`docs/knowledge/evidence/childname-blocked/`。上游 ask 内容不变。
- **第三次执行补充（2026-11-08，Round 29，`CONFIRMED`）**：结论**维持 BLOCKED**。Round 27/28 链路第三次独立
  重验逐条一致；并新增**类型级证据**关闭末两个扩展点候选（每 run `subagentProvider` 覆盖 +
  `ctx.subagents.registerProvider`：continuable 子代理的 provider 参与只有 `ContinuableCreateSpec { seed? }`、
  无 label 字段；`WorkflowStartRequest` 全接口无 label；引擎 Config 无 label 模板；仅
  `PtcWorkflowEngine` 一个引擎实现）。core 检出 HEAD `687f282e` 与 installed 同为 `0.2.1-rc.2`，上游 ask
  仍必要。插件源码零改动。证据：`docs/knowledge/evidence/childname-blocked/extension-points-closure.md`；
  详见 `VALIDATION.md` Round 29 与 `DECISIONS.md` D-039 Addendum 2。

## 2026-11-08 — 子代理顶栏显示名：插件侧 twin 引擎落地，真机 PASS（fix_child_names 第四次执行，`CONFIRMED`）

- **状态**：实现 + 确定性测试 + 真机验证完成。`npm run ci` **37 文件 / 650 测试 PASS**
  （typecheck 0 错；lint 4 warning / 0 error，与 HEAD 基线一致）；隔离 profile `cfix`
  真机 PASS（Round 31）。**未提交（随本轮 commit）、未 bump 版本、未打 tag、未发布、
  live `:3090` 未动（仍 `0.2.7`，D-013）；DSH core 检出全程 clean（`687f282e`）**。
- **做了什么**：①`src/team-engine.ts`（新增）——用注入引擎**自己的构造函数**建私有 twin
  （static-inject 判别、WeakMap 按 ctx 缓存、`reflect.provide` 置空、引擎 config 镜像），
  twin 的 subagents 视图在 `startActivation` 处把 `spec.label` 重写为提示词首行
  （48 码点截断）；构造失败/非 PTC 引擎原样回退并 `logger.warn` 一次性。
  ②`src/script.ts`/`src/triage.ts`/`src/gate.ts`——每个子代理提示词**首行**改为描述性标题
  （`规划助手`/`<任务标题>`/`检查 · <任务标题>`/`汇总助手`/`快速应答`/`前台直答`/`前台任务`/`任务分类`），
  人设行保持第二行。③`src/run.ts`——两处 `ctx.workflowEngine.start` 改走
  `teamWorkflowEngine(ctx, logger)`。测试 `test/team-engine.spec.ts` 12 例 +
  `test/engine-harness.ts` 一处 additive 捕获。
- **关键机制（RESEARCH.md A18 / DECISIONS.md D-041）**：`PtcWorkflowEngine.start()` 在 start
  时读 `runCtx.subagents`，故插件可在交 run 前替换 subagents 视图——`startActivation` 的
  调用方变成插件，label 归调用方的契约站在插件这边。真机两次失败定位了 cordis 硬事实：
  代理 cordis ctx 会破坏 receiver 键控的服务解析；服务属性访问受 isolate guard，
  显式 `ctx.get(name)` 不受——twin 的服务从引擎自身 ctx 经 `ctx.get` 解析。
- **真机验证（Round 31）**：终验团队档 COMPLETED，6 个子会话首个 `subagent/descriptor`
  全部为描述性标签（规划助手 / 任务标题 / 检查 · 任务标题，含一条真实 agnes route-switch 重试），
  **0 处 `任务团队 child N`**；修复前同 patch 对照 3/3 为旧标签。GUI 主名判定 =
  `client.js:201` 源码链 + 描述符事件；浏览器点开 live `:3090` 验证 NOT_RUN（401，D-013）。
  证据：`docs/knowledge/evidence/childname-fix-2026-11-08/`。
- **未做**：live `:3090` 的浏览器复验（实例仍是旧插件 0.2.7，需重新部署后人工确认）；
  上游 3 行 ask 从"必要"降级为"可选简化"，未执行。
- **CHANGELOG**：`[Unreleased]` Fixed 增加英中双语条目"Task-team children are named after
  their work / 任务团队子代理按其工作命名"。
- **并发注意**：本节与 Round 30 的 fix_completed_links（D-040，已入库 `60cde95`）不冲突；
  本轮触碰的文件与其零交集（除 `CHANGELOG.md`/记忆文件的追加）。

## 2026-11-08 — 子代理顶栏显示名：GUI 浏览器验证 PASS（fix_child_names 验证轮，零源码改动，`CONFIRMED`）

- **状态**：Round 31 修复的浏览器观察轮完成（Round 32）。工作树基点 `ad66118`（`release/0.6.0`，
  与 origin 同步）；基线 `npm run ci` **37 文件 / 650 测试 PASS**；本轮零源码改动。
- **做了什么**：隔离 home `out/gui-verify/home/`（web 模板 profile `guiweb`，插件 dev 安装自
  工作树构建）起 Web 实例 `127.0.0.1:3199`（一次性 token 只走环境变量、不落盘、用后即杀），
  headless Chromium 两遍驱动：①真实 composer 键入团队档双计算任务 → `Grok workflow: COMPLETED`
  （6 子代理，含真实 agnes format-error 路由切换重试）；②展开库存 `Session hierarchy` 顶栏面板 →
  **6 个子代理主标签全部描述性**（`规划助手`/`计算并验算 919 + 27`/`检查 · 计算并验算 919 × 3` 等），
  **0 处 `任务团队 child N`**、0 处提示词原文作主标签；持久 `subagent/descriptor` 与面板逐字一致。
  证据：`evidence/childname-fix-2026-11-08/gui/`（README + 4 截图 + 3 JSON + 描述符摘录）。
- **记忆更正（只读核实）**：live web profile 的插件 = **released 0.6.0**（2026-11-07 21:54 安装，
  `lib/team-engine.js` 不存在 → 不含本修复；旧记"仍 0.2.7"过时，本文件与 VALIDATION 已更正）。
- **验收条款状态**：条款 1/2/3/5/6 满足；条款 4 的「DSH installation 加载 + ≥3 子代理工作流 +
  GUI 顶栏显示描述性名」三项在本机 `CONFIRMED`，唯一未达项 = 特指 live `:3090` 实例本身
  （仍跑不含修复的 released 0.6.0；部署需用户授权，D-013 步骤 5，本会话沙箱只可写工作树）。
- **未做**：live `:3090` 的修复部署与浏览器复验（用户授权动作）；上游 3 行 ask（可选，未执行）；
  无 CHANGELOG 变更（无新用户可见变更）。

## 2026-11-08 — 已完成子任务保持可点击：客户端重注册 workflow-run 节点（v0.6.0 工作树，未发布）

- **状态**：实现 + 确定性测试 + 真机验证完成（`npm run ci` **36 文件 / 638 测试 PASS**；
  隔离 profile `panelcheck` 真机 PASS，Round 30）。**未提交（随本轮 commit）、未 bump 版本、
  未打 tag、未发布、live `:3090` 未动（仍 `0.2.7`，D-013）**。
- **做了什么**：`src/client/index.js`（= `lib/client.js`）新增 `mountPanel`——经
  `conversation.chat.node` 键控槽位以 `key: 'workflow-run'`、`priority: -1` 重注册聊天任务
  列表渲染器；成员行可开性只看"子会话能否打开"（`panelMemberMode`），不看状态——运行中、
  已完成、失败、取消、中断全部是链接，点击即开子会话（`uiWorkspace.openSession`，可选注入）。
  测试 `test/panel-links.spec.ts` 14 例 + `test/client.spec.ts` 断言更新；
  `package.json` `test:unit` 收入新 spec。
- **硬约束（新发现，A17/D-040）**：键控槽位同键**同优先级**会让另一个注册者整条 boot fiber
  失败（首轮实测库存 `dsh-client-ui-workflow-run` "1 entry did not activate"、整页错误屏）；
  静态客户端路径无自动优先级分配，跨插件复用键控键**必须**显式 `priority: -1`。
- **真机验证（Round 30）**：隔离 home `.v070-home/`、web 模板 profile、headless Chromium；
  boot 干净后团队档真跑到 `completed`（6 子代理，含一条真实 agnes route-switch 的 failed 行），
  **6 行全部 `<button data-member-openable="true">`、0 行 inert**；点击已完成的 `规划助手` 行
  打开子会话视图（面包屑 `… / 任务团队 child 1`）。证据
  `docs/knowledge/evidence/panel-links-2026-11-08/`。
- **未做**：`relay`/`append` 形态的任务列表渲染（HYPOTHESIS 外推）、深色主题/移动端视觉
  （NOT_RUN）、CHANGELOG 之外的 README/ARCHITECTURE 更新（本轮认为无必要）。
- **并发注意**：工作树同时含 fix_child_names 任务的记忆条目（D-039/Round 27–29），本轮
  commit 一并入库（均为已完成的记录）；`src/` 其余文件本轮未触碰。

## 2026-11-13 — v0.8.0 已发布（PR #45 → 9c590f2；Tag v0.8.0 → 同 sha；Release 已建）

- **状态（`CONFIRMED`，lead 独立核验）**：`main = origin/main = 9c590f2`（ahead/behind 0/0）；
  `package.json` = `0.8.0`；Tag `v0.8.0` peel 到 `9c590f2`（本地与远端 `ls-remote` 一致）；
  PR #45 MERGED 2026-11-13T01:26:25Z（CI Node22+24 双绿）；Release published 2026-11-13T01:27:54Z
 （`dsh-grok-workflow-0.8.0.tgz`，Release workflow 绿）。Aggressive `git fsck` 悬空对象仅为历史
  dangling，无 WIP 丢失。
- **内容**：人话交付层（`src/delivery/` + `humanHead` 统一三态 + `showDiagnostics` 默认关）＋
  `synthesis: layered`（`SynthesisPolicy` 三值，报告 `mode` 仍两值，digest/guardrail/fallback 有界）＋
  checkpoint/resume（`src/checkpoint/` 原子写入校验 + `src/resume/` 校验恢复策略 + `src/run.ts` 接线，
  无用户可见面）。Watchdog 与 Evidence Collector 明确 `NOT_DONE`（工作树无实现，未伪装）。
- **安装验证**：隔离 profile `v080verify` 从 Tag 安装成功（`package.json` 0.8.0；headless 真跑
  `BLOCKED`——需模型调用，100s 无输出，不算通过）；`~/.dsh/profiles/web` 从 Tag 装到 0.8.0
 （`lib/delivery|checkpoint|resume` 齐，`config.js` 含 layered×10）。**`dsh-layerfs` 的 live
  `:3090`（pid 4003162，自 11-12 运行）未装、未重启**——`layerfs/profiles/web/node_modules/`
  下无此包、`pnpm-lock` 无记录；release-080 澄清其“live”仅指 `~/.dsh`，`layerfs` 生效记
  `UNVERIFIED`。重启仍是用户动作（D-013）。
- **测试诚实边界**：本版相关 12 spec / 198 PASS；全量 778 passed / 3 failed——`gate.spec` 2 失败在
  baseline `84e6894` 同样复现（预存/环境性），`human-output-contract` 全量时 1 flaky、单跑 9/9 过。
- **遗留**：工作树未跟踪（`.audit-scratch/`、`.tmp-largefiles/`、`RENDERING-STUDY.md`、
  `evidence/checkpoint-*`、`survey`）未入库；STATE/HANDOFF/VALIDATION 本轮未更新（写范围外）；
  `release/0.8.0` 分支未删；已发布 Tag 未动。
