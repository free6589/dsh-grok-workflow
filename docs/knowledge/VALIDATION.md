# Validation Log

Real commands and results only. Do not add expected results here.

**Before running any live matrix, read [TESTING.md](TESTING.md)** — the workspace-isolation rules are
mandatory: no sample is sent to a test instance until its session workspace is a scratch directory
under `/tmp`, and the proof of that (the `sessions/--tmp-…--` directory name plus the workspace name
the UI shows) belongs in that round's evidence.

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
- `npm test`: PASS, 6 test files, 56 tests.
  - `test/orchestrator.spec.ts`: 17 tests (planner, caller plan, parallel pool,
    partial, failed, evidence rejection, retry bound, fallback, oversized
    planner rejection, duplicate planner criteria, overlong verifier-criterion
    rejection, prompt/error redaction, exact criteria, URL/token prompt
    redaction).
  - `test/plugin-lifecycle.spec.ts`: 15 tests (registration, invalid input,
    startup rejection timer cleanup, startup-unload cleanup, max active runs,
    unload cancellation/disposal, canonical report filtering, contradictory
    report rejection, late startup timeout (resolve/reject), deadline report).
  - `test/loader.spec.ts`: 2 tests (real DSH Loader + real tool registry;
    disabled row inertness; registration/unregistration and prompt section).
  - `test/input.spec.ts`: 10 tests, including exact-bound, over-bound, and
    duplicate-criteria input.
  - `test/redact.spec.ts`: 10 tests, including compound environment names,
    access/private/secret keys, Stripe underscore tokens, non-HTTP URL
    userinfo, and GitLab/npm token prefixes.
  - `test/issue-watch.spec.ts`: 2 tests using a fake `gh` executable; baselines
    issues, replays a comment/new issue, asserts the untrusted-data prompt
    boundary, verifies credential-env isolation, and rejects runtime-loading
    variables from the credentials file.

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

- **#8 payload bounds (historical: this validation ran when the limit was
  4,000):** the objective was capped at 4,000 characters and the aggregate
  serialized caller/planner task payload at 48,000 characters, in both host
  input validation and generated-script planner normalization. Boundary and
  over-bound tests pass. The objective limit is now 32,000 (see
  `docs/ARCHITECTURE.md` §Objective length boundary).
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

### Credential redaction formats (#14)

- Reproduced on the built `lib/redact.js` from `99454d1`: both database URLs
  (`postgres://demo_user:FAKE_DB_PASSWORD@...`, `mongodb+srv://...`) and bare
  `glpat-...` / `npm_...` values passed through unchanged.
- `src/redact.ts` now matches username/password userinfo for any `scheme://`
  URI, including database schemes and empty-username forms such as
  `redis://:password@host`; it also recognizes `glpat-` and `npm_` token
  prefixes. `src/script.ts` carries the same patterns for prompt-facing
  redaction.
- Regression tests added in `test/redact.spec.ts` for `redactSecrets` and
  `redactDeep`, and in `test/orchestrator.spec.ts` for verifier/retry prompts.
- `npx vitest run test/redact.spec.ts test/orchestrator.spec.ts` — **PASS**,
  2 files / 26 tests.
- `npm run ci` — **PASS**, 6 files / 55 tests.
- Post-fix check on the built artifact: the issue examples return `[REDACTED]`
  markers while ordinary prose (`ratio 3:4 at example.test`) is unchanged.

### Watcher credential-env allowlist (#15)

- `bash -n scripts/watch-issues.sh` — **PASS**.
- `npx vitest run test/issue-watch.spec.ts` — **PASS**, 2 tests; the
  credentials file contains inert `NODE_OPTIONS`, `NODE_PATH`, `LD_PRELOAD`,
  `LD_LIBRARY_PATH`, `DYLD_*`, `PYTHONPATH`, `PYTHONHOME`, `PERL5OPT`,
  `RUBYOPT`, `BASH_ENV`, `ENV`, `SHELLOPTS`, `BASHOPTS`, and an unlisted
  setting; the command wake does not receive any of them, while
  `BIFROST_VIRTUAL_KEY` and `OPENAI_API_KEY` still arrive.
- `bash scripts/watch-issues.sh --help` — **PASS**; it describes
  `DSH_ENV_FILE` as a parsed `KEY=VALUE` credentials file, not a sourced
  environment file.
- `npm run ci` — **PASS**, 6 files / 55 tests.
- Live watcher restart: **PASS** at `08:54:06Z`; new PID `568469`, state
  retained, `DSH_SESSION_ID`/profile overrides absent, first poll `no changes`.
  The prior live wake (`WATCH_WAKE_OK`, status 0) used the previous script.

### Fallback partial host validation (#17)

- Issue #17: a planner fallback creates one task, verifies it, and the script
  deliberately reports `partial` because planning was degraded. The host
  `assertWorkflowReport()` previously rejected that report because its
  `partial` invariant required both verified and failed tasks.
- `src/report.ts` now accepts `partial` with all tasks verified only when
  `plan.source === 'fallback'` and `plan.error` is non-empty. It still rejects
  an all-verified non-fallback `partial` report, keeps `partial` requiring at
  least one verified task, and keeps fallback `completed` forbidden.
- `test/orchestrator.spec.ts` now runs the generated fallback report through
  the real host validator and also checks the non-fallback rejection. The suite
  has 17 orchestrator tests and 6 files / 56 tests total.
- `npm run ci` — **PASS**, 6 files / 56 tests.

## Round 3 / GUI, activation and the settings page — 2026-10-27 (t32 + t33)

All work happened on a **separate profile and a separate instance**
(`DSH_HOME=/home/fish/dsh-layerfs`, profile `web-grok-debug`, `127.0.0.1:3199`). The
user's live GUI (`:3090`, PID 825935) was never restarted, killed or reconfigured; it was
checked alive (`ps -o pid -p 825935`) before and after every experiment.

### Activation: composition is not activation (closes the t33 contradiction)

| Step | Command / observation | Result |
|---|---|---|
| row present after install | `dsh plugin --profile web-grok-debug add <tgz>` then `dsh --profile web-grok-debug --dump-config` | `- id: grok-workflow` / `name: dsh-grok-workflow` — the row **is** in the composed config |
| why it still did nothing | same dump, provider row | `- id: workflow-ptc … disabled: true` (shipped that way by `@deepseek-ai/dsh-web-app`) |
| runtime consequence | boot of the new instance | `dsh: warning: 2 entries did not activate` / `grok-workflow (dsh-grok-workflow): pending (waiting for service: workflowEngine)` |
| fix, same profile | `cordis.patch.yml`: `- id: workflow-ptc` / `config: { provider: spawn }` / `disabled: false` | boot is clean; no pending warning |
| proof the seam arrived | `POST /api/settings/describe` | namespace `grok-workflow`, `autoGenerate: true`, **17** projected fields (`toolName`, `enforceGate`, `gateRequired`, `configVersion` absent) |
| proof of the runtime tool surface (A1) | real GUI session, session transcript `request/header` | **32 tools**, `grok_workflow` among them; no `--dump-config` involved |
| proof the gate claims messages (C1) | same session transcript | `plugin:grok-workflow/delivery` records per message id: `phase: started, outcome: admitted` … `phase: delivered`; the answer is the workflow's report, never a direct reply |

So the t33 finding ("0 × `grok_workflow` in a 92,716-character prompt") is explained by a
**missing service**, not by a broken package: `dsh plugin add` puts the bundle into
`dsh.profile.bundles` (visible in `--dump-config`), while activation additionally needs an
enabled workflow provider. See D-014 and
[../LOCAL-TESTING.md](../LOCAL-TESTING.md#enable) for the reproducible steps.

### Fail-closed path (C2), measured twice

| Run | Config | Observed |
|---|---|---|
| 1 | `subagentProvider: bifrost-completions` (an LLM provider, not a DSH subagent provider) | delivery `started/admitted` → `failed/start-failed`; the user message is replaced by a report the model must relay verbatim: *"The mandatory workflow gate refused this message and no workflow result exists. Reason: no subagent provider registered for \"bifrost-completions\". Nothing was executed and no direct answer is available by design."* |
| 2 | `subagentProvider: spawn` (correct), weak model | delivery `started/admitted` → `delivered/failed`; the visible answer is `Grok workflow: FAILED` with `Plan: planner; 1 task(s); 0 verified` and a `Failures: 2 quality` list — a report, still no direct answer |

### The settings page (requirement D, closes NR-7/NR-8)

| Check | Observation |
|---|---|
| namespace served but no page (the root cause) | `settings/describe` lists 20 namespaces including `grok-workflow`; the Plugins page showed **no** card for it: `autoGenerate` is a Host description, not a UI |
| Fix | `src/client/index.js` shipped as `dsh-grok-workflow/client.js`; registers `plugins.item` under `configForms.whileServed(['grok-workflow'])`. Manifest: `exports["./client"]` + `dsh.client = { platform: 'web', inject: [...] }` |
| B1 the entry exists | Plugins page renders a card **Grok workflow** (`data-plugin-item="grok-workflow"`) |
| B2 the fields render | 15 `[data-field]` inputs + the class picker + 4 per-role chain editors + 4 read-only structural rows = all **21** `CONFIG_KEYS`; `test/client.spec.ts` pins the table against `CONFIG_KEYS` / `HARD_LIMITS` / `SWITCHABLE_CLASSES` |
| B3 edit → save → effective | Playwright set `maxConcurrency` 3 → 5 and appended a `planner` route, pressed Save: page shows `已保存` and `revision 1`; `POST /api/settings/mutate` carried `{ns, ops, expectedRevision}`; the value is in the profile's `cordis.patch.yml`; after a **restart** the page and `settings/describe` still report `maxConcurrency: 5` and the planner route in the entry's `user` layer |
| B4 invalid input | adding four empty `verifier` routes lists `verifier 第 N 条缺少 model` and disables Save; the Host also refuses (`resolveConfig`), e.g. boot prints `roles.synthesizer is set but synthesis is "deterministic"` and the row does not activate |
| B5 no fake page | every rendered key is a real `resolveConfig` key (parity test), the page reads the Host mirror and writes through the settings queue — it has no local copy of the config |

### Reproducible install in a pristine `DSH_HOME` (A3)

A second, independent check with **no user data at all** (`DSH_HOME=/tmp/t32-dsh-home`,
profile `smoke`, port 3198):

| Step | Result |
|---|---|
| `dsh --profile smoke --from-default-profile web` | profile created |
| `dsh plugin --profile smoke add /tmp/t32-pack/dsh-grok-workflow-0.2.0.tgz` | `+ dsh-grok-workflow file:/tmp/t32-pack/dsh-grok-workflow-0.2.0.tgz` |
| profile `cordis.patch.yml`: `workflow-ptc` → `disabled: false`, `provider: spawn` | composed config shows the enabled provider and `- id: grok-workflow` |
| boot on `127.0.0.1:3198` | no `pending` and no `did not activate` line |
| `POST /api/settings/describe` | 22 namespaces, `grok-workflow` present, `autoGenerate: true`, the same 17 projected keys |
| boot graph in the browser (`window.__DSH_BOOT__.entries`) | 70 entries including `dsh-grok-workflow` (the client bundle is served) |

Two honest notes about this pristine profile: its `cordis.patch.yml` ships as a bare `[]`, so
patch entries must **replace** that token (appending produced a YAML with two root nodes and
`dsh` reported the line number); and its Plugins page never opened — no cards at all, ours or
the stock ones (`subagent`/`web-search`/`agent-loop`/`shell`), with no console error, which is
stock behaviour in a profile without sessions or packages. The card itself was therefore
verified on the debug profile, where the Plugins page lists exactly
`["subagent", "web-search", "agent-loop", "shell", "grok-workflow"]` — ours among the stock
pages, same slot, same rendering path.

### Evidence chain: the artefacts measured are the artefacts shipped (F1, t35)

Every screenshot in this round was taken on the **0.2.1 tarball**, installed into the debug
profile from a **fresh path** (the same `file:` spec is a pnpm no-op — the trap that made the
first t32 evidence describe a stale build):

| artefact | value |
| --- | --- |
| tarball the screenshots were taken on | `/tmp/t35-pack-A/dsh-grok-workflow-0.2.1.tgz`, 43 files, 118.7 kB, md5 `ffb22ca4a2e249b41303fbbbcf9cb450` |
| tarball installed and re-checked last (`t35-pack-B`, 121.4 kB, `61723bda…`) | then the **release commit** added the tag-availability note to both shipped `README`s (t38/O1) |
| **release tarball** (packed from the release commit; macro-identical to what the release workflow builds) | 43 files, 121.5 kB, md5 `b1401eeb9ba0f425ab646af7f9dc12be` (npm shasum `12ba3363ac515a02dc4125787c1c04508ef2edd8`) |
| delivery build `src/client/index.js` | `68324a754a54ce36e6775618314592c5` |
| `lib/client.js` in the repo | `68324a754a54ce36e6775618314592c5` (`cmp` → identical) |
| `package/lib/client.js` **inside the tarball** | `68324a754a54ce36e6775618314592c5` |
| installed copy `profiles/web-grok-debug/node_modules/dsh-grok-workflow/lib/client.js` | `68324a754a54ce36e6775618314592c5`, manifest version `0.2.1` |

`npm pack` is reproducible here: packing the same tree twice gives the identical md5. Across the
three packs the changed **shipped** files were `README.md`, `CHANGELOG.md`, `docs/LOCAL-TESTING.md`
and `docs/RELEASING.md` (`files` ships `lib/**/*.js`, `docs/*.md` and `docs/images`); the edits
under `docs/knowledge/` and `docs/releases/` are not shipped and do not move the tarball hash —
which is why updating the document that *records* the hash cannot invalidate it. That is why the durable identity is the client bundle, not the tarball:
**`src/client/index.js` = `lib/client.js` = `package/lib/client.js` in the tarball =
`68324a754a54ce36e6775618314592c5`**. **The client bundle is the same bytes in both**, which
is why the screenshots stay valid for the final pack — and `15-final-pack.png` +
`15-final-pack.txt` re-run the page check on the final pack itself (card present, 15 fields, four
read-only rows with labels, saved chain intact, no console error).

So the bytes in the browser are the bytes in the tarball are the bytes in the delivery build.
`test/client.spec.ts` keeps that true: a `lib/client.js` that differs from the source fails the
suite (`ships lib/client.js byte-identical to the source`), which is how the stale-bundle class
of mistake is caught from now on.

### Screenshots and DOM assertions (`docs/knowledge/evidence/t32/`)

Element-level captures plus the assertion output they belong to; the `.txt` files carry the
numbers, so a claim can be checked without re-running Playwright.

| file | what it shows |
| --- | --- |
| `01-plugins-cards.png` + `.txt` | Plugins page lists `subagent, web-search, agent-loop, shell, grok-workflow` — ours among the stock cards |
| `02-page-initial.png` + `02-page-assertions.txt` | the page as served: 15 `[data-field]` inputs, 4 chain editors, 4 read-only rows **with labels** (no `undefined`), `revision 1`, nothing pending |
| `03-readonly-rows.png` | element shot of the structural section: `grok_workflow（注册即固定…）`, `true（默认…）`, `false（默认…）`, `1（wire 契约…）` |
| `04-page-edited.png`, `05-footer-edited.png` | staged edit (`maxConcurrency` 3 → 5, one extra `planner` route) with the footer visible |
| `06-page-saved.png`, `07-footer-saved.png`, `04-save-assertions.txt` | after Save: `已保存，下一条消息生效 / Saved; applies to the next message`, `revision 4`, Save disabled, values re-read from the Host |
| `08-page-validation.png`, `09-validation-errors.png`, `10-footer-disabled.png`, `08-validation-assertions.txt` | `maxRetries=99` and two verifier rows without a model: three reasons listed (red), Save disabled |
| `11-page-persisted.png` + `11-persisted-assertions.txt` | **after a full restart**: `maxConcurrency=5` and both `planner` routes still there, `revision 0`, nothing pending |
| `12-session-hi.png` + `12-session-assertions.txt` | a real GUI turn `hi`: `Grok workflow: COMPLETED … 1 verified`, completed in 1m 11s, delivered as the answer |
| `15-final-pack.png` + `15-final-pack.txt` | the **final** tarball installed and re-opened: card, 15 fields, four labelled read-only rows, `maxConcurrency=5` and both planner routes still saved |
| `14-host-refusal.txt` | a **real** Host-side refusal: a saved chain naming a model the provider does not enumerate stops the row from activating (`roles.planner names model "wb/global:deepseek-v4.1-flash", which provider "bifrost-completions" does not enumerate; declared: …`) — no namespace, no page, and the boot line says why |

### What the page validates, and what only the Host can (an honest gap, t35)

The two layers check different things, and the sequence in this round shows it:

1. The page saved `maxConcurrency: 5` plus a second `planner` route
   `bifrost-completions / wb/global:deepseek-v4.1-flash` (`04-save-assertions.txt`). Client-side
   validation covers the *shape* of a configuration — numeric bounds, a missing model, duplicates,
   three-route limit, unknown `switchOn` classes — and it cannot know which models a provider
   enumerates, because the catalog lives on the Host.
2. On the next start the row **did not activate**, and the boot line said exactly why:
   `roles.planner names model "wb/global:deepseek-v4.1-flash", which provider "bifrost-completions"
   does not enumerate; declared: wb/cn:deepseek-v4.1-flash, wb/cn:deepseek-v4-pro, agnes-3.0-flash`
   (`14-host-refusal.txt`). The namespace disappeared, so the page did too — the failure is loud in
   the log, not silent in the UI.
3. Correcting the route to an enumerated model and restarting produced the measured pass:
   values persisted (`11-persisted-assertions.txt`), a real `hi` turn completed
   (`12-session-assertions.txt`), and the final tarball re-checked the same way
   (`15-final-pack.txt`).

So the page prevents the mistakes it can see and the Host refuses the rest at load time. A
provider-aware model picker (which would close this gap) needs the client to read the model
catalog; that is not in 0.2.1 and is recorded here rather than papered over.

### Client-side tests for the browser half (F5, t35)

`test/client.spec.ts` grew from 6 to 20 tests. Beyond the field/limit/class parity checks it now
covers the two functions that decide what a Save writes: `validate()` (numeric bounds and
fractional values, `gateScope=preset` without a preset name, chain longer than three, a route
without a model, a duplicate route, two *blank* routes not being duplicates, a 121-character
field, an unknown `switchOn` class) and `opsFor()` (no op when nothing changed, one op per
changed field, `roles.<role>` path for a chain, never an op for a structural key), plus
`draftOf()` (defaults, publishing a chain, filling omitted roles, and no aliasing of the Host
document) and `resolveNamespace()` (shipped id, a renamed Loader row, a missing namespace, and a
half-signature namespace not being captured).

Both new behaviours were mutation-checked: restoring the "blank routes are duplicates" rule fails
`treats two blank routes as unfinished rows, not duplicates (t32 regression)`, and forcing the
value-based lookup off fails `follows a renamed Loader row instead of silently losing the page
(t34 residual)`.

### CI

`npm run ci` → typecheck OK, `oxlint` "Found 0 warnings and 0 errors", **284 tests / 19 files**
(`client.spec.ts` contributes 20 of them; the suite was 264/18 before the browser half existed).

## Round 2 / `0.2.0` release preparation — 2026-10-26

Real commands and results only.

| Check | Command | Result | Evidence |
|---|---|---|---|
| Full CI | `npm run ci` | PASS | typecheck OK; `oxlint` "Found 0 warnings and 0 errors" (37 files); build OK; **264 tests / 18 files** passed |
| Unit subset | `npm run test:unit` | PASS | 16 files / 260 tests (the two Loader/issue-watch suites are excluded by design) |
| Build reproducible | build twice, then `md5sum lib/*.js lib/*.d.ts \| md5sum` | PASS | `304de3768ceefa0a8af459785a570b51` both times |
| Package contents | `npm pack --pack-destination /tmp/t15-pack` | PASS | 42 files, 108,428 bytes; contains `lib/`, `package.json`, `cordis.patch.yml`, `LICENSE`, both READMEs, `CHANGELOG.md`, `docs/*.md`, `docs/images/*.svg`; **no** `test/`, `scripts/`, `docs/knowledge/` |
| Clean copy install | `rsync` the worktree to `/tmp/t15-clean2` (no `node_modules`, no `.git`) → `npm ci` → `npm run ci` | PASS | install completed; CI on the copy: lint "Found 0 warnings and 0 errors", **264 tests / 18 files** passed |
| Isolated profile install | fresh `DSH_HOME=/tmp/t15-dsh-home`, `dsh --profile smoke --from-default-profile headless`, then `dsh plugin --profile smoke add /tmp/t15-pack/dsh-grok-workflow-0.2.0.tgz` | PASS | pnpm reported `+ dsh-grok-workflow file:/tmp/t15-pack/dsh-grok-workflow-0.2.0.tgz`; `--dump-config` shows the `grok-workflow` bundle row |
| Isolated profile, real turn | `DSH_HOME=/tmp/t15-dsh-home dsh --profile smoke --patch <route> "hi"` | PASS | 46 lines; the answer contains a `<<<GROK-WORKFLOW-REPORT>>>` block with `Grok workflow: COMPLETED` and per-criterion evidence for a conversational task |
| Settings identity end-to-end (t31/F1) | `node scripts/smoke-settings-identity.mjs` | PASS | with the built `lib/` and the **real** `dsh-settings` projection of the DSH installation: "projected fields: 17 (toolName present: false)", `INFO settings surface: page auto-generated for "grok-workflow" (21 field(s), applies live, schema not matched by uid, identified by value)`; mutating the distinctive-key set back to include `toolName` makes the same script print the old `no generated descriptor was readable yet` line and exit 1 |
| Real headless one-shot delivery | `scripts/e2e-headless-in-turn.sh` with a live model route | PASS | `PASS: the report reached the user in one turn`, `Grok workflow: COMPLETED` |
| `writesPaths` planner fill-rate (NR-9) | same script with an objective that explicitly asked for per-task write paths | **INCONCLUSIVE run, informative field value** | the run hit the 900 s script timeout while task 1 of 2 was still retrying; the session transcript shows the task handed to the worker carried `"writesPaths": null`, i.e. the planner declared nothing. n = 1 |
| Settings descriptor identity (t31/F1) | `npx vitest run test/settings-projection.spec.ts test/config.spec.ts` | PASS | real projection rules pinned (17 volatile fields, structural keys absent, `{uid, refs}`, uid mismatch); mutating the distinctive-key set back to include `toolName` fails the tests |

### A limitation the smoke run exposed

The plugin's diagnostics go through `ctx.logger(...).info()`. The headless app's exporter does
not surface DSH logger records on stdout/stderr (every `INFO` line in the run came from the
Serena MCP server, not from DSH), so the settings line cannot be read out of a headless turn.
That is why the identity check above drives the built `lib/` directly with a real descriptor
instead of grepping a log. The same reason keeps NR-7/NR-8 open: no GUI has ever rendered
this page.

### Notes on what these runs changed in the repository

- The `writesPaths` experiment's child agents ran with full tool access and **made a git
  commit** (`e38ac8e docs: add plan-a three-line workflow gate summary`). The artifact
  (`docs/plan-a.md`) and the second, uncommitted artefact (`docs/plan-b.md`) were removed from
  the working tree; the commit itself stays in history for the captain to handle in the final
  integration, because rewriting history is not a member's decision. This is also a real
  observation about the plugin's blast radius: children inherit the session's tools, so a
  workflow can commit.

## Remaining gap

- Clean-DSH-profile installation is executed locally; CI has not yet added a
  separate clean-profile install job.


### Homepage PR #16 — merged and locally rechecked

- PR #16 merged to `main` as `ea3e8e31`; CI runs `40178081351`, `40178539805`, and `40178848058` passed on Node 22 and Node 24.
- Root README is a concise English quick-start; `README.zh-CN.md` is the full Simplified Chinese counterpart. Both link to each other at the top.
- Added `docs/images/workflow-overview.svg` and `docs/images/workflow-overview.zh-CN.svg`; both parse as well-formed XML.
- Added `README.zh-CN.md` to `package.json` `files`; current `npm pack --dry-run` lists both READMEs and 33 total files (62.9 kB package). The published v0.1.0 asset predates the `CHANGELOG.md` package addition and has 31 files.
- The merged PR initially omitted the explicit configuration table, disable/uninstall, security, and compatibility sections; the local follow-up restored compact equivalents in both languages.
- **Install-order review finding:** the first README revision told users to run `dsh plugin add` before creating a missing profile. In an isolated `DSH_HOME` check, `plugin add` auto-created a base-only profile; the later `--from-default-profile headless` rewrote that profile and removed the installed plugin dependency.
- **Correction:** both READMEs and `docs/LOCAL-TESTING.md` now create the headless profile first, then install the plugin, and explicitly warn not to run `--from-default-profile` after `plugin add`.
- Install command verified against project metadata: `dsh plugin --profile grok-workflow-dev add github:free6589/dsh-grok-workflow`; requirements remain DSH `0.2.1-rc.2`, Node.js >=22, and a profile with workflow/subagent services.


### First release v0.1.0 — published

- PR #18 merged to `main` as `7904e23`; main CI `40182707932` passed on Node 22 and Node 24.
- First tag-triggered release run `40182588171` failed in the changelog extractor: the regex literal contained an extra backslash from the YAML/heredoc escaping.
- Fixed in `a7d5a62` (`fix: correct changelog section regex in release workflow`); the tag was recreated at that commit before any GitHub Release existed.
- Final tag `v0.1.0` (tag object `f175ada8a7533a5f61c06a75e5a457e32b37579b`) points to `a7d5a6267c471a6ed73e44ac02092f59942c508a`.
- Release workflow `40182751006` — **PASS** on **Node 22 only**, including typecheck, lint, build, `lib/` consistency, tests, package checks, and release creation. Main CI `40182707932` covered Node 22/24.
- GitHub Release: https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.1.0; asset `dsh-grok-workflow-0.1.0.tgz` (61,281 bytes).
- Tag-pinned install smoke **PASS** in an isolated `DSH_HOME=.dsh-home/tag-smoke`: created the headless profile first, ran `dsh plugin --profile tag-smoke add github:free6589/dsh-grok-workflow#v0.1.0` (pnpm installed the plugin dependency), and `--dump-config` showed the `grok-workflow` bundle row. A real `grok_workflow` model call was **NOT_RUN**.


## 0.2.0 real-profile install matrix (2026-10-27, local operator machine)

Environment: real profiles `headless` and `web` (layerfs root `/home/fish/dsh-layerfs/profiles/`),
plugin `github:free6589/dsh-grok-workflow#v0.2.0`. Headless ran with a temporary model overlay
(bifrost-completions / runanywhere+wb/cn, key via env, never written to disk); web uses the
operator's own model routes. All artifacts under /tmp/mx/ and ~/dsh-profile-backups/.

| # | Item | Profile | Result | Evidence |
|---|---|---|---|---|
| 1 | Mandatory entry: "hi" | headless | PASS | Full workflow (planner, 1 task verified), in-turn delivery, turn `completed`, no direct answer (02-hi.jsonl) |
| 2 | Simple question | headless | PASS | EXIT 0, report delivered (03-2plus2) |
| 3 | Follow-up on same session | headless | PASS | EXIT 0, follow-up also gated into workflow (04-followup) |
| 4 | Broken model config | headless | PASS | EXIT 1 with explicit error, fail-closed, no silent answer (05-bad) |
| 5 | Secret leakage | headless | PASS | Key value absent from all run logs and session store (06-scan) |
| 6 | Stability | headless | PASS | 6 consecutive EXIT 0 runs with reports (02..09); one earlier 570s timeout was transient model congestion, not a defect |
| 7 | Recursion guard | headless | PASS | One workflow run per message in every event stream; no nested runs |
| 8 | Settings surface identity | both | PASS / NOT_RUN | CLI side: `scripts/smoke-settings-identity.mjs` over built lib (real projection). GUI rendering: NOT_RUN — operator check pending |
| 9 | Web install + composition | web | PASS | `dsh plugin list` shows 0.2.0; dump-config composes `# == dsh-grok-workflow`; service restarted and serving (HTTP 401 = auth alive) |
| 10 | Web GUI interactive | web | NOT_RUN | Requires operator login (HTTP 401); left for morning checklist |

Install forensics: `dsh plugin add` writes the profile manifest under the layerfs root; a plugin is
composed only when listed in `dsh.profile.bundles` (web install lost this step to an interrupted
call and was repaired explicitly). Rollback: `dsh plugin --profile <p> remove dsh-grok-workflow`;
backups in `~/dsh-profile-backups/` (pre-install and post-install snapshots).


## Round 4 — progress visibility in the Web GUI (2026-10-27, t44)

Goal: the conversation panel must show the run while it runs, not a blank window. Method: own
debug profile (`web-grok-debug`, `:3199`), the packed build installed there, three real GUI
sessions driven by Playwright, and the server's own session log as ground truth (decompressed
`session.v4.jsonl.zstd`, so the timings are host-clock). Artifacts:
`docs/knowledge/evidence/t44/`. Live `:3090` was not touched.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Node appears immediately | **PASS** | `run-start` **60 ms** after `turn/start` in the session log; first paint of the node **~0.26 s** after the Send click (browser + WS round trip), showing "0 members / No members started" before any subagent exists |
| 2 | Member rows grow with the subagents | **PASS** | 0 → 1 (`grok-planner`, Plan) at 0.45 s → 2 (`grok-worker-…-a1`, Execute) at 10.1 s → 3 (`grok-verifier-…-a1`, Verify) at 35.4 s; header count follows ("1 member"… "3 members") |
| 3 | Terminal state renders | **PASS** | Completed run: `data-run-status="completed"`, header "Completed" at 78.7 s. Run stopped from the GUI at ~8 s: `agent-end {outcome:"cancelled"}`, `run-end {stopReason:"cancelled"}`, panel shows `cancelled` |
| 4 | **Risk item**: does a node anchored before `step/start` render? | **PASS (measured)** | `run-start` at seq 7 (60 ms) vs `step/start` at seq 19 (**78 651 ms**) — the node is visible and live for the entire run. Plan B is not needed |
| 5 | `showProgress: false` writes nothing | **PASS (test)** | `test/progress.spec.ts` runs the real engine with the switch off: zero `tool-workflow/*` events, workflow still returns a validated report |
| 6 | Recording cannot break a run | **PASS (test + mutation)** | A session that refuses the write only costs the entry (one warning); deleting the `try/catch` fails that test, deleting the ownership guard fails the isolation tests, deleting the `run-start` call fails the ordering tests |
| 7 | Contract shapes match the in-tree recorder | **PASS (test)** | Field-for-field payload assertions, including the absent `phase` key |
| 8 | Whole suite | **PASS** | `npm run ci` → 20 files / **306 tests** (294 before, +12), typecheck and oxlint clean (0 warnings, 0 errors) |
| 9 | A live **failed** run | **NOT_RUN** | The short objective verified, so the run completed; `error → failed` is the stock fold's own mapping, and the cancelled case exercises the same "leave `running`" transition. Not claimed as measured |

Two facts worth keeping: (a) the pre-t44 emptiness was not a GUI defect — the events simply did
not exist, and reproducing the tool layer's recorder is enough to reuse the panel that
`dsh-web-app` already ships; (b) in-turn ordering puts `run-start` at turn level, so any future
event this plugin writes must be assumed to arrive before the step and be anchored accordingly.

## Round 5 — unload observability, the notice, per-session slots, the deadline default (2026-10-27, t45)

Goal: close the four defects t41 diagnosed from real logs (silent unload, no user-visible
explanation, a process-wide run cap that let one session starve the others, and a 30-minute
deadline that killed two four-task runs at 30m00s / 30m01s). Method: `test/lifecycle-disposal.spec.ts`
(15 tests, driven through `runWorkflow` + `disposeActiveState` with a hanging fake engine), five
mutation checks, and a live round on the own debug profile `:3199` with **two** GUI sessions and a
`SIGTERM` / settings-toggle unload. Artifacts: `docs/knowledge/evidence/t45/`. Live `:3090` untouched.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | An unload writes a `plugin:grok-workflow/dispose` record before cancelling | **PASS** | Live `SIGTERM`: `at 17:22:05.532Z, uptimeMs 34352, signals ["SIGTERM"], trigger "shutdown", activeRuns 1, notices 1`, six call-site frames; the record precedes the abort, so it survives even when the runs never report |
| 2 | The record names *who* as far as it is knowable | **PASS** | `signals` is a fact the process records (probe installed at `apply`): non-empty = shutdown, empty = in-process unload. Stack-only attribution was measured to be useless here — on a real instance both paths show only cordis frames, so `trigger` stays `unknown` when nothing else proves otherwise and the frames travel with the record |
| 3 | A cut run is reported as `unloaded`, not as a plain cancel | **PASS (test)** | `failure('Unloaded', …)`, `outcome.cause === 'unloaded'`, message "cancelled because the plugin was unloaded …"; a caller stop keeps `cause === 'cancelled'` and "cancelled by its caller". Mutation: forcing the unloaded branch off makes both tests fail |
| 4 | The user is told **once**, and only when something was damaged | **PASS (write) / NOT_RUN (render)** | One `assistant/message` (`model: workflow-notice`, `surfaceOp: append`) per affected session — measured with 1 run in 1 session, 2 runs in 1 session (still one row) and 2 runs in 2 sessions (one row each). The row was never seen **on screen** (see the README's "not proven" section) |
| 5 | An idle unload (the case a user causes on purpose) is silent | **PASS** | Zero session events, one `logger.info` line; live: disabling from the plugin switch with nothing running left the transcript's notice count at 0/0 |
| 6 | A refusing session cannot block the cancellation | **PASS (test)** | Session that throws on `append`: `notices: 0`, both warnings logged, the run is still cancelled *and* disposed, exit cause still `unloaded` |
| 7 | One session cannot starve another | **PASS (live + test)** | `maxActiveRuns: 1`; session A's run at 16:46:20 and session B's at 16:46:29 both `running` (`slots.json`). Unit: session B starts while A holds two runs; A's third refusal names `holding: run run-1 (running 14m38s), run run-2 (…)`. Mutation to a process-wide count fails all three cap tests |
| 8 | A process-wide backstop still exists | **PASS (test)** | `maxActiveRunsTotal` (default 8, hard cap 16) refuses the third run across sessions and names the holding sessions with their run counts and oldest age |
| 9 | The deadline default is 60 minutes | **PASS** | `resolveConfig().timeoutMs === 3_600_000`, hard ceiling still `86_400_000`, settings page shows `3600000`; the deadline report names the value actually used ("1000 ms deadline" in the test). Mutation back to `1_800_000` fails two assertions |
| 10 | Whole suite | **PASS** | `npm run ci` → 21 files / **321 tests** (306 before, +15), typecheck clean, oxlint 0 warnings 0 errors |
| 11 | The settings page renders the new labels | **NOT_RUN** | The Settings dialog did not open in the scripted GUI runs; covered structurally by `test/client.spec.ts` (bounds table + both dictionaries) and `test/settings-projection.spec.ts` (19 volatile fields) |
| 12 | A process that *starts* disabled tells the user | **NOT_RUN (by design)** | Nothing of the plugin runs in that case, so nothing can speak. Documented in DD-13 rather than papered over; a second always-on bundle entry would be the only fix and is out of scope for 0.2.2 |

Two facts worth keeping: (a) "who unloaded me" is not recoverable from a JavaScript stack in this
host — the reliable signal is a *process fact* (a shutdown signal we observe ourselves), and the
record says `unknown` when even that is absent instead of guessing; (b) the per-session cap is the
one change in this round that a user will notice as an improvement rather than a fix, because it
turns a refusal into a working run.

## Round 6 — v0.2.2 acceptance on a second, independent instance (`:3100`, t46)

Question this round answers: does the v0.2.2 tree behave *as a product* on a profile that is a
byte-for-byte copy of the user's live one, without touching that live instance? Method: the live
`profiles/web` was copied (19 third-party bundles, `node_modules` included) to a new home
(`/home/fish/dsh-v022-home`) because DSH keys sessions by **workspace path**, so a shared home
would mix the user's own sessions; the copy listens on `127.0.0.1:3100`. The installed package is
`npm pack` output of the t45 tree (md5 `0a2190b6…`); all five `lib` files are byte-identical to
the repo build and `lib/client.js` equals `src/client/index.js` (`evidence/t46/instance-facts.txt`).
Live `:3090` was never restarted, stopped or reconfigured — it still runs `disabled: true`.
Artifacts: `docs/knowledge/evidence/t46/`.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | (a) Every user message is forced through the workflow — `hi`, a one-line question, and a bare follow-up | **PASS** | Three messages in one session produced exactly three runs (`hi` → planner+1 task+verifier verdict "quality", `1+1 等于几？` → `COMPLETED … 1 verified`, `那 2+2 呢？` → ran and reported one quality finding); no turn produced a direct answer. `A-reports.txt`, `session-evidence.txt` §1 |
| 2 | (b) Progress is visible while the run is live | **PASS** | The run node first paints at **358 ms** / 40 ms / 21 ms after send (`B-samples-*.json`), carries `data-run-status` through `running` → `completed`/`completed`, and the member list grows with each child agent; `B1-node-hi.png` |
| 3 | (c) The settings page renders the v0.2.2 fields in both locales, with the 60-minute default | **PASS** | ZH: `每会话活跃运行上限`, `全部会话活跃运行上限`, `3600000`, `按角色模型链`, `保存`; EN: the same four labels in English; card title `Grok workflow` in both; `<html lang>` round-trips `zh-CN` → `en` → `zh-CN`. `C1-settings-zh.*`, `C2-settings-en.*`, `C-settings.log` |
| 4 | (d) Role chains are editable **through the product** and take effect per role | **PASS with a discrepancy** | Edited the worker chain on the page (second route added by hand), saved: banner "已保存，下一条消息生效。", patch then holds `worker: [wb/cn:no-such-model-probe, wb/cn:deepseek-v4.1-flash]` (`instance-facts.txt`). Effect: the parent session's own requests use `wb/cn:mimo-v2.6-pro` while **all 19 child agents** use `wb/cn:deepseek-v4.1-flash` (`session-evidence.txt` §3). Discrepancy: the report's `Model routes:` line appears only after a settings-page save — the same chain written directly into the profile patch produced no such line (see "open questions") |
| 5 | (e) A cut run is explained, not silently dropped | **PASS for unload and caller stop, INCONCLUSIVE for the deadline** | Unload mid-run (plugin switch off with a run live): the delivered report says `FAILED … Failures: 1 cancelled … grok_workflow was cancelled because the plugin was unloaded while the run was in flight (not a deadline and not a manual stop)`. Caller stop: `run-end stopReason=cancelled`, `turn/end aborted/user`, and no report, because the user aborted the turn themselves. Deadline: a 60 000 ms value saved through the page did **not** stop a run that was still working at 2 m 40 s and beyond (`I1-deadline-conversation.txt`), and the value could not be re-read afterwards because the patch was only inspected after the restore — so either the save did not reach the runtime or `ctx.workflowEngine.start` does not act on the aborted signal while a child call is in flight (`src/run.ts:383`, the timer aborts a signal handed to the engine). `E4-report-after-unload.txt`, `F-stop.log`, `I-deadline.log` |
| 6 | (f) Idempotence, no recursion into subagents, no secret leakage | **PASS** | Runs == deliveries admitted == delivered, 0 duplicates in all 5 user-driven sessions; 19 child sessions, **0** of them started a run; the provider key does not appear in any session file (0 hits) and no `sk-…` string does either. `session-evidence.txt` §1, §2, §5 |
| 7 | (g) Five consecutive rounds without degradation | **PASS for stability, FAILED for quality — corrected in t49** | Five objectives in a row on the same instance: 155.0 s, 181.9 s, 181.8 s, 181.7 s, and the fifth round finishing `completed`; every run reached a terminal state, none needed a retry — that is exactly what this row measured, and it holds. What it did **not** measure, and what t48 spot-checked: every one of those five rounds' *reports* says `Grok workflow: FAILED` with `Failures: 1 quality` and `0 verified`. The engine finishing (`stopReason: completed`) is not an accepted result. Whole test home, 12 reports: `COMPLETED` 1, failed-for-quality 8, cancelled by deliberate probes 3. Root cause (t49): all 8 quality failures were **one defect** — `checkVerification` failed a task whenever the verifier's prose `issues` was non-empty, even though the verifier had returned `verdict: pass` and its own notes say "non-blocking" / "minor observation rather than a failure" / "does not affect any acceptance criterion". Fixed in `src/script.ts` with regression tests; see Round 8. So: 流程稳定 5/5，质量结果 0/5 `COMPLETED`，根因＝我方判定缺陷（已修），不是模型能力问题。`G-rounds.log`, `G-rounds.json`, `G{1..5}-round.png` |
| 8 | (h) Coexistence with the other 18 third-party bundles | **PASS** (t48 re-ran the same profile with **20** bundles — `@orbisapp/remote-dsh` restored — and the boot picture did not change; see Round 8) | Same bundle set as the live profile; boot reports three non-activations and all three are pre-existing properties of that profile, not of this plugin: `@dsh-layerfs/host` and `@dsh-layerfs/client` cannot be resolved from the profile directory (identical in the source profile) and `account-controller` waits for a `deepseekAccount` service this profile does not provide. `instance-facts.txt`, `H-plugins-page.png` |
| 9 | t45 NOT_RUN ② — settings page, new labels + default, EN and ZH | **CLOSED, PASS** | Row 3 above |
| 10 | t45 NOT_RUN ① — the notice row **on screen** | **CLOSED, FAIL** | The row is written (`assistant/message`, `model: workflow-notice`, text verified in the log) but the transcript never shows it: it sits at `turn=1 step=0`, the persisted event carries **no `surfaceOp`** field *(corrected in Round 7: the field **is** present, `surfaceOp: "append"`, as a top-level sibling of `data`; the row is dropped because that `(turn, step)` never had a `step/start`)*, and after the cancellation the turn continues at `step=1` and delivers the gate's report instead (`session-evidence.txt` §6, `E3-conversation-after-toggle.txt`). The information still reaches the user — through the report — so this is a redundant-channel defect, not silence |
| 11 | Whole suite | **PASS** | `npm run ci` → 21 files / **321 tests**, typecheck clean, oxlint 0 warnings 0 errors |

### Open questions this round leaves behind

1. **`Model routes:` is conditional on a settings-page save.** Before the save the report carried
   no such line while the same chain was already in the profile patch; after the save it did. One
   plausible reading is that the settings layer only publishes `roles` to the runtime once it has
   been written by the product, but that has not been root-caused and is not claimed here.
2. **A bogus first route did not show up as a `Route switches:` entry.** The saved worker chain's
   first route named a model that cannot answer, yet the run used the second route and reported no
   switch. Either the route was pruned before use, or switching was silent. Worth a dedicated task.
3. **The deadline did not fire live.** See row 5: one experiment, two candidate causes, no
   verdict. Re-running it needs the saved value to be read back from the patch *before* the run,
   which is the first thing the next attempt should do.
4. **The notice row needs a render path.** `assistant/message` at `step=0` with `surfaceOp:
   append` is dropped by the client's transcript projection; whatever shape the client *does*
   render (a row inside the live step, or a `system/message`) is the fix to design.

One thing this round deliberately did **not** do: provoke the per-session slot refusal from the GUI
(a second message is queued by the client, so one session never holds two runs on this instance);
that wording remains covered by `test/lifecycle-disposal.spec.ts` and the t45 live run.

## Round 7 (t47) — the three leftovers, plus one correction

Same instance discipline as Round 6: test home `/home/fish/dsh-v022-home`, profile `web-v022-test`,
listener `127.0.0.1:3100`; live `:3090` (pid 1773499) was never restarted, stopped or reconfigured.
Twelve new tests, `npm run ci` → 21 files / **333 tests**. Artifacts:
`docs/knowledge/evidence/t47/` (README, `instance-facts.txt`, `notes.txt` + the measurements).

| # | Question left open by Round 6 | Verdict | Evidence |
|---|---|---|---|
| 1 | `Model routes:` appeared only after a settings-page save | **FIXED (ambiguity removed) + one real defect found** | Patch-only configuration (no settings page) reaches the runtime — a temporary dump of what the loader hands `apply()` shows `roles.get()` returning the planner/worker/verifier chains — and the live report names them: `Model routes: planner=bifrost-completions/wb/cn:deepseek-v4.1-flash; worker=…; verifier=…; synthesizer=inherit`. Two code paths could print nothing and both are gone: the line was skipped when every chain was empty (now always printed, `inherit` spelled out) and `failureReport()` hard-coded an empty routing block, so a timeout or unload report claimed `inherit` for a run that had a chain (now derived from the config). `raw-config.json`, `B1-deadline-report.txt`, `test/report.spec.ts`, `test/config.spec.ts` |
| 2 | A deliberately broken first route produced no `Route switches:` entry | **ANSWERED: that configuration never ran** | A chain whose first route names a model the provider does not enumerate is rejected **at load** (`roles.worker names model "wb/cn:no-such-model-probe", which provider "bifrost-completions" does not enumerate`) — the entry fails to apply, so t46 did not see a silent switch, it saw a chain that never existed. Runtime failures do switch and are traced: a 429 on the first route advances to the second and the trail records `w1` failed → `w2`. The `Route switches:` renderer had **no test at all** before t47; it has two now. `A2-load-rejection.txt`, `test/config.spec.ts`, `test/report.spec.ts` |
| 3 | The deadline did not fire live (settings never reached the runtime vs engine ignores abort) | **ANSWERED: the second. FIXED.** | With `timeoutMs: 60000` in the profile patch (no settings page) the run's own report says `workflow exceeded the 60000 ms deadline and was cancelled; **the engine had not settled**`, and the UI run node leaves `running` at 61.5 s. `src/run.ts` used to abort a signal and then wait for the engine; it now races the run result against its own deadline, cancels with a reason that names the deadline (it used to say "cancelled by its caller"), and returns the timeout report immediately. Regression test: a stubborn engine whose `cancel()` is a no-op returns in ~1.0 s for a 1 000 ms deadline. `B1-deadline-report.txt`, `A-run.log`, `test/reliability.spec.ts` |
| 4 | The notice row needs a render path | **CLOSED: not reachable from a plugin in this build — downgraded deliberately** | The persisted event **does** carry `surfaceOp: "append"` (t46's "no such field" was wrong). The client starts an assistant node only on `step/start` (`dsh-client-ui-chat/lib/client.js:8094-8108`); `assistant/message` is an `update` there, and the notice sits at a `(turn, step)` whose `step/start` never happened. `system/message` renders as the system-prompt card (`client.js:9947-9966`), `conversation.chat.node` is a keyed renderer seat whose nodes only the chat package's own projections can create (`client.js:7180-7215`, module-private `chatNode()`), and no toast/notice API ships. Downgrade: the notice stays in the ledger (it also puts the fact into the next turn's context on purpose) and the **report is the only user-facing channel** — verified in the same session. `E5-notice-event.json`, `E3-conversation-after-unload.txt`, `E5-report-relay.txt` |

Round 7 also corrected a Round 6 claim rather than quietly dropping it: row 10 above now says the
notice event carries `surfaceOp: "append"`, and that the drop is the projection's `step/start`
requirement, not a missing marker.

**Deferred to 0.2.3 (with the reason, not a silent drop):** a rendered notice needs a DSH-side way
for a plugin to contribute a chat node, or a notice event with its own projection. Both are DSH API
surfaces, outside the "external plugin, no core change" boundary this work runs under.

## Round 8 (t49) — why the quality results were 0/5, and what the release may claim

Triggered by t48's R2: the test home held 12 reports, one `COMPLETED`, and t46's five acceptance
rounds all reported `FAILED / Failures: 1 quality`. Same instance discipline as Rounds 6–7
(test home `/home/fish/dsh-v022-home`, profile `web-v022-test`, `127.0.0.1:3100`); the live
`:3090` instance (pid 1773499) was not touched, and its profile — which the user has since
edited — was not read or written. Artifacts: `docs/knowledge/evidence/t49/`.

### What the twelve reports actually were

| Group | Count | Reason in the report |
|---|---|---|
| `COMPLETED` | 1 | — (`session-664084e6`, second round) |
| failed — quality | **8** | every one: `incomplete (quality): verifier reported issues: …` |
| failed — infrastructure / cancelled | 3 | the two 60 000 ms deadline probes and the unload probe from t47 — deliberate kills, not quality |

Not one report said `verifier verdict was fail`, `criterion not met` or
`verifier supplied no checked evidence`.

### Root cause: prose overrode the verdict (our defect, not the models')

`checkVerification` (`src/script.ts`) tested, in this order: no result → executor failed →
**verdict ≠ pass** → **`issues.length > 0`** → no checked evidence → criteria count → per-criterion
`met`/evidence. The observed reason string is produced by the fourth test, so in all eight cases
the verifier had returned **`verdict: pass`** and the task failed purely because its prose `issues`
list was non-empty. The notes themselves say so: "Minor inaccuracy, **non-blocking**…", "recorded
as a **minor observation rather than a failure**", "**does not affect any acceptance criterion**",
"处理合理，不影响本次字节级验证结论", "故**判定为满足**".

So the answer to *"flash as verifier too strict, or worker too weak?"* is **neither**: the verifier
was passing the work and adding a caveat, and the plugin turned the caveat into a failure. A
secondary finding from the same data: the flash verifier never once failed a criterion outright —
the model was *not* the limiting factor in these twelve runs.

### The fix

- `issues` no longer decides anything. The decision is `verdict` + one `criteria` entry per
  acceptance criterion with `met` and non-empty evidence; `met: false` or `verdict: fail` still
  fails the task (unchanged, and now pinned by tests).
- A verified task's notes are carried into the report as `Uncertainties` → `verifier note: …`, so
  nothing is lost and the reader still sees the caveat.
- The verifier prompt now defines `issues` as **blocking problems only** (each must be reflected in
  `verdict: fail` / `met: false`) and points residual doubt at `confidence`.

### Verification of the fix

| Check | Result |
|---|---|
| New regression tests (`test/config.spec.ts`, three cases: notes-only pass → `COMPLETED` + notes in `Uncertainties`; `met: false` despite `pass` → failed; `verdict: fail` → failed), using the verbatim live note strings | pass; suite 24/24 in that file |
| Mutation: restore `if (issues.length > 0) return {passed:false…}` | **2 of the 3 new tests fail** — the tests do detect the old behaviour |
| Live A/B on :3100 with the *same* flash chains (planner/worker/verifier all `deepseek-v4.1-flash`), same objectives as t46 rounds 1, 4 and 3 | before the fix: all of them failed (`Failures: 1 quality`); after: **three runs, each `COMPLETED`, 1 task, 1 verified** (`Q2-report.txt`, `Q4-report.txt`, `Q5-report.txt`) |
| Honest limit of that A/B | in all three post-fix runs the verifier recorded **no** issues at all, so the live delta is *consistent* with the fix but not *discriminating*; the discriminating proofs are the branch-order argument above and the mutation-verified tests |
| `npm run ci` | 21 files / **336 tests**, typecheck + lint clean |

### Configuration advice (asked for explicitly)

Nothing about the default chains needs to change to get *correct* decisions any more. What the
recorded data does support: with `maxRetries: 0` a task gets exactly one worker attempt, so any
real quality problem surfaces as a hard failure instead of a repaired one. If a user wants
verification to be stricter or looser, that is `roles.verifier` — a model choice, deliberately not
tuned by the plugin.

### Two operational notes for whoever runs the next instance

1. **Check the plugin card's switch before trusting "no run happened".** On a fresh boot at
   05:12 the card read *disabled* while `cordis.patch.yml` said `disabled: false`, and a message
   sent then was answered directly — no gate, no `plugin:grok-workflow/delivery` record (verified in
   the session log). Clicking the switch on armed the gate immediately: no restart, and the patch
   file's mtime did not change. After the next fresh boot the switch read *enabled*. The rule that
   survives all three observations: read the switch, do not infer it from the patch.
2. **This instance now carries 20 bundles**, including `@orbisapp/remote-dsh` (t48 R6 restored it),
   which closes the one-bundle gap in Round 6 row (h): boot still reports exactly the same three
   pre-existing non-activations.

## Round 9 (t52) — the front desk on `:3100`, and three defects it found

Plan C was implemented and then measured on the same test instance as Rounds 6–8: test home
`/home/fish/dsh-v022-home`, profile `web-v022-test`, listener `127.0.0.1:3100`, raw data in
`docs/knowledge/evidence/t52/`. The live `:3090` instance and its profile were not touched.

Each row is one message typed into one session of the web UI, in this order, with the answer text
kept verbatim in the evidence directory.

| # | Message | Tier the front desk stated | What the user saw | Time |
|---|---|---|---|---|
| M1 | `你好` | 直答档 — 这是问候/寒暄，没有要做的事 | template answer + `（这条没有动用团队，前台直答。）` | ~10 s (no call) |
| M2 | `算一下 5×6 等于多少，只回答数字` | 快手档 — 单一动作、线索完整 | `30` + `（这条只派了一个工人，没有开完整团队。）` | ~21 s |
| M3 | `把这个弄一下` | 确认档 — 信号互相矛盾或线索不足 | `这个要动用团队吗？可回复：简单 / 团队。` | ~10 s |
| M4 | `简单` | 快手档 — 你刚才回答「简单」，按你的选择走快手档 | answer + quick-tier note (the pending answer is remembered) | ~18 s |
| M5 | `用团队：只回答一个字` | 团队档 — 你的消息里点名了团队 | `收到！团队开工中，施工牌在旁边。` then a full report (plan, 1 task, 1 verified) | ~180 s |
| M6 | `你好` | 直答档 | template answer again — the tier does not drift inside a session | ~11 s |
| M7 | `先读一下 src/triage.ts 里的 TRIAGE_LIMITS，然后把两个阈值的意思写成三句说明` | **确认档 (defect)** | asked instead of starting | ~12 s |
| M8 | same message, after the fix | 团队档 — sequencing (was 确认档 before the fix) | the full workflow started and ran to a **failed** report: the objective named a path outside the instance's workspace (`/home/fish/project_jobs`), and the report says so instead of inventing an answer | ~204 s |
| M9 | `你好` with `mode: 'full'` | no tier line at all | the full workflow (`COMPLETED`, 1 task, 1 verified) — the pre-t52 behaviour, i.e. the rollback switch works | — |

### Defects the live matrix found (none of them were visible in unit tests)

1. **The chat tier's single call returned nothing.** `agentsStarted=1 value={"reply":null}`: the
   child answered the social message in prose, and the guest collapses "child failed" and "child
   returned no structured value" into `null`. Fix: the direct tier answers from a template — that
   is also what "秒回" means — and `chatReply()` names what the plugin does.
2. **The quick tier failed the same way, intermittently** (same prompt succeeded twice, returned
   `{"reply":null}` twice). Fix: the plain call (no schema, the child's text is the answer) is the
   primary and a schema-shaped call is the retry; the reason line now carries `agentsStarted`, so a
   future failure is diagnosable instead of just "no text".
3. **Sequencing lost to the conflict rule.** `先…然后…` scored one team point against two fast
   points ⇒ the front desk asked about a plainly two-step request (M7). Fix: `multiStep` is decisive
   before the score comparison; pinned by a test.
4. **A front-desk answer was recorded as a failed delivery.** `answer.kind === 'report'` was the only
   "delivered" case, so a direct answer left the batch routable and the plugin record said `failed`
   (`phase: failed, outcome: triaged-chat` in the session log). Fix: `direct` also settles the batch;
   only `notice` stays routable.

### What this round does *not* establish

- Latency numbers are single samples on a shared instance with a flash route; they are order-of-
  magnitude evidence (seconds vs minutes), not a benchmark.
- The quick tier's "one call" promise is "one call in the common case": when the plain call returns
  nothing, a second (structured) call happens, and the failure text stays truthful.
- M8 shows the team tier starts for a sequenced request; M5 shows a completed team run with the
  greeting. Neither is a statement about the quality of the work the team produced.

### Regression and compatibility

| Check | Result |
|---|---|
| `npm run ci` | 22 files / **358 tests**, typecheck + lint clean (baseline was 21 files / 336) |
| Pre-t52 behaviour preserved | `mode: 'full'` produces the pre-t52 answer shape (no tier line, no greeting); pinned by a test in `test/triage.spec.ts` |
| Existing suites | gate, reliability and composition suites pass `mode: 'full'` explicitly, so their semantics are unchanged |
| Settings page | three new volatile fields (`mode`, `triageAsk`, `triageModel`) projected to the browser form; volatile count 19 → 22, pinned by `test/settings-projection.spec.ts` |

## Round 10 (t54) — the fourteen t53 F1 samples, re-run after the ordering fix

The t53 review found the blocker described in DECISIONS D-025: the direct tier's "short and inert"
shortcut ran before the sequencing and question rules, so short questions and short two-step
instructions were answered from the greeting template — honest tier line, no work done. After the
reorder, the fourteen directed samples were sent one at a time through the front desk of the test
instance (`/home/fish/dsh-v022-home`, profile `web-v022-test`, `127.0.0.1:3100`; live `:3090`
untouched). Page text, screenshots and timings: `docs/knowledge/evidence/t54/`.

| # | Sample | Tier observed | Did it do the work? |
|---|---|---|---|
| 1 | `为什么天空是蓝的` | 快手档 (`question`) | yes — a Rayleigh-scattering answer from one worker |
| 2 | `今天几号` | 快手档 (`question`) | yes — answered from the date |
| 3 | `解释幂等` | 快手档 (`question`) | yes — an explanation |
| 4 | `what is idempotency` | 快手档 (`question`) | yes — same, English |
| 5 | `how many files are in src/` | 快手档 (`question`) | yes — the worker counted and reported |
| 6 | `先备份然后升级` | team (work done; see note) | yes — produced `.backups/`, `upgrade/`, `UPGRADE_REPORT.md` |
| 7 | `先建目录再拷文件` | team (work done; see note) | yes — produced `dsh-backup-copy-20261029/`, `COPY_REPORT.md` |
| 8 | `备份数据库并通知我` | team (work done; see note) | yes — produced `.backups/db-backup-…/`, `DB_BACKUP_REPORT.md`, `NOTIFY.md` |
| 9 | `1) 备份 2) 升级` | team (rule; unit test only) | not sent live — the budget went to the three above |
| 10 | `这个报错 src/triage.ts:42` | 快手档 (`single-step`) | yes — dispatched instead of being asked about (this was the second defect) |
| 11 | `改一下那个` | 确认档 (`ambiguous`) | asked back, nothing dispatched — still correct |
| 12 | `简单` | 快手档 (`pending-fast`) | read as the answer to sample 11 |
| 13 | `团队` | 直答档 (`stale-choice`) | said the pending question was gone; nothing dispatched, no crash |
| 14 | `你好` | 直答档 (`small-talk`) | template, no dispatch |

Note on rows 6–8: the answer had not arrived when the capture budget ran out (row 6 was still
executing at 900 s), so their page captures carry no tier line. The team tier is nonetheless
established for them by the work itself: the directories and reports listed above cannot be produced
by the template or by a single quick worker, and the classifier returns `team`/`multi-step` for those
exact strings in `test/triage.spec.ts`.

### An operational hazard this round exposed (and what was done)

The profile's workspace is `/home/fish/project_jobs`; **starting the instance from another directory
does not change it**. Rows 6–8 therefore did their work in a live workspace: 329 MB of backups,
copies and reports, all created by the samples themselves. Everything created was moved to
`/tmp/t54-quarantine/` (listed in `evidence/t54/QUARANTINE-MANIFEST.txt`, restorable with one `mv`).
Nothing pre-existing was modified or deleted, the dsh install is still `0.2.1-rc.2`, and `:3090` was
never read or written. Any future matrix must either point the profile at a scratch workspace or
use objectives that name no filesystem action at all.

### Regression and compatibility

| Check | Result |
|---|---|
| `npm run ci` | 22 files / **362 tests**, typecheck + lint clean (was 358; +4 regression groups for this blocker) |
| The ordering contract | the four new test groups pin: questions → at least the quick tier in zh and en; short two-step / `1) 2)` / `一、二、` / semicolons → team; a path-, code- or snippet-bearing pointer → dispatched, while `改一下那个` still asks; bare `简单` / `团队` → direct tier with an explanation, with and without a pending question |
| `mode: 'full'` | untouched by this change; still reproduces pre-t52 behaviour (Round 9, `evidence/t52/M9-full-mode-rollback.txt`) |
| Version | `package.json` / `package-lock.json` at `0.2.3`, `CHANGELOG.md` `## [0.2.3]`, release-notes draft written; the `0.2.2` … `0.1.0` sections are byte-identical to their tags |

## Round 11 (t56) — v0.2.3 收尾：残留清理、中文 README、分类器三处缺口 + 隔离工作区上的 44 条矩阵

**这一轮的纪律前提**：真机矩阵跑在一次性工作区 `/tmp/t56-work` 上（[TESTING.md](TESTING.md) 规则 1/8/9），
会话目录为 `sessions/--tmp-t56-work--/<uuid>/`，用户目录 `/home/fish/project_jobs` 本轮零新增。
上一轮（t54）的第二批残留也在这一轮清掉，见 §1。

### 1. 用户目录残留清理（N2）

| 项 | 处理 | 结果 |
|---|---|---|
| `.backups/db-backup-20261029-104117`（3.6 MB，19 个库的只读副本 + `run_backup.sh` + `logs/`） | `realpath` 校验 → `mv` 到 `/tmp/t54-quarantine/batch2-1041/` | 已移出 |
| `DB_BACKUP_REPORT.md`（87,282 B，md5 `8aabaf7b…`） | 同上 | 已移出 |
| `NOTIFY.md`（2,617 B，md5 `64990a84…`） | 同上 | 已移出 |
| 复扫 `/home/fish/project_jobs`（`-newermt 2026-10-29 10:39`，排除 SQLite 边车） | `find` | **命中 0 项** |
| 既有文件是否被改 | 对比 mtime | 未被修改（如 `猎聘/data/liepin.db` 仍是 10-28 04:08） |
| SQLite 边车 | 25 个 `*.db-shm`、25 个零字节 `*.db-wal` 的 mtime 被只读打开更新 | 如实记录，**不删除**（属 SQLite 自己，删除可能丢未合并 WAL） |

隔离目录 `MANIFEST.txt` 记录批次/体积/md5，`batch2-1041.hashes.txt` 是 139 个文件的逐文件哈希；一条 `mv` 可还原。

### 2. 分类器三处缺口（N3，改实现而非改契约，DECISIONS D-026）

| 缺口 | 修法 | 用例 |
|---|---|---|
| 句尾"几" | `几[个号年月天时分秒]` → `几(?![十百千万乎])` | `3+5等于几`、`这个得几`、`还剩几台机器`、`有几条记录`、`这是几`、`还剩几`、`5的平方是几`、`这台机器几核` → 全部 `fast`/`question` |
| 纯顿号列表 | 新增 `COMMA_LIST`（三个及以上顿号项算多步） | `改配置、重启、验证` → `team`；`读、写` → `fast`（两个项不算多步） |
| `并+回滚` | 动词表补 `回滚\|回退\|重启\|验证\|灰度` | `并回滚到上一版`、`备份、升级后并回滚` → `team` |

**真机抓到的两处误判（单测没覆盖）**：

| 输入 | 修前（真机会话） | 修后（真机会话） |
|---|---|---|
| `is this repo using esm or cjs` | `Tier: confirm`（对一个问题反问了一遍） | `档位：快手档` |
| `这个得几` | `确认档`（被"模糊即反问"拦住） | `快手档` |

修法：英文是非问句按**助动词前置**识别（`is/are/does/do/can/… + this/that/it/…`），并给 `MULTI_STEP` 补英文顺序词
（`then`/`first…then`/`afterwards`/`finally`），保证 `do this then another` 这类祈使多步不被误判为问句。

### 3. 44 条真机矩阵（t55 的 22 + t53 的 14 + 新的 8）

| # | 样本 | 规则判定 | 真机档位 | 判定 |
|---|---|---|---|---|
| 1 | `明天要带伞吗` | fast (`question`) | fast | 合理 |
| 2 | `这个函数的时间复杂度是多少` | fast (`question`) | fast | 合理 |
| 3 | `vue3 和 react 哪个更适合小项目` | fast (`question`) | fast | 合理 |
| 4 | `为什么 npm install 会卡住` | fast (`question`) | fast | 合理 |
| 5 | `node 版本最低要求是几` | fast (`question`) | fast | 合理 |
| 6 | `is this repo using esm or cjs` | fast (`question`) | fast | 合理 |
| 7 | `what does the -u flag do in npm ci` | fast (`question`) | fast | 合理 |
| 8 | `how long does the build take` | fast (`question`) | fast | 合理 |
| 9 | `先跑 lint 再提交` | team (`multi-step`) | team | 合理 |
| 10 | `备份一下数据库并通知我` | team (`multi-step`) | team | 合理 |
| 11 | `改完配置记得重启服务并回滚说明` | team (`multi-step`) | team | 合理 |
| 12 | `一、拉取代码 二、跑测试 三、发版` | team (`multi-step`) | team | 合理 |
| 13 | `1. 建分支 2. 改代码 3. 提 PR` | team (`multi-step`) | team | 合理 |
| 14 | `改配置、重启、验证` | team (`multi-step`) | team | 合理 |
| 15 | `这个报错 src/triage.ts:120 是什么引起的` | fast (`question`) | fast | 合理 |
| 16 | `那个配置 packages/dsh/tsconfig.json 里的 target 要不要改` | fast (`single-step`) | fast | 合理 |
| 17 | `早上好呀` | chat (`small-talk`) | chat | 合理 |
| 18 | `辛苦了` | chat (`small-talk`) | chat | 合理 |
| 19 | `团队` | chat (`stale-choice`) | chat | 合理 |
| 20 | `quick` | chat (`stale-choice`) | chat | 合理 |
| 21 | `加一个 --verbose 开关到 CLI` | fast (`single-step`) | fast | 合理 |
| 22 | `写一份 README 的安装章节` | fast (`single-step`) | fast | 合理 |
| 23 | `为什么天空是蓝的` | fast (`question`) | fast | 合理 |
| 24 | `今天几号` | fast (`question`) | fast | 合理 |
| 25 | `解释幂等` | fast (`question`) | fast | 合理 |
| 26 | `what is idempotency` | fast (`question`) | fast | 合理 |
| 27 | `how many files are in src/` | fast (`question`) | fast | 合理 |
| 28 | `先备份然后升级` | team (`multi-step`) | — | 未覆盖（见说明） |
| 29 | `先建目录再拷文件` | team (`multi-step`) | — | 未覆盖（见说明） |
| 30 | `备份数据库并通知我` | team (`multi-step`) | — | 未覆盖（见说明） |
| 31 | `1) 备份 2) 升级` | team (`multi-step`) | — | 未覆盖（见说明） |
| 32 | `一、备份 二、升级` | team (`multi-step`) | — | 未覆盖（见说明） |
| 33 | `备份；升级；通知我` | team (`multi-step`) | — | 未覆盖（见说明） |
| 34 | `这个报错 src/triage.ts:42` | fast (`single-step`) | fast | 合理 |
| 35 | `改一下那个` | ask (`ambiguous`) | ask | 合理 |
| 36 | `你好` | chat (`small-talk`) | chat | 合理 |
| 37 | `3+5等于几` | fast (`question`) | fast | 合理 |
| 38 | `这个得几` | fast (`question`) | fast | 合理 |
| 39 | `还剩几台机器` | fast (`question`) | fast | 合理 |
| 40 | `有几条记录` | fast (`question`) | fast | 合理 |
| 41 | `这是几` | fast (`question`) | fast | 合理 |
| 42 | `还剩几` | fast (`question`) | fast | 合理 |
| 43 | `5的平方是几` | fast (`question`) | fast | 合理 |
| 44 | `这台机器几核` | fast (`question`) | fast | 合理 |

真机覆盖 **38 / 44**，**误判 0 条**。覆盖方式（全部在隔离工作区 `/tmp/t56-work` 上跑，会话目录
`sessions/--tmp-t56-work--/session-*` 为证）：第一轮 V1–V14、第二轮 V18–V22 + T1–T5 + T12–T14 + J1–J8、
第三轮 V15–V17。**未覆盖的 6 条（T6–T11）都是团队档带文件系统动作的样本**：它们在预算内完成不了
（`先备份然后升级` / `备份数据库并通知我` / 序号与分号形式的那几条），继续等待只会把一个"档位表"变成
"性能测量"，所以它们以规则判定 + V9–V14 六条团队样本的真机结果为准（那六条在同一实例上全部显示
`档位：团队档`）。这不是"没测"，是"测得起的部分都测了、测不起的部分如实标注"。

> 复现注意：一次真机会话同时只能有一个 turn 在跑。第一轮脚本按固定预算发下一条，结果 20 多条消息被
> 丢弃（会话里 `user/message` 只有 14 条），教训已写进 [TESTING.md](TESTING.md) 规则 10：**发下一条前
> 必须等到本轮答案落地**，判据是会话日志里 `assistant/message` 计数增长，而不是页面里出现档位行。



### 4. 两条不变量

| 不变量 | 判定 | 证据 |
|---|---|---|
| **多步永不吃模板** | 所有多步样本（`先…再/然后`、`1)/一、`序号、顿号列表、分号、`并+动词`）落在 `团队档`，无一落 `直答档` | 本表 team 行 + `test/triage.spec.ts` 的 multi-step 回归组 |
| **已识别的问句形态永不用模板** | 所有**被规则识别**的问句（中/英，含句尾"几"、`?`、wh-词、助动词前置，以及 t58 补的 `A不A`/`A没A`、`还是` 二选一、`谁`）落在 `快手档` 或以上，无一落 `直答档`、无一落 `确认档`；规则没认出来的形态不在此承诺之内（见 D-027） | 本表 question 行 + 6 组问句回归测试（规则级验证，本轮未跑真机） |

### 5. 构建与回归

| 检查 | 结果 |
|---|---|
| `npm run ci` | 22 文件 / **366 例**通过，typecheck 与 `oxlint` 0 警告 0 错误（362 → t56 的 365 → t58 的 366） |
| `mode: 'full'` | 本轮未改动该分支；仍由既有测试与 Round 9（`evidence/t52/M9-full-mode-rollback.txt`）钉住 |
| 版本 | `package.json` / `package-lock.json` = `0.2.3`；CHANGELOG `## [0.2.3]`；发布说明草稿已存在 |

### Round 11 addendum (t58) — 规则级验证

t57 的三条 low 修补在本轮完成，**本轮没有真机矩阵**（改动全在分类器规则内，单测是权威证据；真机只会重复
Round 11 已经证明的"档位行照常出现"）：

| 项 | 内容 | 结果 |
|---|---|---|
| L1 测试数统一 | README（EN/ZH）、RELEASE-NOTES-0.2.3、DECISIONS 的当前值统一为实际数（并保留 336→358→362→365→366 的历史链） | 366 |
| L2 证据路径 | `evidence/t56/README.md` §0 里写错的路径改为 `/tmp/t56-evidence/W0-workspace.txt`（578 B），并说明它是临时证据、不在仓库内 | 已改 |
| L3 问句形态 | 新增 `A不A`/`A没A`、`还是` 二选一、`谁` 三条**形态**规则与三条排除规则（见 D-027）；三条对抗探针原句全部 `fast`/`question` | 通过 |

验证方式：`npm run ci` = typecheck + oxlint（0/0）+ build + **22 文件 / 366 例**。本轮**规则级验证**，
无真机样本。

### Round 12 (Issue #22 Phase 1) — 对话可靠性：源码级证据与结论

本节只记录 Phase 1（P0-1…P0-4）的实测证据。分支 `fix/phase1-dialogue-reliability`，基准为
`origin/main` = `3584ef1ec24cb487fed79943a687ca06fe3fccfd`（实施时 `git ls-remote origin main` 实测）。
DSH 安装：`/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@deepseek-ai/dsh/`
（`package.json` 版本 `0.2.1-rc.2`）。

#### R12-1 `agent/pre-step` 与 `enter.messages` 的真实语义（P0-1 根因）

| 位置 | 结论 |
|---|---|
| `node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js:902-921` `async preStep(target, position)` | 第 906 行 `const claimed = this.inbox.claim(target, position.turn)` 把本轮消息**从 inbox 取出**；第 909 行开始 waterfall，默认 `next()` 在第 918 行返回 `{kind:'enter', messages:[...claimed, context]}` |
| `node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js:1066-1073` `async step(decision)` | 真正写 session 的是这里：对 `decision.messages` 逐条 `session.append("user/message", message, {surfaceOp:"append"})`（`runtime-context` 除外）。**`enter.messages` 是这一批消息唯一的提交点** |
| `node_modules/@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts:294-297` | 类型定义原文：`Reject a proposed step or replace the messages that enter it. Calling next() preserves the current messages.` / `payload.messages - messages removed from the inbox for this step.` |
| `dsh-agent-loop/lib/index.js:921` | waterfall 之后立刻 `signal.throwIfAborted()`：**已经 abort 的回合会丢弃 enter 决策**，所以取消时返回 `notice` 没有意义，只能 `reject` 让宿主把回合标成 interrupted |

结论：`preStep` 已经 `claim` 走的消息，只有 `enter.messages` 能把它写进 transcript；
只把报告放进 `enter.messages` 等于**删掉用户原话**。而 `enter.messages` 与
`session.append('user/message', …)` **不能同时用**——同一个对象会被写两次（一次在 `step()`，
一次在插件），所以：

- `in-turn`：把被 claim 的消息放回 `enter.messages`，报告追加在它后面（唯一写入者是 loop）；
- `relay` / `append`：整步 `reject`，没有任何东西会提交这一批，插件才自己 `session.append` 那一条。

#### R12-2 测试与回归

| 检查 | 结果 |
|---|---|
| 既有测试的语义调整 | `test/gate.spec.ts` 3 处：分类失败由 `reject` 改为带原因的 `enter`（P0-3）；`append` 策略现在会多一条「用户原话」写入（P0-1）；in-turn 断言从 `messages[0]` 改为「首条是原话、末条是答复」 |
| 新增 | `test/phase1-dialogue.spec.ts`（27 例，P0-1…P0-4，含重放/重开、TTL、串线、重复消费、脱敏、取消终态）与 `test/triage.spec.ts` 的 P0-2 纯函数组（3 例） |

#### R12-3 真实 DSH GUI + 真实模型（已测，证据在 `docs/knowledge/evidence/p1-gui/`）

隔离实例（不是 live `:3090`：它需要自己 `dsh web` 打印的令牌，仓库 D-013 也禁止重启/改配它）
用本分支 `npm run build` 产物加载插件，profile 从 shipped `web` 模板起，会话工作区是
`<worktree>/.dsh-home/workspace` 这个一次性目录（快捷工人自己在回答里报了该路径）。模型走
`bifrost-completions / wb/cn:deepseek-v4.1-flash`（密钥只在环境变量里）。四类路径都拍了真实浏览器截图：

| 路径 | 证据 | 结论 |
|---|---|---|
| P0-1 原话保留 + 重开会话 | `01-p01-before-reload.png`、`02-p01-after-reload.png`、`p01.log` | 原话在报告之前、只出现一次；刷新并重开会话后仍在、顺序不变（`AFTER_RELOAD_OCCURRENCES=1`） |
| P0-2 确认档往返 | `03-p02-question.png`、`04-p02-simple-answer.png`、`05-p02-team-running.png`、`p02sim.log`、`p02team.log` | 问句可见；答「简单」后快手档回答明说「『简单模式』只是对上一个确认档问题的回答，不是新的任务目标」，说明原任务与选择词同时到位；答「团队」后团队档真的开工 |
| P0-3 内部错误可见终态 | `08-p03-error-terminal.png`、`p03.log`、`p03-probe.patch.yml` | 只有 workflow 角色指向坏端点（助手自己的模型仍可用）时，界面上出现带原因的失败报告，`HAS_SUCCESS_WORDING=false` |
| P0-4 取消终态 | `06-p04-cancelled.png`、`07-p04-cancelled-after-reload.png`、`p02team.log` | 点一次停止后写出「运行已取消（cancelled）…」，刷新后仍在 |

#### R12-4 真机复核查出的缺口：取消时原话与终态一起消失（已修）

在同一实例上按停止后，会话事件里只有 `agent/inbox/spliced`（claim 走原话）→
`tool-workflow/run-end cancelled` → `turn/end aborted`，**没有任何 `user/message`，也没有任何报告**：
`answerInTurn` 在 abort 后只 `record(...)` 然后 `reject`，而那一批消息早已被 `inbox.claim` 取走，
于是用户看到的是一段空白 + 一个没有原因的「已停止」。修复：`src/gate.ts` 新增
`cancelledText()` 与 `commitCancelled()`，两条 abort 分支在 `reject` 之前先按原对象提交被 claim 的消息
（整步已 reject，插件是唯一写入者，不重复），再写一条说明终态的助手消息。
`test/phase1-dialogue.spec.ts` 的「P0-4: a cancelled turn keeps the message and states the terminal」
两例锁定该行为（GUI 截图见 R12-3 的 P0-4 行）。

#### R12-5 未包含（NOT_RUN）

- `npm run test:e2e`（`scripts/e2e-headless-in-turn.sh`）：未执行——它会写真实 `$DSH_HOME` 会话，
  本轮的真机证据改由上面的隔离 GUI 实例提供，两者不互相替代。
- `relay` / `append` 策略的真机行为：只有单测覆盖，未在 GUI 上验证，PR 未声称其已支持。

## Round 13 (t59) — PR #26 review close-out: three fallback findings, reproduced then fixed

`CONFIRMED` — every number below comes from a command run in a clean worktree on
`fix/fallback-shards` (branch `pr26-closer`, base `2e9c26a` = `origin/main` after PR #23; the branch
was rebased onto it from `334daf6`, work commit `68f3d15`, pre-rebase `5cbccf2`).

The three findings are the codex review on PR #26 at commit `6e902e0` (all P2,
`has_unresolved_findings: true`). Each was reproduced before it was fixed:

| Finding | Reproduced as | Fix | Test that pins it |
|---|---|---|---|
| Surrogate back-off adds a segment, but the cap came from a formula | 32,000-char objective with a surrogate pair at every 4,000 boundary splits into 9 segments vs `ceil(chars / 4000)` = 8; with `maxTasks: 6` the report is rejected as "has 9 tasks but maxTasks is 6" | segment count now comes from `src/shards.ts` (`shardCountFor`), shared by the generated script and host validation | `test/fallback-shards.spec.ts` "accepts the extra segment that surrogate back-off adds at every boundary" |
| JSON escaping tripped the 48,000-character aggregate budget | 32,000 quote characters serialize to 67,353 characters → `report-invalid` in `run.ts`, discarding the fallback | for `source: 'fallback'` the validator checks the segments themselves (exact equality with the splitter's output) instead of applying the authored-text budget | "...dense in JSON escapes" |
| Arbitrary slices became independent tasks | 4,001 characters produced `[4000, 1]` (a one-character task), every shard shared one generic criterion, cuts could land mid-sentence | balanced segments, cuts moved onto a nearby paragraph/sentence/word break, segment-scoped criterion and context | "balances a 4,001-character objective...", "moves a segment boundary onto the sentence end...", "scopes each segment criterion..." |

| Command | Result |
|---|---|
| `npm run ci` (typecheck + oxlint + build + vitest) | exit 0, **27 files / 487 tests passed**; oxlint 1 warning / 0 errors (pre-existing, `src/redact.ts:155`) |
| `npx vitest run test/fallback-shards.spec.ts test/objective-limit.spec.ts` | 2 files / 32 tests passed |
| `npm run build && git diff --exit-code -- lib/` | exit 0 — committed `lib/` matches the build |

Rebase onto `2e9c26a` (PR #23, P0 dialogue reliability) conflicted in two files, both resolved by
hand: `test/objective-limit.spec.ts` (main rewrote the scripted-child double to read
`parseMemberLabel` labels, while this branch rewords the verifier to answer the task it was handed —
kept main's label dispatch and the branch's `taskFromPrompt` answer) and this file (main's Phase 1
record already owned "Round 12", so this record became Round 13 and both are kept).
`src/gate.ts`, `src/run.ts` and `src/triage.ts` and their `lib/` outputs are unchanged from
`2e9c26a` (`git diff --stat 2e9c26a HEAD -- src/gate.ts src/run.ts src/triage.ts lib/gate.js
lib/run.js lib/triage.js` is empty), so the P0 semantics merged in PR #23 are not overwritten.

`NOT_RUN` — `npm run test:e2e` and a real DSH GUI run: both need a live profile and
model routing. Every case above executes the real generated script in `node:vm`
with scripted children; no model API is called.

## Round 14 (t59) — 隔离实例上的真模型 E2E（wb/cn:deepseek-v4.1-flash）：两个真 bug + 修复

**环境**：全新隔离 home `.dsh-home/e2e1`（真实 `~/.dsh` 与 `~/dsh-layerfs` 零改动），dsh `0.2.1-rc.2`，
node `26.8.1`，模型 `bifrost-completions / wb/cn:deepseek-v4.1-flash`（凭据仅经 `BIFROST_VIRTUAL_KEY`
环境变量）。`grok-e2e` = headless profile（`workflow-ptc` 自带开启）；`grok-web` = web profile
（插件行 + `workflow-ptc.disabled: false`）。证据：`.dsh-home/e2e1/evidence/t{1..7}`、`work.log`。

### 1. 测试矩阵

| # | 配置 / 输入 | 期望 | 结果 |
|---|---|---|---|
| T1 | `mode: triage` + `grokDefault: on`，一句问句 | 门控认领、前台分档 | **PASS**：`Tier: quick`，一个 worker，脚注"not the full team" |
| T2 | `mode: full` + `on`，写 `hello.txt` 并回读 | 完整流程 + 真证据 | **PASS**：`COMPLETED`，1 task verified；`ls/stat/python/od/sha256` 独立证据；文件 15 B 无尾换行 |
| T3 | `grokDefault: off`（默认），"reply PONG" | 不拦、直接答 | **PASS**：仅 `PONG`，无工作流 |
| T4 | `mode: full`，两个独立文件任务 | 并行 + 2/2 验证 | **PASS**：`COMPLETED`，2 tasks 2 verified，内容精确；verifier 如实记录兄弟任务不确定性 |
| T5 | 写 `/proc/grok-should-fail.txt` | 不谎报 | **FAIL（BUG-59-1）**：`COMPLETED`，1 verified —— 目标被 planner 软化成"尝试并如实报告（预期被拒）"，验证员对着软化标准全过 |
| T5b | 同上，修复后 | `FAILED` | **PASS**：`FAILED`，0 verified，`executor reported failed`；planner 恢复真实目标 |
| T6 | 一个成功 + 一个必然失败 | `PARTIAL` | **PASS**：`PARTIAL`，2 tasks，1 verified |
| T7 | 回归：`mode: full` 写 `regress.txt` | 仍 `COMPLETED` | 见下（本轮实测） |

### 2. BUG-59-1（质量，核心承诺）：失败的活被报成 COMPLETED

- **现象**：T5 的目标在 `/proc` 下必然失败，worker 自报 `BLOCKED`，但最终 `Grok workflow: COMPLETED`。
- **根因（两处叠加）**：
  1. `checkVerification` 只在 `execution.status === 'failed'` 时否决，**`partial` 不被拦**；
  2. planner 被允许把目标改写成"尝试 X 并如实报告"，验收标准因此绕开真实目标（T5 任务标题即
     `Attempt /proc/... write, then report ... (expected denial)`）。
- **修复**：`checkVerification` 改为 **只有 `execution.status === 'completed'` 才可能通过**
  （自报 partial/failed 是承认未完成）；planner 提示词加"验收标准必须是目标要求的**终态**，不得改写成
  '尝试并报告'/'预期失败'"；verifier 提示词加"executor 说被阻塞/拒绝/未达成时 verdict 必须 fail"。
- **回归**：`test/orchestrator.spec.ts` 新增"worker 自报 partial + verifier 通过 → 任务必须 failed、
  总状态 failed、尝试数 = 1 + maxRetries"。
- **复测**：T5b `FAILED`。

### 3. BUG-59-2（用户可见契约）：`/grok` 承诺完整流程，实际被前台分诊截走

- **现象**：`/grok` 成功文案说"每条消息都走完整工作流"，但部署默认 `mode: triage`，简单消息走直答/快手档
  （T1 已实测）。
- **修复**：`ModeRecord` 增加可选 `workflowMode: 'full' | 'triage'`；`/grok` 写入 `workflowMode: 'full'`；
  闸门在 `produceAnswer` 用会话记录的形状覆盖部署 `mode`（配置级 `grokDefault: on` 仍尊重 `mode`，
  供部署方选择）。
- **回归**：`test/triage.spec.ts` 新增"会话 `/grok` 记录 → 无档位行、引擎启动 1 次"；
  `test/mode.spec.ts` 增加 `workflowMode` 校验；`test/command.spec.ts` 断言写入形状。

### 4. 本轮测试数字

- `npm run ci`：**24 文件 / 400 例 PASS**（t59 前 396；+1 orchestrator、+2 mode、+1 triage；
  command/mode 既有断言随文案与形状更新）。
- 真模型 E2E：T1–T7（7 次真实运行），仅 T5 为失败样本（即 BUG-59-1），其余 PASS。

### 5. NOT_RUN（诚实边界）

- **真 Web GUI 里的 `/grok`**：web 实例已起在 `127.0.0.1:3199` 并完成 token 交换，但 API 是
  WebSocket（`/api/remote.mux`）的 Typert Remote 协议，本轮未手搓 RPC；命令行为由
  `test/command.spec.ts`（真 cordis + 真 commands 服务 + 真 Session，11 例）覆盖，**GUI 交互未验**。
- **设置页卡片在浏览器中的渲染**：未开浏览器，未验。

## Round 15 (t57) — 真 Web GUI：`/grok` 可切 + 设置页卡片渲染（隔离实例，PASS）

`CONFIRMED` — 在 `origin/main` `6806426` 上新建的一次性隔离实例里，用真 Chromium 驱动真 Web GUI，
把 Round 14 §5 留下的两项 `NOT_RUN` 跑完了：`/grok` 在 GUI 里可切（默认普通聊天 → `/grok` 全流程 →
`/grok off` 回普通聊天），设置页 `Grok workflow` 卡片可渲染、可保存、可持久化、并对**新会话**生效。
本轮**未改任何源码**（`src/` `lib/` `test/` 的 diff 为空）。

证据（只读，全部在本机 `.workflow-artifacts/gui-verify/` 下，未入库）：

- `README.md` — 隔离证明、模型偏离、逐步结论（本轮的原始记录）。
- `shots/` — 20 张 PNG（`A1`/`A2`、`B1`–`B4`、`C1`–`C4`、`D1`–`D5`、`E1`、`recon-*`/`probe-*`）。
- `logs/` — `dumpconfig-step1.txt`、`dumpconfig-step2.txt`、`plugin-add.txt`、`stepB2.log`、`stepC.log`、
  `stepD.log`、`stepD-recon.log`、`stepE.log`、`patch-before-settings.md5`。
- `scripts/` — 产出上述证据的 Playwright 脚本（`lib.cjs`、`stepA.cjs`、`stepB2.cjs`、`stepC.cjs`、
  `stepD.cjs`、`stepE-default-on.cjs`）。
- `dsh-home/` — 一次性实例的 home（sessions、patch 层、node_modules）。

### 0. 隔离边界（D-013：不碰在跑的服务）

| 项 | 值 |
| --- | --- |
| `DSH_HOME` | `.workflow-artifacts/gui-verify/dsh-home`（本轮新建） |
| Profile | `gw-gui`，由 `--from-default-profile web` 生成（stock 模板，未复用任何既有测试 home） |
| 会话工作区 | `.workflow-artifacts/gui-verify/work`（UI 侧栏名 `gw-gui-verify-work`，每张截图可见） |
| 实例端口 | `127.0.0.1:3199`（起前确认空闲；只杀自己的 PID） |
| 在跑的 `:3090` | 全程在听，其 `profiles/web/cordis.patch.yml` mtime 保持 `19:00` 未变 |

激活（D-014）：`cordis.patch.yml` 把 `workflow-ptc` 打开为 `disabled: false`，合成树确认该行生效
（`logs/dumpconfig-step2.txt:337`），插件行为 `dsh-grok-workflow`（`:1257`）；启动行干净，无
`pending (waiting for service: workflowEngine)`。

### 1. 验证 1 —— `/grok` 在真 GUI 里可切（三步）

同一实例、真 Chromium（Playwright `chromium-1248`）、真 Web GUI。

| 步 | 配置 / 输入 | 结果 | 截图 / 日志 |
| --- | --- | --- | --- |
| (a) 默认态 | `grokDefault: off`，新会话 `session-baa80b7b…`，普通消息「用一句话说明什么是 HTTP 状态码 404。」 | **PASS**：`Completed in 12s`，一条直答，`1 turns 1 steps`；**无** `GROK-WORKFLOW-REPORT`、无档位行、无 subagent 徽标 | `shots/A1-default-empty-session.png`、`A2-default-plain-answer.png` |
| (b) `/grok` | 新会话 `session-59bd9427…`，先 `/grok`，再「把 12、7、25 三个数字按升序排序…」 | **PASS**：GUI 渲染命令行 `grok — Grok workflow ON — every message now runs the full plan→execute→verify workflow.`；会话头出现 `3 subagents` 徽标；回答里是完整报告（`Grok workflow: COMPLETED`、`Plan: planner; 1 task(s); 1 verified`、`sort-average-123: verified (1 attempt)`、`Model routes: planner=inherit; worker=inherit; verifier=inherit; synthesizer=inherit`、`Deadline: 3600000 ms per run`）；`Completed in 1m 41s` | `shots/B1-command-menu.png`、`B2-command-submitted.png`、`B3-workflow-answer.png`、`B4-workflow-answer-top.png`、`logs/stepB2.log` |
| (c) `/grok off` | **同一**会话，`/grok off`，再「用一句话解释什么是 JSON。」 | **PASS**：命令行 `grok — Grok workflow OFF — normal chat.`；下一条 `Completed in 11s`，直答，**无**报告、无 subagent | `shots/C1-reopened-session.png`（证明同一会话仍留着第 (b) 步的报告）、`C2`、`C3-command-off-done.png`、`C4-back-to-plain-chat.png`、`logs/stepC.log` |

会话日志独立复核（本轮重跑，不只看 `README.md` 的自述）——`session.v4.jsonl.zstd` 解压后：

```text
session-59bd9427…: "command/run" name=grok args=" "        → command/done "…workflow ON…"
                   plugin:grok-workflow/mode {"enabled":true,"setBy":"command:/grok","workflowMode":"full"}
                   "command/run" name=grok args=" off"     → command/done "…workflow OFF…"
                   plugin:grok-workflow/mode {"enabled":false,"setBy":"command:/grok off"}
                   GROK-WORKFLOW-REPORT 出现 2 次；assistant/message 2 条；name=grok_workflow 1 次
session-baa80b7b…: GROK-WORKFLOW-REPORT 0 次；plugin:grok-workflow/mode 0 次（纯普通聊天）
```

这条与 Round 14 的 BUG-59-2 修复对应：`/grok` 写入 `workflowMode: 'full'`，所以在部署默认
`mode: triage` 下也走完整流程，而不是被前台分诊截走。

### 2. 验证 2 —— 设置页卡片渲染、保存、持久化、生效

Plugins 页 → `Grok workflow` 卡片存在（副标题 "A mandatory workflow for every message: entry gate,
per-role model chains, concurrency and run records"），安装的 bundle 名为 `dsh-grok-workflow`
（`shots/D1-plugins-page.png`）。打开卡片渲染出插件自己的页面，`Grok mode default` / `grokDefault`
是一个活的 `off | on` 选择器（`shots/D2-grok-card-open.png`）。

| 步 | revision | `grokDefault` | 保存按钮 | 截图 |
| --- | --- | --- | --- | --- |
| 打开 | `0` | `off` | `Save` | `D2-grok-card-open.png` |
| 改为 `on` | `0` | `on` | `Save (1)` | `D3-grok-default-on-edited.png` |
| 点保存 | **`1`** | `on` | `Save` | `D4-grok-default-saved.png` |
| 整页刷新 | **`1`** | `on` | `Save` | `D5-grok-default-after-reload.png` |

落盘证据：保存向 profile 的 `cordis.patch.yml` 写入新行，文件 md5
**`d7830129b011b732dfa9bec4059f9ff4` → `1f628a0c984daa951aca818879f43a4e`**
（`logs/patch-before-settings.md5` 存的是改前值；改后值本轮用 `md5sum` 重新核对，与 `README.md` 一致）：

```yaml
- id: grok-workflow
  name: dsh-grok-workflow
  config:
    grokDefault: on
```

保存的值是**功能性**的，不是装饰：保存后**新开**一个会话，不发 `/grok`，只说
「把 3 和 4 相加，只回答结果。」——工作流自己跑了起来，回的是快手档报告（`1 subagent`、
`Completed in 30s`、`档位：快手档 … （这条只派了一个工人，没有开完整团队。）`），
即 `grokDefault: on` 对新会话生效（`shots/E1-default-on-plain-message.png`、`logs/stepE.log`）。

### 3. NOT_RUN → CONFIRMED 的两项

| Round 14 §5 的 NOT_RUN | 本轮结论 |
| --- | --- |
| 真 Web GUI 里的 `/grok`（当时只到 WebSocket/Typert Remote 协议边界） | **CONFIRMED**：§1 (a)(b)(c) 三步在真 GUI 上通过，命令事件、模式事件、报告文本三处独立可查 |
| 设置页卡片在浏览器中的渲染 | **CONFIRMED**：§2 卡片渲染、编辑、保存（revision 0→1）、刷新后保持、新会话生效 |

### 4. 五处环境偏离（必须如实标注，勿当成"标准环境"证据）

1. **`DSH_HOME` 不在 `/tmp`**，在 `.workflow-artifacts/gui-verify/dsh-home`。原因：本沙箱 `/tmp` 是
   每次 shell 调用重建的 tmpfs（两次探针复现：上一次写的 `/tmp/gw-probe2/stamp.txt` 下一次即
   `No such file or directory`），`/var/tmp` 只读，常驻服务无法把 home 放那儿。该位置与任何既有测试
   home、与在跑的 home 都隔离。
2. **Profile 用 `web` 模板而非 `headless`**：Web GUI 需要 `@deepseek-ai/dsh-web-app`。仍是 stock 模板、
   本轮新建、非复用测试 home。
3. **浏览器是离屏（headless）Chromium**：本机无 X11 显示（无 `/tmp/.X11-unix`、无 `DISPLAY`），
   headed 不可能。页面、DOM、CSS、截图、网络都是真应用；只有窗口是离屏的。
4. **模型换成 `wb/cn:glm-5.3-flash`**：建议的 `bifrost-completions / wb/cn:deepseek-v4.1-flash`
   在 2026-11-01 直探得 `HTTP 400 model_unavailable`（"model is unavailable on every account
   (per-model cooldown)"），首个 GUI 轮次也复现为 `INVALID_REQUEST`。同一 provider 下换活模型：
   `wb/cn:glm-5.3-flash` 200 OK（本轮全部轮次用它）；`tokenrhythm/qwen3.8-flash` 502
   `upstream_credentials_exhausted`、`wb/cn:kimi-k2.6` 403 `model_blocked`、
   `freelane/deepseek-v4.1-flash-free` 429 免费额度用尽。凭据只经 `BIFROST_VIRTUAL_KEY` 环境变量
   （`apiKeyEnv`），未落盘，任何工件里都没有 key 值。
5. **Playwright 直驱模块，不用 `playwright-cli` daemon**：沙箱拒绝
   `mkdir ~/.cache/ms-playwright/daemon`。

### 5. 本轮不建立的东西（诚实边界）

- **`relay` / `append` 在长驻 GUI 里的投递仍 `NOT_RUN`**（NR-1 的剩下半边）：本轮走的是默认
  `in-turn` 投递，只证明"长驻 Web GUI 会话里 in-turn 投递能到达用户"，不证明另两条策略。
- **质量断言仍受模型边界限制**：全部轮次是 `glm-5.3-flash`，不是 `deepseek-v4.1-flash`；
  本轮没有跑质量矩阵（那需要多次运行与独立评分），所以不能据此扩大 `COMPLETED` 率的结论。
- **只有一个浏览器内核**（Chromium），没有 Safari/Firefox 证据；也没有移动端证据。
- **证据不入库**：`.workflow-artifacts/` 未提交，`shots/`、`logs/`、`dsh-home/` 只存在于本机；
  本文件只给出路径与关键文本，便于复跑时对照。

## Round 16 (t60) — v0.2.4 真机安装矩阵（隔离 headless + web，8 PASS + 2 NOT_RUN）

`CONFIRMED` — 在 `origin/main` `7357e5e`（`v0.2.4` 发布提交，tag `v0.2.4` 已打，Release 已建）上，
用全新隔离 `DSH_HOME` 跑完 10 项真机安装矩阵：item 1–7 `PASS`（item 7 带一次如实记录的直答异常），
item 8 部分通过（composition + boot 确认，API 命名空间未确认），item 9–10 `NOT_RUN`
（本环境无浏览器自动化；设置页与 web 聊天已在 Round 15 的真 GUI 上覆盖）。
本轮只读证据 + 三个记忆文件，**未改任何源码**（`src`/`lib`/`test` 无 diff）。

证据（只读，全部在本机 `.workflow-artifacts/matrix-024/` 下，未入库）：

- `EVIDENCE.md` — 逐项结论与日志指针（本轮原始记录）。
- `logs/` — `item1-boot*.txt`、`item1-dump-*.txt`、`item1-patch.yml`、`item2-*`、
  `item3-*.jsonl`、`item4-*`、`item5-*.jsonl`、`item7-run*.jsonl`、`item8-*`
  （含 `item8-create.txt`、`item8-dump-full.txt`、`item8-web-boot*.log`、`item8-describe.json`）。
- `home/`、`work/` — 一次性实例的 home 与会话工作区。

运行环境：`DSH_HOME=.workflow-artifacts/matrix-024/home`（本轮新建，未复用任何既有测试 home）；
在跑的 `:3090` 全程未动（未重启、未 kill）；模型 `bifrost-completions / wb/cn:glm-5.3-flash`，
凭据只经 `BIFROST_VIRTUAL_KEY` 环境变量（`apiKeyEnv`），未落盘，任何工件里都没有 key 值。

### 1. 逐项结果（1–10）

| # | 项 | 结论 | 关键证据 |
| --- | --- | --- | --- |
| 1 | install + boot | **PASS** | `item1-dump-full.txt:411` 有 `- id: grok-workflow / name: dsh-grok-workflow`；boot2 EXIT 0 `BOOT_OK`，stderr 空，无 pending/did-not-activate |
| 2 | default off plain | **PASS** | EXIT 0 `PLAIN_OK`，0 report 匹配 |
| 3 | full workflow | **PASS** | `item3-retry.jsonl`：`Grok workflow: COMPLETED`，`Plan: planner; 1 task(s); 1 verified`，EXIT 0。首轮 `item3-workflow.jsonl` 是被外层 `timeout 600` 杀掉（只有 turn_start + cancelled 提示，P0-4 路径），不是 verdict |
| 4 | off back to plain | **PASS** | EXIT 0 直接 JSON 短句，0 report 匹配 |
| 5 | bad model fail-closed | **PASS**（两种变体） | (a) 未知 role model → load-time row rejection，stderr 点名 model + 已声明目录，EXIT 0 直接 echo（row 从未激活，故无 gate）；(b) `bad subagentProvider=bifrost-completions` → EXIT 0 带显式 `GROK-WORKFLOW-REPORT` 拒绝 `no subagent provider registered for "bifrost-completions"`，什么都没执行、无直答 —— 运行时 fail-closed 实证。注：观测到的是 EXIT 0，不是 0.2.0 时代的 EXIT 1；(b) 的判定标准（显式错误 + 无静默直答）仍然成立 |
| 6 | secret scan | **PASS** | key 值在全部 logs 里 0 命中；在全部 16 个 session zstd store 里 0 命中；token 模式 `(?<![a-zA-Z])sk-[A-Za-z0-9_-]{8,}` 在 logs + stores 里 0 命中；收紧的 `(?<!ta)sk-` 0 命中（裸 `sk-` 命中全是 `task-` 子串） |
| 7 | stability | **PASS**（异常在案，见 §2） | run1/run2 `COMPLETED` verified EXIT 0；run3 首轮异常；同 prompt 重跑 `COMPLETED` verified EXIT 0；run4 `COMPLETED` EXIT 0；run5 `COMPLETED`（中文报告）verified EXIT 0。异常之后连续 3 个 EXIT 0 + 报告：rerun + run4 + run5 |
| 8 | web profile | **部分通过**（composition + boot 确认；API 边界止于 401） | `mx024-web` 由 stock web 模板建，装的是 `#v0.2.4`（0.2.4）；patch 打开 `workflow-ptc`（`disabled: false`）+ model route + roles（`item8-dump-full.txt:340,1259`）；隔离实例 `127.0.0.1:3201` LISTENING，boot 日志无 pending/did-not-activate；HTTP `settings`/`describe` 经 query-token 与 Bearer 两次尝试均 `401 unauthorized`（`item8-describe.json` 正文只有 `unauthorized`），认证方式未解开、未继续深探（避免锁号）。服务存活确认到 socket + boot 层；namespace 经 API 未确认 |
| 9 | settings page render | **NOT_RUN** | 本环境无浏览器自动化，留给 operator；设置页渲染已在 Round 15 的真 GUI 上 `CONFIRMED`（基点 `6806426`；与 `7357e5e` 之间 `src`/`lib`/`test` 无 diff，只有发版与文档，见 `git diff --stat 6806426 7357e5e -- src lib test` 为空） |
| 10 | web chat behavior | **NOT_RUN** | 同上；web 聊天（`/grok` 可切、in-turn 投递）已在 Round 15 的真 GUI 上 `CONFIRMED` |

### 2. item 7 异常原文（`logs/item7-run3.jsonl` 563 bytes；重跑 `logs/item7-run3-rerun.jsonl` 3667 bytes）

run3 首轮 EXIT 0，但直接回答、无报告。文件中的两行原文：

```jsonl
{"type":"text","text":"apple, banana, cherry"}
{"type":"final","text":"apple, banana, cherry"}
```

（其余只有 `turn_start` / `step_start` / `step_end`（`outputTokens: 7`）/ `turn_end`
（`reason: completed`），全程无 `GROK-WORKFLOW-REPORT`。）同 prompt 重跑一次即 `COMPLETED`
verified（3667 bytes，含完整报告 `Plan: planner; 1 task(s); 1 verified` + 独立证据行）。
该异常样本保留在 `logs/` 里，未删除、未掩盖；稳定性结论按"异常之后连续 3 个 EXIT 0 + 报告"
给出，不按"从未异常"给出。

### 3. 本轮不建立的东西（诚实边界）

- **item 8 的 namespace 经 API 未确认**：`401` 边界如 §1 表格；认证方式未解开，不猜、不深探。
- **item 9–10 在矩阵里 `NOT_RUN`**：覆盖来自 Round 15（基点 `6806426`，`src`/`lib`/`test`
  与 `v0.2.4` 一致），不是本轮重测。
- **`relay` / `append` 在长驻 GUI 里的投递仍 `NOT_RUN`**（NR-1 的剩下半边）：Round 15 与本轮走的
  都是默认 `in-turn` 投递。
- **质量断言仍受模型边界限制**：本轮全部轮次是 `glm-5.3-flash`，不是 `deepseek-v4.1-flash`；
  本轮没有跑质量矩阵，不能据此扩大 `COMPLETED` 率的结论。
- **证据不入库**：`.workflow-artifacts/` 未提交，`home/`、`work/`、`logs/` 只存在于本机；
  本文件只给出路径与关键文本，便于复跑时对照。

## Round 17 (2026-11-02/03) — 首条用户消息被隐藏（P0-5）：CONFIRMED 根因 + 修复 + 真机前后对比

**报告**：2026-11-02（Asia/Singapore），会话 `session-d3d9375f-041a-4670-8256-13db46670b3c`
（工作区 `qqbot`，标题「机器猫人格」）里，用户发的第一条消息从未出现在可见会话中，界面只有
「正在分析请求 / 深度求索中」这类状态。

### 1. 根因 —— `CONFIRMED`（一个机制，不是猜测）

**机制**：默认 `answerStrategy: in-turn` 的 `answerInTurn()` 在
`src/gate.ts` 里先 `record(..., 'started', 'admitted')`，然后 **`await produceAnswer(...)`
——整个工作流跑完才返回 `PreStepDecision`**。DSH 的 `AgentLoop.step()` 是"被 claim 的批次"
唯一的写入者，它在 step 真正开始时才把 `decision.messages` 逐条 `session.append('user/message')`
（`dsh-agent-loop/lib/index.js` `step()`：`for (const message of decision.messages) … else
this.session.append("user/message", message, { surfaceOp: "append" })`）。因此从 pre-step
把批次从 inbox claim 走，到工作流结束之间，会话里 **一条 `user/message` 都没有**：消息既不在
inbox（已被 claim），也不在 transcript（还没写）。GUI 只渲染持久事件，于是只剩运行状态；
提交时浏览器那个乐观回显（`PendingSubmissionBubble`，仅在本次页面内有效）在刷新/换端后消失，
用户就再也看不到自己发过什么。

**证据 A — 真实会话的磁盘 transcript**（`CONFIRMED`）：

```sh
S=/home/fish/dsh-layerfs/sessions/--home-fish-projects_mine-qqbot--/session-d3d9375f-041a-4670-8256-13db46670b3c
zstd -dc $S/session.v4.jsonl.zstd | python3 -c "import sys,json;[print(json.loads(l)['seq'],json.loads(l)['type']) for l in sys.stdin if l.strip()]"
```

51 条事件，`user/message` **0 条**。关键序列：

| seq | 事件 | 内容要点 |
|-----|------|----------|
| 6 | `agent/inbox/spliced` | `target: next-turn`, `start: 0`, `inserted: [<用户消息 d8fe5255…>]` —— 用户消息进 inbox |
| 7 | `turn/start` | `turn: 1` |
| 8 | `agent/inbox/spliced` | `start: 0`, **`removedCount: 1`, `inserted: []`** —— 被 pre-step claim 走 |
| 9 | `plugin:grok-workflow/delivery` | `phase: "started"`, `outcome: "admitted"`, `turn: 1` —— 插件已认领，等待运行 |
| 10…48 | `tool-workflow/run-start` / `agent-start` / `agent-end` / `subagent/catalog` | 团队在跑（41 个子智能体） |
| 49 | `session/title` | `messageSeqs: []` —— 标题生成也没拿到任何消息 |

同一会话的 projcache（`/home/fish/dsh-layerfs/storages/session_projcache/sessions/session-d3d9375f-…json`）
写着 `turnOutline.val.turns[0] = {turn:1, seq:7, prompt:"", response:""}`、
`titleInput.val = {first:null, count:0}`、`turnBoundary.openTurnStartSeq: 7` —— 首轮 1 小时 41 分
仍未关闭，宿主从未把这条消息当成 message 收下。

**证据 B — 真机 GUI（`http://100.111.111.88:3090`，同一实例、同一会话）**：
`docs/knowledge/evidence/first-message-visible/BEFORE-live-3090-session.png`
（截图时间 2026-11-02 23:5x SGT）：标题「机器猫人格」、`41 个子智能体`，正文只有
「正在分析请求」+「深度求索中，用时 1小时41分4秒…」，**没有任何用户消息气泡**。

**证据 C — 代码位置**：`src/gate.ts` `answerInTurn()`
（`record(agent, entry, 'started', 'admitted')` → `await produceAnswer(...)` → `enterAfter(...)`），
以及 `stepBase()` 的注释（"`step()` commits exactly `decision.messages` as `user/message`
events"）。旧实现把用户消息只放在 `enter.messages` 里，而 `enter` 发生在运行结束之后。

**为什么报告只提到"第一条"**：缺陷对每条 `in-turn` 消息都成立，但第一条最显眼——那时 transcript
里没有任何别的内容，空 turn + 状态就是全部画面。

### 2. 修复（`src/gate.ts`，`lib/` 同步重建）

- 新增 `withoutClaimed(base, claimed)`：按 message id 从 `enter.messages` 里剔除已发布批次
  （session 没有按 id 去重，留着就会渲染两遍）。
- `answerInTurn()`：在 `await produceAnswer(...)` **之前**取历史快照
  （`collectHistory(...)`，否则刚发布的这条会被当成"Conversation so far"重复进 objective），
  然后 `const surfaced = commitClaimed(agent, payload.messages)` —— 立即写 `user/message`
  （同一对象、同 id、同 source，保留 `rpcId`，GUI 的乐观回显据此正常退场）。
  运行结束后 `enterAfter(base, text, surfaced)`：`enter.messages` 只带报告（+ runtime context），
  用户的话只存在一份。
- `commitCancelled(..., alreadySurfaced)`：已经发布过的批次不再写第二遍。
- 回归测试：`test/gate.spec.ts` › `in-turn delivery (default strategy)` ›
  **"renders the first user message while the run is still in flight (P0-5)"**。断言运行还在飞时
  会话里已有且仅有一条 `user/message`（内容为用户原文），运行结束后仍是 1 条、`enter.messages`
  只余 1 条报告。离线、确定性、无模型/网络依赖。
- 受影响的既有断言同步改为新契约（`test/gate.spec.ts` 两处 `messages[0]`、
  `test/phase1-dialogue.spec.ts` 的 P0-1 用例改名为 "publishes the claimed message, then the
  report, once each, in that order"）。

### 3. 测试与 CI（`CONFIRMED`）

| 命令 | 环境 | 结果 |
|------|------|------|
| `npx vitest run test/gate.spec.ts -t "renders the first user message"`（**修复前**，`git show HEAD:src/gate.ts` 覆盖 `src/gate.ts`） | 本机 Node 26.8.1 | **FAIL**：`expected [] to equal [ '第一条消息：先把我说的话显示出来' ]` |
| 同上（修复后） | 同上 | PASS |
| `npx vitest run` | 同上 | **29 files / 522 tests passed** |
| `npm run ci`（typecheck + oxlint + build + vitest） | 同上 | **exit 0，29 files / 522 tests passed** |
| `git diff --exit-code -- lib/`（提交后重建） | 同上 | **exit 0**（`lib/gate.js` / `.map` / `.d.ts.map` 与 `src` 同步） |

### 4. 真机前后对比（同一台机器、真实 Web GUI）

隔离实例（D-013：不碰在跑的 :3090 服务）：`DSH_HOME=/tmp/dsh-fm-home`、
profile `fm`（`--from-default-profile web`）、`dsh plugin --profile fm add /home/fish/projects_mine/dsh-grok-workflow`
（link 安装，直接跑仓库 `lib/`）、`dsh --profile fm --host 127.0.0.1 --port 3299 --no-open`、
所有模型路由指向本机 mock（`MOCK_API_KEY=dummy-not-a-credential`，mock 接受请求后不回复），
于是工作流一直处于"运行中"，正好能观察运行期间画面。

| 状态 | 操作 | 结果 | 截图 |
|------|------|------|------|
| BEFORE（`lib/gate.js` = HEAD 未修复版） | 在 3299 发送首条消息 → 刷新页面并重新打开该会话 | 同标签页内消息可见（浏览器乐观回显）；**刷新后消息消失**，只剩「任务团队 / 规划 / 规划助手 Running」+「Deep diving for 13s」 | `docs/knowledge/evidence/first-message-visible/BEFORE-isolated-reload.png` |
| AFTER（`lib/gate.js` = 修复版） | 同样发送首条消息 → 刷新页面并重新打开该会话 | **刷新后消息仍在**（`P0-5 AFTER: message must survive a reload` 00:35 气泡），状态只作为状态显示：「任务团队 · 1 member Running / 规划 · Running 1 / 规划助手 Running / Deep diving for 20s」 | `docs/knowledge/evidence/first-message-visible/AFTER-isolated-reload.png` |

脚本化复跑（playwright-core + 本机 chromium 1248；token 只从日志取用，不写入任何文件）：

```sh
node iso_reload.mjs "$URL" OUT.png "P0-5 AFTER: message must survive a reload" "P0-5 AFTER"
# 输出：--- same tab, before reload: transcript contains message? true
#       --- after reload, message in transcript? true
```

### 5. 本轮不建立的东西（诚实边界）

- **:3090 实例没有热加载本次修复**：插件在进程内已加载，重载会中断该会话正在跑的运行，
  违反 D-013；因此 AFTER 证据来自同一 `dsh web` 产品的隔离实例（同版本 `0.2.1-rc.2`），
  BEFORE 证据同时包含**真实 :3090 会话截图**与隔离实例复现。
- **mock 模型**：隔离实例的规划/执行/校验都指向不回复的本地 mock，所以 AFTER 截图里团队
  **不会**产出报告；本轮只验证"消息是否可见"，不验证答案质量。
- **`relay` / `append` 的长驻 GUI 投递**仍 `NOT_RUN`（NR-1 剩余半边），本轮只覆盖默认 `in-turn`。
- **`gh` Issue 状态评论**：本机 `gh` 已登录 `free6589`，但本轮未向 `[COORDINATION]` Issue
  发状态块（`NOT_RUN`，由队长决定是否补发）。

## Round 18 (2026-11-03) — synthesis/synthesizer mismatch：配错也能起（P0 现场 + P1–P3 落地，lead 复核）

现场（OPER）：`web/cordis.patch.yml` 的 `grok-workflow.config` 配了 `roles.synthesizer`
链但缺 `synthesis`，落默认 `deterministic`，触发 `src/config.ts:371` throw，整行
`1 entry did not activate`，设置页一并消失。P0 按用户拍板方案 A：
`+ synthesis: model`（+1 行，备份
`~/dsh-profile-backups/cordis.patch.yml.20261103-222020-pre-synthesis-model`），
只读验证（grep + diff + plugin list `0.2.7`），未重启 `:3090`（D-013）。

P1–P3（PR #35，`feat/synthesis-fallback` `7c4a05e`，closes #34，lead 在 `7c4a05e`
独立复核后 reset 本地 main 回 `1024b1c`，工作只活在 feature 分支 + PR）：

| Check | Command | Result | Evidence |
|---|---|---|---|
| typecheck | `npm run typecheck` | PASS | exit 0 |
| focused tests | `npx vitest run test/config-synthesis-fallback.spec.ts test/client.spec.ts test/config.spec.ts test/routing.spec.ts` | PASS | 4 files / 93 tests |
| full CI | `npm run ci` | PASS | 31 files / 540 tests |
| lib sync | `git diff --exit-code -- lib/` | PASS | exit 0（`src` 改已重建 `lib/` 并同步提交） |
| lint | `npm run lint` | 3 warnings / 0 errors | 3 个均为基线原有（`1024b1c` 同样 3 个），本次未引入 |
| secrets | `grep` over changed `src/`+`test/` | PASS | 仅 `task-failed`/`id:` 等良性命中，无凭据 |
| isolated verify (partial) | `DSH_HOME=/tmp/p1-verify-home` + profile `p1web` + `127.0.0.1:3297`，坏配置 a/b 各起一例 | PARTIAL | 进程存活（精确 PID kill，无 live `:3090` 触碰）；boot warn/签名日志未捕获（stdout 仅 URL 行）；`/api/settings/describe` + 页面抓取 = 401（与 Round 16 item 8 同类已知死胡同）；设置页渲染 + 改回合法 `NOT_RUN` |

确定性证据齐全（8 例 fallback spec + 跨字段 spec + 全量 CI）；隔离真机 GUI 一半缺失，
见上表诚实边界。`resolveConfig` 硬规则未动（`test/config.spec.ts`/`routing.spec.ts`
仍钉 throw），R-06 不变。

## Round 19 (2026-11-03) — PR #35 merge + `v0.3.0` release: local checks, tag, workflow, GitHub Release

Environment: operator machine, `main` of `/home/fish/projects_mine/dsh-grok-workflow`,
Node `v26.8.1`, npm `11.19.0`, `gh` authenticated as `free6589` (`repo`, `workflow` scopes).

### 1. Merge PR #35（feature 先合）

| Check | Command | Result | Evidence |
|---|---|---|---|
| PR state before merge | `gh pr view 35 --json mergeable,mergeStateStatus,headRefOid` | MERGEABLE / CLEAN / `7c4a05e` | closes #34 |
| PR CI | `gh pr checks 35` | PASS | Node 22 `pass` 42s, Node 24 `pass` 36s — run `41659656218` |
| Merge | `gh pr merge 35 --merge --subject "Merge pull request #35 from free6589/feat/synthesis-fallback"` | MERGED | merge commit `af0394a`, `mergedAt 2026-11-03T15:24:10Z` |
| main content | `grep -n repairSynthesisInconsistency src/config.ts` | PASS | `src/config.ts:345`, `lib/config.js:329` on `origin/main` |
| main CHANGELOG | `git show origin/main:CHANGELOG.md` | PASS | bilingual `[Unreleased]` Fixed/修复 entry present before the release bump |

### 2. Release preparation (`release/0.3.0`, commit `f8cb09e`)

| Check | Command | Result | Evidence |
|---|---|---|---|
| branch | `git switch -c release/0.3.0` | PASS | based on `af0394a` |
| bump | `npm version minor --no-git-tag-version` | PASS | `v0.3.0`; `package.json:3` and `package-lock.json:3` (+ root entry) all `0.3.0`; `grep -c '0\.2\.7' package*.json` = 0 |
| install | `npm ci` | PASS | 17 high-severity `npm audit` advisories = existing baseline |
| typecheck | `npm run typecheck` | PASS | exit 0 |
| lint | `npm run lint` | 3 warnings / 0 errors, exit 0 | same three pre-existing warnings as `1024b1c` (`no-useless-escape`, `GROUPS_WITH_FIELDS`, `field`) |
| build | `npm run build` | PASS | `client bundle: 79752 bytes → lib/client.js` |
| lib sync | `git diff --exit-code -- lib/` | PASS | exit 0; `git status --porcelain --untracked-files=all -- lib/` empty |
| tests | `npm test` | PASS | 31 files / 540 tests, exit 0, 20.51s |
| package | `npm pack --dry-run` | PASS | `dsh-grok-workflow-0.3.0.tgz`, 56 files, package 246.5 kB |
| secrets | `git diff --cached \| grep -Ei "(api[_-]?key\|secret\|password\|token\|PRIVATE KEY\|sk-…)"` | PASS | 0 hits; only `CHANGELOG.md`, `package.json`, `package-lock.json`, `docs/releases/RELEASE-NOTES-0.3.0.md` staged (`.workflow-artifacts/` left untracked) |

### 3. Release PR and merge

| Check | Command | Result | Evidence |
|---|---|---|---|
| open PR | `gh pr create --base main --head release/0.3.0` | PASS | PR #36 |
| PR CI | `gh pr checks 36` | PASS | Node 22 `pass` 41s, Node 24 `pass` 38s — run `41664791714` |
| merge | `gh pr merge 36 --merge` | MERGED | release commit `3f5ad0a`, `mergedAt 2026-11-03T15:33:50Z` |
| main after | `git pull --ff-only` on `main` | PASS | `3f5ad0a`; `node -p "require('./package.json').version"` = `0.3.0`; `## [Unreleased]` then `## [0.3.0] - 2026-11-03` |

### 4. Tag, workflow, GitHub Release

| Check | Command | Result | Evidence |
|---|---|---|---|
| old tags baseline | `git ls-remote --tags origin` (before) | recorded | `v0.1.0`…`v0.2.7` SHAs |
| tag | `git tag v0.3.0 3f5ad0a && git push origin v0.3.0` | PASS | `* [new tag] v0.3.0 -> v0.3.0` |
| old tags untouched | `diff` of pre-existing tags before/after | PASS | `NO_CHANGES_TO_EXISTING_TAGS`; only `refs/tags/v0.3.0` added |
| Release workflow | `gh run view 41665410667` | PASS | conclusion `success`, all steps 1–16 `success` (tag↔`package.json`, typecheck, lint, build, `lib/` consistency, no-untracked check, tests, package list, changelog extraction, packaging, release creation) |
| GitHub Release | `gh release view v0.3.0 --json name,tagName,isDraft,assets` | PASS | `Grok Workflow for DSH v0.3.0`, `tagName v0.3.0`, `isDraft false`, asset `dsh-grok-workflow-0.3.0.tgz` 246,493 B, sha256 `3a8bf81b…`, published `2026-11-03T15:35:54Z` |

### 5. Boundary (what this round does NOT claim)

- The shipped behaviour change was not re-verified on a real GUI this round. Round 18's isolated
  result stands as-is: bad-config instances stayed alive, boot warn line not captured,
  `/api/settings/describe` + settings page `401` (same dead-end as Round 16 item 8), settings-page
  render/save-back `NOT_RUN`.
- The live `:3090` service was not reloaded, restarted or reconfigured (D-013); it still runs
  `dsh-grok-workflow@0.2.7`, and the operator `web` profile was not upgraded to `0.3.0`.
- npm publishing: not done and not planned (GitHub Releases only, per `docs/RELEASING.md`).

## Round 20 (2026-11-06) — PR #37 feature + `v0.4.0` release + isolated-profile live verification

Environment: operator machine, `main` of `/home/fish/projects_mine/dsh-grok-workflow`,
Node `v26.8.1`, DSH `0.2.1-rc.2`, `gh` authenticated as `free6589` (`repo`, `workflow` scopes),
model route `bifrost-completions/wb/cn:deepseek-v4.1-flash` via `BIFROST_VIRTUAL_KEY`.

### 1. Feature PR #37 (history-aware follow-up + hybrid + receipt/summary)

| Check | Command | Result | Evidence |
|---|---|---|---|
| PR CI | `gh pr checks 37` | PASS | Node 22 `pass` 38s, Node 24 `pass` 34s — run `42074144133` |
| merge | `gh pr merge 37 --merge` | MERGED | merge commit `9438b3d` |
| local CI on feature head | `npm run ci` on `e89daf9` | PASS | 32 files / 545 tests (incl. new `test/triage-followup.spec.ts` 5 cases); typecheck clean; lint 3 warnings / 0 errors (pre-existing); build clean; `lib/` in sync |
| regression note | `npm test` after deterministic-summary revert | PASS | 32 files / 545 tests; model-rewrite `humanSummary` variant reverted because one extra engine call broke 3× P0-2 + 1× triage count assertions; shipped `humanSummary` is deterministic `verified/total` + synthesis lead-in, zero extra calls |

### 2. Release preparation (`release/0.4.0`, commit `472d043`) + PR #38 + tag + workflow

| Check | Command | Result | Evidence |
|---|---|---|---|
| bump | `npm version minor --no-git-tag-version` on `release/0.4.0` | PASS | `package.json` + `package-lock.json` both `0.4.0` |
| changelog | `CHANGELOG.md` + `docs/releases/RELEASE-NOTES-0.4.0.md` | PASS | bilingual `## [0.4.0] - 2026-11-06` + 39-line release notes |
| local checks | `npm run typecheck` / `lint` / `build` / `git diff --exit-code -- lib/` / `npm test` / `npm pack --dry-run` | PASS | typecheck exit 0; lint 3/0 pre-existing; `client bundle: 81835 bytes`; lib sync exit 0; 32/545 PASS; 56 files / 250.7 kB `dsh-grok-workflow-0.4.0.tgz` |
| open PR | `gh pr create --base main --head release/0.4.0` | PASS | PR #38 |
| PR CI | `gh pr checks 38` | PASS | Node 22 `pass` 32s, Node 24 `pass` 42s — run `42075028625` |
| merge | `gh pr merge 38 --merge` | MERGED | release commit `708c315` |
| tag | `git tag v0.4.0 708c315 && git push origin v0.4.0` | PASS | `* [new tag] v0.4.0 -> v0.4.0`; pre-existing tags untouched (`v0.1.0`–`v0.3.0`) |
| Release workflow | `gh run view 42075318386` | PASS | conclusion `success`; `gh release view v0.4.0` → `Grok Workflow for DSH v0.4.0`, asset `dsh-grok-workflow-0.4.0.tgz` 250,693 B, sha256 `e10802ca…`, published `2026-11-05T17:31:21Z` |

### 3. Isolated-profile live verification (`gw040`, `v0.4.0` tarball, `wb/cn:deepseek-v4.1-flash`)

| Check | Command | Result | Evidence |
|---|---|---|---|
| isolated home | `DSH_HOME=./tmp-home040 dsh --profile gw040 --from-default-profile headless` | PASS | `gw040` created; `workflow-ptc provider: spawn` present in dump |
| install | `dsh plugin --profile gw040 add ./tmp-pack040/dsh-grok-workflow-0.4.0.tgz` | PASS | `+ dsh-grok-workflow file:…tgz`; dump shows `- id: grok-workflow / name: dsh-grok-workflow` + patched `grokDefault: on`, 4 new keys |
| chat tier | `dsh --profile gw040 --patch gw040.patch.yml "你好"` | PASS EXIT 0 | `级别：直接回答` + greeting template + `（本次未调用子代理团队…）`, `GROK-WORKFLOW-REPORT` envelope |
| fast tier | `… "算一下 5×6等于多少，只回答数字"` | PASS EXIT 0 | `档位：快手档` + `30` + `（这条只派了一个工人…）` |
| team tier | `… "帮我重构 run.ts 的超时逻辑，并补上回归测试"` in empty `/tmp/dshgw-040-work` | PASS (gate/report path) EXIT 0 | `档位：团队档` + `Grok workflow: FAILED` with honest `Incomplete (quality)` + uncertainties naming the unresolvable `run.ts` path; no writes outside `/tmp` (TESTING.md isolation kept; scratch dirs removed after) |

### 4. Boundary (what this round does NOT claim)

- Multi-turn follow-up (`说人话` with history in one live session) is covered by deterministic
  unit tests (`test/triage-followup.spec.ts`), not by one-shot headless: each headless turn is a
  fresh session, so `historyNonEmpty` is false there by construction.
- The live `:3090` service was not reloaded, restarted or reconfigured (D-013); it still runs
  `dsh-grok-workflow@0.2.7`, and the operator `web` profile was not upgraded to `v0.4.0`.
- npm publishing: not done and not planned (GitHub Releases only, per `docs/RELEASING.md`).

## Round 21 (2026-11-06) — cross-round context carry-over (bounded digest, v0.5 unreleased)

Environment: operator machine, checkout `/home/fish/projects_mine/dsh-grok-workflow`,
Node `v26.8.1`, npm `11.19.0`, DSH CLI `0.2.1-rc.2`, model route
`bifrost-completions/wb/cn:deepseek-v4.1-flash` (key through `apiKeyEnv: BIFROST_VIRTUAL_KEY`,
no credential written to any file), plugin loaded as `file://…/lib/index.js` (this working tree).

### 1. Deterministic suite

| Check | Command | Result | Evidence |
|---|---|---|---|
| typecheck | `npx tsc -p tsconfig.json --noEmit` | PASS | exit 0, no diagnostics |
| lint | `npm run lint` | PASS with same 3 pre-existing warnings | `0 errors`; warnings are the untouched `src/client/index.js` `GROUPS_WITH_FIELDS` / unused `field` sites |
| full suite | `npm test` (build + `vitest run`) | PASS | **33 files / 568 tests**; new `test/carryover.spec.ts` 21 cases + 2 new cases in `test/gate.spec.ts`; committed `lib/` rebuilt by the same command |

The acceptance-criterion tests are `test/carryover.spec.ts` "the real prompt path" and
`test/gate.spec.ts` "cross-round carry-over":

- round 1 is executed through the **real generated script** (`runWorkflowScript(WORKFLOW_SCRIPT, …)`),
  its report is rendered by the **real** `renderReport`, parsed back by the digest compiler, and
  round 2's planner/worker/verifier prompts are asserted to contain the round-1 finding while the
  follow-up's own words do not contain it (`carry-over: the real prompt path`);
- the same chain is asserted one level up, on the **real gate**: a session whose transcript holds
  round 1's plugin-typed report yields `engine.startCalls[1].args.carryover` containing the finding,
  and `args.objective` not containing it (`test/gate.spec.ts` "hands the second round a digest…");
- the cap is pinned by four cases (`400`…`1_000_000` budget, no budget, round cap, surrogate pair):
  the rendered digest never exceeds `min(callerCap, CARRYOVER_LIMITS.chars=12000)`, and the
  oversized-input case proves the generated script clamps an unbounded `args.carryover` itself.

### 2. Real DSH two-round test (isolated home + isolated workspace)

Exact commands, environment and captured output: `docs/knowledge/evidence/carryover-e2e/README.md`
(raw files in the same directory: `round-reports.txt`, `child-prompt-digest.txt`,
`digest-per-child-session.txt`, `session-surface-events.txt`).

| Check | Result | Evidence |
|---|---|---|
| isolated home/profile | PASS | `DSH_HOME=.carryover-e2e/home`, profile `carryover` from the shipped `headless` template; session workspace `.carryover-e2e/work` (encoded dir name `sessions/--home-fish-projects_mine-dsh-grok-workflow-.carryover-e2e-work--`) |
| round 1 (gated) | PASS EXIT 0 | `Grok workflow: COMPLETED`, task `compute-product` verified, confirmed evidence quotes `17 × 23 = 391` |
| round 2 (gated, same session, follow-up that never restates the number) | PASS EXIT 0 | `Grok workflow: COMPLETED`, task `add-nine-to-prior` verified, delivered answer `391 + 9 = 400，最终数字是 400。`; a criterion that explicitly forbids asking the user to repeat passes with the note "no question mark, no request for input, no hedge about missing context" |
| digest reached the round-2 children | PASS | `grep -c 'PRIOR ROUNDS'` per child session log: round-1 children 09:38–09:39 → `0`, 09:46–09:47 → `0`, round-2 children 09:49–09:51 → `2` each |
| digest content in a real child prompt | PASS | `child-prompt-digest.txt` shows the planner prompt carrying `PRIOR ROUNDS … Round -1 [completed] …` plus round 1's verified rows (`The final answer text contains the exact numeral 391 …`) |

### 3. Findings (observed, not all fixed here)

- **F1 — resuming a session whose first message went through the gate fails**:
  `stored log is corrupt: SessionFormatError: system/message requires a protected first surface
  head`. Cause: `in-turn` publishes the claimed message in `agent/pre-step` (P0-5 semantics,
  Round 17) before the loop writes its first `system/message`. Not introduced by this change and
  out of this task's scope (it is neither the digest nor its injection). Round 0 of the real test
  works around it by running one gate-off message first; **the defect itself is `CONFIRMED` and
  still open**.
- **F2 — the carry-over info line is invisible in headless runs**: `logger.info` has no channel the
  headless runner prints, so `grep 'carry-over' r2.err r2.jsonl` → `0`. The digest is evidenced by
  child prompts, never by a log line.

### 4. Scope check

| Check | Result | Evidence |
|---|---|---|
| DSH core untouched | PASS | `git -C <dsh install> status` → `fatal: not a git repository` (it is an installed package, not a checkout), so the check is a modification scan: `find /home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@deepseek-ai/dsh -newermt '2026-11-06 00:00:00' -type f` → **0** hits out of 62 903 files |
| `src/records.ts`, `src/triage.ts` untouched | PASS | `git status --short` lists only `src/carryover.ts` (new), `src/script.ts`, `src/run.ts`, `src/gate.ts`, `src/index.ts` (plumbing only; the gate's question-classification logic is byte-identical) |
| no new storage/archive | PASS | the digest is compiled on read from the plugin's own report messages; no record type, no file, no archive was added |

### 5. Boundary (what this round does NOT claim)

- One model, one session, one task pair: this is a behavioural check that the second round answers
  from the first, not a quality matrix.
- The digest's value was measured with a short numeric follow-up; long research rounds are covered
  by the deterministic tests (bounded compile, redaction, truncation) and not by live samples.
- The live `:3090` profile was not reloaded (D-013) and still runs an older plugin build.
- No npm publish, no version bump, no tag: this change is under `[Unreleased]`.

## Round 22 (2026-11-06) — 随做随存的增量记忆归档（`src/memory/*`，`[Unreleased]`）

**目标（用户原话）：** 每当一轮/子代理产出研究结果或完成阶段性工作，立即以结构化条目追加写入持久记忆，
而不是只在会话收尾时手工更新 STATE/HANDOFF；结束状态是任何「单次进来」的会话查记忆都能找到最近的研究
结果，「查了记忆，最近也没有存档」彻底消失。

**范围：** 只加归档写入器与接线（`src/memory/archive.ts`、`src/memory/recorder.ts`、
`src/memory/cli.ts`，`src/run.ts` 两处薄接线）。不改跨轮提示词/digest 构建，不改
`src/triage.ts`，不改 `src/gate.ts` 的提问判定逻辑，不改 DSH 核心。

### 1. 确定性测试（`CONFIRMED`）

```bash
npx vitest run test/memory-archive.spec.ts     # 21 tests PASS (3.05s)
npm test                                        # 34 files / 589 tests PASS (22.84s)
npx tsc -p tsconfig.json --noEmit               # no output = clean
npm run lint                                    # 3 warnings / 0 errors (全部在既有 src/redact.ts、src/client/index.js)
npm run build                                   # tsc -p tsconfig.build.json && node scripts/build-client.mjs
```

`test/memory-archive.spec.ts` 覆盖的判据：

| 判据 | 用例 |
|---|---|
| 写入时刻 = 轮次结算时刻（不是会话退出/dispose 钩子） | 真引擎 harness：运行中途由 verifier 激活时读归档，只见 agent 条目且 `runSettled === false`；轮次结束后同一文件出现 round 条目 |
| 子代理结算即写 | `agent-end` → `run:<runId>:agent:<seq>`，含 label/phase/outcome/发现 |
| 无会话状态的独立进程能读回 | `spawnSync(process.execPath, ['--input-type=module','-e', …])` 导入 `lib/memory/archive.js` 读到最新结果；另跑随包 CLI `lib/memory/cli.js recent` |
| 幂等 + 只追加 | 同一条目二次写入返回 `written:false, reason:'duplicate'`；追加后旧字节（含损坏行）逐字节保留 |
| 子代理发现的可读性 | 结构化提交（`structured_output`/`submit` 的 JSON 参数）→ `verdict pass · N criterion/criteria`、`plan: N task(s)`；纯散文子代理 → 其最后一段文本 |
| 失败不拖垮运行 | 写入目标不可写（同名文件当目录）→ `reason:'write-failed'`；引擎监听器内异常 → 只 warn |
| 脱敏 | `github_pat_…`、`Bearer …` 落盘前被替换 |

### 2. 真机（隔离 home，真模型，`CONFIRMED`）

环境：`DSH_HOME=.workflow-artifacts/incr-archive-e2e/home`（`dsh --profile incr
--from-default-profile headless` 建出，不碰 `:3090` 的 `/home/fish/dsh-layerfs`，D-013），
模型 patch `wb/cn:deepseek-v4.1-flash`（`bifrost-completions` / `openai-completions`），
插件 patch `file:///home/fish/projects_mine/dsh-grok-workflow/lib/index.js`，config
`{answerStrategy: in-turn, showProgress: true, grokDefault: "on"}`。

```bash
cd .workflow-artifacts/incr-archive-e2e/work
DSH_HOME=…/home dsh --profile incr --patch ../model.patch.yml --patch ../plugin.patch.yml --json \
  "请分两步：第一步创建 facts.txt，内容为 41*37=1517；第二步创建 verify.mjs，读取 facts.txt 并用 node:assert 断言等于 37*41，运行 node verify.mjs 并贴出真实退出码与 stdout。"
echo $?   # 0
python3 -c "…"   # 归档里该轮 4 条：run:77babf9f…:agent:1/2/3 + run:77babf9f…
```

| 检查 | 结果 | 证据 |
|---|---|---|
| 团队档真跑并结算 | PASS | `Grok workflow: COMPLETED`，任务 `facts-verify-node` verified，8 条判据 confirmed |
| 子代理条目按时写 | PASS | `plan: 1 task(s)`（规划）、其申报结果（执行）、`verdict pass · 8 criterion/criteria checked`（校验） |
| 轮次条目带结果与证据 | PASS | `status completed · verified 1/1 task(s) · confirmed 8 criterion/criteria`，evidence 引用真实 `od -c` / `ls -l` / 退出码 |
| 归档位置即默认约定 | PASS | `$DSH_HOME/memory/grok-workflow/archive.jsonl`（26 行累计，仅追加，无改写） |
| 前台档也归档 | PASS | 后续快手档回答写出 `run:c72d7023…`（label `Front desk`） |

### 3. 独立会话读回（判据 4，`CONFIRMED`）

**新起一个与产出轮完全不同的 DSH 会话**，只让它跑随包 CLI：产出轮在
`session-c9a1b100-1a81-43d9-9dc9-5c5cc09664b4`（04:19:31 写入 round 条目），读回会话是
**另一个进程里新起的** `session-1f907d27-c003-4eb3-ad2d-01f1dcba3227`，两者不共享任何内存、
没有前序上下文：

```bash
dsh --profile incr … --json "请在本机原样执行这条命令，并把输出前 14 行贴出来：node <repo>/lib/memory/cli.js recent --limit 4"
```

它引用了上一轮（另一会话产出）的条目：`run:77babf9f-2b5a-467b-9caa-cab8c5801664`（round）、
`…:agent:2`、`…:agent:3`，连 `verdict pass · 8 criterion/criteria checked` 都在输出里
（原始事件：`docs/knowledge/evidence/incremental-archive/fresh-session-quotes-archive.jsonl`；
CLI 直读输出：`…/cli-recent.txt`；该轮 4 条条目：`…/archive-run-77babf9f.jsonl`）。
**「查了记忆，最近也没有存档」不复现：新会话零上下文，未问用户，直接读到上一轮结果。**

### 4. 现场发现（均为实测，不是推理）

- **F0 — `grokDefault` 默认 `off`，全新 profile 里闸门根本没开：** 首轮真机 prompt 被当普通 chat
  直答，`archive.jsonl` 根本没生成。归档只在闸门真的运行时有内容；patch 里写
  `grokDefault: "on"` 后才进入分诊。**这是排除「无存档」时最容易误判的一条。**
- **F1 — `ctx.sessions` 在插件 fiber 上直接抛：** `cannot get property "sessions" without inject`
  （cordis 4 要求 `inject` 才能取服务；本插件故意不 inject，否则纯单测上下文里 `apply` 不会启动）。
  修法：用文档给出的 `ctx.get('sessions')` 读取。**在此之前，所有子代理条目都只写「读不到文本」。**
- **F2 — 引擎在 `agent-end` 送到宿主前就 dispose 了子会话：** 于是「结算时再查子会话」永远查不到；
  必须在 `agent-start`（子会话还活着）捕获 Session 对象，结算时读它的 `ownEvents()`。
- **F3 — 结构化子代理不产出 assistant 文本：** 真机子会话最后一条 `assistant/message` 只有
  `reasoning` + `tool-call`，`tool-call.arguments` 是 **JSON 字符串**，真正的结论在参数里
  （`structured_output` 的 `verdict`/`criteria`，执行体的 `summary`，规划的 `tasks`）。
  只读文本会让每条子代理条目都写着「没有结果」——这正是需要被消灭的失败形态。

### 5. 范围与安全

| 检查 | 结果 | 证据 |
|---|---|---|
| DSH 核心未改 | PASS | 未在 `/home/fish/.local/share/mise/…/@deepseek-ai/dsh` 下写入任何文件；只用文档化扩展点（`ctx.workflowEngine`、`ctx.on`、`ctx.get`） |
| `src/triage.ts`、gate 提问逻辑未改 | PASS | `git status --short` 中 `src/triage.ts` 不在列；`src/gate.ts` 无本次改动（其改动属另一任务的遗留工作） |
| 只追加、幂等 | PASS | 单测断言旧字节逐字节保留 + 重复 id 返回 `duplicate`；真机 26 行累计无改写 |
| 无凭据 | PASS | 条目写入前过 `redactSecrets`/`redactError`；证据文件里无 key（只做 `BIFROST_VIRTUAL_KEY` 存在性检查，从未打印其值） |
| 无 npm 发布/无版本号变更 | PASS | `CHANGELOG.md` 只加 `[Unreleased]` 条目，`package.json` 未改 |

### 6. 边界（本轮**不**声称）

- 并发压力：两个进程同时追加同一文件未做压测（`O_APPEND` 单行写 + 读时按 id 去重是设计保证，
  但 `NOT_RUN` 真机并发）。
- 归档**不会**替代跨轮 digest：digest 仍从会话内报告编译（D-035），归档是给「单次进来」的新会话用的。
- 在线模型只用了 `wb/cn:deepseek-v4.1-flash` 一个；子代理发现的可读性依赖该引擎的
  tool-call 形状，换引擎需重测（`HYPOTHESIS`）。
- 未重载 `:3090` 上的 operator profile（D-013），线上仍是旧构建。

## Round 23 (2026-11-06) — 先回捞后提问：提问前先读会话上文与磁盘记忆（`[Unreleased]`）

目标失败样本：`session-7e079b80-1a57-451b-aca4-795d24a14c4d`——会话里已有研究结果，随后的追问却被
以「遗忘了上下文」为由要求用户重新说明。本轮只改**提问之前**这一步：`src/triage.ts`（`recallFromPrior`
判定 + `recalled` 档 + 两条用户可见说明 + 回捞提示词）与 `src/gate.ts`（读取来源：会话上文、前序轮次
digest、磁盘 `docs/knowledge/*.md`），其余路径不改。

**范围纪律（本轮不声称）：** 不构建跨轮 digest 注入（属 D-035 另一任务，这里只**读**既有 digest）、
不新增归档存储（属 D-036 另一任务）、不改 DSH 核心、不新增配置键。

### 1. 确定性测试（`CONFIRMED`，无在线模型）

```bash
cd /home/fish/projects_mine/dsh-grok-workflow
npm run ci          # typecheck + lint + build + vitest run
npx vitest run test/triage-recall.spec.ts
npx vitest run test/triage.spec.ts test/gate.spec.ts test/triage-followup.spec.ts
```

| 检查 | 命令 | 结果 | 证据文件 |
|---|---|---|---|
| 全量 CI | `npm run ci` | **PASS** — `Found 3 warnings and 0 errors.`（3 个均为既有 warning）、`Test Files 35 passed (35)`、`Tests 617 passed (617)` | `docs/knowledge/evidence/history-first/ci-summary.txt` |
| 本轮新测试 | `npx vitest run test/triage-recall.spec.ts` | **PASS** — `Tests 28 passed (28)` | `docs/knowledge/evidence/history-first/recall-spec.txt` |
| 既有 triage/gate 回归 | `npx vitest run test/triage.spec.ts test/gate.spec.ts test/triage-followup.spec.ts` | **PASS** — `Test Files 3 passed (3)`、`Tests 89 passed (89)` | `docs/knowledge/evidence/history-first/regression-suite.txt` |

基线（改动前，见 Round 22）：34 文件 / 589 测试。当前 35 文件 / 617 测试 = 基线 + 1 文件 + 28 测试。

### 2. 两条分支各自怎么被钉住（判据 1、2）

| 分支 | 用例 | 断言 |
|---|---|---|
| 已存在（会话历史） | `replay: ... after the fix (earlier round has the research)` | 真 `Session` 里已有第 1 轮用户消息 + 插件写的 `grok-workflow` 报告；追问走**快手档** `recalled`，只 1 次前台调用，`script` 含报告里的 `dsh-web 进程占用` 与 `web.port`，正文含「先查后答」，**不含**「档位：确认档」「这个要动用团队吗」；`RE_ASK_AGAIN`（`重新说明/重新描述/restate/repeat what` 等）不匹配 |
| 已存在（磁盘记忆） | `answers from a docs/knowledge file that holds the answer` | 临时 `docs/knowledge/STATE.md` 命中 → 快手档 `recalled`，调用提示词含文件内容，回答含「先查后答」 |
| 真缺失 | `still asks once, and says what is missing, ...` | 会话里已说过话、记忆文件存在但**不覆盖**该问题 → 仍为确认档（只提问一次），提问正文含「先查后问」「还缺」，且 `startCalls` 为 0（**没有任何回答被编造**）；正文不含「重述/重新说明/restate」 |
| 无历史无记忆（回归） | `changes nothing when the memory directory does not exist` / `keeps a brand-new session's question byte-identical even with memory files present` / `leaves a greeting untouched even with memory files present` | 投递正文与 `frontDeskText([triageLine, '', askLine])`、`frontDeskText([triageLine, '', chatReply, '', tierNote])` **逐字节相等**；`classifyTriage` 在 `prior` 缺失与 `prior=miss` 两种情况下返回对象 `toEqual` |
| 判定本身 | `recallFromPrior` 7 例 + `classifyTriage` 5 例 + 说明/提示词 5 例 + 磁盘读取 4 例 | 命中/未命中/指针式引用/确定性/上限/脱敏/默认根目录与环境变量覆盖 |

**默认行为不变的口径（判据 3）：** 一个还没说过话的会话，即使磁盘上有记忆文件，得到的仍是改动前
那句提问（逐字节相等，`keeps a brand-new session's question byte-identical ...`）；只有"使用者已经说过话"
的会话，未命中时才会在提问下方附加一行「先查后问，还缺 X」——那种情况下问题是可指认的，说明查过哪里
才是有意义的。

**同一句追问的前后对照（真实投递文本，`docs/knowledge/evidence/history-first/before-after.txt`）：**

```text
follow-up: 刚才那个端口的事你再说一下

=== BEFORE (no earlier round) ===
档位：确认档 — 因为：信号互相矛盾或线索不足，前台不猜。

这个要动用团队吗？可回复：简单 / 团队。

=== AFTER (earlier round present) ===
档位：快手档 — 因为：这条本来会先问你一句，但所需信息已经在会话上文或磁盘记忆里，先回捞再作答。

（示例回答）8080 被 dsh-web 占用，换端口改 web.port。

（先查后答：这条据已有材料作答（本会话前序 1 轮报告），没有反过来问你。）
（这条只派了一个工人，没有开完整团队。）

=== worker calls: 1 ===
```

（"（示例回答）…" 是测试替身返回的固定串；这里被验证的是**材料进了提示词**与**正文形态**，
不是模型答案质量。）

### 3. 回放测试用的失败形态（判据 4）

`test/triage-recall.spec.ts` 里 `replay: a follow-up about earlier research is answered, not bounced back`
成对出现，前半段复现失败形态、后半段证明修复：

- 后半段第 1 轮内容（即失败会话里的"研究结果"）：8080 端口被 `dsh-web` 占用、换端口只改
  `cordis.patch.yml` 的 `web.port`、端口占用只表现为 GUI 白屏。
- 追问句：`刚才那个端口的事你再说一下`——**改动前**该句是确认档（前半段用例断言
  `档位：确认档` + `这个要动用团队吗？可回复：简单 / 团队`，且 0 次模型调用），**改动后**同一句
  在带前序报告的会话里直接按历史作答（快手档 + 1 次前台调用 + 不反问）。
- 该样本本身不在本机磁盘上（`ls -d ~/.dsh/sessions/*/session-7e079b80*` 无匹配），因此回放用的是
  它的**形态**（先有研究结果、随后指针式追问），不是逐字节转录——这一点如实记录，不冒充原始会话。

### 4. 实施中发现并修复的缺陷（`CONFIRMED`）

- **F1 — 把当前消息当成"历史"，自己命中自己：** 首版 `collectRecallSources()` 直接调
  `collectHistory(session)`。但 `relay`/`append` 策略在 `produceAnswer()` 之前就 `commitClaimed()`
  把本轮消息写进了会话（P0-5），于是「刚才那个端口的事你再说一下」的锚点全部在同一句话里命中 →
  任何问题都会"找到答案"并据自己作答。修法：给 `collectRecallSources()` 加 `exclude` 参数，按
  `textOf(message) === request` 剔除本轮消息；`test/triage-recall.spec.ts` 的 `before the fix`
  用例与两个磁盘记忆用例都依赖这一剔除（关掉剔除会立刻变红）。

### 5. 范围与安全

| 检查 | 结果 | 证据 |
|---|---|---|
| DSH 核心未改 | PASS | 只改 `src/triage.ts`、`src/gate.ts`、`test/triage-recall.spec.ts`；未写入 `/home/fish/.local/share/mise/.../@deepseek-ai/dsh` |
| 无新配置键 | PASS | `src/config.ts` 未改；记忆目录走 `memoryDocRoots()` 默认 `<cwd>/docs/knowledge` 或环境变量 `GROK_WORKFLOW_KNOWLEDGE_DIRS` |
| 只读 | PASS | 新增代码只 `readdirSync`/`readFileSync`；不写归档、不写记录、不新增事件类型 |
| 无凭据 | PASS | 记忆文件内容过 `redactSecrets` 后才可能进提示词/回答；证据与文档中无任何 key（测试用 `github_pat_…` 假值验证脱敏） |
| 有界 | PASS | `RECALL_LIMITS`：6 轮 / 3000 字符会话、4 轮 / 4000 字符 digest、12 文件 / 每个 2400 / 合计 16000 字符、摘录 700 字符 |
| 默认行为不变 | PASS | 无 `prior` 时 `classifyTriage` 走原分支（4 处 ask 判定统一改为 `ambiguousVerdict()`，`prior` 缺失时返回与改动前相同的 `ask`/`ambiguous-escalate`）；无来源时不追加任何说明行 |
| 真实加载 | PASS | `test/loader.spec.ts`（`npm test` 内含）用真 cordis Loader 载入 `lib/index.js` 并注册 `grok_workflow`，随构建产物一起跑过 |
| 构建产物 | PASS | `npm run build` 后 `lib/gate.js`、`lib/triage.js`（含 `.d.ts`/`.map`）已更新，`npm test` 每次都先 build |

### 6. 边界（本轮**不**声称）

- **真机在线模型回放 `NOT_RUN`**：本轮没有起隔离 DSH profile 跑真模型（需在线模型与 profile 准备，
  任务约束亦要求"单元测试不需要在线模型"）。判据 4 由上面的确定性回放用例满足；真机 GUI 上的
  「追问不再被要求重述」仍待一次带模型的 e2e 复验。
- **语义匹配是词面锚点，不是向量检索**：`recallFromPrior` 用去停用词的双字/词锚点 + 指针式引用，
  同义改写（例如把「端口」说成「监听地址」）不会命中，会退化为提问（`HYPOTHESIS`：真实会话里
  这类改写占比未知，本轮未采样）。
- **记忆文件只读 `*.md` 且只看默认根目录**：`docs/knowledge/` 之外（例如 `~/.dsh/memory` 的
  `archive.jsonl`）本轮不读——那是 D-036 的另一条路径，避免两处语义打架。
- 未提交、未 push、未 bump 版本、未发布 npm；工作树里同时还存在 D-035 / D-036 两个任务的未提交改动。

## Round 24 (2026-11-07) — 诊断：即时回执打断 token 计量 → 自动压缩永久静默停摆（session-3361cd6e）

**性质**：只读诊断，不改代码、不改配置、不改会话数据。完整报告：
`docs/knowledge/evidence/diag-ctx-compaction-2026-11-07.md`。

### 结论（CONFIRMED）

DSH 的自动压缩（`@deepseek-ai/dsh-compaction-basic@0.2.1-rc.2`）经 `agent/pre-step` → `compactIfNeeded()` →
`ctx.tokenMeter.measure()` 取数，阈值 `floor(min(contextWindow*0.8, window−maxTokens−headroom))`；
本路由（`contextWindow 1000000` / `maxTokens 32000` / `headroom 65536`）= **800,000**。

`session-3361cd6e` 的日志在 **seq 2339** 有一条 step 之外的 `assistant/message`
（`source: {provider:"grok-workflow", model:"workflow-receipt"}`，即本插件 `src/records.ts` `appendInstantReceipt()`
在 `turn/start` 之后、`step/start` 之前写入的团队档即时回执）。`dsh-token-meter` 的 `_foldEvent` 要求
`assistant/message` 必须落在 `step/start … step/end` 内（`lib/index.js:846-848`），否则抛
`token meter: assistant/message at seq 2339 has no matching step/start event`；抛错后 fold 游标不前进，
**此后每次测量都在同一处抛错**。压缩侧只在 `logger.warn(... continuing the turn)` 里吞掉（`compaction-basic/lib/index.js:839-850`），
于是会话从第 5 轮起再没有自动压缩，而 GUI 的占用百分比走独立投影（`contextPressure`）照常显示 92–95%。

### 取证

| 检查 | 结果 | 证据 |
|---|---|---|
| 会话占用 | CONFIRMED | `~dsh-layerfs/storages/session_projcache/sessions/session-3361cd6e-….json`：`pressureTokens` 921,147（seq 6361）→ 953,777（seq 6557）/ `contextWindow` 1,000,000 = 92.1% → 95.4% |
| 断点前后行为 | CONFIRMED | 全日志仅 1 次 `compaction/start`（seq 2148, turn 4），其压缩前最大 prompt 399,817（≈0.8×500,000 刚过线）；seq 2151 之后再无 `compaction/*`，而 turn 16/17 的 prompt 长期 800k–953k |
| 复现 | CONFIRMED | `node docs/knowledge/evidence/diag-ctx-compaction-verify-metric.mjs`（原在未跟踪的 `out/diag/`，已随证据入库）：STEP 1 raw `measure()` 抛上述错误；STEP 2 唯一孤儿 = seq 2339；STEP 3 修好回放后 `totalTokens=954,926`；STEP 4 阈值 800,000 |
| 跨会话 | CONFIRMED | 同工作区 5 个会话扫描：本会话与 `session-eb3f5542` 各 1 条回执孤儿，其余 0 |
| `/compact` 实测 | NOT_RUN | 会在活动会话上产生压缩，违反只读约束（源码上 `compactNow()` 同为 `measure()`，预计被包成 `busy`） |
| Web GUI API 取数 | BLOCKED | `curl http://100.111.111.88:3090/` → 401；按约束不读凭据，改用同源投影缓存 |

### 修复建议（未执行，留给用户决策）

1. 根因：`appendInstantReceipt()`/`appendUnloadNotice()`/`gate.ts` 两处 append 只在“存在与之匹配的 open step”时写，
   否则延后到该轮第一个 `step/start` 之后；配套单测 + `TokenMeter.measure()` 回放回归测试。
2. 立即规避（只对新会话）：`profiles/web/cordis.patch.yml` 的 `grok-workflow.config` 加 `instantReceipt: false`，重启 `dsh-layerfs-web.service`。
3. 上游：`dsh-token-meter` 容忍孤儿 `assistant/message`（或 `session.append` 前置校验、压缩失败升级为可见告警），
   否则已存在的会话无法原地恢复（重启 DSH 也不行，日志里的孤儿事件仍在）。
4. 未提交、未 push、未 bump 版本；工作树另有既有未跟踪目录 `.v050-home/`、`out/`。

## Round 25 (2026-11-07) — 路由 Cap 空陷阱提示 + 单 run 作用域 + 跨 run hint（B组+C1 收尾归档）

**性质**：收尾归档 + 提交。本轮不改 `src`/`test`/`lib` 行为（B组+C1 实现为既有工作树改动），只新增
`DECISIONS.md` D-038、本 Round 25、`STATE.md`/`HANDOFF.md` 刷新，然后 `git commit` + push 到
`origin release/0.5.1`。`CHANGELOG.md` 不动（B组+C1 条目已由实现任务写入）。

### 命令与结果（CONFIRMED，均在 `/home/fish/projects_mine/dsh-grok-workflow` 执行）

| 命令 | 结果 |
|---|---|
| `npm run build` | PASS（exit 0；`client bundle: 84123 bytes → lib/client.js`） |
| `npx vitest run test/route-concurrency.spec.ts test/client.spec.ts` | **47/47 PASS**（route-concurrency 13/13，client 34/34） |
| `npm run ci` | **PASS**（exit 0；typecheck 0 errors；lint 3 warnings / 0 errors 既有基线；vitest **35 files / 624 tests PASS**） |
| `lib` 同步 | `npm run build` 后二次重建 md5 幂等一致（`IDEMPOTENT_SYNCED`）；`lib/` 变更即 B组+C1 实现的编译产物，随本轮 commit 入库 |
| `git diff --exit-code -- lib/` | 以入库为准（上条确认后随 commit 同步；约束原文"若不是0则重跑"已满足——重跑后幂等无变化） |
| DSH core 改动 | 无（`CONFIRMED`：`git status` 仅本仓库文件，无 core 路径） |
| live `:3090` 重启 | 未做（D-013；live 实例仍跑 `0.2.7`，reload/upgrade 待用户批准） |
| 真机 live | `NOT_RUN`（本轮纯收尾归档，未起隔离 profile） |

### 归档内容

- `DECISIONS.md` D-038：B组（`warn.emptyCap` 黄字不拦 Save + `validateRoutes` notes + 单 run 作用域）+
  C1（`busyRoutes` run 级估计重排未试顺序、无 hint 逐字节不变、`skippedBusy` 复用 `'(cross-run hint)'` 标记、
  报告分开渲染）+ C2 不可行（A16，沙箱封闭）。
- 变更文件（随本轮 commit 入库，未 bump 版本、未打 tag、未发布 npm）：
  `src/{script,run,report,settings}.ts`、`src/client/index.js`、`docs/ARCHITECTURE.md`、
  `docs/knowledge/RESEARCH.md`（A16 已由 C2-spike 任务写入）、`CHANGELOG.md`（条目已由实现任务写入）、
  `test/{route-concurrency,client}.spec.ts`、`lib/` 编译产物。

## Round 26 (2026-11-07) — v0.6.0 isolated verification: dual-route worker overflow (release-runner)

**性质**：隔离 profile 真机验证（`v0.6.0` 发布后验证，不碰 live `:3090`，不改 DSH core）。
完整证据：`docs/knowledge/evidence/v060-route-cap/`（README + report-full.txt + session-events.jsonl 52 事件）。

### 命令与结果（CONFIRMED，均在 `/home/fish/projects_mine/dsh-grok-workflow` 执行）

| 命令 | 结果 |
|---|---|
| `npm ci` | PASS |
| `npm run typecheck` | PASS（0 errors） |
| `npm run lint` | **4 warnings / 0 errors**（3 既有 + 1 新增：`src/run.ts:29` 未使用的 `RoleName` import，本版未修） |
| `npm run build` | PASS（`client bundle: 84123 bytes → lib/client.js`） |
| `git diff --exit-code -- lib/` | exit 0 |
| `npm test` | **35 files / 624 tests PASS**（24.34s） |
| `npm pack --dry-run` | 64 files / 299.1 kB `dsh-grok-workflow-0.6.0.tgz`（npm 缓存只读，用 workspace-local cache 重跑） |
| PR #43 CI (run `42362505851`) | Node 22 pass / Node 24 pass |
| Release workflow (run `42362674837`) | success；GitHub Release `v0.6.0` published **2026-11-07T10:09:17Z**，asset `dsh-grok-workflow-0.6.0.tgz` **299,146 B** |

### 隔离验证（CONFIRMED）

新鲜 profile `v060r`（`--from-default-profile headless`，隔离 `DSH_HOME=out/v060-verify/home`），
模型 `wb/cn:deepseek-v4-pro` + `agnes-3.0-flash`（`wb/cn:deepseek-v4.1-flash` 当天 per-model cooldown 400，如实记录并换路）。
Turn 1 gate-off 问候 exit 0；turn 2 团队档（`mode: full`，worker 双路由各 `maxInFlight: 1`，2 任务）→
`Grok workflow: COMPLETED`，2 verified，报告含 `Route overflows (full lane yielded, not failures):` +
`skipped full bifrost-completions/wb/cn:deepseek-v4-pro` ×2，双 worker 路由均在 `Model routes:`。
工作区 `out/v060-verify/work/` 仅 `sum.txt`（`TOTAL: 611`，11 B）+ `prod.txt`（`PRODUCT: 611`，13 B），无外写。
跨 run `(cross-run hint)` 行本轮未产出（未起第二个并发 live run），由 `test/route-concurrency.spec.ts` 13 例确定性覆盖。

### 边界

- `warn.emptyCap` 黄字提醒的浏览器渲染本轮 `NOT_RUN`（`test/client.spec.ts` 34/34 单元覆盖）。
- 报告中另有一条真实 `Route switches:`（agnes 路由一次 `format-error`，按 `maxRetries: 0` 记录为 switch，运行仍 COMPLETED）——如实记录，非本版缺陷。
- live `:3090` 未动（仍 `0.2.7`，D-013）；operator `DSH_HOME` 未写；无 DSH core 改动；已发布 tag 未移动。
