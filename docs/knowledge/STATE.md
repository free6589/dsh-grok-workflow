# Project State

Last updated: 2026-10-28 (local)

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

`0.2.2` release preparation (phase 8). `0.2.0` and `0.2.1` **are published** (`v0.2.0` on
`f7a244c`, GitHub Release 2026-10-26T17:10:16Z; `v0.2.1` on `cecc065`). `0.2.2` is the increment
on top of `v0.2.1`: the plugin-enforced deadline, model routes in every report, the per-session
run cap, the unload diagnose record, and the verifier-decision fix. The version is bumped in
`package.json`/`package-lock.json`, `CHANGELOG.md` carries `## [0.2.2] - 2026-10-28`, and both
READMEs point at `#v0.2.2`; **the tag and the GitHub Release are created by the captain after the
acceptance pass**, so this file must not claim `0.2.2` as published.

Authoritative numbers for this state (measured, not planned):

- `npm run ci` — typecheck, lint (0 warnings / 0 errors), build, **336 tests / 21 files**.
- `lib/` rebuilt and reproducible; the test instance's installed `lib/*.js` md5s equal the repo's
  build byte for byte (t47 `instance-facts.txt`, re-checked in t49).
- Real-instance evidence: `docs/knowledge/evidence/t42` (settings page, EN/ZH), `t44` (in-tree run
  records), `t45` (unload diagnosis, per-session caps), `t46` (7-item matrix on a second
  instance), `t47` (deadline/route/notice closure), `t49` (quality-failure root cause).
- **Quality claims are bounded by measurement**: before 0.2.2's verifier-decision fix, the test
  home produced 1 `COMPLETED` in 12 reports (8 failed for that defect, 3 were deliberate probe
  kills). See `VALIDATION.md` Round 8; do not describe the workflow as "accepting" work it has
  not accepted.

## Where the open questions live

- `docs/knowledge/VALIDATION.md` — Rounds 1–8. Round 6 row (g) is annotated: stability 5/5,
  accepted results 0/5, root cause fixed in 0.2.2. Round 7 closed the notice/route/deadline
  questions; Round 8 answers the quality question and records the operational caveat that the
  Plugins-page switch — not `cordis.patch.yml` — is what says whether the gate is armed.
- `docs/knowledge/DECISIONS.md` — D-016…D-019 (per-session caps, 60-minute default, plugin-owned
  deadline, notice downgrade). D-020 covers the verifier-decision rule.
- Deferred to 0.2.3: rendering a plugin-authored chat row (needs a DSH-side API), see D-019.

## What `0.2.0` changed (short form)

| Area | State |
|---|---|
| Mandatory entry (gate on `agent/pre-step`) | implemented and the default (`enforceGate: true`); one-shot delivery measured (E-38/E-41), GUI long-lived half NOT_RUN (NR-1) |
| Per-role model routing + ordered chains | implemented (L1 in the generated script, U-2); real-provider switching NOT_RUN (NR-6) |
| Failure taxonomy (class + category) | implemented, rendered in the answer; real provider texts NOT_RUN (NR-5) |
| Settings surface (live values, validation) | implemented; the generated page is identified by the runtime, a live GUI edit is NOT_RUN (NR-7/NR-8) |
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
- The GUI half of the delivery measurements (NR-1), the stock form rendering of
  `roles` (NR-7) and an in-place settings `update()` against a holder (NR-8) all
  need a Web GUI with this plugin loaded.
- L2 host-level routing (registering `agent/request-error` consumers) stays out
  of scope for `0.2.0` by decision U-2.
- Client-side chain editor (settings UI with model dropdowns) is Phase 9 / U-6.

## Blockers

None.

## Next priority

Create `v0.2.3` and its GitHub Release from the accepted commit (captain), then keep this file and
the changelog synchronized with `main`. t56 closed the last three classifier gaps (trailing 几, 顿号
lists, `并+回滚`, plus two live-found English/pointer misjudgements), so `0.2.3` is feature-complete
for the front desk; the only open item is the release itself. Any future live matrix must follow
[docs/knowledge/TESTING.md](TESTING.md) (isolated `/tmp` workspace, one turn at a time). `v0.2.0` was released on 2026-10-26, `v0.2.1` on
2026-10-27 and `v0.2.2` on 2026-10-28; no tag ever moves.

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
