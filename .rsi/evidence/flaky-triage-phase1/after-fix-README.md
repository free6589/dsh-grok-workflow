# flaky-triage phase 1 — after the fix (commit `a210b08`, branch `fix/flaky-triage-phase1`)

Written by the fixer (agent-118/fixer). Every number below was produced in this
worktree; nothing here is inferred from the code alone.

## Files

- `after-fix-harness-load12-n10.txt` — `LOAD=12 N=10 ./.tmp/repro.sh`
  (12 bash spinners + `TMPDIR=$PWD/.tmp npx vitest run test/phase1-dialogue.spec.ts test/triage.spec.ts`),
  run with **nothing else on the box**: `RED 0 / 10`, loadavg 22.58 → 26.43.
- `after-targeted-run-1..5.txt` — `LOAD=16 N=5` over the same two files: `RED 0 / 5`.
- The two pre-fix samples (`repro-run-1.log`, `repro-run-7-triage.log`) are the
  lead's and stay **untracked**: `*.log` is gitignored repo-wide and no `.log`
  file is tracked anywhere in this repository. They live here, locally.
- `repro-run-1.log`, `repro-run-7-triage.log` — the lead's pre-fix samples
  (unchanged, and untracked: see the note on `*.log` above).

## Pre-fix, measured here (same box, same harness)

| command | result |
| --- | --- |
| `LOAD=16 N=15`, `test/phase1-dialogue.spec.ts` alone | **15/15 red**, always `P0-2 … > consumes a pending question once, so a repeated answer cannot start a second run` (410–1060 ms), always `AssertionError: expected '已收到，并入了正在跑的这一轮（待并入 1 条）…' to contain '没有待回答的分流问题'` |
| `LOAD=24 N=8`, same file, `-t 'P0-2: a confirmation answer keeps the original request'` | **8/8 red**, same case |
| `LOAD=12 N=8`, `test/triage.spec.ts` alone | **0/8 red** — this file only reproduced with both files' load (lead: 1 run in 10). |

No second *distinct* red case was observed in `phase1-dialogue.spec.ts` (33
loaded samples, one per run + 8 targeted). The four `triage.spec.ts` cases in
`repro-run-7-triage.log` were reproduced as one cause: the first red there is
`Error: background report not delivered yet` (vitest's 1 000 ms `vi.waitFor`),
and the round it left running then steered the next three cases' messages —
`待并入 1 条` → `2 条` → `3 条`, the queue count rising as each steered message
joined it.

## Assertions still bite (scratch copy under `.tmp/`, deleted, never committed)

| mutant | case | failure |
| --- | --- | --- |
| `takePending` stops deleting the entry | phase1 `consumes a pending question once` | `AssertionError: … to contain '没有待回答的分流问题'`, 1 835 ms |
| `resumedRequest` loses `用户选择团队模式` | phase1 `hands the team the original request together with the choice` | `AssertionError: … to contain '用户选择团队模式'`, 822 ms |
| `captainAnswer` never approves | triage `runs the whole workflow…after the captain split is confirmed` | `expected [ … ] to have a length of 2 but got 1`, 10 417 ms |
| the ambiguous tier escalates instead of asking | triage `asks one question instead of guessing, and remembers the answer` | `expected [ … ] to have a length of 0 but got 1`, 5 619 ms |

(A first attempt at mutating the resumed objective itself — `resumedTarget`
quoting an empty original request — did **not** bite: `改一下那个` also travels in
the forwarded conversation, which is why that case asserts on the objective the
run was started with. Recorded so the negative result is not lost.)

## The fix fails for the right reason

With the round made to never deliver (`deliverRelay` skips `agent.followup`, in
the scratch copy):

- phase1 `consumes a pending question once`: `Error: the round the confirmation
  started did not land within 15000 ms` at **15 430 ms**.
- triage `runs the whole workflow…`: `Error: the report of the background round
  did not land within 15000 ms` at **20 220 ms** (5 s path-detection window + 15 s).

Neither is `Test timed out in 30000ms`.

## Gate

`npm run ci` → **exit 0**: 99 files / 1837 tests PASS, typecheck clean,
lint 0 errors / 36 warnings, `lib/ at 4a2f7fd is the build of src/ at 4a2f7fd
(237 files, byte-identical)`.