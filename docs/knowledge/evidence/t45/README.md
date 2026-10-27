# t45 — unload observability, the one-shot notice, per-session slots, the 60-minute default

What this set proves: the four defects t41 diagnosed now leave evidence instead of silence.
Before t45, two runs in two workspaces died 573 ms apart and the only trace was "was cancelled
before it produced a report"; a process-wide run cap let one session refuse three others; and a
30-minute deadline killed two four-task runs at 30m00s / 30m01s.

## Where it was taken

| fact | value |
| --- | --- |
| instance | own debug profile `web-grok-debug` (`DSH_HOME=/home/fish/dsh-layerfs`), `http://127.0.0.1:3199` |
| launched as | `dsh --profile web-grok-debug --host 127.0.0.1 --port 3199 --no-open` |
| plugin source | `npm pack` of this tree → `dsh plugin --profile web-grok-debug add file:/tmp/t45-pack*/…tgz` |
| installed build (final) | `lib/records.js` `01e51c4b9ee8b16dd27503d3f53b5b83`, `lib/run.js` `4c25ff48ba8764e37a791855b66c964c`, `lib/config.js` `0c5255f521324b921ffdd14fbb6e2b13` — byte-identical to the repo build (`md5sum` compared) |
| model | `bifrost-completions / wb/cn:deepseek-v4.1-flash` for every role; `synthesis: deterministic`, `maxRetries: 0`, `maxTasks: 1` (2 in the last run, to keep it alive across the kill) |
| live `:3090` | **not touched** |

Ground truth is always the server's own session log (decompressed `session.v4.jsonl.zstd`), so
timings and payloads are the host's, not the screenshot's.

## 1. The cap is per session (P1-3) — `slots.log`, `slots.json`, `20-session-a-running.png`, `21-session-b-running.png`

Two GUI sessions, `maxActiveRuns: 1`, `maxActiveRunsTotal: 4`. Session A sends at 16:46:20 and
its run node is `running`; session B sends at 16:46:29 **while A still holds the only slot of its
own session** and its node is `running` too (`slots.json`: `{a: running, b: running,
refusalB: false}`). Before t45 this is the exact shape that was refused three times in t41
(`start-failed`, "already has 2 active run(s)"). The two runs were then left in flight on purpose
for item 2.

## 2. An unload is explicable, and it says what it broke exactly once (P0-1, P0-2)

**Shutdown path (final build, `SIGTERM` while a run was live)** — `shutdown-dispose-record.log`,
`shutdown-notice-text.txt`, `B0-run-live-final-build.png`:

```json
{"v":1,"at":"2026-10-27T17:22:05.532Z","uptimeMs":34352,"signals":["SIGTERM"],
 "trigger":"shutdown","callSite":[…6 frames…],"activeRuns":1,"pending":0,
 "runs":[{"runId":"…","sessionId":"session-1049f628-…","startedAtMs":…,"elapsedMs":…}],
 "notices":1}
```

Notice text: `[grok-workflow] The plugin was unloaded while this session had 1 workflow run in
flight, so that work was cancelled. Cause: the process is shutting down (SIGTERM), so this is not
a deadline, not a manual stop and not a plugin setting. …`

**Settings-toggle path (GUI switch "Enable dsh-grok-workflow" clicked while a run was live)** —
`toggle-dispose-record.log`, `toggle-notice-text.txt`, `50-before-toggle.png`,
`52-conversation-after-disable.png`: `activeRuns: 1`, `notices: 1`, `signals: []`, and the notice
says `the plugin was unloaded inside a running process … the host does not disclose which`, which
is the honest answer — DSH's manager writes `disabled` into the profile patch and the loader
disposes, so the plugin receives no intent (`dsh-plugin-manager/lib/index.js:1058-1075`).

**Two sessions, one kill** — the first build was killed with two runs live in two workspaces:
each session received exactly **one** record and **one** notice, and the record's `runs` array
holds only that session's run while `activeRuns: 2` reports the process-wide count. That is the
shape t41 lacked: who/when/how many, per session.

**Idle unload is silent** — disabling the plugin with nothing running wrote no notice and no
record into any session (`61-after-idle-disable.png`; notice rows before/after: 0/0), which is
the captain's t45 ruling: a user-intended disable answers directly and must not be nagged.

## 3. What is **not** proven here

- **The transcript row of the notice was not seen on screen.** Every session that actually
  received a notice had been killed mid-turn, and such sessions are not listed in the sidebar
  (no title was generated) nor found by "Search sessions"; the two sessions that *were* opened
  during the runs showed a transcript, but their notice arrived after the client had closed the
  turn. The event itself is in the session surface (`assistant/message`, `model:
  workflow-notice`, `surfaceOp: append`), which is the same append path the plugin's report
  delivery uses — but "it renders" is **NOT_RUN**, not claimed.
- **The settings page** (new labels `Active runs per session` / `Active runs across all
  sessions`, `timeoutMs` default `3600000`) was not captured: the Settings dialog did not open in
  the scripted runs. Covered by `test/client.spec.ts` + `test/settings-projection.spec.ts`
  (structural), not by a screenshot.
- The 573 ms-apart double cancellation from t41 was not reproduced live; it is covered by unit
  tests instead (`test/lifecycle-disposal.spec.ts`).
