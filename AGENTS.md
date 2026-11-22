# AGENTS.md — dsh-grok-workflow

This repository is the shared, durable memory and source of truth for the
`dsh-grok-workflow` plugin. Local and cloud agents MUST read this file before
changing code and MUST update the memory files before ending a work session.

## 1. Session startup

1. Read `AGENTS.md`.
2. Read `docs/knowledge/STATE.md`, `DECISIONS.md`, `HANDOFF.md`, `VALIDATION.md`.
3. Read `docs/ARCHITECTURE.md`, `docs/ACCEPTANCE.md`, `docs/knowledge/RESEARCH.md`
   when the task touches design, behavior, or verification.
4. Run `git status --short --branch`, inspect the latest commits, and check
   GitHub Issues/PRs relevant to the task.
5. Compare the memory with the actual code and test logs. Memory never
   overrides observed reality.

## 2. Status vocabulary

Use these labels in memory files and reports:

- `CONFIRMED` — directly observed in source, a real command, or a real test.
- `HYPOTHESIS` — plausible but not yet verified.
- `NOT_RUN` — intentionally not executed yet.
- `BLOCKED` — cannot proceed without an external capability or decision.

Never write a claim as confirmed when only reasoning or a plan supports it.

## 3. Verification

- Every reported test result must name the exact command, environment, and result.
- A command that was not executed is `NOT_RUN`; a command that could not run is
  `BLOCKED` with the error.
- Unit tests must be deterministic and must not require an online model.
- Real installation, loading, and interaction on this machine are required
  before marking local acceptance pass.
- Mock only expensive or nondeterministic boundaries (for example, a model or
  network). Keep the registry, Loader, and plugin lifecycle real wherever the
  test claims to cover them.
- A child's self-report is not verification. Verification must inspect
  evidence, files, commands, or independent sources.
- Live-profile soak: before calling a change done, copy the live profile into
  an isolated home (`DSH_HOME=<scratch>`, never the live `~/.dsh`), install the
  built plugin there, and run one real workflow end to end with a live model.
  Never write the live home or restart the running instance for this; delete the
  scratch home afterwards.
- Keep scratch output out of the tree: use `.tmp/` (gitignored), never the repo
  root, `docs/`, or `src/` for probes, dumps, or screenshots. Prefer a
  single-run `mktemp -d` and remove it when done.
- Before ending a session, `git status --short` must show no test leftovers:
  no `*.log`, `*.tgz`, `*.bak`, `*.orig`, `*~`, harness HTML/PNG, or copies that
  only served one claim. Durable evidence goes under `.rsi/evidence/` or
  `docs/knowledge/evidence/` and is referenced from `VALIDATION.md`; everything
  else is deleted, not committed.
- Never commit a scratch file "temporarily" to carry it across steps — use the
  staging path (`.session-stage/`, gitignored) or pass it through the session.

## 4. Architecture

- This plugin is an external bundle. It must not fork or reimplement the agent
  loop, and must not modify the core repository. Use documented extension points
  only.
- The primary execution path is a workflow script executed by the workflow
  engine; child work is created through the engine's `agent()` hook, which uses
  the subagent capability.
- Concurrency is bounded per run: default 10, hard maximum 100. Retries are
  bounded: default 1, hard maximum 3. No unbounded loops.
- Verification is independent from execution and must validate evidence per
  acceptance criterion.
- Plugin unload must cancel/dispose active workflow runs and release all
  registrations. No ownerless background work.
- Keep the plugin inert when its bundle row is not mounted.

## 5. Execution safety

- Never write secrets (keys, tokens, passwords, `.env` contents, private keys,
  unredacted credentials) into source, tests, docs, Issues, commits, logs, or
  reports.
- Do not read or print credentials unless a task strictly requires a boolean
  presence check. Never echo their values.
- Never bypass approval, sandbox, permission, or tool-policy controls.
- Never touch the core/kernel during any execution (runs, investigations,
  reproductions, verifications), and never restart, reload, kill, or otherwise
  disrupt the running service. Verify in a new profile, on a new port, in a new
  instance; touch the live instance only with explicit operator approval.
- Do not publish to npm, create releases, or change repository visibility
  without explicit operator authorization.
- Do not force-push, rewrite shared history, or push over an unknown remote.
  Inspect the remote first.
- One task, one branch. Never open a branch for a task another live branch
  already covers — check `git branch -a` first.
- Delete a branch within 24h after its PR merges. A merged branch left alive is
  litter. Long-running experimental branches (`rsi/*`, `feat/*`) get a decision
  date in `HANDOFF.md`: merge, rebase, or delete by then.

## 6. Memory

Update memory immediately when a durable fact changes:

- New architecture/source fact → `docs/knowledge/RESEARCH.md`.
- Important choice with alternatives → `docs/knowledge/DECISIONS.md`.
- Bug, security issue, or failed test → `docs/knowledge/VALIDATION.md` and/or
  `STATE.md`.
- Meaningful phase completed → `docs/knowledge/STATE.md`.
- Hand-off to another agent → `docs/knowledge/HANDOFF.md`.

Before ending a session: update `STATE.md`, `HANDOFF.md`, and the relevant
validation/decision/research records, then commit and push shareable changes.

## 7. Releases

- On an explicit release request, run the full five-step flow without stopping
  to ask: `npm run ci` (must exit 0) → create annotated tag `vX.Y.Z` on the
  release commit → push `main` → push the tag → watch the remote Release run
  until success, then close out memory docs. Report only when done or blocked.
- Never skip the CI gate, never push a tag before CI passes locally, and never
  leave a pushed tag unwatched.
- Record each user-visible change under `[Unreleased]` in `CHANGELOG.md`, in
  both English and Simplified Chinese.
- Bump `package.json` and `package-lock.json` together when preparing a
  release, and update the matching changelog section.
- Use version tags in the form `vMAJOR.MINOR.PATCH`. Publish only from a merged
  `main` commit after CI passes.
- The Release workflow must validate the tag against `package.json`, run tests,
  verify committed `lib/` artifacts, require matching changelog notes, and only
  then create a GitHub Release.
- Never move or overwrite a published tag. Git history helps recovery but is
  not a substitute for an independent repository backup. Never commit
  credentials or private runtime data.

## 8. Coordination

Use the `[COORDINATION] Cloud ↔ Local Agent` issue for task assignment and
status. Use PRs for reviewable code. Every status comment must use this block:

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

## 9. Talking to the operator

- The operator is not a programmer. Use plain everyday language: conclusion
  first, one or two sentences of why, then whether it matters and whether
  anything needs doing.
- No code details: no file paths, line numbers, function names, raw error
  text, or implementation internals. Translate any unavoidable technical term
  into plain words first.
- Use everyday analogies, never jargon.
- Answer yes/no questions with "yes" or "no" first, then explain. Never circle.
