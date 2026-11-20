# `/compact` failure — reproduction evidence (2026-11-20)

Root cause: this plugin wrote `assistant/message` outside an open step, and DSH's token meter
refuses to replay such a journal. Fix and decision: `D-094`; full record:
`docs/knowledge/VALIDATION.md`.

## Files

| file | what it is |
| --- | --- |
| `main-before.txt` | `node scripts/repro-compact.mjs` on the **pre-merge mainline** (`490edce`, its own committed `lib/`), exit **1** |
| `main-after.txt` | the same command on **`main` after the fix merged**, exit **0** |
| `main-before-test.txt` | `npx vitest run test/compact-step-pairing.spec.ts` inside the `490edce` tree, exit **1** (4 failed / 2 passed) |
| `before.txt` | historical: the same harness on the branch base `0d91e45`, exit **1** |
| `after.txt` | historical: the harness on the pre-merge fixed branch, exit **0** |

`main-before.txt` / `main-after.txt` are the pair that matters for the integrated state: the
harness is run from the tree's own `lib/`, so before the merge it reproduces the user-visible
failure on `main`, and after the merge the same command answers successfully on `main`.

## What the script drives

`scripts/repro-compact.mjs` builds an in-memory `Session` (`@deepseek-ai/dsh-session` from this
repo) at the gate's pre-step point — `turn/start`, `user/message`, no `step/start` — calls the
shipped writer, then runs the **real** `/compact` command from the installed DSH:

- `@deepseek-ai/dsh-command-compact` (the command handler whose text a user sees),
- `@deepseek-ai/dsh-compaction-basic` (`compactNow`, the engine `/compact` calls),
- `@deepseek-ai/dsh-token-meter` (`measure`, the fold that throws).

No model, no network, no session store: the session lives in memory and is never attached.

## The measured failure, pre-fix

```
measure   : token meter: assistant/message at seq 2 has no matching step/start event
compactNow: raw: token meter: assistant/message at seq 2 has no matching step/start event
/compact  : { "kind": "threw", "text": "token meter: assistant/message at seq 2 ..." }   exit 1
```

`compactNow()`'s outer `try/catch` does not wrap this: its callback is `async`, so the rejection
escapes as the raw meter error rather than `ManualCompactionError('busy')`. That corrects §R5 of
`docs/knowledge/evidence/diag-ctx-compaction-2026-11-07.md`, which predicted the `busy` sentence
from source reading alone.

## The measured outcome, fixed

```
events    : turn/start, user/message            (the receipt is refused, not relocated)
measure   : ok, totalTokens 12, 1 node
compactNow: ok
/compact  : { "kind": "success", "text": "No compactable history yet." }                  exit 0
```

## Session scan (why real sessions were affected)

Read-only scan of the 120 most recent archived sessions in this workspace (`zstd -dc` + JSON walk,
no writes): 10 sessions carried an out-of-step `assistant/message` — 4 `grok-workflow/workflow-receipt`,
4 `grok-workflow/workflow-notice`, 6 model-attributed (the cancelled terminal), 1 other. The
script used for that count is not part of the repo (it reads user session data); the counts above
are what it printed.
