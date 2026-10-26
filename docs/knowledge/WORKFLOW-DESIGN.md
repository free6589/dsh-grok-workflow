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
| E-37 | The guest `agent()` hook accepts per-child `provider`/`model` (`SUPPORTED_AGENT_OPTIONS`), passes them as `ChildStartRequest.provider/model` → subagent `agentOptions`; `effort`/`isolation`/`agentType` are **deferred** and throw `UNSUPPORTED_OPTION`, so per-role reasoning effort is not routable in v1 | `dsh-workflow-ptc/lib/index.js` guest `agent()` + host `startChild` | SOURCE-CONFIRMED; runtime-exercised through the contract harness (`test/engine-harness.ts`) |
| E-38 | **in-turn delivery works end to end in a one-shot app**: the gate awaits the run inside `agent/pre-step`, then `enter`s the step with the validated report; real `dsh headless` run with the plugin's own `answerStrategy: in-turn` printed the report (`Grok workflow: COMPLETED`, 6 s of child sessions) and exited **0** | t25 headless run, `scripts/e2e-headless-in-turn.sh` | RUNTIME (real model: `bifrost-completions/runanywhere/deepseek-v4.1-flash`) |
| E-39 | **the same prompt, profile and plugin with `answerStrategy: relay` produce nothing**: exit **1**, stdout empty, no report marker — the t18 EXP1c teardown reproduced with the shipped gate, which is why the default had to change | t25 contrast run, same script with a `relay` overlay | RUNTIME |
| E-40 | **the real Loader hands `.volatile()` fields over as holders, and the plugin unwraps them**: the same headless run as E-38, with every user-editable field now `volatile()`, still printed `Grok workflow: COMPLETED` and exited 0 — if `snapshotConfig()` did not unwrap `{get()}`, every default would have been an empty object and load-time validation would have failed | t14 headless run, `scripts/e2e-headless-in-turn.sh` (overlay `bifrost-completions/runanywhere/deepseek-v4.1-flash`) | RUNTIME |
| E-41 | **the explicit-refusal path is visible to a real user**: a 4 238-character prompt in `dsh headless` printed the refusal verbatim with its reason (`the message is longer than the 4000-character workflow objective limit`), no `Grok workflow:` status line and no task lines — refused out loud, nothing executed, exit 0 | t14 headless run, `scripts/e2e-headless-in-turn.sh` with `E2E_EXPECT=refusal` (two consecutive passes) | RUNTIME |
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
| G-4 | an infrastructure failure destroys all partial evidence (`stopReason:'error'`, `value:null`) | t2/t5, mechanism re-read t17 | C, OQ-009 | **resolved (t17)**: the plugin's fatal policy, not the script's `try/catch`, was the cause — see DD-6 |
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
| **G-18** | a one-shot app tears the tree down when the turn ends `blocked`: the run aborts (`runtime disposed`) and later delivery fails (`scope is disposed`) (E-20) | RUNTIME t18 EXP1c, re-measured t25 (E-39) | A (a/a') | **resolved for v1**: `answerStrategy: 'in-turn'` keeps the turn open and is now the default (E-38). The precondition still applies to `relay`/`append`, which stay selectable for long-lived surfaces and must be documented as such |
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
| R-06 | high | **adopted** | DD-9 now covers volatile-without-remount, `.get()` read points, remount cost, path-operation editing, and the plugin-side fail-fast list; OQ-007 downgraded. DD-9a (t13) replaces the "no page possible" half with the measured `ctx.settings` contract: the page is generated from `Config` | DD-9, DD-9a; OQ-007 |
| R-07 | high | **adopted** | E-2 corrected and E-35 added: an `enter` override appends the context at the end instead of dropping it; the derived constraint and OQ-013 are withdrawn | E-2, E-35; A-12; DD-1 |
| R-08 | high | **adopted** | gate classification keys on `payload.messages`; empty batch ⇒ pass-through; tool-continuation negative test added | DD-1; ROADMAP §5, §12 |
| R-09 | medium | **adopted** | non-`user` message sources pass through; the plugin declares its own relay `source.kind`; N-5 rewritten | DD-1, DD-2; E-23 |
| R-10 | medium | **adopted** | failure-path table added with 12 rows including report-validation failure, engine error, listener throw, teardown and exit code | ROADMAP §15; DD-11 |
| R-11b | low | **adopted** | a batch refused for a full queue is claimed by the host and not returned, so it is refused explicitly and never retried by this plugin; only a client re-send can start the run (V-2, t24). The same rule covers `in-turn`: the `started` delivery record is written *before* the run is awaited, so if the process dies mid-run that message is **not** routed again after a restart — deliberate (a crash may already have executed tools, so re-running could duplicate side effects), with the consequence that a user must re-send to retry (t25/t26) |
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
8. **Deployment precondition (G-18) — removed by `in-turn`:** `relay`/`append` need the
   tree to stay alive while the run finishes, which a one-shot headless app violates
   (E-39). The default `in-turn` strategy holds the turn open instead, so the run cannot
   outlive its tree and the answer is entered in the same turn (E-38); the precondition
   now applies only to the two older strategies, which remain selectable for long-lived
   surfaces (NR-1 for the GUI half).

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

**Implemented as three interchangeable strategies (`answerStrategy`), one path each:**

| strategy | mechanism | survives a one-shot app | stream/usage | status |
|---|---|---|---|---|
| `in-turn` (**default**) | `pre-step` awaits `runWorkflow`, then `enter`s the step with the report message (`source.kind='grok-workflow'`); the main model finalises it in the **same** turn | **yes** (the turn never closes early) — E-38 | yes (ordinary turn) | shipped, measured |
| `relay` | `pre-step` rejects → run in the background → `await agent.whenIdle()` → `agent.followup(relayMessage)` in a new turn | no — a one-shot process tears the tree down at `blocked` and the answer is lost (E-39) | yes | shipped, kept for long-lived surfaces (NR-1) |
| `append` | reject → run → after the turn closed, append `user/message` + `assistant/message {turn, step, message, stream:[]}` with a truthful provider/model | no (same teardown; plus G-19 ordering, G-20 exit code) | degraded: no stream, no usage | shipped, degraded |

**Why the default moved to `in-turn` (t25):** with `relay` — the previous default — the
same prompt, profile and plugin produced *exit 1, empty stdout, no report at all* in
`dsh headless` (E-39), which violates R-001 outright. The mechanism was never the workflow
but the delivery timing. `in-turn` keeps the turn open, so the run cannot outlive its tree.
Keeping the turn open costs one thing only: the turn lasts as long as the run, bounded by
`timeoutMs` (default 30 min) — and `runWorkflow` also cancels the run when the turn's own
signal aborts, so the wait always terminates (`exec.signal`/deadline/unload).

**Fail-closed is unchanged and now stronger:** with the turn open there is no "later" that
can be lost, so a failed run, a report-validation failure, a start failure, an over-long
message and a queue refusal all reach the user as an entered notice or failure report in
the same turn (`test/gate.spec.ts` "in-turn delivery" suite). The only silent case is a
turn cancelled while the run is in flight: nobody would read an entered step, so the gate
returns `reject` and the run is cancelled on the same signal.

`(b)` advisory: redirect + gates, with the guarantee explicitly downgraded (not implemented).

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

**Status: implemented in phases 3–4** (`src/config.ts` chains, `src/script.ts` `callRole`,
`src/records.ts` ledger). What shipped, precisely:

- Config: `roles.{planner,worker,verifier,synthesizer}` = ordered `{provider?, model}` lists,
  each ≤ `HARD_LIMITS.chainLength` (3), unique within a chain, non-empty ids ≤ 120 chars.
  An empty chain means "inherit the run's route" (the schema default fills every role with
  `[]`, so emptiness cannot be distinguished from "not configured"); the effective chains are
  reported in `report.routing` and rendered in the answer, so an empty chain is visible
  rather than silently assumed to work.
- Selection rule (v1, one try per entry, inside the existing attempt loop):
  **route failure → advance the chain** (`rate-limit`, `server-error`, `connection`,
  `timeout`, `model-unavailable`, `format-error`, `agent-start-failed`);
  **content failure → retry the same route** (`task-failed`, `verification-failed`),
  because a different model would receive the same evidence;
  **fatal → rethrow** (`AGENT_CAP`, `UNSUPPORTED_OPTION`, `INVALID_ARGUMENT`,
  `UNSUPPORTED_SCHEMA`, `SCRIPT_PARSE`, `ITEM_CAP`), because those are setup or budget
  faults that another model cannot fix.
- Classification is a whitelist with a fail-closed default: an unrecognised failure is
  reported as `unknown` and never becomes a success (R-14: prepare-phase failures never
  reach `agent/request-error`, so the script is the only place that can see them).
- Budget: `(retries+1) × (|worker|+|verifier|) ≤ HARD_LIMITS.maxAttemptsPerTask (6)` is
  enforced at load, and `maxTotalAgents` is derived from the effective chains
  (`routeBudgetFor` + `maxTotalAgentsFor`); without that, a run would abort mid-flight with
  `AGENT_CAP` the first time a fallback route is used.
- Records: one redacted `plugin:grok-workflow/routing` ledger per run (switches and
  failures only, ≤ 64 entries, ≤ 200-char reasons). The ledger is written **only from
  the validated `completed` branch**: when the engine fails or the script throws there
  is no validated route trail to record, and a synthesised one would be invented evidence.
  The failure itself still reaches the user (the gate answers with a failure report).

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

### DD-6 — Infrastructure failure paths (G-4) — RESOLVED in t17

**The mechanism, re-read from the engine source in t17.** `WorkflowError.fatal` defaults to
`true` for *every* error code (`dsh-workflow/lib/index.js`, `WorkflowError` constructor:
`this.fatal = options?.fatal ?? true`), and `agent()` raises `AGENT_RESULT` for any child run
that rejects — including a 429, a timeout or a disposed child. The script's old
`if (isFatal(error)) throw error` therefore rethrew a *transport* failure; the throw left the
task, and `parallel()`/the run loop propagated a fatal error, so `drive()` returned
`stopReason:'error'` with `value:null` and every per-task result was lost. A script-side
`try/catch` cannot fix this class of bug on its own — the flag is host-set and the escape
happens above the script — so the fix is a **fatal policy change in the plugin's script**:

- `classifyCallFailure` no longer marks infrastructure failures fatal. Only *setup* faults
  (AGENT_CAP, unsupported option, invalid argument, unsupported schema, script parse, item
  cap) stop the chain, and they are **returned**, never rethrown: the caller records them as
  that task's failure and the run continues with the remaining tasks.
- Every task runs inside a wrapper, and the task pool is wrapped too, so no throw from a
  task can end the run: the worst case is a failed row per task, never a bare exception.
- A setup fault also stops further *attempts* for that task: a cap or a bad schema repeats
  by definition, so retrying only burns budget.
- The planner degrades to the fallback plan on any fault (recorded in `plan.failure`), and a
  synthesizer fault only empties the narrative, because the deterministic aggregation is
  already complete.

**Distinguishable in the report layer.** A failure now carries a *class* (what happened:
`rate-limit`, `timeout`, `server-error`, `connection`, `model-unavailable`, `format-error`,
`task-failed`, `verification-failed`, `agent-start-failed`, `budget-exhausted`, `unknown`)
**and a category** (who has to fix it):

| category | classes | meaning |
|---|---|---|
| `infrastructure` | rate-limit, timeout, server-error, connection, model-unavailable, format-error, agent-start-failed, and any child failure whose text cannot be classified (decided by the engine code `AGENT_RESULT`) | the model service, the network or a deadline failed; a retry, another route or a later run may succeed |
| `quality` | task-failed, verification-failed | the work or its verification fell short; the same route retries with the same evidence |
| `configuration` | budget-exhausted, the setup-fault classes above, and an unvalidatable report at the run level | no retry can help; a human must change something |
| `cancelled` | run-level causes `cancelled` (the caller aborted) and `unloaded` (the plugin was disposed) — t14/F4 | **stopped on purpose**: neither a broken provider nor bad work, so nothing is "fixed" and a plain retry is not implied |
| `unknown` | unmatched non-engine throwables | unclassified on purpose — never guessed |

The category is carried on `tasks[].attempts[].failure.category`,
`incomplete[].category`, `errors[].category`, `plan.failure.category` and the run-level
failure report (`src/run.ts` maps timeout/engine-error to `infrastructure`, cancellation and
unload to `cancelled`, report-invalid to `configuration`). `renderReport` prints a `Failures: 1 infrastructure,
1 quality` line plus a per-item marker, so the answer a user reads cannot confuse "the
provider was down" with "the work was not good enough".

**Evidence.** `test/failure-paths.spec.ts` covers 429 / timeout / crashed child / exhausted
chain / non-Error throw / one-task-down-while-another-verifies / both categories in one
report, the `cancelled` category for a deliberate stop (`test/reliability.spec.ts`), and the
same 429 path through the **real PTC engine**
(`stopReason:'completed'` with a validated failed-task report — the exact opposite of the old
`'error'`), using the harness's new `reject` capability. Prepare-phase failures (E-34) take
the same route and are covered by the planner arm.

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
- Mitigation (**implemented in t29**, see DD-8a): every task may declare `writesPaths`; the
  scheduler serializes overlapping tasks and keeps the rest parallel. Read-only parallelism
  is *not* used, because a task cannot prove it writes nothing — only an explicit `[]`
  declaration says so, and that is the task's own claim, echoed in the report for audit.
- Concurrency: **effective = min(script pool, engine slots)** (R-13). The engine value is
  deployment config (default `min(16, cores-2)`), so the plugin can only tighten; read it
  for diagnostics rather than assuming equality.

### DD-8a — Write-path isolation for parallel tasks (U-4, t29)

The engine hands every child the same working directory (E-16), so "tasks are independent"
is only true if the plan says which paths each task writes. U-4 therefore makes the
declaration part of the plan and the scheduler honest about it.

**Three declaration states, deliberately distinct.**

| declaration | meaning | scheduling |
| --- | --- | --- |
| `['src/a.ts']` | known writes | runs in parallel with tasks that do not overlap |
| `[]` | the task declares it writes nothing | runs in parallel with everything |
| absent, or unparseable | unknown | conflicts with **every** other task (conservative) |

**Normalization is lexical and total** (`src/paths.ts`, mirrored inside the generated
script): backslashes become separators, `.`/`..` are resolved, repeated and trailing
separators collapse, and the result is lowercased. Nothing touches the filesystem, so a path
that does not exist yet compares correctly, and a case-insensitive filesystem cannot hide an
overlap behind a difference in case (the same comparison on a case-sensitive filesystem can
only serialize *more*, never less). Overlap is **segment-wise**: `src` covers `src/a.ts`,
while `src/a` does not cover `src/ab`.

**Scheduling** (`mapLimitIsolated` in the generated script) keeps `maxConcurrency` as an
upper bound — serialization only ever lowers concurrency — and keeps the plan order as the
tie-break, so the same plan reproduces the same schedule. When a plan declares nothing at
all, the plain pool is used: with no information, serializing everything would be a pure
slowdown (the documented trade-off; the caller can still declare paths to get the
serialization).

**Fail-safe boundaries.** A planner answer whose `writesPaths` is malformed degrades that
task to "unknown" instead of rejecting the task: losing a work item to a validation detail is
worse than serializing it. A *caller's* explicit `writesPaths` is validated strictly (wrong
type = a real input error, refused before any run starts).

**Audit.** Every task row in the report echoes the declaration it was scheduled from
(`writesPaths`, or `null` for unknown), so a reviewer can see why two tasks ran one after the
other.

**Evidence.** `test/paths.spec.ts` (15 cases) pins the predicate (same file, directory prefix,
segment boundary, case, `.`/`..`, root) and the scheduling consequence in the generated
script: non-overlapping tasks reach `maxConcurrency`, same-file tasks peak at 2 of 3,
directory-vs-file serializes to 1, an undeclared task runs alone (interval-checked, not just a
peak), a fully undeclared plan keeps pre-U-4 behaviour, and `maxConcurrency` is never
exceeded. The report echo is asserted shape-for-shape.

### DD-9 — Settings (stage 1) with the facts that make it operable

1. **DONE (t14).** Every user-editable field is `volatile()`; a non-volatile write remounts
   the plugin and kills an in-flight run (E-12). Structural fields stay plain and are named
   in the schema comment: `toolName` (fixed at registration), `enforceGate`/`gateRequired`
   (decide whether the gate exists at all) and `configVersion` (a wire contract).
2. **DONE (t14).** `snapshotConfig()` unwraps the `.volatile()` holders (`{get()}`) and
   `createConfigReader()` re-validates on every read, so exactly one shape reaches
   `resolveConfig()` — a hand-written patch value, a generated-form edit and a test default
   all look the same. Semantics, now pinned by tests: **a run snapshots its configuration at
   start** (`runWorkflow` receives a resolved snapshot, so limits cannot move under it), and
   **the next admitted message re-reads it** (tool `execute`, gate admission, queue bound,
   history bounds and answer strategy all read live). An edit that fails validation refuses
   that message with its exact reason, and delivery decisions fall back to the last good
   snapshot so an in-flight answer still lands (NR-8 below).
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

### DD-9a — Settings surface: the generated page IS the settings UI (阶段5, t13)

The task asked for a settings surface, or an honest record of why there is none. Both
halves are now answered from source, and the answer to "can an external plugin have its
own page" is **yes, generated from the schema it already exports** — so nothing was
hand-built and no display-only page exists.

**Contract (source-read in `@deepseek-ai/dsh@0.2.1-rc.2`, `dsh-settings`).** `ctx.settings`
is `SettingsForms`, a scheme-derived form service:

| Fact | Where | What it means for us |
| --- | --- | --- |
| `describe(options?)` returns `SettingsDescriptor[]` | `dsh-settings/lib/types/index.d.ts` | One descriptor per **Loader entry**: `{ ns: <profile entry id>, schema, value, base, user, revision, applies: 'live', autoGenerate, secrets? }` |
| `autoGenerate` is `presentations.get(fiber)?.auto ?? true` | `dsh-settings/lib/index.js` (`describe` path) | A plugin's page is generated by **default**; no client bundle is required for a schema-driven form |
| `ns` is `entry.options.id` | same | Our overlay row id (`grok-workflow`) is the namespace the form writes to |
| `update(ns, patch, expectedRevision?)`, `replace`, `mutate(ns, ops, expectedRevision?)` | types | Writes merge into that entry's config; `SettingsPathOp` (`set`/`unset` by path) exists precisely so a redacted reader can edit a nested field without restating secrets |
| `SettingsConflictError { code: 'SETTINGS_CONFLICT', expected, actual }` | types | A stale form is refused rather than silently overwriting a newer edit |
| `writable`, `documentPath`, `prepareDocument()` | types | Edits land in the **profile patch file**, which is a real, inspectable document |
| `configure({ auto }, owner?)` | types | Per-instance policy; `auto:false` suppresses the generated page |
| `describe({ redactSecrets: true })` + `redactSecrets` | types | Remote readers always see secrets redacted |

**Identifying our own descriptor (t30/F2, corrected in t31/F1).** No single signal
survives every runtime: the Loader entry id is not passed to `apply()`, and a volatile form
**rebuilds** the schema, so `form.toJSON().uid` differs from `Config.toJSON().uid` while the
descriptor is still ours. Identity is therefore layered — entry id when known, then schema
uid, then the projected `value` — and the view reports which path matched (`matchedBy`),
which the diagnostics line prints.

The value signal must be computed from what `describe()` actually projects:
`value = projectForm(volatileForm(schema), plainConfig(config))` keeps **only the 17
volatile fields**, so `toolName`, `enforceGate`, `gateRequired` and `configVersion` are never
present. The first attempt keyed on `toolName` and therefore **never** matched in a real
runtime: the diagnostics line kept saying the page was unreadable while the page existed
(t31/F1). The signal is now `roles` + `switchOn` (both volatile, together specific enough).

The test fixture is no longer hand-shaped — three separate hand-shaped versions were wrong
in ways that hid this bug. `test/settings-fixture.ts` applies the runtime's own projection
rules (`volatileForm`/`plainConfig`/`projectForm`, transcribed from
`@deepseek-ai/dsh-settings@0.2.1-rc.2` `lib/types/schema.js` because installing that package
pulls `@deepseek-ai/dsh-config-editor`, which breaks the real-Loader test), and
`test/settings-projection.spec.ts` pins the measured facts (17 fields, the structural four
absent, `{uid, refs}` schema, uid mismatch) and cross-checks the transcription against a real
`dsh-settings` whenever one is resolvable.

**What this plugin does with it (implemented, `src/settings.ts`).**

1. `declareSettingsSurface(ctx)` calls `ctx.settings.configure({ auto: true })` so the
   intent is explicit, and returns `declared` / `absent` / `unsupported`. It never fails
   the load: a minimal app has no settings service, and an older runtime may lack the hook
   (then we log "configure through the profile patch instead").
2. Because the page is generated from `Config`, **the fields a user edits are the fields
   the run reads** — `resolveConfig()` is the single reader, and the schema exports every
   key (`CONFIG_KEYS` is the same list, test-enforced). That is the anti-fake property the
   task demanded: there is no second, decorative source of truth.
3. `describeSelf(ctx, entryIds)` reads back our own descriptor (`ns`, `autoGenerate`,
   `applies`, projected field names) for diagnostics and tests, without a browser.

**Limitation, recorded rather than papered over.** The generated form is schema-shaped.
Our `roles` chains are arrays of objects, so the generated page edits them as an array of
small forms (add/remove entry, edit `provider`/`model` per entry) — usable, but there is
no model **dropdown** and no "test this route" button. A bespoke chain editor is possible
without touching the core: ship a client half by declaring `"dsh": { "client": { "platform": "web" } }`
in `package.json` and exporting `./client` (that is exactly how
`dsh-client-ui-settings-plugins` exposes its section, `dsh.client` + `exports['./client']`),
and let the host half own the namespace. It is **not** built here: it needs a bundled
browser artefact, a build step for the client entry, and a UI review nobody has asked for,
and every field it would edit is already reachable through the generated form. Demand for
the dropdown is U-6.

**Load-time validation (requirement: 配置错误 / 模型不存在 / 重复模型 / 空链 / 迁移).**

| Check | Behaviour | Evidence |
| --- | --- | --- |
| Unknown top-level key | **throws**, naming the closest accepted key (`maxRetires` → `maxRetries`) — a silently dropped typo is indistinguishable from a setting that "does not work" | `assertKnownKeys`, `test/config.spec.ts` |
| Config version | `configVersion` is validated into `[1, CONFIG_VERSION]`; a config written for a newer build is refused instead of half-applied | `resolveConfig` |
| Route shorthand (`worker: ['fast','slow']`) | normalized to `{model}` routes — one shape downstream (migration aid) | `normalizeRoute` |
| Empty chain | legal: means "inherit the run's route"; the effective chain is rendered in the report so it cannot masquerade as configured routing | `resolveChain`, DD-5 |
| Duplicate route in one chain | **throws** (`repeats the same route twice`) | `resolveChain` |
| Empty / over-long model or provider, chain > 3 | **throws** with the hard limit named | `resolveChain` |
| Unknown provider | **throws at load**, listing the known providers, when `llm.listProviders()` is non-empty (an empty registry means "not settled yet" → note, not failure) | `validateRoutes` |
| Model the provider enumerates but does not declare | **throws**, listing the declared ids. Declared models are read from the provider's own settings section (`llm.listConfigurableProviders()` → `{settingsNs, settingsPath}` → `ctx.settings.describe()` → `models[].id`); a provider that enumerates nothing keeps free-form model ids and only produces a note | `declaredModels` |
| No `llm` service in this runtime | note only — never a crash on load | `serviceOf` |

**Operational switches added with this stage.** `switchOn` (which failure classes advance
a chain; empty = the built-in policy, and content/setup classes are refused because they can
never be fixed by another model), `recordRuns` (write the routing ledger at all) and
`recordLimit` (0…256 entries, and 0 writes nothing). All three are read by the run, not just
echoed: `switchOn` is passed into the script args and consulted by the classifier,
`recordRuns`/`recordLimit` gate and bound `recordRouting`.

**Scope of `recordRuns` (stated, because it is deliberately narrow).** The switch governs the
**routing ledger** only — the `route` record that says which model was tried, in which order,
and why it was left. It does **not** govern the *delivery* record (the gate's `started`/
`delivered`/`failed` marker) or `alreadyRouted()` de-duplication. Those are correctness state,
not diagnostics: switching them off would let one user message start two workflows after a
restart, which is exactly the failure requirement A exists to prevent. Two tests pin this in
both directions (`test/reliability.spec.ts`: a ledger appears when `recordRuns` is true and a
route actually switched, and is absent when false; the delivery record is written either way).

**How a settings edit takes effect (F4, honest user-facing wording).** The descriptor reports
`applies: 'live'`, and with the `volatile()` holders of DD-9 items 1–2 that is now also what
the plugin does — but with two limits a user must know:

- An edit made through the settings form applies to the **next message**, never to a run that
  already started (a run snapshots its config at start so its limits cannot move under it).
- An edit made by hand in the profile **patch file** needs a **plugin reload**; only the
  runtime's in-place holder update is live.
- An edit that fails validation is not half-applied: the next message is refused with the
  field and reason, and an answer already in flight is still delivered from the last good
  snapshot.

### DD-9b — Reliability and safety guarantees (阶段6, t14)

Each guarantee below is one test in `test/reliability.spec.ts` (18 cases, plus the earlier
suites it complements). The rule applied throughout: a stop or a fault must be **reported**,
never swallowed, and never turned into a bare exception the transport can lose.

| guarantee | what the code does | proof |
|---|---|---|
| cancellation | the tool refuses from a subagent and honours `exec.signal`; the engine run is `cancel()`ed, and a caller abort becomes a `Cancelled` report with `category: cancelled` (report mode) or a `cancelled` error (throw mode) | `cancels…`, `files a deliberate stop under its own category…` |
| deadline | `timeoutMs` arms one deadline per run; expiry cancels the run and **returns a report** (`phase: Timeout`, `category: infrastructure`) — a deadline may succeed later, so it is never an exception | `turns a deadline into an infrastructure report…` |
| concurrency ceiling | `maxConcurrency` bounds the in-run pool (`mapLimit`); the measured peak never exceeds it | `never exceeds the configured concurrency inside one run` |
| duplicate start | one user message → at most one workflow, enforced by the durable delivery key (`started` written before the run, `delivered`/`failed` after) | `starts one workflow per user message even when pre-step fires again` |
| recursion | the tool refuses `delegationDepth > 0`, so a workflow cannot nest inside its own child | `refuses the tool from a subagent…` |
| context bounds | history is bounded by turns **and** characters, each message is truncated, and an over-long current request yields `undefined` instead of a truncated objective | `bounds forwarded context by turns, characters and the objective limit` |
| secrets | every report field is redacted before it leaves the run, and again when rendered; a provider error text carrying a key does not reach the report or the answer | `keeps a secret out of the failure reason and the rendered answer` |
| error records | a failed attempt records class + category + reason, and the routing ledger survives a malformed route entry (fields are coerced, not dropped) | `records every failed attempt…`, `keeps the ledger when one route entry is malformed` |
| partial completion | verified work is kept, the unfinished task is listed with its category, and `status` says `partial` | `keeps verified results and accounts for the task that did not make it` |
| unload | `dispose` aborts the shared controller, cancels every live run and refuses new tool calls (`… has been unloaded`) | `cancels in-flight runs and refuses new work when the plugin unloads` |
| reload | a fresh `apply()` on the same context starts with an empty queue and admits again — no inherited pending work | `starts clean after a reload instead of inheriting the old queue` |
| live configuration | `snapshotConfig`/`createConfigReader` unwrap holders, an edit lands on the next read, a broken edit throws with its reason while `lastGood()` keeps delivery working — and the gate's fallback is the **last good** snapshot, not the load-time one, so an applied edit survives a later invalid edit (t30/F1) | `unwraps volatile holders…`, `keeps the last good snapshot…`, `falls back to the last good snapshot, not the load-time config` |
| wiring, proven not assumed | the live scope edit, the tool's live `maxTasks`, and the `cancelled` category each have a case (t30/F3); the run-level failure summary counts `errors[].category`, so a deadline/cancel/unvalidatable report still prints a `Failures:` line (t30/F4) | `applies a live gate scope edit…`, `uses the live configuration for a tool call…`, `parses the cancelled category…` |
| surface diagnostics | the log line says whether the page is generated, how many fields it projects, what `applies` is, and whether the descriptor is really our schema (uid match) | `states the settings surface…` |

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
| OQ-006 | model identity and configuration source | **ANSWERED (t13)** — routes are validated at load against `llm.listProviders()` and, where the provider enumerates them, its declared model ids; a dropdown is a client-side concern (DD-9a, U-6) |
| OQ-007 | settings UI and persistence | **DOWNGRADED** — stage 1 (YAML + `volatile` + validation) is operable; the page needs a client package |
| OQ-008 | context, privacy, recursion | **PARTIALLY** — DD-3, DD-1 rules, `maxDepth` caveat |
| OQ-009 | failure reporting and partial results | **yes (t17)** — infrastructure vs quality vs configuration is explicit in the report (DD-6), and a failure never costs the rest of the report |
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
| OQ-021 | which message sources must the gate police | **OPEN (U-8)** — v1 covers `source.kind='user'` only; see the scope boundary in §D |

**Closed hypotheses (t19):** H-1 **PASS** (`providerRetryPolicy` readable → `mode:'always'`
self-check), H-2 **PASS** (`appendPluginRecord` has no runtime gate), H-3 **PASS** (scan cost
linear; **H-3b**: the cursor must be self-written), H-4 **PASS** (`prepend` wins over mount
order; without it our listener is never called), H-5 **config layer PASS / generic form
FAIL**.

---

## §D Disposition of the t10 acceptance findings

| # | finding | disposition |
|---|---|---|
| V-1 | an attachment-only message produced an empty objective and still burned a full run | **fixed**: an empty request is refused with an explicit `no text to route` notice and a `failed` delivery record (fail-closed, no bypass); test `refuses a message with no text instead of burning a workflow run` |
| V-2 | a queue-full refusal does not return the claimed message | **behaviour kept** (G-17: `inbox.claim` is irreversible); wording corrected — it is an *explicit refusal with no automatic retry; the client may resend manually* |
| V-3 | the gate only recognises `source.kind === 'user'` | **scope kept, documented** (below) and raised as **U-8** for the user to decide whether to widen it |
| V-4 | `installGate` fails open with a warning when the runtime has no `agent/pre-step` | **documented + switch added**: `gateRequired` (default `false`) turns the silent degradation into a load-time error; test `fails loading when the hook is missing and the gate is required` |
| V-5 | composed-bundle listeners (`session-controller:2516`, `goal-round-driver:311/346`) can decide before our `reject` | **known limitation** recorded; composed-bundle anti-bypass is its own item after phase 3–4 acceptance |
| t12-V5 | `recordRouting` writes only from the `completed` report branch, so an engine-level failure leaves no routing ledger | **documented** (DD-5, below) and covered by `writes no routing ledger when the engine failed before a report existed`: a failed run has no validated routes, and inventing one would fabricate evidence |

**Gate scope boundary (V-3).** The gate polices `agent/pre-step` batches that carry at
least one message whose `source.kind === 'user'`. Covered: CLI, Web GUI, headless (all
produce `user`-kind messages). **Not covered by design**: `user-question-reply`,
`team-message`, `webhook`, `schedule` and any other producer kind, subagent steps
(`header.origin === 'subagent'` or `delegationDepth > 0`), tool continuations (empty batch),
and sessions outside `gatePreset` when `gateScope === 'preset'`. Widening this is **U-8**.

---

## NOT_RUN ledger (never a premise)

Source-confirmed is **not** runtime-verified. These items were not measured and must not be
cited as working:

| # | item | level achieved | why it matters |
|---|---|---|---|
| NR-1 | web long-lived profile, delivery while the parent is idle | **partly closed by t25**: the one-shot half is measured both ways (E-38 works with `in-turn`, E-39 produces nothing with `relay`); the long-lived GUI half is still unmeasured | decides whether `relay`/`append` remain usable in the GUI at all — `in-turn` does not depend on it |
| NR-2 | relay fidelity over many samples | one exact-match sample (E-22) | relay wording is unverifiable by design; a sample of one is not a guarantee |
| NR-3 | `(a')` correct write order (after the turn closed) | the race was measured (E-26), the fix was not | the degraded strategy's viability |
| NR-4 | settings `update`/`replace`/`mutate` writing to disk through a real Loader entry | host-side contract source-read in `dsh-settings` (descriptor shape, `autoGenerate` default, path ops, `SETTINGS_CONFLICT`, `prepareDocument`); no write was performed | whether stage 2 can edit chains at all |
| NR-5 | failure-text classification against **real** provider errors (429/5xx/connection/timeout/model-unavailable) | the whitelist is exercised against synthetic messages only (`test/routing.spec.ts`) | a real adapter may word an error so that it lands in `unknown`; `unknown` still switches routes but is reported as unclassified |
| NR-6 | route switching with real children and real providers end to end | source-confirmed option plumbing (E-37) + simulated failures in the contract harness | whether a real provider/model combination actually starts and answers after a switch |
| NR-7 | the stock Web form rendering this plugin's `roles` (array-of-object) section against a live Loader | `SettingsForms` contract source-read; `describeSelf()` is now pinned to the **real descriptor shape** (`form.toJSON()` = `{uid, refs}`, no `properties` — t28/F1) with a fake context, but no GUI ever rendered the form | decides whether the generated page is usable for chains or whether U-6 (custom editor) is needed sooner |
| NR-8 | whether a **real settings-form edit against a live Loader** reaches a queued message, and what an in-flight run does with it | semantics implemented and unit-tested in t14 (`volatile()` holders + `createConfigReader()`: next admission re-reads, a started run keeps its snapshot, an invalid edit refuses with its reason and delivery falls back to the last good snapshot). E-40 now *does* measure the runtime half of the holder mechanism (the real Loader hands `{get()}` holders and the plugin unwraps them, in a real headless turn). What is still unmeasured is the last step — a settings-form `update()` mutating that holder in place while a message waits — because that needs the Web GUI | the code path is honest and tested; what remains unproven is the runtime's in-place update, so the user-facing sentence stays: a settings edit applies to the **next message**, a hand-edited patch file needs a reload |
| NR-9 | whether a **real planner model fills `writesPaths`**, and at what rate | one real headless run was made with an objective that explicitly asked for per-task write paths. The run did not finish inside the 900 s script timeout (it was still retrying task 1 of 2), so it produced no report — **and that timeout is not evidence in either direction**. What the session transcript does show is decisive for the field itself: the task the script handed the worker carried `"writesPaths": null`, i.e. the planner did **not** declare paths even when asked. n = 1, explicitly prompted | the mitigation is only automatic for plans that declare paths; with a planner that does not, `0.2.0` behaves exactly like the pre-U-4 scheduler. Anything stronger needs a measured fill-rate over many runs, and possibly a planner-prompt change — not a code change |

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
