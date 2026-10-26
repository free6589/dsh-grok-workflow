# Local Testing

## Requirements

- Node.js 22+ (verified locally with Node 26.8.1)
- npm or pnpm
- DSH CLI `0.2.1-rc.2` (verified)
- A DSH profile with `@deepseek-ai/dsh-base` / `dsh-web-app` or
  `dsh-headless`; those bundles provide `workflow-ptc`, `subagent`, and the
  `spawn` provider.

## Install dependencies and build

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` uses deterministic unit tests and a real DSH Loader integration
test with a fake subagent boundary. It does not call a model.

## Install into a DSH profile (development mode)

From the repository parent directory, create the profile **before** installing
the plugin. `--from-default-profile` replaces profile content, so running it
after `plugin add` would remove the installed bundle:

```sh
dsh --profile grok-workflow-dev --from-default-profile headless --dump-config
dsh plugin --profile grok-workflow-dev add /path/to/dsh-grok-workflow
dsh --profile grok-workflow-dev --dump-config | grep -n -A6 'grok-workflow'
```

Replace `/path/to/dsh-grok-workflow` with the checkout path. The bundle is a
local checkout, so this is a development-mode install. It is not an npm
release.

## Configuration

Configuration keys and their hard limits are listed in the
[README configuration table](../README.md#configure-disable-and-uninstall).
The plugin defaults are `maxConcurrency: 3`, `maxRetries: 1`, `maxTasks: 6`,
`timeoutMs: 1800000`, and `maxActiveRuns: 2`; values are tightened by the
calling profile, not by editing this repository.

## Enable

The bundle patch inserts the plugin row automatically. Ensure the workflow
engine and a subagent provider are present in the profile (the shipped base
composition provides them). Start the profile normally:

```sh
dsh --profile grok-workflow-dev
```

## Use

Ask the model to call `grok_workflow` with an objective, or supply a plan:

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
    }
  ]
}
```

Without `tasks`, the plugin asks a planner child to produce the plan.

## Disable or uninstall

```sh
# Disable just this row in the profile's cordis.patch.yml:
# - id: grok-workflow
#   disabled: true

dsh plugin --profile grok-workflow-dev remove dsh-grok-workflow
```

The `remove` command removes the bundle and its layer.

## Troubleshooting

- `no subagent provider registered for "spawn"`: the profile is missing
  `@deepseek-ai/dsh-subagent-spawn-in-process` or the engine's provider name
  differs. Set `provider` in the plugin config or use a profile with the base
  composition.
- `pending` plugin row: a required service (`tools`, `workflowEngine`, or
  `systemPrompt`) is absent. Run `dsh --profile <name> --dump-config` and check
  the base composition.
- `maximum ... active runs`: stop an in-flight workflow before starting another.
- Model credentials are environment-provided; never put keys in the profile,
  this repository, or logs.

## Real-model smoke (local only)

Use a profile whose model route is known to work. The command must not print
credentials. Example shape:

```sh
# Load the profile's environment in the shell without echoing it.
set -a; . ~/.dsh/bifrost.env; set +a
dsh --profile grok-workflow-dev headless 'Use grok_workflow ...'
```

Record the exact model, profile, command, and result in
`docs/knowledge/VALIDATION.md`; do not record the key.

## Settings identity against the real projection / 用真实投影校验设置面识别

The settings identity check has a manual companion that uses the DSH installation's own
`dsh-settings` module instead of a fixture:

```sh
npm run build
node scripts/smoke-settings-identity.mjs            # discovers dsh-settings next to `dsh`
node scripts/smoke-settings-identity.mjs <path>     # or point at lib/types/schema.js
```

It prints the projected field set and the diagnostics line the plugin would emit, and exits
non-zero when the plugin fails to recognise its own descriptor. `npm run ci` does not run it,
because the module belongs to the installation rather than to this package.

设置面识别的手工配套检查使用 DSH 安装自带的 `dsh-settings`，而不是夹具：打印真实投影出的
字段集合与插件会输出的诊断行，识别失败时以非零码退出。`npm run ci` 不跑它，因为该模块属于
安装环境而不属于本包。
