# Workflow Design Discussion Log

Last updated: 2026-10-25

## Purpose

This document is the persistent memory for the ongoing design discussion about the next stage of `dsh-grok-workflow`. Update it as the discussion progresses so a future cloud or local agent can recover the user's decisions without relying on chat history.

**Working agreement:** discuss first, record decisions and open questions here, and do not change plugin implementation until the user explicitly asks to begin implementation. Updating this design document is allowed because the user specifically requested persistent notes.

Keep these categories separate:
- **Confirmed requirement:** explicitly chosen by the user.
- **Proposal:** a recommended design, not yet approved as final.
- **Open question:** needs more discussion or technical verification.
- **Implementation fact:** verified against the current repository or the exact DSH version; never infer it from a newer upstream branch alone.

## Confirmed requirements

### R-001 — Every user message must go through the full workflow

- **Status:** CONFIRMED by the user on 2026-10-25.
- Every user message must enter the full workflow, including greetings, simple factual questions, follow-up questions, and complex tasks.
- The main model must not be allowed to decide whether to call `grok_workflow`.
- A simple question may be represented by a single planned task, but it must still pass through execution, verification, and final synthesis.
- The system must not silently bypass the workflow or return to ordinary direct answering when the workflow or all model routes fail. It should report the failure clearly.
- Consequence acknowledged during discussion: this strict mode will increase latency and model calls, including for trivial messages.

### R-002 — Per-role model selection is a desired capability

- The user wants to be able to select which model is used for different workflow roles rather than having all child agents inherit a single parent model route.
- Candidate roles discussed: planner, executor/worker, verifier, and final-answer synthesizer.
- **Status:** desired direction; role boundaries and exact defaults still need discussion and technical validation.

### R-003 — Ordered model fallback is a desired capability

- The user wants an ordered chain such as `model-A -> model-B -> model-C`.
- If the current model is rate-limited or temporarily unavailable, the system should try the next configured model. Once a model returns a usable result, it should stop traversing the chain.
- The example model IDs used in discussion are illustrative only and have not been verified as available in the user's DSH configuration.
- **Status:** desired direction; exact failure classification, retry rules, and configuration still need discussion.

### R-004 — Visual settings are desired

- The user wants a settings page/UI for configuring workflow behavior, model roles, and ordered fallback chains instead of relying only on editing YAML.
- **Status:** desired direction; whether this should be a plugin-specific UI, an extension of DSH's existing settings, or a staged config-first implementation remains open.

### R-005 — Continue brainstorming before changing implementation

- The current phase is discussion and design only.
- Do not edit plugin source code, generated `lib/` files, tests, package metadata, or runtime configuration unless the user explicitly authorizes implementation.
- Update this document as decisions are made, and keep unfinished ideas visibly marked as proposals or open questions.

## Current design outline

This is a **proposal**, not a finalized architecture:

1. Intercept each user message at a hard routing/entry layer before ordinary main-agent answering.
2. Attach the current message and the relevant bounded conversation context.
3. Run a complete workflow: plan -> execute -> independently verify -> bounded retry if appropriate -> synthesize/report.
4. Use role-specific model selection, with a separately configured ordered fallback chain for each role.
5. Distinguish temporary provider/model errors (such as rate limiting, server errors, or connection timeouts) from task-quality failures (such as missing evidence or failed verification).
6. Return the synthesized result or an explicit failure report. Never silently skip the workflow.
7. Prevent recursive workflow invocation from child agents and prevent a single user message from starting duplicate workflow runs.

## Open questions to resolve

### OQ-001 — Exact mandatory-entry integration

Find the supported interception/entry interface in the exact target DSH version, currently recorded as `0.2.1-rc.2`. Newer upstream APIs are not proof that the installed release exposes the same API. Determine whether an external plugin can reliably enforce the entry behavior or whether a DSH integration/extension is required.

### OQ-002 — What exactly is the “full workflow” for every message?

The user chose that every message must run the full workflow. Still to specify: whether the planner must always be a separate model call, whether one-task plans are allowed for trivial questions, and exactly which stages are mandatory when a stage itself fails.

### OQ-003 — Final-answer generation and its fallback

Decide whether final synthesis uses the verifier's verified evidence directly, a dedicated final-answer model, or both. A failure of the final-answer model must not make the workflow silently bypass its guarantees.

### OQ-004 — Fallback error policy

Specify which failures trigger model switching: rate limits (for example HTTP 429), service errors (5xx), connection/timeouts, model unavailable, malformed structured output, and other errors. Decide whether malformed output first gets a same-model retry or immediately switches to the next model. Task verification failure should remain distinct from a provider outage.

### OQ-005 — Fallback chain behavior and limits

Specify per-role chain order, maximum attempts per model, whether duplicate models are prohibited, when to stop, how to report the actual model used, and how to prevent a long chain from multiplying costs indefinitely. Consider whether transient failures need a cooldown/circuit-breaker policy.

### OQ-006 — Model identity and configuration source

Validate model IDs against the user's actual DSH model/provider configuration. Decide whether the UI selects from the existing configured model catalog or permits manually entered provider/model identifiers. Do not assume the illustrative model names in chat are real, interchangeable, or configured.

### OQ-007 — Settings UI and persistence

Decide whether settings belong in a dedicated DSH UI, a plugin-provided configuration page, or initially in profile YAML with a later UI. Determine the persistent source of truth and how settings are validated.

### OQ-008 — Context, privacy, and recursion

Define how much chat history is sent to each role, how secrets are redacted, and how subagents are prevented from recursively invoking the whole workflow. Ensure that every user message is handled once even if downstream agents or follow-up calls occur.

### OQ-009 — Failure reporting and partial results

Define what the user sees when a model chain is exhausted, the plan cannot be generated, verification fails, or only some subtasks pass. Preserve verified partial results when appropriate but never label unverified work as completed.

### OQ-010 — Runtime cost and latency

The user has explicitly selected strict routing for every message, including trivial ones. Keep that requirement; do not silently replace it with a “smart bypass” mode. Instead, explore ways to keep the required workflow lightweight without skipping mandatory stages.

## Design discussion log

### 2026-10-25 — Initial requirements captured

- The existing plugin currently exposes `grok_workflow` as a tool, which means the main model can decide whether to call it; that is not sufficient for the user's mandatory-entry requirement.
- The user explicitly selected **all messages must use the full workflow**, including simple questions.
- Role-based model selection, ordered fallback chains, and a UI settings page were identified as desired capabilities.
- No implementation changes are authorized yet; continue brainstorming and updating this document.

## Overall roadmap

The project-wide sequence and acceptance gates are maintained in [WORKFLOW-ROADMAP.md](WORKFLOW-ROADMAP.md). Use that roadmap to choose the next phase before diving into a local design question. The current recommended next step is Phase 1: audit the exact target DSH version and available interfaces. Do not implement until the user explicitly authorizes it.
