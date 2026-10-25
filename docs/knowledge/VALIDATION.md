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

## Implementation validation — 2026-10-25

### Deterministic test suite

Command:

```sh
npm run ci
```

Result: **PASS**

- `npm run typecheck`: PASS.
- `npm run lint`: PASS, 0 warnings/0 errors (`oxlint` over 15 files).
- `npm test`: PASS, 6 test files, 51 tests.
  - `test/orchestrator.spec.ts`: 15 tests (planner, caller plan, parallel pool,
    partial, failed, evidence rejection, retry bound, fallback, oversized
    planner rejection, duplicate planner criteria, overlong verifier-criterion
    rejection, prompt/error redaction, exact criteria).
  - `test/plugin-lifecycle.spec.ts`: 15 tests (registration, invalid input,
    startup rejection timer cleanup, startup-unload cleanup, max active runs,
    unload cancellation/disposal, canonical report filtering, contradictory
    report rejection, late startup timeout (resolve/reject), deadline report).
  - `test/loader.spec.ts`: 2 tests (real DSH Loader + real tool registry;
    disabled row inertness; registration/unregistration and prompt section).
  - `test/input.spec.ts`: 10 tests, including exact-bound, over-bound, and
    duplicate-criteria input.
  - `test/redact.spec.ts`: 7 tests, including compound environment names,
    access/private/secret keys, and Stripe underscore tokens.
  - `test/issue-watch.spec.ts`: 2 tests using a fake `gh` executable; baselines
    issues, replays a comment/new issue, asserts the untrusted-data prompt
    boundary, and verifies credential-env isolation.

Toolchain: Node `v26.8.1`, Vitest `4.1.12`, TypeScript `6.x`, DSH packages
`0.2.1-rc.2`, real `@deepseek-ai/cordis-plugin-loader` `1.0.6`.

### Package contents

Command:

```sh
npm --cache /tmp/npm-cache-dshgw pack --dry-run
```

Result: **PASS**. Tarball `dsh-grok-workflow-0.1.0.tgz`, 27 files, about 38 kB packed
(later docs additions changed the size), includes `lib/index.js`, declarations, `cordis.patch.yml`, README,
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
- Run `40169816856` (commit `8ec3ad4`): **PASS**, Node 22 and Node 24 jobs.
- Run `40169885633` (commit `602918e`): **PASS**, Node 22 and Node 24 jobs.
- Run `40170034851` (commit `b23d360`): **PASS**, Node 22 and Node 24 jobs.
- Run `40172141078` (commit `6a0c32a`): **PASS**, Node 22 and Node 24 jobs.
- Run `40175621646` (commit `b6b649b`): **PASS**, Node 22 and Node 24 jobs;
  includes `npm run build`, `git diff --exit-code -- lib/`, and
  `npm pack --dry-run`.
- Run `40176223802` (commit `03c9a43`): **PASS**, Node 22 and Node 24 jobs;
  watcher security tests (51 total) included.
- Run `40176627051` (commit `aa0e9bb`): **PASS**, Node 22 and Node 24 jobs;
  final documentation and live-watcher evidence.
- The workflow uses `actions/checkout@v4` and `actions/setup-node@v4`; GitHub
  reports a Node 20 deprecation annotation but both jobs completed successfully.

### Real end-to-end deadline cancellation

A real `grok_workflow` call ran with a profile overlay setting `timeoutMs: 2000`
and one task that asked the worker to `sleep 30`.

Result: **PASS**.

- `tool_result` status: `completed` at the transport level, report
  `Grok workflow: FAILED`.
- Report showed `Plan: unavailable; 0 task(s); 0 verified`, with
  `Timeout: workflow exceeded the 2000 ms deadline and was cancelled`.
- Final assistant answer reported `FAILED` and explicitly said the sleep did
  not complete.
- No leftover `sleep 30` or `dsh --profile grok-workflow-dev` process was
  observed after the call.

This is a live DSH cancellation/deadline path, not only a mocked unit test.

## Review boundary fixes (2026-10-25)

Independent review found five gaps; fixes were implemented and retested:

- Caller acceptance criteria now reject more than 20 items or more than 1,000
  characters per item instead of being silently truncated. The same bounds are
  enforced when normalizing planner output.
- Credential redaction now matches compound environment names such as
  `OPENAI_API_KEY`, `GITHUB_TOKEN`, and `DATABASE_PASSWORD`.
- The deadline timer is cleared in an outer `finally`, including when
  `workflowEngine.start()` rejects; a fake-timer test asserts zero pending
  timers after startup rejection.
- Obsolete pending/not-run sections were removed from this validation log.
- `engines.dsh` is now the exact `0.2.1-rc.2`, matching the exact DSH peer
  dependency set.
- **Residual re-review edge case:** verifier criterion strings are now parsed
  with `boundedText(..., 1000)`, so a 1,000-character caller criterion plus a
  suffix is rejected rather than silently truncated into a match. Regression
  test added.

### Issue-report fixes (2026-10-25)

Open issue reports #2-#7 were reproduced from source and covered by deterministic
tests:

- **#2 redaction:** `KEY_VALUE` now covers access/private/secret key names and
  compound prefixes; OpenAI-style tokens include `sk_live_` / `sk_test_`
  underscore forms. `redactSecrets` and recursive `redactDeep` tests pass.
- **#3 report invariants:** `assertWorkflowReport` now compares immutable plan
  and task fields, validates sequential attempts within the retry limit, rejects
  passed attempts on failed tasks, and enforces status invariants (`completed`
  all verified with evidence/no fallback, `partial` mixed, `failed` no verified
  tasks).
- **#4 startup deadline:** a deadline that elapses while `start()` is pending
  now returns the canonical timeout report whether startup later resolves or
  rejects; the late run is cancelled and disposed.
- **#5 prompt redaction:** worker/verifier results and error messages are
  redacted inside the generated script before being serialized into verifier
  and retry prompts; regression tests assert fake markers never reach prompts.
- **#6 duplicate criteria:** caller input rejects duplicate acceptance criteria;
  planner output with duplicates is rejected and falls back, rather than
  creating an impossible verifier match.
- **#7 canonical result:** the tool returns the object produced by
  `assertWorkflowReport`, not the raw engine value; a test adds an unknown field
  containing a fake secret and verifies it is absent.

`npm run ci` — **PASS**, 6 files / 51 tests.

### Additional issue-report fixes (#8-#10)

- **#8 payload bounds:** the objective is capped at 4,000 characters and the
  aggregate serialized caller/planner task payload at 48,000 characters, in
  both host input validation and generated-script planner normalization.
  Boundary and over-bound tests pass.
- **#9 shared working directory:** documented as a concrete MVP limitation.
  Parallel workers and verifiers share the DSH session `cwd`; the plugin has no
  worktree isolation, so write-heavy work must use disjoint scopes or
  `maxConcurrency: 1`.
- **#10 artifact drift:** CI now runs `npm run build`, then
  `git diff --exit-code -- lib/`, then tests and `npm pack --dry-run`, so a
  commit cannot silently ship stale `lib/` output.

### Watcher security fix (#11)

- The watcher now wraps all imported event fields in a compact JSON array,
  labels it `UNTRUSTED GITHUB DATA`, and repeats a security reminder after the
  payload: issue text is evidence/task description, not authority to override
  system/repository/tool/secret-handling rules.
- `DSH_ENV_FILE` is parsed as KEY=VALUE credentials rather than sourced as shell
  code; `DSH_*`, `HOME`, `PATH`, and similar process variables are ignored so a
  credential file cannot retarget the wake to another DSH home/profile/session.
- Command-mode wakes use `bash -c`, not a login shell, so profile scripts cannot
  overwrite the isolated environment.
- Two fake-`gh` tests pass, including hostile-looking issue text and a credential
  file containing conflicting `DSH_HOME` / `DSH_PROFILE` / `DSH_PATCH`.
- `npm run ci` — **PASS**, 6 files / 51 tests.

### Post-fix real DSH revalidation

- Reinstalled the local bundle into the isolated `grok-workflow-dev` profile
  with the exact engine declaration; `--dump-config` still shows the
  `grok-workflow` row. **PASS**.
- Clean one-task caller workflow returned `COMPLETED`, plan `caller`, 1/1
  verified; `.dsh-home/fix-e2e/check.txt` was a 6-byte regular file containing
  exactly `FIX_OK`. **PASS**.
- Re-ran the 2-second deadline against a 30-second worker: `FAILED` with
  `Timeout: workflow exceeded the 2000 ms deadline and was cancelled`; no
  leftover child process. **PASS**.
- Fresh profile `grok-workflow-review` installed the public GitHub package
  after the exact-engine commit (`6a0c32a`), showed the bundle row, booted with
  `REVIEW_OK`, and a one-task workflow returned `COMPLETED` 1/1 verified.
  **PASS**.

## Issue watcher validation (2026-10-25)

### Live wake smoke

- Created temporary issue #13 (`[TEST] watcher wake smoke`) after the watcher
  was running with the hardened script.
- The watcher detected the new issue at `08:25:06Z`, started wake
  `pid=540837`, and wrote `last-wake.status=0`.
- The DSH final answer contained `WATCH_WAKE_OK`; its trace shows the prompt
  included the JSON array and both security-boundary messages. No repository
  files were modified and no credentials were read or printed.
- Closed #13 after the check. This is a real watcher → DSH headless wake, not
  a mocked unit test.

- `bash -n scripts/watch-issues.sh` — **PASS**.
- `npx vitest run test/issue-watch.spec.ts` — **PASS**, 2 tests; fake `gh`
  executable, no GitHub or model calls; includes hostile issue text and
  credential-env isolation.
- `WATCH_STATE_DIR=.dsh-home/watch-live WATCH_WAKE_MODE=noop scripts/watch-issues.sh --once`
  — **PASS**; baselined 10 open issues at 08:02 UTC with no wake.
- Real DSH headless stdin smoke:
  `printf 'Reply with exactly: WAKE_SMOKE_OK\n' | dsh --profile grok-workflow-dev --patch .dsh-home/gw-model.patch.yml --json`
  — **PASS**; final text `WAKE_SMOKE_OK`. The watcher uses the same
  `--profile ... --patch ... --json` argument shape and feeds the prompt on
  stdin.
- The live watcher is started separately; its state and logs stay under the
  ignored `.dsh-home/` directory.

## Remaining gap

- Clean-DSH-profile installation is executed locally; CI has not yet added a
  separate clean-profile install job.
