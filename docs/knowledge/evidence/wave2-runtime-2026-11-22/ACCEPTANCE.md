# Wave 2 runtime trio — acceptance evidence (2026-11-22)

Scope: L1 inheritance into the composed objective, Q6 cooperative child timeout,
Q8 guardian adjudication (single `guardianModel` route, wait ×2, rule B).

Status vocabulary: `CONFIRMED` = observed in a real command on this machine.

## Why the timeout race was inert before this round (`CONFIRMED`, fixed)

The engine builds the guest from `vm.createContext({})` and injects only
`agent/parallel/pipeline/phase/log/args`
(`node_modules/@deepseek-ai/dsh-workflow-ptc/lib/index.js`, `WorkflowExecution`
constructor). That realm has no `setTimeout`:

```
$ node -e "const vm=require('node:vm'); const c=vm.createContext({});
  console.log(vm.runInContext('[typeof setTimeout, typeof Atomics.waitAsync, typeof SharedArrayBuffer].join()', c))"
undefined,function,function
```

So the race now uses `Atomics.waitAsync` — a per-realm ECMAScript timer that
resolves to `timed-out` after N ms — and prefers `setTimeout` only where a host
injects one. `src/script.ts:115-147` (`hasHostTimer`, `sleepCell`, `afterDelay`),
armed by `raceChildCall` (`src/script.ts:162-207`) and by the adjudication bound
(`src/script.ts:256`).

## Criteria

1. **composeObjective attaches the 8K inherited digest; over limit, cut oldest→newest,
   verified list preserved.**
   `src/history.ts:203` (`composeObjective(history, request, limit, inheritance)`),
   wired at `src/gate.ts:1094`; digest built by
   `src/carryover.ts:683` (`buildInheritanceDigest`, `INHERITANCE_LIMITS.chars = 8000`).
   Measured on the built module:
   - 100 verified tasks (the engine's cap) at the 8K default: 7508 chars, 105 lines,
     **0 of 100 decision lines missing**, details dropped with a complete
     `[truncated: details over 8000 characters were dropped, every decision line above is complete]`.
   - 60 tasks at a 1600-character cap: oldest 39 lines dropped, newest 21 kept, marker
     ends in `]` (never sliced mid-sentence).
   Tests: `test/inheritance.spec.ts` (100-task case, oldest-first drop case,
   composeObjective cases), `test/gate.spec.ts` (the objective the engine is started
   with carries the block, once).

2. **Four resume branches expose a reason and a changed-field list.**
   `src/carryover.ts:472,541-598`; `test/inheritance.spec.ts:113` (all four branches,
   non-empty reasons, `changedFields` empty outside `replan`, 48-char/8-item bounds).

3. **agent() races childTimeoutMs (default 10 min) and a timeout enters bounded retry.**
   Default carried as `args.childTimeoutMs = CHILD_TIMEOUT_MS` (600000,
   `src/script.ts:3315`), raced in `raceChildCall`, settled as `class: 'timeout'`
   (`src/script.ts:301-315`) so the existing retry runs.
   Tests on the **engine-shaped realm** (bare `vm.createContext` + five hooks, no
   injected timer): hung worker → worker called twice, `attempts[0].failure.class ===
   'timeout'`, run `completed` (`test/timeout.spec.ts`, "fails a stalled call straight
   to retry…"); a real `vm` probe asserts that realm has no `setTimeout` and does have
   `Atomics.waitAsync` (`test/timeout.spec.ts`, "races on Atomics.waitAsync…").

4. **guardianModel is one route; wait at most twice; rule B; kill → retry.**
   Single-route config `src/config.ts:954-970`; rules `src/timeout.ts:106-175`
   (`GUARDIAN_MAX_WAITS = 2`, `guardianWaitMs`, `guardianDecision`); script mirror and
   adjudication `src/script.ts:212-275`.
   Tests on the engine-shaped realm: wait → one extension and the late child wins
   (1 adjudication, 1 attempt); kill → 1 adjudication, worker called twice, run
   `completed` (`test/timeout.spec.ts`). Rule B: no second adjudication once the
   deadline has no room.

5. **Pure-function unit tests for tiers and adjudication.**
   `test/timeout.spec.ts` (tiers at 0/119999/120000/599999/600000, `resolveChildTimeoutMs`,
   `parseGuardianVerdict`, `guardianWaitMs`, `guardianDecision`, host-budget mirror).

## Commands (this round)

| command | result |
| --- | --- |
| `npx vitest run` | 78 files / 1448 tests passed |
| `npm run typecheck` | no errors |
| `npx oxlint src/carryover.ts src/history.ts src/gate.ts src/script.ts test/inheritance.spec.ts test/timeout.spec.ts test/gate.spec.ts` | 0 errors, 2 pre-existing warnings (gate.ts:647 spread, gate.spec.ts:185 unused class) |
| `npm run build` | `lib/*` regenerated, client bundle 262124 bytes |

## Known limits (not fixed here)

- A child that never settles keeps its engine concurrency slot until it ends: the
  script can stop *waiting* (that is the Q6 fix) but cannot free the slot. With every
  slot stalled, adjudication calls queue, their own 60 s clock turns them into kills,
  and the run ends at the host guardian's 10-minute per-child budget
  (`src/guardian.ts:182`). Mass stalls are therefore bounded, not retried.
- `wait ×2` needs an unlimited run deadline or an unusually long one to be reached
  end to end (rule B truncates each extension to the remaining deadline), so the
  "at most twice" bound is pinned by the pure function and the script mirror rather
  than by a multi-minute integration test.
