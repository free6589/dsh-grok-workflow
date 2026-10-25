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
- Added deterministic tests: 6 files / 50 tests; all pass.
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
  The suite now has 50 tests.

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


## Cloud PR work — Issue #11 (in progress)

- **Status:** PR #12 open; CI PASS on head `707c933` (run `40176002857`, Node 22 and Node 24). Branch `cloud/harden-issue-watcher-prompt-boundary`, based on `b6b649b`.
- **Scope:** Isolate issue watcher title/comment input as compact JSON and explicitly mark it as untrusted prompt data; add a deterministic hostile-comment regression case.
- **Overlap avoidance:** cloud owns `scripts/watch-issues.sh`, `test/issue-watch.spec.ts`, and the related issue-watcher notes for this PR. Local agent can continue the workspace-isolation work tracked by Issue #9.
- **Tests:** GitHub Actions run `40176002857` PASS on Node 22/24: `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --exit-code -- lib/`, `npm test`, and `npm pack --dry-run`.
- **Local DSH runtime:** NOT_RUN / not claimed.
- **Next action:** review PR #12; local agent continues real DSH runtime work and workspace-isolation (#9) investigation.
