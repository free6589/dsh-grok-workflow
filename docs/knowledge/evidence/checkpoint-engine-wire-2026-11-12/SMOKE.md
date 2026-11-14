# Engine wiring for checkpointing — smoke notes

Date: 2026-11-12 (+08) · Base commit: `84e6894` (`main`, == `origin/main` at start of work)
Owner of this task: engine wiring + disposal only (`src/checkpoint/wiring.ts`, the wiring
edits in `src/run.ts`, `test/checkpoint-wiring.spec.ts`,
`test/checkpoint-engine-wire.spec.ts`, the `vitest.config.ts` env line, this note).
The schema and the writer belong to sibling tasks; `src/resume/*` is a different artifact
(a `grok-workflow.resume-checkpoint`) and is not touched here.

Status vocabulary: **CONFIRMED** = a command in this note produced it · **NOT_RUN** = not executed.

---

## 1. What was wired

| Obligation | Where | How it is proven |
|---|---|---|
| Periodic checkpoint while a run is live | `createCheckpointRecorder().adopt()` arms one `unref()`ed timer; `tick()` writes `status: running` | `witness-periodic/checkpoint-run-7.json` (CONFIRMED) |
| Terminal checkpoint | `finish()` writes the report-derived tasks/agents/evidence + final status, then releases timer and listeners | `checkpoint-01d56234-…json` (completed), `checkpoint-1533330d-…json` (failed) (CONFIRMED) |
| Unload checkpoint | `disposeActiveState` calls `unloadCheckpointRecorders(state, cause)` **before** the abort | `witness-unload/checkpoint-run-11.json` (CONFIRMED) |
| Host-side watchdog evidence | `watchdog.deadlineHit / cancelled / deadlineMs / cancelReason` from the recorder's own clock, the engine's `workflow/end` stop reason, and the caller's `finish({stopReason, unloaded})` | both witness files (CONFIRMED) |
| Four roles only, no new agent | agent rows are mapped from the report's route trail and every row is checked against `HOST_ROLES`; a planted `auditor` row is dropped by test | `test/checkpoint-wiring.spec.ts` "four roles, host-side only" (CONFIRMED) |
| No extra model calls | wiring never calls `agent()`; the real-engine smoke asserts the child count exactly (`children.length == 2` for a one-task run) | `test/checkpoint-engine-wire.spec.ts` (CONFIRMED) |
| Inert when unmounted / idle | no run adopted ⇒ no timer, no file; `dispose()` releases every listener and stops writing | `test/checkpoint-wiring.spec.ts` "inert when there is nothing to describe" (CONFIRMED) |

## 2. Command that produced this evidence

```bash
GROK_WORKFLOW_CHECKPOINT_DIR="$PWD/docs/knowledge/evidence/checkpoint-engine-wire-2026-11-12/checkpoints" \
  npx vitest run test/checkpoint-wiring.spec.ts test/checkpoint-engine-wire.spec.ts
# -> Test Files 2 passed (2) · Tests 22 passed (22)
```

Raw output: `smoke-output.txt` (this directory).

The two engine tests run the **real** `@deepseek-ai/dsh-workflow-ptc` engine, its script
VM and its `workflow/*` events (`test/engine-harness.ts`); only the subagent provider is
scripted, so no model is called anywhere in this lane.

## 3. Checkpoint files (CONFIRMED, in `checkpoints/`)

| File | run.status | plan.source | tasks | agents | stages | watchdog |
|---|---|---|---|---|---|---|
| `checkpoint-01d56234-501f-4a19-8826-09809bc2d11f.json` | `completed` | `caller` | `a:verified` | `worker:ok, verifier:ok` | `plan, execute, synthesize` (all completed) | `cancelled:false, deadlineHit:false, deadlineMs:60000` |
| `checkpoint-1533330d-97d0-425f-9a03-d6ce49c84d01.json` | `failed` | `caller` | `a:failed` | `worker:ok, verifier:ok` | `plan, execute, synthesize` (all completed) | same |
| `witness-periodic/checkpoint-run-7.json` | `running` | `unavailable` | — | — | `plan:completed, execute:running` | same |
| `witness-unload/checkpoint-run-11.json` | `cancelled` | `unavailable` | — | — | — | `cancelled:true, cancelReason:"the plugin was unloaded while the run was in flight"` |

Each file carries a `sha256` integrity record (1376 / 1299 / 805 / 780 bytes); every read
in the smoke goes through `readCheckpoint`, which re-verifies the checksum and refuses a
file whose bytes no longer match.

Reading notes, so nobody over-reads a field:

- `verifier:ok` in the failed run is the **call** outcome (the child answered). The task
  row says `a:failed` because the verifier's verdict was `fail`. A route row is never a
  quality verdict — the same distinction the panel uses (`src/naming.ts` `callStateText`).
- `plan.source: unavailable` and empty `tasks`/`agents` in the two witness files are the
  honest pre-report state: the planner runs inside the script, so before a report exists
  the host has nothing to copy. Wiring refuses to echo the objective back as a "plan".
- `minContext.source` is `auto` in the engine runs (no carry-over was supplied) and the
  digest is compiled by the schema from objective/tasks/evidence.

## 4. Resume decision (CONFIRMED)

The engine has no journaling and no resume (`dsh-workflow/README.md`, limitations), so
`resumeDecision()` answers a **host** question over a finished checkpoint file — should a
new run be started from this file, and which tasks would it re-drive. It never claims
engine-state restoration. The smoke printed, verbatim:

```
[smoke] status=completed file=…/checkpoint-01d56234-501f-4a19-8826-09809bc2d11f.json resume=none reason=the run already completed, so re-driving it would redo verified work
[smoke] status=failed    file=…/checkpoint-1533330d-97d0-425f-9a03-d6ce49c84d01.json resume=resume unfinished=a
```

For the unload witness the decision is `none` with reason *"the checkpoint carries no task
rows (it was taken before the run produced a report), so a new run has nothing named to
re-drive"* — asserted in `test/checkpoint-wiring.spec.ts`, and the honest answer for a run
cut before any report existed.

Decision table pinned by tests: `completed` → `none`; `running` younger than
`CHECKPOINT_WIRING_LIMITS.resumeStaleAfterMs` (120 s) → `wait` (the writer may still be
alive); stale `running`, `cancelled`, `partial` or `failed` with unfinished task rows →
`resume` naming those ids; no task rows → `none`.

## 5. Boundaries and known limits (do not read these as passes)

- **Deadline above the schema ceiling is omitted, not clamped.** `CHECKPOINT_LIMITS.countCeiling`
  is 1,000,000, i.e. ~16m40s of milliseconds, while the plugin's deadline defaults to one
  hour (`DEFAULT_TIMEOUT_MS = 3_600_000` in `src/config.ts`) and goes up to a week
  (`HARD_LIMITS.timeoutMs = 604_800_000`). A run whose
  `timeoutMs` is above the ceiling therefore records **no** `limits.timeoutMs`,
  `time.deadlineAtMs` or `watchdog.deadlineHit`. This is a schema↔config boundary, fixed
  here by omission (a clamped number would describe a bound the run never had) — it is a
  sibling/schema decision whether the ceiling should grow. The default configuration hits
  this: `resolveConfig({})` → 3,600,000 ms → **no recorded `timeoutMs`**, asserted in
  `test/checkpoint-wiring.spec.ts` ("writes one cancelled checkpoint when the plugin is
  unloaded mid-run").
- **`git` is only written when a caller supplies a provider.** Wiring will not run
  `git rev-parse` on every tick, so an absent provider leaves the schema default
  (`dirty:false`) in the file. Nothing consumes that field yet; do not read it as an
  observation.
- **Periodic interval default is 30 s** (`CHECKPOINT_WIRING_LIMITS.intervalMs`), clamped to
  1 s…300 s. The engine smoke runs settle in ~100 ms, so no timer tick fires there: the
  periodic artifact above is produced by the wiring spec, which drives the same `tick()`
  the timer calls. A real long run writes one file per interval, atomically replacing the
  previous one.
- **First-phase race is bounded but real.** The recorder subscribes before `start()` and
  attributes every event by `info.id`, so a `phase` event that arrives before `adopt()`
  is kept for the right run; an event whose id never becomes the adopted run is dropped
  after `rememberedRuns` (4). NOT_RUN: a live measurement of how often the plan phase
  fires before the engine hands back the run object.
- **Unload write is bounded to 3 s** (`unloadWriteTimeoutMs`). An abandoned write is
  logged and dropped; it retries nothing and leaves no timer.
- **No periodic checkpoint survives a hard process crash** unless the interval elapsed —
  the file is one-per-run, replaced atomically, so the worst case is losing at most one
  interval of progress.
- **Docs/memory not updated here**: `CHANGELOG.md` (both languages), `STATE.md`,
  `HANDOFF.md`, `VALIDATION.md` were already dirty in the shared tree from sibling work, so
  this task did not touch them. The orchestrator owns folding the two user-visible facts in:
  (a) every run now writes one checkpoint file under `$DSH_HOME/checkpoints/grok-workflow`
  (override: `GROK_WORKFLOW_CHECKPOINT_DIR`), (b) an unload writes one `cancelled`
  checkpoint per live run before cancelling it.
- **`lib/` was not rebuilt** by this task: `npm run build` would also re-emit `lib/` for
  `src/script.ts` and `src/config.ts`, which are mid-edit by sibling tasks. Verification
  used `tsc --noEmit`, `oxlint` and `vitest` over `src/`; the release step must rebuild
  `lib/` once the sibling changes land.

---

## 6. Independent re-verification (second pass, 2026-11-12 03:29–03:33 +08)

The first pass wrote this note and the files above. This pass re-ran everything from a
clean shell instead of trusting the earlier transcript. Nothing in the tree was changed
to make it pass; no test was added, skipped or edited.

| Check | Command | Result |
|---|---|---|
| Types | `npx tsc -p tsconfig.json --noEmit` | exit 0, no diagnostics (CONFIRMED) |
| Lint | `npx oxlint src/checkpoint src/resume test/checkpoint-wiring.spec.ts test/checkpoint-engine-wire.spec.ts src/run.ts` | 0 errors, 1 warning (CONFIRMED) |
| Wiring + engine smoke | `GROK_WORKFLOW_CHECKPOINT_DIR=/tmp/ckpt-verify-<pid> npx vitest run test/checkpoint-wiring.spec.ts test/checkpoint-engine-wire.spec.ts` | 2 files, 22 tests passed (CONFIRMED) |
| Whole suite | `npx vitest run` | 42 files, 748 tests passed, 40.0 s (CONFIRMED) |
| Integrity records | recomputed sha256 over the canonical payload of each evidence file | checksums match `integrity.checksum`; `integrity.bytes` is the payload length, so the on-disk file is larger by the size of the integrity record itself (CONFIRMED) |
| Reproducibility | the re-run used a throwaway directory | it produced fresh run ids with the same content: `completed` → `resume=none`, `failed` → `resume=resume unfinished=a`, plus the same two witness files (CONFIRMED) |

The single lint warning is `eslint(no-unused-vars): Type 'RoleName' is imported but never
used` at `src/run.ts:31`. It is **pre-existing**, not introduced here: `git show
HEAD:src/run.ts | grep -n RoleName` returns only that same import line, so the type was
already unused on `84e6894`. It is left alone deliberately — removing it would edit an
import line in a file two sibling tasks are also editing, for no functional gain.

One workspace observation, so it is not mistaken for this task's output: `lib/src/` and
`lib/test/` appeared at `03:29:32` as **untracked** build artifacts while this pass was
running. They were not produced here — `npx tsc -p tsconfig.json --noEmit` was re-run and
touched nothing under `lib/` (0 files newer than the run). A concurrent build in the
shared tree was interrupted partway (`lib/src/checkpoint/` holds `schema.*` and
`writer.*` but no `wiring.*`), so those two directories should be deleted before any
commit. Committed `lib/` is still the 2026-11-08 v0.7.0 emit and remains stale w.r.t.
`src/`, exactly as §5 says.

Scope note: this pass only read and re-ran. The only file it wrote is this section.
