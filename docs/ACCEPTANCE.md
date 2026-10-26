# Acceptance Criteria

Legend: PASS = actually executed and observed; FAIL = executed and failed;
`NOT_RUN` = not executed; `BLOCKED` = cannot execute in current environment.

## Functional acceptance

| # | Criterion | Status | Evidence |
|---|---|---|---|
| F1 | Plugin registers through the real DSH plugin loading mechanism | PASS | `test/loader.spec.ts` uses real Cordis Loader + ToolRuntime; local profile and GitHub-installed profile both show the bundle row; 2 loader tests pass. |
| F2 | At least one end-to-end workflow runs successfully | PASS | Real DSH headless runs called `grok_workflow`: caller plan completed 2/2 verified; planner-only plan completed 1/1 verified; `VALIDATION.md` 2026-10-25. |
| F3 | At least two independent subtasks run in parallel | PASS | Real DSH run executed two 4-second timing tasks with a measured 538 ms overlap; deterministic test also asserts peak concurrency. |
| F4 | Concurrency cap is effective | PASS | Five tasks with `maxConcurrency=2`; observed peak 2 in the real generated script. |
| F5 | Success, partial success, and failure are distinguished correctly | PASS | Deterministic tests cover completed, partial, and failed reports; a real DSH run returned `PARTIAL` (1/2 verified) and the assistant explicitly did not claim success. |
| F6 | Independent verification detects failure or evidence-free results | PASS | Evidence-free verifier pass is rejected; retry bound tested (`test/orchestrator.spec.ts`). |
| F7 | Retries never exceed the configured limit | PASS | `maxRetries=1` produces exactly 2 worker and verifier calls; hard cap tested in config tests. |
| F8 | Cancellation cleans up child tasks and resources | PASS | Plugin unload and max-active-run tests assert `cancel` and `dispose`; a real DSH deadline run returned `FAILED` with `Timeout` and left no child process. |
| F9 | Plugin unload releases listeners and registrations | PASS | Real Loader test disposes the plugin fiber and asserts the tool and prompt section disappear. |
| F10 | Ordinary DSH behavior is unaffected when the plugin is disabled | PASS | Real Loader test with `disabled: true` asserts no tool and no prompt section. |
| F11 | Credential redaction test passes | PASS | 6 redaction tests pass. |

## Test acceptance

| # | Test | Status | Evidence |
|---|---|---|---|
| T1 | Normal success path | PASS | `test/orchestrator.spec.ts` success test. |
| T2 | Subtask failure and partial success | PASS | `test/orchestrator.spec.ts` partial test. |
| T3 | Verification failure and bounded retry | PASS | Evidence-free and retry-success tests. |
| T4 | Concurrency limit | PASS | Five tasks with `maxConcurrency=2`; observed peak 2. |
| T5 | Cancellation and resource cleanup | PASS | Plugin lifecycle tests. |
| T6 | Invalid input and boundary conditions | PASS | `test/input.spec.ts`; exact-criterion, duplicate-criteria, objective, and aggregate-budget tests. |
| T7 | Credential redaction | PASS | `test/redact.spec.ts`. |
| T8 | Plugin registration and unload | PASS | `test/loader.spec.ts` real Loader composition. |
| T9 | Real DSH Loader + plugin composition integration | PASS | `test/loader.spec.ts`, 2 tests pass. |

## 0.2.0 feature acceptance (2026-10-26)

| # | Scenario | Status | Evidence |
|---|---|---|---|
| S1 | Mandatory entry: greeting, simple question and follow-up all run the full workflow | PASS | `test/gate.spec.ts`; real headless `scripts/e2e-headless-in-turn.sh`. |
| S2 | Answer delivered in the same turn (in-turn strategy) | PASS | `test/gate.spec.ts` in-turn suite (9 cases). |
| S3 | Refusal and failure paths are explicit (no silent answer, no zero-output) | PASS | `test/gate.spec.ts`; `E2E_EXPECT=refusal` real headless run. |
| S4 | Per-role model selection reaches child activation | PASS | `test/routing.spec.ts`; `test/engine-contract.spec.ts`. |
| S5 | First successful route stops the chain; route failures switch in order | PASS | `test/routing.spec.ts`. |
| S6 | Content failures never switch models; chain exhaustion reports honestly | PASS | `test/routing.spec.ts`, `test/failure-paths.spec.ts`. |
| S7 | Reliability: cancel, timeout, concurrency cap, duplicate start, recursion, unload | PASS | `test/reliability.spec.ts` (18 cases). |
| S8 | Infrastructure failures still yield structured per-task reports | PASS | `test/failure-paths.spec.ts` (real PTC engine 429). |
| S9 | Real install, composition anti-bypass, settings surface identity | PASS | `test/loader.spec.ts`, `test/composition.spec.ts`, `scripts/smoke-settings-identity.mjs`. |

## Engineering quality

| # | Check | Status | Evidence |
|---|---|---|---|
| Q1 | Typecheck passes | PASS | `npm run typecheck`. |
| Q2 | Lint passes | PASS | `npm run lint`, 0 warnings/errors. |
| Q3 | Unit tests pass | PASS | `npm test`, 264 tests / 18 files. |
| Q4 | Build passes | PASS | `npm run build`; package contents inspected. |
| Q5 | Applicable GitHub Actions checks pass | PASS | GitHub Actions runs `40168892831`, `40169133016`, `40169816856`, `40169885633`, `40170034851`, `40172141078`, `40172376450`, `40175621646`, `40176223802`, `40176627051`, `40178132743`, `40178354035`, and PR run `40178081351`, `40178848058` for the README completion, `40179586981` for the fallback fix, `40182707932` for the release-workflow fix (Node 22/24), and `40182751006` for the first release (Node 22; release workflow). The first release attempt `40182588171` failed on a changelog regex escaping bug; `a7d5a62` fixed it and the successful rerun superseded it. |
| Q6 | README and test commands match implementation | PASS | README commands and documented defaults match source/tests. |
| Q7 | Every executed check has a real result | PASS | `VALIDATION.md` records commands and outputs. |
| Q8 | Un-executed checks marked NOT_RUN/BLOCKED | PASS | Clean-profile CI remains explicitly local-only; all executed checks have recorded results. |
