# Pre-step composition: who can bypass the mandatory gate

Status: measured against the installed DSH 0.2.1-rc.2 (`dsh@0.2.1-rc.2`), plugin commit `e8bd265`.
Scope: `agent/pre-step` only. Companion evidence: `test/composition.spec.ts` (Layer 5).

## 1. How the chain decides

`agent/pre-step` is a cordis **waterfall** (`@deepseek-ai/cordis/lib/index.js:317-325`). Every
listener receives `(payload, next)` and the chain runs **outermost first**; the value returned by
the outermost listener is the decision. Two consequences decide everything below:

1. a listener that returns **without calling `next()`** vetoes the rest of the chain, built-in
   behaviour included;
2. a listener that calls `await next()` sees the inner decision and can rewrite it.

Placement: `ctx.on(event, handler)` appends; `ctx.on(event, handler, {prepend: true})` unshifts.
In-tree packages load before an external bundle, so this plugin's gate is normally registered
**last = innermost**, while `dsh-session-reference` is explicitly outermost.

## 2. In-situ listeners

Line numbers are `lib/index.js` of each installed package.

| Package | Site | What it does with the decision | Effect on this gate |
|---|---|---|---|
| `dsh-api-session-controller` (`ArchivedSessionGate`) | 2513-2519, lineage walk 2528-2540 | rejects **without** `next()` when the session or an ancestor is archived; otherwise `next()` | **starves the gate** (window W1) |
| `dsh-goal-round-driver` | 291-352, source test 32-34 | only for `source.kind === 'goal' && round > 0`; `await next()`; on `reject` ⇒ `ctx.goals.block(…,{code:'prompt-rejected'})`; on enter ⇒ forces `startsRequestSeries: true` | never applies to a user batch (W2) |
| `dsh-plan-mode` | 151-171 | `await next()`; `reject`/aborted/!pending ⇒ returns it unchanged; else appends narration | passes a reject through |
| `dsh-compaction-basic` | 839-853 | compacts the surface **before** `next()`, then returns `next()` | side effect runs even for a rejected batch (W3) |
| `dsh-agent-instructions` | 1406-1424 | `await next()`; `reject` ⇒ unchanged; empty `enter` on step 1 ⇒ unchanged; else appends | passes a reject through |
| `dsh-session-reference` | 470-479 (`prepend: true`) | `await next()`; `reject` ⇒ unchanged; else maps the batch through `prepareDirectMessages` | outermost, passes a reject through |
| `dsh-tool-skill` | 896-928, 931-… | `await next()`; `reject` ⇒ unchanged; else appends skill content / catalog | passes a reject through |
| `dsh-time-context` | 215-227 | `await next()`; `reject`/aborted ⇒ unchanged; else appends | passes a reject through |
| `dsh-tmux-context` | 2265-2281 | `await next()`; `reject`/aborted/`step !== 1` ⇒ unchanged; else appends | passes a reject through |
| `dsh-repeat-tool-reminder` | 2261-2265 | bookkeeping for user-sourced messages, then `next()` | side effect only |
| `dsh-session-checkpoint-policy` | 72-75 | `await ctx.sessions.flush()`, then `next()` | side effect only |
| `dsh-workspace` | 505-540 | no listener; documents that the archive set is what an `agent/pre-step` gate reads | reference |

Dispatchers `dsh-agent` / `dsh-agent-loop` call the waterfall; `dsh-agent-loop:917` is the only
place in the installation that **constructs** `{kind:'enter'}`. Audit command:

```sh
DSH=$(dirname "$(dirname "$(readlink -f "$(command -v dsh)")")")/node_modules/@deepseek-ai
grep -rl "agent/pre-step" "$DSH"/*/lib/index.js
# then, per file, confirm the listener calls next() before returning a decision
```

**Result of that audit (2026-04, 0.2.1-rc.2): no in-tree listener returns `enter` without calling
`next()`, and none rewrites a `reject` into an `enter`.** A model request can therefore only be
issued through the built-in behaviour, i.e. when this gate calls `next()`.

## 3. Windows

### W1 — archived session (starved) — **让权 (yield), accepted**

`ArchivedSessionGate` runs before this plugin and rejects without `next()`, so the gate never
runs: no workflow, and also **no notice** — the user sees nothing. This is co-directional (both
sides refuse) and cannot be repaired from an external plugin: the veto is upstream and silent.
Ruling: yield. Document as an explicit scope boundary ("archived sessions are read-only; no
workflow and no notice"). Regression cover: `test/composition.spec.ts` › *is starved by the
archived-session gate*.

### W2 — goal rounds — **no collision, 让权 (yield) by construction**

A goal round is `{kind:'goal', round>0}`, never `{kind:'user'}`, and the gate admits only
`source.kind === 'user'`. So the gate passes goal rounds through and the driver never sees a
rejection from us; the goal keeps its round. The `prompt-rejected` goal-block branch only fires
when *another* listener rejects a goal round, and then the observable outcome (goal blocked vs.
round swallowed) depends on whether the driver sits above or below that listener — a DSH-internal
ordering property, not this plugin's. Ruling: keep passing goal rounds (no behaviour change);
never reject a `source.kind === 'goal'` message. Regression cover: › *never rejects a goal round
itself*, › *goal-blocking depends on which listener rejects first*.

### W3 — pre-reject side effects — **accept, record**

`compaction-basic` compacts the surface before `next()` and `session-checkpoint-policy` flushes:
both happen even for a batch this gate rejects. Neither changes the decision, but a rejected
batch is *not* side-effect free, and the gate's own history read (`collectHistory`) may see a
surface that was compacted moments before. Ruling: accept; keep the gate's history read late
(it already is) and never assume the surface is untouched.

## 4. Requirements for any gate change

1. no in-tree listener may convert `reject` → `enter`: assert `next()` of the built-in behaviour
   is never reached for a rejected batch;
2. an appended context message must never appear on a rejected decision;
3. the decision must stay `reject` whether the gate is registered first or last;
4. a new in-tree listener that vetoes before the gate re-opens W1: re-run the audit command and
   extend `test/composition-listeners.ts`.

`test/composition.spec.ts` encodes all four over a real cordis `Context` with twelve vendored
listeners (nine packages) plus the plugin's real `apply()`.

## 5. Deployment: what a one-shot app does with a rejected batch (measured)

Both runs: installed `dsh@0.2.1-rc.2`, isolated `DSH_HOME`, real model
(`bifrost-completions` / `wb/cn:deepseek-v4.1-flash`), same objective, same host.

| Run | Delivery | Result |
|---|---|---|
| `headless` with this plugin (`e8bd265`) | reject, run in the background, relay the report in a new turn | **EXIT 1, no output, no child session** — `turn/end reason=blocked`, the claimed batch removed, the process exits before the run starts a single child (G-18 / F9 reproduce exactly) |
| `headless` with an in-turn probe (`/tmp/t24/probe2`, not part of this repo) | `await` the same `runWorkflow(…)` **inside** the listener, then `enter` with the report | **EXIT 0, report printed** — planner + 3 workers + verifier ran as child sessions with the real model, then the parent turn finalised the 4480-character report |

Consequence: the blocking precondition is not "keep the tree alive", it is "do not hand the run to a
turn that has already ended". Awaiting the run inside the listener keeps the step open, so the run
lives as long as the app does and no keep-alive child, sleep loop or maintenance task is needed; it
also removes the second-turn dependency that NR-1 was opened for. The trade-offs (a turn that stays
open for the whole run, and the report being the entered batch instead of a relayed follow-up) make
this a **behaviour change to be decided, not a test-only fix**; the probe is the reference
implementation.
