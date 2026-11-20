# Round 39 — Full CI and lib artifact consistency check (attempt 1)

Verification-only pass on the observed tree. Nothing under `src/`, `test/`, `lib/`,
config, or the schedule was edited by this task; the only file this task created is
this report. See "Side effects" for the one artifact rewrite that `npm run ci`
performs by design.

- Working directory: `/home/fish/projects_mine/dsh-grok-workflow`
- HEAD: `366d169e98a681e84875d8d798f91d68f608e660` (`366d169`), `main...origin/main`,
  `git rev-list --left-right --count origin/main...HEAD` → `0	0` (in sync)
- Package version: `0.12.13` (`package.json:3`)
- Node `v26.8.1`, npm `11.19.0`
- Host timezone `+08:00`
- Run 1 window: `2026-11-20T18:17:39` → `18:19:23`
- Run 2 window: `2026-11-20T18:20:23` → `18:22:10`

## Verdict

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | **PASS** | stage under `&&` chain; 0 `error TS` lines in either log, `CI_EXIT=0` |
| `npm run lint` | **PASS** | `Found 24 warnings and 0 errors.` (run 1 `/tmp/ci-r39-a1.log:251`; identical line in run 2) |
| `npm run verify:lib` | **PASS** | `lib/ at 366d169 is the build of src/ at 366d169 (153 files, byte-identical)` |
| `npm test` (build + vitest) | **PASS** | `Test Files  72 passed (72)` / `Tests  1295 passed (1295)` |
| **`npm run ci` overall** | **PASS** | `CI_EXIT=0` (run 1), `CI_EXIT_RUN2=0` (run 2) |
| `npm run verify:lib` standalone | **PASS** | `VERIFY_LIB_EXIT=0`, byte-identical, `2026-11-20T18:17:24` |
| Working-tree `lib/` == build of working-tree `src/` | **CONFIRMED idempotent** | aggregate hash unchanged across a fresh `npm run build` (below) |
| GUI click-through | **NOT_RUN** | out of scope by task constraint |
| `test:e2e` / `test:loader` / live-model paths | **NOT_RUN** | not part of `npm run ci` |

Zero failing markers in either run: `grep -c -E "^ *(×|FAIL)"` → `0` for both logs.
The `&&` chain in `ci` means a non-zero exit in any stage would have aborted the run,
so `CI_EXIT=0` is itself evidence that typecheck, lint, verify:lib each exited 0.

Two full runs were performed on purpose — run 1's certified byte-state was disturbed
by a concurrent writer 21 s after it closed (see "Concurrency"), so run 2 re-certified
the current bytes with hashes proven identical before and after.

## Test counts (quoted)

Run 1:

```
 Test Files  72 passed (72)
      Tests  1295 passed (1295)
   Start at  18:17:48
   Duration  94.54s (transform 1.41s, setup 0ms, import 5.18s, tests 80.59s, environment 8ms)

real	1m44.317s
```

Run 2:

```
 Test Files  72 passed (72)
      Tests  1295 passed (1295)
   Start at  18:20:33
   Duration  97.62s (transform 1.73s, setup 0ms, import 5.46s, tests 83.43s, environment 8ms)

real	1m47.218s
```

Provenance of the 72 files: 70 spec files are tracked at HEAD
(`git ls-tree -r HEAD --name-only test | grep -c 'spec\.ts$'` → `70`) plus 2 untracked
specs on disk (`test/checkpoint-bound.spec.ts`, `test/config-chain-types.spec.ts`) = 72.
So the run exercised the committed suite plus two uncommitted specs.

Comparison to the earlier attempt on the same HEAD (`.rsi/evidence/ci-health-round39.md:20`,
`18:14`, left untouched): 71 files / 1284 tests → now 72 / 1295 (+1 file, +11 tests).
The delta is `test/config-chain-types.spec.ts`, absent from that snapshot.

## lib/ artifact consistency

Standalone, before anything else touched the tree:

```
$ npm run verify:lib
client bundle: 237735 bytes → lib/client.js
lib/ at 366d169 is the build of src/ at 366d169 (153 files, byte-identical)
VERIFY_LIB_EXIT=0
```

**Committed pair: byte-identical at `366d169`.** Criterion satisfied.

**Scope limit, stated plainly.** `scripts/verify-lib.mjs` does `git archive HEAD`,
builds that snapshot in a temp dir, and compares it against *HEAD's* committed `lib/`
(`scripts/verify-lib.mjs:1-24,57-70`). It never reads the working tree, so it
**cannot** detect drift between uncommitted `src/` and the working-tree `lib/`. The
green line above certifies the committed pair only.

### Working-tree drift (the dirty-tree half)

Before this task ran, `lib/` was clean (`git status --short lib` → empty at
`18:17:08`) while `src/` carried uncommitted edits — i.e. the working-tree artifact was
stale relative to the working-tree source, the same defect class `verify:lib` exists to
catch at commit time. `npm test` runs `npm run build` first
(`package.json:59`), so CI rebuilt `lib/` in place from the dirty `src/`. The exact
drift against HEAD, with HEAD blob SHAs:

| Path | HEAD blob |
| --- | --- |
| `lib/checkpoint/schema.d.ts` | `5e9c3fc41351` |
| `lib/checkpoint/schema.d.ts.map` | `4dd29305f56a` |
| `lib/checkpoint/schema.js` | `358947a7979b` |
| `lib/checkpoint/schema.js.map` | `95beb24c47bb` |
| `lib/delivery/index.d.ts` | `b42f289ac8ab` |
| `lib/delivery/index.d.ts.map` | `b9588169b3d2` |
| `lib/delivery/index.js` | `924290188068` |
| `lib/delivery/index.js.map` | `1810b86c9823` |

8 files = 2 modules × 4 artifact kinds, and they map one-to-one onto the 2 dirty source
files (`src/checkpoint/schema.ts`, `src/delivery/index.ts`). No other `lib/` file moved,
so no unrelated module's artifact is affected.

After the rebuild the working tree is internally consistent — `npm run build` is
idempotent on it:

```
LIB_AGG_BEFORE=52ef311925a8dc3a3fd8c0bcc1443e0820ed3bcd7c19af2716d11ed18ac68b44
BUILD_EXIT=0
LIB_AGG_AFTER =52ef311925a8dc3a3fd8c0bcc1443e0820ed3bcd7c19af2716d11ed18ac68b44
IDEMPOTENT=yes
```

(aggregate = `sha256sum` over the sorted per-file `sha256sum` of `lib/**/*.{js,d.ts,map,mjs}`)

Summary of the pairing state:

- committed `HEAD` `lib/` ↔ committed `HEAD` `src/`: **byte-identical** (`verify:lib`).
- working `lib/` ↔ working `src/`: **byte-identical after the CI build** at `18:20:41`
  (idempotency above) — but see the post-run correction below, this no longer holds.
- working `lib/` ↔ `HEAD` `lib/`: **8 files differed** at `18:22:1x`, because `src/` has
  2 uncommitted, unbuilt-at-HEAD edits. This is pending work, not a defect: whoever
  commits those two sources must commit the regenerated artifacts in the same commit.

## Git status snapshot at verification time

At run 1 start, `18:17:39` (20 entries):

```
## main...origin/main
 M CHANGELOG.md
 M src/checkpoint/schema.ts
 M src/delivery/index.ts
 M test/delivery-human-block.spec.ts
?? .rsi/evidence/baseline-round39-attempt2.md
?? .rsi/evidence/baseline-round39.md
?? .rsi/evidence/checkpoint-comment-fix.md
?? .rsi/evidence/ci-health-round39.md
?? .rsi/evidence/delivery-bilingual-edge.md
?? .rsi/evidence/harness/verify-round39-armed-row-refresh.txt
?? .rsi/evidence/harness/verify-round39-live.txt
?? .rsi/evidence/harness/verify-round39.md
?? .rsi/evidence/harness/verify-row-endstate-round39.txt
?? .rsi/evidence/heartbeat-rearm/05-arm-cross-check.md
?? .rsi/evidence/heartbeat-rearm/06-attempt2-verification.txt
?? .rsi/evidence/heartbeat-rearm/07-handoff-one-call.md
?? .rsi/evidence/runtime-audit-2026-11-20.md
?? .rsi/evidence/triage-round39.md
?? test/checkpoint-bound.spec.ts
?? test/config-chain-types.spec.ts
```

At final snapshot, `18:22:1x` — the same 20 entries plus the 8 rebuilt `lib/` files
and one new evidence file from a concurrent writer (superseded for `lib/` by the
post-run correction below):

```
 M CHANGELOG.md
 M lib/checkpoint/schema.d.ts          M lib/delivery/index.d.ts
 M lib/checkpoint/schema.d.ts.map      M lib/delivery/index.d.ts.map
 M lib/checkpoint/schema.js            M lib/delivery/index.js
 M lib/checkpoint/schema.js.map        M lib/delivery/index.js.map
 M src/checkpoint/schema.ts
 M src/delivery/index.ts
 M test/delivery-human-block.spec.ts
?? .rsi/evidence/triage-round39-reattempt.md     ← appeared 18:19:03
```

Everything else was already there when the task began; the task added no new dirty
path except `lib/`'s rebuild (see Side effects) and this report.

## Concurrency

Another writer was active in this checkout throughout the window. Observed, not
inferred:

| Time | Observation |
| --- | --- |
| `18:17:03` | `test/config-chain-types.spec.ts` mtime, 5 s before my first snapshot |
| `18:17:08` | snapshot: 16 dirty entries, `CHANGELOG.md` clean |
| `18:17:23` | `CHANGELOG.md` rewritten (appeared dirty in the `18:17:39` snapshot) |
| `18:17:39` → `18:19:23` | run 1; `src/` + `test/` hashes verified stable across it |
| `18:19:03` | `.rsi/evidence/triage-round39-reattempt.md` created (untracked, docs only) |
| `18:19:44` | `test/config-chain-types.spec.ts` rewritten — 21 s **after** run 1 closed |
| `18:20:15` | that spec re-run alone on its new bytes: `1 passed`, `6 passed (6)` |
| `18:20:23` → `18:22:10` | run 2; pre/post hashes of all 5 dirty+untracked source/test files identical (`STABLE=yes`) |

Byte-state certified by run 2 (stable for the whole run):

```
df9bfa9bdde1ce451eceac93f4b521d767d849ac1bf9401e0de982d1834f3c7d  src/checkpoint/schema.ts
fb4af3fe5c2006a0ffc585a5340425af7d11505b82aef3496a64c398881db082  src/delivery/index.ts
2033fe066c446dbfe5b477c53c52f74052c65a7e9eaf47db014e8bc1b08ef229  test/delivery-human-block.spec.ts
232943eb3c82cbee4d62274bec6c591be91985e2fe655340e98482d964e4c7e9  test/checkpoint-bound.spec.ts
09a59a822acb9e27a68a11e9f97c49589472e17159d4e3c7d355aba14db81451  test/config-chain-types.spec.ts
```

Note the spec's 6-test count was the same in both runs, so the `18:19:44` edit did not
change that spec's test count; the totals are 1295 either way.

Run 1 remains valid for the `src/` state (identical hashes), but its test surface was
the pre-`18:19:44` spec bytes. Run 2 is the certification of record.

## Post-run correction (`18:22:29`, after run 2 closed)

The snapshot above went stale within a minute of being taken, and the correction
changes the artifact verdict for one module. Recording it rather than leaving the
earlier line standing.

`lib/checkpoint/schema.{js,js.map,d.ts,d.ts.map}` were rewritten at
`2026-11-20 18:22:29.889760213 +0800` — 19 s after run 2 finished at `18:22:10` — and
their content is now **identical to HEAD** (`git show HEAD:lib/checkpoint/schema.js |
cmp - lib/checkpoint/schema.js` → identical), while `src/checkpoint/schema.ts` is still
the uncommitted `16:07:57` edit. Nobody in this task ran `git checkout -- lib/`; the
revert came from another writer in this checkout. Only `lib/delivery/index.*` (mtime
`18:20:41`, this task's run-2 build) is still dirty.

Read-only re-measurement, built into a temp `outDir` so the tree was not touched:

```
$ ./node_modules/.bin/tsc -p tsconfig.build.json --outDir /tmp/libcheck-a1   # TSC_TMP_EXIT=0
$ cmp lib/<f> /tmp/libcheck-a1/<f>      # per file
DIFFERS checkpoint/schema.js
DIFFERS checkpoint/schema.d.ts
SAME    delivery/index.js
SAME    delivery/index.d.ts
CHECKED_JS_DTS=74  DIFFERS=2
```

So the current working tree is:

| Pair | State now |
| --- | --- |
| committed `lib/` ↔ committed `src/` at `366d169` | byte-identical (`verify:lib`, exit 0) |
| `lib/delivery/index.*` ↔ `src/delivery/index.ts` | consistent (= this task's build) |
| `lib/checkpoint/schema.*` ↔ `src/checkpoint/schema.ts` | **stale**: artifact is HEAD's, source is edited |

Every `*.map` file also showed a diff in a whole-tree comparison, but that is an
artifact of the `--outDir` override, not drift: sourcemaps embed the emit-relative
source path, so the temp build wrote
`"sources":["../../home/fish/projects_mine/dsh-grok-workflow/src/answer.ts"]` where the
tree's map carries `"../src/answer.ts"`. The `.js`/`.d.ts` comparison above is the
path-independent signal, and it is the one to trust.

Consequence for the operator: the working tree right now has one module whose committed
artifact does not match its edited source. Whichever writer lands
`src/checkpoint/schema.ts` must regenerate `lib/` with it (`npm run build`) — or the
edit should be dropped. `verify:lib` will **not** catch this, because it only ever
compares HEAD to HEAD.

## Side effects

`npm run ci` ends in `npm test` = `npm run build && vitest run`, and the build writes
the working-tree `lib/` (153 files) and `lib/client.js` (`237735 bytes`,
`scripts/build-client.mjs`). That is why 8 tracked artifact files are dirty now.

This task deliberately did **not** revert them. `git checkout -- lib/` is a write to
`lib/`, which this task is forbidden to make, and it could discard a concurrent
writer's build. Nothing under `src/`, `test/`, `docs/`, config, or the schedule was
modified here. Before committing, land the two `src/` edits together with the rebuilt
`lib/`, or discard the artifact with `git checkout -- lib/`; either way re-confirm with
`npm run verify:lib`, which already reports the committed pair as byte-identical.

## Reproduce

```bash
cd /home/fish/projects_mine/dsh-grok-workflow
git rev-parse HEAD        # 366d169e98a681e84875d8d798f91d68f608e660
git status --short --branch
npm run verify:lib        # exit 0 — 153 files, byte-identical at 366d169
npm run ci                # exit 0 — 72 files / 1295 tests (94.54 s, then 97.62 s)
```

Raw logs: `/tmp/ci-r39-a1.log` (run 1), `/tmp/ci-r39-a1-run2.log` (run 2),
`/tmp/verifylib-r39-a1.log`, `/tmp/build-idem-a1.log`, plus hash/status snapshots in
`/tmp/hashes-a1-run2-{pre,post}.txt`, `/tmp/gitstatus-a1-{before,after,final}.txt`.

No credentials, tokens, or keys appear in this report or in the cited logs.
