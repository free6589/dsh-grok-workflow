# Session channel (L2, 通道侧) — evidence, 2026-11-22

Scope: `src/channel.ts` (new), `src/gate.ts` (channel admission + per-round channel
lifetime + no-loss carry), `src/run.ts` (`steeringToken` passthrough),
`src/types.ts` (`GrokWorkflowConfig.replan?`), `test/channel.spec.ts` (new).

Evidence files in this directory were produced by the commands below; nothing here is
hand-written output.

| file | command | result |
| --- | --- | --- |
| `channel-tests.txt` | `npx vitest run test/channel.spec.ts` | 41 tests PASS |
| `gate-suites.txt` | `npx vitest run test/gate.spec.ts test/grok-on-ingress.spec.ts test/phase1-dialogue.spec.ts test/triage-recall.spec.ts test/composition.spec.ts` | 5 files / 128 tests PASS |
| `classification-probe.txt` | `node --experimental-strip-types -e "import('./lib/channel.js')…"` over 12 messages | stop only for bare stop forms; questions and task descriptions forward |

What the tests pin, by acceptance check:

- **A1 immediate ack** — `test/channel.spec.ts` "answers the receipt while the run is still
  live": the decision is raced against a 2 s timer while the fake engine's run is never
  settled, so an implementation that awaited the run fails the test instead of hiding in a
  timing assumption.
- **A2 never awaits the run** — same test: `agent.whenIdle` is never called and the run's
  promise is still pending when the decision returns.
- **A3 forwarded with context** — the intent pulled from `steeringForSession()` contains the
  user's words *and* `[channel] conversation before it` with the seeded transcript, and a
  second `take()` is empty (consumed exactly once).
- **A4 no loss when the run ends first** — a demand that was never pulled opens a second
  engine start whose objective carries the demand, the previous objective and "do not redo it".
- **A5 in-flight work is not cancelled** — the live run's `cancel` is never called by a
  message that is not a bare stop; `startCalls` stays at 1.

Not covered here (honest boundary): a real browser session where the user types mid-run and
watches the progress panel update; that is a GUI gesture and is `NOT_RUN` in this lane. The
full `npm run ci` is also `NOT_RUN` here (the lead runs it across lanes).
