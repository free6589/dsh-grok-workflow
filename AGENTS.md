# AGENTS.md — dsh-grok-workflow

This repository is the shared, durable memory and source of truth for the
`dsh-grok-workflow` plugin. Local and cloud agents MUST read this file before
changing code and MUST update the memory files before ending a work session.

## Start every task in this order

1. Read `AGENTS.md`.
2. Read `docs/knowledge/STATE.md`, `DECISIONS.md`, `HANDOFF.md`, `VALIDATION.md`.
3. Read `docs/ARCHITECTURE.md`, `docs/ACCEPTANCE.md`, `docs/knowledge/RESEARCH.md` when the task touches design, behavior, or verification.
4. Run `git status --short --branch`, inspect the latest commits, and check GitHub Issues/PRs relevant to the task.
5. Compare the memory with the actual code and test logs. Memory never overrides observed reality.

## Status vocabulary

Use these labels in memory files and reports:

- `CONFIRMED` — directly observed in source, a real command, or a real test.
- `HYPOTHESIS` — plausible but not yet verified.
- `NOT_RUN` — intentionally not executed yet.
- `BLOCKED` — cannot proceed without an external capability or decision.

Never write a claim as confirmed when only reasoning or a plan supports it.

## Truth rules for tests

- Every reported test result must name the exact command, environment, and result.
- A command that was not executed is `NOT_RUN`; a command that could not run is `BLOCKED` with the error.
- Unit tests must be deterministic and must not require an online model.
- Real DSH installation, loading, and interaction must be executed on this machine before being marked local-acceptance pass.
- Mock only expensive or nondeterministic boundaries (for example, a model or network). Keep the DSH tool registry, Loader, and plugin lifecycle real where the test claims to cover them.
- A child's self-report is not verification. Verification must inspect evidence, files, commands, or independent sources.

## Security and safety

- Never write API keys, tokens, passwords, `.env` contents, private keys, or unredacted credentials into source, tests, docs, Issues, commits, logs, or reports.
- Do not read or print credentials unless a task strictly requires a boolean presence check. Never echo their values.
- Never bypass DSH approval, sandbox, permission, or tool-policy controls.
- Never modify the DSH core repository to make this plugin work. Use documented extension points only.
- Do not publish to npm, create releases, or change repository visibility without explicit user authorization.
- Do not force-push, rewrite shared history, or push over an unknown remote. Inspect the remote first.

## Architecture invariants

- This plugin is an external DSH bundle. It must not fork or reimplement the DSH agent loop.
- The primary execution path is a workflow script executed by `ctx.workflowEngine`; child work is created through the engine's `agent()` hook, which uses DSH's subagent capability.
- Concurrency is bounded per workflow run: default 3, hard maximum 6. Retries are bounded: default 1, hard maximum 3. No unbounded loops.
- Verification is independent from execution and must validate evidence per acceptance criterion.
- Plugin unload must cancel/dispose active workflow runs and release all registrations. No ownerless background work.
- Keep the plugin inert when its bundle row is not mounted.

## Memory update cadence

Update memory immediately when a durable fact changes:

- New architecture/source fact → `docs/knowledge/RESEARCH.md`.
- Important choice with alternatives → `docs/knowledge/DECISIONS.md`.
- Bug, security issue, or failed test → `docs/knowledge/VALIDATION.md` and/or `STATE.md`.
- Meaningful phase completed → `docs/knowledge/STATE.md`.
- Hand-off to another agent → `docs/knowledge/HANDOFF.md`.

Before ending a session: update `STATE.md`, `HANDOFF.md`, and the relevant
validation/decision/research records, then commit and push shareable changes.

## GitHub coordination protocol

Use Issue `[COORDINATION] Cloud ↔ Local Agent` for task assignment and status.
Use PRs for reviewable code. Every status comment must use this block:

```text
FROM: local | cloud
TO: cloud | both | local
TASK: #<issue-number>
BASE_COMMIT: <sha>
WORK_COMMIT: <sha-or-none>
CHANGES: <actual changes>
TESTS_RUN: <actual commands>
TEST_RESULTS: PASS | FAIL | NOT_RUN
LOCAL_RUNTIME_VERIFIED: yes | no
BLOCKERS: <specific blocker or none>
NEXT_ACTION: <one clear next action>
```

If a push failed, say which files are unsynced and why. Never imply that a
remote agent can see local-only commits.
