# Red = "still broken now" (2026-11-22)

**Claim.** The progress tab no longer dyes a recovered task's card, the spine segment that
ran it, or the top settle bar. Red now means *a failure that nothing later in the same call
has replaced*; the failed attempt keeps its own red row mark. The longitudinal connection
lines carry no status at all.

**Why it was wrong before.** Every red mark derived from one predicate, `members.some(m =>
m.outcome === 'failed')` (`src/progress-tab.ts` `nodeState`, mirrored in
`src/client/index.js` `progressNodeState`). The engine records *attempts* as rows, so a task
that failed attempt 1 and verified on attempt 2 keeps a `failed` row forever — the card, the
segment, the bar and the wire stayed red for the rest of the run, and the wire's red also
implicated the healthy cards it pointed at.

**Rule now implemented** (both halves, `src/progress-tab.ts` §5.1 / `src/client/index.js`):

- unit = same `phase` + same role lane (`执行` / `执行（尝试 2）` fold to one lane);
- a failure is recovered when a later row *of the same unit* settled `completed`
  (`recoveredFailureSeqs` / `progressRecoveredFailures`);
- recovered rows stay in `members` (the percentage still counts them) and stay red on their
  own pill; they only stop colouring the aggregate (`currentFailureCount`);
- a retry still running, a retry that failed again, and a failure in another task are all
  still current — red stays;
- wires: no `tone`, no inline style, no dash; stroke and arrow fill are
  `--dsw-alias-border-l2`;
- settle bar: new `retried` tone (`progress.settle.retried`, `{count} 已重试` / `{count}
  retried`) so a settled-after-retry row is neither red nor called done.

## Before / after, measured

Raw output: [`red-semantics-2026-11-22.txt`](red-semantics-2026-11-22.txt) — produced by
[`red-semantics-2026-11-22-probe.mjs`](red-semantics-2026-11-22-probe.mjs), which loads the
real `src/client/index.js` the way the host does and renders both fixtures.

| Fixture | Mark | Before | After |
| --- | --- | --- | --- |
| task 2 failed attempt 1, verified on attempt 2 | task-2 card | `failed` | `done` |
| | spine `执行` segment | `failed` | `done` (green), failure badge gone, no `失败 n` copy |
| | settle bar | `1` red segment | `0` red, `ok=4 retried=1` |
| | failed attempt row pill | `failed` | `failed` (kept — this is the trace) |
| | connection line | state-coloured | neutral border token, no tone/style |
| task 2 failed both attempts | task-2 card | `failed` | `failed` |
| | spine `执行` segment | `failed` | `failed` (red dot, `data-state="failed"`) |
| | settle bar | `2` red rows | `ok=2 bad=2` |
| | failed attempt rows | `failed` | `failed` |

## Commands run

```
npx vitest run test/progress-tab.spec.ts test/progress-connector.spec.ts   # 58 passed
npx vitest run test/client.spec.ts                                         # 125 passed
node .rsi/evidence/red-semantics-2026-11-22-probe.mjs                      # table above
```

## What is NOT verified here

No live DSH UI session was driven for this change (the run that produced it was already
long-running); the evidence is the shipped bundle rendered through the same stub-React
harness `test/client.spec.ts` uses, plus the typed fold. See `docs/knowledge/VALIDATION.md`.
