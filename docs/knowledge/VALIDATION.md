# Validation Log

Real commands and results only. Do not add expected results here.

## Environment

- Date: 2026-10-25
- Host: local Linux workspace
- Node: `v26.8.1`
- npm: `11.19.0`
- pnpm: `12.4.2`
- DSH CLI: `0.2.1-rc.2`
- DSH checkout: `687f282e8625c6b8d11ff58211a90524be2e4317`
- Grok Build checkout: `2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8`

## Pre-implementation checks

| Check | Command | Result | Evidence |
|---|---|---|---|
| Local Git state | `git status --short --branch` | PASS | `## No commits yet on main` |
| Target repo absence | `gh repo view free6589/dsh-grok-workflow` | CONFIRMED absent | GraphQL "Could not resolve to a Repository" |
| Remote absence | `git ls-remote https://github.com/free6589/dsh-grok-workflow.git` | CONFIRMED absent | `Repository not found` |
| GitHub auth | `gh auth status` | PASS | account `free6589`, `repo` scope |
| DSH version | `dsh --version` | PASS | `0.2.1-rc.2` |

## Plugin tests

Not run yet.

## Real DSH installation

Not run yet.

## GitHub Actions

Not run yet.

## Implementation validation — 2026-10-25

### Deterministic test suite

Command:

```sh
npm run ci
```

Result: **PASS**

- `npm run typecheck`: PASS.
- `npm run lint`: PASS, 0 warnings/0 errors (`oxlint` over 14 files).
- `npm test`: PASS, 5 test files, 29 tests.
  - `test/orchestrator.spec.ts`: 9 tests (planner, caller plan, parallel pool,
    partial, failed, evidence rejection, retry bound, fallback, exact criteria).
  - `test/plugin-lifecycle.spec.ts`: 7 tests (registration, invalid input,
    max active runs, unload cancellation/disposal, deadline report).
  - `test/loader.spec.ts`: 2 tests (real DSH Loader + real tool registry;
    disabled row inertness; registration/unregistration and prompt section).
  - `test/input.spec.ts`: 6 tests.
  - `test/redact.spec.ts`: 5 tests.

Toolchain: Node `v26.8.1`, Vitest `4.1.12`, TypeScript `6.x`, DSH packages
`0.2.1-rc.2`, real `@deepseek-ai/cordis-plugin-loader` `1.0.6`.

### Package contents

Command:

```sh
npm --cache /tmp/npm-cache-dshgw pack --dry-run
```

Result: **PASS**. Tarball `dsh-grok-workflow-0.1.0.tgz`, 27 files, 32.4 kB
packed, includes `lib/index.js`, declarations, `cordis.patch.yml`, README,
LICENSE, and docs.

### Real DSH profile installation

Environment: isolated `DSH_HOME=/home/fish/projects_mine/dsh-grok-workflow/.dsh-home`,
profile `grok-workflow-dev`, based on the shipped `headless` template.

Command:

```sh
DSH_HOME=... dsh plugin --profile grok-workflow-dev add /home/fish/projects_mine/dsh-grok-workflow
```

Result: **PASS**. pnpm added `dsh-grok-workflow link:../../..`; profile
`dsh.profile.bundles` includes `dsh-grok-workflow`. `dsh --dump-config` shows:

```yaml
- id: grok-workflow
  name: dsh-grok-workflow
```

### Real model route smoke

Command shape (key loaded from the user's environment file without printing it):

```sh
set -a; . ~/.dsh/bifrost.env; set +a
DSH_HOME=... dsh --profile grok-workflow-dev --patch .dsh-home/gw-model.patch.yml headless "Reply with exactly: MODEL_OK"
```

Result: **PASS**. Output contained `MODEL_OK`; exit code 0. Model:
`bifrost-completions / wb/cn:deepseek-v4.1-flash` (local test override only; not
part of the plugin package).

### Real end-to-end grok_workflow run (caller plan)

Command shape:

```sh
set -a; . ~/.dsh/bifrost.env; set +a
DSH_HOME=... dsh --profile grok-workflow-dev --patch .dsh-home/gw-model.patch.yml headless --json "<prompt>"
```

Result: **PASS**.

- Session events include exactly one `tool_call` named `grok_workflow` and one
  `tool_result` with status `completed`.
- Report: `Grok workflow: COMPLETED`, plan `caller`, 2 tasks, 2 verified.
- `alpha` artifact `.dsh-home/e2e-alpha.txt` was created, 8 bytes, content
  `ALPHA_OK` with no trailing bytes.
- `beta` independently ran `expr 17 + 25`, stdout `42`, exit 0.
- Verifier evidence included actual `ls`, `od`, `wc`, Python `read_bytes`, and
  bash comparison outputs.
- Final assistant text reported `COMPLETED` with both task statuses verified.
- The audit trail (`--json`) is retained locally under `.dsh-home/` (ignored by Git).

## Pending real-runtime checks

- Real parallel timing run: see next update.
- Real partial/failure status path through a model: not run; deterministic tests
  cover the status logic.
- GitHub Actions: not run yet.

### Real end-to-end grok_workflow run (parallel timing, completed)

Command: same profile/model override as above, with two caller tasks that each
recorded epoch milliseconds, slept 4 s, and recorded the end time.

Result: **PASS**.

- `tool_result` status: `completed`; report `Grok workflow: COMPLETED`, plan
  `caller`, 2 tasks, 2 verified, one attempt each.
- `gamma2`: start `1792908315791`, end `1792908319793` → 4002 ms.
- `delta2`: start `1792908312327`, end `1792908316329` → 4002 ms.
- The two intervals overlap by **538 ms**, so the subtasks were not serialized.
  The difference in shell start time is model/agent startup latency, not
  sequential execution; both agent calls were already in flight under the
  bounded worker pool.
- Final assistant text reported `COMPLETED` with both tasks verified.

### Real end-to-end grok_workflow run (strict partial, not reported as success)

A separate real run with deliberately misaligned task text (`objective` mentioned
an unlisted `exit 0` requirement and an unverifiable tracked-file baseline) was
correctly rejected by the independent verifier:

- `tool_result` status: `completed` at the tool transport level, report status
  `PARTIAL`.
- `gamma`: failed after 2 attempts; verifier issues were surfaced.
- `delta`: verified after 2 attempts.
- The assistant's final answer said `grok_workflow status: PARTIAL — not
  completed, so I am not claiming success.`

This is evidence that a worker's claim does not become success when the
verifier cannot support it, and that partial results remain explicit.

### Remaining real-runtime gaps

- Planner-only real-model run: `NOT_RUN`.
- Real DSH cancellation/deadline path: `NOT_RUN` (unit/lifecycle tests pass).
- Remote GitHub Actions: `NOT_RUN`.

### Real end-to-end grok_workflow run (planner, completed)

A planner-only call (no `tasks` array) with the objective
`Create the file .dsh-home/planner-only.txt containing exactly PLANNER_ONLY, then verify its content.`
returned:

- `tool_result` status: `completed`.
- Report: `Grok workflow: COMPLETED`, `Plan: planner; 1 task(s); 1 verified`.
- Task `write-verify-planner-only`: verified after 2 attempts; evidence included
  `realpath`, `ls`, `test -f`, `cat`, `wc`, `od`, `stat`, `cmp`, and `sha256sum`.
- File content: exactly `PLANNER_ONLY` (12 bytes, no trailing newline).
- The report surfaced a planner-generated constraint that said "do not execute
  work in this planning step"; this was a planner wording defect, not a false
  success. The planner prompt was clarified to forbid planning-phase
  instructions in task constraints.

A larger planner run (two marker files plus an over-broad "no other file in
`.dsh-home` changed" criterion) was killed by the outer 600 s test timeout before
returning a report. It demonstrated that the default 30-minute plugin deadline
and bounded retries are not a substitute for realistic task scope. It is not
counted as a passed acceptance run.

### Recursion guard (real-model lesson)

The first large planner attempt spawned multiple child agents and one child
appeared to be verifying by starting more work. The plugin now rejects
`grok_workflow` calls from subagent sessions (`origin === 'subagent'` or
`delegationDepth > 0`); a deterministic test covers the rejection. This guard
was added before the successful small planner run.

### GitHub installation and workflow

Repository: `https://github.com/free6589/dsh-grok-workflow`, public, default
branch `main`; initial commit `beb55c6`, current work commit `7b78db9`.

Commands:

```sh
DSH_HOME=.dsh-home dsh --profile grok-workflow-github --from-default-profile headless --dump-config
DSH_HOME=.dsh-home dsh plugin --profile grok-workflow-github add github:free6589/dsh-grok-workflow
DSH_HOME=.dsh-home dsh --profile grok-workflow-github --dump-config
```

Result: **PASS**.

- pnpm resolved and added `dsh-grok-workflow github:free6589/dsh-grok-workflow`
  (+4 packages); it emitted only peer-dependency warnings, no install failure.
- `--dump-config` shows `- id: grok-workflow / name: dsh-grok-workflow`.
- A real headless boot replied `GITHUB_INSTALL_OK`.
- A real `grok_workflow` call in the GitHub-installed profile returned
  `COMPLETED` with one verified task; the file
  `.dsh-home/github-install-marker.txt` contains exactly
  `GITHUB_WORKFLOW_OK` (18 bytes, no trailing newline).

### GitHub Actions

- Run `40168892831` (commit `beb55c6`): **PASS**, Node 22 and Node 24 jobs.
- Run `40169133016` (commit `7b78db9`): **PASS**, Node 22 and Node 24 jobs.
- The workflow uses `actions/checkout@v4` and `actions/setup-node@v4`; GitHub
  reports a Node 20 deprecation annotation but both jobs completed successfully.
