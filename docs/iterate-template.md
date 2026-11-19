# Self-iteration template — the prompt the `RSI heartbeat` carries

Status: **since 0.12.1**. This is the shipped default of `iterateTemplate`
(`src/config.ts` `DEFAULT_ITERATE_TEMPLATE`), the prompt stored verbatim in the
`RSI heartbeat` Schedule task that the composer's *Self-iterate* switch arms.

It is one text with three readers, and the test suite keeps them equal:

- `src/config.ts` — the schema default and the whitespace fallback;
- `src/client/index.js` — the hand-written settings bundle's copy of the same
  default, pinned byte-identical by `test/client.spec.ts`;
- `test/iterate-template.spec.ts` — parses the fenced block below and asserts it
  equals `DEFAULT_ITERATE_TEMPLATE`, so this file cannot drift from the code.

The operator edits the template on the settings page; the stored text is what the
next open writes into the task. A whitespace-only template falls back to this
default, and the text is capped at 4000 characters
(`MAX_LOOP_PROMPT_CHARS`, `src/loop.ts`).

## What the template must cover

A self-iteration round is only useful if the prompt states the rules the round is
judged by. This default therefore carries, in order:

| requirement | where it appears |
| --- | --- |
| two topic sources, POOL first | *Pick the topic* — `.rsi/POOL.md` first, then TODO/FAIL rows, GitHub issues, research notes/papers |
| at least one item per round | *Pick the topic* — a round that lands nothing is a STOP |
| small fix needs no research; big change needs RESEARCH | *Size the change* — plus "never cite a paper you did not read" |
| big change needs POOL approval | *Size the change* — approval recorded in `.rsi/POOL.md` before implementation |
| R1–R6 execution | *Execute R1–R6* — the protocol's six steps, named |
| triple review | *Triple review* — self-review, `npm run ci` + `npm run verify:lib`, copied-profile live run |
| four brakes | *Four brakes* — stop marker, unclosed round/dirty tree, two empty rounds, budget spent |
| forbidden zones | *Forbidden zones* — credentials, force-push/tag moves, DSH core and other profiles, weakened checks, unauthorized publishing |

## Template

Everything between the markers is the prompt. Lines outside them are documentation.

<!-- iterate-template:start -->
# RSI heartbeat — self-iteration round

Delivered by an Automation task (source.kind = "schedule"), not by the operator.
Nobody answers inside this turn: do not ask, do not wait for approval. Decide,
do one bounded round, record it, end the turn.

## Pick the topic (two sources, POOL first)

1. POOL first: read `.rsi/POOL.md` and take the highest-priority item that is not
   DONE. Its anchors are the requirement; do not re-derive what it already names.
2. Only when the POOL has nothing actionable, fall through in this order: open
   TODO and FAIL rows in `.rsi/STATE.md` and `.rsi/LOG.md`, then open GitHub
   issues, then research notes or papers that name a defect in this repository.

At least one item lands per round. A round that lands nothing is a STOP, not an
empty round: say why and end.

## Size the change before starting

- Small fix (one file, no public surface, no behavior change): implement it
  directly. No research round, no new document.
- Big change (new feature, cross-file behavior, public surface, or anything the
  POOL has not approved): first record a RESEARCH entry in
  `docs/knowledge/RESEARCH.md` with measured facts and file anchors, and get the
  item approved in `.rsi/POOL.md`. Without that approval it is not this round's
  work.
- Never cite a paper, benchmark, issue or upstream commit you did not read. No
  invented references, no invented numbers; an unverified claim is HYPOTHESIS.

## Execute R1–R6

R1 read AGENTS.md, PROTOCOL, STATE, LOG, HANDOFF and CHANGELOG.
R2 update the pool, then pick exactly one theme by its priority order.
R3 implement only that theme.
R4 self-test: the change fails before and passes after; no test is weakened.
R5 write the round report in `.rsi/ROUND.md` with evidence paths and NOT_RUN items.
R6 do not commit, tag or publish on your own; the operator's release path does.

## Triple review before calling the round done

1. Self-review the diff against the round's theme: nothing unrelated, no secret,
   no new runtime dependency without a recorded reason.
2. `npm run ci` green and `npm run verify:lib` byte-identical.
3. A live check on a copied profile (never the operator's profile), transcript
   saved under `.rsi/evidence/round-NNN/` with credentials redacted.

A review that cannot run is recorded as NOT_RUN with the reason. Never claim a
live result that was not observed.

## Four brakes (stop, do not negotiate)

1. `.rsi/STOP` exists: stop, open nothing.
2. The previous round is unclosed, or tracked files are dirty: do not open a new
   round; say what is unclosed in one or two sentences and end the turn.
3. Two consecutive rounds landed nothing: stop and report.
4. The day's round or token budget is spent: stop; the next heartbeat decides again.

## Forbidden zones

- No API keys, tokens, cookies, passwords or private keys in source, tests, docs,
  commits, logs or evidence; redact before saving.
- No force-push, no moving or overwriting a published tag, no rewriting shared
  history.
- No changes to the DSH core repository or to another profile: this repository only.
- No weakening of tests, CI or release checks to make a round pass.
- No npm publish, release or repository-visibility change without explicit
  authorization.
<!-- iterate-template:end -->
