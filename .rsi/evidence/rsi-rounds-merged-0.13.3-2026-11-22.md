# RSI round 4/5/6/7/8/10/11 merged into main — 2026-11-22

The seven `rsi/round-*` branches that `HANDOFF.md` told us to keep as-is were
cherry-picked onto `main` and released as `0.13.3`. This file records what each
branch actually contributed to the merged tree, because `main` had drifted far
enough (156 commits) that four of the seven fixes were already there in another
form — the branch still carried the regression test that pinned the behaviour.

## What landed, per branch

| Round | Original commit(s) | Merged result on `main` |
|---|---|---|
| 4 | `c8de4fa` | **Fix + test**, clean cherry-pick. `src/redact.ts` gains `authorization-other-scheme`; `main` really did still leak `Authorization: Token/ApiKey/Digest/OAuth` and scheme-less values. |
| 5 | `0d25c3b`, `206db6b` | Fix already on `main` (`ROLE_ORDER` lists `supervisor`); conflict resolved in favour of `main`'s comment. **Tests only**: unknown provider in `roles.supervisor` fails the load, all-blank supervisor chain is a note. |
| 6 | `5cba3da`, `5e4a980` | Fix already on `main` (Round 26 rejects an unknown `grokDefault` in `resolveConfig`); conflict resolved in favour of `main`. **Test only**, pinned at the exact message. |
| 7 | `89042f9`, `a25776f` | **Fix + test**, clean. The `Not done:` row separator now follows the block's language (`：` / `: `). |
| 8 | `644897b` | Role list already on `main` (`routeChains`, Round 40); kept `main`'s hardening and took the **label fix** (`Synthesis mode:`) plus its two tests. |
| 10 | `6d9a11e` | Fix already on `main` (`msCeiling`); conflict resolved in favour of `main`. **Test only**: a 1,800,000 ms duration is recorded, not dropped. |
| 11 | `e191f24`, `8f90138` | `humanConclusion` already on `main` (Round 28); took the **no-task `0/0` → "还没有任何一项任务开工"** branch and the two `cancelledText` tests. `test/phase1-dialogue.spec.ts` kept `main`'s stronger Round 28 pins. |

## Verification

- `npm run build` — `tsc -p tsconfig.build.json` + client bundle, no errors.
- `npm run typecheck` — exit 0.
- `npm run lint` — 0 errors, 23 warnings (all pre-existing declarations).
- `npm test` (`npm run build` + `vitest run`) — **1464 tests passed**, exit 0.
- Targeted before the full run: `npx vitest run test/gate-partial-head.spec.ts
  test/config.spec.ts test/redact.spec.ts test/delivery-human-block.spec.ts`
  (146 passed after the Q11 separator fix below) and
  `test/delivery-human-block.spec.ts test/delivery.spec.ts
  test/checkpoint-wiring.spec.ts test/phase1-dialogue.spec.ts` (127 passed).
- Redaction proven on the built artifact, not just in the test:

```
$ node -e "… redactSecrets(input) …"   # lib/redact.js from this commit
Authorization: [REDACTED]
Authorization: [REDACTED]
Proxy-Authorization: [REDACTED]
Authorization: [REDACTED]
{"authorization":"[REDACTED]"}
Authorization: Bearer [REDACTED]
Authorization: none
```

## One test had to move with the fix

`test/delivery-human-block.spec.ts` (Q11, "leaves a reason that already fits
byte for byte alone") pinned the full-width colon inside an English block —
the exact defect round 7 removes. It now expects `- Hotel price check: …` and a
comment says why (`f3fd972`).

## Conflict resolutions that kept `main`, not the branch

`.rsi/evidence/round-00{5,6,7,8,10,11}/*` had already been written on `main`,
so the add/add conflicts were resolved with `git checkout --ours`. `src/config.ts`,
`src/settings.ts`, `src/checkpoint/wiring.ts`, `src/gate.ts` and
`test/phase1-dialogue.spec.ts` likewise kept `main`'s implementation where it was
already equivalent or stronger; only the missing pieces were taken from the branch.

设备=agent-6（workflow task-3），时间 2026-11-22
