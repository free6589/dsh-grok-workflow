# Project State

Last updated: 2026-10-25 (local)

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

Implementation and remote acceptance are complete: deterministic tests, real
DSH profile installation from both local and GitHub sources, real-model
end-to-end runs (including a live deadline cancellation), remote Actions, and
the coordination Issue all passed. Only an optional clean-profile CI check
remains.

## Completed

- Created all required memory and architecture docs.
- Implemented the external bundle: `src/`, `cordis.patch.yml`, `package.json`.
- Implemented a static JS workflow executed by `ctx.workflowEngine`, with
  `agent()` fan-out through DSH subagents.
- Implemented bounded planning, execution, independent verification, bounded
  retry, status synthesis, cancellation/deadline handling, active-run caps,
  report validation, and credential redaction.
- Added deterministic tests: 6 files / 56 tests; all pass.
- Added a real DSH Loader composition test (real ToolRuntime, SystemPrompt,
  Loader, plugin artifact) with only the engine boundary faked; 2 tests pass.
- Built `lib/` and verified npm pack contents (33 files; local pack is about 62.9 kB after the bilingual docs and release-policy additions).
- Installed the plugin into an isolated real DSH profile
  (`DSH_HOME=.dsh-home`, profile `grok-workflow-dev`) with `dsh plugin`.
- Ran a real headless model smoke (`MODEL_OK`) and three real
  `grok_workflow` end-to-end workflows:
  - completed caller plan with 2/2 verified tasks;
  - completed parallel timing plan with 2/2 verified tasks and a measured
    overlap of 538 ms;
  - completed planner-only plan with 1/1 verified task;
  - a separate strict-failure run produced `partial` (1/2 verified) and the
    assistant explicitly did not claim success.
- Created/pushed the public repository, passed GitHub Actions on Node 22/24,
  and opened coordination Issue #1.
- Confirmed a real DSH deadline cancellation: 2 s timeout returned `FAILED`
  with a `Timeout` report and no leftover child process.
- Addressed the independent cloud review: reject oversized caller/planner
  task text instead of truncating it, redact compound environment-variable
  names, clear the deadline timer on startup rejection/unload, remove stale
  validation status blocks, and align `engines.dsh` with the exact peer set.
  The suite now has 55 tests.
- Fixed issue #14: redaction now covers non-HTTP URI userinfo (including
  database URLs and empty-username forms) and GitLab/npm token prefixes in
  both the host redactor and the prompt-facing mirror. Regression tests bring
  the suite to 55 tests.
- Fixed issue #15: `DSH_ENV_FILE` now exports only an explicit allowlist of
  provider credential/configuration keys; runtime/code-loading variables such
  as `NODE_OPTIONS`, `LD_PRELOAD`, `PYTHONPATH`, and `DYLD_*` are ignored.
  The watcher test covers the injection attempt and the help text says the
  file is parsed, not sourced.
- Fixed issue #17: host report validation now accepts a fallback plan whose
  single task is verified as `partial`, requires the planning error as
  provenance, and keeps `completed` forbidden for fallback plans. Non-fallback
  `partial` reports still require both verified and failed tasks. The generated
  fallback report is now exercised through `assertWorkflowReport()`; the suite
  has 6 files / 56 tests.

## Remaining / optional

- Add a clean-DSH-profile install test to CI (currently local only).
- A larger over-broad planner objective hit the outer 600 s test timeout; use
  realistic task scope. The default plugin deadline is 30 minutes.
- Child agents inherit all parent tools; only recursive `grok_workflow` calls
  are blocked. Use deployment tool policy for stricter isolation.

## Blockers

None.

## Next priority

Monitor coordination Issue #1; optionally add a clean-profile install check to
CI. Keep memory synchronized with any new commit.


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

## Active design discussion — mandatory workflow, model routing, fallback

- **Status:** brainstorming only; plugin implementation remains unchanged by this discussion.
- **Persistent notes:** [WORKFLOW-DESIGN.md](WORKFLOW-DESIGN.md).
- **Confirmed requirement:** every user message, including greetings and trivial questions, must go through the full workflow; no silent bypass to ordinary direct answering.
- **Desired capabilities still being designed:** per-role model selection, ordered model fallback chains, and a settings UI.
- **Working rule:** update `WORKFLOW-DESIGN.md` after each substantive discussion; mark user-confirmed decisions separately from proposals and technical unknowns.

## Overall roadmap for the next design phase

- **Roadmap:** [WORKFLOW-ROADMAP.md](WORKFLOW-ROADMAP.md) is the project-wide plan and phase order.
- **Detailed discussion:** [WORKFLOW-DESIGN.md](WORKFLOW-DESIGN.md) records confirmed requirements, proposals, and open questions.
- **Current phase:** Phase 0 — requirements and plan written; user review pending.
- **Recommended next phase:** Phase 1 — audit exact DSH `0.2.1-rc.2` interfaces and compatibility before choosing implementation details.
- **Implementation boundary:** discussion and documentation only until the user explicitly authorizes code changes.
