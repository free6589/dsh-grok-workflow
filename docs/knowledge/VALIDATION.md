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
