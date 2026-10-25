# Grok Workflow for DSH

`dsh-grok-workflow` is an external plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) that adds one model-facing tool, `grok_workflow`. It turns a complex objective into a bounded workflow:

**Plan → Execute → Verify → Retry (bounded) → Synthesize**

The implementation is intentionally small at the harness boundary: the workflow runs on DSH's existing `workflowEngine` and child agents are created through DSH's subagent capability. This plugin does not fork the DSH agent loop, install a second scheduler, or modify DSH core.

## What it does

- Decomposes an objective into at most `maxTasks` independent tasks (or accepts a caller-supplied plan).
- Runs tasks through a bounded worker pool. Default concurrency is **3**, hard maximum **6**.
- Sends every task result to a **fresh verifier agent** with the task's acceptance criteria.
- Rejects a bare `pass`: the verifier must match every criterion exactly, mark it met, and cite concrete non-empty evidence.
- Retries failed verification at most `maxRetries` times (default **1**, hard maximum **3**).
- Returns a canonical report whose `status` is exactly `completed`, `partial`, or `failed`.
- Surfaces incomplete tasks, attempt history, errors, and uncertainties instead of turning them into a success claim.
- Cleans up active workflow runs when the tool call is cancelled or the plugin is unloaded.

## Requirements

| Component | Requirement |
|---|---|
| DSH | `0.2.1-rc.2` verified; package declares `>=0.2.1-rc.2 <0.3.0` |
| Node.js | 22 or newer (verified locally with 26.8.1) |
| DSH composition | A bundle that provides `workflow-ptc`, `subagent`, and a subagent provider (`spawn` is the default) |
| Model | Any DSH model route; child agents inherit the deployment/parent route |

The base, web, and headless DSH bundles already mount the required workflow and subagent services.

## Installation

### From a local checkout

```sh
dsh plugin --profile <profile> add /absolute/path/to/dsh-grok-workflow
```

### From GitHub

After the repository is public:

```sh
dsh plugin --profile <profile> add github:free6589/dsh-grok-workflow
```

This package is **not published to npm**. The GitHub tree includes the compiled
`lib/` files, so installing does not require a build step.

### What the bundle does

The package manifest declares:

```json
"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
```

The patch inserts one row into the profile:

```yaml
- insert:
    - id: grok-workflow
      name: dsh-grok-workflow
```

DSH's profile installer adds `dsh-grok-workflow` to `dsh.profile.bundles`; the
bundle row is mounted after the profile's base composition.

## Enable and verify

Restart the profile. The tool is available when the profile boots. To inspect
the composed tree before booting:

```sh
dsh --profile <profile> --dump-config | grep -A4 'grok-workflow'
```

Expected shape:

```yaml
- id: grok-workflow
  name: dsh-grok-workflow
```

The plugin requires three DSH services: `tools`, `workflowEngine`, and
`systemPrompt`. If a profile omits the workflow engine or a subagent provider,
the plugin stays pending or fails loudly instead of silently disabling work.

## Usage

Ask the model to use `grok_workflow`, or call it through the normal DSH tool
path. A simple objective:

```json
{
  "objective": "Audit the repository for stale TODOs, fix the confirmed ones, and report all remaining items."
}
```

A caller-supplied plan (skips the planner child):

```json
{
  "objective": "Audit the repository for stale TODOs and verify each finding",
  "tasks": [
    {
      "id": "scan",
      "title": "Scan",
      "objective": "Find all TODO comments",
      "expectedOutput": "A file/line list",
      "acceptanceCriteria": ["Every reported path exists", "No duplicate paths"],
      "context": "Repository root is the working directory",
      "constraints": ["Do not modify files"]
    },
    {
      "id": "check",
      "title": "Check",
      "objective": "Verify each reported TODO is still present",
      "expectedOutput": "A verified subset with evidence",
      "acceptanceCriteria": ["Each retained item cites a current file and line"],
      "context": "Repository root is the working directory",
      "constraints": ["Do not modify files"]
    }
  ]
}
```

### Final report

The tool returns a JSON report with:

- `status`: `completed | partial | failed`
- `plan`: `caller | planner | fallback | unavailable`
- `tasks`: per-task status, every attempt, execution result, and verifier result
- `confirmed`: criterion-by-criterion evidence
- `incomplete`: failed/unfinished items and reasons
- `errors`: plan/execute/attempt errors
- `uncertainties`: reported uncertainties and low-confidence warnings
- `limits`: the limits actually applied

Status rules are fail-closed:

- `completed` only when every planned task is verified, there was no planning fallback, and no unresolved failure exists.
- `partial` when at least one task is verified but the workflow is not fully clean, or planning degraded to a one-task fallback.
- `failed` when no task is verified or the run times out before a report.

## Configuration

Configuration belongs to the profile's `cordis.patch.yml` (or a `--patch`
overlay), under the bundle row. Example:

```yaml
- id: grok-workflow
  config:
    toolName: grok_workflow
    maxConcurrency: 3
    maxRetries: 1
    maxTasks: 6
    timeoutMs: 1800000
    maxActiveRuns: 2
    # subagentProvider: spawn
```

| Key | Default | Hard limit | Meaning |
|---|---:|---:|---|
| `toolName` | `grok_workflow` | pattern `^[a-z][a-z0-9_]{1,40}$` | Model-facing tool name |
| `maxConcurrency` | `3` | `6` | Maximum child agents in flight per run |
| `maxRetries` | `1` | `3` | Retries per task after the initial attempt |
| `maxTasks` | `6` | `12` | Maximum caller or planner tasks |
| `timeoutMs` | `1800000` | `86400000` | Overall run deadline |
| `maxActiveRuns` | `2` | `4` | Concurrent `grok_workflow` calls in one plugin instance |
| `subagentProvider` | engine default (`spawn`) | string | Optional provider override |

The script also passes a per-run `maxTotalAgents` backstop to the DSH engine.
The engine's own deployment-level caps still apply; the plugin's smaller limits
are enforced inside the generated script.

## Disable or uninstall

Disable just this bundle row in the profile patch:

```yaml
- id: grok-workflow
  disabled: true
```

Or remove the package:

```sh
dsh plugin --profile <profile> remove dsh-grok-workflow
```

When disabled or absent, the tool and prompt section are not registered; normal
DSH sessions are unaffected.

## Testing

```sh
npm install
npm run typecheck
npm run lint
npm test
```

What the suite covers:

- Real generated workflow script: planning, two parallel tasks, concurrency cap, completed/partial/failed, exact-criterion verifier matching, evidence rejection, bounded retry, planner fallback.
- Caller task validation and configuration hard limits.
- Credential redaction (API keys, tokens, private keys, JWTs, URL secrets) and non-secret prose preservation.
- Plugin lifecycle: max active runs, cancellation, deadline, unload cleanup, recursive-subagent rejection.
- A real DSH Loader composition with the real DSH tool registry and system prompt; only the workflow/subagent boundary is faked. It verifies registration, prompt-section registration, unload, and disabled-row inertness.

The test suite does not call an online model. The real-model acceptance run is
performed locally and recorded in `docs/knowledge/VALIDATION.md`.

## Security and limits

- The plugin does not bypass DSH approvals, sandbox policy, or tool policy.
- Child agents cannot recursively invoke `grok_workflow`; the tool rejects calls
  whose session is a subagent. Other inherited tools remain subject to DSH's
  own policy.
- Child agents inherit the parent's available tools and permissions. There is no
  read-only capability mode in this MVP; the verifier prompt asks it not to
  modify files, but this is not a hard sandbox guarantee.
- Reports and diagnostics pass through a best-effort credential redactor.
  Redaction is not a guarantee: do not place secrets in objectives or task
  text, and never log credentials.
- Workflow scripts are static. The objective and tasks cross into the workflow
  sandbox as JSON data, not as code.
- Output renders are bounded; the canonical JSON report remains available.
- No hidden retry loops: each task's attempts are bounded and reported.

## Known limitations

- No pause/resume, journaling, or cross-process resume. Cancellation is
  cooperative through DSH signals.
- No background job mode; a call runs in the foreground and is cancelled by the
  caller's signal.
- No task dependency graph. Tasks are independent by design; `dependsOn` is
  rejected.
- No per-task model/provider selection. Children inherit the parent/deployment
  route; the optional provider only selects the subagent provider, not a model.
- Verification is independent-agent plus evidence validation, not a formal
  proof of correctness.
- No custom Web UI panel; the tool uses DSH's generic tool card.
- The plugin has only been verified against DSH `0.2.1-rc.2`. Other versions in
  the declared range are untested.

## Architecture

See `docs/ARCHITECTURE.md` for the DSH-to-plugin mapping and
`docs/knowledge/RESEARCH.md` for the DSH/Grok Build source notes. The short
version:

1. `grok_workflow` validates its input and builds a static JS workflow script.
2. `ctx.workflowEngine.start()` executes it in DSH's PTC sandbox with a bounded
   child-agent budget.
3. The script plans (or accepts a plan), runs a bounded worker pool, verifies
   every acceptance criterion with a fresh verifier, retries within the limit,
   and returns a canonical report.
4. The tool redacts credentials, validates the report shape, and returns it to
   the model with a concise rendered summary.

## 中文摘要

`dsh-grok-workflow` 是 DeepSeek Harness 的外部插件，新增 `grok_workflow` 工具，按“计划 → 执行 → 独立验证 → 有界重试 → 汇总”运行复杂目标。它复用 DSH 的 `workflowEngine` 和 subagent 能力，不修改 DSH 核心。

安装：

```sh
dsh plugin --profile <profile> add /path/to/dsh-grok-workflow
```

默认并发 3（硬上限 6），每个任务默认重试 1 次（硬上限 3），最终状态只能是 `completed`、`partial` 或 `failed`。未完成任务、错误和不确定性都会出现在报告中，不会把部分成功说成全部成功。插件未在 npm 发布；当前仅验证 DSH `0.2.1-rc.2`。

## License

MIT. See `LICENSE`.
