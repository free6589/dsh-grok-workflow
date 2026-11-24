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
- User-perspective soak defaults to forking the live web profile: fork the
  current web profile into an isolated home, install the built plugin there,
  then operate from the user's viewpoint (send messages, check echo/visibility,
  confirm the captain preview, switch modes) instead of only a backend API soak.
  Never touch the live `~/.dsh` or restart the running instance; delete the
  scratch afterwards.
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


【主代理与子代理异步协作规则】

1. 主代理创建子代理后，必须记录每个子代理的 agent_id、任务、预期产出。

2. 子代理独立执行，主代理不得在派发任务后立即无条件进入 wait_agent 阻塞等待。

3. 主代理优先继续执行其他可以独立完成的工作，充分利用并行时间。

4. 子代理完成后，优先使用 DSH 原生 subagent completion notification 唤醒主代理，不要求用户手动催促。

5. 需要等待时，使用 wait_agent 等待事件，不要通过高频 list_agents 轮询状态。

6. 收到完成通知后，主代理必须读取子代理最终结果，检查任务是否真正完成，不能仅凭 inactive 状态认定成功。

7. 某个子代理失败时，只重新分配失败的任务，不要无条件重启其他已经完成的子代理。

8. 所有子代理完成后，主代理统一进行结果整合、交叉检查和最终汇报。

9. wait_agent 超时不代表子代理失败，也不代表子代理被终止。超时后重新判断任务状态。

10. 禁止为了等待子代理而结束整个主代理会话。

11. 主代理派发子代理后必须登记 agent_id、任务、预期产出与截止时间；正常情况靠 DSH 原生 completion notification 唤醒，不轮询。

12. 兜底心跳：超截止时间未收到完成通知，主代理主动查询一次任务状态；活着继续等，失败/丢失只重派失败块，不重启已完成部分。

## 10. Foreman layer

Multi-agent work runs inside a foreman layer. The foreman is a delegated agent
that owns one work block end to end; it is the only interface the main agent
talks to for that block.

- The main agent dispatches to the foreman and receives from the foreman. It
  does not manage the foreman's children directly; the foreman splits the block
  into subagents itself and owns their assignment, steering, and collection.
- The foreman distributes work and accepts results. It does not write code
  itself — no edits to source, tests, docs, or artifacts. When a piece needs
  hands, the foreman delegates it to a subagent and reviews the returned
  evidence.
- The foreman returns one whole, verifiable deliverable: the complete block,
  with the commands run and their results, not a progress log or a fragment a
  reviewer would have to finish.
- Merging happens only at the main agent. The foreman never merges into another
  block's work, never touches a branch it was not given, and never integrates
  two blocks on its own. The main agent collects finished blocks, cross-checks
  them, and owns the final integration.
- The deadline and heartbeat rules above apply to the foreman unchanged: it
  registers the subagents it spawns, waits on completion notifications rather
  than polling, and on a missed deadline the main agent checks the foreman once
  and re-dispatches only the failed part.

## 11. Auto-upgrade after a release

A successful release is not finished until the live profile runs the released
tag.

- After every release succeeds (tag pushed and the remote Release run is green),
  the main agent upgrades `dsh-grok-workflow` in the live profile to that new
  tag on its own. This step needs no further operator confirmation; the release
  instruction already authorizes it.
- Pin the upgrade to the exact tag or a file reference to the released build —
  never a floating range, `latest`, or a branch name. The installed version must
  read back as the released version, not "whatever resolves today".
- The upgrade touches only the plugin row. It must not modify other profile
  rows, unrelated settings, or the profile's layout, and it must not restart or
  otherwise disrupt the running instance beyond what the documented plugin
  mount requires.
- If the upgrade fails or the version does not read back as the released tag,
  roll the plugin row back to its previous pinned value and report the failure
  and the restored version. Never leave the live profile on a half-applied or
  unverified plugin state.
