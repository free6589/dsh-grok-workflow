# Technical Decisions

Each entry records the decision, evidence, alternatives, and status.

## D-001 — Build an external DSH bundle, not a DSH core patch

- **Status:** CONFIRMED
- **Date:** 2026-10-25
- **Decision:** Ship `dsh-grok-workflow` as an external npm-style bundle with a
  `dsh.bundle.patch` manifest, installed into a DSH profile with
  `dsh plugin --profile <name> add <package>`.
- **Evidence:** DSH `docs/user/develop/basic/publish.md` and
  `docs/architecture.md` define bundles, profiles, patch layers, and
  `dsh plugin`. The user also requires that DSH core is not modified.
- **Alternatives rejected:** Forking `deepseek-harness`; patching the DSH
  installation; requiring a privileged global install.
- **Consequences:** The plugin can only use documented DSH services and must
  remain compatible with the declared DSH version range.

## D-002 — Execute the strategy as a DSH workflow script, not a new agent engine

- **Status:** CONFIRMED
- **Date:** 2026-10-25
- **Decision:** The `grok_workflow` tool will generate a deterministic
  plain-JavaScript orchestration script and run it through
  `ctx.workflowEngine.start()`. Child agents are created by the engine's
  `agent()` hook, which delegates through DSH's subagent capability.
- **Evidence:** `packages/workflow/workflow/src/runtime-types.ts` defines
  `WorkflowStartRequest`/`WorkflowRun`; `packages/workflow/workflow-ptc`
  executes scripts with `agent()`, `parallel()`, and bounded child caps;
  `packages/subagent/subagent` owns child lifetime and cleanup.
- **Alternatives rejected:**
  - Porting Grok Build's Rust/Rhai workflow runtime (large, incompatible, duplicates DSH).
  - Implementing a new subagent scheduler inside the plugin (would duplicate DSH lifetime/admission logic).
  - Only emitting prompt advice with no executable workflow (would not meet the acceptance criteria).
- **Consequences:** Planning, verification, retry, status aggregation, and
  evidence validation live in the generated script and host-side validation,
  while execution and child lifecycle stay with DSH.

## D-003 — Bound concurrency and retries in the plugin contract

- **Status:** CONFIRMED
- **Date:** 2026-10-25
- **Decision:** `maxConcurrency` defaults to 3 and is schema-capped at 6;
  `maxRetries` defaults to 1 and is schema-capped at 3; `maxTasks` defaults to
  6 and is capped at 12.
- **Evidence:** User requirements; DSH workflow engine's own caps are
  deployment-level, so the generated script must enforce the tighter per-run
  contract itself.
- **Consequences:** The script uses a bounded worker pool and a bounded attempt
  loop. Exceeding a cap must fail validation, never silently increase it.

## D-004 — Verification is criterion-based and requires evidence

- **Status:** CONFIRMED
- **Date:** 2026-10-25
- **Decision:** A task is reported as `verified` only when the independent
  verifier returns `verdict: pass`, every acceptance criterion is marked met
  with non-empty evidence, and the verifier reports at least one concrete
  checked-evidence item. Missing/invalid evidence is a failure and consumes a
  retry.
- **Evidence:** User requires independent verification, not restating the
  executor's success claim; Grok Build's deep-research workflow independently
  re-checks claim IDs and sources.
- **Alternatives rejected:** Trusting the worker's `status` field; counting a
  verifier's bare `pass` without evidence.
- **Consequences:** Some legitimate results may be marked partial when a
  verifier cannot produce traceable evidence. That is the intended fail-closed
  behavior.

## D-005 — Do not embed Grok Build's Rhai runtime

- **Status:** CONFIRMED
- **Date:** 2026-10-25
- **Decision:** Reuse Grok Build's workflow *strategy* (plan → bounded fan-out →
  independent verification → synthesis), not its Rust implementation.
- **Evidence:** Grok Build's workflow manager is tightly coupled to
  `xai_grok_shell`, `xai_workflow`, journals, Rust cancellation tokens, and
  Grok-specific subagent/task hooks. DSH already provides a sandboxed workflow
  engine and subagent seam.
- **Consequences:** Pause/resume/journaling and Grok's budget leases are out of
  scope for the MVP; cancellation/unload and per-run bounds remain in scope.


## D-006 — README landing page and language toggle

- **Status:** CONFIRMED; PR #16 merged as `ea3e8e31`.
- **Date:** 2026-10-25.
- **Decision:** Keep root `README.md` as the English landing page and add `README.zh-CN.md` as the complete Simplified Chinese version. Add reciprocal language links near the top of both pages. Include a simple workflow illustration in each language; keep detailed configuration, architecture and acceptance material in `docs/`.
- **Reason:** New users should see the purpose, exact prerequisites, one-command GitHub installation, one natural-language example, workflow stages and troubleshooting before advanced implementation detail.
- **Alternatives:** Keep one long bilingual README (harder to scan); move English to another filename (would remove the default GitHub landing page); use remote screenshots (adds external image dependency).
- **Impact:** Adds a second README and two small SVG assets; package `files` allowlist includes the Chinese README. Install compatibility requirements are unchanged.

## D-007 — Allow a verified fallback task to remain `partial`

- **Status:** CONFIRMED; fixes issue #17.
- **Date:** 2026-10-25.
- **Decision:** Host report validation permits `partial` with all tasks verified
  when `plan.source === 'fallback'`, provided the plan error is non-empty. A
  fallback plan still can never be `completed`. For `caller` and `planner`
  plans, `partial` retains the stricter mixed verified/failed requirement.
- **Reason:** The generated script deliberately degrades planning to a
  single-task fallback and reports `partial` even when that task verifies. The
  host invariant previously assumed every `partial` report had a failed task,
  so it rejected a legitimate, intentionally conservative result. Verification
  success and planning provenance are independent signals.
- **Alternatives rejected:** Reporting the fallback run as `completed` (hides
  degraded planning); dropping the fallback task's verification (discards real
  evidence); accepting `partial` with no planning error (loses provenance).
- **Consequences:** The canonical report can be `partial` with
  `verifiedCount === tasks.length` only for a fallback plan; every other
  all-verified `partial` report remains invalid.
