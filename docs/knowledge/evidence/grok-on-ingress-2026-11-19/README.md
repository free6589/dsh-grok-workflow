# `/grok on` message ingress — reproduction evidence

`.log` files in this directory are gitignored (`.gitignore:8` `*.log`), so the
commands and their decisive output lines are recorded here as well.

Task: `/grok on` (session record `workflowMode: 'full'`) made every message typed
during a run invisible; `/grok off` was fine. Base commit `22bbe17` (v0.11.21).

## 1. Root cause, source

| Claim | Locator |
| --- | --- |
| `/grok on` writes `workflowMode: 'full'` | `src/command.ts:142` |
| Interactive admission is `triage`-only | pre-fix `src/gate.ts:1260`, post-fix `src/gate.ts:1281` |
| `full` then awaited the whole workflow inside the open step | pre-fix `src/gate.ts:1458`, post-fix `src/gate.ts:1550` |
| The loop claims a batch only at the start of a step | `dsh-agent-loop/lib/index.js:679` `preStep()`, `:683` `this.inbox.claim(target, position.turn)` |
| …and opens the next step only after the current one settles | `dsh-agent-loop/lib/index.js:737` `turn()`, `:752` `while (true)`, `:780` `await this.step(decision)` |
| Bound on the wait | `src/config.ts:104` `DEFAULT_TIMEOUT_MS = 3_600_000` (60 min) |
| `/grok off` passes without a run | `src/gate.ts:512-513` `{ kind: 'pass', reason: 'mode-off' }` |

Fix under test: `src/gate.ts:1386` `answerFullBehind` (condition `:1398`), call
site `:1546`, receipt `src/gate.ts:584`, `src/answer.ts:182` `acceptedEnterText`.

## 2. Reproduction before the fix (independent re-run, `git worktree` at `HEAD`)

```console
$ git worktree add --detach /tmp/grok-prefix-repro HEAD      # src/gate.ts has 0 answerFullBehind
$ cp test/grok-on-ingress.spec.ts /tmp/grok-prefix-repro/test/
$ cd /tmp/grok-prefix-repro && npx vitest run test/grok-on-ingress.spec.ts
 × dispatches the next message while the team run is still in flight 127ms
 × still runs the full team for the message and delivers the report afterwards 1054ms
 × a saturated queue keeps the blocking path instead of promising a background run 1003ms
 ✓ leaves /grok off untouched: the message passes straight through, no run 32ms
 ✓ keeps the configured concurrency envelope untouched 1ms
 Tests  3 failed | 2 passed (5)          # exit 1
```

The first failure is the user's symptom in one line:

```text
AssertionError: expected [ 'refactor the parser' ] to include 'also check the lexer'
```

Only the first batch was ever dispatched: the second message stayed in the inbox
because the open step had not settled (`Error: message 1 was not dispatched` is the
same cause in the queue-saturation case). The second failure (`the report was not
delivered`) is the delivery side of it.

Full output: `repro-before-head-worktree.log` (and the earlier 4-case run,
`repro-before.log`).

## 3. Reproduction after the fix

```console
$ npx vitest run test/grok-on-ingress.spec.ts     # working tree with the fix
 ✓ test/grok-on-ingress.spec.ts (5 tests) 859ms
 Tests  5 passed (5)                              # exit 0
```

`repro-after.log`. The five cases cover: ingress stays open with the team run in
flight, the team still runs and its report is delivered afterwards, a saturated
per-agent queue falls back to the blocking path with no receipt for a run that was
never queued, `/grok off` unchanged (no run at all), concurrency envelope intact
(default 10, hard max 100, `resolveConfig` still refuses 101).

## 4. `npm run ci`

Isolated tree = `HEAD` + only this fix (`src/gate.ts`, `src/answer.ts`,
`test/grok-on-ingress.spec.ts`; the concurrent intake hunks were reverted and
`src/intake.ts` left out):

```console
$ cd /tmp/grok-verify && npm run ci
> tsc -p tsconfig.json --noEmit                 # 0 errors
> oxlint src test                               # 22 warnings, 0 errors
> node scripts/verify-lib.mjs                   # lib/ at 22bbe17 is the build of src/ at 22bbe17 (149 files, byte-identical)
 Test Files  64 passed (64)
      Tests  1164 passed (1164)                 # exit 0
```

`ci-isolated-fix-only.log`.

The shared working tree was red earlier the same day, in files this task does not
touch (other agents' in-flight work). It went green once they landed:

```console
$ npm run ci                                    # shared tree, final
> tsc -p tsconfig.json --noEmit                 # 0 errors
> oxlint src test                               # 24 warnings, 0 errors
> node scripts/verify-lib.mjs                   # lib/ at 22bbe17 is the build of src/ at 22bbe17 (149 files, byte-identical)
 Test Files  67 passed (67)
      Tests  1218 passed (1218)                 # exit 0
```

`shared-tree-ci-green.log`. The red runs, kept for the record: a half-written
`src/client/index.js:1514` (parse error) in `shared-tree-ci-red-parse-error.log` /
`shared-tree-vitest-red.log`, five config-surface specs plus a half-written
`test/client.spec.ts` (`TS2304`) in `shared-tree-ci-red-1.log` /
`shared-tree-ci-red-2.log`. Zero of those failures were in gate / ingress /
delivery.

## 5. Not run

Real GUI click-through (`/grok on`, then two messages in the browser) is
`NOT_RUN`: the working tree is shared with concurrent writers and a live DSH
instance with model quota is the integration owner's step. The gate-level
reproduction above drives the real `Session`, the real `agent/pre-step`
registration and a faithful miniature of `AgentLoop`'s single-step dispatch
discipline; no model is called.
