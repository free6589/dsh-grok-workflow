# Workflow Design Discussion Log

Last updated: 2026-10-25 — **revision round (t8)**, superseding the t6 draft.
Baseline: plugin source at `main` = `d82c245`; DSH target = installed
`@deepseek-ai/dsh@0.2.1-rc.2` (source checkout `687f282e`, tag `dsh-v0.2.1-rc.2`).

This document holds the persistent design memory, the evidence ledger, the adjudication
record, the disposition of every review finding, and the open questions. The whole-system
plan, phasing and user decisions are in
[WORKFLOW-ROADMAP.md](WORKFLOW-ROADMAP.md).

**What changed in t8:** the 21 findings of the independent review (t7) were processed one
by one (§C); the live experiments t18 (B-1) and t19 (API capabilities) replaced every
`PENDING(...)` marker from the t6 draft with a measured result; the two competing answer
routes collapsed into one implementation path with a strategy switch; and the v1 fallback
scope was reduced to the script layer. Four items were **not** run and are listed in the
`NOT_RUN` ledger — they are never used as premises.

**Working agreement (unchanged):** discuss first, record decisions and open questions
here, and do not change plugin implementation until the user explicitly asks. Updating
these documents is allowed because the user requested persistent notes.

## Status vocabulary

- `CONFIRMED` — observed in source, a real command, or a real test on this machine.
- `RUNTIME-VERIFIED` — measured in a real DSH run (t18/t19 probes).
- `SOURCE-CONFIRMED` — read in the 0.2.1-rc.2 sources; behaviour follows the code but was
  not exercised end to end.
- `HYPOTHESIS` / `NOT_RUN` / `BLOCKED` — as before.

Separate always: **confirmed requirement** (user), **proposal**, **open question**,
**implementation fact** (this repository or 0.2.1-rc.2 — never a newer upstream branch).

---

## Confirmed requirements

### R-001 — Every user message must go through the full workflow

- **Status:** CONFIRMED by the user on 2026-10-25.
- Every user message must enter the full workflow, including greetings, simple factual
  questions, follow-up questions, and complex tasks.
- The main model must not be allowed to decide whether to call `grok_workflow`.
- A simple question may be represented by a single planned task, but it must still pass
  through execution, verification, and final synthesis.
- The system must not silently bypass the workflow or return to ordinary direct answering
  when the workflow or all model routes fail. It must report the failure clearly.
- Consequence acknowledged: strict mode increases latency and model calls.

### R-002 — Per-role model selection is a desired capability

- Per-role models instead of one inherited route; candidate roles: planner,
  executor/worker, verifier, final-answer synthesizer.
- **Status:** desired direction. Designed in §DD-4; the synthesizer is a separate scope
  decision (U-3).

### R-003 — Ordered model fallback is a desired capability

- Ordered chain `A -> B -> C`; on rate limit or temporary unavailability the next model is
  tried; traversal stops at the first usable result.
- **Status:** desired direction; designed in §DD-5 (v1 = script layer); approval pending.

### R-004 — Visual settings are desired

- A settings page instead of editing YAML only.
- **Status:** desired direction. 0.2.1-rc.2 cannot auto-generate a page for an external
  plugin and its generic form cannot edit nested chains (E-11, E-32), so stage 1 is YAML +
  validation and the page is a later deliverable.

### R-005 — Discuss before changing implementation

- Design only. Do not edit plugin source, `lib/`, tests, package metadata, or runtime
  configuration without explicit authorization.

---

## Evidence ledger

Paths are inside
`…/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/` unless they are repo paths.
`SOURCE` = read in source, `RUNTIME` = measured in a real run.

| id | fact | evidence | kind |
|---|---|---|---|
| E-1 | `agent/pre-step` is a waterfall dispatched before **every** model request (first step and every tool-continuation step); payload `{agent, messages, turn, step, signal}`; decision `{kind:'reject'}` or `{kind:'enter', messages, startsRequestSeries?}` | `dsh-agent/lib/types/runtime-types.d.ts:304-310`; dispatch `dsh-agent-loop/lib/index.js:909`, claim `:906` | SOURCE |
| E-2 | The default `next()` returns `{kind:'enter', messages:[...claimed, runtime-context]}` | `dsh-agent-loop/lib/index.js:913-920` | SOURCE |
| E-3 | `reject` ⇒ `turnEnds={kind:'blocked'}`, no `step/start`, no request | `dsh-agent-loop/lib/index.js:960-963` | SOURCE + RUNTIME (t18) |
| E-4 | `agent/turn-stopping` is dispatched only after a step produced a turn end, and the answer of that step is already committed | `dsh-agent-loop/lib/index.js:1000-1005`; signature `runtime-types.d.ts:387-391` | SOURCE |
| E-5 | Each attempt re-runs `agent/request`; failures reach `agent/request-error` **only** when the stream ended `error`/`aborted` | `dsh-agent-loop/lib/index.js:1051`, `:1130-1146`, `:1191` | SOURCE |
| E-6 | `agent/request` can replace only `{provider, model, reasoningEffort, temperature, maxTokens, stop}` — no `tools`, no `toolChoice`, and it cannot mutate messages | `dsh-llm/lib/types/call-config.d.ts:11-16`, `:23-26` | SOURCE |
| E-7 | Only `agent-loop` writes `assistant/message` in-tree; `Session.append` has no per-role ownership guard | `dsh-agent-loop/lib/index.js:1098`, `:1156`; `dsh-session/lib/index.js append()` | SOURCE + RUNTIME |
| E-8 | A plugin can write `assistant/message {turn,step,message,stream:[]}` with `surfaceOp:'append'`; it is consumed by `deriveMessages`, the GUI assistant node and headless `summarize` | t18 EXP2a | RUNTIME (level **B**) |
| E-9 | `agent()` accepts exactly `{label, phase, schema, provider, model}`; `effort`/`isolation`/`agentType` are rejected as deferred | `dsh-workflow-ptc/lib/index.js` | SOURCE |
| E-10 | Subagent `agentOptions` capability: `spawn` true, `fork` true, ACP false | `dsh-subagent-spawn-in-process/lib/index.js:22`, `dsh-subagent-fork-in-process/lib/index.js:36`, `dsh-subagent/lib/index.js:2790` | SOURCE |
| E-11 | `SettingsDescriptor.autoGenerate` has one consumer (the cordis tool catalog); pages are registered by client packages via `configForms.whileServed` | `dsh-api-settings-controller/lib/index.js:277`; `dsh-client-ui-settings*/lib/client.js` | SOURCE |
| E-12 | Settings namespaces are configured/described by the plugin; only `volatile()` fields are editable **without remounting** | `dsh-settings/lib/types/index.d.ts:80`, `:96` | SOURCE |
| E-13 | `dsh-llm-retry` registers `agent/request-error` without `prepend`, counts per `[provider, policyKey]`, resets per step/turn | `dsh-llm-retry/lib/index.js:175` | SOURCE |
| E-14 | `tools.restrict(filter)` is per-agent scoped; a global restriction is refused | `dsh-tools/lib/types/index.d.ts:592`, `:645` | SOURCE |
| E-15 | `whenIdle()`, `followup()`, `steer()`, `inject()` exist; `followup` opens a new turn, `steer` targets the next step, `inject` does not wake | `runtime-types.d.ts:164`, `:192`, `:200`; `dsh-agent-loop/lib/index.js:163-171` | SOURCE |
| E-16 | One working directory per workflow run; `ChildStartRequest` has no cwd | `dsh-workflow-ptc/lib/index.js` | SOURCE |
| E-17 | `materializeFromRealm` rejects non-finite numbers but **not** `-0` | `dsh-workflow-ptc/lib/index.js` realm materializer | SOURCE |
| E-18 | At `b231660` the plugin had no `agent/pre-step` / `agent/request` / `turn-stopping` / `ctx.settings` usage; 56 tests green | repo grep + `npm test` (t5) | CONFIRMED |
| E-19 | `{kind:'enter', messages:[]}` is **not** a zero-model-call swallow: other `pre-step` listeners inject context into any `enter` decision, so a real request is issued and the user sees an unrelated assistant reply | t18 EXP0; ≥8 in-tree packages register `agent/pre-step` listeners (grep of `dsh-*/lib/index.js`: agent-instructions `:1406`, ctx-notice, compaction-basic, plan-mode, repeat-tool-reminder, session-checkpoint-policy, session-reference, goal-round-driver, archived-session-gate) | RUNTIME (G-15) |
| E-20 | A one-shot (headless) app tears the tree down as soon as the turn ends `blocked`: the run aborts with `workflow execution failed (abort): runtime disposed`, `agentsStarted=0`; follow-up delivery then fails with `agent initiator scope is disposed` | t18 EXP1c | RUNTIME (G-18) |
| E-21 | There is **no** "parent idle" admission check: with a live app the run started inside `pre-step` completes normally across the turn boundary | t18 EXP1d/EXP2a | RUNTIME |
| E-22 | Delivering the report with `agent.followup()` after the turn closes opens a new turn; the model's output matched the report **byte for byte** in the single sample taken | t18 EXP1d | RUNTIME (1 sample) |
| E-23 | A plugin-declared `MessageSourceMap` kind survives the whole path: `followup` → `pre-step` payload `kinds:['grok-workflow']` → persisted `user/message source={kind:'grok-workflow'}` | t18 EXP1d ④ | RUNTIME |
| E-24 | A `steer()` issued from inside a `pre-step` listener is parked: after a `reject` the message is never consumed | t18 EXP3c | RUNTIME (G-16) |
| E-25 | Unguarded "steer on every pre-step" produced 10 steps in one turn (~80 s) | t18 EXP3-B | RUNTIME (G-21) |
| E-26 | A plugin `assistant/message` written **during** the turn races the loop's own step messages: the loop appended its own step-2 message later, and headless printed the model text instead of the plugin text | t18 EXP2a | RUNTIME (G-19) |
| E-27 | A turn that ends `blocked` yields a non-zero headless exit code, so scripts/CI read a successful gate as failure | t18 EXP1c/EXP3c (EXIT=1) vs EXP1d (EXIT=0) | RUNTIME (G-20) |
| E-28 | `appendPluginRecord(session,'plugin:…',data)` has no runtime gate: committed, `ignorable=true`, `surfaceGenerationDelta=0`, readable back, preserved across replay | t19 H-2 | RUNTIME |
| E-29 | `ctx.llm.listProviders()` + `ctx.llm.providerRetryPolicy(id)` are readable; an unregistered provider throws `no adapter registered` | t19 H-1 | RUNTIME |
| E-30 | Listener order: without `{prepend:true}` our `agent/request-error` listener is **never called** while `dsh-llm-retry` owns recovery; with `prepend` and no `next()` we are outermost and `llm/retry` events drop to zero | t19 H-4 (4 combinations) | RUNTIME |
| E-31 | Settings config layer works for nested structures: `z.dict(z.array(z.object(...)).min(1).max(5)).volatile()` round-trips through `toJSON`/rehydrate and reads through `.get()` | t19 H-5 | RUNTIME |
| E-32 | The generic settings form edits only scalar top-level fields; nested chains need a custom page using `set`/`unset`/`mutate` path operations (`deletePath` splices arrays) | t19 H-5 | RUNTIME |
| E-33 | Inside `agent/request` on the **first** attempt the session log holds no evidence of the attempt (no `request/header`, no `assistant/attempt`), and `request/header` carries no turn field ⇒ a route cursor must be self-written and self-advanced | t19 H-3b | RUNTIME |
| E-34 | Failures raised while preparing a request (e.g. `UNSUPPORTED_REASONING_EFFORT` at `dsh-llm/lib/index.js:2191`, `:2195`) escape the retry loop and never reach `agent/request-error` | SOURCE (`:1130-1146` dispatch condition) | SOURCE-CONFIRMED |
| E-35 | An `enter` override does **not** lose the runtime-context: `step()` appends an unadmitted context message at the end of the batch | `dsh-agent-loop/lib/index.js:1066-1073` | SOURCE-CONFIRMED (corrects the t6 E-2 claim) |
| E-36 | `inbox.claim(target,turn)` returns the whole `next-step` batch plus at most one `next-turn` message, and emits no `discarded` record, so a claimed message cannot be recovered | `dsh-agent-loop/lib/index.js:103-111` | SOURCE-CONFIRMED (G-17) |

---

## §A Adjudications (conflicts resolved by source or runtime evidence)

- **A-1 — Settings page for an external plugin:** no automatic page. `autoGenerate` has a
  single consumer (E-11); pages come from client packages. Stage 1 is YAML.
- **A-2 — "Gate + redirect + tool deny" sufficiency:** sufficient only as an advisory
  mode. `agent/request` cannot force a tool call (E-6) and turn-stopping runs after the
  answer is committed (E-4). **Guarantee wording:** "the main model cannot answer before
  the workflow ran" is true only for the current composition, because an outer listener
  can rewrite a waterfall decision — so the assertion belongs in a composed-bundle test.
- **A-3 — Answer route (B-1):** decided at the technical level by t18: one implementation
  path (`reject` → run → deliver after the turn closes) with a **strategy switch** for who
  writes the answer; default = relay turn `(a)`. User decision U-1 remains open;
  "t18's recommendation" is not "the user's decision".
- **A-4 — `maxTotalAgents` ceiling:** not closed; grandchildren are uncounted and
  `maxDepth` is user-volatile.
- **A-5 — `-0` handling:** `materializeFromRealm` does not reject `-0` (E-17); the report
  validator must not rely on it.
- **A-6 — Where fallback lives:** v1 = script layer only; L2 (request-level) is an
  optional later optimization with its own preconditions.
- **A-7 — Are the 56 tests enough?** Adequate for their declared tool-mode scope; zero for
  A/B/C at `b231660`. Since then, t20 landed criterion normalization (69 tests) and t21 is
  hardening the report validator.
- **A-8 — Retry ownership:** hard constraint when L2 exists — `prepend` **and** never
  delegate (E-30). v1 registers no such listener, so the question is dormant.
- **A-9 — `enter-empty` as a swallow primitive:** false (E-19). `reject` is the only
  zero-model-call decision.
- **A-10 — Preference order:** `(a)` relay > `(a')` append > `(b)` advisory, per t18's
  measurements (level B, G-19 ordering race, G-20 exit code, no stream/usage).
- **A-11 — Durable records:** `appendPluginRecord` + `pluginRecordOf` (E-28), not
  `SessionEventMap` augmentation. Experimental API, "best-effort" retention — not plain
  "durable".
- **A-12 — Runtime-context on `enter`:** not lost, merely appended at the end (E-35). The
  t6 claim and the derived OQ-013 are withdrawn.
- **A-14 — Mandatory-entry feasibility verdict:** **partially feasible**. No core change is
  needed, and the gate + run + delivery path is runtime-verified; but the guarantee is
  composition-scoped (outer listeners can rewrite the decision), a one-shot app tears the run
  down (G-18), relay fidelity is unverifiable, and the direct-append path keeps the blocked
  turn. The minimum upstream options (commit-answer API, `pre-step` final-decision lock, or a
  turn-outcome hook) and the no-upstream alternatives are enumerated in ROADMAP §5.3.
- **A-13 — Idempotency key:** `agentId + sorted(claimed message ids)`, deduped by scanning
  `ownEvents()` for the plugin record (E-28/E-23), not `sessionId+turn+messageSeq` and not
  a content hash.

---

## §B Blocker and gap registry

**Blockers**

| id | severity | blocker | status |
|---|---|---|---|
| B-1 | high | who produces the final assistant answer | **resolved at the technical level** (single path + strategy switch, A-3); user choice U-1 open |
| B-2 | medium | `reject` consumes the user message event; the plugin must re-append a `user/message` | design accepted (DD-1), implementation pending |
| B-3 | medium | providers without `agentOptions` must fail fast | design accepted (DD-4) |
| B-4 | medium | double-retry stacking with `dsh-llm-retry` | **dormant in v1** (no request-error listener); hard constraint if L2 is adopted (A-8) |
| B-5 | low | repository baseline behind the remote | resolved (`d82c245`) |

**Gaps in the current implementation / newly discovered**

| id | gap | evidence | affects | mitigation |
|---|---|---|---|---|
| G-1 | no forced entry (tool + prompt only) | t2 | A | DD-1 |
| G-2 | no conversation-context forwarding | t2 | R-001 follow-ups | DD-3 |
| G-3 | no synthesizer role (Synthesize is pure JS) | t2 | B | U-3 |
| G-4 | an infrastructure failure destroys all partial evidence (`stopReason:'error'`, `value:null`) | t2/t5 | C, OQ-009 | t17 / F5 |
| G-5 | no role identity (label/phase are progress-only) | t2 | B, L2 | DD-4 |
| G-6 | `provider`/`model` never passed although the engine supports it | t2 | B | DD-4 |
| G-7 | no settings registration | t2 | D | DD-9 |
| G-8 | no diagnostics/switch audit | t2 | C, D | DD-10 |
| G-9 | no per-message idempotency | t2 | A | now A-13 (durable key) |
| G-10 | two redaction copies (host + script mirror) | t2 | safety | keep, test-locked |
| G-11 | two independent concurrency limiters | t2 | cost | DD-8 (effective = min) |
| G-12 | engine `parallel()`/`pipeline()` unused | t2 | cleanup | later |
| G-13 | `plan.source='unavailable'` unreachable from the script | t2 | contract noise | document |
| G-14 | `maxTotalAgentsFor` uses `maxTasks`, not plan length | t2 | cost | later |
| **G-15** | `{kind:'enter', messages:[]}` is **not** a zero-cost swallow — other listeners inject context, so a model request still happens and the user sees an unrelated reply (E-19) | RUNTIME t18 EXP0 | A (routes a/b) | use `reject`; never rely on empty batches |
| **G-16** | a `steer()` issued inside a `pre-step` listener is parked after a `reject` and never consumed (E-24) | RUNTIME t18 EXP3c | A | deliver from outside the listener, after `whenIdle`/turn close |
| **G-17** | `inbox.claim` is irreversible and emits no `discarded` record, so a claimed user message cannot be restored (E-36) | SOURCE | A | the plugin must keep the original text for its own records/delivery |
| **G-18** | a one-shot app tears the tree down when the turn ends `blocked`: the run aborts (`runtime disposed`) and later delivery fails (`scope is disposed`) (E-20) | RUNTIME t18 EXP1c | A (a/a') | hard precondition: a live tree while the run finishes (keep-alive child or long-lived app); headless/CI cannot verify (a)/(a') without it |
| **G-19** | a plugin `assistant/message` written during the turn races the loop's own step messages; the later model message wins (E-26) | RUNTIME t18 EXP2a | (a') | write only after the turn closed |
| **G-20** | a `blocked` turn produces a non-zero headless exit code, so successful gating looks like failure to scripts/CI (E-27) | RUNTIME | (a')/CI | document; optionally follow with a normal turn |
| **G-21** | unguarded per-step `steer`/turn-stopping causes step runaway (10 steps in one turn) (E-25) | RUNTIME t18 EXP3-B | A | one-shot state flags for any step-level intervention |

---

## §C Disposition of the 21 t7 findings

Every finding is listed with its disposition and the section that changed. No finding was
silently dropped.

| id | sev | disposition | reason | landed in |
|---|---|---|---|---|
| R-01 | blocker | **adopted** | (a)'s swallow step cannot be `enter-empty`; measured E-19. Swallow step is now `reject`, and the cost/latency columns were rewritten | ROADMAP §5.1/§5.2; E-19; G-15 |
| R-02 | high | **adopted** | G-15…G-21 registered with phenomenon/evidence/affected route/mitigation; the "G-1…G-14" wording is gone | §B; §C |
| R-03 | high | **adopted** | default order is now `(a) > (a') > (b)` with the degradation reasons written out; U-1 stays with the user | ROADMAP §5.2, §17; A-10 |
| R-04 | high | **adopted (item retained)** | the cooperative option does not exist mechanically (E-30), so ownership is a hard constraint; U-2 stays on the user list only as "confirm there is one option" — the captain's list is preserved, the alternative is documented as unimplementable | ROADMAP §7, §17; A-8 |
| R-05 | high | **adopted** | records move to `appendPluginRecord`/`pluginRecordOf`; the `SessionEventMap` plan is deleted; idempotency key changed (A-13); H-2/H-3/H-4 closed; support level stated | §10, DD-5, DD-10, DD-1; E-28, E-30, E-33 |
| R-06 | high | **adopted** | DD-9 now covers volatile-without-remount, `.get()` read points, remount cost, path-operation editing, and the plugin-side fail-fast list; OQ-007 downgraded | DD-9; OQ-007 |
| R-07 | high | **adopted** | E-2 corrected and E-35 added: an `enter` override appends the context at the end instead of dropping it; the derived constraint and OQ-013 are withdrawn | E-2, E-35; A-12; DD-1 |
| R-08 | high | **adopted** | gate classification keys on `payload.messages`; empty batch ⇒ pass-through; tool-continuation negative test added | DD-1; ROADMAP §5, §12 |
| R-09 | medium | **adopted** | non-`user` message sources pass through; the plugin declares its own relay `source.kind`; N-5 rewritten | DD-1, DD-2; E-23 |
| R-10 | medium | **adopted** | failure-path table added with 12 rows including report-validation failure, engine error, listener throw, teardown and exit code | ROADMAP §15; DD-11 |
| R-11 | medium | **adopted** | running-input policy defined (queue, then a follow-up turn); G-16 registered as a known limitation | ROADMAP §5 rule 4; G-16 |
| R-12 | medium | **adopted** | composable budget invariants with load-time enforcement and negative tests | ROADMAP §7; DD-9 |
| R-13 | medium | **adopted** | "effective = min(script pool, engine slots)"; the "must be equal" requirement is deleted | ROADMAP §11; DD-8 |
| R-14 | medium | **adopted** | `UNSUPPORTED_REASONING_EFFORT` added as a route-level fatal; effort validated at load; "prepare-phase errors are not routable" recorded | ROADMAP §8; DD-4; E-34 |
| R-15 | medium | **adopted** | guarantee is composition-scoped; anti-bypass assertions run against the composed bundle | A-2; ROADMAP §5.2, §12 |
| R-16 | low | **adopted** | units are milliseconds (`1 800 000` / `86 400 000`), the cap formula is quoted from `src/script.ts:689-691`, and the "4×" claim is qualified | ROADMAP §11 |
| R-17 | low | **adopted** | in-tree `@deepseek-ai/dsh-tool-workflow` recorded, and it joins the deny/restrict list for route (b) | ROADMAP §2, §13 |
| R-18 | medium | **adopted** | v1 fallback is script-level only; the phases were re-ordered (settings → roles/L1 → gate → optional L2) | ROADMAP §7, §16; A-6 |
| R-19 | medium | **adopted (option, not default)** | preset-scoped registration recorded as an alternative with a smaller blast radius; the scope itself is U-7 | ROADMAP §3, §17; OQ-019 |
| R-20 | low | **adopted** | synthesizer moves to U-3 with v1 default "keep pure JS aggregation"; the post-check rule is specified for the adopt case | ROADMAP §6, §17; DD-4 |
| R-21 | low | **adopted** | a `NOT_RUN` ledger lists the four unmeasured items and distinguishes source-confirmed from runtime-verified | NOT_RUN ledger |

**Synthesis adopted from t7:** after the G-15 correction, `(a)` and `(a')` share the same
first step (`reject`), both run while the turn closes, and both deliver afterwards; they
differ only in who writes the answer. The design therefore has **one implementation path
plus one strategy switch**, which removes a parallel implementation and half of the
verification matrix (ROADMAP §5.2).

---

## §DD Detailed design

### DD-1 — Entry gate (requirement A)

`pre-step` handler, in order:

1. **Pass-through rules — evaluated on `payload.messages` only** (never on
   `decision.messages`, which other listeners contaminate — G-15):
   - `payload.messages.length === 0` ⇒ return `next()` untouched. This is a
     tool-continuation or wake step; starting a run here would launch one workflow per tool
     round-trip (R-08).
   - any message with `source.kind !== 'user'` ⇒ pass through. This covers the plugin's own
     relay message (`kind:'grok-workflow'`, E-23), notices, catalogs and context
     (R-09).
   - own subagent (`session.header.origin === 'subagent'` or `delegationDepth > 0`) ⇒ pass.
   - delivery key already recorded (A-13) ⇒ pass.
2. **Reject** the admitted batch: `{kind:'reject'}`. Zero model calls (E-3). Do **not** use
   `enter` with an empty batch (E-19).
3. **Run the workflow** inside the listener, holding `parent` and `signal`; the run keeps
   going while the turn closes (E-21). The user text is preserved by the plugin itself
   because the claim is irreversible (G-17) and no `user/message` is committed.
4. **Deliver after the turn closed** (G-19, G-16): `(a)` `agent.followup()` with the
   report and the plugin's `source.kind`; `(a')` append `user/message` (B-2) and then
   `assistant/message`.
5. **Totality (F6):** the listener must never throw. A thrown listener turns the waterfall
   into a turn `error` with no answer, which is a direct R-001 violation. Wrap the whole
   body; on an internal failure, fall back to delivering an explicit failure answer.
6. **Supporting gates:** scoped `ctx.tools.restrict({allow:[…]})` (E-14) plus
   `tools/pre-execute` deny for everything except the workflow tool, **including the
   in-tree `workflow` tool** (R-17). These gates are defence in depth; they are not what
   makes bypass impossible.
7. **Scope (U-7):** registering these hooks in a preset limits them to joined sessions;
   a global plugin row covers every agent in the process. The chosen scope must be stated
   in the user-facing docs together with the blast radius.
8. **Deployment precondition (G-18):** the tree must stay alive while the run finishes.
   One-shot headless runs abort the run at teardown; a long-lived app does not (web
   `NOT_RUN`).

### DD-2 — Answer production (one path, one switch)

Requirements the delivered answer must satisfy:

- **N-1** no assistant text exists before a validated report;
- **N-2** exactly one user-visible answer per user message;
- **N-3** the answer states status, roles/models used, attempt counts and the partial flag;
- **N-4** a workflow failure (including report-validation failure) still produces an
  explicit answer, never a silent direct answer;
- **N-5** the durable conversation holds the user's original message exactly once; the
  plugin's relay message carries its own `source.kind` and is **not** counted as a user
  message (R-09);
- **N-6** the GUI renders the answer as a settled bubble and headless mode can extract it;
- **N-7** `(a)` fidelity is model-dependent → the deliverable states that the host cannot
  verify relay wording (one exact-match sample only).

Strategy `(a)` (default): `pre-step` reject → run → `await agent.whenIdle()` →
`agent.followup(relayMessage(source.kind='grok-workflow'))` → normal turn, normal stream
and usage. Strategy `(a')` (degraded): after the turn closed, append `user/message` then
`assistant/message {turn, step, message, stream:[]}` with a truthful provider/model; accept
G-19 ordering constraints and G-20 exit code. `(b)` advisory: redirect + gates, with the
guarantee explicitly downgraded.

### DD-3 — Conversation context and redaction

- Objective = the claimed user text + a bounded history (default 4 turns, ≤ 4000 chars,
  hard 8000), redacted before it enters the objective.
- `planPrompt()` currently interpolates the raw objective; it must use the redacting
  serializer like the worker/verifier prompts.
- History comes from the agent's own session log; no new DSH capability is needed.
- Relay text is composed from the validated report only (no free-form additions).
- Child transcripts are outside plugin control; `fork` providers inherit the parent
  conversation → warn or refuse; docs must not promise transcript privacy.

### DD-4 — Roles, identity, model assignment (requirement B)

- Roles `planner`, `worker`, `verifier`, and `synthesizer` **only if U-3 = yes**. v1 keeps
  the pure-JS aggregation; if a synthesizer is added, its output must be post-checked so it
  cannot introduce claims outside `confirmed[]`, and it receives the untruncated report.
- Chains come from config; the script selects a chain entry per role. No `AgentOptions`
  metadata exists, so under v1 the script inherently knows the role; a `childId → role`
  registry is only needed for L2 (G-5).
- Provider capability is validated at load (E-10); `effort` is validated against the model
  catalog because a bad value surfaces as `UNSUPPORTED_REASONING_EFFORT` in request
  preparation and is **not** routable (E-34).
- Unknown role → `onUnknownRole` (`fail-fast` default).

### DD-5 — Ordered fallback (requirement C)

**v1 = script layer (L1).** `runTask` already owns a bounded retry loop and `agent()`
already accepts `{provider,model}`, so the chain is a lookup keyed by attempt index. This
keeps prepare-phase failures inside the script's own `try/catch`, needs no durable cursor,
and cannot collide with `dsh-llm-retry`. Cost: a model switch restarts the child and loses
its in-child tool results.

**L2 (later, optional).** `agent/request` selects the route per attempt and
`agent/request-error` decides retry/advance. Preconditions: `{prepend:true}` and never
delegate (E-30), a **self-written and self-advanced durable cursor** (E-33: the first
attempt has no readable history and `request/header` carries no turn), and acceptance of
the E-34 gap. Records via `appendPluginRecord` (E-28).

**State machine (shared by both layers):**

```text
IDLE -> PREFLIGHT -> ROUTE_SELECT -> ATTEMPT -> CLASSIFY
CLASSIFY -> BACKOFF_SAME_MODEL -> ATTEMPT
CLASSIFY -> ADVANCE_CURSOR     -> ROUTE_SELECT
CLASSIFY -> COOLDOWN_SKIP      -> ADVANCE_CURSOR
CLASSIFY -> SEMANTIC_REPAIR    -> ATTEMPT
CLASSIFY -> SUCCESS | PARTIAL | FAILED | ABORTED
```

Invariants: I1 each retry increments exactly one of attempts/cursor, both capped;
I2 cursor monotone; I3 every state has a terminal exit; I4 accounting durable before any
cancellable wait; I5 the three-way guard (attempts, cursor, deadline/token) is checked
before each attempt; **I6 (new, R-12)** `chainLen × perModelAttempts ≥ totalAttempts` and
`transport + semantic ≤ totalAttemptsHard`, enforced at load.

### DD-6 — Infrastructure failure paths (G-4)

Today a child failure becomes `WorkflowError(AGENT_RESULT, fatal)`, the script rethrows,
the engine returns `stopReason:'error'` with `value:null`, and the host throws: **one 429
or timeout destroys all partial per-task evidence**. Recorded, not changed here; the fix is
task t17 and failure row F5. Prepare-phase failures (E-34) take the same route and are
today caught only by the script.

### DD-7 — Report validation hardening

Correct today: schemaVersion/status/objective agreement, plan↔tasks equality, attempt
ordering and caps, "exactly one verified, last, passed", per-criterion evidence for
`completed`, no `completed` for fallback plans, `partial` requires verified+failed,
unknown-field stripping, criterion mismatch rejection. Criterion comparison was normalized
in `023887d` (t20), removing the systematic false-failure risk.

Still open (each needs a negative test): vacuous "all criteria have evidence" when the
criterion list is empty; `attempts[]` records only type-checked; no cross-check between
`confirmed[]` and the verification record; `tasks.length > maxTasks` accepted;
`partial` needs no per-failed-task entry; `limits.maxTotalAgents` unrelated to config;
duplicate `taskId` accepted; and `-0` is not rejected by the materializer (A-5).

### DD-8 — Concurrency and the shared working directory

- One cwd per run, no per-child cwd (E-16) ⇒ write races, verifier observing another
  task's intermediate state, and "tasks are independent" being prompt-only.
- Mitigation: planner emits `writesPaths`; host serializes or refuses overlapping write
  tasks; parallel work limited to read-only tasks; verifier ordered after writers.
- Concurrency: **effective = min(script pool, engine slots)** (R-13). The engine value is
  deployment config (default `min(16, cores-2)`), so the plugin can only tighten; read it
  for diagnostics rather than assuming equality.

### DD-9 — Settings (stage 1) with the facts that make it operable

1. Every user-editable field is `volatile()`; a non-volatile write remounts the plugin and
   kills an in-flight run (E-12).
2. The current `resolveConfig()` snapshots scalars at `apply()`; fields must become
   volatile holders read with `.get()` at the attempt boundary (E-31).
3. Shape: `roles: z.dict(z.array(z.object({provider,model,reasoningEffort?,maxAttempts?})).min(1).max(5)).volatile()`;
   `budgets` and `limits` as volatile objects; no secrets.
4. **Schema does not enforce emptiness** (E-31): the plugin must fail fast on missing
   roles, empty chains, duplicate `(provider,model)` in a chain, unknown provider/model,
   unavailable `agentOptions`, unsupported effort, and the R-12 budget invariants — each
   with a negative test.
5. Editing nested chains requires a **custom page** with path operations (E-32); the
   generic form is scalar-only. Stage 1 therefore ships YAML + validation, and the page is a
   later deliverable (U-6).
6. The `mode:'always'` retry check runs at load via `providerRetryPolicy` (E-29).

### DD-10 — Observability

One `plugin:grok-workflow/run` record per run, one `plugin:grok-workflow/gate` per gate
decision, one `plugin:grok-workflow/route` per attempt, all written with
`appendPluginRecord` (E-28) and read with `pluginRecordOf`. Fields: run/gate/route ids,
delivery key, role, provider, model, attempt and cursor indices, outcome, failure
code/status, delay, duration, tokens, reason, redaction version. Never prompt or response
text, keys, authorization headers, or raw request ids. Support level: experimental API,
best-effort retention across session-format migrations.

### DD-11 — Failure paths

The authoritative table lives in ROADMAP §15 (12 rows: F1…F12) and covers normal, partial,
exhausted chain, report-validation failure, engine error, listener throw, deadline/cancel,
prepare-phase failure, one-shot teardown, running-input queueing, client retry, and
recursion. F6 (listener totality) and F9 (teardown) are blocking preconditions for Phase 5.

---

## Open questions

| id | question | status |
|---|---|---|
| OQ-001 | exact mandatory-entry interface | **ANSWERED** — `agent/pre-step` + `reject` (E-1/E-3/E-19); scope is U-7 |
| OQ-002 | what is "the full workflow" for every message | **PARTIALLY** — one-task plans allowed for trivial messages; failure paths defined in ROADMAP §15; the synthesizer is U-3 |
| OQ-003 | final-answer generation and fallback | **ANSWERED at design level** — one path + strategy switch (DD-2); the last word is U-1 |
| OQ-004 | fallback error policy | **ANSWERED (proposal)** — ROADMAP §8, whitelist + fail-closed |
| OQ-005 | chain behaviour and limits | **ANSWERED (proposal)** — DD-5 + R-12 invariants; confirmation pending |
| OQ-006 | model identity and configuration source | **PARTIALLY** — ids validated against the catalog; a dropdown needs a custom page (E-32) |
| OQ-007 | settings UI and persistence | **DOWNGRADED** — stage 1 (YAML + `volatile` + validation) is operable; the page needs a client package |
| OQ-008 | context, privacy, recursion | **PARTIALLY** — DD-3, DD-1 rules, `maxDepth` caveat |
| OQ-009 | failure reporting and partial results | **PARTIALLY** — F-table defined; F5/G-4 needs t17 |
| OQ-010 | runtime cost and latency | **PARTIALLY** — budgets and the extra relay turn are specified; measurement is `NOT_RUN` |
| OQ-011 | support risk of plugin-authored answers | **ANSWERED for planning** — level B with documented degradation; ordering case `NOT_RUN` |
| OQ-012 | duplicate user events | **ANSWERED** — plugin relay message carries its own `source.kind` (E-23) and is not a user message |
| OQ-013 | does an `enter` override drop runtime-context | **CLOSED — premise was wrong** (E-35); only ordering changes |
| OQ-014 | criterion comparison | **ANSWERED** — normalization landed in `023887d` |
| OQ-015 | relay fidelity across many samples | **NOT_RUN** — one exact-match sample only |
| OQ-016 | web long-lived profile with an idle parent | **NOT_RUN** — one-shot apps cannot isolate the variable (G-18) |
| OQ-017 | `(a')` write-after-turn-close ordering | **NOT_RUN** — the race was measured, the correct order was not |
| OQ-018 | settings write-to-disk through a real Loader entry | **NOT_RUN** — nested path writes are source-confirmed only |
| OQ-019 | is preset-scoped registration available in the target deployment | **OPEN (U-7)** — source-confirmed registry, not exercised |
| OQ-020 | how is F6 (listener totality) proven | **OPEN** — needs an injected-throw test in the composed bundle |

**Closed hypotheses (t19):** H-1 **PASS** (`providerRetryPolicy` readable → `mode:'always'`
self-check), H-2 **PASS** (`appendPluginRecord` has no runtime gate), H-3 **PASS** (scan cost
linear; **H-3b**: the cursor must be self-written), H-4 **PASS** (`prepend` wins over mount
order; without it our listener is never called), H-5 **config layer PASS / generic form
FAIL**.

---

## NOT_RUN ledger (never a premise)

Source-confirmed is **not** runtime-verified. These four items were not measured and must
not be cited as working:

| # | item | level achieved | why it matters |
|---|---|---|---|
| NR-1 | web long-lived profile, delivery while the parent is idle | nothing (deployment precondition inferred from G-18) | decides whether `(a)`/`(a')` work in the GUI at all |
| NR-2 | relay fidelity over many samples | one exact-match sample (E-22) | relay wording is unverifiable by design; a sample of one is not a guarantee |
| NR-3 | `(a')` correct write order (after the turn closed) | the race was measured (E-26), the fix was not | the degraded strategy's viability |
| NR-4 | settings `update`/`replace`/`mutate` writing to disk through a real Loader entry | nested path ops are source-confirmed (E-32) | whether stage 2 can edit chains at all |

---

## Design discussion log

### 2026-10-25 — Initial requirements captured

- The plugin exposes `grok_workflow` as a tool, so the main model decides; insufficient for
  mandatory entry. The user chose "all messages use the full workflow". Role models,
  ordered fallback and a settings UI identified as desired; no implementation authorized.

### 2026-10-25 — Environment and architecture audit (t1–t5, read-only)

Environment/target versions verified; no forced entry exists; A needs `agent/pre-step`,
B/C need host-side routing, D needs settings registration; capability matrix, blockers
B-1…B-5 and gaps G-1…G-14 recorded; report validator strong with seven semantic holes;
parallel tasks share one working directory.

### 2026-10-25 — Consolidation (t6)

Merged t2–t5 into the first full draft of these two documents; verified the headline
claims in the installed build. Three new findings: `agent/request` cannot force
`tool_choice`; turn-stopping cannot recover a rejected step; `materializeFromRealm` does
not reject `-0`.

### 2026-10-25 — Live experiments (t18, t19)

- t18 (B-1): the run **can** start inside `pre-step` and complete across the turn boundary
  as long as the tree stays alive; delivery via `followup` works with an exact-copy result;
  a plugin-declared `source.kind` survives the whole path; `enter-empty` is **not** a
  zero-cost swallow; a one-shot app tears down after a blocked turn; `(a')` writing races
  the loop's own messages; a blocked turn exits non-zero; unguarded per-step steering runs
  away.
- t19: `providerRetryPolicy` readable; `appendPluginRecord` has no runtime gate; the route
  cursor must be self-written; `prepend` + never-delegate is the only ownership option;
  the settings config layer handles nested structures but the generic form cannot.

### 2026-10-25 — Independent review (t7) and revision (t8)

- t7 raised 21 findings: eight must-fix (the `(a)` swallow claim, missing G-15…G-21, the
  reversed preference order, a non-existent cooperative retry option, the wrong records
  mechanism, an unclosed settings story, the incorrect runtime-context claim, and the
  missing empty-batch branch), seven should-fix (relay recursion, missing failure-path
  table, undefined running-input semantics, non-composable budgets, an unenforceable
  concurrency requirement, a missing error code, and an over-strong "airtight" claim), and
  six suggestions (units/formula errors, the in-tree workflow tool, the smaller v1
  fallback path, preset-scoped enforcement, the synthesizer scope, and the NOT_RUN list).
- t8 adopted all 21, with two scope adjustments: U-2 remains on the user list as a
  confirmation (the alternative is unimplementable) and preset scoping is recorded as an
  option whose selection is U-7.
- **Design consequence:** the answer design collapsed from two parallel routes to one path
  plus a strategy switch; the v1 fallback collapsed from two layers to the script layer,
  which re-ordered the phases (settings → roles/L1 → gate → optional L2) and removed the
  `dsh-llm-retry` collision from v1 entirely.
- No plugin source, test, or configuration change was made in this round.

---

## Overall roadmap

Sequence, phase gates and the seven user decisions are in
[WORKFLOW-ROADMAP.md](WORKFLOW-ROADMAP.md). Do not implement until the user explicitly
authorizes it.
