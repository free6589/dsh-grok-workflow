# `/grok on` text — the false promise removed

Worktree: `<repo>/.agents/worktrees/fix/command-text` (branch `fix/grok-command-text`).
Not merged, not pushed. The live profile `~/.dsh` was never read or written; no
service was restarted.

| | |
|---|---|
| Base commit | `6e9bc56606aec2c9872cc582f61c0ec241f295fe` (`6e9bc56`) |
| Fix commit | `5c120b136e375685814563597d8c6927e1e33336` (`5c120b1`) |
| Evidence commit | the commit after `5c120b1`; it adds this file only |

## What was wrong

`/grok on` answered:

```text
Grok workflow ON — every message now runs the full plan→execute→verify workflow.
```

Nothing has routed a message into a workflow since `0.13.35`. The only readers of
the session mode record (`readModeRecord`) are the command's own `/grok status`
text (`src/command.ts`), the composer switch's route (`src/mode-surface.ts`), and
the block intake's admission rule (`src/user-source.ts` → `canAcceptBlock` →
`canAcceptBlockWhenEnforced`), which the six block tools consult through `admit`
(`src/block/tools.ts`). With the record off they refuse with `mode-off: 这个会话的
grok 模式没打开，接单台不接单`. So "on" admits block work; it turns no message into a
workflow. `test/command.spec.ts` already had a test named "no longer decides a user
message: the record belongs to the intake, not the chain", which passes both before
and after this change — the text was the only part still claiming otherwise.

## What changed

New success text (unchanged prefix, unchanged OFF text, unchanged record shape
`workflowMode: 'full'`, unchanged routes, unchanged admission rule):

```text
Grok workflow ON — the model may commission reviewed blocks of work in this session. Messages themselves are not turned into a workflow.
```

```text
Grok workflow OFF — normal chat.        (unchanged; still true)
```

| File | Lines |
|---|---|
| `src/command.ts` | +6 / −4 |
| `test/command.spec.ts` | +2 / −2 |
| `README.md` | +2 / −2 |
| `README.zh-CN.md` | +1 / −1 |
| `CHANGELOG.md` | +5 / −0 |
| `lib/command.js` | +6 / −4 (rebuilt, not hand-edited) |
| `lib/command.js.map` | +1 / −1 (rebuilt) |
| `lib/command.d.ts.map` | +1 / −1 (rebuilt) |

Eight files, 24 insertions, 15 deletions (`git show --stat 5c120b1`).

Also corrected, same defect class:

- `src/command.ts` — two comments that restated the promise: the
  `toggleFailureText` doc comment quoted "every message now runs the full
  workflow" as the wording a refused write must never carry, and the
  `workflowMode: 'full'` comment said "`/grok` promises the full workflow". Both
  now say the record carries a shape that routes nothing.
- `README.md` / `README.zh-CN.md` — the `grokDefault` row said `on` "claims every
  user message" / "认领每条用户消息". It does not: `grokDefault` is only the value
  the mode route reports for a session with no record (`src/index.ts`,
  `installModeRoute` → `fallback`), and `canAcceptBlockWhenEnforced` needs a real
  record, so the default admits no block work. Both rows now say that.
- `README.md` — the opt-in row said `/grok` "turns the workflow on for it"; it now
  says `/grok` lets the block intake take work.
- `CHANGELOG.md` — one `[Unreleased]` entry, English and Simplified Chinese.

Deliberately not touched: the record, the routes, `canAcceptBlock`, the
`mode-off` refusal, and the `OFF` text.

## Red before green

The test asserts the settle text verbatim through `ON_TEXT`
(`test/command.spec.ts:31`), used by 10 assertions. The expectation was changed to
the new sentence first, then run against the unchanged source:

```sh
cd .agents/worktrees/fix/command-text
TMPDIR=$PWD/.tmp npx vitest run test/command.spec.ts    # EXIT=1
```

```text
 ❯ test/command.spec.ts (27 tests | 7 failed) 209ms
     × enables the toggle for empty input 10ms
     × enables the toggle for on (whitespace trimmed) 1ms
     × enables for every casing and whitespace variant of on 1ms
     × settles with the state the readers see, and the round trip returns to the switch default 1ms
     × still settles success for a write the session really holds 1ms
     × settles success for on and off, error for a bad arg 1ms
     × registers grok only once a commands service is composed (real cordis) 63ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 7 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/command.spec.ts > grok command handler (arg parsing → toggle state) > enables the toggle for empty input
AssertionError: expected { kind: 'success', …(1) } to deeply equal { kind: 'success', …(1) }

- Expected
+ Received

  {
    "kind": "success",
-   "text": "Grok workflow ON — the model may commission reviewed blocks of work in this session. Messages themselves are not turned into a workflow.",
+   "text": "Grok workflow ON — every message now runs the full plan→execute→verify workflow.",
  }

 ❯ test/command.spec.ts:83:20
     81|     const session = realSession('sess-cmd-empty')
     82|     const result = invoke('', new FakeAgent(session))
     83|     expect(result).toEqual({ kind: 'success', text: ON_TEXT })
       |                    ^
     84|     expect(readModeRecord(session)?.enabled).toBe(true)
     85|   })

 Test Files  1 failed (1)
      Tests  7 failed | 20 passed (27)
```

The other six failures carry the same expected/received pair (verbatim in
`.tmp/red-full.log` during the run; not committed — scratch). Note the typecheck
still passed at red: this defect was never a type error, only a false sentence.

## Green

```sh
TMPDIR=$PWD/.tmp npx vitest run test/command.spec.ts    # EXIT=0
```

```text
 ✓ test/command.spec.ts (27 tests) 202ms

 Test Files  1 passed (1)
      Tests  27 passed (27)
```

The negative assertion in "settles error when the append is accepted but never
readable back" was moved from `'every message now runs the full plan'` to
`'commission reviewed blocks'`, so it still proves a refused write never carries
the success wording.

## Full gate

`lib/` is committed and was rebuilt with `npm run build` before the commit;
`verify:lib` reads `HEAD`, so the gate was run **at** `5c120b1`, not before it.

```sh
cd .agents/worktrees/fix/command-text
TMPDIR=$PWD/.tmp npm run ci          # EXIT=0
```

```text
> dsh-grok-workflow@0.13.36 ci
> npm run typecheck && npm run lint && npm run verify:lib && npm test

> dsh-grok-workflow@0.13.36 typecheck
> tsc -p tsconfig.json --noEmit

> dsh-grok-workflow@0.13.36 lint
> oxlint src test
...
Found 15 warnings and 0 errors.
Finished in 128ms on 177 files with 96 rules using 6 threads.

> dsh-grok-workflow@0.13.36 verify:lib
> node scripts/verify-lib.mjs

client bundle: 329354 bytes → lib/client.js
lib/ at 5c120b1 is the build of src/ at 5c120b1 (281 files, byte-identical)

> dsh-grok-workflow@0.13.36 test
> npm run build && vitest run
...
 Test Files  98 passed (98)
      Tests  1839 passed (1839)
   Start at  13:21:56
   Duration  94.79s

EXIT=0
```

- oxlint: **15 warnings, 0 errors**, 177 files, 96 rules. All 15 are pre-existing
  and in files this change does not touch; neither `src/command.ts` nor
  `test/command.spec.ts` appears among them.
- vitest: **98 files, 1839 tests, all passing.**
- `verify:lib`: `lib/ at 5c120b1 is the build of src/ at 5c120b1 (281 files,
  byte-identical)`.
- No test was added, so the suite counts are unchanged by this fix.

## Boundaries — what I could not verify, and what I chose not to touch

1. **No live-model soak, no user-perspective soak.** Not `NOT_RUN` by choice of
   scope: this change is one string and its readers. AGENTS.md §3 asks for a
   forked-profile soak before calling a change done; the plugin's user-visible
   surface here is the settle text rendered by the `commands` service, which this
   round did not exercise inside a real profile. The text is pinned byte-for-byte
   by the test instead.
2. **The composer switch and the settings page still carry their own wording, and
   I left it alone.** `src/client/index.js` has `status.off.detail` = "Send /grok
   for one serious run" and `status.on.detail` = "Substantial objectives go
   through the workflow; small questions are answered directly." Both read like
   effects of the master switch. I did not change them because that copy is
   entangled with the question this round explicitly reserves (whether a session
   with no record should be admitted): `grokDefault` is only the reported
   fallback, so a truthful settings line cannot say what the switch alone
   enables until that decision is made. Flagged for the decision, not silently
   rewritten.
3. **Historical text left as history.** `CHANGELOG.md` entries below
   `[Unreleased]`, `docs/releases/RELEASE-NOTES-*.md`, `docs/RELEASING.md`, and
   `docs/knowledge/*` quote the old promise as part of what a past release said,
   or as measured soak evidence. Those are records of the past, not current
   claims, so they were not edited.
4. **README test count is stale, and not mine.** `README.md` and
   `README.zh-CN.md` say "1850 deterministic tests across 98 files"; the run above
   reports 1839 across 98. Pre-existing drift, unrelated to this fix, left for a
   separate change.
5. **Not run:** `npm run test:e2e`, `npm run test:loader`, and every model-backed
   lane. They are outside `ci` and outside this string change.

## Reproduce

```sh
cd /home/fish/projects_mine/dsh-grok-workflow/.agents/worktrees/fix/command-text
git log --oneline -2                       # 5c120b1 + the evidence commit
git show --stat 5c120b1
TMPDIR=$PWD/.tmp npm run ci                # EXIT=0, 1839 tests, 98 files
grep -rn "every message now runs the full plan" src test README.md README.zh-CN.md
                                           # no matches
```
