# Overall Roadmap — Mandatory Workflow for DSH

Last updated: 2026-10-25

## 1. Purpose and working method

This roadmap is the project-wide plan for the next design and implementation phase of `dsh-grok-workflow`. It prevents the discussion from getting stuck on one technical detail before the full system has been considered.

**Working agreement**
- Design first, then implement in small, reviewable stages.
- Do not modify plugin implementation until the user explicitly approves starting implementation.
- After each discussion, update the roadmap or the detailed design log with the latest decision.
- Keep user-confirmed requirements separate from proposals and unverified assumptions.
- At each stage, agree on its goal and acceptance criteria before moving to code.

## 2. Overall product goal

Evolve the current DSH workflow tool into a reliable, configurable, mandatory workflow layer where every user message goes through the full workflow, with role-specific model selection, ordered fallback chains, transparent outcomes, and eventually a usable settings UI.

### Confirmed product requirements

1. Every user message must go through the full workflow, including greetings, easy questions, follow-ups, and complex tasks.
2. The main model must not be able to silently decide to bypass the workflow.
3. If the workflow cannot complete because all configured model routes fail, return an explicit failure result; do not silently answer through a normal direct path.
4. The design discussion must be recorded in the repository as it progresses.
5. Discussion comes before code changes; implementation requires the user's explicit go-ahead.

### Desired capabilities to design

- Choose models separately for planner, executor, verifier, and final-answer synthesis.
- Configure a priority-ordered fallback chain for each role.
- Switch models on eligible provider/model failures and record the reason for every switch.
- Distinguish infrastructure/model availability errors from task-quality or verification failures.
- Provide settings UI for workflow mode, role models, fallback chains, limits, and run diagnostics.
- Preserve relevant conversation context so short follow-ups remain understandable.
- Prevent recursion, duplicate workflow starts, runaway retries, and unbounded cost/latency.

## 3. Whole-system flow (target concept)

```text
Every user message
    |
    v
Mandatory entry/router (not a decision left to the main model)
    |
    v
Prepare bounded conversation context + validate request
    |
    v
Plan the task (even trivial messages go through this stage)
    |
    v
Execute subtasks using each role's model and fallback chain
    |
    v
Independently verify results against explicit criteria/evidence
    |
    +---- verification failure, retry allowed ----> bounded retry
    |                                               |
    |                                               v
    +<------------------------------------------ execute/verify
    |
    v
Synthesize final response from verified and incomplete results
    |
    v
Validate/report status + redact sensitive values + record diagnostics
    |
    v
Return response to user
```

If mandatory routing, planning, execution, verification, or final synthesis cannot proceed, the system must report the failure honestly. It must not silently bypass the required stages. Exact failure behavior at each boundary remains part of the design work.

## 4. Phased plan

The phases below are ordered by dependency. Some phases may overlap during research, but implementation should not jump ahead of unresolved architecture decisions.

### Phase 0 — Establish the requirements and project rules

**Goal:** Agree on the outcome before debating implementation details.

**Work**
- Maintain this roadmap as the overall source of truth.
- Keep detailed questions, decision records, and technical evidence in `WORKFLOW-DESIGN.md`.
- Record each item as confirmed, proposed, or awaiting technical validation.
- Make explicit that every-message strict mode is a user decision, not something to silently optimize away.

**Deliverable:** A complete high-level roadmap and a clear discussion/implementation boundary.

**Exit criteria:** The user agrees the overall roadmap is the right structure. Individual implementation choices may still remain open.

**Status:** In progress; roadmap written, user review pending.

### Phase 1 — Audit the exact current environment and constraints

**Goal:** Avoid designing against APIs the user's DSH version does not expose.

**Work**
- Audit repository code, plugin entry points, workflow API, subagent/model invocation, and profile composition.
- Verify capabilities against the exact target DSH release (`0.2.1-rc.2`) and the user's installed build; do not infer old-release support from upstream main.
- Identify whether mandatory entry can be enforced entirely by an external plugin, requires another DSH extension point, or needs an upstream/core integration.
- Verify how provider/model identifiers are represented and what error details survive a failed subagent call.
- Identify the supported way to provide conversation context and return the final response.

**Deliverable:** An evidence-backed compatibility report with each capability marked supported, unsupported, or unverified.

**Exit criteria:** All architectural blockers that could invalidate the target design are known; unresolved items are explicitly listed.

### Phase 2 — Design the target architecture and message lifecycle

**Goal:** Define the complete runtime before focusing on individual features.

**Work**
- Specify every stage from user-message arrival through final response.
- Specify the mandatory entry point and prevent any silent bypass.
- Define how one user message maps to one workflow run and how duplicate calls are prevented.
- Define how conversation history is selected, bounded, and passed to each role.
- Define recursion protection so child agents cannot start the entire workflow again.
- Define what happens if planning, a worker, verification, synthesis, or report validation fails.

**Deliverable:** Architecture diagram, stage contracts, lifecycle/state model, and failure-path table.

**Exit criteria:** There is an agreed, end-to-end design for both the success path and all important failure paths.

### Phase 3 — Design role-specific model routing and fallback policy

**Goal:** Make model choice and failure recovery explicit and configurable.

**Work**
- Define roles: planner, executor, verifier, and final-answer synthesizer; confirm whether every role needs a separate model call.
- Define per-role ordered model lists and the source of model IDs (preferably the configured DSH model catalog, if supported).
- Define eligible fallback errors: rate limit, server error, timeout/connection failure, unavailable model, malformed response, and other provider errors.
- Decide whether each error gets a same-model retry before fallback.
- Define maximum attempts, duplicate model handling, total-call/deadline budgets, and whether cooldown/circuit-breaker behavior is needed.
- Keep infrastructure failure separate from a task failing acceptance criteria.
- Record the actual model, provider, attempt, fallback reason, and final outcome without logging secrets.

**Deliverable:** A model-routing specification and example configurations for each role.

**Exit criteria:** The fallback policy has bounded behavior, explicit eligibility rules, and auditable outcomes.

### Phase 4 — Design settings and configuration experience

**Goal:** Make the system usable without requiring the user to manually edit configuration files.

**Work**
- Decide a staged approach: profile YAML/config first if needed, then a UI connected to the same configuration source.
- Design controls for strict mode, role-specific models, fallback order, concurrency, retries, timeout, and diagnostic detail.
- Decide how to validate unavailable model IDs and explain configuration errors.
- Define safe defaults and import/export or reset behavior where appropriate.
- Confirm whether the UI belongs in a plugin-specific page or DSH's existing settings UI, based on actual APIs.

**Deliverable:** Settings wireframe, configuration schema, validation rules, and persistence design.

**Exit criteria:** Every user-facing setting has a defined meaning, default, validation rule, and persistent source of truth.

### Phase 5 — Define reliability, safety, and observability

**Goal:** Ensure mandatory routing remains bounded and transparent under failures.

**Work**
- Define behavior for all models unavailable, deadline exceeded, cancellation, invalid plan, failed verification, partial completion, and report-generation failure.
- Define credential/context redaction and minimum necessary history passed to child agents.
- Ensure mandatory workflow cannot recursively call itself.
- Ensure concurrent or repeated messages cannot produce uncontrolled duplicate runs.
- Define limits for concurrency, task count, retries, total agents, overall duration, and model switching.
- Keep user-visible reports explicit about verified results, uncertainties, and incomplete work.

**Deliverable:** Failure policy, security checklist, diagnostic/report schema, and resource limits.

**Exit criteria:** Every identified failure has a bounded, testable behavior and does not create a silent bypass.

### Phase 6 — Implement in small, reversible increments

**Goal:** Build only after the previous designs and acceptance criteria are agreed.

**Suggested implementation order**
1. Add/verify interfaces for the mandatory entry mechanism.
2. Implement a single-message lifecycle with recursion and duplicate-run protection.
3. Add bounded context forwarding.
4. Add role-specific model selection.
5. Add per-role fallback and error classification.
6. Add explicit failure and partial-result reporting.
7. Add configuration schema and persistence.
8. Add the settings UI after the runtime configuration contract is stable.
9. Keep generated `lib/` artifacts synchronized with `src/`.

**Deliverable:** Small PRs or commits, each with focused tests and a clear rollback path.

**Exit criteria:** Each increment passes its acceptance tests and can be reviewed independently. Do not combine the entire project into one giant change.

### Phase 7 — Test the complete behavior

**Goal:** Verify observable behavior, not just helper functions.

**Test layers**
- Unit tests: model ordering, failure classification, bounded retries, redaction, report validation, configuration validation.
- Integration tests: exact DSH plugin loading, mandatory entry, child-agent calls, context forwarding, recursion prevention, and final response delivery.
- Fault-injection tests: 429, 5xx, timeout, connection failure, malformed structured output, all fallback models unavailable, verifier rejection, cancellation, and deadline.
- End-to-end checks on the exact supported DSH version with real configured models.
- Regression tests confirming that no user message silently skips the workflow.
- Cost/latency measurements for trivial messages, normal tasks, and multi-task workflows.

**Deliverable:** Test plan, results, compatibility statement, and known limitations.

**Exit criteria:** Critical success and failure paths are demonstrated on the target environment; tests do not rely only on fake agents.

### Phase 8 — Documentation, release, and rollout

**Goal:** Make the finished feature understandable, recoverable, and maintainable.

**Work**
- Update English and Chinese README files, architecture docs, configuration examples, and troubleshooting.
- Document the strict behavior and the additional latency/cost clearly.
- Record versioned changes in the changelog and publish a tagged release.
- Document rollback to the previous release and safe configuration migration.
- Update this roadmap and `STATE.md` with release evidence and remaining limitations.

**Deliverable:** Release-ready code, bilingual docs, changelog, test evidence, and rollback instructions.

**Exit criteria:** The release is reproducible, documented, and has a known recovery procedure.

## 5. How we will work through this roadmap

Use the following loop for each phase:

1. **Discuss:** explain the objective and options in plain language.
2. **Research:** inspect current code and exact-version API evidence when needed.
3. **Record:** write confirmed decisions, open questions, and evidence into the repository.
4. **Review:** ensure the user agrees with the phase's target and trade-offs.
5. **Implement:** only after explicit authorization.
6. **Test and record:** check results, update docs, and move to the next phase.

Do not skip from a local design question to implementation unless the user explicitly changes the plan.

## 6. Recommended immediate next step

First review and agree on this roadmap as a whole. Then begin **Phase 1: exact-version environment audit**. It is the next logical step because mandatory message routing, role-specific model selection, and fallback depend on the interfaces available in the target DSH build.

No plugin source implementation changes are authorized by this roadmap itself.
