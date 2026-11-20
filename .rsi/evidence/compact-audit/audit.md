# `/compact` event-sequencing audit — step/start ↔ assistant/message pairing

Audit time: 2026-11-20 20:57–21:10 +0800. Read-only: no source, test, profile or session file
was modified; this document is the only write.

Status vocabulary follows `AGENTS.md`: CONFIRMED = directly observed in source, a command or a
journal; HYPOTHESIS = plausible, not verified; NOT_RUN = intentionally not executed.

Paths:

- repo (plugin, HEAD `366d169`) — `/home/fish/projects_mine/dsh-grok-workflow`
- DSH install — `/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@deepseek-ai/dsh`
  (abbreviated `<DSH>` below; every `file:line` is relative to `<DSH>/node_modules/@deepseek-ai/`)
- journals — `/home/fish/.dsh/sessions/--home-fish-projects_mine-dsh-grok-workflow--/`

## 0. Method

1. Static trace of the `/compact` chain in the installed DSH sources (`dsh-command-compact`,
   `dsh-compaction`, `dsh-compaction-basic`, `dsh-token-meter`, `dsh-agent-loop`, `dsh-session`).
2. Static trace of every plugin writer that can append an `assistant/message`, at HEAD and at the
   fix's parent (`5fb5da0^`), plus the lifecycle hook that positions each writer in time.
3. Independent replay of all 1270 workspace journals with the meter's own pairing rule
   (`measurement-projection.ts:44-82`), reproduced in a separate script — not reusing the plugin's
   or DSH's runtime.
4. Execution of the repo's harness `scripts/repro-compact.mjs` (real `/compact` handler, real
   compaction engine, real token meter, in-memory session, no model, no network) in both modes.

## 1. `/compact` end to end (CONFIRMED)

Ordered path, with the line that emits or reads each event-relevant fact:

```
user types /compact
  └─ command handler                       dsh-command-compact/src/index.ts:59-79
       ctx.compaction.compactNow(agent, signal, commandId)            :67
  └─ idle admission                        dsh-agent-loop/src/agent.ts:204-225
       rejects when phase !== 'idle'                                  :205   (no turn/start, no step/start)
  └─ measure BEFORE any range selection    dsh-compaction-basic/src/index.ts:418-422
       this.ctx.tokenMeter.measure(agent.session)                     :418-422
  └─ token meter replay                    dsh-token-meter/src/index.ts:151-196
       _sync() starts at consumedEvents = 0                           :232-243
       walks every event up to session.seq                            :245-261
       projection apply → advanceMeasurement                          measurement-projection.ts:90-99
       on a retained invalidSeq: re-runs advanceMeasurement to raise
       the ORIGINAL error at that seq                                 index.ts:253-257
  └─ the pairing rule                      measurement-projection.ts:44-82
       step/start with a step already open  → error                   :49-53
       step/end without its step/start      → error                   :54-60
       assistant/message outside its (turn,step) step → error         :61-66
  └─ compaction writes (only if measure passed)
       compaction/start                                              region.ts:210
       compaction/summary                                            region.ts:491
       user/message {surfaceOp: replace}  ← the surface rewrite      region.ts:506-509
       compaction/end                                                region.ts:237
  └─ outcome
       success text with shadowed count                              command handler :69-73
```

Where the step and message events in that journal come from, in a normal turn:

| event | emitter | line |
| --- | --- | --- |
| `turn/start` | agent loop | `dsh-agent-loop/src/agent.ts:342` |
| `agent/pre-step` waterfall (plugin gate runs here) | agent loop | `dsh-agent-loop/src/agent.ts:302-312` |
| `step/start` | agent loop, `step = phase.step + 1` | `dsh-agent-loop/src/agent.ts:352,367` |
| `assistant/message` (model) | agent loop, inside `step()` | `dsh-agent-loop/src/agent.ts:511,582` |
| `step/end` | agent loop, `finally` | `dsh-agent-loop/src/agent.ts:394` |
| `turn/end` | agent loop | `dsh-agent-loop/src/agent.ts:428` |

Three facts follow directly from those lines and drive the whole failure:

1. **Steps start at 1.** `const step = phase.step + 1` (`agent.ts:352`) — no agent loop path ever
   emits `step/start {step: 0}`.
2. **`agent/pre-step` runs before `step/start`** (`agent.ts:302-312` vs `:367`), so anything the
   plugin appends inside that hook is, by construction, outside an open step.
3. **The meter replays the entire journal from seq 0** (`index.ts:232-243`), not the compacted
   surface, and only *records* the failure until someone measures (`measurement-projection.ts:94-97`
   stores `invalidSeq`; `index.ts:253-257` re-raises). A single bad row therefore poisons every
   later `measure()` — including the one `compactNow()` performs before it can do anything useful.

## 2. Meter updates (CONFIRMED)

- Projection registration: `dsh-token-meter/src/index.ts:105`.
- Live catch-up on every committed event: `dsh-token-meter/src/index.ts:112-114`.
- Surface/pricing fold (not the pairing state): `dsh-token-meter/src/index.ts:274-293`.
- Pairing state is `MeasurementState.stepStart` (`measurement-projection.ts:23-32`), advanced only
  by `step/start` / `step/end` / `assistant/message` (`:44-82`).
- Compaction does **not** reset that state: no `compaction*` case exists in the projection
  (`measurement-projection.ts` has none), and the surface rewrite enters as an ordinary
  `user/message` with `surfaceOp: replace` (`region.ts:506-509`, consumed by
  `dsh-token-meter/src/surface-fold.ts:107-121`).

Measured consequence in the reference session: it was compacted once at seq 1966–1969
(`shadowedRange 8–1960`, 175 930 tokens). The bad row sits at seq 3553, *after* that compaction,
and the meter still stops on it — because the fold is linear over the whole log, not the surface.

## 3. Deviation introduced with `dsh-grok-workflow` enabled (CONFIRMED)

At the fix's parent `5fb5da0^` the plugin had three `assistant/message` writers, all placing the row
with `lastTurnOf(session)`, a scan that returns the highest numeric `turn` seen and, within it, the
highest `step` seen — neither of which is "the step that is open":

| writer | call site (pre-fix) | runs from | placement | measured shape |
| --- | --- | --- | --- | --- |
| instant receipt | `5fb5da0^:src/records.ts:669-691` (`lastTurnOf` at `:675`) | `agent/pre-step` (`src/gate.ts:1016` pre-fix) | before `step/start` | step that never opens |
| unload notice | `5fb5da0^:src/records.ts:735-757` (`:741`) | plugin disposer (`src/run.ts:306`) | any instant, incl. between `turn/start` and `step/start` | step never opened, or already closed |
| cancelled terminal | `5fb5da0^:src/gate.ts:1224-1240` | `agent/pre-step` returning `reject` | the `(turn, step)` the pre-step refused | step never opens |

`lastTurnOf` (`5fb5da0^:src/records.ts:694-712`):

```ts
let turn = 0
let step = 0
for (const event of events) {
  const data = ...data
  if (typeof data?.turn !== 'number') continue
  if (data.turn > turn) { turn = data.turn; step = 0 }          // :702-705
  if (data.turn === turn && typeof data.step === 'number' && data.step > step) step = data.step  // :706
}
return { turn, step }
```

Two distinct defects fall out of that scan:

- a `turn/start` with no step yet ⇒ `step` stays at its default `0` ⇒ a `(turn, 0)` pair that never
  exists (the loop numbers steps from 1);
- a turn whose last step already ended ⇒ `(turn, maxStep)` ⇒ a pair whose `step/end` is already
  behind it.

Neither is repaired on load: `dsh-session/src/repair.ts:89-96` only synthesises closers for an open
*tail* turn; mid-log rows are never rewritten.

### Corpus measurement (CONFIRMED)

Replayed all 1270 workspace journals (2 unreadable/skipped) with the rule from
`measurement-projection.ts:61-66`:

| result | count |
| --- | --- |
| sessions scanned | 1270 |
| sessions with any pairing violation | 10 |
| `grok-workflow/workflow-notice` rows | 4 |
| `grok-workflow/workflow-receipt` rows | 4 |
| model-attributed rows from the gate's cancelled terminal | 6 |
| other (`bifrost-completions/wb/cn:deepseek-v4.1-flash`) | 1 |
| total unpaired rows | 15 |
| `step/start` while another step is open | 0 |
| `step/end` without its matching `step/start` | 0 |
| `step/start` whose `step/end` never arrives | 10 sessions (9 trailing at the end of a live log, 1 closed by `turn/end` instead) — tolerated by the meter, and present independently of the plugin |

Per-session rows and timestamps (`seq`, UTC, source model):

```
session-fd3a59f0…  1599 2026-11-18T15:04:16Z  opencode-go/muse-spark-1.3-contributor
session-4629cabd…    30 2026-11-17T17:47:00Z  opencode-go/muse-spark-1.3-contributor
session-cee9fd32…    33 2026-11-17T17:15:02Z  opencode-go/muse-spark-1.3-contributor
                     48 2026-11-17T17:42:08Z  workflow-notice
session-3361cd6e…  2339 2026-11-06T00:46:42Z  workflow-receipt
session-eb3f5542…    11 2026-11-06T18:28:24Z  workflow-receipt
                     52 2026-11-07T01:02:27Z  workflow-receipt
                     68 2026-11-07T01:05:44Z  wb/cn:deepseek-v4.1-flash
session-c747e971…     9 2026-11-07T01:05:10Z  workflow-receipt
                     17 2026-11-07T02:11:00Z  workflow-notice
session-7fed81c2…   314 2026-11-11T18:38:55Z  opencode-go/muse-spark-1.3-contributor
session-dc00ce11…   216 2026-11-18T23:32:32Z  opencode-go/muse-spark-1.3-contributor
session-3a683cb6…  3553 2026-11-19T23:39:35Z  workflow-notice
                   5424 2026-11-20T04:52:09Z  workflow-notice
session-042dfe19…    33 2026-11-19T23:36:52Z  opencode-go/muse-spark-1.3-contributor
```

Every row predates the fix commit `5fb5da0` (2026-11-20T06:34:15Z); no row postdates it. The
model-attributed rows are the gate's cancelled terminal, not model output: in
`session-dc00ce11…` turn 2 has `turn/start` (seq 189) and `turn/end` (217) and **zero** `step/*`
events, yet the row claims `step: 1` — the refused pre-step proposal, written at
`5fb5da0^:src/gate.ts:1226-1237` with `payload.step`.

Note on the reference session: `step/start`/`step/end` are 918/918, `seq` is strictly increasing
0…7452, and no `(turn, step)` pair opens twice — so the deviation is **not** a missing or
duplicated *step* event. Across the whole corpus the only step-boundary irregularity is an
unclosed final step in incomplete logs, which the meter accepts. The defect is exclusively
out-of-order `assistant/message` events: rows appended between a `turn/start` and the first
`step/start`, or after a `turn/end`. The plugin's 41 `plugin:grok-workflow/delivery`, 12
`…/routing`, 8 `…/mode` and 2 `…/dispose` records in that session are `ignorable` records
(`src/records.ts:303-310`, `appendPluginRecord`) and are invisible to the meter.

## 4. Why seq 3553 specifically (CONFIRMED)

Journal window (`session-3a683cb6-1eaa-4b33-9eb9-57e1ef0b955b`, 7453 events, seq 0–7452):

```
3541 turn/end        turn=24
3543 turn/start      turn=25              ← turn 25 opens
3545 plugin:grok-workflow/delivery turn=25
3546 user/message
3547 tool-workflow/run-start
3549 tool-workflow/agent-start
3550 tool-workflow/agent-end
3551 subagent/catalog
3552 tool-workflow/agent-start
3553 assistant/message turn=25 step=0  src=grok-workflow/workflow-notice   ← no step/start(25,0) exists
3554 plugin:grok-workflow/dispose {at: 2026-11-19T23:39:35.711Z, trigger: unknown, uptime 28 785 367 ms}
3557 step/start      turn=25 step=1      ← the turn's real first step, four events later
```

The chain, each step backed by a line:

1. A live plugin-manager install disposed the running plugin instance:
   `~/.dsh/profiles/web/.plugin-manager/logs/operation-sjpPCh/pnpm.log` (dir mtime
   `2026-11-19 23:39:35`) — `+ dsh-grok-workflow github:free6589/dsh-grok-workflow` — and the
   dispose record at seq 3554 carries the cordis `dispose` stack
   (`…/profiles/web/node_modules/dsh-grok-workflow/lib/index.js:132:38`) at
   `2026-11-19T23:39:35.711Z`, the same second.
2. The disposer found one interrupted run for this session (`run.ts:277-285`) and wrote one
   interruption notice per affected session (`run.ts:300-309`, `appendUnloadNotice` at `:306`).
3. `appendUnloadNotice` (`5fb5da0^:src/records.ts:735-757`) took its `(turn, step)` from
   `lastTurnOf` (`:741`). At that instant the log held `turn/start {turn: 25}` (`:3543`) and no
   event with `turn 25` carrying a numeric `step` — `step/start (25,1)` had not happened yet. So
   the scan produced `turn = 25, step = 0` (`:702-705`, step left at its default) and appended
   `assistant/message {turn: 25, step: 0}` (`:743-751`).
4. Step 0 can never open: the loop computes `step = phase.step + 1` (`dsh-agent-loop/src/agent.ts:352`).
   The turn's first real step is `(25,1)` at seq 3557, and by then the row is already committed.
5. The meter's projection hits the row in seq order, finds `stepStart === null`
   (`measurement-projection.ts:61-66`), and stores `invalidSeq = 3553`
   (`measurement-projection.ts:94-97`). From then on `measure()` re-raises
   `token meter: assistant/message at seq 3553 has no matching step/start event`
   (`index.ts:253-257`) — so every `/compact` on this session reports 3553, never the later 5424.
6. `compactNow()` measures before selecting a range (`dsh-compaction-basic/src/index.ts:418-422`), so
   `/compact` dies at that line. Because `return agent.runMaintenance(...)` at `:414` is not
   `await`ed, the rejection escapes the `try` at `:413` and is **not** converted to
   `ManualCompactionError('busy')` at `:452-458`; the handler rethrows any non-`ManualCompactionError`
   (`dsh-command-compact/src/index.ts:74-78`) and the user sees the raw meter sentence. Automatic
   compaction fails the same way, silently: `agent/pre-step` only warns and continues
   (`dsh-compaction-basic/src/index.ts:157-175`).

Same defect, second shape, seq 5424 in the same session:

```
5413 step/start  turn=38 step=1
5418 assistant/message turn=38 step=1 (model)
5419 step/end    turn=38 step=1
5420 turn/end    turn=38
5424 assistant/message turn=38 step=1 src=grok-workflow/workflow-notice   ← step already closed
```

Here `lastTurnOf` returned the turn's highest step (1), which had already ended — the "already
closed" half of the same scan.

## 5. State at HEAD (CONFIRMED)

- One switch point replaced the three writers: `openStepOf` (`src/records.ts:694-735`) reads the
  step that is actually open, and `appendAssistantInStep` (`src/records.ts:743-791`) refuses to
  write otherwise (`:771-775`), falling back to a durable terminal record
  (`src/records.ts:806-819`).
- Receipt: guarded at `src/gate.ts:1034` (skipped, together with the model call that would compose
  it, when no step is open), written at `:1048`.
- Unload notice: `src/records.ts:873-890` — `appendAssistantInStep` at `:878-884`, terminal record
  at `:889`.
- Cancelled terminal: `src/gate.ts:1250-1260`.
- Harness (this checkout, `lib/` at HEAD): `node scripts/repro-compact.mjs` → writer `refused`,
  `measure ok` (12 tokens, 1 node), `compactNow ok`, `/compact` `{"kind":"success","text":"No
  compactable history yet."}` — exit 0. With `--keep-orphan` (the pre-fix shape forced):
  `measure` fails with `assistant/message at seq 2 has no matching step/start event`,
  `compactNow` fails, `/compact` `{"kind":"threw", …}` — exit 1. This isolates the cause to the
  unpaired row, not to `/compact`, the compaction engine or the runtime.
- Installed bundle in `~/.dsh/profiles/web` is `0.12.13` and its `lib/records.js` contains
  `openStepOf` (3 occurrences), i.e. the on-disk bundle carries the guard.

Residual risks (HYPOTHESIS unless stated):

- Sessions written before the fix keep their unpaired row permanently; nothing repairs it
  (`dsh-session/src/repair.ts:89-96` closes only open *tail* turns). `/compact` will keep failing
  on those 10 sessions until the row is neutralised.
- The live host process started 2026-11-17 (`.rsi/evidence/runtime-audit-2026-11-20.md` §4); the
  module graph it holds was not observed here. Which build the *running* instance executes is
  therefore unverified — only the on-disk bundle is CONFIRMED at 0.12.13.
- The dispose path is still a plain "write into the session from outside the agent loop". At HEAD
  it is safe by refusal, not by construction: any future writer that appends `assistant/message`
  from `agent/pre-step`, a disposer, or a timer reintroduces the same failure.

## 6. Reproduction

```bash
cd /home/fish/projects_mine/dsh-grok-workflow
node scripts/repro-compact.mjs               # exit 0, /compact success
node scripts/repro-compact.mjs --keep-orphan # exit 1, meter error reaches /compact

# journal evidence (read-only)
S=~/.dsh/sessions/--home-fish-projects_mine-dsh-grok-workflow--/session-3a683cb6-1eaa-4b33-9eb9-57e1ef0b955b/session.v4.jsonl.zstd
zstd -dc "$S" | grep -n '"seq":3553,\|"seq":3557,'

# corpus replay: 1270 journals, pairing rule re-implemented from measurement-projection.ts:61-66
# (script kept out of the repo; it reads user session data)
```

## 7. Status summary

| claim | status |
| --- | --- |
| `/compact` fails because `compactNow()` measures first and the meter rejects an unpaired row | CONFIRMED (source + harness) |
| the meter's rule is exactly `assistant/message` inside its own `(turn,step)` step | CONFIRMED (`measurement-projection.ts:61-66`) |
| the fold is linear over the whole journal and does not reset at compaction | CONFIRMED (source; session compacted at 1966 yet fails at 3553) |
| seq 3553 is a pre-fix `workflow-notice` written at `(25,0)` during a plugin-manager dispose, four events before `step/start(25,1)` | CONFIRMED (journal + `5fb5da0^:src/records.ts:735-757` + operation log) |
| no missing/duplicated step events; the only defects are out-of-order assistant rows | CONFIRMED (918/918, seq monotonic, no duplicate pairs) |
| 10 sessions / 15 rows affected, all predating the fix | CONFIRMED (independent scan) |
| the running host's module graph carries the guard | NOT_RUN — not observable from this session |
