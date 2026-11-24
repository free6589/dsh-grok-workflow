# L1 dispatcher lifecycle — evidence (2026-11-23)

Branch: `team-dispatch-v1`, base `e4e03e9d1c718edb1f5e5a747d2489c5348329a9`
(worktree `.agents/worktrees/team-dispatch-v1`).

Scope: `src/dispatcher/` only — start/stop/resume, the four-operation
whitelist, the three hard refusals, addressing (full subagent path; results to
the creator), and bookkeeping-only behaviour. No DSH core, engine, or other
plugin module was modified. No secrets, tokens, or credentials appear in the
code, tests, or this evidence.

## 1. What was wrong before the change (observed, not inferred)

The dispatcher existed in HEAD, so the new acceptance tests were run first
against HEAD's committed `lib/dispatcher/*` through
`.tmp/dispatcher-prefix/probe.mjs`. Output is stored verbatim in
`pre-fix-probe-2026-11-23.json`:

| probe | HEAD result | required result |
| --- | --- | --- |
| reopen an existing board through `createDispatcherSession(dir)`, create one task | `reopenTasks: 1` (the two earlier tasks were gone) | 3 tasks restored |
| create `beta`, `alpha`; stop; resume | `resumedIds: ["alpha","beta"]` | arrival order `["beta","alpha"]` |
| mark blocked, then reassign | `blockedReason: "waiting"` survived | reason cleared |
| reassign with owner `agent-9` | `ok: true` | `invalid:bad-address` |
| `start()` on `board.json` = `{not json` | did not throw, `active: true` | throw, stay inactive |

The first two are the "pending queue without loss" failure: the factory opened
an empty board and the first write replaced the persisted one, and the board
was rewritten in id order, so a restart lost both tasks and their order.

## 2. Post-fix verification

Commands were run in `.agents/worktrees/team-dispatch-v1` on 2026-11-23
(Asia/Singapore), each wrapped in `timeout 120`.

| command | result | log |
| --- | --- | --- |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 | — |
| `npx oxlint src/dispatcher test/dispatcher.spec.ts` | `0 warnings and 0 errors` | — |
| `npx vitest run test/dispatcher.spec.ts` | 21 / 21 passed (excerpt below) | — |
| `npx vitest run` (whole suite; started 08:17:24) | 85 files / 1649 tests passed, 106.66 s | tool output in the session |
| `npm run build` | exit 0 (lib/ regenerated for the changed module) | — |
| `npm run verify:lib` (post-commit) | `lib/ ... is the build of src/ ... (221 files, byte-identical)` | — |

`verify:lib` first failed in this isolated worktree because its `node_modules`
held only `.vite`; after linking the main checkout's installed dependencies
into the worktree's gitignored `node_modules`, the post-commit check passed.
That is an environment fix only — no tracked dependency file changed.

```text
✓ test/dispatcher.spec.ts (21 tests) 19ms
Test Files  1 passed (1)
     Tests  21 passed (21)
```

The full-suite run happened after all behaviour-changing edits and before a
comment-only edit to `src/dispatcher/session.ts`; the dispatcher suite was
re-run after that edit (21/21, log above). The worktree is shared with
parallel wave tasks, so other modules' uncommitted changes were present in
that run; the dispatcher result is attributable to this change.

## 3. Acceptance mapping

### 3.1 Start/stop/resume restores the pending queue without loss

- `test/dispatcher.spec.ts > dispatcher lifecycle: the pending queue survives a restart`
  - three pending tasks created out of alphabetical order survive stop/resume
    with identical arrival order (`pending()` returns `beta, alpha, gamma`),
    and `resume().pending === 3`.
  - `createDispatcherSession(dir)` attaches to an existing board instead of
    clearing it: two tasks before, one after, three restored.
  - a corrupt board throws and leaves the session inactive (fail closed).
  - a version-1 board loads (file order becomes `queueSeq`) and is upgraded to
    version 2 on the next write without reordering.
- Implementation: `session.ts` `start()`/`load()`/`resume()`; atomic write
  stays tmp+rename; `board.json` version 2 carries `queueSeq`, version 1 is
  read and migrated; `stop()` on an inactive session is a no-op so it cannot
  overwrite a board it never read.

### 3.2 Whitelist and prohibitions

- Allowed: `create` (pending only), `update-pending` (pending only),
  `reassign` (pending/blocked), `mark-blocked` (pending/blocked) —
  `test/dispatcher.spec.ts > dispatcher whitelist`.
- Refused: editing `completed` (`forbidden:completed-immutable`), editing
  `running` (`forbidden:running-immutable`), and any `verdict` write
  (`forbidden:verdict-immutable`), including `set-verdict` / `verdict` /
  `write-verdict` spellings and `patch.verdict`. Refusals change nothing on
  the board (`changes nothing when it refuses...` asserts byte-identical
  `list()`).
- Unknown operations are refused with `invalid:unknown-op`; the four names are
  the only entries in `DISPATCHER_OPS`.

### 3.3 Bookkeeping only — no execution, no judgment

- `decideRawIntent` refuses `claim`, `complete`, `fail`, `verify`, `run`,
  `execute`, `set-status`, `set-verdict`; the dispatcher has no transition
  that starts or finishes work.
- `src/dispatcher/policy.ts` imports nothing; `session.ts` imports only
  `node:fs`, `node:path`, and `./policy.js`; `dispatcher.ts` imports only
  `./policy.js`, `./session.js`. No engine, workflow, or taskboard execution
  path is reachable from the module.
- Verdict is never written: tests assert created and reassigned tasks carry
  `verdict === undefined`.

### 3.4 Addressing rules (expected output)

- `owner` must be a full subagent path (`lead/worker-1`); bare `agent-9`,
  trailing/leading `/`, `//`, spaces, uppercase, and over-long segments are
  refused with `invalid:bad-address`.
- `creator` may be the root (`lead`) or a deeper path and is recorded at
  create time; `resultRecipient(task)` returns `creator ?? owner`, so a
  reassignment moves the execution address without moving the result
  destination. Tests cover both.

## 4. Residual limitations

- The worktree's `node_modules` needed the main checkout's dependencies linked
  in (gitignored, not a repository change) before `verify:lib` could run; the
  post-commit result is recorded above.
- The dispatcher is not yet mounted behind a gate branch in `src/index.ts`;
  this task scoped the module and its tests, not the plugin wiring. The
  existing team-dispatch commit advertises the module; callers still need the
  gate branch.
- `src/taskboard/` is the team's durable store and satisfies the same
  `TaskReader` shape, but the session keeps its own synchronous `board.json`.
  Pointing the session at `TaskBoard` would make the apply path asynchronous
  and is deliberately left as a separate wiring change.
- Two sibling wave tasks were editing `CHANGELOG.md` and
  `docs/knowledge/*` in the same worktree during this task, so those shared
  files were not touched here; integration owns their entries.
