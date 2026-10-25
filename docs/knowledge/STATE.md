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
- Added deterministic tests: 6 files / 55 tests; all pass.
- Added a real DSH Loader composition test (real ToolRuntime, SystemPrompt,
  Loader, plugin artifact) with only the engine boundary faked; 2 tests pass.
- Built `lib/` and verified npm pack contents (27 files; local pack is about 38 kB after docs additions).
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
- **Local follow-up:** Restored the compact reference sections required for configuration, disable/uninstall, testing, security, and exact compatibility, in both languages. Added local SVG XML and pack checks.
- **Validation:** SVG XML parsing PASS for both diagrams; `npm pack --dry-run` lists both READMEs and 31 files. Detailed DSH runtime behavior is unchanged and covered by the existing 55-test suite.
- **Next action:** Keep `README.md` and `README.zh-CN.md` synchronized for future changes; do not remove the reference sections when editing the landing page.
