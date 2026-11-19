# Round 17 — install acceptance (attempt 2): **FAIL**, reproducible

**Verdict: FAIL.** One demanded check does not hold, and it reproduces from a clean scratch with
the harness plus one one-liner:
`settings/describe` does **not** project 13 keys. It projects **11**, because the plugin marks
only 11 of its 13 configuration fields `volatile()` and DSH's generated settings form is built
from `projectForm(volatileForm(schema), config)`. The plugin's own diagnostics nevertheless
report **“13 field(s)”** for that page, and two source comments repeat the 13/21 figure.

Everything else the acceptance asks for is confirmed on a fresh isolated install of a tarball
packed from this tree: it installs without error, the bundle row appears, the instance boots
with no `pending` row, the `grok-workflow` namespace exists with `autoGenerate: true`, a real
session carries both `grok_workflow` and `grok_loop`, `POST /grok-workflow/loop`'s
`status`/`open`/`close` and the `grok_loop` tool's `status`/`close` match the docs, and
`src/client/index.js` is byte-identical to `lib/client.js`. No credential was read, copied or
written.

Per the task, the defect is **reported, not fixed** — code changes belong to the next phase.

## What fails, exactly

| | |
|---|---|
| criterion | `settings/describe` … “投影 13 键” (projects 13 keys) |
| observed | **11** projected keys: `mode, grokDefault, maxConcurrency, maxTasks, timeoutMs, loopEnabled, loopMaxRounds, loopFailStreak, loopIntervalMin, roles, synthesis` |
| where | `23-settings-projection.txt` — live `POST /api/settings/describe` on the installed build |
| why | `src/config.ts` declares 13 top-level keys, but only 11 are `.volatile()`; `toolName` and `configVersion` are plain, and DSH projects the volatile form only (`dsh-settings/lib/index.js` `volatileForm` + `projectForm`) |
| the wrong side | `src/config.ts:199-200` says “The settings page exposes 13 keys (toolName, configVersion, …)”; `src/client/index.js:4-5` still says “21 volatile fields” (the schema has 11 volatile nodes at any depth); the plugin's own `describeSurface()` prints “13 field(s)” for the page (`src/settings.ts:357`) |
| measured from | the installed package: `CONFIG_KEYS` length 13, volatile 11, plain `toolName`/`configVersion` (`23-settings-projection.txt`) |

Reproduce the failing check alone:

```sh
R=/home/fish/projects_mine/dsh-grok-workflow ; W=$R/.tmp/r17b
bash $R/.rsi/evidence/round-017/install/20-run-install.sh     # pack, install, boot, probe
node -e 'const r=require("./'$W'/logs/describe.json");const d=r.result.value.namespaces.find(n=>n.ns==="grok-workflow");console.log(Object.keys(d.value).length, Object.keys(d.value).join(","))'
# 11 mode,grokDefault,maxConcurrency,maxTasks,timeoutMs,loopEnabled,loopMaxRounds,loopFailStreak,loopIntervalMin,roles,synthesis
cat $W/logs/diagnostics.txt
# "… (13 field(s), applies live, …)"
```

This is a defect of the *claims* around the settings surface, not of installability. The
repository's own test already pins the 11-key projection (`test/settings-projection.spec.ts:20-22`),
so the next phase has to choose one side and make the other follow: either declare
`toolName`/`configVersion` volatile (a behaviour change: two more editable controls, and that
test plus `CONFIG_KEYS`-derived diagnostics need updating), or correct the criterion, the two
comments and the `describeSurface()` count.

## Criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | `npm pack` artifact installs without error | **PASS** — pack exit 0, `dsh plugin --profile acc-web add` exit 0 (only the peer-dependency WARN, F3) | `21-pack.txt`, `22-install.txt` |
| 2 | bundle row appears | **PASS** — `["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app","dsh-grok-workflow"]` | `22-install.txt` |
| 3 | `settings/describe` has the `grok-workflow` namespace | **PASS** — 23 namespaces, `autoGenerate: true`, `applies: live`, `secrets: []`, `revision: 0` | `23-settings-projection.txt` |
| 4 | …and projects 13 keys | **FAIL** — projects 11; 13 is the accepted surface, 11 is the projection | `23-settings-projection.txt` |
| 5 | `grok_workflow` available | **PASS** — present in a real session's `request/header` (33 tools) | `24-tools.txt` |
| 6 | `grok_loop` available when Schedule is composed | **PASS** — present with Schedule (`grok_loop` action enum `status/close/open`); the same tarball in a headless profile (no Schedule) mounts `grok_workflow` without `grok_loop` | `24-tools.txt`, `attempt-1/11-headless-install.txt` |
| 7 | `POST /grok-workflow/loop` `status`/`open`/`close` match the docs | **PASS** — closed → open (taskId, intervalMinutes 60, rounds 10, nextAt) → open → closed; 400 unknown action, 401 no cookie, 405 GET; the durable rrule row (`Loop heartbeat`, `[grok-workflow loop]` prompt, `INTERVAL=60 COUNT=10`, target = same session) exists while open and is **deleted** on close | `25-loop-route.txt` |
| 8 | tool `status`/`close` match the docs | **PASS** — executed from the installed `lib/loop-surface.js`: status/close reach the service, `open` throws `loop/user-only` with zero service calls, foreign session / missing agent / bad action refused | `27-loop-tool.txt` |
| 9 | `src/client/index.js` == `lib/client.js` byte for byte | **PASS** — sha256 `d290765594d62a3bcdb6a740a53a6d37c73b5f57d3d341051cc54bdcd5957d2a` in the checkout, the tarball and the installed package; `cmp` identical | `26-client-bytes.txt` |
| 10 | no credential written anywhere | **PASS** — no secret pattern in this directory; the launch token appears only as `[REDACTED]`; the per-instance cookie jar and the token-bearing boot log lived in `.tmp/r17b` (gitignored) and were deleted after the evidence was written | `28-credentials.txt` |
| 11 | conclusion PASS or reproducible FAIL | **FAIL, reproducible** — this document; fix deferred to the next phase per the task | — |

## Findings (reported, not fixed)

- **F1 — the settings surface is described three different ways.** Declared 13 / projected 11 /
  diagnostics “13 field(s)” / client comment “21 volatile fields”. Locators:
  `src/config.ts:199-200`, `src/client/index.js:4-5`, `src/settings.ts:271-274` and
  `:357`. Measured: `23-settings-projection.txt`. This is the criterion that fails the round.
- **F2 — the tarball publishes `.js` files that reference `.js.map` files it does not publish.**
  37 `lib/*.js` files ship, 36 of them end with `//# sourceMappingURL=<name>.js.map`, and
  `tar -tzf … | grep -c '\.map$'` → 0 (the `files` list only allows `lib/**/*.js` and
  `lib/**/*.d.ts`). Debugger-only impact. Evidence: `21-pack.txt`, `26-client-bytes.txt`.
- **F3 — every install prints a peer-dependency warning.** `peerDependencies` pin
  `@deepseek-ai/dsh-{agent,llm,system-prompt,tools,workflow}` at `0.2.1-rc.2` while the machine
  runs DSH `0.2.2-rc.3`; `engines.dsh` is `>=0.2.1-rc.2 <0.3.0`, so the bundle loads. A
  `--strict-peer-dependencies` install would refuse. Evidence: `22-install.txt`,
  `package.json`.

## How this run was made

- Harness: `20-run-install.sh`. It packs `.tmp/r17b/tree` (an rsync copy of this checkout with
  `node_modules` symlinked — **nothing was built in the shared checkout**), installs into
  `DSH_HOME=.tmp/r17b/home` profile `acc-web` (from the shipped `web` template), enables
  `workflow-ptc` (the web template ships it disabled), boots on `127.0.0.1:3441`, and probes.
- The settings/tool probes use the Connection RPC envelope
  `{type:"client-request", rpcId, method:"<endpoint>", payload:{args:{…}}}`; the session
  methods take their argument under `args.request`. `POST /grok-workflow/loop` is the plugin's
  own route and takes a plain JSON body.
- `request/header` is written before the model call, so the 33-tool list exists even though the
  isolated home has no model credential (the turn ends with `MISSING_CREDENTIAL` — see
  `24-tools.txt`).
- Attempt-1 raw logs are kept under `attempt-1/`; they were produced from the same commit and
  reach the same numbers (tarball sha256 `8d7ff2af…`, 11 projected keys). `attempt-1/09-lib-freshness.txt`
  (rebuild of the packed `src/` in a scratch copy differs from the shipped `lib/` in no file)
  was not re-run in attempt 2.

## Not run

- **A live model turn that actually calls `grok_workflow`** (`NOT_RUN`): the isolated home has
  no model credential and copying one out of a live profile is forbidden by the task. The tool
  is present in the live header with its full parameter schema (`24-tools.txt`).
- **A GUI click on the composer switch and a screenshot of the settings page** (`NOT_RUN`): the
  route behind the switch is proved end-to-end over HTTP (`25-loop-route.txt`); no browser was
  driven this round.
- **Live `grok_loop` through an agent turn** (`NOT_RUN`): the installed `lib/loop-surface.js`
  was exercised in-process with a recording `LoopService` instead (`27-loop-tool.txt`), and the
  same service methods were proved live through the HTTP route.

## Environment

- DSH `0.2.2-rc.3`, Node `26.8.1`, pnpm `12.4.2`, repository `dsh-grok-workflow` @
  `4db78f41f00416abe55baa1ec9403c4fa1a63379` (branch `main`), package `0.11.15`.
- Scratch: `.tmp/r17b` (gitignored) — tree copy, `DSH_HOME`, profile, logs; deleted after the
  evidence was written. `git status` shows no modified tracked file: the only addition is
  `.rsi/evidence/round-017/`.
