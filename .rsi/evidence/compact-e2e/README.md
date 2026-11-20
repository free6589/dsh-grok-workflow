# `/compact` in a fresh DSH profile — end-to-end verification (2026-11-20)

Proves the user-visible acceptance for the compact fix: in a **fresh DSH profile with
the fixed plugin installed as a bundle row**, a real team-tier turn runs and `/compact`
completes without `has no matching step/start event`.

## Environment (measured)

| item | value |
| --- | --- |
| DSH CLI | `dsh --version` → `0.2.2-rc.3` |
| Node.js | 26.8.1 |
| plugin under test | this checkout at `366d169` (`dsh-grok-workflow` 0.12.13, `link:` install) |
| profile | `compactfix-verify`, created from the `sdk` template in a throw-away `DSH_HOME` |
| profile home | `.tmp/e2e-home` (gitignored; removed after the run) |

## What is real and what is mocked

Real: the profile composition, the DSH Loader, the plugin's `agent/pre-step` gate, the
agent loop, the session journal on disk, the token meter, and the `/compact` command
(dispatched by `@deepseek-ai/dsh-sdk-jsonrpc-server` `session/query` through the real
command registry).

Mocked: the model only — `fake-model.mjs`, a local OpenAI-completions stub. It is the
one expensive/nondeterministic boundary, as `AGENTS.md` allows. No real credential is
involved: the route names `COMPACTFIX_LOCAL_KEY`, which the driver sets to a placeholder.

Activation is observable, not assumed: the model request's `request/header.tools`
contains `grok_workflow`, and the run emits `tool-workflow/run-start`,
`tool-workflow/agent-start`, `tool-workflow/agent-end`.

## Commands

```sh
export H="$PWD/.tmp/e2e-home"
dsh --profile compactfix-verify --from-default-profile sdk --dump-config   # create profile
DSH_HOME=$H dsh plugin --profile compactfix-verify add "$PWD"             # install bundle row
node .rsi/evidence/compact-e2e/drive.mjs --home "$H" --profile compactfix-verify --team
```

`drive.mjs` writes its overlay into the throw-away home (`llm-pi-ai` route +
`agent-default-model` + `grok-workflow` config), starts the stub model, speaks
newline-delimited JSON-RPC to the `sdk` app, sends one team-tier message, waits for the
turn, then sends `/compact`.

## Results

| run | command | result |
| --- | --- | --- |
| fixed, run 1 | `drive.mjs … --team` | exit 0; `/compact` → `{kind:"success", text:"Compacted 7 history items (~6140 tokens)."}`; 77 events, **0** orphan assistant rows (`run-team.json`) |
| fixed, run 2 | same, second time | exit 0; same `/compact` text; 55 events, **0** orphan rows (`run-team-2.json`) |
| component repro | `node scripts/repro-compact.mjs` | exit 0; writer `refused`; `measure.ok = true`; `/compact` → `No compactable history yet.` (`repro-after.txt`) |

The two runs differ in how many `tool-workflow/*` events the run produced; the `/compact`
outcome and the zero-orphan result are identical.

## The pre-fix journal this harness can observe

A `headless` profile carrying the **pre-fix** build (`5fb5da0^`, `39eda66`) and the same
message leaves exactly the defect the meter rejects: an `assistant/message` written after
`turn/end`, with no `step/start` behind it (`prefix-orphan-journal.txt`):

```text
== session-01125c86-…  ORPHAN seq=40 turn=1 step=1 source=workflow-notice  (42 events)
== session-d86b5415-…  ORPHAN seq=25 turn=1 step=1 source=workflow-notice  (27 events)
```

That is the same class of row as the reported `seq 3553` receipt. With the fixed build the
fresh-profile runs above produce none.

## Limits (stated, not hidden)

- **`grokDefault` must be `on`.** With the default (`off`) the gate passes every message
  through (`mode-off`) and the run says nothing about the plugin. The first attempt here
  did that; the tool list still showed `grok_workflow`, which is why activation and gate
  engagement are reported separately.
- **The orphaned session was not re-driven through `/compact` at profile level.**
  `session/resume` on a headless-format session fails before any command runs:
  `SessionFormatError: system/message requires a protected first surface head`
  (`run-orphan-compact.json`). The command-level before/after is therefore the committed
  component harness `scripts/repro-compact.mjs`, not a profile resume. This is a tooling
  limit of the SDK runtime, not a result.
- **The fix prevents; it does not repair.** A journal that already carries an orphan row
  still fails the meter on replay. No migration is included, and none is claimed.
- The interactive (`sdk`/web) admission path delivers the team-tier first answer through
  `enterAfter`, so it never reaches the receipt writer; the writer is exercised by the
  blocking path (one-shot/headless) and by `test/compact-step-pairing.spec.ts`. This is
  why the pre-fix SDK run in `run-before.json` also shows no orphan.

No credentials, tokens, or private keys are written here; the stub key is a placeholder
and the throw-away homes were deleted after the runs.
