# Agent Handoff

## 2026-11-07 — v0.5.0/v0.5.1 收尾 + Round 24 诊断交接（release-closer，`release/0.5.1` 工作分支）

- **From:** release-closer · **To:** lead / next agent · **Base:** local `release/0.5.1` HEAD `720eeb6`
  (merge second-parent); `origin/main` = `5cc66be` (Merge PR #42); tag `v0.5.1` → `5cc66be`
  (far-end sha matches `origin/main`, `git ls-remote --tags origin` CONFIRMED); GitHub Release
  `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.5.1` published
  **2026-11-07T02:08:32Z**, asset `dsh-grok-workflow-0.5.1.tgz` **294,363 B**.
- **现状（CONFIRMED）：** `package.json` + `package-lock.json` = `0.5.1`；`CHANGELOG.md` 有双语
  `## [0.5.1] - 2026-11-07`（PR #41 / `45d721a`）；`npm run ci` PASS（typecheck 0 errors /
  lint 3 warnings 0 errors / vitest **35 files / 617 tests**；`git diff --exit-code -- lib/` 无 diff）。
- **本轮归档（CONFIRMED）：** `docs/knowledge/VALIDATION.md` +39 行 Round 24 只读诊断；
  `docs/knowledge/evidence/diag-ctx-compaction-2026-11-07.md`（已 chmod 644）+
  `docs/knowledge/evidence/diag-ctx-compaction-verify-metric.mjs`（已 chmod 644）入库；
  `docs/knowledge/evidence/v051-fast-context/`（13 文件）入库；`.gitignore` 追加
  `.v050-home/` `.v051-home/` `.v051-verify/` `out/`（本地隔离目录不入库）。
- **Round 24 结论（CONFIRMED，只读诊断，未改代码）：** session-3361cd6e 团队档即时回执
  （seq 2339，step 之外的 `assistant/message`）使 `tokenMeter.measure()` 每次在同处抛错，
  turn 4 之后自动压缩永久停摆，GUI 百分比照常 92–95%；`/compact` 实测 NOT_RUN（会写会话），
  Web GUI API 取数 BLOCKED（401，不读凭据）。修复方案留给用户决策，未执行。
- **诚实边界：** 未动 `main`、未打 tag、未重启 `:3090`（D-013；`:3090` 仍跑 `0.2.7`，
  reload/upgrade 待用户批准）；未删本地目录。CHANGELOG/package.json 版本号本轮未改。
- **Next action：** lead 确认本 commit 内容后由 release-closer `git push origin release/0.5.1`；
  用户决策 Round 24 修复方案（receipt 写时点 / token-meter 容忍孤儿 / 新会话 `instantReceipt: false`）。

## 2026-11-06 — 先回捞后提问（`history_first_no_reask`，v0.5 未发布，工作树内）

- **From:** workflow execution agent · **To:** next agent / verifier · **Base commit:** `ac28a41`
- **做了什么（`CONFIRMED`）：** `src/triage.ts` 新增 `recallFromPrior()`（去停用词的双字/词锚点 ≥2，
  或指针式引用「刚才那份/上面说的/the above」+ 有实质材料 ≥120 字符）、`RECALL_LIMITS`、
  `TriageInput.prior`、`DETAIL.recalled`、`recallPrompt()`、`recalledNote()`、`missingNote()`；
  `classifyTriage()` 里 4 处 ask 判定统一改为 `ambiguousVerdict()`——`prior` 为命中则返回
  `fast/recalled`，否则返回与改动前完全相同的 `ask`/`ambiguous-escalate`。
  `src/gate.ts` 新增 `memoryDocRoots()`（默认 `<cwd>/docs/knowledge`，`GROK_WORKFLOW_KNOWLEDGE_DIRS`
  可改）、`readMemoryDocs()`（只读、有界、过 `redactSecrets`、永不抛）、`collectRecallSources()`
  （会话上文 + 前序轮次 digest + 记忆文件，**剔除本轮消息**），并在 `produceAnswer()` 的 ask 档前接线：
  命中→快手档据材料作答；未命中且查过→提问后追加「先查后问，还缺 X」；无任何来源→提问逐字节不变。
- **测试（`CONFIRMED`）：** `npm run ci` **35 文件 / 617 测试 PASS**、`Found 3 warnings and 0 errors`
  （3 个既有 warning）；本轮新增 `test/triage-recall.spec.ts` **28 例**（命中/未命中/指针式/确定性/
  上限/脱敏/默认根/逐字节回归/`session-7e079b80` 形态回放成对用例）。证据：
  `docs/knowledge/evidence/history-first/{ci-summary,recall-spec,regression-suite}.txt`。
- **决策：** D-037（提问前先读；只读、有界、无新配置键；`ask:false` 时命中仍走快手档）。
- **现场发现（`CONFIRMED`，已修）：** 首版把本轮消息也算作"历史"（`relay` 在 `produceAnswer()` 前
  就 `commitClaimed()`），导致任何追问都"命中自己"——现在 `collectRecallSources(…, exclude)` 按
  `textOf(message) === request` 剔除，`before the fix` 用例守着它。
- **诚实边界：** 真机在线模型回放 `NOT_RUN`（本轮未起隔离 profile）；语义同义改写不会命中，
  会退化为提问；只读 `docs/knowledge/*.md`，不读 `archive.jsonl`。
- **Next action：** ①等 verifier 复核判据 1/2/4；②若要真机收敛，按 VALIDATION Round 21/22 的隔离
  home + `wb/cn:deepseek-v4.1-flash` 跑一次「先研究、后追问」两轮，确认追问不再要求重述；
  ③`:3090` 未热加载（D-013），不要自行重启。

## 2026-11-06 — PR #37 merged + v0.4.0 released (GitHub Release only, no npm)

- **From:** release operator (local) · **To:** next agent / operator
- **Base commit:** `e89daf9` (PR #37 feature on `feat/triage-history-hybrid`); **merge commit** `9438b3d` (PR #37 merge);
  **release commit** `708c315` (PR #38 merge); **tag** `v0.4.0` → `708c315`.
  `package.json` and `package-lock.json` both read `0.4.0`;
  `CHANGELOG.md` carries the bilingual `## [0.4.0] - 2026-11-06` section with a fresh empty
  `## [Unreleased]` above it; `docs/releases/RELEASE-NOTES-0.4.0.md` exists.
- **Feature (CONFIRMED):** history-aware follow-up (`FOLLOW_UP` + `historyNonEmpty`, `fast/followup`,
  never `chat`; `triageFollowupAsFast` opt-out) + hybrid classifier opt-in (`triageClassifier`
  `rules|hybrid`, default `rules`, one `runSingleCall` only for `ask`/ambiguous or `chat`+history,
  fallback to rules) + team-tier instant receipt (`appendInstantReceipt`) + deterministic
  `【人话结论】 verified/total` lead-in (`humanSummary`, zero extra calls).
  `npm run ci` 32 files / 545 tests PASS (incl. new `test/triage-followup.spec.ts` 5 cases);
  `npm run typecheck` clean; `npm run lint` 3 warnings / 0 errors (pre-existing);
  `npm run build` clean; `git diff --exit-code -- lib/` exit 0; `npm pack --dry-run` 56 files / 250.7 kB.
- **Merge of the feature (CONFIRMED):** `gh pr merge 37 --merge` after `gh pr checks 37` showed
  Node 22 `pass` / Node 24 `pass` (run `42074144133`); merge commit `9438b3d`;
  `origin/main:src/gate.ts` contains `triageClassifier === 'hybrid'` branch and `humanSummary` block.
- **Release (CONFIRMED):** branch `release/0.4.0` → PR #38 green on Node 22/24 (run `42075028625`)
  → merge `708c315`. `git tag v0.4.0 708c315` + `git push origin v0.4.0`. Release workflow run
  [42075318386](https://github.com/free6589/dsh-grok-workflow/actions/runs/42075318386) green end
  to end. GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.4.0` with
  `dsh-grok-workflow-0.4.0.tgz` (250,693 B, sha256 `e10802ca…`).
- **Tags:** `git ls-remote --tags origin` taken before and after; `diff` over the pre-existing
  tags = no changes. `v0.1.0`–`v0.3.0` untouched; only `refs/tags/v0.4.0` is new.
- **Decisions:** D-032 (history-aware follow-up) + D-033 (hybrid opt-in) + D-034 (receipt +
  deterministic summary, model-rewrite variant rejected after breaking 4 engine-count assertions).
- **Honest boundary:** `humanSummary` model-rewrite variant was built then reverted (extra engine
  call broke P0-2 ×3 + triage count ×1); shipped version is deterministic. Live multi-turn
  follow-up (`说人话` with history in one session) is covered by deterministic unit tests, not by
  one-shot headless (each headless turn is a fresh session). Isolated-profile live verification
  (Round 20): greeting `chat` + fast `30` PASS on `wb/cn:deepseek-v4.1-flash`; team tier ran and
  reported honestly (FAILED on an unresolvable `run.ts` path in an empty `/tmp` workspace — the
  gate/report path itself PASS, not a model-quality claim).
- **Next action (needs the operator, not an agent):** the live DSH service on `:3090` still runs
  `dsh-grok-workflow@0.2.7`; upgrading the `web` profile to `v0.4.0` (and any profile reload)
  still awaits explicit user approval (D-013). Do not restart the service on your own.

## 2026-11-03 — PR #35 merged + v0.3.0 released (GitHub Release only, no npm)

- **From:** release operator (local) · **To:** next agent / operator
- **Base commit:** `af0394a` (PR #35 merge on `main`); **release commit** `3f5ad0a` (PR #36 merge);
  **tag** `v0.3.0` → `3f5ad0a`. `package.json` and `package-lock.json` both read `0.3.0`;
  `CHANGELOG.md` carries the bilingual `## [0.3.0] - 2026-11-03` section with a fresh empty
  `## [Unreleased]` above it; `docs/releases/RELEASE-NOTES-0.3.0.md` exists.
- **Merge of the feature (CONFIRMED):** `gh pr merge 35 --merge` after `gh pr checks 35` showed
  Node 22 `pass` / Node 24 `pass` (run
  `https://github.com/free6589/dsh-grok-workflow/actions/runs/41659656218`); merge commit
  `af0394a`; `origin/main:src/config.ts` contains `repairSynthesisInconsistency`.
- **Release (CONFIRMED):** branch `release/0.3.0` → PR #36 (`https://github.com/free6589/dsh-grok-workflow/pull/36`)
  green on Node 22/24 (run `41664791714`) → merge `3f5ad0a`. `git tag v0.3.0 3f5ad0a` +
  `git push origin v0.3.0`. Release workflow run
  [41665410667](https://github.com/free6589/dsh-grok-workflow/actions/runs/41665410667) green end
  to end (tag↔`package.json` validation, typecheck, lint, build, `lib/` consistency, tests, package
  checks, bilingual changelog extraction, release creation). GitHub Release
  `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.3.0` with
  `dsh-grok-workflow-0.3.0.tgz` (246,493 B, sha256 `3a8bf81b…`).
- **Local checks on the release commit** (`f8cb09e`, identical tree to the merge `3f5ad0a`):
  `npm ci` PASS; `npm run typecheck` PASS; `npm run lint` 3 warnings / 0 errors (pre-existing
  baseline); `npm run build` PASS; `git diff --exit-code -- lib/` exit 0; `npm test` 31 files /
  540 tests PASS; `npm pack --dry-run` 56 files / 246.5 kB / `dsh-grok-workflow-0.3.0.tgz`.
- **Tags:** `git ls-remote --tags origin` taken before and after; `diff` over the pre-existing
  tags = no changes. `v0.1.0`–`v0.2.7` untouched; only `refs/tags/v0.3.0` is new.
- **Honest boundary:** real-machine coverage of the shipped change is **partial** (isolated
  instance alive with a bad config; boot warn line not captured; `/api/settings/describe` + page
  `401`, same as VALIDATION Round 16 item 8; settings-page render/save-back `NOT_RUN`).
- **Next action (needs the operator, not an agent):** the live DSH service on `:3090` still runs
  `dsh-grok-workflow@0.2.7`; the `web/cordis.patch.yml` `synthesis: model` line and the `0.3.0`
  upgrade both take effect only after a profile reload/`plugin add …#v0.3.0`, and **that reload
  still awaits explicit user approval (D-013)**. Do not restart the service on your own.

## 2026-11-03 — P0 web fix + PR #35 synthesis fallback (lead-reviewed, not merged)

- **From:** lead · **To:** next agent / operator
- **Base commit:** `1024b1c` (`origin/main`); work commit `7c4a05e` on `feat/synthesis-fallback`
  (local `main` reset back to `1024b1c` after review; work lives on the feature branch + PR).
- **P0 (CONFIRMED, operator machine):** `web/cordis.patch.yml` `grok-workflow.config` +1 line
  `synthesis: model` (line 1029, 4-space indent, same level as `grokDefault: on`).
  Backup: `~/dsh-profile-backups/cordis.patch.yml.20261103-222020-pre-synthesis-model`.
  `diff -u` = +1 line only; `grep -n -A16 "id: grok-workflow"` shows the line; `plugin list`
  still `dsh-grok-workflow@0.2.7`. No service restarted (D-013 rule 1); live `:3090`
  reload still needs operator approval.
- **P1–P3 (lead-verified, PR #35):** `https://github.com/free6589/dsh-grok-workflow/pull/35`
  closes #34. `repairSynthesisInconsistency(raw)` in `src/config.ts` (pure, only shapes
  (a)/(b)); `apply()` in `src/index.ts` load-time catch → `logger.warn`（含"已按…生效，
  请在设置页确认"）→ `resolveConfig(repaired)` must pass → activate with
  `synthesisRepaired: true` (`describeResolvedConfig` renders `synthesis=<mode> (repaired)`).
  Settings page (`src/client/index.js` `validate()`) red-blocks Save on the same two
  mismatches (`error.synthesisChainUnused`/`Missing`, bilingual). R-06 unchanged.
- **Tests run (lead, on `7c4a05e` before reset):** `npm run typecheck` PASS; `npm run lint`
  3 warnings 0 errors (pre-existing — base `1024b1c` also 3, `GROUPS_WITH_FIELDS`/`field`/
  `redact.ts:155` escape); `npx vitest run test/config-synthesis-fallback.spec.ts
  test/client.spec.ts test/config.spec.ts test/routing.spec.ts` 4 files / 93 PASS;
  `npm run ci` **31 files / 540 tests PASS**; `git diff --exit-code -- lib/` = 0.
  Secret grep over changed src/test = only benign `task-failed`/`id:` matches.
- **Local runtime (partial, honest boundary):** `DSH_HOME=/tmp/p1-verify-home`, profile `p1web`,
  `127.0.0.1:3297`, bad-config instances stayed alive, but boot stdout had only URL lines
  (warn/signature not captured); `/api/settings/describe` + page fetch = 401 (same known
  dead-end as Round 16 item 8). Settings-page render + save-back `NOT_RUN`.
- **Next action:** review/merge PR #35 (lead-verified, 1 commit ahead of `origin/main`);
  then plan release per `docs/RELEASING.md`; live `:3090` reload only with approval.

## 2026-11-03 — web profile upgraded 0.2.6 → 0.2.7 (operator machine)

- **From:** lead · **To:** next agent / operator
- **Base commit:** `16a11b7` (`origin/main`, `v0.2.7` tag; `package.json` `0.2.7`)
- **Action (CONFIRMED):** `dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.2.7`
  (pnpm Done in 8.8s); `dsh plugin --profile web list | grep grok` →
  `dsh-grok-workflow@0.2.7`; `why` → single copy under `dsh-profile-web (dependencies)`.
- **Note:** D-013 respected — running `:3090` service was not restarted/reconfigured by this
  task; new bundle code applies on next profile (re)load per DSH plugin semantics.
- **Next action:** none required for the upgrade itself; restart/reload of `:3090` only with
  operator approval if live verification is wanted.

## 2026-11-03 — v0.2.7 released (per-route concurrency + P0-5 first-message fix)

- **From:** lead · **To:** next agent / operator
- **Base commit:** `16a11b7` (`origin/main`, PR #33 merge = the v0.2.7 release commit; tag `v0.2.7`
  已打，Release 已建：`https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.2.7`，
  资产 `dsh-grok-workflow-0.2.7.tgz`)
- **What landed since v0.2.6:** P0-5 首条消息先发布再跑 (`d8cc6cc`)；按路由并发上限
  `maxInFlight` + 打满让路 (`1b5ad75`, PR #32, D-030)；发版准备 (`0e8a7e7`, PR #33)。
- **Install:** `dsh plugin --profile <p> add github:free6589/dsh-grok-workflow#v0.2.7`，装完重启该 profile。

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

## 2026-11-06 — 跨轮上下文延续（v0.5，工作树内，未提交）

- **做了什么**：`src/carryover.ts`（新）+ `src/script.ts`（四角色提示词注入 + 脚本侧上限）+
  `src/run.ts` / `src/gate.ts`（只改 `runTeam` 注入，提问判定零改动）/ `src/index.ts`（工具路径注入）；
  测试 `test/carryover.spec.ts`（21 例）+ `test/gate.spec.ts`（+2 例）；
  `CHANGELOG.md [Unreleased]` 中英条目；`docs/knowledge/{VALIDATION,RESEARCH,DECISIONS,STATE}.md`；
  证据 `docs/knowledge/evidence/carryover-e2e/`。
- **验证事实**：`npm test` 33 文件 / 568 测试 PASS；`npm run lint` 0 error（3 个既有 warning）；
  `lib/` 由 `npm test` 的 build 重建；真机两轮 PASS（Round 21），digest 在真子代理提示词里可见。
- **给下一个 agent 的三条硬约束**：
  1. 不要为了"跨轮"改 `src/records.ts` 或归档存储——那是独立任务；本轮只用读路径。
  2. `carryoverBounds` 复用 `historyTurns`/`historyChars`；若要新增配置键，必须同时改设置页
     投影断言（`test/settings-projection.spec.ts` 的封闭键清单）。
  3. 真机多轮验证不能靠"同一条命令里连发两条消息"（会被丢）；本轮的可行姿势是
     `--session-id` 续跑，且**首条消息必须先走一次 gate-off**（F1 未修）。
- **下一步**：提交 + 开 PR（`base:main`）；决定 F1 是否另立任务；`:3090` 升级仍需用户批准（D-013）。

## 2026-11-06 — 增量记忆归档：轮次结算即写入、单次会话可读回（v0.5，工作树内，未提交）

- **做了什么**：`src/memory/archive.ts` / `src/memory/recorder.ts` / `src/memory/cli.ts`（新）+
  `src/run.ts` 两处接线（引擎事件订阅、`finally` 轮次结算，另加 `runSingleCall` 成功路径的前台档
  归档）；测试 `test/memory-archive.spec.ts`（21 例）+ `vitest.config.ts`（测试期把
  `GROK_WORKFLOW_MEMORY_DIR` 指向 `tmpdir()`，避免单测写进操作者的 `$DSH_HOME`）；
  `CHANGELOG.md [Unreleased]` 中英条目；`docs/knowledge/{VALIDATION,RESEARCH,DECISIONS,STATE}.md`；
  证据 `docs/knowledge/evidence/incremental-archive/`。
- **验证事实**：`npm test` 34 文件 / 589 测试 PASS；`npx tsc -p tsconfig.json --noEmit` 干净；
  `npm run lint` 0 error（3 个既有 warning）；`lib/memory/*` 由 `npm run build` 重建；
  真机：团队档一轮结算即写入 4 条（3 agent + 1 round），另起一个会话用
  `node lib/memory/cli.js recent` 直接读到该轮结果（Round 22）。
- **给下一个 agent 的四条硬约束**：
  1. **不要**把归档做成配置开关或挂到 `showProgress`：记忆不是展示偏好（D-036）。
  2. **不要**改成"会话收尾再写"或"dispose 钩子写"——那正是用户点名的失败模式。
  3. 读子代理产出必须走 `ctx.get('sessions')` 且在 **`agent-start`** 捕获会话对象，结论在
     `tool-call.arguments`（JSON 字符串）里而不是 assistant 文本（RESEARCH A15，三条都实测过）。
  4. 真机验证前先确认闸门开着（`grokDefault: "on"`），否则跑一整轮也不会有任何归档。
- **下一步**：提交 + 开 PR（`base:main`）；`:3090` 升级仍需用户批准（D-013）；
  两进程并发追加压测、换引擎的子代理形状复测仍是 `NOT_RUN`。
