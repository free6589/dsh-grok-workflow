# RSI heartbeat (constant arm prompt)

This file is the prompt one arm stores. It is deliberately **round-agnostic**: the same bytes
open every round of the budget, and the guard derives the round number inside the delivered turn
(`heartbeat-guard.sh --round auto`). That is why it is short enough for the plugin's own
`MAX_LOOP_PROMPT_CHARS` bound (4000) — the operator's Automation task and the composer's
Self-iterate switch can both arm it, and neither has to be re-edited every round.

`.rsi/tools/iterate-plan.mjs --arm-spec` prints this file's size against that bound.

<!-- arm-prompt:start -->
# RSI heartbeat

This message was delivered by a schedule (`source.kind = "schedule"`), not by the operator.
Nobody will answer inside this turn: do not ask questions, do not wait for approval, decide and
record. Work in `dsh-grok-workflow` only.

## Step 0 — guard first

    .rsi/tools/heartbeat-guard.sh --round auto --max-rounds 1000 --record

`--round auto` derives the round from the repository's own records (`.rsi/ROUND.md`, `.rsi/ledger.jsonl`),
`--max-rounds 1000` is the budget. The **first word** decides this turn:

- `RESUME` — the previous round is closed. Continue.
- `SKIP` — a round is still open (the guard names the signal). Open no round, pick no theme, edit
  nothing, commit nothing; say in two sentences what is unclosed and end the turn.
- `STOP` — open no round. Print the stop summary from `.rsi/HEARTBEAT.md` step 5 and end.

## Steps 1–5 — follow `.rsi/HEARTBEAT.md`

Read that file now; it is the contract for this turn (reconcile STATE/LOG/HANDOFF against the tree,
one theme only, `.rsi/PROTOCOL.md` steps 1–6, then the round report). In short:

1. Reconcile `.rsi/STATE.md`, `.rsi/LOG.md` and the newest `docs/knowledge/HANDOFF.md` against
   `git log --oneline -5` and `git status --short --branch`. A record that contradicts the tree is a
   finding, not an order.
2. Exactly one theme: the open `.rsi/POOL.md` item that
   `node .rsi/tools/iterate-plan.mjs --pool` names as `top_next`. Never re-rank the file.
3. Code plus a test in the same round: the test fails on the old source and passes on the new one.
   Verify independently — the round's own report is a claim, not evidence.
4. `npm run ci` must exit 0 (`verify:lib` included; rebuild `lib/` when `src/` changed).
5. Record the round in `.rsi/ROUND.md` **and** `.rsi/ledger.jsonl` before you end the turn. A round
   counts when it is recorded; both files are what the guard and the plan read.

## Boundaries

- No in-process loop, no nested workflow, no second theme. One delivery is one round.
- Do not arm, extend or delete the heartbeat row: `.rsi/tools/iterate-plan.mjs --arm-spec` prints
  the one call, and arming stays the operator's (`D-066`, `D-093`).
- Concurrency default 10 / hard max 100; retries default 1 / hard max 3 (`AGENTS.md`).
- Never write a secret into a record; `NOT_RUN` where nothing was executed.
<!-- arm-prompt:end -->
