# `/grok` switch-word grammar — before/after

Reproduced 2026-11-21 on this machine (`vitest` 4.1.12).

| state | command | result |
| --- | --- | --- |
| `src/command.ts` at `0eb5d8f` (pre-change), the new test file copied in | `npx vitest run test/command.spec.ts` inside a detached worktree of `HEAD` with `node_modules` symlinked | **4 failed / 22 passed** (`before.txt`) |
| working tree after the change | `npx vitest run test/command.spec.ts` | **26 passed** (`after.txt`) |

The four pre-change failures, verbatim from `before.txt`:

1. `case and whitespace tolerance > enables for every casing and whitespace variant of on` —
   `rawInput "ON"`: usage error instead of `Grok workflow ON`.
2. `… disables for every casing and whitespace variant of off, from an enabled session` —
   `rawInput "OFF"`: usage error instead of `Grok workflow OFF`.
3. `… treats a non-string argument as a usage error, not as "no argument means on"` —
   `TypeError: Cannot read properties of undefined (reading 'trim')`: the old handler threw out of
   the command on a malformed invocation.
4. `grok command and the master switch read one state > … round trip …` — the round trip opens with
   `invoke('OFF')`, so it failed for the same casing reason as (2).
