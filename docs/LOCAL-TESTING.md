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

The bundle patch inserts the plugin row automatically, but **a row in the graph is
not an activated plugin**. The plugin injects `workflowEngine` (the seam owned by
`@deepseek-ai/dsh-workflow`), and that seam only exists while a workflow *provider*
row is active. `@deepseek-ai/dsh-web-app` ships `workflow-ptc` with
`disabled: true`, so a stock web profile leaves this plugin **pending** forever:
`apply()` never runs, no `grok_workflow` tool is registered, no settings namespace
is served and no gate claims messages — while `--dump-config` still prints the row.
Measured on DSH 0.2.1-rc.2 in t32/t33 (see
[knowledge/VALIDATION.md](knowledge/VALIDATION.md)).

Verified activation, step by step (anyone can repeat it):

```sh
# 1. profile (web app). `--from-default-profile` REPLACES content, so do it first.
dsh --profile grok-workflow-dev --from-default-profile web

# 2. install the packed plugin (adds the dependency AND the bundle row)
dsh plugin --profile grok-workflow-dev add ./dsh-grok-workflow-0.2.0.tgz

# 3. re-enable a workflow provider in the profile patch
#    <profile>/cordis.patch.yml:
#      - id: workflow-ptc
#        config: { provider: spawn }
#        disabled: false

# 4. start it (a new instance on its own port; never restart a running one)
dsh --profile grok-workflow-dev --host 127.0.0.1 --port 3199 --no-open
```

Acceptance for "it is really active" (all four, in this order):

| Check | Expected |
| --- | --- |
| boot output | no `grok-workflow (...) pending` and no `did not activate` warning |
| `POST /api/settings/describe` | a namespace `grok-workflow` with `autoGenerate: true` |
| Plugins page (web GUI) | a card `Grok workflow`; opening it shows the settings page |
| a real session's `request/header.tools` | contains `grok_workflow` |

Three traps that cost real time in t32 (all reproduced):

- **A stale install.** `dsh plugin add` with the *same* `file:` tarball path is a
  pnpm no-op: the profile keeps the previously installed contents (the manifest
  said `dsh` without `client`, and the new `lib/client.js` was missing). Add a
  freshly named copy (`cp …-0.2.0.tgz /tmp/g$(date +%s%N).tgz`) or change the
  version, then confirm the installed `node_modules/<pkg>/package.json`.
- **`plugin add` rewrites the bundle list.** After adding a second package the
  profile's `dsh.profile.bundles` contained only that package — the earlier
  third-party bundle had been dropped. Re-add every bundle or edit
  `dsh.profile.bundles` by hand and re-check `--dump-config`.
- **`subagentProvider` is a DSH subagent provider, not an LLM provider.** It must
  be `spawn` or `fork` (the names the profile registers through
  `@deepseek-ai/dsh-subagent-spawn-in-process` / `-fork-in-process`). Setting it to
  an LLM provider id (`bifrost-completions`, …) makes every run fail closed with
  `no subagent provider registered for "<id>"`.

The settings page in the Web GUI writes into the **profile's `cordis.patch.yml`**
(the settings document lives there): after saving a field you can see the value in
that file, and it survives a restart. `roles.synthesizer`/`roles` chains are
rejected at load unless `synthesis: model` — the boot line names the offending key.

## Activate in an existing (live) profile — needs the operator's authorisation

This is the checklist for moving a **running** instance onto a new build. Steps 1–4 change files
only; step 5 is the only one that touches a running service, and it must not be done without the
user saying so.

```sh
# 1. back up the layer you are about to change
cp "$DSH_HOME/profiles/<name>/cordis.patch.yml" \
   "$DSH_HOME/profiles/<name>/cordis.patch.yml.bak-$(date +%Y%m%d-%H%M%S)"

# 2. install the packed plugin. A *new path* every time: `dsh plugin add` with the same
#    `file:` spec is a pnpm no-op, so an unchanged path can silently keep the old contents.
DEST="/tmp/install-$(date +%s%N)"      # a spec this profile has never been given
mkdir -p "$DEST" && cp dsh-grok-workflow-0.2.1.tgz "$DEST/"
dsh plugin --profile <name> add "$DEST/dsh-grok-workflow-0.2.1.tgz"

# 3. verify the installed bytes, not the pack
node -p "require('$DSH_HOME/profiles/<name>/node_modules/dsh-grok-workflow/package.json').version"
md5sum "$DSH_HOME/profiles/<name>/node_modules/dsh-grok-workflow/lib/client.js"
# compare with: tar -xzOf <tgz> package/lib/client.js | md5sum

# 4. re-assert the bundle layer (see the reconcile boundary below) and enable a workflow provider
#    expected for a web profile: ["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app","dsh-grok-workflow"]
#    (plus whatever other bundles the profile already had — a missing dsh-grok-workflow entry means
#    the layer was dropped, not that the install failed)
node -p "JSON.stringify(require('$DSH_HOME/profiles/<name>/package.json').dsh.profile.bundles)"
#   - id: workflow-ptc
#     config: { provider: spawn }
#     disabled: false

# 5. 🔴 RESTART THE RUNNING INSTANCE — REQUIRES THE USER'S EXPLICIT AUTHORISATION.
#    Never run this on a service the user is using without being asked to.
kill <pid from: ss -ltnp | grep :<port>>
DSH_HOME=/home/fish/dsh-layerfs \
  /home/fish/.local/bin/dsh web --host 100.111.111.88 --port 3090 --no-open   # same flags as today
```

After the restart, prove activation with the four checks in [Enable](#enable). A settings edit
made later applies to the **next** message; the restart in step 5 is only needed for the plugin
*build* (and for a hand-edited patch file).

### Why step 4 re-checks the bundle list: what `plugin add` actually does

`dsh plugin add` ends in `reconcile()` (`@deepseek-ai/dsh-plugin-manager/lib/index.js:326-341`),
which rebuilds `dsh.profile.bundles` instead of appending to it:

- an entry that is **not** a dependency (a bundle the launcher injects, e.g. `@deepseek-ai/dsh-base`)
  is kept unconditionally;
- an entry that **is** a dependency is kept only when the installed package still declares
  `dsh.bundle` (`bundleManifest(...).dsh.bundle !== undefined`);
- a newly installed dependency is appended only if it declares `dsh.bundle`; otherwise `dsh`
  prints `<name> declares no dsh.bundle — installed as a plain dependency, not a profile layer`
  and the package is *not* a layer.

So the list is not "overwritten with the new package" — it is reconciled, and the way to lose an
existing layer is for its installed manifest to stop declaring `dsh.bundle` (which is exactly what
happened in t32 when a script rewrote the installed `dsh` field) or for its dependency to be
removed. Both are worth catching with step 4's one-line check.

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
- `pending` plugin row `grok-workflow (…): pending (waiting for service: workflowEngine)`:
  the web app ships `workflow-ptc` as `disabled: true`, so nothing provides the
  engine. Enable it in the profile patch (see [Enable](#enable)). `--dump-config`
  shows the plugin row *and* the disabled provider side by side — composition is
  not activation.
- `… did not activate`: the plugin's own `resolveConfig` rejected the config; the
  line names the key (for example `roles.synthesizer is set but synthesis is
  "deterministic"`).
- The `Grok workflow` card is missing and the browser console says
  `[grok-workflow] no settings namespace projects this plugin's fields`: the row did not activate
  (see the two lines above) or the settings service refused it. The page binds to the row that
  projects this plugin's fields, and says so in the console when it has to move.
- No `Grok workflow` card on the Plugins page although the row exists: the browser
  half is missing or stale. Check `<profile>/node_modules/<pkg>/lib/client.js`,
  `exports["./client"]` and `dsh.client` in the installed manifest; the boot HTML
  lists it as `dsh-grok-workflow/client.js` inside a `/plugins/??…` batch.
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
