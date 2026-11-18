# Test baseline — 2026-11-18

Repo `/home/fish/projects_mine/dsh-grok-workflow`, `HEAD = 17e3a12c74ec2546c6a782eba1444590cfe8cb87`
(`fix(docs): document every removed configuration key (RSI round 3)`), branch `main`, in sync with
`origin/main` (`git rev-list --left-right --count origin/main...HEAD` → `0 0`).

**Headline: the committed tree is green; the working tree is red, and it is red at the typecheck gate.**
`npm run ci` on the working tree exits **2**, on a pristine `HEAD` tree exits **0**. No test, CI rule,
threshold, or product file was changed to obtain either result.

## 1. Environment

| Item | Value |
| --- | --- |
| Host | omarchy, Linux 7.2.11-arch1-1, x86_64, 6 cores |
| Node / npm | `v26.8.1` / `11.19.0` |
| vitest / oxlint / tsc | `4.1.12` / `1.81.0` / TypeScript `^6.0.3` |
| Test env | `TMPDIR=$PWD/.tmp`; `vitest.config.ts` sets `fileParallelism: false`, `testTimeout: 30_000`, and redirects `GROK_WORKFLOW_MEMORY_DIR` / `GROK_WORKFLOW_CHECKPOINT_DIR` into `os.tmpdir()` |
| CI matrix (`.github/workflows/ci.yml`) | Node **22** and **24** — local runs use Node **26**, i.e. **outside** the matrix |
| Working tree | dirty: `M README.md`, `M README.zh-CN.md`, `M test/docs-config-keys.spec.ts`, untracked `.rsi/POOL.md`, `.rsi/evidence/round-012-{red,green}.txt`, `settings-simple-mock.html` |

## 2. Commands, gate by gate

| Command | Tree | Exit | Result | Log |
| --- | --- | --- | --- | --- |
| `npm run ci` | working tree | **2** | FAIL — stops at `typecheck` | `ci-run.log`, `ci-exit.txt` |
| `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) | working tree | **2** | FAIL — 1 error: `test/docs-config-keys.spec.ts(2,22): error TS7016: Could not find a declaration file for module 'js-yaml'` | `ci-run.log` |
| `tsc -p tsconfig.json --noEmit` | pristine `HEAD` | **0** | clean | `typecheck-head-clean.log` |
| `npm run lint` (`oxlint src test`) | working tree | **0** | 22 warnings, 0 errors, 95 files | `lint.log` |
| `oxlint` over the exact `HEAD` file list | pristine `HEAD` | **0** | 22 warnings, 0 errors, 94 files | `lint-at-head-17e3a12.log` |
| `npm run build` | working tree | **0** | `tsc -p tsconfig.build.json` + client bundle | `build-and-vitest.log` |
| `git diff --exit-code -- lib/` (CI artifact guard) | working tree | **0** | committed `lib/` matches a fresh build | `build-and-vitest.log` |
| `npx vitest run` (full suite, JSON report) | working tree | **0** | **54 files / 984 tests passed, 0 failed, 0 skipped**, 40.18 s | `build-and-vitest.log`, `vitest-report.json` |
| `vitest run` (full suite) | pristine `HEAD` | **0** | **54 files / 981 tests passed**, 37.23 s | `vitest-at-head-17e3a12.log` |
| `npm run ci` (full: typecheck → lint → build → vitest) | pristine `HEAD` | **0** | all four gates pass | `ci-at-head-clean-17e3a12.log` |
| `npm pack --dry-run` (CI step) | working tree | **0** | 82 files, 480.5 kB package / 1.5 MB unpacked, shasum `dc2ca299…` | `pack-dry-run.log` |
| `npx vitest run test/docs-config-keys.spec.ts` | working tree | **0** | 6/6 pass (the WIP file is runtime-green) | `wip-docs-config-keys.log` |
| `npm run test:e2e` | — | **NOT_RUN** | needs a real DSH profile plus a model route that answers (`scripts/e2e-headless-in-turn.sh`); not part of `npm run ci` | — |

`npm pack --dry-run` first failed with `npm error rofs EROFS … /home/fish/.npm/_cacache` because
`~/.npm` is read-only under the DSH sandbox; re-run with `--cache="$PWD/.tmp/npm-cache"` succeeded.
That is a sandbox artifact, not a repository failure.

## 3. Baseline comparison

| Point | Files | Tests | typecheck | lint |
| --- | --- | --- | --- | --- |
| Last documented baseline — `docs/knowledge/VALIDATION.md:3321` (Round 50, 2026-11-17, pre-`85541ad`) | 51 | 955 | clean | 22w / 0e |
| `HEAD` 17e3a12 (pristine, this run) | 54 | **981** | clean | 22w / 0e |
| Working tree (this run) | 54 | **984** | **FAIL** | 22w / 0e |

Delta `HEAD` vs the documented baseline: **+3 files, +26 tests**. The three new spec files account for
22 of them (`timeout-config.spec.ts` 12, `docs-version.spec.ts` 7, `docs-config-keys.spec.ts` 3); the
remaining +4 are additions inside existing specs (`config.spec.ts`, `checkpoint-*.spec.ts`,
`client.spec.ts`, `settings-projection.spec.ts`, `lifecycle-disposal.spec.ts`). The working tree adds
3 more tests to `docs-config-keys.spec.ts` (3 → 6), which is the whole 984 − 981 gap.

## 4. Coverage of changed behavior

No instrumented coverage is configured: there is no `@vitest/coverage-*` package, no `coverage` script,
and no coverage thresholds in `package.json` or `vitest.config.ts`. Producing line/branch coverage would
require adding a dependency and editing config — both excluded by this task's constraints. Coverage is
therefore reported as behavior → test mapping in [`behavior-to-test-map.md`](behavior-to-test-map.md),
backed by an import-graph module map in [`module-test-map.txt`](module-test-map.txt).

Every product change since `v0.10.2` is covered by at least one test: the `timeoutMs` feature
(`85541ad`, 9 product files) is pinned by `test/timeout-config.spec.ts` plus nine other specs that assert
the deadline in config, tool registration, checkpoints, reports and the settings projection. The
uncommitted README claims are pinned by the 3 new tests in `docs-config-keys.spec.ts`, which pass at
runtime but cannot reach CI because of section 5.

## 5. Gaps

1. **`typecheck` is red on the working tree — this is the blocking finding.** `test/docs-config-keys.spec.ts:2`
   imports `load` from `js-yaml`; the installed `js-yaml@4.3.2` ships no declarations (`types` field absent,
   no `.d.ts`, no `typesVersions`) and `@types/js-yaml` is not in `devDependencies`, so `tsc` raises TS7016.
   `npm run ci` runs `typecheck` first, so the whole job fails before lint or tests. One error, exactly.
2. **No line/branch coverage measurement** (section 4). Behavioral mapping is the only available proxy.
3. **`src/resume/policy.ts` has no test that imports it directly**; it is re-exported by
   `src/resume/index.ts` and exercised transitively by `resume-validator.spec.ts` and
   `recovery-artifacts.spec.ts`. Mapped as transitive, not as a hole, but nothing asserts `policy.ts`
   in isolation (`module-test-map.txt`).
4. **`2d5e956` (CHANGELOG v0.9.0 restoration) is guarded structurally only** — one section per published
   tag, newest first, opening with the declared version. The restored entries and dates have no assertion.
5. **`HYPOTHESIS` (not verified this run):** `.rsi/POOL.md` names six untested fail-closed branches in
   `src/config.ts` (`:654`, `:444`, `:462`, `:438`, `:680`, `:826`). Confirming them needs per-branch
   probing or a mutation run; neither was performed here.
6. **Local Node 26 ≠ CI Node 22/24.** Green here does not by itself prove green on the matrix; the last
   full CI run for this commit is a GitHub Actions fact that this run did not query.

## 6. Regression notes — tests, assertions, CI rules intact

- **No test file deleted** since `v0.10.2` (`git diff --diff-filter=D --name-only v0.10.2..HEAD -- test src` → empty).
- **No assertion weakened** in the working tree: the only removed line in `test/docs-config-keys.spec.ts`
  is the replaced `import { CONFIG_KEYS, REMOVED_CONFIG_KEYS }` line (`git diff -U2 | grep '^-'`); the other
  43 lines are additions.
- **No skips**: zero `it.skip` / `test.skip` / `describe.skip` / `.only` / `.todo` / `.fails` matches across
  `test/*.ts`, and the JSON report records `numPendingTests: 0`, `numFailedTests: 0`, 984/984 passed.
- **All specs ran**: 54 `*.spec.ts` on disk = 54 in the JSON report.
- **CI untouched**: `git status --porcelain .github vitest.config.ts package.json package-lock.json` → empty;
  `git diff v0.10.2..HEAD -- .github vitest.config.ts tsconfig.json tsconfig.build.json` → empty; the only
  `package.json` change since `v0.10.2` is the `0.10.2` → `0.11.3` version line.
- **Benign noise**: one run printed `MaxListenersExceededWarning: 11 SIGHUP listeners added to [process]`
  during Node teardown; no test failed because of it.

## 7. Evidence files

| File | Contents |
| --- | --- |
| `ci-run.log`, `ci-exit.txt` | full working-tree `npm run ci` output, exit 2 |
| `ci-at-head-clean-17e3a12.log` | full `npm run ci` on a pristine `HEAD` archive outside the repo, exit 0 |
| `ci-at-head-17e3a12.log` | first attempt inside the repo's gitignored `.tmp/` — oxlint reported "No files found to lint" there, so it was re-run outside the repo (§2) |
| `typecheck-head-clean.log` | `tsc --noEmit` on the pristine `HEAD` archive, exit 0 |
| `lint.log`, `lint-at-head-17e3a12.log` | oxlint, working tree and `HEAD` file list |
| `build-and-vitest.log` | build, `git diff --exit-code -- lib/`, full suite summary |
| `vitest-report.json` | machine-readable per-test report (54 files / 984 tests) |
| `vitest-at-head-17e3a12.log` | full suite on the pristine `HEAD` archive (981 tests) |
| `wip-docs-config-keys.log` | the WIP spec alone, 6/6 pass |
| `pack-dry-run.log` | `npm pack --dry-run` |
| `module-test-map.txt` | src module → importing test files |
| `behavior-to-test-map.md` | changed behavior → covering tests |

Raw logs only; nothing in this directory alters test or CI inputs.
