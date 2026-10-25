# Overall Roadmap — Mandatory Workflow, Per-role Models, Ordered Fallback, Settings

Last updated: 2026-10-25 — **revision round (t8)**, superseding the t6 consolidation.

- **Baseline:** plugin source at `main` = `d82c245`; DSH target = installed
  `@deepseek-ai/dsh@0.2.1-rc.2` (source checkout `687f282e`, tag `dsh-v0.2.1-rc.2`).
- **Inputs consumed by this revision:** t1–t5 read-only reviews, t6 consolidation,
  **t7 independent review (21 findings R-01…R-21)**, **t18 B-1 live experiment**, and
  **t19 API capability experiment (H-1…H-5)**. Every `PENDING(t18)`/`PENDING(t19)`
  marker from the t6 draft has been replaced by the measured result; the four items
  that were **not** run are listed as `NOT_RUN` in DESIGN §"NOT_RUN ledger" and are not
  used as premises anywhere.
- **Finding-by-finding disposition of t7's 21 findings is in DESIGN §C** (adopted /
  partially adopted / not adopted, with reasons and the section that changed).
- **What this document is not:** authorization to change plugin code (R-005).

## Status vocabulary

- `CONFIRMED` — observed in source, a real command, or a real test on this machine.
- `RUNTIME-VERIFIED` — measured in a real DSH run (t18/t19 probes); the strongest form
  of evidence used here, and the only kind cited as "works".
- `SOURCE-CONFIRMED` — read in the 0.2.1-rc.2 sources; behaviour follows the code but
  was not exercised end to end.
- `HYPOTHESIS` / `NOT_RUN` / `BLOCKED` — as before; `NOT_RUN` items are never premises.

---

## 1. Confirmed product requirements

Authoritative wording is in [WORKFLOW-DESIGN.md](WORKFLOW-DESIGN.md) §"Confirmed
requirements": **R-001** every user message runs the full workflow and the main model
cannot bypass it; **R-002** per-role model selection; **R-003** ordered per-role
fallback chains; **R-004** operable settings; **R-005** no code changes without
explicit authorization.

Hard consequence: **no silent fallback to ordinary direct answering** when the workflow
or all model routes fail. Failures are reported explicitly.

---

## 2. Current call chain (what exists today)

The plugin is a **tool + prompt suggestion**; there is no enforced entry.

| # | Layer | Component | Evidence |
|---|---|---|---|
| L0 | client input | `agent.followup()` / `agent.steer()` / `agent.inject()` | `dsh-agent/lib/types/runtime-types.d.ts:192`, `:200` |
| L1 | step admission | `step()` → `inbox.claim(target, turn)` → `dispatch.waterfall('agent/pre-step', …)` — dispatched on **every** step, including tool-continuation steps | `dsh-agent-loop/lib/index.js:909` (claim `:906`, inbox `claim()` at `:103-111`) |
| L2 | plugin registration | `ctx.systemPrompt.section(...)` + `ctx.tools.register(tool)`; `inject=['tools','workflowEngine','systemPrompt']` | `src/index.ts` |
| L3 | model decides | main model reads the prompt section and the tool schema, then may call `grok_workflow` | `src/index.ts` |
| L4 | tool guard | `exec.agent` required; recursion refusal (`origin==='subagent'` / `delegationDepth>0`); disposed/aborted; objective ≤ 4000; caller-task normalization; active-run cap | `src/index.ts`, `src/input.ts` |
| L5 | engine start | `ctx.workflowEngine.start({script, meta, args, parent, signal, maxTotalAgents, subagentProvider?})` | `src/index.ts`, `src/script.ts` |
| L6 | PTC guest script | globals `agent/parallel/pipeline/phase/log/args`; `agent()` accepts only `{label,phase,schema,provider,model}` | `dsh-workflow-ptc/lib/index.js` |
| L7 | stages | Plan → Execute (worker + verifier + bounded retry) → **Synthesize = pure JS aggregation, no `agent()` call** | `src/script.ts` |
| L8 | host report validation | `assertWorkflowReport(...)` + `redactDeep` | `src/report.ts` |
| L9 | back to model | `output.render → renderReport()` (≤ 8000 chars, 12 items per section) | `src/report.ts` |

Two facts about the environment that the earlier draft missed:

- **An in-tree workflow tool exists.** DSH 0.2.1-rc.2 ships `@deepseek-ai/dsh-tool-workflow`
  (default tool name `workflow`), which runs the *same* `ctx.workflowEngine` but does not
  go through this plugin's report validation or redaction. Under route (b) it must be in
  the deny/restrict list, otherwise it is a bypass channel (t7 R-17).
- **Tool-continuation steps reach the gate with an empty message batch.** `claim()`
  returns the `next-step` batch plus at most one `next-turn` message
  (`dsh-agent-loop/lib/index.js:103-111`), so a continuation step delivers
  `payload.messages === []` to every `agent/pre-step` listener. Gate logic must key on
  that, never on `decision.messages` (§5).

Current implementation gaps are registered as G-1…G-21 in DESIGN §B.

---

## 3. Target architecture

```text
user message
   |  turn/start -> inbox.claim -> agent/pre-step (only unavoidable point; every step)
   v
[L-GATE]  entry gate: pass-through rules -> mandatory routing -> reject
   |            \-> explicit refusal / degraded report (never a silent direct answer)
   v
[L-RUN]   one workflow run per user message (existing engine)
   |   plan -> execute -> independent verify -> bounded retry -> synthesize
   |        role-aware model assignment (B) + ordered fallback (C), v1 = script-level
   v
[L-ANS]   answer production: turn closes -> deliver (relay turn, or direct append)
   v
[L-CFG]   settings + load-time validation (D), one source of truth
```

- **L-GATE** — new host module using `agent/pre-step` (routing/refusal),
  `tools/pre-execute` + scoped `ctx.tools.restrict` (tool surface),
  `tools/pre-execute` deny list including the in-tree `workflow` tool, and
  `agent.followup()` after the turn closes. **Scope decision pending (U-7):** a global
  plugin row affects every agent in the process, while registering the same hooks inside
  an `AgentPreset` limits the blast radius to the sessions that join the preset
  (SOURCE-CONFIRMED: preset registry `mount/composeFrom/composedPreset`; "a preset's
  standing declaration covers every agent joined under it").
- **L-RUN** — existing engine path, extended with role→chain lookup in the script (v1)
  and a new synthesizer stage only if U-3 says so.
- **L-ANS** — one implementation path with a **strategy switch** (§5.2).
- **L-CFG** — role/chain/limit schema in `src/config.ts`, `volatile()` fields, `.get()`
  reads, settings namespace, optional client page.

**Hard constraint:** no DSH core change. All mechanisms are 0.2.1-rc.2 extension points;
their support levels are in §13.

---

## 4. Module responsibilities

| Module | Status | Responsibility | Not responsible for |
|---|---|---|---|
| `src/index.ts` | extended | registration; `inject` gains `agents`; wires gate + settings; keeps the current tool for backward compatibility | model policy, answer text |
| `src/gate.ts` | **new** | `agent/pre-step` classification and routing; idempotency scan via session plugin records; `tools/pre-execute` deny (+ in-tree `workflow` tool); scoped restrict; delivery after the turn closes | producing verified content |
| `src/answer.ts` | **new** | the strategy switch: relay turn (default) vs direct append (degraded); delivery keying and dedupe | deciding the workflow outcome |
| `src/router.ts` | **new, optional (v1.5)** | request-level routing at `agent/request` + `agent/request-error`; only if L2 is adopted (U-2) | v1 fallback (that lives in the script) |
| `src/roles.ts` | **new** | role ids, `childId → role` registry, chain selection helper, `onUnknownRole` | persistence |
| `src/config.ts` | extended | schemastery schema, `volatile()` fields, load-time validation, hard caps | runtime decisions |
| `src/script.ts` | extended | role-aware `agent()` calls, script-level chain traversal (v1 fallback), transport-vs-semantic separation, writes-path reporting | model ownership, retry policy ownership |
| `src/report.ts` | extended | report hardening (7 holes), failure reports for fatal/prepare-phase failures | model choice |
| `src/records.ts` | **new** | `appendPluginRecord` writers/readers for run/gate/route; redaction of recorded fields | user-facing text |
| `src/redact.ts` | unchanged | single redaction source (script mirror stays test-locked) | transcript privacy |
| `cordis.patch.yml` | extended | one row; a second row only if a preset-scoped variant (U-7) or a client page is chosen | — |

---

## 5. Message lifecycle

```text
M0 claimed by inbox (payload.messages = claimed batch)
 -> G0 pass-through rules (checked against payload.messages, never decision.messages)
      payload.messages.length === 0                 -> PASS (tool continuation / wake)
      any message source.kind !== 'user'            -> PASS (plugin relay, notice, …)
      own subagent (origin==='subagent' || depth>0) -> PASS
      delivery key already recorded                 -> PASS
 -> G1 mandatory routing (single path + strategy switch, §5.2)
 -> R1 one workflow run for this claimed batch
 -> R2 report validated + redacted
 -> R3 turn closes (blocked), then the answer is delivered per strategy
 -> R4 records: run/gate/route plugin records + turn/end reason
```

Non-negotiable rules:

1. **Classification uses `payload.messages` only.** `decision.messages` is contaminated by
   other listeners (G-15), so it cannot identify "a new user message".
2. **One user message → one workflow run.** The delivery key is
   `agentId + sorted(claimed message ids)`; dedupe scans `agent.session.ownEvents()` for
   a plugin record with that key (RUNTIME-VERIFIED, t18 EXP2a). Never an in-memory map:
   resume/fork/restart reset it.
3. **A run never starts on a continuation step.** Otherwise every tool round-trip starts
   another workflow (cost explosion) — the empty-batch rule above prevents it.
4. **`steer` while a run is in flight** (R-11): the message enters `next-step`, is claimed
   by the next `pre-step`, and would start a second run. v1 policy: if a run is in
   flight, **queue** the message and deliver it as a follow-up turn after the run
   completes (and say so in the answer), rather than starting a concurrent run. G-16
   (a steer issued from inside the `pre-step` listener parks forever) means the plugin
   never steers from there.
5. **Child agents never re-enter the gate**; grandchildren are additionally limited by
   `maxDepth=1`, a volatile user setting, so this is not counted as a guarantee.
6. **Failure is a first-class outcome**: explicit failure/partial report, never a silent
   direct answer.

### 5.1 Why the gate must `reject`

`{kind:'enter', messages: []}` looks like a free "swallow" primitive, because
`step()` ends the turn when the batch is empty (`dsh-agent-loop/lib/index.js:965-968`).
It is not: other `pre-step` listeners (`time-context`, `agent-instructions`, …) run
`await next()` and inject their context into **any** `enter` decision, so the batch is
non-empty, a real model request is issued with the user text already swallowed, and the
user sees an unrelated "I don't see a task" assistant reply. This was measured
(RUNTIME-VERIFIED, t18 EXP0) and is registered as **G-15**. At least eight in-tree
packages already register `agent/pre-step` listeners, so "the batch is empty" is never a
safe assumption about the final decision.

⇒ The only decision that reliably yields zero model calls is `{kind:'reject'}`
(`:960-963`; `agent-instructions` explicitly passes on that case).

### 5.2 One implementation path, one strategy switch (U-1)

**Updated by t25.** G-15 collapsed the earlier two-route design into "reject, then deliver
after the turn closed". Real headless measurement then showed that this *timing* is what
breaks a one-shot app: the tree is torn down when the turn closes, so the run aborts and the
user gets nothing (E-39). The shipped switch therefore has three values, and the default is
the one that keeps the turn open:

| strategy | turn | delivery | one-shot app |
|---|---|---|---|
| `in-turn` **default (t25)** | stays open; `pre-step` awaits the run | `enter` the step with the validated report; the main model finalises it in the same turn | **works** (E-38: exit 0, report printed) |
| `relay` | rejected, closes `blocked` | background run, then `agent.followup()` in a new turn | loses the answer (E-39: exit 1, zero output) |
| `append` | rejected, closes `blocked` | plugin appends `assistant/message` after the turn closed | loses the answer; degraded (no stream/usage, G-19/G-20) |

The steps below describe the `relay`/`append` timing (still accurate for those two).

| step | what happens | evidence |
|---|---|---|
| 1 | `pre-step` returns `{kind:'reject'}` → zero model calls, turn ends `blocked` | `:960-963` (SOURCE-CONFIRMED) |
| 2 | plugin starts the run inside the listener (parent + signal held) | RUNTIME-VERIFIED t18 EXP1d (`stopReason=completed, agentsStarted=1`) |
| 3 | run settles → plugin records the delivery key and delivers per strategy, **after the turn closed** | RUNTIME-VERIFIED t18 EXP1d/EXP2a |
| 4 | user-visible answer | strategy switch below |

| strategy | writer | strengths | weaknesses |
|---|---|---|---|
| **(a) relay turn — legacy** | main model, in a **new turn** opened by `agent.followup()` carrying the report with the plugin's own `source.kind` | real model turn: live stream, usage accounting, true provider/model metadata; GUI and headless both consume it normally; the relay message is precisely identifiable at the gate (RUNTIME-VERIFIED t18 ④); fidelity measured **exact** in the single sample taken | one extra turn of latency; relay text depends on model obedience (host cannot verify it); in a one-shot app the run is aborted when the tree tears down (G-18) |
| **(a') direct append — DEGRADED** | plugin appends `assistant/message` | no second model call; the answer is the deterministic report text | level-B undocumented path; no stream/usage; plugin must fill provider/model; **ordering race** with the loop's own step messages unless written after the turn closes (G-19, RUNTIME-VERIFIED); the turn still ends `blocked` → one-shot exit code 1 (G-20); same teardown constraint (G-18) |
| **(b) redirect + three gates — ADVISORY ONLY** | main model at the admitted step | no extra latency | not enforceable: `agent/request` cannot force `tool_choice` (E-6) and turn-stopping runs after the answer is committed (E-4); the model can answer directly and the workflow may not run at all |

**Default = `in-turn` since t25** (measured: E-38 vs E-39). `relay` (a) and `append` (a')
remain selectable and revertible through `answerStrategy`; both keep the G-18 teardown
precondition, so they are only safe in long-lived surfaces. (b) is retained only as an explicit
advisory mode with a documented downgrade of the guarantee. `U-1` keeps the final choice
with the user; the ordering above is the technical recommendation, not a user decision.

**Guarantee wording (R-15):** under (a)/(a'), "the main model cannot answer before the
workflow ran" holds **for the current composition**: any listener registered *outside*
ours can rewrite the decision (cordis waterfall semantics), so the anti-bypass assertion
belongs in the test suite against the real composed bundle, not in prose.

### 5.3 Verdict on mandatory-entry feasibility (t8 conclusion)

**VERDICT: PARTIALLY FEASIBLE — no DSH core change is required, but "the main model can
never answer without the workflow" cannot be guaranteed unconditionally with the 0.2.1-rc.2
extension points.**

*Feasible today (runtime-verified):*
1. `pre-step` sees every step and `{kind:'reject'}` yields zero model calls with the turn
   ending `blocked` (E-1/E-3/E-19).
2. A workflow run started inside that listener completes normally across the turn boundary
   **while the app is alive** (E-21).
3. The validated report can be delivered afterwards as a real model turn carrying the
   plugin's own message source, byte-identical to the report in the sample taken
   (E-22/E-23), or appended directly as a degraded path (E-8).
4. Idempotency, records and route self-checks all have runtime-verified mechanisms
   (A-13, E-28, E-29, E-30).

*Not guaranteed (boundaries that make the verdict "partially"):*
1. **Composition dependency (R-15):** any listener outside ours may rewrite the waterfall
   decision; at least eight in-tree packages register `agent/pre-step` listeners, so this is
   a real risk, not a theoretical one.
2. **One-shot app teardown (G-18/F9):** a headless run aborts the workflow when the turn
   ends `blocked`, so the strongest routes cannot be verified — or used — in CI or in any
   one-shot invocation without a keep-alive child.
3. **Relay fidelity (OQ-015/NR-2):** the host cannot verify that the main model copied the
   report faithfully; one exact-match sample is not a guarantee.
4. **Direct append (a') (G-19/G-20):** ordering races unless written after the turn closes,
   and the turn still ends `blocked` (non-zero exit).

*If the user requires an unconditional guarantee, the minimum upstream changes are (in
preference order):*
1. a supported "commit this turn's answer" API (session write ownership for
   `assistant/message`, or a documented `turn/end` outcome the plugin can set), which would
   make `(a')` a first-class route; **or**
2. a `pre-step` **final-decision lock** (a decision mode that outer listeners cannot
   rewrite), which would make `reject` airtight regardless of composition; **or**
3. a turn-outcome hook that lets a plugin end a turn with `completed` while supplying the
   answer, which would also fix G-20.

*Alternatives without touching upstream:* preset-scoped registration to shrink the
composition risk (U-7), a keep-alive child so the run survives teardown, and `(a)` relay as
the default. All three are already in this plan; none of them removes the boundary, which is
why the verdict stays "partially feasible" rather than "feasible".

---

## 6. Role model rules (B)

- Roles: `planner`, `worker` (executor), `verifier`, and — **only if U-3 says yes** —
  `synthesizer`. Today Synthesize is pure JS (`src/script.ts`), so a synthesizer role is
  a scope addition rather than a missing piece of the existing design (t7 R-20). v1
  default: keep the JS aggregation; adding a model call costs one more call per user
  message and introduces "the synthesizer may add unverified claims", which would then
  need a post-check (no claim outside `confirmed[]`). Cost/risk of both options is a
  user decision (U-3).
- Assignment: `args.roles[role].chain` → script `agent(prompt,{provider,model})` →
  engine maps to `agentOptions` → child starts on that route.
- **Capability gate (hard, fail-fast at load):** the subagent provider must declare
  `agentOptions: true`. `spawn`/`fork` do
  (`dsh-subagent-spawn-in-process/lib/index.js:22`,
  `dsh-subagent-fork-in-process/lib/index.js:36`); ACP declares `false`
  (`dsh-subagent/lib/index.js:2790`). Never silently inherit the parent model.
- **Role identity is self-managed:** `AgentOptions` has no metadata field and
  `agent/request` carries no role, so the plugin keeps `childId → role`; unknown role →
  `onUnknownRole` (`fail-fast` by default). Under v1 the script knows the role directly
  when it calls `agent()`, so the registry is only needed once L2 exists (U-2).
- `effort` cannot be passed through the engine (`DEFERRED_AGENT_OPTIONS`);
  `reasoningEffort` belongs to a route. Because a bad effort surfaces as
  `UNSUPPORTED_REASONING_EFFORT` **during request preparation** (R-14), the value must be
  validated at load time against the model catalog.
- Model IDs are validated against the configured catalog; nothing is assumed.

**Implemented configuration (phases 3–5, `src/config.ts`):**

```yaml
configVersion: 1            # a config written for a newer build is refused
roles:
  planner:    [{ provider: anthropic, model: claude-sonnet-4 }, { model: claude-haiku-4 }]
  worker:     [anthropic/claude-sonnet-4, openai/gpt-5]   # shorthand: bare model ids
  verifier:   [{ provider: openai,    model: gpt-5 }]
  synthesizer: []          # only with synthesis: model
synthesis: deterministic   # deterministic | model
switchOn: []               # [] = built-in policy; else the classes that advance a chain
recordRuns: true           # write the routing ledger into the session
recordLimit: 64            # 0…256 entries; 0 writes nothing
maxConcurrency: 3
maxRetries: 1
maxTasks: 6
timeoutMs: 1800000
maxActiveRuns: 2
enforceGate: true
answerStrategy: in-turn    # in-turn (default) | relay | append
```

Rules enforced at load: chains ≤ 3 entries, ids ≤ 120 chars, no duplicate route inside a
chain, an empty chain means "inherit the run's route" (reported as empty),
`synthesis: model` requires a `synthesizer` chain and vice versa, and
`(maxRetries+1) × (|worker|+|verifier|) ≤ 6` calls per task. Every rejection is a specific
message, and each has a negative test in `test/routing.spec.ts` or `test/config.spec.ts`.

Stage 5 adds three things a user can actually act on:

1. **Unknown keys are refused**, not dropped (`maxRetires` → "did you mean `maxRetries`?").
   A silently ignored key is indistinguishable from a setting that does not work, which is
   the one outcome a settings surface must never produce.
2. **Providers and enumerated models are checked at load** against the live runtime:
   `llm.listProviders()` for the route id, and — where the provider itself enumerates
   models in its settings section — the declared model ids. A provider that enumerates
   nothing keeps free-form ids and only produces a note; an empty registry (boot order) is
   also only a note, so a bad route fails loudly and an unknown one never blocks a load.
3. **`switchOn` makes the fallback policy inspectable**: `[]` is the built-in rule (every
   transport/model class advances the chain, content failures never do), and naming
   `verification-failed` (or any content/setup class) is refused because another model
   receives the same evidence. `recordRuns`/`recordLimit` make the ledger a choice.

---

## 7. Fallback decisions (C)

**v1 scope decision (t7 R-18, adopted).** The v1 fallback lives **entirely in the
script** (L1): `runTask` already owns a bounded retry loop and `agent()` already accepts
`{provider,model}`, so "advance to the next chain entry" is a chain lookup keyed by the
attempt index. This needs no `agent/request` listener, no `prepend` ownership, no
durable cursor, and no interaction with `dsh-llm-retry`; prepare-phase failures are caught
by the script's own `try/catch`.

| aspect | v1 (script L1) | L2 (request-level, later) |
|---|---|---|
| implementation | chain lookup in `runTask` | `agent/request` + `agent/request-error` listeners + durable cursor |
| keeps in-child tool results on switch | **no** (a switch restarts the child) | yes |
| covers prepare-phase errors | yes (script catches) | no (they escape the retry loop, R-14) |
| conflicts with `dsh-llm-retry` | none | must own the waterfall |
| status | required for Phase 3 | optional optimization; **U-2** |

**Ownership (when L2 is adopted) is not a preference.** t19 H-4 measured four
combinations: a listener registered without `{prepend:true}` is **never called** when
`dsh-llm-retry` owns recovery; `prepend` + never calling `next()` makes our listener the
outermost and produces zero `llm/retry` events, i.e. full ownership. There is no
"cooperative" middle setting, so the hard constraint is: `{prepend:true}` **and** never
delegate. `U-2` therefore stays on the user list only as "confirm that only one option
exists"; the alternative is not implementable.

**Load-time self-check:** `ctx.llm.listProviders()` then `ctx.llm.providerRetryPolicy(id)`
per provider; a provider reporting `mode:'always'` must warn or refuse to start
(RUNTIME-VERIFIED, t19 H-1).

**Budget invariants (R-12), enforced at load time:**

- `chainLength × perModelAttempts ≥ totalAttemptsPerTask` — otherwise the configured
  chain can never be exhausted within the task cap and the config is self-contradictory.
- `transportAttempts + semanticRetries ≤ totalAttemptsHard`.
- Hard caps: chain 5, per-model 3, total 12, semantic 3; defaults 3 / 2 / 6 / 1. With the
  hard values, 5 × 3 = 15 > 12, so a configuration near the cap is rejected unless the
  product of the first two is lowered — the validator must check the product, not the
  factors individually.
- Deadlines and token budgets bound the rest (§11). Every retry increments exactly one
  of attempts/cursor; accounting is durable **before** any cancellable wait (t19 H-3b:
  the first attempt has no readable history, so the cursor must be self-pushed).

**Semantic plane stays separate:** malformed structured output, `finish.kind==='max-tokens'`
(which produces no failure event at all) and verification failure never consume transport
budget; they consume the semantic pool and share the per-task hard cap.

---

## 8. Error classification

Route on the provider-neutral `code`; never parse messages. Unknown code → fail-closed
terminal state.

| class | codes (0.2.1-rc.2) | action | budget |
|---|---|---|---|
| rate limit | `RATE_LIMIT` | same-model retry (respect `providerRetryAfterMs`) then advance | transport |
| server | `SERVER` | same-model retry then advance | transport |
| transport | `TRANSPORT` | prefer advancing across providers | transport |
| timeout | `TIMEOUT` | prefer advancing | transport |
| model/route fatal | `NO_ADAPTER`, `INVALID_MODEL_*`, `UNKNOWN`, `PI_AI_ERROR` | no same-model retry; advance; preflight should have removed it | route-level, no attempt |
| reasoning effort mismatch | `UNSUPPORTED_REASONING_EFFORT` (`dsh-llm/lib/index.js:2191`, `:2195`) | route-level fatal: preflight must catch it (validate effort against the catalog); advance without consuming an attempt | route-level |
| quota | `QUOTA`, `ACCOUNT_QUOTA` | no same-model retry; advance across providers; all-quota ⇒ partial/failed | none |
| credential | `INVALID_CREDENTIAL` | terminal or cross-provider; never retry the same key | none |
| context overflow | `CONTEXT_WINDOW_EXCEEDED` | larger-context route or hand to compaction | none |
| empty output | `EMPTY_RESPONSE` | one fast same-model retry, then advance | transport |
| image offload | `IMAGE_OFFLOAD_REQUIRED` | **must** delegate to the engine, never self-retry | none |
| aborted | `ABORTED`, `signal.aborted` | immediate terminal, no retry | — |
| semantic | structure mismatch, `max-tokens`, verification fail | repair / advance on the semantic pool | semantic |

**Known limit (R-14):** `agent/request-error` is dispatched only when the stream finished
with `error`/`aborted` (`dsh-agent-loop/lib/index.js:1130-1146`). Failures raised while
preparing the request — including `UNSUPPORTED_REASONING_EFFORT` and a swallowed
`NO_ADAPTER` that only fails later — never reach a request-error listener. In v1 this is
harmless (the script catches them); when L2 is added it must be documented as "not
routable at request level".

---


### 8.1 Implemented classifier (phase 4, `src/script.ts`)

v1 classifies every child failure **inside the script**, because prepare-phase errors never
reach `agent/request-error` (E-34/R-14). The whitelist, in match order:

| class | matches | action |
|---|---|---|
| `rate-limit` | `429`, `rate limit`, `too many requests`, `quota exceeded`, `resource_exhausted` | advance chain |
| `server-error` | `5xx`, `internal server error`, `bad gateway`, `service unavailable`, `overloaded` | advance chain |
| `connection` | `ECONNRESET`, `ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`, `socket hang up`, `network error`, `fetch failed` | advance chain |
| `timeout` | `timed out`, `timeout`, `deadline exceeded`, `aborted` | advance chain |
| `model-unavailable` | `unknown model`, `no adapter`, `NO_ADAPTER`, `model not found/available` | advance chain |
| `format-error` | null structured result, `invalid json`, `schema mismatch`, `could not parse` | advance chain |
| `agent-start-failed` | fatal `AGENT_START` | advance chain |
| `task-failed` / `verification-failed` | executor reported failure / verifier verdict or criteria failed | retry the **same** route |
| `budget-exhausted`, `unknown` | `AGENT_CAP`; anything unmatched | `budget-exhausted` stops the chain (setup fault); `unknown` advances and is reported unclassified |

Fail-closed rules: a null structured result is never treated as success; an unmatched
message is `unknown` (never "probably fine"); `AGENT_CAP` and configuration faults stop the
chain **and the remaining attempts** (a definitional fault only burns budget when retried)
but are never re-thrown, so the run still produces a structured failure report (G-4, t17).
`switchOn` narrows which classes advance the chain; content and setup classes cannot be
added to it.

## 9. Settings system (D)

**Implemented (t13).** Stage 1 is the configuration layer itself; the settings page is not
hand-written, because the runtime generates it from the schema this plugin already exports.
Stage 2 (a bespoke client page) stays a later deliverable (U-6), and no display-only page
exists anywhere in this plugin.

### 9.1 Configuration layer (the operable half)

One reader — `resolveConfig()` — serves the tool, the gate and the script, so a value a user
sets is the value the run uses. Keys, defaults and hard caps:

| key | default | hard cap | rejected when |
|---|---|---|---|
| `toolName` | `grok_workflow` | `^[a-z][a-z0-9_]{1,40}$` | pattern mismatch |
| `enforceGate` / `gateRequired` | `true` / `false` | — | — |
| `gateScope` / `gatePreset` | `process` / — | — | `preset` without a preset id |
| `answerStrategy` | `in-turn` | — | not one of `in-turn`/`relay`/`append` |
| `roles.{planner,worker,verifier,synthesizer}` | `[]` (inherit) | 3 routes, 120 chars/field | empty model, duplicate route in a chain, too long |
| `synthesis` | `deterministic` | — | `model` without a synthesizer chain, or a chain without `model` |
| `switchOn` | `[]` (built-in policy) | switchable classes only | a content/setup class, an unknown class |
| `recordRuns` / `recordLimit` | `true` / `64` | `0…256` | out of range |
| `maxConcurrency` / `maxRetries` / `maxTasks` | `3` / `1` / `6` | `6` / `3` / `12` | out of range, or the per-task call budget is exceeded |
| `timeoutMs` / `maxActiveRuns` | `1800000` / `2` | `86400000` / `4` | out of range |
| `historyTurns` / `historyChars` / `maxQueuedMessages` | `4` / `4000` / `4` | `20` / `8000` / `8` | out of range |
| `configVersion` | `1` | `1…1` | a config written for a newer build |
| unknown key | — | — | always, with the closest accepted key named |

Model and provider existence is checked at load against the live runtime, and the check
degrades to a note — never a false failure — when the runtime cannot judge it (no `llm`
service, an unsettled provider registry, or a provider that enumerates no models).

### 9.2 Settings surface (why there is no page in this repo)

`ctx.settings` (`SettingsForms`) projects **every Loader entry's own `Config` schema** into a
form: `describe()` returns `{ ns: entry.options.id, schema, value, base, user, revision,
applies: 'live', autoGenerate, secrets? }`, `autoGenerate` defaults to `true`
(`presentations.get(fiber)?.auto ?? true`), writes go through `update` / `replace` /
`mutate` with an optional `expectedRevision` (`SETTINGS_CONFLICT` on a stale form), and edits
land in the profile patch (`writable`, `documentPath`, `prepareDocument()`). Path operations
(`set`/`unset` by path) exist exactly so a nested field can be edited without restating
redacted secrets.

Consequences, in the order they matter:

1. **The page exists as soon as the schema does.** This plugin exports `Config`, and
   `src/settings.ts` calls `ctx.settings.configure({ auto: true })` to declare intent, so
   the Web client can render and **live-apply** the same fields the run reads. There is
   nothing to fake, and nothing decorative to drift.
2. **What we do not have is a chain editor with model dropdowns.** The generated form is
   schema-shaped: `roles` renders as an array of small route forms. A dropdown needs the
   provider catalogue client-side plus a match against the model list, i.e. a client half
   (`"dsh": { "client": { "platform": "web" } }` + an `exports['./client']` entry, the way
   `dsh-client-ui-settings-plugins` ships its section). That is U-6, and it is a UI
   deliverable, not a capability gap: every field is already editable.
3. **Volatility remains an open item.** `SettingsForms` reports `applies: 'live'` for every
   entry, but "live" for a *remount-sensitive* field still needs the `volatile()` shape and
   `.get()` reads of DD-9 items 1–2; today `resolveConfig()` snapshots at `apply()`, so a
   value edit is picked up by the next run, not by an in-flight one. That sentence is the
   honest limit of the current implementation.
4. **Not measured (NOT_RUN):** whether the stock Web form renders our `roles` array
   acceptably in a browser, and whether a mid-run edit is visible to a queued message.
   Both need the Web GUI with this plugin loaded; the headless evidence cannot answer them.

## 10. Data flow and redaction

- **Into prompts:** task JSON + bounded history, deep-redacted; the objective must be
  redacted too (today `planPrompt()` interpolates it raw).
- **Out:** report → `redactDeep`; engine errors → `redactSecrets`; logs → `redactError`;
  one redaction implementation, the script mirror test-locked against `src/redact.ts`.
- **Records:** written with `appendPluginRecord(session, 'plugin:grok-workflow/…', data)`
  and read back with `pluginRecordOf` (RUNTIME-VERIFIED, t19 H-2: no runtime gate, records
  are `ignorable: true`, survive fork/resume, never enter the model-visible surface).
  This replaces the earlier `SessionEventMap` augmentation plan. **Support level:**
  experimental API, "best-effort preserved" across session-format migrations — do not
  describe it as plain "durable".
- Recorded fields: run/gate/route identifiers, role, provider, model, attempt and cursor
  indices, outcome, failure code/status, delay, duration, token counts, reason,
  redaction version. Never prompt/response text, keys, `Authorization`, credential-bearing
  URLs, or raw provider request ids (hash prefix only).
- **Honest limits:** child transcripts are real DSH sessions outside plugin control; and
  a `fork` provider inherits the parent conversation, which defeats "task JSON only" —
  warn or refuse.

---

## 11. Limits: timeout, cancellation, concurrency, recursion, cost

| dimension | mechanism | default / hard cap | notes |
|---|---|---|---|
| per-task attempts | script chain traversal + retry loop | 6 / 12 | transport and semantic share this cap; see the §7 invariants |
| chain length | config | 3 / 5 | duplicates rejected |
| per-model attempts | config | 2 / 3 | retries are expensive (context re-injection) |
| semantic retries | script | 1 / 3 | existing `maxRetries` cap |
| concurrency | script pool ∧ engine slots | 3 / 6 | **effective = min(script pool, engine slots)**: `maxConcurrentAgents` is engine deployment config (default `min(16, cores-2)`), not settable by the plugin, so the plugin can only tighten. Read the effective value for diagnostics; do not assume the two are equal (R-13) |
| task count | config | 6 / 12 | the report validator must enforce `tasks ≤ maxTasks` (hole today) |
| total child agents | engine `maxTotalAgents` = `1 + tasks·(retries+1)·2 + 2` (`src/script.ts:689-691`) | derived | ≈ 4·tasks **only** when `retries = 1`; with `retries = 3` it is `8·tasks + 3`. Counts only workflow `agent()` calls, not grandchildren |
| recursion | gate pass-through + subagent `maxDepth` | depth 1 | `maxDepth` is user-volatile ⇒ not a guarantee |
| task deadline | script timer + `AbortSignal` | 300 000 ms | cancellation maps to the engine signal and disposes children |
| run deadline | `timeoutMs` | 1 800 000 ms / hard 86 400 000 ms (`src/config.ts:10`, `:21`) | 30 min default, 24 h hard |
| token budget | record + `assistant/message` usage | 500 k / 5 M per task (proposal) | computed from usage, not estimates |
| turn occupancy | gate holds the listener | bounded by the run deadline | a rejected turn must still end deterministically |

Known leaks: `maxTotalAgents` does not count grandchildren; a switch under L1 discards
in-child tool results; and a steer during a run is queued (§5 rule 4) rather than run
concurrently.

---

## 12. Test strategy

Layer 4 needs a real model, so it cannot run in CI. `scripts/e2e-headless-in-turn.sh` runs
one real `dsh headless` turn with the plugin overlaid by file URL and asserts that the report
reaches the user (exit 0 + report marker). It is the check that caught G-18/F9 and is the
regression guard for `answerStrategy`; the in-turn *timing* itself is covered in CI by the
`in-turn delivery` suite in `test/gate.spec.ts` (the listener must not settle before the run,
must not open a follow-up turn, and must resolve on abort/deadline/unload).

- **Layer 1 — deterministic unit:** role/chain ordering, cursor monotonicity, the
  classification table, budget accounting (including the R-12 invariants and their
  negative cases), the delivery key, config fail-fast (empty chain, missing role,
  duplicate entry, cap overflow, bad effort), report invariants, redaction.
- **Layer 2 — real-contract tests:** the real `dsh-workflow-ptc` engine with a fake
  subagent provider (no model calls): `schema → structured`, `stopReason !== 'completed'
  → null`, materialize failures, `AGENT_*` paths, the new synthesizer stage if adopted.
- **Layer 3 — fault injection:** 429/5xx/timeout/connection loss, malformed structured
  output, whole chain unavailable, quota on every provider, verifier rejection,
  cancellation, deadline, provider without `agentOptions`, unsupported reasoning effort.
- **Layer 4 — live E2E on 0.2.1-rc.2 (local only; `NOT_RUN` in CI):** one headless run and
  one Web GUI run per adopted answer strategy.
- **Layer 5 — anti-bypass regression:** assertions against the **composed bundle**
  (which already contains ≥8 in-tree `agent/pre-step` listeners), not against our listener
  in isolation: (i) a normal user message still reaches the gate and
  is rejected, (ii) a tool-continuation step does **not** start a run, (iii) a plugin relay
  message (own `source.kind`) passes through, (iv) no assistant text exists before a
  validated report.
- **Layer 6 — cost/latency:** trivial message, single task, multi-task, forced-fallback
  run, and one run under `(a)` vs `(a')` to measure the extra turn.

Priority additions from t5/t7: criterion normalization (landed in `023887d`), the report
semantic holes with negative tests, dual-redaction consistency, provider capability
preflight, shared-directory write-overlap detection.

---

## 13. Compatibility and version differences

Target = installed `0.2.1-rc.2` only.

| capability | status in 0.2.1-rc.2 | evidence |
|---|---|---|
| `agent/pre-step` gate, every step | ✅ CONFIRMED | `dsh-agent/lib/types/runtime-types.d.ts:304-310`; `dsh-agent-loop/lib/index.js:909` |
| `{kind:'reject'}` ⇒ zero model calls, turn `blocked` | ✅ RUNTIME-VERIFIED | `:960-963`; t18 EXP1c/EXP3c |
| `{kind:'enter', messages:[]}` ⇒ zero model calls | ❌ **false** (composition-dependent) | t18 EXP0; G-15 |
| plugin-written `assistant/message` | ⚠️ level **B**, ordering race | t18 EXP2a; G-19/G-20 |
| in-turn relay via `followup` after the turn closes | ✅ RUNTIME-VERIFIED (exact fidelity, 1 sample) | t18 EXP1d |
| custom `MessageSourceMap` kind for idempotency | ✅ RUNTIME-VERIFIED | t18 EXP1d (persisted, visible in `pre-step`) |
| `appendPluginRecord` / `pluginRecordOf` | ✅ RUNTIME-VERIFIED, experimental API, no gate | t19 H-2 |
| `ctx.llm.providerRetryPolicy(id)` | ✅ RUNTIME-VERIFIED | t19 H-1 |
| `prepend` precedence over `dsh-llm-retry` | ✅ RUNTIME-VERIFIED (4 combinations) | t19 H-4 |
| settings dict→array→object config layer | ✅ RUNTIME-VERIFIED | t19 H-5 |
| generic settings form for nested chains | ❌ FAIL — custom page required | t19 H-5 |
| automatic settings page from `autoGenerate` | ❌ no consumer | E-11 |
| per-child provider/model (`agentOptions`) | ✅ spawn/fork; ❌ ACP | `dsh-subagent/lib/index.js:2790` |
| `effort` through `agent()` | ❌ deferred by the engine | `DEFERRED_AGENT_OPTIONS` |
| forcing `tool_choice` / a tool call | ❌ (`LlmCallControls` has no such field) | `dsh-llm/lib/types/call-config.d.ts:11-26` |
| per-child working directory | ❌ one cwd per run | E-16 |
| preset-scoped hook registration | ✅ SOURCE-CONFIRMED (not exercised) | preset registry |
| in-tree `@deepseek-ai/dsh-tool-workflow` (tool `workflow`) | present, bypasses this plugin's validation | t7 R-17 |

Environment: CI covers Node 22/24; local is Node 26.8.1. `engines.dsh = 0.2.1-rc.2`.
Upstream changes to session-write ownership, `plugin:` record retention, or preset
composition invalidate parts of this design and must be re-audited before upgrading.

---

## 14. Capabilities that cannot be implemented as designed — alternatives

1. **No supported "plugin writes the final answer" API** → default the relay turn `(a)`;
   keep direct append `(a')` as a documented level-B switch with G-19/G-20 consequences.
2. **No `tool_choice`** → the workflow cannot be *forced* to run by request-level means;
   only `reject` guarantees it (route (b) stays advisory).
3. **One-shot apps tear down after a blocked turn** (G-18) → (a)/(a') need a live tree
   while the run finishes: a keep-alive child run, or a long-lived app (Web GUI). This is
   a hard precondition for headless/CI verification and is `NOT_RUN` for the web profile.
4. **No per-child cwd** → per-task worktrees are impossible; the planner emits
   `writesPaths`, the host serializes or rejects overlapping write tasks, and parallelism
   is limited to read-only tasks.
5. **No automatic settings page, no generic nested form** → YAML first; a custom page with
   path operations later.
6. **No `effort` passthrough** → per-route effort is applied at `agent/request` only (L2);
   under v1 it is a per-chain-entry hint validated against the catalog.
7. **Request-preparation failures are not routable** (R-14) → v1 relies on the script's own
   error handling; L2 must document the gap.
8. **`maxTotalAgents` does not bound grandchildren** → document the ceiling as "workflow
   `agent()` calls only".
9. **A rejected message's inbox entry is consumed irreversibly** (claim has no
   `discardRemoved`; `inbox.js:103-111`) → the plugin must carry the original text itself.

---

## 15. Failure-path table

Every row must state who answers and how the turn ends, otherwise the path is undefined.

| # | path / trigger | who produces the answer | turn ends | records | R-001 impact |
|---|---|---|---|---|---|
| F1 | normal run, report `completed` | relay turn `(a)` or append `(a')` | `blocked` (gate) then a normal turn `(a)` | run + gate | satisfied |
| F2 | run `partial` | same, text states verified vs incomplete | as above | run + gate | satisfied (no false success) |
| F3 | all routes exhausted | explicit failure/partial report as the answer | as above | run + route | satisfied, never a direct answer |
| F4 | report validation fails (`assertWorkflowReport` throws) | host builds a `failureReport`-grade answer with the validation cause | `blocked` + delivery | gate + error record | satisfied |
| F5 | engine `stopReason:'error'` (G-4) used to lose all partial evidence | per-task failure rows + category in the report, never a bare exception | `blocked` + delivery | gate + error record | **resolved (t17)**: see DESIGN DD-6 |
| F6 | `pre-step` listener throws | there is no answer; the turn ends `error` | `error` | gate record (best effort) | violation — must be prevented by making the listener total (catch-all) |
| F7 | deadline / cancellation | deadline: failure answer; user cancel: no answer | `aborted` | run | cancel is user-initiated, acceptable |
| F8 | prepare-phase failure (R-14 codes) | script catches → task-level failure → partial/failed answer | `blocked` + delivery | route/attempt | satisfied under v1 |
| F9 | one-shot app teardown (G-18) | none — run aborted | `blocked`, exit 1 (G-20) | gate only | **BLOCKED**: needs keep-alive or a long-lived app |
| F10 | steer during a run | queued; answer for the current message, then a follow-up turn | normal | run + gate | satisfied by the §5 rule 4 |
| F11 | client retries the same message | delivery key suppresses the second run | normal | gate (dedupe) | satisfied |
| F12 | recursion (child → workflow) | child is told the workflow is unavailable | child turn | none | satisfied |

F6 and F9 are the two rows that are **not** currently satisfiable and are carried as
blocking work (see §16 Phase gates and DESIGN §B).

---

## 16. Phased plan (re-ordered after t7 R-18 and the t18/t19 results)

Each phase needs its own explicit go-ahead. The re-order is a consequence of adopting the
script-level v1 fallback and the merged answer path.

- **Phase 0 — requirements and rules — DONE.**
- **Phase 1 — exact-version audit — DONE** (t1–t5, t18, t19; capability matrix §13).
- **Phase 2 — architecture and message lifecycle — DESIGN COMPLETE, awaits U-1/U-7.**
  Exit: answer strategy chosen by the user, gate scope chosen, F6/F9 addressed.
- **Phase 3 — settings and configuration — IMPLEMENTED (t11 + t13, with Phase 4).**
  Shipped: `roles.{planner,worker,verifier,synthesizer}` chains, `synthesis` switch,
  `gateRequired`, plus load-time validation (empty chain, duplicate route, chain longer than
  3, oversized ids, per-task budget overflow) each with a negative test. t13 completed the
  layer: `switchOn` (inspectable switching policy), `recordRuns`/`recordLimit` (the run
  ledger as a choice), `configVersion` + unknown-key rejection + route shorthand migration,
  **provider/model existence checked against the live runtime** (`llm.listProviders`, the
  provider's own enumerated models), and the settings surface declared through
  `ctx.settings.configure({ auto: true })` — the page is generated from this plugin's
  `Config`, so §9.2 ships no page of its own. 17 tests in `test/config.spec.ts`.
- **Phase 4 — role models and v1 script-level fallback — IMPLEMENTED (t11).**
  Shipped: `callRole` in the generated script (one try per chain entry, inside the existing
  attempt loop), the failure whitelist + fail-closed `unknown`, the advance-vs-retry rule,
  the chain-derived `maxTotalAgents`, the redacted `plugin:grok-workflow/routing` ledger, and
  22 tests in `test/routing.spec.ts`. Exit criteria met in simulation; real-provider switching
  is NR-6.
- **Phase 3 (old scope, superseded).**
  Schema, `volatile()` + `.get()` plumbing, load-time validation with negative tests.
  Exit: a YAML configuration can express roles/chains/limits and every invalid config is
  rejected with a specific message.
- **Phase 4 (old scope, superseded).** Role chains passed to the script, chain traversal in
  `runTask`, transport-vs-semantic separation, records.
- **Phase 5 — mandatory entry (A) — IMPLEMENTED (t9/t25).** Gate + delivery shipped; F9 is
  closed for one-shot apps by the `in-turn` default (E-38/E-39), and the F6 totality rule is
  covered by injected-throw tests and the composed-waterfall suites.
  Exit: Layer-5 anti-bypass assertions pass against the composed bundle; headless and
  (where available) Web GUI evidence recorded.
- **Phase 6 — L2 request-level routing (optional, U-2).** Only if the loss of in-child
  tool results proves unacceptable. Requires `prepend` ownership + durable self-pushed
  cursor + the R-14 caveat.
- **Phase 7 — reliability work — G-4 DONE (t17).** The fatal policy moved into the plugin:
  infrastructure failures are classified, never rethrown, and every failure carries a
  category (`infrastructure` / `quality` / `configuration` / `unknown`) so the report cannot
  confuse a dead provider with work that fell short (DESIGN DD-6). Remaining: report
  hardening follow-ups, redaction/context fixes.
  Exit: F4/F5 produce failure answers; the seven report holes each have a negative test.
- **Phase 8 — synthesizer role (optional, U-3)** with its post-check rule.
- **Phase 9 — settings GUI page (optional, after Phase 3; the generated page already ships).**
  A bespoke chain editor with model dropdowns would use `ctx.settings.mutate`/path operations
  and ship a client half (`package.json` `dsh.client` + `exports['./client']`). See §9.2 and
  U-6; nothing blocks it, and nothing is faked while it is missing.
- **Phase 10 — documentation, release, rollout** (bilingual, changelog, migration,
  rollback, explicit statement of the added latency/cost).

---

## 17. Decisions awaiting the user

| # | decision | options | recorded recommendation |
|---|---|---|---|
| U-1 | answer strategy | `in-turn` (keep the turn open) / `relay` / `append` / advisory | **`in-turn`, now the default** (t25: only strategy a one-shot app survives, E-38/E-39); `relay`/`append` stay selectable for long-lived surfaces |
| U-2 | request-level routing ownership (only if L2 is adopted) | plugin-exclusive `prepend` + never delegate / none | plugin-exclusive — the cooperative option does not exist mechanically (t19 H-4); item kept for confirmation |
| U-3 | dedicated synthesizer model call | yes / no (v1 keeps pure JS) | **no for v1**, revisit after cost measurement |
| U-4 | parallel tasks on a shared working directory | serialize writes / read-only parallelism / as-is | serialize on overlap |
| U-5 | accept strict-mode latency and cost for trivial messages | accept / lighter but not skippable | accept (already confirmed in R-001) |
| U-6 | first-release settings surface | generated page (ships free from the schema) / generated page + bespoke chain editor with model dropdowns | generated page; the bespoke editor is Phase 9 |
| U-7 | enforcement scope | whole process (plugin row) / preset-scoped sessions | preset-scoped if available in the deployment, else whole process with a documented blast radius |
| U-8 | which message sources the gate polices (t10 V-3) | `source.kind='user'` only (v1) / also `user-question-reply`, `team-message`, `webhook`, `schedule` | keep `user` only; the others are machine-produced and have no presenter to fail closed to |

---

## 18. Adjudications recorded in this round

| conflict | reports | ruling | basis |
|---|---|---|---|
| does `ctx.settings` give an automatic GUI page | t1 yes vs t3 no | **no** | `autoGenerate` has a single consumer (cordis tool catalog) |
| is "gate + redirect + tool deny" sufficient | t1/t2 yes vs t3 no | **no** — advisory only | no `toolChoice`; turn-stopping runs after the answer |
| is `enter-empty` a zero-cost swallow | t2 (implied) vs t7/t18 no | **no** — composition-dependent, still one model request | t18 EXP0 (G-15) |
| which answer strategy is the default | t6 `(a') > (a)` vs t18 `(a)` | **(a)**, per t18 | level-B limits, G-19/G-20 |
| is retry ownership a user choice | t4/t6 "choice" vs t19 "hard" | **hard constraint**, item kept for confirmation | t19 H-4 four-combination matrix |
| durable records mechanism | t6 `SessionEventMap` vs t19 `appendPluginRecord` | **`appendPluginRecord`** | t19 H-2 |
| does an `enter` override lose runtime-context | t6 yes vs source no | **no** — context is appended at the end of the step | `dsh-agent-loop/lib/index.js:1066-1073` |
| is `maxTotalAgents` a closed ceiling | t2 yes vs t5 no | **no** | grandchildren uncounted, `maxDepth` volatile |
| does `materializeFromRealm` reject `-0` | t5 yes vs source no | **no** | realm materializer only rejects non-finite numbers |
| where should fallback live in v1 | t4/t6 "L1+L2" vs t7 "v1 = L1 only" | **v1 = script L1**, L2 optional later | implementation cost/risk comparison (§7) |

---

## 19. Immediate next step

1. User confirms **U-1 … U-7** (§17).
2. Then Phase 3 (settings + validation) starts, because it no longer depends on routing.
3. F6 (gate listener totality) and F9 (one-shot teardown) are carried into Phase 5 as
   explicit preconditions; the web long-lived case stays `NOT_RUN` until measured.

No plugin source change is authorized by this roadmap.
