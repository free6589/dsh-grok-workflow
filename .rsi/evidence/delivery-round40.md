# Delivery: truncation boundary + chain validation (round 40)

> **Provenance (added at the round-40 closeout, 2026-11-21).** This is a pre-ship capture written
> during an interrupted attempt that carried the label "round 40". The work it measures shipped as
> **round 39** in `01272af` (`v0.12.15`), and the live spec now titles those cases `round 39`. The
> commands and outputs below are left verbatim; only this note is new. See `STATE.md` → "Numbering
> reconciled (round-40 closeout)".

Scope: `src/delivery/index.ts` and `test/delivery-human-block.spec.ts` only, plus this file.
Working tree only: nothing committed, nothing pushed, no build, no full CI, no network, no model,
no credentials touched. All times local (Asia/Singapore), 2026-11-20.

The pair also carries the uncommitted round-37 truncation work (head+tail clamp, `pairCaps`,
`cutCodeUnits`); this round adds the chain validation the ledger was missing and pins the
bilingual cap at 4800 as a measured boundary rather than an incidental one.

## 1. What was wrong (CONFIRMED, measured)

The ledger's `Model routes:` line is the one place a delivery restates a *configuration*, and it
handed `report.routing[role]` straight to `Array#join`. Measured on the pre-fix module (`HEAD`,
`git show HEAD:src/delivery/index.ts`, run in `/tmp/delivery-red40`; probe printed the rendered
line for each chain):

```
CHAIN ["a/m1",7]                  => "Model routes: planner=inherit; worker=a/m1 → 7; verifier=inherit; supervisor=inherit; synthesizer=inherit"
CHAIN ["a/m1",null]               => "Model routes: planner=inherit; worker=a/m1 → ; verifier=inherit; supervisor=inherit; synthesizer=inherit"
CHAIN ["a/m1",{"provider":"b"}]   => "Model routes: planner=inherit; worker=a/m1 → [object Object]; verifier=inherit; supervisor=inherit; synthesizer=inherit"
```

A number, a `null` and an object each became a readable route nobody configured. A chain that is
not an array at all escaped as a bare `TypeError` from the ledger:

```
AssertionError: expected [Function] to throw error including 'delivery: roles.worker must be an arr…'
  but got 'chain.join is not a function'
```

and a missing routing map as `Cannot read properties of undefined (reading 'planner')`. Neither
message names the role or the position, which is the whole difficulty when five chains are
configured.

Truncation side: the round-37 clamp is in place in this tree, but the 4800 pair cap was only
asserted one knob at a time inside the sweep. This round pins the cap itself as a measured bound
and adds the "does not pass the cap by starving a language" check (measured pair lengths below).

## 2. Fix

`src/delivery/index.ts`

- `ROUTE_ROLES` (report order, matching `src/report.ts` `ROLE_NAMES`) — one list, so the ledger
  cannot drift from the report again.
- `gotType(value)` — `typeof` with the two shapes it misnames spelled out (`null`, `array`).
- `routeChains(routing)` — reads the map, refuses anything that is not `provider/model` labels,
  and carries the path in the refusal:
  - `delivery: roles must be a record of per-role chains, got undefined|null|string`
  - `delivery: roles.worker must be an array of "provider/model" strings, got string|object`
  - `delivery: roles.worker[1] must be a "provider/model" string, got number|boolean|bigint|object|array|null|undefined|symbol`
  - an absent or `null` chain means "inherit", matching `routeLabels` in `src/report.ts`.
- `machineLedger` calls `routeChains(report.routing)` instead of reading the map inline. The chain
  is machine bookkeeping, so a malformed one cannot cost the reader the answer: `humanConclusion`
  never reads `routing`, and `foldedLedger` in `src/answer.ts:89-95` already drops a ledger that
  cannot be rendered. Pinned by `keeps the human block readable when a chain is malformed`.

`test/delivery-human-block.spec.ts` — two new describes, 10 tests:

- `round 40: a chain value that is not a route label is refused by path` (8) — every non-string
  shape × the exact message, all five roles, a wrong entry at index 3 (not the first), a non-array
  chain, a non-record routing map, no-coercion, and the unchanged well-formed/inherit output.
- `round 40: the bilingual pair never crosses 4800 characters` (2) — a 201-knob × 2-language sweep
  bounded at 4800, and three clamp-forcing knobs where both blocks must stay over 2000 characters
  (measured 4509–4672 total, first 2290–2330, second 2178–2380) so the bound cannot be met by
  returning one language or by starving both.

## 3. Red → green

Command for every run below:

```
cd /home/fish/projects_mine/dsh-grok-workflow && npx vitest run test/delivery-human-block.spec.ts
```

RED — the current spec against the pre-fix module. Isolated copy, so the repo's own source was
never overwritten:

```
rm -rf /tmp/delivery-red40 && mkdir -p /tmp/delivery-red40
git -C <repo> archive HEAD | tar -x -C /tmp/delivery-red40
ln -s <repo>/node_modules /tmp/delivery-red40/node_modules
cp <repo>/test/delivery-human-block.spec.ts /tmp/delivery-red40/test/
cd /tmp/delivery-red40 && ./node_modules/.bin/vitest run test/delivery-human-block.spec.ts
```

The copy's spec differs from the repo spec in exactly one way: the `pairCaps` import symbol and
its five direct tests are removed, because `HEAD` does not export that function (the arithmetic is
new in this tree). Everything else — all truncation edges and all chain tests — is verbatim.

```
     ✓ keeps a reason that contains an identifier token ("attempt:") 11ms
     ✓ keeps the reason in the English block 1ms
     ✓ hides the ledger by default and shows it on request 1ms
     ✓ keeps the head and the verdict when the block is over budget 3ms
     ✓ still fits a short block unchanged 1ms
     ✓ keeps the second language head and verdict, not just the first 3ms
     × keeps the second language verdict whole when the first block is at the cap 145ms
     × keeps both verdicts when the first language is Chinese 128ms
     ✓ charges neither language more than the single-pass cap 239ms
     × keeps the head and the whole verdict and cuts only at a line boundary 4ms
     × marks the cut so a reader knows the middle is missing 2ms
     × keeps the same guarantee in the Chinese block 2ms
     × leaves no lone surrogate when a caveat is longer than one clamped line 2ms
     × leaves no lone surrogate in either language of a bilingual pair 3ms
     ✓ is exactly the two single-language blocks and one blank line 7ms
     ✓ adds no cut marker to a block that fits 1ms
     × names the role, the position and the shape for a non-string route 1ms
     × checks every role, not only worker 1ms
     × points at the entry that is wrong, not the first one 0ms
     × refuses a chain that is not an array, naming the role 1ms
     × refuses a routing map that is not a record 1ms
     × never coerces a bad route into a readable one 0ms
     ✓ still prints a well-formed chain, and "inherit" for an empty one 0ms
     ✓ keeps the human block readable when a chain is malformed 0ms
     ✓ stays inside the cap for every knob, in both language orders  767ms
     ✓ does not pass the cap by throwing away text it had room for 6ms

 Test Files  1 failed (1)
      Tests  13 failed | 20 passed (33)
     EXIT=1
```

Failure texts, verbatim (one per defect class):

```
AssertionError: expected 'Answer: Done.\nNext: The direction wa…' to contain '以上是结论（6 项里 1 项可用，5 项没做成）；明细已记入台账。'
AssertionError: expected [ 'high surrogate at 1721' ] to deeply equal []
AssertionError: expected [ 'Answer: Done.', …(14) ] to include '…'
AssertionError: roles.worker[1] as a number: expected undefined to be an instance of Error
AssertionError: expected [Function] to throw error including 'delivery: roles.worker must be an arr…' but got 'chain.join is not a function'
AssertionError: expected [Function] to throw error including 'delivery: roles must be a record of p…' but got 'Cannot read properties of undefined (reading 'planner')'
```

The 20 that pass before and after are the pre-existing guards plus four of this round's own:
`still prints a well-formed chain…` and `keeps the human block readable when a chain is malformed`
(the old code renders those correctly — they are the non-regression half), and both cap tests.
The cap tests pass on the old code because the round-36 blind pair cut kept the total at 4799 and
only ate the second verdict's last characters; it did not starve a language. So the cap pair is a
bound, not a defect: the 13 red tests are the 7 truncation edges and the 6 chain refusals, which
is what makes them defects rather than a rewrite.

GREEN — after the fix, in the repo (verbose reporter so each new test is named):

```
npx vitest run test/delivery-human-block.spec.ts --reporter=verbose
 ✓ … > round 40: a chain value that is not a route label is refused by path > names the role, the position and the shape for a non-string route
 ✓ … > round 40: a chain value that is not a route label is refused by path > checks every role, not only worker
 ✓ … > round 40: a chain value that is not a route label is refused by path > points at the entry that is wrong, not the first one
 ✓ … > round 40: a chain value that is not a route label is refused by path > refuses a chain that is not an array, naming the role
 ✓ … > round 40: a chain value that is not a route label is refused by path > refuses a routing map that is not a record
 ✓ … > round 40: a chain value that is not a route label is refused by path > never coerces a bad route into a readable one
 ✓ … > round 40: a chain value that is not a route label is refused by path > still prints a well-formed chain, and "inherit" for an empty one
 ✓ … > round 40: a chain value that is not a route label is refused by path > keeps the human block readable when a chain is malformed
 ✓ … > round 40: the bilingual pair never crosses 4800 characters > stays inside the cap for every knob, in both language orders
 ✓ … > round 40: the bilingual pair never crosses 4800 characters > does not pass the cap by throwing away text it had room for

 Test Files  1 passed (1)
      Tests  38 passed (38)
     EXIT=0
```

Delivery-adjacent specs (nothing else regressed):

```
npx vitest run test/delivery.spec.ts test/delivery-human-block.spec.ts \
  test/human-output-contract.spec.ts test/gate.spec.ts test/gate-partial-head.spec.ts
  → Test Files 5 passed (5) / Tests 126 passed (126) / exit 0
```

Static checks on the changed files (read-only; not `npm run ci`, not a build):

```
npx tsc -p tsconfig.json --noEmit                      → exit 0, no output
npx oxlint src/delivery/index.ts test/delivery-human-block.spec.ts → 0 warnings, 0 errors
```

## 4. Scope

| Path | State |
| --- | --- |
| `src/delivery/index.ts` | modified by this task (`git diff --numstat`: +164/−22, incl. the round-37 work) |
| `test/delivery-human-block.spec.ts` | modified by this task (`git diff --numstat`: +387/−2, 38 tests) |
| `.rsi/evidence/delivery-round40.md` | created by this task |
| `lib/` | **not** modified by this task. A concurrent build at 19:15:06 swept this change into `lib/delivery/*`; those four files were restored to `HEAD` (`git diff --stat lib/delivery/` → empty). `lib/checkpoint/*` is dirty from another writer's build of their dirty `src/checkpoint/schema.ts` and was left alone. |
| `CHANGELOG.md`, `src/checkpoint/schema.ts`, `test/checkpoint-bound.spec.ts`, `test/config-chain-types.spec.ts`, other `.rsi/evidence/*` | dirty before this task started, untouched here |

`git status --short --branch` on entry and at exit shows the same pre-existing set minus
`lib/delivery/*`; this task added only the three paths above.

## 5. Not run / uncertain

- NOT_RUN: full CI, build, `verify:lib`, commit, push, fetch — excluded by the task constraints.
  `lib/` is therefore stale relative to `src/` (it predates both this round and the round-37
  clamp) until the next build; that is the state `HEAD` already had for this file pair.
- NOT_RUN: any live relay turn through `src/answer.ts`. The claim that a malformed chain cannot
  cost the reader the answer rests on `humanConclusion` not reading `routing` plus the existing
  `foldedLedger` `try/catch` (`src/answer.ts:89-95`), asserted at the unit level by
  `keeps the human block readable when a chain is malformed`.
- Concurrency: another writer rebuilt `lib/` and is editing `src/checkpoint/schema.ts` in this
  same checkout. The `lib/` restore above can be undone by their next build; the dirty-path
  snapshot in §4 is a point in time, not a guarantee.
- The red baseline is `HEAD`, not a hand-reverted round-37 module, and the isolated copy drops the
  `pairCaps` import/tests for the reason stated in §3. The behavioural red for the truncation
  edges and for every chain test is the same code path either way.
