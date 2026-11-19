# Round 18 — tag install acceptance (`v0.11.17`, FROM GITHUB): **PASS**

**Verdict: PASS.** The release tag installs exactly the way a user installs it —
`dsh plugin --profile acc-tag add github:free6589/dsh-grok-workflow#v0.11.17` —
into a fresh isolated `DSH_HOME`/profile, boots with no `pending` row, and every
probed surface matches the docs. No credential was read, copied or written (the
launch token and cookie jar lived in `.tmp/r18`, gitignored, deleted afterwards).

## Criteria

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | GitHub tag install exits 0 | **PASS** — `dsh plugin add github:…#v0.11.17` exit 0 (only the known peer-dependency WARN, same as F3/round-17) | `22-install.txt` |
| 2 | bundle row + installed version | **PASS** — bundles `[@deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app, dsh-grok-workflow]`; installed `dsh-grok-workflow@0.11.17` | `22-install.txt` |
| 3 | `settings/describe` has the namespace | **PASS** — 23 namespaces, `autoGenerate: true`, `applies: live` | `23-settings-projection.txt` |
| 4 | …and projects 11 keys | **PASS** — `mode,grokDefault,maxConcurrency,maxTasks,timeoutMs,loopEnabled,loopMaxRounds,loopFailStreak,loopIntervalMin,roles,synthesis` (the 11/13 wording fixed in 0.11.16) | `23-settings-projection.txt`, `27-diagnostics.txt` (`11 of 13 field(s)`) |
| 5 | `grok_workflow` + `grok_loop` available | **PASS** — both present in a real session's `request/header` | session log (`session.jsonl`, scratch-only) |
| 6 | `POST /grok-workflow/loop` open/status/close | **PASS** — status → open (`taskId`, `intervalMinutes 60`, `rounds 10`, `nextAt`) → status → close → status; 400 unknown action, 401 no cookie, 405 GET | `25-loop-route.txt`, `28-http-codes.txt` |
| 7 | `lib/guardian.js` ships with the tag | **PASS** — installed `lib/guardian.{js,d.ts}` present; `guardian exports: GUARDIAN_LIMITS,createRunGuardian,…`; repo `lib/guardian.js` sha256 `072068d4…` == installed copy, `cmp identical` | `22-install.txt`, `26-client-bytes.txt` |
| 8 | `src/client/index.js` == `lib/client.js` == installed | **PASS** — sha256 `abe48600…` in all three places, both `cmp identical` | `26-client-bytes.txt` |
| 9 | no credential written anywhere | **PASS** — only `apiKeyEnv: DEEPSEEK_API_KEY` (an env-var *name* in dump-config) and redacted boot log; token-bearing `boot.log`/cookie jar deleted with the scratch | `28-http-codes.txt` (method), `boot.redacted.log` (scratch-only) |
| 10 | conclusion PASS | **PASS** — this document | — |

## How this run was made

- Harness: `20-run-install.sh` (this directory). Unlike round-17's tarball
  harness it installs `github:free6589/dsh-grok-workflow#v0.11.17` — no local
  path anywhere in the install step. Scratch: `.tmp/r18` (gitignored):
  isolated `DSH_HOME`, profile `acc-tag` (from the shipped `web` template),
  port 3442. Deleted after the evidence files above were written:
  `rm -rf .tmp/r18`.

## Not run

- **A live model turn that actually calls `grok_workflow`** (`NOT_RUN`): the
  isolated home has no model credential and copying one out of a live profile
  is forbidden. The tool is present in the live header with its full parameter
  schema.
- **A GUI click / screenshot** (`NOT_RUN`): the route behind the composer switch
  is proved end-to-end over HTTP (`25-loop-route.txt`); no browser was driven.
- **rrule timed delivery** (`NOT_RUN`): `open` arms the durable Schedule row and
  `close` deletes it (same as round-17); waiting for the 60-minute floor was not
  part of this round.

## Environment

- DSH `0.2.2-rc.3` (same machine that ran round-17), Node `v26.8.1`,
  repository `dsh-grok-workflow` @ `5fc3e1d` (branch `main`), tag `v0.11.17`.
- Remote CI on the release commit: `44459682983` success; Release workflow
  created `Grok Workflow for DSH v0.11.17` with asset
  `dsh-grok-workflow-0.11.17.tgz`.
