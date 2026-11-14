# verify-H1 — real-machine install / load / interaction evidence

Group `verify-H1` (independent verification of the wave1+wave2 working tree:
`dsh-grok-workflow@0.8.0`, base commit `ee5e013`, tree dirty).

Environment for every command below (unless stated otherwise):

- host `omarchy` (this machine), Node `v26.8.1`, npm `11.19.0`
- DSH runtime `0.2.2-rc.3` (`dsh --version`)
- isolated home `DSH_HOME=<repo>/.verify-gw/home` (created by this group, deleted after the run)
- isolated profiles `gwverify` (from the shipped `web` template) and `gwverify-hl` (from `headless`)
- repo working tree at `/home/fish/projects_mine/dsh-grok-workflow`
- no credential value was read, printed, or written; keys only ever arrive through
  the environment-variable name the profile declares

## 1. Install (development install of the working tree)

```sh
npm run build                                     # exit 0, client bundle 186091 bytes -> lib/client.js
DSH_HOME=$PWD/.verify-gw/home dsh --profile gwverify --from-default-profile web --dump-config
DSH_HOME=$PWD/.verify-gw/home dsh plugin --profile gwverify add "$PWD"
```

Result: **PASS**. pnpm added `dsh-grok-workflow link:../../../..`; the installed manifest reads
version `0.8.0` and `node_modules/dsh-grok-workflow` resolves to the repository.
`dsh.profile.bundles` became three entries — see `profile-bundles.json`.
The same install was repeated for `gwverify-hl` (headless template): 3 bundles, exit 0.

## 2. `engines.dsh` (B01) on this runtime

`package.json` declares `"engines": { "dsh": ">=0.2.1-rc.2 <0.3.0" }`.
DSH's own `evaluatePluginCompatibility` was called directly with the plugin manifest and the
runtime that is actually installed: see `engines-dsh-B01.txt`.

- runtime `0.2.2-rc.3` → compatible (`null` = no unmet requirement, no version exemption needed)
- control `engines.dsh: "<0.2.0"` → REFUSED, proving the check is not vacuous
- boundary: `0.3.0-rc.1` is also accepted, because DSH evaluates the range with
  `semver.satisfies(runtime, range, { includePrerelease: true })`
  (`dsh-app-boot/lib/index.js`), and a prerelease of the excluded version still sorts below it.
  The install therefore never blocked on `engines.dsh`, and the upper bound does not fence off
  `0.3.0-rc.*` in practice.

## 3. Load (activation, not composition)

Boot logs (launch token redacted):

- enabled `workflow-ptc` → `boot-enabled.txt`: only the URL line; no `pending`, no
  `did not activate`, no `skipping profile bundle`.
- **control**, `--patch` disabling `workflow-ptc` → `boot-control-workflow-ptc-disabled.txt`:

  ```text
  dsh: warning: 1 entry did not activate
  grok-workflow (dsh-grok-workflow): pending (waiting for service: workflowEngine)
  ```

  The control proves the clean boot line is meaningful rather than a silent-mode artifact.

Live-instance checks against `gwverify` on `http://127.0.0.1:3411` (real `dsh`, isolated home):

- `POST /api/settings/describe` (RPC envelope `{type:"client-request",rpcId,method,payload:{args:{}}}`,
  browser cookie obtained by opening `/?token=…`) → `settings-describe.txt`: 23 namespaces, one of
  them `grok-workflow` (`autoGenerate: true`, `applies: live`, 28 projected fields, no secret slot).
- the served index references `dsh-grok-workflow/client.js` inside a `/plugins/??…` batch, and the
  fetched bytes are exactly `lib/client.js` plus an appended `sourceMappingURL` comment —
  `client-bundle-serving.txt`.
- a real session's outgoing request header carries the tool: the model-boundary mock logged the
  tool list `[… 'grok_workflow' …]` — `mock-boundary.txt`.

## 4. Interaction (real instance, model boundary mocked / blocked)

The production model gateway is **unreachable from this machine right now**:
`models.fyrali.com` resolves to the tailnet host `100.111.111.99` (`bifrost`, `tx 10764 rx 0`),
ping 100% loss and every probed TCP port closed; the exact DSH error is in
`model-boundary-BLOCKED.txt`. The local agent2api gateway answers `/v1/models` but requires a
gateway key. **A real-model turn is therefore BLOCKED — no PASS is claimed for it.**

What was executed instead mocks *only* the model HTTP endpoint
(`.verify-gw/mock-model.mjs`, an OpenAI-compatible stub; deleted after the run). The DSH Loader,
service registry, plugin lifecycle, gate, workflow engine and subagent spawn were the real ones.

| Path | Command | Result |
| --- | --- | --- |
| front desk, chat tier | `DSH_HOME=... dsh --profile gwverify-hl --patch mock.patch.yml "你好"` | **PASS** (exit 0) — `interact-chat-tier.txt` |
| front desk, team tier | same, with `"用团队跑一个小任务：…"` | **PARTIAL / model-BLOCKED** (exit 0, run FAILED) — `interact-team-tier.txt` |

Front desk (chat tier) stdout, produced by the plugin itself:

```text
档位：直答档 — 因为：这是问候/寒暄，没有要做的事，前台直接回答。

你好！我在。要做事就直接说：简单的我派一个工人，复杂的我开团队，拿不准我会先问你一句。

（这条没有动用团队，前台直答。）
```

The session log of that run also contains the plugin's own relay message, so the tier verdict is
recorded in the session, not only on stdout — `front-desk-relay-message.txt`
(session `session-dcf8b852-b28b-4221-a921-fa953e40b9a5`, event `user/message` seq 12).

Team tier: the gate claimed the message and stated
`档位：团队档 — 因为：你的消息里点名了团队，直接升级为团队档。`; a real run started, a planner child and
a worker child were spawned, and the run ended `Grok workflow: FAILED` with

```text
task-1: failed (2 attempts) — worker failed on every route: [format-error] child returned no valid structured result
```

i.e. the mocked model could not return a valid structured result. That is a statement about the
mock, and it is reported as such: **the team tier was really triggered; its completion needs a
real model and is BLOCKED.** No fabricated PASS is recorded anywhere in this bundle.

Diagnostic note (worth keeping): `config.enforceGate` defaults to `true`, but the front desk only
answers a message when grok mode is on for the session; the configuration that carries
`grokDefault: on` must reach the plugin through the row's own config — the profile layer
(`profiles/<name>/cordis.patch.yml`) is the reliable carrier; a `--patch` overlay alone did not
turn the tier line on in the headless profile during this run.

## 5. Regression snapshot (`npm run ci`)

`ci.txt`: `npm run ci` → `npm run typecheck && npm run lint && npm test`
→ `tsc -p tsconfig.json --noEmit` (clean), `oxlint src test` (0 errors, 4 warnings),
`npm run build` (client bundle 186091 bytes), `vitest run` → **48 test files, 897 tests, all
passed**, exit 0, 40 s.

`lib-sync.txt`: a second `npm run build` reproduces the checked-in `lib/` byte for byte
(`git status --short lib | md5sum` unchanged), and `src/client/index.js` and `lib/client.js` have
the same md5. 50 `lib/` files are modified relative to `HEAD` because wave1+wave2 are uncommitted —
that is the expected state, not drift.

`pack.txt`: `npm pack --dry-run --json` → `dsh-grok-workflow-0.8.0.tgz`, 82 entries,
`lib/client.js` and `cordis.patch.yml` included, `docs/knowledge/**` excluded (the `files` field
only packs `docs/*.md` plus `docs/images`).

## 6. Cleanup performed by this group

Killed this group's own processes (the two real `dsh` instances and the mock model server) and
deleted `<repo>/.verify-gw/` (isolated `DSH_HOME`, both throwaway profiles, mock server, logs,
npm cache). Nothing outside the repository was touched: the live instance on
`100.111.111.88:3080` (home `~/.dsh`), the user's `web` profile and `~/.dsh/*.env` were read-only
for this group.
