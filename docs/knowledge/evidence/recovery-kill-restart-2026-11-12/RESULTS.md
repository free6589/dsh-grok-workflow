# Recovery proof — kill/restart, tamper, version, interrupted, incomplete

Date: 2026-11-12 (03:32–03:37 +08)
Host: local Linux workspace, `node v26.8.1`, `npm 11.19.0`, `vitest 4.1.12 linux-x64`
Repo: `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`, HEAD `84e6894`
(working tree dirty from parallel work; nothing in `src/`, `lib/`, `package.json` was
touched by this round)

Everything below is a command that was actually executed, with its real result.

## What was added

| Path | What it is |
| --- | --- |
| `test/fixtures/recovery/worker.mjs` | Fixture: one stand-in "workflow run" that can be SIGKILLed. Journals to an fsynced NDJSON ledger, writes evidence files, commits a host-sealed resume document durably. |
| `test/recovery-kill-restart.spec.ts` | The kill/restart proof: real `SIGKILL`, restart from disk, exactly-once completion, preserved evidence. |
| `test/recovery-artifacts.spec.ts` | The recovery contract on disk: round-trip, tamper, foreign version, interrupted, evidence-incomplete, empty journal, and the run checkpoint's read-back/refusal. |

No production file, no `package.json`, and no `lib/` artifact was modified. The new
specs are picked up by `npm test` automatically (`vitest.config.ts` includes
`test/**/*.spec.ts`); the hand-maintained `test:unit` list in `package.json` was left
alone, as in the other checkpoint/resume specs.

## Determinism and the boundary that is faked

- Real: two real OS processes, real `SIGKILL`, real files (fsync + rename), and the
  real recovery contract — the resume document is sealed by
  `buildResumeCheckpoint`/`canonicalJson` and read back through
  `validateResumeCheckpoint` → `planRestore` (`src/resume/`), the run checkpoint
  through `writeCheckpoint`/`readCheckpoint` (`src/checkpoint/`).
- Faked: the work itself (a task is "write this evidence file"). No model, no network,
  no DSH engine, no clock: every timestamp is a fixed constant
  (`AT = 2026-11-12T03:00:00.000Z`), and the host drives the worker through control
  files instead of sleeps, so the kill point is decided, not timed.
- The only thing the fixture worker does not compute itself is the document digest:
  the host seals the bytes with the real module and the worker only performs the
  durable commit, so that the process that dies is the process that wrote the file.

## Commands and results

```sh
# 1. the two new specs, on their own
npx vitest run test/recovery-kill-restart.spec.ts
#   -> Test Files 1 passed (1) / Tests 3 passed (3)

npx vitest run test/recovery-artifacts.spec.ts
#   -> Test Files 1 passed (1) / Tests 9 passed (9)

# 2. determinism: the same pair three times in a row
for i in 1 2 3; do npx vitest run test/recovery-artifacts.spec.ts test/recovery-kill-restart.spec.ts; done
#   -> Tests 12 passed (12) / 12 passed (12) / 12 passed (12); no retries, no flakes

# 3. offline, proven: the same pair inside a network namespace with no interfaces
set -o pipefail
unshare -rn npx vitest run test/recovery-artifacts.spec.ts test/recovery-kill-restart.spec.ts
#   -> Test Files 2 passed (2) / Tests 12 passed (12); PIPE_EXIT=0

# 4. static checks
npx tsc -p tsconfig.json --noEmit
#   -> exit 0, no output
npx oxlint test/recovery-artifacts.spec.ts test/recovery-kill-restart.spec.ts test/fixtures/recovery/worker.mjs
#   -> Found 0 warnings and 0 errors.
npx oxlint src test
#   -> Found 4 warnings and 0 errors. (all four pre-existing, in src/client/index.js and
#      test/config.spec.ts — none in the files added here)

# 5. the exact `npm test` lane (build + whole suite), run in an isolated copy of the
#    working tree, because `npm test` starts with `npm run build`, which rewrites the
#    version-controlled `lib/` and would exceed this round's ownership.
TMP=/tmp/recovery-npmtest-11665
rsync -a --exclude '.git' --exclude 'node_modules' ... ./ "$TMP"/ && ln -s <repo>/node_modules "$TMP"/node_modules
cd "$TMP" && TMPDIR=/tmp DSH_HOME="$TMP/.dsh-home" npm test
#   -> client bundle: 109330 bytes → lib/client.js
#   -> Test Files 44 passed (44) / Tests 760 passed (760) / Duration 31.76s / EXIT=0
#   -> the new specs are in that run: "✓ test/recovery-kill-restart.spec.ts (3 tests)"
#      and "✓ test/recovery-artifacts.spec.ts (9 tests)"
```

Environment for every command above: `cwd` = the repository root (or the isolated copy
for item 5), `TZ` unset/default, and the vitest env from `vitest.config.ts`
(`GROK_WORKFLOW_MEMORY_DIR=/tmp/dsh-grok-workflow-test-memory`,
`GROK_WORKFLOW_CHECKPOINT_DIR=/tmp/dsh-grok-workflow-test-checkpoints`); item 5 also set
`TMPDIR=/tmp` and an isolated `DSH_HOME`.

## The witness artifacts in this directory

Produced by:

```sh
RECOVERY_EVIDENCE_DIR=docs/knowledge/evidence/recovery-kill-restart-2026-11-12 \
  npx vitest run test/recovery-kill-restart.spec.ts
#   -> Tests 3 passed (3)
```

`kill-restart/` holds what the killed-then-restarted pair actually left on disk:

| File | Meaning |
| --- | --- |
| `ledger.ndjson` | The append-only execution journal of both processes. |
| `resume-after-task-a.json` | The sealed document committed by the process that was killed, at its last settled boundary. |
| `resume-interrupted.json` | The recovering host's record: task-a completed, task-b interrupted. |
| `resume-after-restart.json` | The sealed document the restarted process committed, all three tasks completed. |

The ledger is the proof of exactly-once completion:

```text
start    attempt 1  pid 11281  task-a
end      attempt 1  pid 11281  task-a
start    attempt 1  pid 11281  task-b     <- killed here: no end line, ever
retained attempt 2  pid 11288  task-a     <- re-verified, not re-executed
start    attempt 2  pid 11288  task-b
end      attempt 2  pid 11288  task-b
start    attempt 2  pid 11288  task-c
end      attempt 2  pid 11288  task-c
worker-exit attempt 2  pid 11288
```

Read as claims: `task-a` has exactly one `end` and one `start` across both processes (the
restarted process only recorded `retained`); `task-b` has one `end` and two `start`s,
because its first attempt was interrupted and the restore policy re-drives it exactly
once more; `task-c` ran once, after the restart. The pids differ, so the two halves are
genuinely two processes.

## Honest limits

- `npm test` was **not** run in the repository itself (`NOT_RUN` by ownership): its first
  step rewrites the tracked `lib/`. It was run in a byte-copy of the working tree with
  `node_modules` symlinked; the copy is not part of the repository.
- The kill is a real `SIGKILL` of a fixture process, not a crash of a real DSH workflow
  run: no DSH engine is started here (that would need a live profile and a model
  boundary, see `test/checkpoint-engine-wire.spec.ts` for the engine-level lane).
- The resume document's durable commit is performed by the fixture worker, but its bytes
  are sealed by the real `src/resume/` module — the worker never computes a digest.
- The interruption record (`resume-interrupted.json`) is written by the recovering host
  after the kill, not by the dying process: a dead process cannot describe its own
  interruption. What the dying process left behind is
  `resume-after-task-a.json`, and that file is asserted to still validate.
- `lib/src/` and `lib/test/` exist untracked in the working tree (mtime 03:29:32, before
  the first file of this round was created, containing only HEAD-era sources). They were
  not produced by any command in this note and were left untouched.

## Independent re-verification (attempt 2, 2026-11-12 04:12–04:19 +08)

Everything above was re-run from scratch in a fresh session. No file in `test/` was edited:
the two specs and the fixture are byte-for-byte the ones the first pass wrote. The numbers
below are this pass's own output.

```sh
cd /home/fish/projects_mine/dsh-grok-workflow     # HEAD 84e6894, branch main

# a. the pair, three times
for i in 1 2 3; do npx vitest run test/recovery-kill-restart.spec.ts test/recovery-artifacts.spec.ts; done
#   -> Test Files 2 passed (2) / Tests 12 passed (12)   x3, exit 0 each

# b. offline: same pair inside a network namespace with no interfaces
set -o pipefail; unshare -rn npx vitest run test/recovery-kill-restart.spec.ts test/recovery-artifacts.spec.ts
#   -> Test Files 2 passed (2) / Tests 12 passed (12); PIPE_EXIT=0

# c. static checks
npx tsc -p tsconfig.json --noEmit                       # -> exit 0
npx oxlint test/recovery-artifacts.spec.ts test/recovery-kill-restart.spec.ts test/fixtures/recovery/worker.mjs
#   -> Found 0 warnings and 0 errors (96 rules, 3 files)

# d. whole suite in the repository itself, without the build step
npx vitest run
#   -> Test Files 44 passed (44) / Tests 760 passed (760) / 31.08s / exit 0
#      (includes ✓ test/recovery-artifacts.spec.ts (9 tests))

# e. the exact `npm test` lane, in a byte-copy of the working tree
rsync -a --exclude .git --exclude node_modules --exclude .tmp-largefiles --exclude .audit-scratch \
  ./ "$HOME/.tmp-recovery-npmtest"/ && ln -s "$PWD/node_modules" "$HOME/.tmp-recovery-npmtest/node_modules"
cd "$HOME/.tmp-recovery-npmtest"
TMPDIR=/tmp DSH_HOME="$HOME/.tmp-recovery-npmtest/.dsh-home" npm test > "$HOME/.tmp-recovery-npmtest.log" 2>&1
#   -> client bundle: 109330 bytes → lib/client.js
#   -> Test Files 44 passed (44) / Tests 760 passed (760) / EXIT=0
#   -> both new specs are in that run: line 67 "✓ test/recovery-kill-restart.spec.ts (3 tests)",
#      line 93 "✓ test/recovery-artifacts.spec.ts (9 tests)"
```

`npm test` is still **not** run inside the repository (its first step, `npm run build`,
rewrites the version-controlled `lib/`), exactly as recorded above; item (d) is the same
suite run in place with the build step skipped.

### The published artifacts are reproducible, not hand-written

Regenerating the witness directory from the spec and comparing with the files committed
here:

```sh
RECOVERY_EVIDENCE_DIR="$HOME/.tmp-recovery-witness" npx vitest run test/recovery-kill-restart.spec.ts
#   -> Tests 3 passed (3)
sed -E 's/"pid":[0-9]+/"pid":PID/g' "$HOME/.tmp-recovery-witness/kill-restart/ledger.ndjson" > /tmp/regen.ndjson
sed -E 's/"pid":[0-9]+/"pid":PID/g' docs/knowledge/evidence/recovery-kill-restart-2026-11-12/kill-restart/ledger.ndjson > /tmp/pub.ndjson
diff /tmp/pub.ndjson /tmp/regen.ndjson    # -> no output: identical apart from the two pids
```

And the three committed documents validate through the compiled real module, with the plans
this note claims:

```sh
node --input-type=module -e "…validateResumeCheckpoint / evaluateResumeCheckpoint over the three files…"
#   resume-after-task-a.json  | ok=true | task-a:completed
#                             | plan={"retain":1,"redrive":0,"reverify":0,"replan":0}
#   resume-interrupted.json   | ok=true | task-a:completed,task-b:interrupted
#                             | plan={"retain":1,"redrive":1,"reverify":0,"replan":0}
#   resume-after-restart.json | ok=true | task-a:completed,task-b:completed,task-c:completed
#                             | plan={"retain":3,"redrive":0,"reverify":0,"replan":0}
```

### Environment note from this pass

Between ~04:08 and ~04:12 the host's `/tmp` tmpfs answered writes with `EDQUOT`
("Disk quota exceeded"), so the first run of the pair was executed with
`TMPDIR=$HOME/.tmp-recovery-verify` (log: `$HOME/.tmp-recovery-verify/run1.log`:
`Test Files 2 passed (2) / Tests 12 passed (12)`, 20.87s). `/tmp` recovered afterwards and
every later run — (a)–(e) above — used the default `TMPDIR=/tmp`. The specs themselves use
`mkdtemp(tmpdir())` and do not depend on any particular temporary location; this was a
transient host condition, not a property of the suite.
