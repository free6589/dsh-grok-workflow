# Workflow Design Discussion Log

Last updated: 2026-10-25 — **consolidation round**.
Baseline: plugin source at `main` = `b231660`; DSH target = installed
`@deepseek-ai/dsh@0.2.1-rc.2` (source checkout `687f282e`, tag `dsh-v0.2.1-rc.2`).

This document is the persistent memory of the design discussion plus the **detailed
design and evidence ledger** for the mandatory-workflow work. The whole-system plan,
phasing, and decisions awaiting the user are in
[WORKFLOW-ROADMAP.md](WORKFLOW-ROADMAP.md).

**How it was produced:** four independent read-only reviews (t2 architecture, t3 API
feasibility, t4 fallback design, t5 security/tests, plus t1 environment baseline) were
merged. Every merged claim was re-checked against the installed 0.2.1-rc.2 packages or
the repository; where reports disagreed the ruling is recorded in §A with the source
that settled it. Two live experiments (**t18**, **t19**) are still running; their
subjects are marked `PENDING(t18)` / `PENDING(t19)` and must not be read as settled.

**Working agreement (unchanged):** discuss first, record decisions and open questions
here, and **do not change plugin implementation** until the user explicitly asks to
begin implementation. Updating these documents is allowed because the user requested
persistent notes.

## Status vocabulary

- `CONFIRMED` — observed in source, a real command, or a real test.
- `HYPOTHESIS` — plausible, not yet verified.
- `PENDING(t18)` / `PENDING(t19)` — owned by an in-flight experiment.
- `NOT_RUN` — intentionally not executed. `BLOCKED` — needs an external capability or
  a user decision.

Keep these categories separate: **confirmed requirement** (user), **proposal**
(recommended, not approved), **open question**, **implementation fact** (verified
against this repository or 0.2.1-rc.2 — never inferred from a newer upstream branch).

---

## Confirmed requirements

### R-001 — Every user message must go through the full workflow

- **Status:** CONFIRMED by the user on 2026-10-25.
- Every user message must enter the full workflow, including greetings, simple factual
  questions, follow-up questions, and complex tasks.
- The main model must not be allowed to decide whether to call `grok_workflow`.
- A simple question may be represented by a single planned task, but it must still pass
  through execution, verification, and final synthesis.
- The system must not silently bypass the workflow or return to ordinary direct
  answering when the workflow or all model routes fail. It should report the failure
  clearly.
- Consequence acknowledged: strict mode increases latency and model calls, including
  for trivial messages.

### R-002 — Per-role model selection is a desired capability

- The user wants per-role models instead of all child agents inheriting one route.
- Candidate roles: planner, executor/worker, verifier, final-answer synthesizer.
- **Status:** desired direction. Role boundaries, identity mechanism and defaults are
  designed in §DD-4; approval pending.

### R-003 — Ordered model fallback is a desired capability

- The user wants an ordered chain `model-A -> model-B -> model-C`; on rate limit or
  temporary unavailability the next model is tried, and traversal stops at the first
  usable result.
- Example model IDs in the discussion are illustrative and unverified.
- **Status:** desired direction; designed in §DD-5; approval pending.

### R-004 — Visual settings are desired

- The user wants a settings page instead of editing YAML only.
- **Status:** desired direction. 0.2.1-rc.2 cannot auto-generate a page for an external
  plugin (E-11), so the design is staged: YAML first, real client page later.

### R-005 — Discuss before changing implementation

- Current phase is discussion and design only. Do not edit plugin source, generated
  `lib/`, tests, package metadata, or runtime configuration without explicit
  authorization.
- Keep unfinished ideas visibly marked as proposals or open questions.

---

## Evidence ledger — CONFIRMED against the installed 0.2.1-rc.2 build

Paths are inside
`…/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/` unless they are repo
paths.

| id | fact | evidence |
|---|---|---|
| E-1 | `agent/pre-step` is a waterfall dispatched before any model request, payload `{agent, messages, turn, step, signal}`, decision `{kind:'reject'}` or `{kind:'enter', messages, startsRequestSeries?}` | `dsh-agent/lib/types/runtime-types.d.ts:304-310`; dispatch `dsh-agent-loop/lib/index.js:909`, claim `:906` |
| E-2 | The default `next()` returns `{kind:'enter', messages:[...claimed, context]}` — i.e. it injects the runtime-context user message. A listener returning its own `enter` **replaces** that injection and drops the runtime context unless it re-adds it. | `dsh-agent-loop/lib/index.js:913-920` |
| E-3 | `reject` ⇒ `turnEnds={kind:'blocked'}`, no `step/start`, no request | `dsh-agent-loop/lib/index.js:960-963` |
| E-4 | `agent/turn-stopping` is `serial` and dispatched only after a step produced a turn end | `dsh-agent-loop/lib/index.js:1000-1005`; signature `dsh-agent/lib/types/runtime-types.d.ts:387-391` |
| E-5 | Each attempt re-runs `agent/request`; failures reach `agent/request-error` per attempt, whose `{kind:'retry'}` re-enters the loop | `dsh-agent-loop/lib/index.js:1051` (loop), `:1136` (`request-error`), `:1191` (`agent/request`) |
| E-6 | `agent/request` can only replace `{provider, model, reasoningEffort, temperature, maxTokens, stop}` — **no `tools`, no `toolChoice`** and it cannot mutate messages | `dsh-llm/lib/types/call-config.d.ts:11-16`, `:23-26`; doc comment `dsh-agent/lib/types/runtime-types.d.ts:311-319` |
| E-7 | Only `agent-loop` writes `assistant/message` in-tree; `Session.append` itself has no per-role ownership guard (generic JSON validation only) | `dsh-agent-loop/lib/index.js:1098`, `:1156`; `dsh-session/lib/index.js append()` |
| E-8 | Plugin-written `assistant/message` `{turn,step,message,stream:[]}` with `surfaceOp:'append'` was **executed successfully** in a runtime probe; the message is consumed by `deriveMessages()`, by the Web GUI assistant node (fallback state when no `step/start`) and by headless `summarize()`; `turn/end{kind:'blocked'}` remains legal. Support level **B**: undocumented, no live stream, no usage accounting, plugin must fill a truthful provider/model. | t3 runtime probe; consumer paths: `dsh-session` surface guard, ui-chat assistant node, headless bundle summarize |
| E-9 | Workflow script `agent()` accepts exactly `{label, phase, schema, provider, model}`; `effort`/`isolation`/`agentType` are explicitly deferred | `dsh-workflow-ptc/lib/index.js` `SUPPORTED_AGENT_OPTIONS` / `DEFERRED_AGENT_OPTIONS` |
| E-10 | Subagent provider capability `agentOptions`: `spawn` true, `fork` true, ACP **false** | `dsh-subagent-spawn-in-process/lib/index.js:22`, `dsh-subagent-fork-in-process/lib/index.js:36`, `dsh-subagent/lib/index.js:2790` |
| E-11 | `SettingsDescriptor.autoGenerate` exists but has exactly one reader (the cordis tool catalog); settings pages are registered by client packages via `configForms.whileServed([ns], …)`. An external plugin gets **no** page automatically. | `dsh-api-settings-controller/lib/index.js:277`; `dsh-client-ui-settings*/lib/client.js` |
| E-12 | Settings namespaces are configured/described by the plugin and only `volatile()` schema fields are writable | `dsh-settings/lib/types/index.d.ts:80`, `:96` |
| E-13 | `dsh-llm-retry` registers `agent/request-error` **without** `prepend`, counts retries per `[provider, policyKey]` and resets per `step/start`/`turn/end` | `dsh-llm-retry/lib/index.js:175` and its retry-state keys |
| E-14 | `tools.restrict(filter)` is per-agent scoped only; a global restriction is explicitly forbidden | `dsh-tools/lib/types/index.d.ts:592`, `:645` |
| E-15 | `whenIdle()`, `followup(UserMessage)`, `steer(UserMessage)` exist on `Agent` | `dsh-agent/lib/types/runtime-types.d.ts:164`, `:192`, `:200` |
| E-16 | The workflow engine resolves **one** working directory per run and passes no cwd to children (`ChildStartRequest` has prompt/schema/provider/model only) | `dsh-workflow-ptc/lib/index.js` (`workingDirectory.ensure` + child start) |
| E-17 | `materializeFromRealm` rejects non-finite numbers but **not** `-0`; `-0` rejection lives only in the tools JSON-schema walker | `dsh-workflow-ptc/lib/index.js` realm `materialize` vs. bundled `walkJsonValue` |
| E-18 | Plugin at `b231660` has no `agent/pre-step`, `agent/request`, `agent/request-error`, `agent/turn-stopping`, `tools/pre-execute`, or `ctx.settings` usage; 6 spec files / 56 tests, all green; typecheck and lint clean | repo grep + `npm test` (t5) |

---

## §A Adjudications (sub-agent conflicts resolved by source/test evidence)

### A-1 — Does `ctx.settings` give an external plugin a Web GUI settings page?
- t1 said the namespace is "exposed to the Web GUI" by the settings controller; t3 said
  the GUI has no consumer for `autoGenerate`.
- **Ruling: t3.** E-11: `autoGenerate` is produced server-side and read only by the
  cordis tool catalog; every real settings page registers itself from a client package
  with `whileServed`. Consequence: R-004 is satisfiable only in a later phase with a
  real `dsh.client` package; the first release is YAML-based.

### A-2 — Is the "gate + redirect + tool deny" route sufficient for R-001?
- t1 recommended "gate + redirect + tool veto" over plugin-authored answers; t2 listed
  the three gates as the enforcement kit; t3 showed `reject` is the only hard block.
- **Ruling: t3, strengthened by this round's source check.** E-6 (no `toolChoice`) means
  no request-level mechanism can compel a tool call, and E-4 means `turn-stopping`
  cannot recover a rejected step because it is dispatched only after a step ended. A
  text-only answer at the admitted step is therefore unavoidable on that route, and it
  is already committed when turn-stopping runs. Route (b) is a degraded/advisory mode,
  not an enforcement mechanism.

### A-3 — Which route produces the final assistant answer? (B-1)
- t1/t2 preferred redirect; t3 proved the plugin can write `assistant/message`
  (E-8) and proposed a dual-track.
- **Ruling: not decided — `PENDING(t18)`.** Three concrete routes with different
  guarantee strength are now documented (ROADMAP §5.1): `(a)` enter-empty + `whenIdle`
  + `followup` relay, `(a')` `reject` + plugin-authored `assistant/message`, `(b)`
  redirect + three gates. The recorded preference order is `(a') > (a) > (b)` and the
  final choice needs t18's headless + Web GUI evidence and user confirmation.

### A-4 — Is `maxTotalAgents` a closed cost ceiling?
- t2 treated the engine caps as sufficient; t5 showed grandchildren are uncounted.
- **Ruling: t5.** The engine cap counts only workflow `agent()` calls; a raised
  subagent `maxDepth` (a volatile user setting) allows grandchildren outside the cap.
  Documented as an open cost-ceiling limitation, not a guarantee.

### A-5 — Does `materializeFromRealm` reject `-0`?
- t5 claimed it rejects `-0`; the source shows the realm materializer only rejects
  non-finite numbers (E-17).
- **Ruling: source.** Host report validation must not rely on the materializer to
  reject `-0`; if `-0` must be refused it needs an explicit check in `src/report.ts`.

### A-6 — Where does fallback live: host layer or script?
- t2 said C "must be a host layer, not only the script"; t4 designed L1 (task-level,
  child restart) plus L2 (request-level).
- **Ruling: both layers, mutually exclusive per task.** E-5 gives the request-level
  handle; the script/engine gives the child-restart handle. One recovery mechanism in
  flight per `(runId, taskId)`.

### A-7 — Are the 56 tests enough?
- t5's measurement stands: adequate for the declared tool-mode scope, zero for A/B/C.
- **Ruling: t5.** Not a test-quality problem; the code does not exist yet (E-18).

### A-8 — Retry ownership vs `dsh-llm-retry`
- t4 proposed P1 (plugin-exclusive, `prepend`, never delegate) and warned about
  multiplicative budgets; t2 asked for a documented order.
- **Ruling: P1 adopted as the proposal** (needs user confirmation, ROADMAP U-2). E-13
  confirms the collision is real: llm-retry does not `prepend`, and its counters reset
  per provider/step/turn.

---

## §B Blocker and gap registry (identifiers used across both documents)

**Blockers** (from t1/t3, all still live unless marked):

| id | severity | blocker | status |
|---|---|---|---|
| B-1 | high | who produces the final assistant answer after the workflow runs | `PENDING(t18)` — three routes documented (A-3) |
| B-2 | medium | `reject` discards the claimed user message event, so the plugin must re-append it | design accepted (DD-1.6), implementation pending |
| B-3 | medium | providers without `agentOptions` (ACP) must fail fast, never silently inherit | design accepted (DD-4) |
| B-4 | medium | double-retry stacking with `dsh-llm-retry` | design accepted as P1 ownership (A-8), user confirmation pending |
| B-5 | low | repository baseline was behind the remote; history must be verified before editing | resolved at `b231660` |

**Gaps found in the current implementation** (t2, verified by grep at `b231660`):

| id | gap | where it lands |
|---|---|---|
| G-1 | no forced entry (tool + prompt only) | DD-1 |
| G-2 | no conversation-context forwarding (objective is only the tool argument) | DD-3 |
| G-3 | no synthesizer model role (Synthesize is pure JS) | DD-4 |
| G-4 | an infrastructure failure destroys all partial evidence (`stopReason:'error'`, `value:null`) | DD-6 (recorded, not authorized) |
| G-5 | no role identity (`agent()` only uses label/phase for progress) | DD-4 |
| G-6 | `provider`/`model` never passed although the engine supports it | DD-4 |
| G-7 | no settings registration (YAML schema only) | DD-9 |
| G-8 | no diagnostics/switch audit (only `logger.warn`) | DD-10 |
| G-9 | no per-message idempotency (only an active-run counter) | DD-1 |
| G-10 | two copies of redaction (host + script-embedded mirror) | DD-3 |
| G-11 | two independent concurrency limiters (script pool + engine slots) | DD-8 |
| G-12 | engine `parallel()`/`pipeline()` unused in favour of a hand-written pool | Phase 6 (cleanup) |
| G-13 | `plan.source='unavailable'` is unreachable from the script but kept in the contract | document only |
| G-14 | `maxTotalAgentsFor` uses `maxTasks` rather than the actual plan length (conservative) | Phase 6 |

## §DD Detailed design

### DD-1 — Entry gate (requirement A)

Components (all host-side, no DSH core change):

1. **Classification** in `agent/pre-step`: (i) own subagent (`session.header.origin ===
   'subagent'` or `delegationDepth > 0`) → pass through; (ii) message already handled
   (durable idempotency record for `sessionId+turn+messageSeq`) → pass through;
   (iii) otherwise → the chosen route from DD-2.
2. **Idempotency** is durable (session event), never an in-memory counter: resume/fork
   resets memory and silently refunds budget.
3. **Tool surface** while a gate is pending: scoped `ctx.tools.restrict({allow:[…]})`
   (E-14, per-agent only) plus `tools/pre-execute` deny for everything except the
   workflow tool. This is a supporting gate; it does not by itself prevent a text answer.
4. **Turn supplement:** `agent/turn-stopping` (E-4) may add one corrective step when a
   turn ended without a validated workflow report — usable only on routes that let a
   step complete, never after a reject.
5. **Runtime-context caution:** if the gate returns its own `enter`, it replaces the
   default handler and therefore **must re-add** the runtime-context section, otherwise
   the model silently loses environment information (E-2). This is a new constraint
   discovered in this round and applies to routes `(a)`/`(b)`.
6. **Compensation:** on routes that reject, the plugin must append a `user/message` for
   the claimed message, because `reject` discards the user event (B-2).

### DD-2 — Final answer production (proposal, `PENDING(t18)`)

Requirements the chosen route must satisfy:

- **N-1** no assistant text exists before a validated report;
- **N-2** exactly one user-visible answer per user message;
- **N-3** the answer states model/role/attempt/partial information honestly;
- **N-4** failure of the workflow never becomes a silent direct answer;
- **N-5** the durable conversation contains the user's message and the answer exactly
  once (no duplicate user events);
- **N-6** the Web GUI renders the answer as a settled bubble and headless mode can
  extract it.

Route comparison (guarantee / risks) is in ROADMAP §5.1; the decisive source facts are
E-4 and E-6. Route `(a')` additionally requires: truthful `turn`/`step` values,
`stream: []`, `surfaceOp: 'append'`, no `sourceEventSeqs`, and a double-sided smoke test
(headless + Web GUI). If `(a')` is adopted, its support level B must be written into
the README compatibility section, not hidden.

### DD-3 — Conversation context and redaction

- Objective = current user message + bounded history: last `K` turns (default 4) and
  `≤ B` characters (default 4000, hard 8000), oldest-first truncation, redacted through
  `src/redact.ts` **before** being placed in the objective.
- Today `planPrompt()` interpolates the raw objective (gap); worker/verifier prompts
  already use the redacting `safePromptJson`. Fix: route the objective through
  `safePromptJson` too.
- History is read from the agent's own session log (`exec.agent.session`), which the
  plugin already has; no new DSH capability is needed.
- The child transcript itself is outside plugin control; documentation must not promise
  transcript privacy.
- `fork`-based subagent providers inherit the parent conversation → warn or refuse.

### DD-4 — Roles, identity, and model assignment (requirement B)

- Roles: `planner`, `worker`, `verifier`, `synthesizer`.
- The synthesizer role needs a **new** `agent()` call in the Synthesize stage; today it
  is pure JS (G-3). Design: synthesizer receives the validated per-task evidence
  (redacted JSON) and must return text that cannot add unverified claims; its output is
  post-checked (structure only) and then validated by the host report validator.
- Identity: `AgentOptions` has no metadata and `agent/request` carries no role, so the
  plugin keeps `childId → role` (E-9/E-5). Unknown role → `onUnknownRole`
  (`fail-fast` default, `inherit` opt-in).
- Assignment: config chain head → `agent(prompt,{provider,model})`; every child start
  validated against provider capability (E-10). `reasoningEffort` is applied at
  `agent/request` per route and **omitted** when a chain entry does not declare it.
- Load-time validation: unknown role/chains, duplicates, unknown provider/model,
  incapable provider, cap overflow ⇒ refuse to load with a specific message.

### DD-5 — Ordered fallback (requirement C)

**State machine** (one instance per `(runId, taskId)`):

```text
IDLE -> PREFLIGHT -> ROUTE_SELECT -> ATTEMPT -> CLASSIFY
CLASSIFY -> BACKOFF_SAME_MODEL -> ATTEMPT        (transient, same-model attempts left)
CLASSIFY -> ADVANCE_CURSOR     -> ROUTE_SELECT   (route-fatal / exhausted / timed out)
CLASSIFY -> COOLDOWN_SKIP      -> ADVANCE_CURSOR (route cooling, no attempt consumed)
CLASSIFY -> SEMANTIC_REPAIR    -> ATTEMPT        (semantic pool, not transport)
CLASSIFY -> SUCCESS | PARTIAL | FAILED | ABORTED (terminal)
```

**Invariants:** I1 each retry increments exactly one of attempts/cursor and both have
hard caps; I2 the cursor is monotone (no revisiting a failed route); I3 every state has
a terminal exit; I4 accounting is durable before any cancellable wait; I5 the three-way
guard (attempts, cursor, deadline/token budget) is checked before every attempt.

**Ownership:** `agent/request-error` registered with `{prepend:true}` and never
delegated (A-8). Load-time check for `retryPolicy.mode==='always'`
(`PENDING(t19)`, H-1).

**Classification:** see ROADMAP §8. Whitelist of retryable codes only; unknown code ⇒
fail-closed terminal. `IMAGE_OFFLOAD_REQUIRED` must be delegated to the engine.

**Preflight:** validate `(provider, model)` exists before attempting, because
`NO_ADAPTER` is swallowed during request preparation and only surfaces at stream time.

**Budgets:** defaults/hard caps in ROADMAP §7; the same pool serves L1 and L2 so that a
task cannot escape its cap by switching layers.

**Records** (durable, `SessionEventMap` augmentation, prefix `grok-workflow/`): route,
route-failure, gate, run. Fields listed in ROADMAP §10; no prompt/response bodies; ids
hashed where sensitive.

**Known risks accepted:** retry re-injects the runtime-context user message (linear
input-token growth), so advancing the cursor is preferred over same-model retry.

### DD-6 — Infrastructure failure paths (G-4) — current behavior recorded, change not authorized

**CONFIRMED today:** a child run failure becomes `WorkflowError(AGENT_RESULT, fatal)`;
the script rethrows fatal errors; the engine returns `stopReason:'error'` with
`value:null`; the host throws an engine error. Net effect: **a single 429/timeout loses
all partial per-task evidence** — no partial report, no per-task failure record. This
directly conflicts with R-001's "explicit failure" and with OQ-009.

**Target design (proposal):** classify child failures the same way routes are
classified; never let an infrastructure failure destroy already-verified evidence;
produce a `failed`/`partial` report with a machine-readable cause. This requires
script- and host-side changes and is explicitly **not** authorized by this document.

### DD-7 — Report validation hardening

Already correct (CONFIRMED): schemaVersion/status/objective agreement, plan↔tasks
field equality, attempt ordering and retry caps, "exactly one verified, last, passed",
completed requires per-criterion evidence, fallback plans cannot be `completed`,
partial requires verified+failed, unknown-field stripping, criterion mismatch rejection.

Holes to close (each needs a negative test):

1. `acceptanceCriteria: []` makes "every criterion has evidence" vacuously true
   (unreachable through the script today — defense in depth).
2. `attempts[].execution/verification` are only type-checked as records, not validated
   (`{verdict:'maybe'}` passes).
3. `confirmed[]` and `verification` records are not cross-checked (fabricated evidence
   passes when the verification evidence is blanked).
4. `tasks.length > maxTasks` is not rejected.
5. `partial` does not require an `incomplete`/`errors` entry per failed task; empty
   reason allowed.
6. `limits.maxTotalAgents` is not tied to configuration or formula.
7. Duplicate `taskId` is not rejected (ambiguous `confirmed` matching).
8. `-0` is not rejected by the materializer, so the report validator must not assume it
   (A-5).

Separately (t5 P0): `checkVerification` compares criteria with `===`. Exact matching
means a verifier that writes `"alpha works."` for `"alpha works"` fails forever and
exhausts retries — the most likely systematic false-failure source. Fix: whitespace/
case normalization or pass `criterionIndex` instead of text.

### DD-8 — Concurrency and the shared working directory

- CONFIRMED structural limit: one cwd per workflow run, no per-child cwd (E-16).
  Consequences: two tasks editing one file race (last write wins); a verifier can
  observe another task's intermediate state (false evidence or false failure);
  "tasks must be independent" is prompt-only.
- Mitigation (proposal): planner emits `writesPaths`; the host serializes or rejects
  overlapping write tasks; parallelism may be limited to read-only tasks; verifier runs
  after write tasks for the same paths. Per-task worktrees are impossible until DSH
  exposes per-child cwd.
- Concurrency is doubly bounded (script pool and engine slots) — the two defaults must
  be kept equal so behaviour does not silently degrade.

### DD-9 — Settings schema (stage 1)

```text
gate:            { mode: 'strict' | 'advisory' }              # 'advisory' = route (b), explicit downgrade
roles:
  planner:     [ { provider, model, reasoningEffort?, maxTokens?, maxAttempts?, cooldownMs? }, … ]
  worker:      [ … ]
  verifier:    [ … ]
  synthesizer: [ … ]
budgets:         { chainMax 3/5, perModelAttempts 2/3, totalAttempts 6/12,
                   semanticRetries 1/3, taskDeadlineMs 300000, runDeadlineMs 1.8e6/8.64e7,
                   taskTokenBudget 500k/5M, routeCooldownMs 60000 }
limits:          { maxConcurrency 3/6, maxTasks 6/12 }
context:         { historyTurns 4, maxObjectiveChars 4000/8000 }
diagnostics:     { level: 'off' | 'summary' | 'detailed' }
onUnknownRole:   'fail-fast' | 'inherit'
```

Validation at load: unknown role/chain/duplicate/unknown model/provider/incapable
provider/cap overflow ⇒ refuse to load. Only `volatile()` fields are writable by the
settings controller (E-12). No secrets in settings.

### DD-10 — Observability contract

Per run: one `grok-workflow/run` record (objective hash, message key, route chosen,
status, agents started, duration, token sum) plus one `grok-workflow/route` record per
attempt and `grok-workflow/gate` per gate decision. The user-visible report states
role/model/attempt count/outcome/failure class/partial flag. Nothing in the records may
contain prompt or response text.

---

## Open questions

Status of the original list after this round:

| id | question | status |
|---|---|---|
| OQ-001 | exact mandatory-entry interface | **ANSWERED** — `agent/pre-step` (E-1), but *what it can guarantee* is `PENDING(t18)` (A-3) |
| OQ-002 | what exactly is "the full workflow" for every message | **PARTIALLY ANSWERED** — one planned task allowed for trivial messages; synthesizer role added; the "stage failed" paths are DD-6 (not authorized) |
| OQ-003 | final-answer generation and its fallback | **OPEN — `PENDING(t18)`** — three routes documented (A-3); dual-track proposal noted |
| OQ-004 | fallback error policy | **ANSWERED (proposal)** — ROADMAP §8 classification table, whitelist + fail-closed |
| OQ-005 | chain behaviour and limits | **ANSWERED (proposal)** — DD-5 budgets/invariants; needs confirmation |
| OQ-006 | model identity and configuration source | **PARTIALLY** — validation against the configured catalog required; exact catalog API `PENDING(t19)` (H-5) |
| OQ-007 | settings UI and persistence | **ANSWERED for stage 1** — YAML + `ctx.settings`; GUI page is Phase 6/8 with a real client package (A-1) |
| OQ-008 | context, privacy, recursion | **PARTIALLY** — DD-3 context/redaction, recursion pass-through + `maxDepth` caveat (A-4) |
| OQ-009 | failure reporting and partial results | **OPEN** — DD-6 records the real gap (fatal errors destroy partial evidence); change not authorized |
| OQ-010 | runtime cost and latency | **ANSWERED (proposal)** — limit table, retry-cost note; user confirmation U-5 |

### New open questions from this round

- **OQ-011 (support risk).** Route `(a')` depends on an undocumented session write.
  Which smoke tests define "acceptable", and what is the documented fallback when a
  future DSH version guards `assistant/message`? `PENDING(t18)`.
- **OQ-012 (duplicate user events).** With `reject`, the claimed user message must be
  re-appended; if a client also retries the same message, two user events could appear.
  Idempotency key must cover both.
- **OQ-013 (runtime context loss).** Any `enter` override drops the default
  runtime-context injection (E-2). Do we re-inject it, and with which section content?
- **OQ-014 (criterion normalization).** Normalize whitespace/case, or switch to
  `criterionIndex`? Affects verifier prompt and report validation together.

### Hypotheses still open — owned by **t19**

- **H-1** can provider `retryPolicy` (e.g. `mode:'always'`) be read before a failure,
  for a load-time self-check? `PENDING(t19)`
- **H-2** is the `appendPluginRecord` experimental gate active at runtime in the
  published build (i.e. must we use `SessionEventMap` augmentation instead)?
  `PENDING(t19)`
- **H-3** cost/feasibility of reconstructing the route cursor from `agent.session`
  events inside an `agent/request` listener. `PENDING(t19)`
- **H-4** relative ordering when several plugins `prepend` the same waterfall
  (unshift semantics ⇒ last prepend is outermost). `PENDING(t19)`
- **H-5** can the settings schema projection carry nested role→chain dicts/arrays in a
  future GUI (and is the model catalog readable for validation)? `PENDING(t19)`

---

## Pending inputs (do not treat as settled)

- **t18 — B-1 live experiment.** Owns: which answer route is viable in practice
  (headless + Web GUI), whether plugin-appended messages render as settled bubbles,
  whether `turn/end{kind:'blocked'}` is acceptable to clients, and the relay timing of
  route `(a)`. Everything above marked `PENDING(t18)` must be rewritten after it lands,
  in the **t8** revision round.
- **t19 — H-1…H-5.** Owns the retry-policy readability check, the plugin-record gate,
  cursor reconstruction from the session log, prepend ordering, and the settings
  projection/catalog questions.
- Neither may be silently converted into a conclusion by later edits.

---

## Design discussion log

### 2026-10-25 — Initial requirements captured

- The plugin exposes `grok_workflow` as a tool, so the main model decides whether to
  call it — insufficient for the mandatory-entry requirement.
- The user explicitly selected "all messages must use the full workflow".
- Role-based model selection, ordered fallback, and a settings UI were identified as
  desired; no implementation authorized.

### 2026-10-25 — Environment and architecture audit (t1–t5, read-only)

- Environment verified: dsh / `@deepseek-ai/dsh` / `dsh-agent` all 0.2.1-rc.2; source
  checkout matches the tag; the plugin is installed only in isolated `.dsh-home`
  profiles; CI green; one coordination issue open.
- Architecture: no forced entry exists; A needs `agent/pre-step`, B/C need a host-side
  routing layer, D needs settings registration.
- Capability matrix, blockers B-1…B-5 and gaps G-1…G-14 recorded; the plugin's report
  validator is structurally strong with 7 semantic holes; parallel tasks share one
  working directory (structural).

### 2026-10-25 — Consolidation round (this document)

- Merged t2–t5 plus t1 into this detailed design and the roadmap; re-verified every
  headline claim in the installed 0.2.1-rc.2 build (E-1…E-18).
- **New findings this round:** (i) `agent/request` cannot force `tool_choice`
  (E-6), and `turn-stopping` cannot run after a `reject` (E-4) ⇒ the redirect route is
  not airtight and the "gate + redirect" recommendation from t1/t2 is downgraded to
  advisory; (ii) an `enter` override silently drops the runtime-context injection
  (E-2) — a constraint nobody had recorded; (iii) `materializeFromRealm` does not
  reject `-0` (A-5).
- Adjudications A-1…A-8 recorded; A-1 (no automatic GUI page) and A-2 (redirect is not
  enforcement) change the plan relative to the earlier drafts.
- Docs written: roadmap restructured around the 13 required whole-system topics;
  this document expanded into evidence + adjudication + detailed design + open
  questions.
- No plugin source, test, or configuration change was made in this round.

---

## Overall roadmap

The project-wide sequence, phase gates, and the decisions awaiting the user are in
[WORKFLOW-ROADMAP.md](WORKFLOW-ROADMAP.md). Do not implement until the user explicitly
authorizes it.
