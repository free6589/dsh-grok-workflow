# HEARTBEATS.md — two heartbeats, one repository

The plugin drives two independent heartbeats, and both are now the same code (`src/loop.ts`)
instantiated twice (`src/index.ts:297`, `src/index.ts:313`):

- **Loop** — auto-continue. Resumes this session's unfinished work.
- **Iterate** — self-iteration. Delivers the repository's own RSI prompt (`iterateTemplate`,
  `src/config.ts:166`) so a turn runs one bounded self-iteration round.

They deliver the same *shape* of message — a Schedule task whose prompt lands in a session as
`source.kind === 'schedule'` — so nothing but identity keeps them apart: a stored task name, a
prompt marker, a route, a storage predicate, and one dispatcher branch. This file is the audit
of that identity, the routing between them, and the schedule lifecycle around both. It is
written to be checked against the tree, not trusted.

Vocabulary: `CONFIRMED` = read in source or observed in a command here; `HYPOTHESIS` =
plausible, not verified; `NOT_RUN` = not executed.

## 1. The two identities

| | Loop heartbeat | Iterate heartbeat |
| --- | --- | --- |
| owner | this plugin, service instance 1 — `src/index.ts:297` | this plugin, service instance 2 — `src/index.ts:313` |
| stored task name | `Loop heartbeat` — `src/loop.ts:68` | `RSI heartbeat` — `src/loop.ts:126` |
| prompt identity | leading marker `[grok-workflow loop]` — `src/loop.ts:76` | no marker: the editable template `iterateTemplate` — `src/config.ts:166`, persisted per profile |
| route | `POST /grok-workflow/loop` — `src/loop.ts:115`, registered `src/loop-surface.ts:141` | `POST /grok-workflow/iterate` — `src/loop.ts:129`, registered `src/loop-surface.ts:148` |
| route body | `{ action, sessionId, intervalMinutes?, prompt? }` — `dispatchLoopAction` | `{ action, sessionId }` only — `dispatchIterateAction`, `src/loop-surface.ts:352` |
| tool | `grok_loop` (status/close; `open` refused) — `src/loop.ts:132`, `src/loop-surface.ts:178` | none: the switch is the only way to arm it |
| storage predicate | `isLoopSlot` — `src/loop.ts:338`; per-instance `slotOf` — `src/loop.ts:457` | the same `slotOf`, bound to `RSI heartbeat` |
| routing predicate | `isLoopHeartbeat` — `src/loop.ts:95`, read by the gate at `src/gate.ts:532` | none, deliberately: its deliveries are ordinary schedule messages |
| archive / unload sweep | archive: `src/loop-surface.ts:106`; unload: `src/loop-surface.ts:115` | none: the plugin neither archives nor unloads the RSI row (`src/loop-surface.ts:75`); its own `forgetSession` is identity-correct if a caller ever uses it (F6) |

The distinction the code makes, and why it is more than one predicate:

- **Routing identity is the prompt marker.** A `pre-step` listener sees message text and
  `source.kind`, never the Schedule row, so the marker plus `source.kind === 'schedule'` is the
  only honest proof that a delivery is this plugin's *continuation*. `isLoopHeartbeat` accepts
  the stored prompt verbatim and DSH's delivery framing (`reminder_prompt_json: "<stored
  prompt>"`, measured live in RSI round 17).
- **Storage identity is the reserved task name.** A prompt is editable text — DSH's own
  `schedule_edit` accepts `prompt` — so a row whose marker was edited away is still the row this
  plugin opened. `isLoopSlot` matches name + `rrule` + target, which is what close, archive and
  unload act on.
- **The Iterate beat deliberately has no routing marker.** Its prompt is the operator-editable
  template, so editing that text can never change how the gate routes a delivery. It reaches the
  gate as a plain `non-user-source` pass and the turn does what the template says.

## 2. Dispatcher: one delivery, one handler

`classifyPreStep` (`src/gate.ts:484`) looks for a heartbeat **before** the user-source filter
(`src/gate.ts:496`) and, when it finds one, calls `classifyHeartbeat` (`src/gate.ts:547`):

| delivery | `source.kind` | marker | branch | round charged |
| --- | --- | --- | --- | --- |
| Loop heartbeat | `schedule` | `[grok-workflow loop]` | `loop-continuation` (or `loop-stop` when a brake trips) | one, via `loop.admit` |
| Iterate heartbeat | `schedule` | none | `non-user-source` pass | none — `loop.review`/`admit` are never called |
| user text quoting the marker | `user` | any | ordinary admission (`admit`) | none |

The branches are mutually exclusive by construction: `isHeartbeatMessage` (`src/gate.ts:532`)
requires both the schedule source *and* the Loop marker, so an Iterate delivery cannot reach
`classifyHeartbeat`, and a user message that pastes the marker cannot either. `CONFIRMED` by
`test/heartbeat-identity.spec.ts > the dispatcher routes a delivery to exactly one handler`:
three cases, one per row of the table, with the brake port as a spy — the Iterate delivery is
asserted never to call `review`/`admit`/`stop`, including when `review` would return `stop`
(the case that would delete the Loop row), and the pasted-marker user message is asserted to be
`admit`ed, not routed.

## 3. Lifecycle: one beat per identity, per session

Each service instance enforces one live row *of its own slot* per session, on every path through
`open()` (`src/loop.ts:501`):

- **refresh** — an active row is updated in place, and every other row of the same slot is deleted
  (`dropDuplicates`, `src/loop.ts:597`);
- **resume** — a paused row is resumed, then the same duplicate cleanup runs;
- **replace** — stale rows of the slot are deleted before a new one is minted, and if a refused
  delete leaves a *live* row behind, that row is refreshed instead of a second one being created;
- **close / archive / unload** — delete every row of the caller's slot and report what is actually
  gone (`deleteSessionHeartbeats`, `src/loop.ts:752`, now parameterized by the caller's slot).

Rows the instance does not own are invisible to all four paths: the slot predicate is the
instance's own `slotOf` (`src/loop.ts:457`), so a `Loop heartbeat` row and an `RSI heartbeat` row
in the same session are two separate slots that neither instance can adopt, charge or delete.
`CONFIRMED` by `test/heartbeat-identity.spec.ts` (both directions), `test/loop-surface.spec.ts >
two switches, two routes` (route layer), and `test/loop-runtime-wiring.spec.ts` (a real Loader
composition with the built bundle: unload deletes the `Loop heartbeat` row and the `RSI
heartbeat` row survives).

The Iterate beat outlives the plugin on unload by design (`src/loop-surface.ts:75`): its
deliveries are ordinary schedule messages, so a surviving row cannot route into a plugin handler
that no longer exists. The plugin also does not sweep the RSI row when a session is archived — the
row is the operator's own beat, and the switch (or Automation tasks) is what disarms it. What the
plugin does guarantee is that the sweep is *identity-correct* if it runs: `forgetSession` deletes
only its own instance's slot (F6), so an iterate sweep can never take the loop's row.

## 4. Findings

**F1 — duplicate rows could double the beat (fixed).** `open()` refreshed an active row and left an
`ended` duplicate beside it, and a refused delete of a stale row was followed by a create anyway:
two rows for one session, two deliveries per interval. `dropDuplicates` and the survivor refresh
close both paths. Regression tests: the four cases added to `test/loop.spec.ts > the switch state
machine`.

**F2 — an edited prompt orphaned a live beat (fixed).** A row whose prompt no longer carried the
marker was neither refreshed nor closable: its deliveries passed the gate as ordinary non-user
messages (no brake, no accounting) and `close` reported "off" over a live row. `isLoopSlot` now
owns cleanup, and `open` rewrites the marker onto the row it reclaims.

**F3 — one stop switch stops both (deliberate, unchanged).** The Loop brake reads `.rsi/STOP`
(`src/loop-brakes.ts:52`), which is also the RSI pause switch in `.rsi/PROTOCOL.md`. Writing that
one file therefore stops *both* heartbeats (`loop/stop-file`, `src/loop-brakes.ts:122`). The
direction is stop-only — it can never route one heartbeat into the other's handler — and the
marker is the switch this deployment's operator already knows, so it was left alone;
`GROK_WORKFLOW_STOP_FILE` moves it for a workspace that wants them separate.

**F4 — the fail-streak brake counts any turn in the session (known, benign direction).** A round's
outcome is read as "did the session gain an assistant message" (`src/loop-brakes.ts`), so an
Iterate round in the same session makes the Loop look healthier and can only *delay*
`loop/fail-streak` — never trip it. Recorded, not changed.

**F5 — the name `Loop heartbeat` is reserved.** Because cleanup matches the name (F2's fix), an
Automation task deliberately named `Loop heartbeat` in a session this plugin drives would be
reclaimed as the plugin's slot. Mitigation: the Iterate beat uses `RSI heartbeat`, and both names
are code-owned constants.

**F6 — the archive sweep used the loop's slot for every instance (fixed 2026-11-20).**
`deleteSessionHeartbeats` filtered with the exported `isLoopSlot`, which is hard-coded to
`Loop heartbeat`, and `createLoopService`'s `forgetSession` called it without a slot. Once a second
service instance existed, an *iterate* archive sweep deleted the **loop's** row and left its own:
one heartbeat deleting the other's task, and a stale RSI row surviving the archive it should not
have survived. Reachability stated honestly: the plugin wires only the loop instance to
`workspace/session-stop`/`session-archived` (`src/loop-surface.ts:106`), so today this path is
unreachable from the composition — but `forgetSession` is the method the archive path is documented
to use and both instances expose it, so any future wiring (or any caller) would delete the wrong
heartbeat. Reproduced before the fix (`iterate.forgetSession` on a schedule holding both rows left
`RSI heartbeat` and deleted `Loop heartbeat`). The function now takes the caller's slot
predicate (default: the loop slot, so the brake keeps its meaning), and `forgetSession` passes
`slotOf`. Regression test: `test/heartbeat-identity.spec.ts > the Iterate service never adopts,
charges or deletes the Loop task > sweeps its own row only on archive and on unload`. Negative
control: reverting only that argument makes the test fail (1 failed / 14 passed).

**HYPOTHESIS — concurrent deliveries do not stack.** `.rsi/HEARTBEAT.md` step 4 states that a
delivery arriving while the previous one is queued or running is refused or merged, and that after
a Host restart only the latest missed occurrence is delivered. That is DSH Schedule behaviour, not
this plugin's, and was not measured here.

## 5. Verification

| what | how | result |
| --- | --- | --- |
| identity distinctness (names, markers, routes, tool) | `npx vitest run test/heartbeat-identity.spec.ts` | pass (16 tests) |
| dispatcher: Iterate → `non-user-source`, Loop → `loop-continuation`/`loop-stop`, pasted marker → `admit` | same file, brake-port spies | pass (3 tests) |
| ownership in both directions (loop↔iterate), incl. the F6 archive sweep and duplicate cleanup per slot | same file, two service instances | pass (5 + 2 tests) |
| route layer: two exact routes, each bound to its own service | `npx vitest run test/loop-surface.spec.ts` | pass (20 tests) |
| client switches: distinct `routePath`, each POSTs to its own route | `npx vitest run test/client.spec.ts` | pass (94 tests) |
| lifecycle: duplicates, stale rows, reclaimed markers | `npx vitest run test/loop.spec.ts` | pass (35 tests) |
| unload with a real Loader leaves the RSI row stored | `npx vitest run test/loop-runtime-wiring.spec.ts` | pass (5 tests) |
| negative control 1 (F6): drop the slot argument | same identity file | 1 failed / 14 passed with the old signature, 16 passed after |
| negative control 2 (routes): bind the iterate route to the loop service | `test/loop-surface.spec.ts` | 2 failed / 18 passed with the cross-wiring, 20 passed after |
| whole gate | `TMPDIR=$PWD/.tmp npm run ci` (true exit code, no pipe) | exit 0 — typecheck, oxlint 0 errors, `verify:lib`, **67 files / 1219 tests PASS** |

`NOT_RUN`:

- A real scheduled delivery of either heartbeat. Arming a task is the operator's action
  (DECISIONS D-066), and no task was created, edited or deleted while writing this file.
- The live profile. `~/.dsh/storages/schedule.json` was read once, read-only, to establish what is
  actually armed; it held one unrelated task (a daily personal-assistant dispatch) and neither
  heartbeat. Nothing in it was written.
- What the Automation UI displays for a reclaimed row, and how the switch repaints when the stored
  prompt is edited outside the page.
