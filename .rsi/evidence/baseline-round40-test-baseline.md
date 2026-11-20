# Test baseline — round 40 measurement (no code changed)

Task: `test_baseline`. Repo `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`,
HEAD `bffd0b4afe2408edef3ba0ef03453a3605f98cca`. Measured 2026-11-21T01:24:52+08:00 →
01:28:45+08:00. Every result below is from a command run in this session; nothing is
carried over from earlier rounds.

**Side effects:** no `src/`, `lib/`, `test/`, config or snapshot file was edited by this
task; no `--fix`, no `-u`, no commit, no push, no fetch. Working-tree state was captured
before the first command and re-diffed after the last: identical, and `lib/` is byte
identical to its pre-run snapshot (153 files, sha256 manifest compared). Logs live in the
gitignored scratch dir `.tmp/baseline-a5/`.

## 0. Environment (`CONFIRMED`)

| item | value |
|---|---|
| OS | `Linux 7.2.11-arch1-1 x86_64` |
| Node | `v26.8.1` |
| npm | `11.19.0` |
| package | `dsh-grok-workflow@0.12.14` |
| CI runner target | `.github/workflows/ci.yml` matrix `node: ['22', '24']`, `ubuntu-latest` |

Local Node 26.8.1 is **outside** the CI matrix (22/24), so a local pass is not proof of a
CI pass. `engines` allows `node >=22`.

## 1. Working-tree state measured (`CONFIRMED`)

```
$ git status --short --branch
## main...origin/main
 M .rsi/POOL.md
 M .rsi/evidence/stop-probes.txt
 M lib/delivery/index.d.ts
 M lib/delivery/index.d.ts.map
 M lib/delivery/index.js
 M lib/delivery/index.js.map
 M src/delivery/index.ts
 M test/delivery-human-block.spec.ts
 + 27 untracked paths, including the spec file test/tmp-ledger-probe.spec.ts
```

`git diff --stat`: 8 files, 808 insertions(+), 51 deletions(-). The uncommitted change is
the round-37/40 delivery work (`src/delivery/index.ts` + its `lib/` rebuild + the
`test/delivery-human-block.spec.ts` additions).

## 2. Commands, exit codes, tails (`CONFIRMED`)

| # | command | exit | evidence |
|---|---|---|---|
| 1 | `npm run typecheck` | **0** | `.tmp/baseline-a5/typecheck.log` |
| 2 | `npm run lint` | **0** | `.tmp/baseline-a5/lint.log` |
| 3 | `npm run verify:lib` | **0** | `.tmp/baseline-a5/verify-lib.log` |
| 4 | `npm run build` | **0** | `.tmp/baseline-a5/build.log` |
| 5 | `npx vitest run` (all specs on disk, 71 files) | **1** | `.tmp/baseline-a5/vitest.log` |
| 6 | `npx vitest run <70 tracked specs>` | **0** | `.tmp/baseline-a5/vitest-tracked-only.log` |
| 7 | `npm run test:unit` | **0** | `.tmp/baseline-a5/test-unit.log` |
| 8 | `npm run ci` | **1** | `.tmp/baseline-a5/ci.log` |
| 9 | `git diff --exit-code -- lib/` (CI step 5) | **1** | `.tmp/baseline-a5/lib-consistency.log` |
| 10 | `npm pack --dry-run` | **226 — BLOCKED** | `.tmp/baseline-a5/pack.log` |
| 11 | `npm run test:e2e` | **NOT_RUN** | needs a live DSH profile + answering model route |
| 12 | `npm run test:loader` | **NOT_RUN** as its own command | `test/loader.spec.ts` ran and passed inside #5/#6 |

Tails:

```
# 1 npm run typecheck
> tsc -p tsconfig.json --noEmit
EXIT=0                      (01:24:57 → 01:25:01)

# 2 npm run lint
> oxlint src test
Found 24 warnings and 0 errors.
Finished in 195ms on 117 files with 96 rules using 6 threads.
EXIT=0

# 3 npm run verify:lib
client bundle: 237735 bytes → lib/client.js
lib/ at bffd0b4 is the build of src/ at bffd0b4 (153 files, byte-identical)
EXIT=0

# 4 npm run build
> tsc -p tsconfig.build.json && node scripts/build-client.mjs
client bundle: 237735 bytes → lib/client.js
EXIT=0          (emitted lib/ is sha256-identical to the pre-run lib/, 153/153 files)

# 5 npx vitest run
 FAIL  test/tmp-ledger-probe.spec.ts > probe > measures the ledger clamp
 Test Files  1 failed | 70 passed (71)
      Tests  1 failed | 1296 passed (1297)
   Duration  32.13s
EXIT=1

# 6 npx vitest run <70 tracked specs from git ls-files 'test/*.spec.ts'>
 Test Files  70 passed (70)
      Tests  1296 passed (1296)
   Duration  29.87s
EXIT=0          (01:27:06 → 01:27:37)

# 7 npm run test:unit
 Test Files  19 passed (19)
      Tests  514 passed (514)
   Duration  8.37s
EXIT=0

# 8 npm run ci   (typecheck && lint && verify:lib && npm test)
Found 24 warnings and 0 errors.
lib/ at bffd0b4 is the build of src/ at bffd0b4 (153 files, byte-identical)
 Test Files  1 failed | 70 passed (71)
      Tests  1 failed | 1296 passed (1297)
EXIT=1          (fails only at the final `npm test`)

# 9 git diff --exit-code -- lib/
 lib/delivery/index.d.ts     |  21 +++++
 lib/delivery/index.d.ts.map |   2 +-
 lib/delivery/index.js       | 205 ++++++++++++++++++++++++------
 lib/delivery/index.js.map   |   2 +-
 4 files changed, 204 insertions(+), 26 deletions(-)
GIT_DIFF_EXIT=1
git status --porcelain -uall -- lib/  → 4 modified, 0 untracked

# 10 npm pack --dry-run
npm error errno -30
npm error rofs EROFS: read-only file system, open '/home/fish/.npm/_cacache/tmp/…'
PACK_EXIT=226
```

Run #5 and run #8 reproduce the same counts (71 files / 1297 tests, 1 failed) — the single
failure is deterministic, not flaky.

## 3. Failure triage (no fix performed)

**`test/tmp-ledger-probe.spec.ts > probe > measures the ledger clamp`** — the only failure.

- File is **untracked** (`git ls-files --error-unmatch test/tmp-ledger-probe.spec.ts` →
  `did not match any file(s) known to git`), so it exists on this disk only and is absent
  from any CI checkout.
- Stack: `test/tmp-ledger-probe.spec.ts:33:10` in `bigReport` →
  `assertWorkflowReport` at `src/report.ts:586:17`:
  `Error: workflow result completed lacks confirmed evidence for task a0 criterion`.
- Root cause is in the probe's own fixture, not in shipped code: `bigReport` builds a
  `status: 'completed'` report with 100 `verified` tasks and `confirmed: []`, while
  `src/report.ts:583-588` requires exactly one non-empty confirmed evidence row per
  verified task criterion for a completed report. It throws while constructing the
  fixture, **before** `machineLedger` is ever called, so the clamp the probe meant to
  measure is never exercised.
- Consequence: `npm test` and `npm run ci` are red on this working tree only. The
  committed suite (#6) is fully green, and a CI checkout cannot see the file.

**Lint warnings (exit 0, non-blocking):** 24 warnings / 0 errors — 23 ×
`eslint(no-unused-vars)`, 1 × `eslint(no-useless-escape)`. Locations: `src/client/index.js`
(7: lines 797, 1180, 1213×2, 1317×2, 1461), `src/config.ts` (674, 776, 908),
`src/gate.ts` (647, 1149), `src/run.ts:39`, `src/redact.ts:273`, and 9 in
`test/human-output-contract.spec.ts` (358, 379, 396, 414, 428, 474), `test/gate.spec.ts:184`,
`test/heartbeat-identity.spec.ts:34`, `test/iterate.spec.ts:7`, `test/timeout-config.spec.ts:245`.

## 4. Merge-readiness verdict

**A full-green release is not currently demonstrable; the committed suite itself is green.**

Green (`CONFIRMED`): typecheck 0, lint 0 errors, `verify:lib` byte-identical at `bffd0b4`,
build reproducible (emitted `lib/` sha256-identical to the tree's `lib/`), tracked suite
70/70 files and 1296/1296 tests passing — and that count **includes** the uncommitted
`test/delivery-human-block.spec.ts` additions against the uncommitted `src/delivery` change.

Not green:

1. `npm test` / `npm run ci` exit 1 on this tree because of the untracked scratch probe
   (§3). CI is not exposed to it, but the repo's own local gate is red until that file is
   removed or committed.
2. CI step `git diff --exit-code -- lib/` exits 1: 4 `lib/delivery/*` files are modified
   and uncommitted. A push carrying only `src/` + `test/` would fail that step; the `lib/`
   files must be committed with the delivery change (they already match the working `src/`
   byte for byte, so no rebuild is needed).
3. `npm pack --dry-run` is `BLOCKED` locally (read-only npm cache under this sandbox,
   errno -30 / EROFS). That CI step is unverified on this machine.
4. CI runs Node 22 and 24; this baseline ran on Node 26.8.1 only. `npm run test:e2e` was
   `NOT_RUN` (needs a live DSH profile and an answering model route).

So: the delivery change is merge-ready at the level of the tracked test suite, but release
readiness is unconfirmed until (a) the untracked probe is dealt with, (b) `src/`, `lib/` and
`test/` are committed together, and (c) CI on Node 22/24 plus the `npm pack` step report
green. No fix for any of the above is proposed here — this task owns measurement only.
