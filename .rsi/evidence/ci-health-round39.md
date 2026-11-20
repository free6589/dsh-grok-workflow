# Round 39 — Full CI and lib artifact consistency check

Read-only health check of the current tree. No source, test, or memory file was
edited by this task; the only file it wrote is this report. See "Side effects"
for the one artifact write that `npm run ci` performs by design.

- Run window: `2026-11-20T16:12:27+08:00` → `2026-11-20T16:14:06+08:00`
- Working directory: `/home/fish/projects_mine/dsh-grok-workflow`
- HEAD: `366d169e98a681e84875d8d798f91d68f608e660` (`366d169`)
- Package version: `0.12.13` (`package.json`)
- Node `v26.8.1`, npm `11.19.0`

## Verdict

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | **PASS** | `tsc -p tsconfig.json --noEmit`, no diagnostics (`/tmp/ci-round39.log:9-10`) |
| `npm run lint` | **PASS** | `Found 24 warnings and 0 errors.` — 117 files, 96 rules, 6 threads, 104 ms (`/tmp/ci-round39.log:254-255`) |
| `npm run verify:lib` | **PASS** | `lib/ at 366d169 is the build of src/ at 366d169 (153 files, byte-identical)` (`/tmp/ci-round39.log:261`; standalone re-run below) |
| `npm test` (build + vitest) | **PASS** | `Test Files 71 passed (71)` / `Tests 1284 passed (1284)`, duration 89.46 s (`/tmp/ci-round39.log:512-515`) |
| **`npm run ci` overall** | **PASS** | `CI_EXIT=0`, wall clock 99 s (`/tmp/ci-round39.log:517-518`) |
| `npm run verify:lib` standalone | **PASS** | `VERIFY_LIB_EXIT=0`, same byte-identical line (`/tmp/verifylib-round39.log`) |
| GUI / browser click-through | **NOT_RUN** | Out of scope by task constraint |
| Scheduled-delivery replay | **NOT_RUN** | Out of scope by task constraint |
| Model-dependent paths (`test:e2e`, live model calls) | **NOT_RUN** | Out of scope; `npm run ci` does not include `test:e2e` or `test:loader` |

Zero failing specs. The only log line matching `✗|FAIL|×` is a passing test title,
`✓ never dresses a FAILED run in the success sentence` (`/tmp/ci-round39.log:416`).

## Test counts

```
 Test Files  71 passed (71)
      Tests  1284 passed (1284)
   Duration  89.46s (transform 1.35s, setup 0ms, import 4.82s, tests 76.55s, environment 8ms)
```

Baseline comparison:

| Point | Files | Tests |
| --- | --- | --- |
| Round 038 (`.rsi/evidence/round-038/ci-mine.txt:507-508`, `ci-release.txt:505-506`) | 69 | 1263 |
| This run (HEAD `366d169`) | 71 | 1284 |
| Delta | +2 | +21 |

The delta is accounted for: 70 spec files are tracked at HEAD
(`git ls-tree -r HEAD --name-only test | grep -c 'spec\.ts$'` → 70), plus 1
untracked spec on disk (`test/checkpoint-bound.spec.ts`) = 71. Recently added
tracked specs include `test/compact-step-pairing.spec.ts` (commit `5fb5da0`) and
`test/iterate-plan.spec.ts` (commit `13d2273`). So the run exercised committed
tests plus one uncommitted new spec.

## lib/ artifact consistency

```
$ npm run verify:lib
client bundle: 237735 bytes → lib/client.js
lib/ at 366d169 is the build of src/ at 366d169 (153 files, byte-identical)
VERIFY_LIB_EXIT=0
```

Byte-identical at commit `366d169e98a681e84875d8d798f91d68f608e660`.

Scope limit worth stating plainly: `scripts/verify-lib.mjs` exports **HEAD**
(`git archive HEAD`) into a temp dir, builds it, and compares against **HEAD's**
committed `lib/` (`scripts/verify-lib.mjs:9-12,57-70`). It therefore certifies
the committed pair only — it does **not** cover the uncommitted `src/` changes
present during this run. The committed pair is consistent; the working tree is
not what was verified.

## Working tree state at run start

Tree was **dirty** (not clean) — 12 entries at CI start, 11 about two minutes
earlier:

```
 M src/checkpoint/schema.ts
 M src/delivery/index.ts
 M test/delivery-human-block.spec.ts
?? test/checkpoint-bound.spec.ts
?? .rsi/evidence/baseline-round39.md
?? .rsi/evidence/checkpoint-comment-fix.md
?? .rsi/evidence/harness/verify-round39-live.txt
?? .rsi/evidence/harness/verify-round39.md
?? .rsi/evidence/heartbeat-rearm/05-arm-cross-check.md
?? .rsi/evidence/heartbeat-rearm/06-attempt2-verification.txt
?? .rsi/evidence/heartbeat-rearm/07-handoff-one-call.md
?? .rsi/evidence/runtime-audit-2026-11-20.md
?? .rsi/evidence/triage-round39.md
```

Branch `main...origin/main` (no divergence reported by `git status`).

**Concurrency observed during this check.** The tree changed while the check was
in flight, from a writer other than this task:

- At `16:10` the `src/delivery/index.ts` / `test/delivery-human-block.spec.ts`
  diff read `102 + 206` changed lines; by `16:12:27` it read `104 + 202`
  (`git diff --stat`), i.e. those two files were being edited mid-flight.
- A new untracked file appeared between the two snapshots:
  `.rsi/evidence/harness/verify-round39.md` and
  `…/verify-round39-live.txt` (dirty count 11 → 12).

Consequence: the green result certifies whatever bytes sat on disk at
`16:12:27`; it is not a guarantee about the tree as another writer left it
afterwards. Re-running is cheap (99 s) if a final post-merge confirmation is
wanted.

## Side effects

`npm run ci` ends in `npm test`, which is `npm run build && vitest run`. The
build step rewrote the working-tree `lib/` from the uncommitted `src/`, so 7
tracked artifact files now differ from HEAD:

```
 M lib/checkpoint/schema.d.ts        M lib/checkpoint/schema.js
 M lib/checkpoint/schema.d.ts.map    M lib/checkpoint/schema.js.map
 M lib/delivery/index.d.ts.map       M lib/delivery/index.js
 M lib/delivery/index.js.map
```

`lib/` was clean before the run (0 entries in `git status --short lib/`); the
aggregate hash of `lib/**/*.{js,mjs,map}` moved
`bb31ded1…d6a897` → `4009bb0e…3e5005`.

This task deliberately did **not** revert them: `git checkout -- lib/` would be
a tree-cleaning write outside this task's scope and could discard a concurrent
writer's build. Nothing under `src/`, `test/`, or `docs/` was modified by this
task. Before committing, the operator should land `src/` and the rebuilt `lib/`
together (or run `git checkout -- lib/` to discard the artifact), then confirm
with `npm run verify:lib` — the committed pair at HEAD is already byte-identical,
so only the pairing of the *pending* commit is at stake.

## Reproduce

```bash
cd /home/fish/projects_mine/dsh-grok-workflow
git rev-parse HEAD                       # 366d169
npm run ci                               # exit 0, 71 files / 1284 tests
npm run verify:lib                       # exit 0, 153 files byte-identical
```

Full logs: `/tmp/ci-round39.log`, `/tmp/verifylib-round39.log`.
