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
