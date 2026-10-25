# Overall Roadmap — Mandatory Workflow, Per-role Models, Ordered Fallback, Settings

Last updated: 2026-10-25 — **consolidation round** (integrates the four independent
read-only reviews t2–t5 with source re-verification).

- **Baseline:** plugin source at `main` = `b231660`; DSH target = installed
  `@deepseek-ai/dsh@0.2.1-rc.2` (source checkout `687f282e`, tag `dsh-v0.2.1-rc.2`).
- **What this document is:** the whole-system plan for requirements **A** (every user
  message goes through the full workflow), **B** (per-role model selection), **C**
  (ordered per-role fallback chains), **D** (operable settings).
- **What this document is not:** authorization to change plugin code. R-005 still
  applies — implementation needs the user's explicit go-ahead.
- **Status of Phase 2 gate:** **NOT CLOSED.** Two experiments are still running and
  are inputs to the entry design: **t18** (B-1 live experiment: how the final
  assistant answer is produced) and **t19** (live verification of hypotheses
  H-1…H-5). Everything they touch is marked `PENDING(t18)` / `PENDING(t19)` in this
  document and must be finalized in the t8 revision round after the user confirms.
- **Detailed design, evidence ledger, and open questions:** [WORKFLOW-DESIGN.md](WORKFLOW-DESIGN.md).

## Status vocabulary

- `CONFIRMED` — observed in source, a real command, or a real test on this machine.
- `HYPOTHESIS` — plausible, not yet verified.
- `PENDING(t18)` / `PENDING(t19)` — an in-flight experiment owns this answer; do not
  read it as a decided design point.
- `NOT_RUN` — intentionally not executed.
- `BLOCKED` — needs an external capability or a user decision.

Every claim below carries either a `file:line`/command evidence pointer or one of
these labels. Sub-agent reports were treated as source material only; where two
reports disagreed, the ruling was made against source or test evidence and is
recorded in §17 and in DESIGN §A.

---

## 1. Confirmed product requirements

Unchanged from the user's 2026-10-25 decisions; authoritative wording lives in
[WORKFLOW-DESIGN.md](WORKFLOW-DESIGN.md) §"Confirmed requirements".

- **R-001** every user message (greeting, trivial question, follow-up, complex task)
  runs the full workflow; the main model must not decide whether to bypass it.
- **R-002** the user wants per-role model selection instead of one inherited route.
- **R-003** the user wants ordered fallback `A -> B -> C` per role, stopping at the
  first usable result.
- **R-004** the user wants operable settings, not only hand-edited YAML.
- **R-005** discussion and documentation only until implementation is authorized.

Hard consequence used throughout: **no silent fallback to ordinary direct answering**
when the workflow or all model routes fail. Failures are reported explicitly.

---

## 2. Current call chain (what exists today) — CONFIRMED

The plugin is currently a **tool + prompt suggestion**. There is no enforced entry.

| # | Layer | Component | Evidence |
|---|---|---|---|
| L0 | client input | `agent.followup()` / `agent.steer()` | `dsh-agent/lib/types/runtime-types.d.ts:192`, `:200` |
| L1 | step admission | `step()` → `inbox.claim()` → `dispatch.waterfall('agent/pre-step', …)` | `dsh-agent-loop/lib/index.js:909` (claim at `:906`) |
| L2 | plugin registration | `ctx.systemPrompt.section(...)` + `ctx.tools.register(tool)`; `inject=['tools','workflowEngine','systemPrompt']` | `src/index.ts` |
| L3 | model decides | main model reads the prompt section and the tool schema, then may or may not call `grok_workflow` | `src/index.ts` (`defineTool`) |
| L4 | tool guard | `exec.agent` required; recursion refusal (`origin==='subagent'` / `delegationDepth>0`); disposed/aborted; objective ≤ 4000; caller-task normalization; active-run cap | `src/index.ts`, `src/input.ts` |
| L5 | engine start | `ctx.workflowEngine.start({script, meta, args, parent, signal, maxTotalAgents, subagentProvider?})` | `src/index.ts`, `src/script.ts` |
| L6 | PTC guest script | globals only `agent/parallel/pipeline/phase/log/args`; `agent()` options restricted to `{label,phase,schema,provider,model}` | `dsh-workflow-ptc/lib/index.js` (`SUPPORTED_AGENT_OPTIONS`) |
| L7 | stages | Plan (planner agent) → Execute (per-task worker + verifier + bounded retry) → **Synthesize = pure JS aggregation, no `agent()` call** | `src/script.ts` |
| L8 | host report validation | `assertWorkflowReport(...)` + `redactDeep` | `src/report.ts` |
| L9 | back to model | `output.render → renderReport()` | `src/index.ts`, `src/report.ts` |

Measured gaps at `b231660` (CONFIRMED by grep, not by inference):

- `src/` contains **no** `agent/pre-step`, `agent/request`, `agent/request-error`,
  `agent/turn-stopping`, `tools/pre-execute`, or `ctx.settings` usage → A/B/C/D have
  **zero** implementation and **zero** test coverage today.
- Test suite at `b231660`: 6 spec files / 56 tests, all green, plus typecheck and lint
  clean (measured by t5). The suite covers the tool-mode contract of
  plan/execute/verify/retry/synthesize only.

---

## 3. Target architecture (four new layers)

```text
user message
   |  (turn/start -> inbox.claim -> agent/pre-step waterfall)   <-- the only unavoidable point
   v
[L-GATE]  entry gate (new): recursion pass-through, idempotency, mandatory routing
   |                \-> explicit refusal / degraded report (never a silent direct answer)
   v
[L-RUN]   one workflow run per user message (engine already exists)
   |   plan -> execute -> independent verify -> bounded retry -> synthesize (JS)
   |        role-aware model assignment (B) + ordered fallback (C)
   v
[L-ANS]   final answer production (route a / a' / b, see §5) — PENDING(t18)
   |
   v
[L-CFG]   settings + validation (D), shared single source of truth for roles, chains, limits
```

Layer ownership (nothing else changes):

- **L-GATE** — new host-side hooks module. Uses `agent/pre-step` (mandatory routing),
  `tools/pre-execute` (deny non-workflow tools while a gate is pending), scoped
  `ctx.tools.restrict` (`dsh-tools/lib/types/index.d.ts:645` — per-agent only, never
  global), `agent/turn-stopping` (`runtime-types.d.ts:387`) as a *supplement*, and
  `agent.followup()/steer()` for relay. Idempotency and diagnostics are durable
  session records, not memory counters.
- **L-RUN** — the existing engine path, extended: roles passed through
  `buildWorkflowRequest` → `args.roles` → script `agent(...,{provider,model})`; plus a
  new synthesizer `agent()` call (today's Synthesize stage has none).
- **L-ANS** — the entry-gate companion that turns a workflow result into the final
  assistant answer. Route choice is the single largest open decision (B-1).
- **L-CFG** — `src/config.ts` grows into the role/chain/limit schema; `ctx.settings`
  namespace for operability; GUI page only in a later phase (§10).

**Hard constraint:** no DSH core change. Every mechanism above is a documented
0.2.1-rc.2 extension point (§14).

---

## 4. Module responsibilities

| Module | Status | Responsibility | Explicitly not responsible for |
|---|---|---|---|
| `src/index.ts` | exists, extended | registration, `inject` list gains `agents`; tool schema unchanged for compatibility; wires gate + routing + settings | model call policy, answer text |
| `src/gate.ts` | **new** | `agent/pre-step` classification (own subagent? already handled? route), idempotency registry, `tools/pre-execute` deny, scoped restrict, turn-stopping supplement, relay via `followup/steer` | producing verified content |
| `src/router.ts` | **new** | per-role cursor & model selection at `agent/request`; classification at `agent/request-error`; ownership of the retry waterfall (`{prepend:true}`, never delegate) | plan/verify semantics |
| `src/roles.ts` | **new** | role ids (`planner`/`worker`/`verifier`/`synthesizer`), childId→role registry, `onUnknownRole` policy | config persistence |
| `src/config.ts` | exists, extended | schemastery schema for roles, chains, budgets, gate mode; hard caps; load-time validation | runtime routing decisions |
| `src/script.ts` | exists, extended | role-aware `agent()` calls, synthesizer stage, writes-path reporting for the shared-cwd mitigation, transport-vs-semantic failure separation (G-4) | model ordering/fallback (host-side) |
| `src/report.ts` | exists, extended | report validation hardening (§9 of DESIGN), deterministic failure/partial reports for fatal paths | choosing models |
| `src/records.ts` | **new** | durable `grok-workflow/route`, `grok-workflow/gate`, `grok-workflow/run` session-event augmentation + redaction | user-facing text |
| `src/redact.ts` | exists | single redaction source; today duplicated inside the generated script (must stay test-locked) | transcript-level privacy |
| `cordis.patch.yml` | exists | one bundle row; may need a second row only if a client (GUI) module is added in Phase 6 | — |

---

## 5. Message lifecycle

Per user message, target state machine (all transitions durable):

```text
M0 claimed by inbox
 -> G1 classify: own subagent / already handled / normal user message
      subagent or duplicate -> PASS (enter, untouched)
      normal -> G2
 -> G2 mandatory routing (route a/a'/b — PENDING(t18))
 -> R1 run workflow (one run per message; key = sessionId+turn+messageSeq)
 -> R2 report validated + redacted
 -> R3 final answer produced (single artefact, explicit status)
 -> R4 turn/end: completed | blocked, plus grok-workflow/run record
```

Rules that hold regardless of the B-1 route:

1. **One user message → one workflow run.** Duplicate suppression is durable
   (session event), not in-memory: an in-memory counter is reset by resume/fork and
   silently refunds budget (t4 R-1).
2. **No assistant text may be produced before the workflow result exists.** Any
   mechanism that lets the main model answer first is a bypass and is rejected.
3. **Child agents never re-enter the gate** (`origin==='subagent'` or
   `delegationDepth>0` → pass-through). Grandchildren are additionally stopped by
   `dsh-subagent` `maxDepth=1`, but that is a *volatile user setting* and is not
   counted as a guarantee (t5 §3).
4. **Failure is a first-class outcome:** explicit failure/partial report; never a
   silent direct answer (R-001).
5. **Context:** objective = the new user message + a bounded slice of prior turns
   (count/size capped, redacted). Today the objective is only the tool argument, so
   follow-ups lose all context (t2 G-2) — this must be fixed for R-001's
   "follow-up questions" clause.

### 5.1 The three candidate routes for the final answer — PENDING(t18)

All three are technically possible in 0.2.1-rc.2; they differ in *guarantee strength*.
`(a')` and `(b)` were previously reported with opposite recommendations by t1 and t3;
the ruling is in DESIGN §A-3 and rests on two source facts verified in this round:

- `agent/request` can only change `{provider, model, reasoningEffort, temperature,
  maxTokens, stop}` (`dsh-llm/lib/types/call-config.d.ts:11-26`). It **cannot** force
  `tool_choice` or a tool call, so no request-level mechanism can compel the main
  model to invoke the workflow tool.
- `agent/turn-stopping` is dispatched only after a step produced a turn end
  (`dsh-agent-loop/lib/index.js:1000-1005`), and `agent/pre-step` `reject` returns from the
  turn loop *before* that point (`:960-963`). A rejected step therefore can never be
  "recovered" by turn-stopping.

| route | mechanism | guarantee vs R-001 | user-visible artefact | known risks / unverified |
|---|---|---|---|---|
| **(a)** enter-empty + `whenIdle` + `followup` relay | `pre-step` returns `enter` with `messages: []` → turn ends `completed` with no model request (`:965-968`); plugin runs the workflow, then relays the result as a user message via `agent.followup()` (`runtime-types.d.ts:164`, `:192`) | **medium** — the first answer the main model produces is already constrained to the relayed workflow result, but the main model still writes it (paraphrase drift, possible added claims) | assistant message authored by main model | `PENDING(t18)`; relay ordering, turn accounting, and whether an idle agent can be woken reliably need measurement |
| **(a')** reject + plugin appends `assistant/message` | `pre-step` `reject` (turn ends `blocked`, `:960-963`), plugin runs the workflow, appends `user/message` (compensating B-2) and `assistant/message` `{turn,step,message,stream:[]}` with `surfaceOp:'append'` | **strongest** — the main model has no request at all in that turn; the answer is the deterministic workflow report | assistant message authored by plugin | support level **B**: no in-tree precedent, no API promise, no live stream, no usage accounting, plugin must fill a truthful provider/model; needs headless *and* Web GUI smoke (`PENDING(t18)`) |
| **(b)** redirect + three gates | `pre-step` returns `enter` with rewritten messages (workflow directive), scoped `tools.restrict(['grok_workflow'])`, `tools/pre-execute` deny, turn-stopping supplement | **weak** — the model can still emit a text-only answer at the admitted step, and turn-stopping runs after that text is already committed | assistant message authored by main model, unverified | cannot be made airtight with the available hooks (see the two facts above); usable only as a degraded/advisory mode |

**Default policy recorded here:** preference order `(a') > (a) > (b)`, with the final
choice deferred to t18's evidence plus user confirmation. Whichever route is chosen,
the *fallback ladder* if it proves unstable is: `(a')` → `(a)` → `(b)` **with an
explicitly documented downgrade of the guarantee** — never a silent downgrade.

---

## 6. Role model rules (B)

- Roles: `planner`, `worker` (executor), `verifier`, `synthesizer`. The synthesizer
  role **does not exist today** — Synthesize is pure JS (`src/script.ts`), so R-002's
  fourth role currently has zero implementation (t2 G-3). Adding a synthesizer
  `agent()` call is part of B, not an optional extra.
- Assignment path: `args.roles` → script → `agent(prompt,{provider,model})` → engine
  maps to `agentOptions` (`dsh-workflow-ptc/lib/index.js`, host mapping) → child
  inherits nothing except what is set.
- **Capability gate (hard, fail-fast at load):** the configured subagent provider must
  declare `agentOptions: true`. `spawn` and `fork` do
  (`dsh-subagent-spawn-in-process/lib/index.js:22`,
  `dsh-subagent-fork-in-process/lib/index.js:36`); the ACP provider declares `false`
  (`dsh-subagent/lib/index.js:2790`). Routing to an incapable provider must fail
  loudly at startup, never silently inherit the parent model (else R-002 appears to
  work while doing nothing).
- **Role identity is not free:** `AgentOptions` has no metadata field and
  `agent/request` payload carries no role, so the plugin must maintain its own
  `childId → role` registry and use label/phase only as display hints. Unknown role →
  policy `onUnknownRole` (default `fail-fast`).
- `effort` cannot be passed through the engine (`DEFERRED_AGENT_OPTIONS` includes
  `effort`); `reasoningEffort` on a *route* is applied at `agent/request`, and must be
  omitted (not defaulted) when a chain entry does not declare it.
- Model IDs are **never** assumed: they are validated against the configured
  provider/model catalog at load time (OQ-006).

---

## 7. Fallback decisions (C)

**Ownership (decision, needs user confirmation):** the plugin registers
`agent/request-error` with `{prepend:true}` and **never delegates** (t4 D4/P1).
Rationale: `dsh-llm-retry` registers the same event without `prepend`
(`dsh-llm-retry/lib/index.js:175`) and counts retries per `[provider, policyKey]`
while resetting per `step/start`/`turn/end`, so letting both run multiplies budgets
(worst case 3 chain entries × 5 llm-retry attempts × 2 = 30 calls per task).
Load-time self-check: if any provider's retry policy is `mode:'always'`, warn or
refuse to start (`PENDING(t19)` for the readable interface, H-1).

**Two routing layers, mutually exclusive per task:**

- **L1 task-level** — restart the child with the next chain entry's model. Used when
  the child cannot continue; loses in-child tool results.
- **L2 request-level** — live child, replace the route at `agent/request` and decide
  retry/advance at `agent/request-error`; keeps completed tool results.
- Invariant: at any moment exactly one recovery mechanism is in flight for a
  `(runId, taskId)`; L2 exhaustion writes a durable `exhausted` record that L1 reads
  before restarting.

**Chain state machine (summary):** `IDLE → PREFLIGHT → ROUTE_SELECT → ATTEMPT →
CLASSIFY`, branches `BACKOFF_SAME_MODEL`, `ADVANCE_CURSOR`, `COOLDOWN_SKIP`,
`SEMANTIC_REPAIR`, terminals `SUCCESS | PARTIAL | FAILED | ABORTED`.
Anti-runaway invariants: every retry increments exactly one of attempts/cursor; the
cursor is monotone (no revisiting a failed route); every state has a terminal exit;
accounting is durable **before** any cancellable wait; three-way guard (attempts,
cursor, deadline/token budget).

**Budgets (defaults / hard caps — user-confirmable):** chain length 3/5, attempts per
model 2/3, total transport attempts per task 6/12, semantic retries 1/3 (aligns with
the existing `maxRetries` cap), task deadline 300 s, run deadline 1.8 M s / 8.64 M s,
token budget per task 500 k/5 M, route cooldown 60 s after 3 consecutive terminal
failures of the same route. Cost note: DSH re-injects the runtime-context user message
on every attempt (`dsh-agent-loop/lib/index.js` retry loop, t4 R-3), so attempts raise
input tokens linearly — another reason to prefer advancing the cursor over retrying.

**Semantic plane is separate:** malformed structured output, "task not finished", and
verification failure never consume transport budget; they consume the semantic retry
pool and share the per-task hard attempt cap. "All routes exhausted" produces an
explicit `failed`/`partial` report — never a direct answer (D7/R-001).

---

## 8. Error classification

Route on the provider-neutral `code` only; **never parse messages**. Unknown code →
fail-closed terminal state.

| class | codes (0.2.1-rc.2) | action | budget |
|---|---|---|---|
| rate limit | `RATE_LIMIT` | same-model retry (respect `providerRetryAfterMs`) then advance | transport |
| server | `SERVER` | same-model retry then advance | transport |
| transport | `TRANSPORT` | prefer advancing across providers | transport |
| timeout | `TIMEOUT` | prefer advancing (attempt already expensive) | transport |
| model/route fatal | `NO_ADAPTER`, `INVALID_MODEL_*`, `UNKNOWN`, `PI_AI_ERROR` | no same-model retry; advance; preflight should have removed it | route-level, no attempt |
| quota | `QUOTA`, `ACCOUNT_QUOTA` | no same-model retry; advance across providers; all-quota ⇒ partial/failed | none |
| credential | `INVALID_CREDENTIAL` | terminal or cross-provider; never retry same key | none |
| context overflow | `CONTEXT_WINDOW_EXCEEDED` | larger-context route or hand to compaction | none |
| empty output | `EMPTY_RESPONSE` | one fast same-model retry, then advance | transport |
| image offload | `IMAGE_OFFLOAD_REQUIRED` | **must** delegate to the engine (`next()`), never self-retry | none |
| aborted | `ABORTED`, `signal.aborted` | immediate terminal, no retry, no charge | — |
| semantic | structure mismatch, `finish.kind==='max-tokens'`, verification fail | semantic repair / advance, distinct bookkeeping | semantic |

Two extra preflight duties: `NO_ADAPTER` is silently swallowed during request
preparation (`dsh-agent-loop/lib/index.js` prepare path), so routes must be validated
*before* they are attempted; and `max-tokens` truncation produces no failure event at
all, so it can only be caught on the semantic plane.

---

## 9. Settings system (D)

Staged, single source of truth (`src/config.ts` schema, surfaced two ways):

- **Stage 1 (required for "operable"):** profile-YAML settings with schemastery,
  `volatile()` fields so the settings controller can write them
  (`dsh-settings/lib/types/index.d.ts:80` configure, `:96` describe). Load-time
  validation: unknown role → fail; empty chain → fail; duplicate `(provider,model)`
  in a chain → fail; unknown provider/model → fail with the catalog suggestion;
  provider without `agentOptions` → fail; every cap clamped to its hard maximum.
- **Stage 2 (optional GUI):** a real page needs a `dsh.client` dual package plus
  `configForms.whileServed([ns], …)` client registration (as the in-tree settings
  pages do). **`SettingsDescriptor.autoGenerate` has no GUI consumer in 0.2.1-rc.2**
  (CONFIRMED: the flag is produced by
  `dsh-api-settings-controller/lib/index.js:277` and read only by the cordis tool
  catalog) — an external plugin therefore does *not* get a settings page for free.
  Do not promise one.
- Settings surface (draft): gate mode, per-role ordered chains, per-model attempts,
  total attempts, semantic retries, concurrency, `maxTasks`, task/run deadlines,
  token budget, cooldown, diagnostic verbosity, `onUnknownRole`.
- Secrets never live in settings; only provider/model identifiers and limits.

---

## 10. Data flow and redaction

- **Into child prompts:** task JSON only, deep-redacted (`safePromptJson`); the
  objective must also be redacted — today `planPrompt()` interpolates the raw
  objective (t5 §4 gap) and must be fixed.
- **Out of the workflow:** report → `redactDeep`; engine errors → `redactSecrets`;
  logs → `redactError`. One redaction implementation (the script-embedded mirror must
  be test-locked against `src/redact.ts`, or removed).
- **Route/attempt records:** role, ids, provider, model, cursor moves, outcome, code,
  status, delay, duration, tokens, reason, redaction version. **Never** prompt or
  response bodies, keys, `Authorization`, credential-bearing URLs, or raw provider
  request ids (hash prefix only).
- **Honest limit:** child agents are real DSH sessions; their transcripts are outside
  plugin control. Do not claim transcript-level privacy in docs.
- **Hardening:** if the configured subagent provider is `fork` (which inherits the
  parent conversation), warn or refuse — that defeats the "task JSON only" model and
  copies parent history (including possibly credentials) into every child.

---

## 11. Limits: timeout, cancellation, concurrency, recursion, cost

| dimension | mechanism | default / hard cap | notes |
|---|---|---|---|
| per-task transport attempts | router budget | 6 / 12 | shared with semantic retries |
| chain length | config | 3 / 5 | duplicates rejected |
| per-model attempts | config | 2 / 3 | context re-injection makes retries costly |
| semantic retries | script | 1 / 3 | existing `maxRetries` cap |
| concurrency | script pool ∧ engine slots | 3 / 6 | actual = min(script, engine `maxConcurrentAgents`); the two defaults must agree |
| task count | config | 6 / 12 | report validator must enforce `tasks ≤ maxTasks` (hole today) |
| total child agents | engine `maxTotalAgents` | ≤ ~4× tasks | counts only workflow `agent()` calls, **not** grandchildren |
| recursion | gate pass-through + subagent `maxDepth` | depth 1 | `maxDepth` is a volatile user setting ⇒ not a guarantee |
| task / run deadline | script timer + `AbortSignal` | 300 s / 30 min | cancellation must map to the engine signal and dispose children |
| token budget | route records + `assistant/message` usage | 500 k / 5 M per task | computed from usage, not from estimates |
| turn occupancy | gate awaits the run | bounded by run deadline | a rejected/blocked turn must still end deterministically |

Two known limit leaks to fix or document: `maxTotalAgents` does not bound
grandchildren (cost ceiling not closed), and the plugin's `mapLimit` and the engine's
slot limiter are independent (silent degradation when the engine config is lower).

---

## 12. Test strategy

Tests must prove *observable behavior on the target version*, not helpers only.

- **Layer 1 — deterministic unit (exists, extend):** role/chain ordering, cursor
  monotonicity, classification table, budget accounting, idempotency key, redaction,
  report invariants (close t5's 7 holes), config validation.
- **Layer 2 — real-contract tests:** use the real `dsh-workflow-ptc` engine with a
  fake subagent provider (no model calls) to cover `schema → structured`,
  `stopReason !== 'completed' → null`, `MaterializeError` paths, `AGENT_*` failures, and
  the new synthesizer stage. Today the engine is faked by a hand-written VM, which is
  why the real contract is untested (t5 §6).
- **Layer 3 — fault injection:** 429/5xx/timeout/connection loss, malformed structured
  output, whole chain unavailable, quota on every provider, verifier rejection,
  cancellation mid-run, deadline expiry, provider without `agentOptions`.
- **Layer 4 — live E2E on 0.2.1-rc.2 (local only; `NOT_RUN` in CI):** headless run +
  Web GUI run for the chosen answer route (both sides are mandatory for `(a')`: the
  GUI must render a settled bubble for the plugin-appended message).
- **Layer 5 — anti-bypass regression:** a suite asserting no user message yields an
  assistant answer without a validated report — including the trivial-message case.
- **Layer 6 — cost/latency measurement:** trivial message, single task, multi-task,
  and a forced-fallback run (to observe the retry-amplification guard).

Priority additions agreed from t5: criterion comparison normalization (exact `===`
matching is the most likely source of *systematic false failures*), the 7 report
semantic holes each with a negative test, dual-redaction consistency, provider
capability preflight, and shared-working-directory write-overlap detection.

---

## 13. Compatibility and version differences

Target = installed `0.2.1-rc.2` only. No claim below is derived from upstream `main`.

| capability | 0.2.1-rc.2 | evidence |
|---|---|---|
| `agent/pre-step` mandatory gate | ✅ | `dsh-agent/lib/types/runtime-types.d.ts:304-310`; dispatch `dsh-agent-loop/lib/index.js:909` |
| `reject` ⇒ turn ends `blocked`, no request | ✅ | `dsh-agent-loop/lib/index.js:960-963` |
| plugin-written `assistant/message` | ⚠️ runtime-possible, no API promise (level **B**) | `dsh-session/lib/index.js append()` has no per-role ownership guard; verified by runtime probe (t3); consumed by Web GUI fallback + headless `summarize` |
| dedicated "submit final answer" API | ❌ | absent in 0.2.1-rc.2 |
| per-child provider/model (`agentOptions`) | ✅ for `spawn`/`fork`; ❌ for ACP | spawn `:22` true, fork `:36` true, ACP `false` at `dsh-subagent/lib/index.js:2790` |
| `effort` through `agent()` | ❌ (deferred by the engine) | `SUPPORTED_AGENT_OPTIONS`/`DEFERRED_AGENT_OPTIONS` |
| per-attempt route replacement | ✅ | `dsh-agent-loop/lib/index.js:1051` loop, `:1191` `agent/request` |
| error classification codes | ✅ | `LlmFailure{code,status,providerRetryAfterMs}` + retryable-code set |
| settings namespace describe/write | ✅ | `dsh-settings/lib/types/index.d.ts:80`, `:96` |
| auto-generated settings page | ❌ | `autoGenerate` has no consumer (see §9) |
| per-child working directory | ❌ | workflow-ptc resolves one cwd per run |
| `tool_choice` forcing | ❌ | `LlmCallControls` is `{reasoningEffort,temperature,maxTokens,stop}` only |

Environment note: CI covers Node 22/24; local is Node 26.8.1. The plugin declares
`engines.dsh = 0.2.1-rc.2`; any future DSH change to session-write ownership or hook
signatures invalidates the `(a')` route and must be re-audited before upgrading.

---

## 14. Capabilities that cannot be implemented as designed — alternatives

1. **No supported "plugin writes the final answer" API** → use `(a')` with a
   documented level-B dependency, or `(a)` relay. If a future version rejects direct
   appends: fall back to `(a)`, then to `(b)` in explicit advisory mode. The downgrade
   must be visible in the settings and in the report.
2. **No per-child cwd** → per-task worktrees are impossible. Alternatives: planner
   emits `writesPaths`, host serializes or rejects overlapping tasks; parallelism
   restricted to read-only tasks; verifier serialized after write tasks.
3. **No `tool_choice`** → the workflow tool cannot be *forced* at request level; only
   `reject`-based gating guarantees the workflow actually runs.
4. **No `effort` passthrough** → per-role reasoning effort is applied only at
   `agent/request` on the surviving child, not at child creation.
5. **No automatic settings page** → YAML stage first; GUI page only with a real
   client package.
6. **No grandchild accounting** → document the cost ceiling as "per workflow `agent()`
   calls only"; optionally refuse to run when the user raises subagent `maxDepth`.
7. **Rejecting a message discards its user event** → the plugin must append a
   compensating `user/message`, otherwise the durable history is missing the user's side
   (B-2).
8. **Verifier criterion matching is byte-exact** → normalizing it is the fix; until
   then, false failures are expected and must be reported honestly rather than
   silently retried.

---

## 15. Phased plan

Phases are ordered by dependency; each needs its own explicit go-ahead.

### Phase 0 — Requirements and project rules — **DONE**
Roadmap + design log exist, user-confirmed requirements recorded separately from
proposals.

### Phase 1 — Exact-version environment audit — **DONE**
Four independent read-only reviews (t1 environment, t2 architecture, t3 API
feasibility, t5 security/tests) plus t4's fallback design, all against
installed 0.2.1-rc.2. Deliverable: requirement→capability matrix (§13) and the blocker
list in DESIGN §OQ.

### Phase 2 — Target architecture and message lifecycle — **IN PROGRESS / gate NOT closed**
Remaining work: t18 (answer route) and t19 (H-1…H-5). Exit criteria: one chosen answer
route with measured evidence from both headless and Web GUI, the three-gate design
finalized or dropped, and the failure-path table accepted by the user.

### Phase 3 — Role routing and fallback policy — **design complete, pending confirmation**
Deliverable: DESIGN §DD-3/§DD-4 (roles, identity, chain machine, classification,
budgets, records). Open: H-1 (retry-policy readability), H-4 (prepend ordering).

### Phase 4 — Settings and operability — **design complete (stage 1), stage 2 deferred**
Deliverable: config schema, validation rules, YAML examples; GUI explicitly out of the
first release.

### Phase 5 — Reliability, safety, observability — **design complete**
Deliverables: failure-path table, redaction matrix, limit table (§11), route records.

### Phase 6 — Implementation in small increments — **NOT STARTED (needs authorization)**
Suggested order: (1) settings schema + validation; (2) roles + route records;
(3) `agent/request` / `request-error` router with chain state machine;
(4) synthesizer stage; (5) entry gate (per t18 outcome); (6) Fatal-path partial
reporting (G-4); (7) report hardening; (8) redaction/context fixes; (9) optional GUI.
Every increment: focused tests, documented rollback, `lib/` regenerated.

### Phase 7 — Full-behavior testing — **NOT STARTED**
Layer 1–6 from §12, including live GUI evidence for the answer route.

### Phase 8 — Documentation, release, rollout — **NOT STARTED**
Bilingual README/architecture/config/troubleshooting updates, changelog, migration and
rollback notes, explicit statement of the added latency/cost for trivial messages.

---

## 16. Decisions that need the user (blocking or shaping)

| # | decision | options | default if silent |
|---|---|---|---|
| U-1 | final-answer route (B-1) | `(a')` / `(a)` / `(b)` or hybrid | `(a')`, dependent on t18 evidence |
| U-2 | retry ownership vs `dsh-llm-retry` | plugin-exclusive (`prepend`, never delegate) / cooperative | plugin-exclusive |
| U-3 | does the synthesizer get its own model call | yes / reuse another role | yes (needed for R-002 completeness) |
| U-4 | parallel tasks on a shared working directory | serialize writes / read-only parallelism / keep as is | serialize on overlap |
| U-5 | strict-mode latency/cost acceptance for trivial messages | accept / make the workflow lighter but not skippable | accept, as already confirmed in R-001 |
| U-6 | settings first release | YAML only / YAML + GUI | YAML only |

---

## 17. Conflict adjudications from this round (short form; details in DESIGN §A)

| conflict | reports | ruling | basis |
|---|---|---|---|
| does `ctx.settings` give an external plugin a Web GUI page automatically | t1 yes vs t3 no | **t3 wins: no** | `autoGenerate` has exactly one reader (cordis tool catalog); pages come from `whileServed` client registration |
| is "gate + redirect + tool deny" (route b) sufficient | t1/t2 recommend vs t3 says reject is the only hard guarantee | **source wins: route b is not airtight** | `agent/request` cannot force `tool_choice`; turn-stopping never runs after a reject |
| where fallback lives | t2 "host layer only" vs t4 "L1 + L2 layers" | **both: L1 (child restart) + L2 (request-level), mutually exclusive** | `agent/request` per attempt + child restart path both exist |
| is `maxTotalAgents` a real cost ceiling | t2 fine vs t5 not closed | **t5 wins: not closed** | grandchildren are not counted; `maxDepth` is user-volatile |
| does `materializeFromRealm` reject `-0` | t5 says yes | **t5 corrected: no** | realm `materialize` only rejects non-finite numbers; `-0` rejection exists only in the tools JSON-schema walker |
| 56 tests vs A/B/C coverage | — | tests are adequate for their declared scope, zero for A/B/C | grep shows no hook code in `src/`/`test/` |

---

## 18. Immediate next step

1. Wait for **t18** (answer route) and **t19** (H-1…H-5) results; absorb them in the
   **t8** revision round, replacing every `PENDING(...)` marker.
2. Have the user confirm **U-1…U-6** (§16).
3. Only then authorize Phase 6 increment 1 (settings schema + validation), which is
   independent of the answer route and unblocks roles/fallback work.

No plugin source change is authorized by this roadmap.
