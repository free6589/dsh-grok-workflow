# Round 17 — heartbeat live verification: procedure

Everything here was executed on this machine between 2026-11-19 08:38 and 09:10 (+08:00,
Asia/Singapore). The repository at `main` = `4db78f4` was **read only**; the only writes are
under `.rsi/evidence/round-017/heartbeat-live/`.

## What "live" means here

A real, isolated DSH instance boots the shipped DSH 0.2.2-rc.3 stack from a private
`DSH_HOME` inside this evidence directory (`instance/dsh-home`). Real Loader, real web
server, real connection trust fence, real Session persistence, real
`@deepseek-ai/dsh-schedule` service with its durable domain on disk, and this plugin loaded
through the real Loader as the profile's bundle layer.

The only stubbed boundary is the remote model: `stub/stub-llm.mjs` listens on
`127.0.0.1:3197` and speaks `openai-completions`. It answers `STUB_HEARTBEAT_ROUND_OK`.
That is the repo's documented allowance (`AGENTS.md` "Truth rules for tests": mock only
expensive or nondeterministic boundaries). No DSH core package, no plugin source, and no
shipped profile was modified.

## Isolation

| Item | Value |
| --- | --- |
| `DSH_HOME` | `.rsi/evidence/round-017/heartbeat-live/instance/dsh-home` |
| profile (full) | `live-verify` — web template + `workflow-ptc` enabled + stub provider + probe row |
| profile (minimal) | `live-verify-minimal` — web template + `schedule` row `disabled: true` |
| workspace | `.rsi/evidence/round-017/heartbeat-live/workspace` (the instance's cwd) |
| plugin | installed with `dsh plugin add <repo>` → `link:` dependency, built `lib/` at `4db78f4` |
| listener | `127.0.0.1:3271` (full), `127.0.0.1:3272` (minimal) |
| model stub | `127.0.0.1:3197` |

Profile layers: `instance/dsh-home/profiles/live-verify/cordis.patch.yml` and
`…/live-verify-minimal/cordis.patch.yml`. Composed trees: `instance/dump-config.yml`,
`instance/dump-config-minimal.yml`.

## The three harness pieces

1. `probe/` — a plugin row loaded by the *real* Loader inside the host
   (`live-verify-probe`). It holds the host's real `schedule` service and the repository's
   own built `lib/loop.js`, `lib/loop-surface.js`, `lib/gate.js`, and it executes one
   operation per request over a file queue (`qa/cmd.json` → `qa/res-<seq>.json`). This is
   how the shell reaches operations that have no HTTP surface: Schedule's manual delivery
   (`schedule.run`), `stopAll`, `forgetSession`, and the shipped `classifyPreStep`.
   The host composes more than one Context carrying this row, so the answer file is created
   with `wx`: the first answer wins and a duplicate is a no-op.
2. `probe-http.mjs` — the browser side of the loop route: exchanges the process launch
   token for the browser-session cookie once (`GET /?token=…` → 303 + `set-cookie`) and then
   POSTs JSON to `/grok-workflow/loop` with that cookie. The token and the cookie live only
   in `instance/.token` and `instance/.cookies.json`, both deleted at the end of the run;
   every log has the token scrubbed to `token=[REDACTED]` before it is kept.
3. The scripts — each is one self-contained run inside one process namespace, so a script
   can signal its own child instance:

| Script | What it does | Transcript |
| --- | --- | --- |
| `core-chain.sh` | status → route open → tool/service refusals → real delivery → delivered turn → `classifyPreStep` → close → no row | `results/01-core-chain.txt`, `results/02-session-trace.txt` |
| `stop-file-test.sh` | operator stop marker present, then a real delivery | `results/03-stop-file-unreachable.txt` |
| `reload-test.sh` | open → SIGTERM → reboot → SIGKILL → reboot, reading the durable store each time | `results/08-reload-semantics.txt` |
| `classify-minimal.sh` | `classifyPreStep` on the delivered message, then the minimal composition | `results/09-classify-and-minimal.txt` |
| `route-actor.sh` | the route's body carrying an `actor` field (ignored: the route has no Agent identity) | `results/10-route-actor-field.txt` |
| `no-credential.sh` | the same chain with no model credential: the delivery is accepted, the round fails closed | `results/04-model-boundary-blocked.txt` |

## Reproduce

```sh
cd /home/fish/projects_mine/dsh-grok-workflow
npm run build                     # lib/ must match src/ (verify:lib passes at 4db78f4)
EV=.rsi/evidence/round-017/heartbeat-live
cd "$EV/stub" && STUB_PORT=3197 node stub-llm.mjs &        # model boundary
cd "$EV" && PROBE_STUB_KEY=probe-stub-placeholder \
  DSH_HOME="$EV/instance/dsh-home" dsh --profile live-verify \
  --host 127.0.0.1 --port 3271 --no-open                   # the isolated instance
# in another shell: bash "$EV/core-chain.sh" (each script boots its own instance)
```

`PROBE_STUB_KEY` is a placeholder string for the local stub, not a credential. Without it the
instance's model call fails closed with `MISSING_CREDENTIAL` — `no-credential.sh` exists to
keep that boundary in evidence (`results/04-model-boundary-blocked.txt`), see
`results/00-verdicts.md` §Q4b.

## Layout

```
heartbeat-live/
  procedure.md                  this file
  commands.log                  ordered commands and the transcript each produced
  results/00-verdicts.md        per-question verdict with citations
  results/01-core-chain.txt     the whole chain, one transcript
  results/02-session-trace.txt  the delivered session's events (seq/type/source/text)
  results/03-stop-file-unreachable.txt
  results/04-model-boundary-blocked.txt   delivery accepted, round fails closed (no credential)
  results/05-delivery-receipt.json        the receipt as a machine-readable artifact
  results/06-reopen-for-forget.txt
  results/07-reopen-for-stopall.txt
  results/08-reload-semantics.txt
  results/09-classify-and-minimal.txt
  results/10-route-actor-field.txt   the route's body with an ignored `actor` field
  results/schedule-delivery-message.json   the exact delivered message object
  probe/ probe-http.mjs qa.sh *.sh
  instance/  (dsh-home, patch layers, composed dumps, redacted boot logs)
  stub/      (local model stub + its request log)
  workspace/ (the instance's cwd)
```
