# Validation Log

Real commands and results only. Do not add expected results here.

## Profile update to the published release — 2026-11-20 — repo had nothing to pull, profile moved `#v0.12.1` → `#v0.12.2`, host never restarted (`CONFIRMED`)

**Change:** the `web` profile pinned `dsh-grok-workflow` at `github:free6589/dsh-grok-workflow#v0.12.1`
(installed `0.12.1`); it now pins `#v0.12.2`. The repository itself needed no change.

| command | result |
| --- | --- |
| `git fetch --tags --prune origin` then `git rev-parse HEAD origin/main` | both `07666fb375fbbafb991bbe9d9ebb69d82b841493` — nothing to fast-forward |
| `git ls-remote --tags origin 'refs/tags/v0.12*'` | newest is `refs/tags/v0.12.2` → `40228c551f115ee027a6a60a3d8bc27d7c8c4000`; no newer tag exists on the remote |
| `git merge-base --is-ancestor v0.12.2 HEAD` | exit 0 — the tag is an ancestor; `git describe` = `v0.12.2-2-g07666fb`, `v0.12.2..HEAD` = two docs commits (`074e2c3`, `07666fb`) touching only `docs/knowledge/{HANDOFF,STATE,VALIDATION}.md` |
| `curl api.github.com/repos/free6589/dsh-grok-workflow/releases?per_page=3` | latest = `v0.12.2`, published 2026-11-19T23:52:31Z, draft `False`, prerelease `False`, asset `dsh-grok-workflow-0.12.2.tgz` (596 412 bytes, `uploaded`) |
| `curl .../commits/40228c5…/check-runs` | `Validate and publish v0.12.2` success · `Node 22` success · `Node 24` success |
| `curl .../actions/runs?head_sha=07666fb…` | `CI` success, run `44641483552` |
| `dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.12.2` | exit 0 in 8.9 s — downloaded `codeload.github.com/free6589/dsh-grok-workflow/tar.gz/40228c551f115ee027a6a60a3d8bc27d7c8c4000`, `Packages: +2` |
| `dsh plugin --profile web ls dsh-grok-workflow --depth 0` | `dsh-grok-workflow@0.12.2` |
| `grep -A3 'dsh-grok-workflow:' pnpm-lock.yaml` | `specifier: github:free6589/dsh-grok-workflow#v0.12.2` · `version: https://codeload…tar.gz/40228c551f115ee027a6a60a3d8bc27d7c8c4000` |
| per-file `sha256sum` of every shipped `lib/**/*.js`+`*.d.ts` vs repo `lib/` | `identical=77 differing=0` (the tarball ships no `*.map`, matching `files` in `package.json`) |
| `ps -o pid,lstart,etimes -p 154637` before/after | pid `154637`, `lstart` `Tue Nov 17 22:49:32 2026` unchanged, `etimes` 206082 → 206168 s; `/proc/sys/kernel/random/boot_id` unchanged, `uptime -s` still `2026-10-31 07:18:12` |
| `curl -o /dev/null -w '%{http_code}' http://100.111.111.88:3080/` | `HTTP 401` — the host is answering (auth-gated), not restarted |
| `grep -rln 'fs\.watch\|chokidar\|watchFile'` in the DSH core package | 0 hits — the core does not watch profile files, and `docs/RELEASING.md` states a profile restart is needed after switching versions |

**Not active yet:** the on-disk profile is `0.12.2`; the live host keeps the `0.12.1` module graph
until the profile is rebooted, which this task forbade.

**`NOT_RUN`:** DSH restart/reload, force-push, any tag move, npm publish
(`registry.npmjs.org/dsh-grok-workflow` still 404), DSH core edits (that tree is not a git repo and
had no file modified in the preceding 3 hours).
### Re-verification pass, 2026-11-20T08:15–08:20 +08:00 (independent of the first pass)

| command | result |
| --- | --- |
| `git rev-parse HEAD origin/main` · `git status --porcelain=v1 -uall` | both `5bd5bfe9afc3cda1d1777c3431d742b354b86ca9`; porcelain output empty |
| `git rev-parse v0.12.2 'v0.12.2^{}'` vs `git ls-remote origin 'refs/tags/v0.12.2*'` | `6853d60…` / `40228c5…` on both sides — the published tag was not moved |
| `git describe --tags` · `git log --oneline v0.12.2..HEAD` | `v0.12.2-4-g5bd5bfe`; four docs commits (`074e2c3`, `07666fb`, `09c2bc9`, `5bd5bfe`) |
| `git diff --name-only v0.12.2..HEAD -- src lib test package.json` | 0 files — the shipped code is byte-identical to the release tag |
| `curl …/releases?per_page=5` · `curl -sI …/releases/latest` | `v0.12.2` still newest (published 2026-11-19T23:52:31Z, asset `dsh-grok-workflow-0.12.2.tgz`); `/latest` → `302 …/tag/v0.12.2` |
| `curl …/commits/{40228c5,5bd5bfe}/check-runs` | tag commit 3/3 success (`Validate and publish`, `Node 22`, `Node 24`); `HEAD` 2/2 success |
| `curl -I releases/download/v0.12.2/dsh-grok-workflow-0.12.2.tgz` | HTTP 200 — the published asset is downloadable |
| sha256 walk, repo `lib/` vs `node_modules/dsh-grok-workflow/lib` | `identical=77 differing=0 missing=0 extra=0` |
| `curl registry.npmjs.org/dsh-grok-workflow` (+ `/latest`) | HTTP 404 on both — nothing was published |
| `find <DSH core> -newermt '-14 hours' -type f` | 0 files — the core tree was not touched (it is not a git repo) |
| `ps -o pid,lstart,etimes -p 154637` | pid `154637`, `lstart` `Tue Nov 17 22:49:32 2026`, `etimes` `206772`; boot_id `9d066162…`, `uptime -s` `2026-10-31 07:18:12` |
| `ss -ltnp` (3080 rows) · `curl --max-time 5 :3080` | `100.111.111.88:3080` still owned by pid `154637`; `HTTP 401` |

**Unchanged conclusion:** no newer tag or Release appeared between the two passes, so there was
still nothing to fast-forward, and the profile was already pinned at `#v0.12.2`. This pass added no
repository or profile change beyond these records.


## Self-iteration default template — 2026-11-20 — the document, the constant and the bundle agree, and the switch stores it (`CONFIRMED`)

**Change:** `DEFAULT_ITERATE_TEMPLATE` was a twelve-line generic prompt; it is now the
round prompt in `docs/iterate-template.md` (3 239 characters).

| command | result |
| --- | --- |
| `npx vitest run test/iterate-template.spec.ts` | 7 passed — doc fence equals the constant byte for byte, length ≤ `MAX_LOOP_PROMPT_CHARS` (4000), POOL-before-TODO-before-GitHub-before-papers order, "at least one item per round", small/big split with `RESEARCH` + pool approval + "never cite a paper", `R1`/`R6`/`npm run ci`/`npm run verify:lib`/`copied profile`/`NOT_RUN`, exactly four numbered brakes, forbidden zones |
| `npx vitest run test/client.spec.ts test/loop-surface.spec.ts test/iterate.spec.ts` | 134 passed — the bundle's `iterateTemplate.def` equals the constant (existing pin), the iterate route answers `status` without arming either row, open stores the template, close deletes only its own row |
| `npm run ci` | exit 0 · **68 files / 1227 tests PASS** · typecheck 0 errors · oxlint 24 warnings / 0 errors |
| `npm run verify:lib` (post-commit) | `lib/ at 23d3369 is the build of src/ at 23d3369` — 153 files byte-identical |
| `.rsi/evidence/round-025/live-iterate.mjs` on the copied profile `loopfix-verify` `:3451` | PASS — real bundle switch over the real page fetch: open wrote one `RSI heartbeat` row of 3 239 chars byte-equal to the default, close deleted that row and nothing else, a second cycle was equally clean; `~/.dsh/storages/schedule.json` afterwards held only the operator's pre-existing row |

**Redaction:** the boot log in the bundle has the printed `token=` value, `dsh-auth-…` names and
`v1.eyJ…` cookie values replaced with `<redacted>`; the cookie jar lived under `/tmp/gwfx25/`,
was never copied into the bundle and was deleted with the instance.

**`NOT_RUN`:** a real scheduled delivery of the row (one interval of real time, operator's call),
and a manual browser click-through with a screenshot.

## Intake audit — 2026-11-19 — a 2 041-character task prompt stalls a fresh session by its first line, not by size (`CONFIRMED`)

**Report:** a stored team task prompt was pasted into a fresh session and the session did
nothing. Candidate causes were prompt size, formatting, code fences, embedded control lines, or a
workflow-engine input limit.

**Measured (`CONFIRMED`, `docs/knowledge/evidence/prompt-intake-2026-11-19/`):**

| command | result |
| --- | --- |
| `python3 docs/knowledge/evidence/prompt-intake-2026-11-19/measure-intake-stall.py` | 40 `/grok` invocations in this workspace's sessions; 3 carried more than 200 characters: **2 041 chars / 3 697 bytes** (`session-042dfe19`, seq 4) and **2 032 / 3 688** twice (`session-b7be2bd2`, seq 2944 + 2953). Every one settled `error` = `Usage: /grok [on|off]`. `session-042dfe19` holds 7 events total and **no** `user/message` event. |

**Size is exonerated:** 2 041 characters is 6.4 % of `TASK_LIMITS.objectiveChars` = 32 000
(`src/input.ts:17`, stated by the tool description `src/index.ts:175`, enforced at the gate
`src/gate.ts` `refusalOf`). Nothing was truncated — the host stored the argument whole (3 697
bytes) in `command/run.args`.

**Cause (`CONFIRMED`, source-level):** `@deepseek-ai/dsh-commands` `parseCommand`
(`lib/types/index.js`, regex `/^\/([a-z][a-z0-9_-]*)(?=$|[\t\n\r ])/u`) reads the message's first
line as a command and returns `rawInput = line.slice(match[0].length)`. The stored prompt's first
line is `/grok 团队任务：…`, so the handler receives the whole 2 031-character body as its
argument; the pre-fix grammar answered any argument other than `on`/`off` with one usage line and
returned — no message, no `agent/pre-step`, no run. One session also carried `/grok on /grok
团队任务：…` (the toggle word plus the prompt in one line), which fails the same way.

**Red → green (`CONFIRMED`, `npx vitest run test/intake.spec.ts test/command.spec.ts
test/objective-limit.spec.ts`):** with `src/command.ts` + `src/gate.ts` reverted to the previous
behaviour, 8 tests fail (`red-full.log`); with the fix, 3 files / 50 tests PASS. Full
`npm run ci` exit 0 = **66 files / 1195 tests PASS** (`ci.log`).

**Not covered (`NOT_RUN`):** a live GUI paste of the same prompt through the fixed build (the
shared working tree has other writers this round; the handler-level tests drive the real
handler, the real `Session`, and the real gate).

## Round 63 — 2026-11-19 — `0.11.17` 发版 + tag 安装验证 + 本机 GitHub 更新（`CONFIRMED`）

**范围**：把常驻并行监护（guardian）走 patch 发版（`0.11.16` → `0.11.17`），验证
tag 从 GitHub 可装可用，再把本机 `web` profile 的插件经 GitHub 更新到该 tag。
证据 `.rsi/evidence/round-018/`（`release-ci.txt` + `install/`）。

**版本判定**：patch。guardian 是用户可见的新增能力，但配置面、报告 schema、
5 角色语义（D-056）都没变——按 `docs/RELEASING.md` 版本规则走 patch，不走 minor。

**命令与结果（`CONFIRMED`，本机实跑）**：

| 命令 | 结果 |
| --- | --- |
| `python3 .rsi/tools/bump-version.py 0.11.17` | `declared(en=1,zh=1) pins(en=2,zh=2) lists(en=1,zh=1) bare(en=1,zh=1) local-testing.tgz=3 published=42` |
| `npm run ci`（发版前全量） | exit 0，**63 文件 / 1154 测试 PASS**，lint 22 warnings / 0 errors（`.rsi/evidence/round-018/release-ci.txt`） |
| `git diff --exit-code -- lib/` | exit 0（幂等；`lib/guardian.*` 已随上轮提交入库） |
| `git commit` + `git tag -a v0.11.17` + `git push origin main` + `git push origin v0.11.17` | `5fc3e1d` 推上 `main`（`4de7a7a..5fc3e1d` 快进）；tag `97df6ca` 新建，无 force-push，旧标签未动 |
| 远端 CI（`gh run list --branch main`） | `44459682983` success（release commit）；Release 已建：`Grok Workflow for DSH v0.11.17` + asset `dsh-grok-workflow-0.11.17.tgz`（`gh release view v0.11.17` 可见） |
| `PORT=3442 bash .rsi/evidence/round-018/install/20-run-install.sh` | `run complete`；安装命令是 `dsh plugin --profile acc-tag add github:free6589/dsh-grok-workflow#v0.11.17`（无本地路径），exit 0 |
| tag 安装验收（隔离 profile，见 `install/00-conclusion.md`） | **PASS 10/10**：行激活、投影 11 键（`11 of 13 field(s)`）、双工具、`loop` open/status/close + 400/401/405、`lib/guardian.js` 逐字节一致、client 三处一致、无凭据落盘 |
| `DSH_HOME=/home/fish/.dsh dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.11.17` | exit 0（7.7s）；`0.11.13` → `0.11.17`；guardian.js sha256 `072068d4…` 两侧一致；`--dump-config` 的 `grok-workflow` 行正常 |
| `rm -rf .tmp/r18` | scratch 已删（含 launch token 与 cookie jar） |

**未验证（`NOT_RUN`，与上轮相同）**：rrule 定时到点；真模型跑整轮；GUI 点击；
unload/归档监听的 firing（操作体 CONFIRMED）。

## Round 63 — 2026-11-19 — 常驻并行监护落地（`CONFIRMED`，未发版）

**范围**：监督从串行环节（`执行 → 检查 → 监督 → …`）改为常驻并行监护。
新增 `src/guardian.ts`、`test/guardian.spec.ts`；`src/run.ts` 接线；
`docs/knowledge/RESEARCH.md` A29、`DECISIONS.md` D-074、`docs/ARCHITECTURE.md`
三处、`README.md` / `README.zh-CN.md`、`CHANGELOG.md [Unreleased]` Added 双语；
`src/script.ts`（串行 supervisor）零改动。证据 `.rsi/evidence/round-018/`。

**命令与结果（`CONFIRMED`，本机共享树实跑）**：

| 命令 | 结果 |
| --- | --- |
| `npm run ci`（基线，改前） | exit 0，**62 文件 / 1142 测试 PASS**（`.rsi/evidence/round-018/baseline-ci.txt`） |
| `npx vitest run test/guardian.spec.ts` | 12 / 12 PASS（状态机 3、stall 处理 5、卸载清理 4，含 run 级并行存在用例） |
| `npx vitest run test/guardian.spec.ts test/routing.spec.ts test/engine-contract.spec.ts test/lifecycle-disposal.spec.ts test/plugin-lifecycle.spec.ts` | 5 文件 / 84 测试 PASS（supervisor 回归：routing 25 + engine-contract 15 全绿，script 未动） |
| `node .rsi/evidence/round-018/stuck-sim.mjs` | `adopted children=1 open=1 timerArmed=true` → `t+5999 findings=0` → `t+6000 findings=1 signal=heartbeat-loss action=cancel-run`（cancel 恰一次）→ 126s 后仍 1 条 → `settlement cancelled=true findings=1` → `unloaded=1 after=0`（`.rsi/evidence/round-018/stuck-sim.txt`） |
| `npm run ci`（改后全量） | exit 0，**63 文件 / 1154 测试 PASS**，lint 22 warnings / 0 errors（`.rsi/evidence/round-018/full-ci.txt`） |
| `npm run build` 后 `git diff --exit-code -- lib/` | exit 0（幂等） |

**验收逐条**：

- 监督与主流程并行存在：run 级用例录下订阅快照（`agent-start`/`agent-end` 监听峰值
  ≥3：progress、archiver、guardian 各一）+ guardian 在 run 前创建、adopt 绑定；
  `src/run.ts` 订阅位与 `finally` 折叠位为证。有启动/结束证据，不是串行节点。
- 卡住模拟：`stuck-sim` 显示 hung child 在预算内 0 firing、到点 1 firing、126s 后仍
  1 条、cancel 恰一次——不无限等。处理动作为 `run.cancel()`（host 侧唯一拥有），
  上限为结构性（`cancelOnce` + `maxFindings: 32`）。
- 卸载/取消无残留：`finish` 释放注册表项、`unloadRunGuardians` 1→0、`dispose` 清
  timer、run `finally` 清 listeners；`test/guardian.spec.ts` 卸载清理 4 条钉住。
- 原 supervisor 语义回归：`src/script.ts` 零改动；`routing` backstop 公式与
  `engine-contract` children 计数测试未动即 PASS（只能 fail 不能 pass 不变）。
- `npm run ci` exit 0（上表）。

**未验证（`NOT_RUN`，与上轮相同）**：rrule 定时到点；真模型跑整轮；GUI 点击；
unload/归档监听的 firing（操作体 CONFIRMED）。真机只跑隔离 profile 的 gate 路径，
无模型调用。

**Before running any live matrix, read [TESTING.md](TESTING.md)** — the workspace-isolation rules are
mandatory: no sample is sent to a test instance until its session workspace is a scratch directory
under `/tmp`, and the proof of that (the `sessions/--tmp-…--` directory name plus the workspace name
the UI shows) belongs in that round's evidence.

## Environment

- Date: 2026-10-25
- Host: local Linux workspace
- Node: `v26.8.1`
- npm: `11.19.0`
- pnpm: `12.4.2`
- DSH CLI: `0.2.1-rc.2`
- DSH checkout: `687f282e8625c6b8d11ff58211a90524be2e4317`
- Grok Build checkout: `2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8`

## Pre-implementation checks

| Check | Command | Result | Evidence |
|---|---|---|---|
| Local Git state | `git status --short --branch` | PASS | `## No commits yet on main` |
| Target repo absence | `gh repo view free6589/dsh-grok-workflow` | CONFIRMED absent | GraphQL "Could not resolve to a Repository" |
| Remote absence | `git ls-remote https://github.com/free6589/dsh-grok-workflow.git` | CONFIRMED absent | `Repository not found` |
| GitHub auth | `gh auth status` | PASS | account `free6589`, `repo` scope |
| DSH version | `dsh --version` | PASS | `0.2.1-rc.2` |

## Implementation validation — 2026-10-25

### Deterministic test suite

Command:

```sh
npm run ci
```

Result: **PASS**

- `npm run typecheck`: PASS.
- `npm run lint`: PASS, 0 warnings/0 errors (`oxlint` over 15 files).
- `npm test`: PASS, 6 test files, 56 tests.
  - `test/orchestrator.spec.ts`: 17 tests (planner, caller plan, parallel pool,
    partial, failed, evidence rejection, retry bound, fallback, oversized
    planner rejection, duplicate planner criteria, overlong verifier-criterion
    rejection, prompt/error redaction, exact criteria, URL/token prompt
    redaction).
  - `test/plugin-lifecycle.spec.ts`: 15 tests (registration, invalid input,
    startup rejection timer cleanup, startup-unload cleanup, max active runs,
    unload cancellation/disposal, canonical report filtering, contradictory
    report rejection, late startup timeout (resolve/reject), deadline report).
  - `test/loader.spec.ts`: 2 tests (real DSH Loader + real tool registry;
    disabled row inertness; registration/unregistration and prompt section).
  - `test/input.spec.ts`: 10 tests, including exact-bound, over-bound, and
    duplicate-criteria input.
  - `test/redact.spec.ts`: 10 tests, including compound environment names,
    access/private/secret keys, Stripe underscore tokens, non-HTTP URL
    userinfo, and GitLab/npm token prefixes.
  - `test/issue-watch.spec.ts`: 2 tests using a fake `gh` executable; baselines
    issues, replays a comment/new issue, asserts the untrusted-data prompt
    boundary, verifies credential-env isolation, and rejects runtime-loading
    variables from the credentials file.

Toolchain: Node `v26.8.1`, Vitest `4.1.12`, TypeScript `6.x`, DSH packages
`0.2.1-rc.2`, real `@deepseek-ai/cordis-plugin-loader` `1.0.6`.

### Package contents

Command:

```sh
npm --cache /tmp/npm-cache-dshgw pack --dry-run
```

Result: **PASS**. Tarball `dsh-grok-workflow-0.1.0.tgz`, 27 files, about 38 kB packed
(later docs additions changed the size), includes `lib/index.js`, declarations, `cordis.patch.yml`, README,
LICENSE, and docs.

### Real DSH profile installation

Environment: isolated `DSH_HOME=/home/fish/projects_mine/dsh-grok-workflow/.dsh-home`,
profile `grok-workflow-dev`, based on the shipped `headless` template.

Command:

```sh
DSH_HOME=... dsh plugin --profile grok-workflow-dev add /home/fish/projects_mine/dsh-grok-workflow
```

Result: **PASS**. pnpm added `dsh-grok-workflow link:../../..`; profile
`dsh.profile.bundles` includes `dsh-grok-workflow`. `dsh --dump-config` shows:

```yaml
- id: grok-workflow
  name: dsh-grok-workflow
```

### Real model route smoke

Command shape (key loaded from the user's environment file without printing it):

```sh
set -a; . ~/.dsh/bifrost.env; set +a
DSH_HOME=... dsh --profile grok-workflow-dev --patch .dsh-home/gw-model.patch.yml headless "Reply with exactly: MODEL_OK"
```

Result: **PASS**. Output contained `MODEL_OK`; exit code 0. Model:
`bifrost-completions / wb/cn:deepseek-v4.1-flash` (local test override only; not
part of the plugin package).

### Real end-to-end grok_workflow run (caller plan)

Command shape:

```sh
set -a; . ~/.dsh/bifrost.env; set +a
DSH_HOME=... dsh --profile grok-workflow-dev --patch .dsh-home/gw-model.patch.yml headless --json "<prompt>"
```

Result: **PASS**.

- Session events include exactly one `tool_call` named `grok_workflow` and one
  `tool_result` with status `completed`.
- Report: `Grok workflow: COMPLETED`, plan `caller`, 2 tasks, 2 verified.
- `alpha` artifact `.dsh-home/e2e-alpha.txt` was created, 8 bytes, content
  `ALPHA_OK` with no trailing bytes.
- `beta` independently ran `expr 17 + 25`, stdout `42`, exit 0.
- Verifier evidence included actual `ls`, `od`, `wc`, Python `read_bytes`, and
  bash comparison outputs.
- Final assistant text reported `COMPLETED` with both task statuses verified.
- The audit trail (`--json`) is retained locally under `.dsh-home/` (ignored by Git).

### Real end-to-end grok_workflow run (parallel timing, completed)

Command: same profile/model override as above, with two caller tasks that each
recorded epoch milliseconds, slept 4 s, and recorded the end time.

Result: **PASS**.

- `tool_result` status: `completed`; report `Grok workflow: COMPLETED`, plan
  `caller`, 2 tasks, 2 verified, one attempt each.
- `gamma2`: start `1792908315791`, end `1792908319793` → 4002 ms.
- `delta2`: start `1792908312327`, end `1792908316329` → 4002 ms.
- The two intervals overlap by **538 ms**, so the subtasks were not serialized.
  The difference in shell start time is model/agent startup latency, not
  sequential execution; both agent calls were already in flight under the
  bounded worker pool.
- Final assistant text reported `COMPLETED` with both tasks verified.

### Real end-to-end grok_workflow run (strict partial, not reported as success)

A separate real run with deliberately misaligned task text (`objective` mentioned
an unlisted `exit 0` requirement and an unverifiable tracked-file baseline) was
correctly rejected by the independent verifier:

- `tool_result` status: `completed` at the tool transport level, report status
  `PARTIAL`.
- `gamma`: failed after 2 attempts; verifier issues were surfaced.
- `delta`: verified after 2 attempts.
- The assistant's final answer said `grok_workflow status: PARTIAL — not
  completed, so I am not claiming success.`

This is evidence that a worker's claim does not become success when the
verifier cannot support it, and that partial results remain explicit.

### Real end-to-end grok_workflow run (planner, completed)

A planner-only call (no `tasks` array) with the objective
`Create the file .dsh-home/planner-only.txt containing exactly PLANNER_ONLY, then verify its content.`
returned:

- `tool_result` status: `completed`.
- Report: `Grok workflow: COMPLETED`, `Plan: planner; 1 task(s); 1 verified`.
- Task `write-verify-planner-only`: verified after 2 attempts; evidence included
  `realpath`, `ls`, `test -f`, `cat`, `wc`, `od`, `stat`, `cmp`, and `sha256sum`.
- File content: exactly `PLANNER_ONLY` (12 bytes, no trailing newline).
- The report surfaced a planner-generated constraint that said "do not execute
  work in this planning step"; this was a planner wording defect, not a false
  success. The planner prompt was clarified to forbid planning-phase
  instructions in task constraints.

A larger planner run (two marker files plus an over-broad "no other file in
`.dsh-home` changed" criterion) was killed by the outer 600 s test timeout before
returning a report. It demonstrated that the default 30-minute plugin deadline
and bounded retries are not a substitute for realistic task scope. It is not
counted as a passed acceptance run.

### Recursion guard (real-model lesson)

The first large planner attempt spawned multiple child agents and one child
appeared to be verifying by starting more work. The plugin now rejects
`grok_workflow` calls from subagent sessions (`origin === 'subagent'` or
`delegationDepth > 0`); a deterministic test covers the rejection. This guard
was added before the successful small planner run.

### GitHub installation and workflow

Repository: `https://github.com/free6589/dsh-grok-workflow`, public, default
branch `main`; initial commit `beb55c6`, current work commit `7b78db9`.

Commands:

```sh
DSH_HOME=.dsh-home dsh --profile grok-workflow-github --from-default-profile headless --dump-config
DSH_HOME=.dsh-home dsh plugin --profile grok-workflow-github add github:free6589/dsh-grok-workflow
DSH_HOME=.dsh-home dsh --profile grok-workflow-github --dump-config
```

Result: **PASS**.

- pnpm resolved and added `dsh-grok-workflow github:free6589/dsh-grok-workflow`
  (+4 packages); it emitted only peer-dependency warnings, no install failure.
- `--dump-config` shows `- id: grok-workflow / name: dsh-grok-workflow`.
- A real headless boot replied `GITHUB_INSTALL_OK`.
- A real `grok_workflow` call in the GitHub-installed profile returned
  `COMPLETED` with one verified task; the file
  `.dsh-home/github-install-marker.txt` contains exactly
  `GITHUB_WORKFLOW_OK` (18 bytes, no trailing newline).

### GitHub Actions

- Run `40168892831` (commit `beb55c6`): **PASS**, Node 22 and Node 24 jobs.
- Run `40169133016` (commit `7b78db9`): **PASS**, Node 22 and Node 24 jobs.
- Run `40169816856` (commit `8ec3ad4`): **PASS**, Node 22 and Node 24 jobs.
- Run `40169885633` (commit `602918e`): **PASS**, Node 22 and Node 24 jobs.
- Run `40170034851` (commit `b23d360`): **PASS**, Node 22 and Node 24 jobs.
- Run `40172141078` (commit `6a0c32a`): **PASS**, Node 22 and Node 24 jobs.
- Run `40175621646` (commit `b6b649b`): **PASS**, Node 22 and Node 24 jobs;
  includes `npm run build`, `git diff --exit-code -- lib/`, and
  `npm pack --dry-run`.
- Run `40176223802` (commit `03c9a43`): **PASS**, Node 22 and Node 24 jobs;
  watcher security tests (51 total) included.
- Run `40176627051` (commit `aa0e9bb`): **PASS**, Node 22 and Node 24 jobs;
  final documentation and live-watcher evidence.
- The workflow uses `actions/checkout@v4` and `actions/setup-node@v4`; GitHub
  reports a Node 20 deprecation annotation but both jobs completed successfully.

### Real end-to-end deadline cancellation

A real `grok_workflow` call ran with a profile overlay setting `timeoutMs: 2000`
and one task that asked the worker to `sleep 30`.

Result: **PASS**.

- `tool_result` status: `completed` at the transport level, report
  `Grok workflow: FAILED`.
- Report showed `Plan: unavailable; 0 task(s); 0 verified`, with
  `Timeout: workflow exceeded the 2000 ms deadline and was cancelled`.
- Final assistant answer reported `FAILED` and explicitly said the sleep did
  not complete.
- No leftover `sleep 30` or `dsh --profile grok-workflow-dev` process was
  observed after the call.

This is a live DSH cancellation/deadline path, not only a mocked unit test.

## Review boundary fixes (2026-10-25)

Independent review found five gaps; fixes were implemented and retested:

- Caller acceptance criteria now reject more than 20 items or more than 1,000
  characters per item instead of being silently truncated. The same bounds are
  enforced when normalizing planner output.
- Credential redaction now matches compound environment names such as
  `OPENAI_API_KEY`, `GITHUB_TOKEN`, and `DATABASE_PASSWORD`.
- The deadline timer is cleared in an outer `finally`, including when
  `workflowEngine.start()` rejects; a fake-timer test asserts zero pending
  timers after startup rejection.
- Obsolete pending/not-run sections were removed from this validation log.
- `engines.dsh` is now the exact `0.2.1-rc.2`, matching the exact DSH peer
  dependency set.
- **Residual re-review edge case:** verifier criterion strings are now parsed
  with `boundedText(..., 1000)`, so a 1,000-character caller criterion plus a
  suffix is rejected rather than silently truncated into a match. Regression
  test added.

### Issue-report fixes (2026-10-25)

Open issue reports #2-#7 were reproduced from source and covered by deterministic
tests:

- **#2 redaction:** `KEY_VALUE` now covers access/private/secret key names and
  compound prefixes; OpenAI-style tokens include `sk_live_` / `sk_test_`
  underscore forms. `redactSecrets` and recursive `redactDeep` tests pass.
- **#3 report invariants:** `assertWorkflowReport` now compares immutable plan
  and task fields, validates sequential attempts within the retry limit, rejects
  passed attempts on failed tasks, and enforces status invariants (`completed`
  all verified with evidence/no fallback, `partial` mixed, `failed` no verified
  tasks).
- **#4 startup deadline:** a deadline that elapses while `start()` is pending
  now returns the canonical timeout report whether startup later resolves or
  rejects; the late run is cancelled and disposed.
- **#5 prompt redaction:** worker/verifier results and error messages are
  redacted inside the generated script before being serialized into verifier
  and retry prompts; regression tests assert fake markers never reach prompts.
- **#6 duplicate criteria:** caller input rejects duplicate acceptance criteria;
  planner output with duplicates is rejected and falls back, rather than
  creating an impossible verifier match.
- **#7 canonical result:** the tool returns the object produced by
  `assertWorkflowReport`, not the raw engine value; a test adds an unknown field
  containing a fake secret and verifies it is absent.

`npm run ci` — **PASS**, 6 files / 51 tests.

### Additional issue-report fixes (#8-#10)

- **#8 payload bounds (historical: this validation ran when the limit was
  4,000):** the objective was capped at 4,000 characters and the aggregate
  serialized caller/planner task payload at 48,000 characters, in both host
  input validation and generated-script planner normalization. Boundary and
  over-bound tests pass. The objective limit is now 32,000 (see
  `docs/ARCHITECTURE.md` §Objective length boundary).
- **#9 shared working directory:** documented as a concrete MVP limitation.
  Parallel workers and verifiers share the DSH session `cwd`; the plugin has no
  worktree isolation, so write-heavy work must use disjoint scopes or
  `maxConcurrency: 1`.
- **#10 artifact drift:** CI now runs `npm run build`, then
  `git diff --exit-code -- lib/`, then tests and `npm pack --dry-run`, so a
  commit cannot silently ship stale `lib/` output.

### Watcher security fix (#11)

- The watcher now wraps all imported event fields in a compact JSON array,
  labels it `UNTRUSTED GITHUB DATA`, and repeats a security reminder after the
  payload: issue text is evidence/task description, not authority to override
  system/repository/tool/secret-handling rules.
- `DSH_ENV_FILE` is parsed as KEY=VALUE credentials rather than sourced as shell
  code; `DSH_*`, `HOME`, `PATH`, and similar process variables are ignored so a
  credential file cannot retarget the wake to another DSH home/profile/session.
- Command-mode wakes use `bash -c`, not a login shell, so profile scripts cannot
  overwrite the isolated environment.
- Two fake-`gh` tests pass, including hostile-looking issue text and a credential
  file containing conflicting `DSH_HOME` / `DSH_PROFILE` / `DSH_PATCH`.
- `npm run ci` — **PASS**, 6 files / 51 tests.

### Post-fix real DSH revalidation

- Reinstalled the local bundle into the isolated `grok-workflow-dev` profile
  with the exact engine declaration; `--dump-config` still shows the
  `grok-workflow` row. **PASS**.
- Clean one-task caller workflow returned `COMPLETED`, plan `caller`, 1/1
  verified; `.dsh-home/fix-e2e/check.txt` was a 6-byte regular file containing
  exactly `FIX_OK`. **PASS**.
- Re-ran the 2-second deadline against a 30-second worker: `FAILED` with
  `Timeout: workflow exceeded the 2000 ms deadline and was cancelled`; no
  leftover child process. **PASS**.
- Fresh profile `grok-workflow-review` installed the public GitHub package
  after the exact-engine commit (`6a0c32a`), showed the bundle row, booted with
  `REVIEW_OK`, and a one-task workflow returned `COMPLETED` 1/1 verified.
  **PASS**.

## Issue watcher validation (2026-10-25)

### Live wake smoke

- Created temporary issue #13 (`[TEST] watcher wake smoke`) after the watcher
  was running with the hardened script.
- The watcher detected the new issue at `08:25:06Z`, started wake
  `pid=540837`, and wrote `last-wake.status=0`.
- The DSH final answer contained `WATCH_WAKE_OK`; its trace shows the prompt
  included the JSON array and both security-boundary messages. No repository
  files were modified and no credentials were read or printed.
- Closed #13 after the check. This is a real watcher → DSH headless wake, not
  a mocked unit test.

- `bash -n scripts/watch-issues.sh` — **PASS**.
- `npx vitest run test/issue-watch.spec.ts` — **PASS**, 2 tests; fake `gh`
  executable, no GitHub or model calls; includes hostile issue text and
  credential-env isolation.
- `WATCH_STATE_DIR=.dsh-home/watch-live WATCH_WAKE_MODE=noop scripts/watch-issues.sh --once`
  — **PASS**; baselined 10 open issues at 08:02 UTC with no wake.
- Real DSH headless stdin smoke:
  `printf 'Reply with exactly: WAKE_SMOKE_OK\n' | dsh --profile grok-workflow-dev --patch .dsh-home/gw-model.patch.yml --json`
  — **PASS**; final text `WAKE_SMOKE_OK`. The watcher uses the same
  `--profile ... --patch ... --json` argument shape and feeds the prompt on
  stdin.
- The live watcher is started separately; its state and logs stay under the
  ignored `.dsh-home/` directory.

### Credential redaction formats (#14)

- Reproduced on the built `lib/redact.js` from `99454d1`: both database URLs
  (`postgres://demo_user:FAKE_DB_PASSWORD@...`, `mongodb+srv://...`) and bare
  `glpat-...` / `npm_...` values passed through unchanged.
- `src/redact.ts` now matches username/password userinfo for any `scheme://`
  URI, including database schemes and empty-username forms such as
  `redis://:password@host`; it also recognizes `glpat-` and `npm_` token
  prefixes. `src/script.ts` carries the same patterns for prompt-facing
  redaction.
- Regression tests added in `test/redact.spec.ts` for `redactSecrets` and
  `redactDeep`, and in `test/orchestrator.spec.ts` for verifier/retry prompts.
- `npx vitest run test/redact.spec.ts test/orchestrator.spec.ts` — **PASS**,
  2 files / 26 tests.
- `npm run ci` — **PASS**, 6 files / 55 tests.
- Post-fix check on the built artifact: the issue examples return `[REDACTED]`
  markers while ordinary prose (`ratio 3:4 at example.test`) is unchanged.

### Watcher credential-env allowlist (#15)

- `bash -n scripts/watch-issues.sh` — **PASS**.
- `npx vitest run test/issue-watch.spec.ts` — **PASS**, 2 tests; the
  credentials file contains inert `NODE_OPTIONS`, `NODE_PATH`, `LD_PRELOAD`,
  `LD_LIBRARY_PATH`, `DYLD_*`, `PYTHONPATH`, `PYTHONHOME`, `PERL5OPT`,
  `RUBYOPT`, `BASH_ENV`, `ENV`, `SHELLOPTS`, `BASHOPTS`, and an unlisted
  setting; the command wake does not receive any of them, while
  `BIFROST_VIRTUAL_KEY` and `OPENAI_API_KEY` still arrive.
- `bash scripts/watch-issues.sh --help` — **PASS**; it describes
  `DSH_ENV_FILE` as a parsed `KEY=VALUE` credentials file, not a sourced
  environment file.
- `npm run ci` — **PASS**, 6 files / 55 tests.
- Live watcher restart: **PASS** at `08:54:06Z`; new PID `568469`, state
  retained, `DSH_SESSION_ID`/profile overrides absent, first poll `no changes`.
  The prior live wake (`WATCH_WAKE_OK`, status 0) used the previous script.

### Fallback partial host validation (#17)

- Issue #17: a planner fallback creates one task, verifies it, and the script
  deliberately reports `partial` because planning was degraded. The host
  `assertWorkflowReport()` previously rejected that report because its
  `partial` invariant required both verified and failed tasks.
- `src/report.ts` now accepts `partial` with all tasks verified only when
  `plan.source === 'fallback'` and `plan.error` is non-empty. It still rejects
  an all-verified non-fallback `partial` report, keeps `partial` requiring at
  least one verified task, and keeps fallback `completed` forbidden.
- `test/orchestrator.spec.ts` now runs the generated fallback report through
  the real host validator and also checks the non-fallback rejection. The suite
  has 17 orchestrator tests and 6 files / 56 tests total.
- `npm run ci` — **PASS**, 6 files / 56 tests.

## Round 3 / GUI, activation and the settings page — 2026-10-27 (t32 + t33)

All work happened on a **separate profile and a separate instance**
(`DSH_HOME=/home/fish/dsh-layerfs`, profile `web-grok-debug`, `127.0.0.1:3199`). The
user's live GUI (`:3090`, PID 825935) was never restarted, killed or reconfigured; it was
checked alive (`ps -o pid -p 825935`) before and after every experiment.

### Activation: composition is not activation (closes the t33 contradiction)

| Step | Command / observation | Result |
|---|---|---|
| row present after install | `dsh plugin --profile web-grok-debug add <tgz>` then `dsh --profile web-grok-debug --dump-config` | `- id: grok-workflow` / `name: dsh-grok-workflow` — the row **is** in the composed config |
| why it still did nothing | same dump, provider row | `- id: workflow-ptc … disabled: true` (shipped that way by `@deepseek-ai/dsh-web-app`) |
| runtime consequence | boot of the new instance | `dsh: warning: 2 entries did not activate` / `grok-workflow (dsh-grok-workflow): pending (waiting for service: workflowEngine)` |
| fix, same profile | `cordis.patch.yml`: `- id: workflow-ptc` / `config: { provider: spawn }` / `disabled: false` | boot is clean; no pending warning |
| proof the seam arrived | `POST /api/settings/describe` | namespace `grok-workflow`, `autoGenerate: true`, **17** projected fields (`toolName`, `enforceGate`, `gateRequired`, `configVersion` absent) |
| proof of the runtime tool surface (A1) | real GUI session, session transcript `request/header` | **32 tools**, `grok_workflow` among them; no `--dump-config` involved |
| proof the gate claims messages (C1) | same session transcript | `plugin:grok-workflow/delivery` records per message id: `phase: started, outcome: admitted` … `phase: delivered`; the answer is the workflow's report, never a direct reply |

So the t33 finding ("0 × `grok_workflow` in a 92,716-character prompt") is explained by a
**missing service**, not by a broken package: `dsh plugin add` puts the bundle into
`dsh.profile.bundles` (visible in `--dump-config`), while activation additionally needs an
enabled workflow provider. See D-014 and
[../LOCAL-TESTING.md](../LOCAL-TESTING.md#enable) for the reproducible steps.

### Fail-closed path (C2), measured twice

| Run | Config | Observed |
|---|---|---|
| 1 | `subagentProvider: bifrost-completions` (an LLM provider, not a DSH subagent provider) | delivery `started/admitted` → `failed/start-failed`; the user message is replaced by a report the model must relay verbatim: *"The mandatory workflow gate refused this message and no workflow result exists. Reason: no subagent provider registered for \"bifrost-completions\". Nothing was executed and no direct answer is available by design."* |
| 2 | `subagentProvider: spawn` (correct), weak model | delivery `started/admitted` → `delivered/failed`; the visible answer is `Grok workflow: FAILED` with `Plan: planner; 1 task(s); 0 verified` and a `Failures: 2 quality` list — a report, still no direct answer |

### The settings page (requirement D, closes NR-7/NR-8)

| Check | Observation |
|---|---|
| namespace served but no page (the root cause) | `settings/describe` lists 20 namespaces including `grok-workflow`; the Plugins page showed **no** card for it: `autoGenerate` is a Host description, not a UI |
| Fix | `src/client/index.js` shipped as `dsh-grok-workflow/client.js`; registers `plugins.item` under `configForms.whileServed(['grok-workflow'])`. Manifest: `exports["./client"]` + `dsh.client = { platform: 'web', inject: [...] }` |
| B1 the entry exists | Plugins page renders a card **Grok workflow** (`data-plugin-item="grok-workflow"`) |
| B2 the fields render | 15 `[data-field]` inputs + the class picker + 4 per-role chain editors + 4 read-only structural rows = all **21** `CONFIG_KEYS`; `test/client.spec.ts` pins the table against `CONFIG_KEYS` / `HARD_LIMITS` / `SWITCHABLE_CLASSES` |
| B3 edit → save → effective | Playwright set `maxConcurrency` 3 → 5 and appended a `planner` route, pressed Save: page shows `已保存` and `revision 1`; `POST /api/settings/mutate` carried `{ns, ops, expectedRevision}`; the value is in the profile's `cordis.patch.yml`; after a **restart** the page and `settings/describe` still report `maxConcurrency: 5` and the planner route in the entry's `user` layer |
| B4 invalid input | adding four empty `verifier` routes lists `verifier 第 N 条缺少 model` and disables Save; the Host also refuses (`resolveConfig`), e.g. boot prints `roles.synthesizer is set but synthesis is "deterministic"` and the row does not activate |
| B5 no fake page | every rendered key is a real `resolveConfig` key (parity test), the page reads the Host mirror and writes through the settings queue — it has no local copy of the config |

### Reproducible install in a pristine `DSH_HOME` (A3)

A second, independent check with **no user data at all** (`DSH_HOME=/tmp/t32-dsh-home`,
profile `smoke`, port 3198):

| Step | Result |
|---|---|
| `dsh --profile smoke --from-default-profile web` | profile created |
| `dsh plugin --profile smoke add /tmp/t32-pack/dsh-grok-workflow-0.2.0.tgz` | `+ dsh-grok-workflow file:/tmp/t32-pack/dsh-grok-workflow-0.2.0.tgz` |
| profile `cordis.patch.yml`: `workflow-ptc` → `disabled: false`, `provider: spawn` | composed config shows the enabled provider and `- id: grok-workflow` |
| boot on `127.0.0.1:3198` | no `pending` and no `did not activate` line |
| `POST /api/settings/describe` | 22 namespaces, `grok-workflow` present, `autoGenerate: true`, the same 17 projected keys |
| boot graph in the browser (`window.__DSH_BOOT__.entries`) | 70 entries including `dsh-grok-workflow` (the client bundle is served) |

Two honest notes about this pristine profile: its `cordis.patch.yml` ships as a bare `[]`, so
patch entries must **replace** that token (appending produced a YAML with two root nodes and
`dsh` reported the line number); and its Plugins page never opened — no cards at all, ours or
the stock ones (`subagent`/`web-search`/`agent-loop`/`shell`), with no console error, which is
stock behaviour in a profile without sessions or packages. The card itself was therefore
verified on the debug profile, where the Plugins page lists exactly
`["subagent", "web-search", "agent-loop", "shell", "grok-workflow"]` — ours among the stock
pages, same slot, same rendering path.

### Evidence chain: the artefacts measured are the artefacts shipped (F1, t35)

Every screenshot in this round was taken on the **0.2.1 tarball**, installed into the debug
profile from a **fresh path** (the same `file:` spec is a pnpm no-op — the trap that made the
first t32 evidence describe a stale build):

| artefact | value |
| --- | --- |
| tarball the screenshots were taken on | `/tmp/t35-pack-A/dsh-grok-workflow-0.2.1.tgz`, 43 files, 118.7 kB, md5 `ffb22ca4a2e249b41303fbbbcf9cb450` |
| tarball installed and re-checked last (`t35-pack-B`, 121.4 kB, `61723bda…`) | then the **release commit** added the tag-availability note to both shipped `README`s (t38/O1) |
| **release tarball** (packed from the release commit; macro-identical to what the release workflow builds) | 43 files, 121.5 kB, md5 `b1401eeb9ba0f425ab646af7f9dc12be` (npm shasum `12ba3363ac515a02dc4125787c1c04508ef2edd8`) |
| delivery build `src/client/index.js` | `68324a754a54ce36e6775618314592c5` |
| `lib/client.js` in the repo | `68324a754a54ce36e6775618314592c5` (`cmp` → identical) |
| `package/lib/client.js` **inside the tarball** | `68324a754a54ce36e6775618314592c5` |
| installed copy `profiles/web-grok-debug/node_modules/dsh-grok-workflow/lib/client.js` | `68324a754a54ce36e6775618314592c5`, manifest version `0.2.1` |

`npm pack` is reproducible here: packing the same tree twice gives the identical md5. Across the
three packs the changed **shipped** files were `README.md`, `CHANGELOG.md`, `docs/LOCAL-TESTING.md`
and `docs/RELEASING.md` (`files` ships `lib/**/*.js`, `docs/*.md` and `docs/images`); the edits
under `docs/knowledge/` and `docs/releases/` are not shipped and do not move the tarball hash —
which is why updating the document that *records* the hash cannot invalidate it. That is why the durable identity is the client bundle, not the tarball:
**`src/client/index.js` = `lib/client.js` = `package/lib/client.js` in the tarball =
`68324a754a54ce36e6775618314592c5`**. **The client bundle is the same bytes in both**, which
is why the screenshots stay valid for the final pack — and `15-final-pack.png` +
`15-final-pack.txt` re-run the page check on the final pack itself (card present, 15 fields, four
read-only rows with labels, saved chain intact, no console error).

So the bytes in the browser are the bytes in the tarball are the bytes in the delivery build.
`test/client.spec.ts` keeps that true: a `lib/client.js` that differs from the source fails the
suite (`ships lib/client.js byte-identical to the source`), which is how the stale-bundle class
of mistake is caught from now on.

### Screenshots and DOM assertions (`docs/knowledge/evidence/t32/`)

Element-level captures plus the assertion output they belong to; the `.txt` files carry the
numbers, so a claim can be checked without re-running Playwright.

| file | what it shows |
| --- | --- |
| `01-plugins-cards.png` + `.txt` | Plugins page lists `subagent, web-search, agent-loop, shell, grok-workflow` — ours among the stock cards |
| `02-page-initial.png` + `02-page-assertions.txt` | the page as served: 15 `[data-field]` inputs, 4 chain editors, 4 read-only rows **with labels** (no `undefined`), `revision 1`, nothing pending |
| `03-readonly-rows.png` | element shot of the structural section: `grok_workflow（注册即固定…）`, `true（默认…）`, `false（默认…）`, `1（wire 契约…）` |
| `04-page-edited.png`, `05-footer-edited.png` | staged edit (`maxConcurrency` 3 → 5, one extra `planner` route) with the footer visible |
| `06-page-saved.png`, `07-footer-saved.png`, `04-save-assertions.txt` | after Save: `已保存，下一条消息生效 / Saved; applies to the next message`, `revision 4`, Save disabled, values re-read from the Host |
| `08-page-validation.png`, `09-validation-errors.png`, `10-footer-disabled.png`, `08-validation-assertions.txt` | `maxRetries=99` and two verifier rows without a model: three reasons listed (red), Save disabled |
| `11-page-persisted.png` + `11-persisted-assertions.txt` | **after a full restart**: `maxConcurrency=5` and both `planner` routes still there, `revision 0`, nothing pending |
| `12-session-hi.png` + `12-session-assertions.txt` | a real GUI turn `hi`: `Grok workflow: COMPLETED … 1 verified`, completed in 1m 11s, delivered as the answer |
| `15-final-pack.png` + `15-final-pack.txt` | the **final** tarball installed and re-opened: card, 15 fields, four labelled read-only rows, `maxConcurrency=5` and both planner routes still saved |
| `14-host-refusal.txt` | a **real** Host-side refusal: a saved chain naming a model the provider does not enumerate stops the row from activating (`roles.planner names model "wb/global:deepseek-v4.1-flash", which provider "bifrost-completions" does not enumerate; declared: …`) — no namespace, no page, and the boot line says why |

### What the page validates, and what only the Host can (an honest gap, t35)

The two layers check different things, and the sequence in this round shows it:

1. The page saved `maxConcurrency: 5` plus a second `planner` route
   `bifrost-completions / wb/global:deepseek-v4.1-flash` (`04-save-assertions.txt`). Client-side
   validation covers the *shape* of a configuration — numeric bounds, a missing model, duplicates,
   three-route limit, unknown `switchOn` classes — and it cannot know which models a provider
   enumerates, because the catalog lives on the Host.
2. On the next start the row **did not activate**, and the boot line said exactly why:
   `roles.planner names model "wb/global:deepseek-v4.1-flash", which provider "bifrost-completions"
   does not enumerate; declared: wb/cn:deepseek-v4.1-flash, wb/cn:deepseek-v4-pro, agnes-3.0-flash`
   (`14-host-refusal.txt`). The namespace disappeared, so the page did too — the failure is loud in
   the log, not silent in the UI.
3. Correcting the route to an enumerated model and restarting produced the measured pass:
   values persisted (`11-persisted-assertions.txt`), a real `hi` turn completed
   (`12-session-assertions.txt`), and the final tarball re-checked the same way
   (`15-final-pack.txt`).

So the page prevents the mistakes it can see and the Host refuses the rest at load time. A
provider-aware model picker (which would close this gap) needs the client to read the model
catalog; that is not in 0.2.1 and is recorded here rather than papered over.

### Client-side tests for the browser half (F5, t35)

`test/client.spec.ts` grew from 6 to 20 tests. Beyond the field/limit/class parity checks it now
covers the two functions that decide what a Save writes: `validate()` (numeric bounds and
fractional values, `gateScope=preset` without a preset name, chain longer than three, a route
without a model, a duplicate route, two *blank* routes not being duplicates, a 121-character
field, an unknown `switchOn` class) and `opsFor()` (no op when nothing changed, one op per
changed field, `roles.<role>` path for a chain, never an op for a structural key), plus
`draftOf()` (defaults, publishing a chain, filling omitted roles, and no aliasing of the Host
document) and `resolveNamespace()` (shipped id, a renamed Loader row, a missing namespace, and a
half-signature namespace not being captured).

Both new behaviours were mutation-checked: restoring the "blank routes are duplicates" rule fails
`treats two blank routes as unfinished rows, not duplicates (t32 regression)`, and forcing the
value-based lookup off fails `follows a renamed Loader row instead of silently losing the page
(t34 residual)`.

### CI

`npm run ci` → typecheck OK, `oxlint` "Found 0 warnings and 0 errors", **284 tests / 19 files**
(`client.spec.ts` contributes 20 of them; the suite was 264/18 before the browser half existed).

## Round 2 / `0.2.0` release preparation — 2026-10-26

Real commands and results only.

| Check | Command | Result | Evidence |
|---|---|---|---|
| Full CI | `npm run ci` | PASS | typecheck OK; `oxlint` "Found 0 warnings and 0 errors" (37 files); build OK; **264 tests / 18 files** passed |
| Unit subset | `npm run test:unit` | PASS | 16 files / 260 tests (the two Loader/issue-watch suites are excluded by design) |
| Build reproducible | build twice, then `md5sum lib/*.js lib/*.d.ts \| md5sum` | PASS | `304de3768ceefa0a8af459785a570b51` both times |
| Package contents | `npm pack --pack-destination /tmp/t15-pack` | PASS | 42 files, 108,428 bytes; contains `lib/`, `package.json`, `cordis.patch.yml`, `LICENSE`, both READMEs, `CHANGELOG.md`, `docs/*.md`, `docs/images/*.svg`; **no** `test/`, `scripts/`, `docs/knowledge/` |
| Clean copy install | `rsync` the worktree to `/tmp/t15-clean2` (no `node_modules`, no `.git`) → `npm ci` → `npm run ci` | PASS | install completed; CI on the copy: lint "Found 0 warnings and 0 errors", **264 tests / 18 files** passed |
| Isolated profile install | fresh `DSH_HOME=/tmp/t15-dsh-home`, `dsh --profile smoke --from-default-profile headless`, then `dsh plugin --profile smoke add /tmp/t15-pack/dsh-grok-workflow-0.2.0.tgz` | PASS | pnpm reported `+ dsh-grok-workflow file:/tmp/t15-pack/dsh-grok-workflow-0.2.0.tgz`; `--dump-config` shows the `grok-workflow` bundle row |
| Isolated profile, real turn | `DSH_HOME=/tmp/t15-dsh-home dsh --profile smoke --patch <route> "hi"` | PASS | 46 lines; the answer contains a `<<<GROK-WORKFLOW-REPORT>>>` block with `Grok workflow: COMPLETED` and per-criterion evidence for a conversational task |
| Settings identity end-to-end (t31/F1) | `node scripts/smoke-settings-identity.mjs` | PASS | with the built `lib/` and the **real** `dsh-settings` projection of the DSH installation: "projected fields: 17 (toolName present: false)", `INFO settings surface: page auto-generated for "grok-workflow" (21 field(s), applies live, schema not matched by uid, identified by value)`; mutating the distinctive-key set back to include `toolName` makes the same script print the old `no generated descriptor was readable yet` line and exit 1 |
| Real headless one-shot delivery | `scripts/e2e-headless-in-turn.sh` with a live model route | PASS | `PASS: the report reached the user in one turn`, `Grok workflow: COMPLETED` |
| `writesPaths` planner fill-rate (NR-9) | same script with an objective that explicitly asked for per-task write paths | **INCONCLUSIVE run, informative field value** | the run hit the 900 s script timeout while task 1 of 2 was still retrying; the session transcript shows the task handed to the worker carried `"writesPaths": null`, i.e. the planner declared nothing. n = 1 |
| Settings descriptor identity (t31/F1) | `npx vitest run test/settings-projection.spec.ts test/config.spec.ts` | PASS | real projection rules pinned (17 volatile fields, structural keys absent, `{uid, refs}`, uid mismatch); mutating the distinctive-key set back to include `toolName` fails the tests |

### A limitation the smoke run exposed

The plugin's diagnostics go through `ctx.logger(...).info()`. The headless app's exporter does
not surface DSH logger records on stdout/stderr (every `INFO` line in the run came from the
Serena MCP server, not from DSH), so the settings line cannot be read out of a headless turn.
That is why the identity check above drives the built `lib/` directly with a real descriptor
instead of grepping a log. The same reason keeps NR-7/NR-8 open: no GUI has ever rendered
this page.

### Notes on what these runs changed in the repository

- The `writesPaths` experiment's child agents ran with full tool access and **made a git
  commit** (`e38ac8e docs: add plan-a three-line workflow gate summary`). The artifact
  (`docs/plan-a.md`) and the second, uncommitted artefact (`docs/plan-b.md`) were removed from
  the working tree; the commit itself stays in history for the captain to handle in the final
  integration, because rewriting history is not a member's decision. This is also a real
  observation about the plugin's blast radius: children inherit the session's tools, so a
  workflow can commit.

## Remaining gap

- Clean-DSH-profile installation is executed locally; CI has not yet added a
  separate clean-profile install job.


### Homepage PR #16 — merged and locally rechecked

- PR #16 merged to `main` as `ea3e8e31`; CI runs `40178081351`, `40178539805`, and `40178848058` passed on Node 22 and Node 24.
- Root README is a concise English quick-start; `README.zh-CN.md` is the full Simplified Chinese counterpart. Both link to each other at the top.
- Added `docs/images/workflow-overview.svg` and `docs/images/workflow-overview.zh-CN.svg`; both parse as well-formed XML.
- Added `README.zh-CN.md` to `package.json` `files`; current `npm pack --dry-run` lists both READMEs and 33 total files (62.9 kB package). The published v0.1.0 asset predates the `CHANGELOG.md` package addition and has 31 files.
- The merged PR initially omitted the explicit configuration table, disable/uninstall, security, and compatibility sections; the local follow-up restored compact equivalents in both languages.
- **Install-order review finding:** the first README revision told users to run `dsh plugin add` before creating a missing profile. In an isolated `DSH_HOME` check, `plugin add` auto-created a base-only profile; the later `--from-default-profile headless` rewrote that profile and removed the installed plugin dependency.
- **Correction:** both READMEs and `docs/LOCAL-TESTING.md` now create the headless profile first, then install the plugin, and explicitly warn not to run `--from-default-profile` after `plugin add`.
- Install command verified against project metadata: `dsh plugin --profile grok-workflow-dev add github:free6589/dsh-grok-workflow`; requirements remain DSH `0.2.1-rc.2`, Node.js >=22, and a profile with workflow/subagent services.


### First release v0.1.0 — published

- PR #18 merged to `main` as `7904e23`; main CI `40182707932` passed on Node 22 and Node 24.
- First tag-triggered release run `40182588171` failed in the changelog extractor: the regex literal contained an extra backslash from the YAML/heredoc escaping.
- Fixed in `a7d5a62` (`fix: correct changelog section regex in release workflow`); the tag was recreated at that commit before any GitHub Release existed.
- Final tag `v0.1.0` (tag object `f175ada8a7533a5f61c06a75e5a457e32b37579b`) points to `a7d5a6267c471a6ed73e44ac02092f59942c508a`.
- Release workflow `40182751006` — **PASS** on **Node 22 only**, including typecheck, lint, build, `lib/` consistency, tests, package checks, and release creation. Main CI `40182707932` covered Node 22/24.
- GitHub Release: https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.1.0; asset `dsh-grok-workflow-0.1.0.tgz` (61,281 bytes).
- Tag-pinned install smoke **PASS** in an isolated `DSH_HOME=.dsh-home/tag-smoke`: created the headless profile first, ran `dsh plugin --profile tag-smoke add github:free6589/dsh-grok-workflow#v0.1.0` (pnpm installed the plugin dependency), and `--dump-config` showed the `grok-workflow` bundle row. A real `grok_workflow` model call was **NOT_RUN**.


## 0.2.0 real-profile install matrix (2026-10-27, local operator machine)

Environment: real profiles `headless` and `web` (layerfs root `/home/fish/dsh-layerfs/profiles/`),
plugin `github:free6589/dsh-grok-workflow#v0.2.0`. Headless ran with a temporary model overlay
(bifrost-completions / runanywhere+wb/cn, key via env, never written to disk); web uses the
operator's own model routes. All artifacts under /tmp/mx/ and ~/dsh-profile-backups/.

| # | Item | Profile | Result | Evidence |
|---|---|---|---|---|
| 1 | Mandatory entry: "hi" | headless | PASS | Full workflow (planner, 1 task verified), in-turn delivery, turn `completed`, no direct answer (02-hi.jsonl) |
| 2 | Simple question | headless | PASS | EXIT 0, report delivered (03-2plus2) |
| 3 | Follow-up on same session | headless | PASS | EXIT 0, follow-up also gated into workflow (04-followup) |
| 4 | Broken model config | headless | PASS | EXIT 1 with explicit error, fail-closed, no silent answer (05-bad) |
| 5 | Secret leakage | headless | PASS | Key value absent from all run logs and session store (06-scan) |
| 6 | Stability | headless | PASS | 6 consecutive EXIT 0 runs with reports (02..09); one earlier 570s timeout was transient model congestion, not a defect |
| 7 | Recursion guard | headless | PASS | One workflow run per message in every event stream; no nested runs |
| 8 | Settings surface identity | both | PASS / NOT_RUN | CLI side: `scripts/smoke-settings-identity.mjs` over built lib (real projection). GUI rendering: NOT_RUN — operator check pending |
| 9 | Web install + composition | web | PASS | `dsh plugin list` shows 0.2.0; dump-config composes `# == dsh-grok-workflow`; service restarted and serving (HTTP 401 = auth alive) |
| 10 | Web GUI interactive | web | NOT_RUN | Requires operator login (HTTP 401); left for morning checklist |

Install forensics: `dsh plugin add` writes the profile manifest under the layerfs root; a plugin is
composed only when listed in `dsh.profile.bundles` (web install lost this step to an interrupted
call and was repaired explicitly). Rollback: `dsh plugin --profile <p> remove dsh-grok-workflow`;
backups in `~/dsh-profile-backups/` (pre-install and post-install snapshots).


## Round 4 — progress visibility in the Web GUI (2026-10-27, t44)

Goal: the conversation panel must show the run while it runs, not a blank window. Method: own
debug profile (`web-grok-debug`, `:3199`), the packed build installed there, three real GUI
sessions driven by Playwright, and the server's own session log as ground truth (decompressed
`session.v4.jsonl.zstd`, so the timings are host-clock). Artifacts:
`docs/knowledge/evidence/t44/`. Live `:3090` was not touched.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Node appears immediately | **PASS** | `run-start` **60 ms** after `turn/start` in the session log; first paint of the node **~0.26 s** after the Send click (browser + WS round trip), showing "0 members / No members started" before any subagent exists |
| 2 | Member rows grow with the subagents | **PASS** | 0 → 1 (`grok-planner`, Plan) at 0.45 s → 2 (`grok-worker-…-a1`, Execute) at 10.1 s → 3 (`grok-verifier-…-a1`, Verify) at 35.4 s; header count follows ("1 member"… "3 members") |
| 3 | Terminal state renders | **PASS** | Completed run: `data-run-status="completed"`, header "Completed" at 78.7 s. Run stopped from the GUI at ~8 s: `agent-end {outcome:"cancelled"}`, `run-end {stopReason:"cancelled"}`, panel shows `cancelled` |
| 4 | **Risk item**: does a node anchored before `step/start` render? | **PASS (measured)** | `run-start` at seq 7 (60 ms) vs `step/start` at seq 19 (**78 651 ms**) — the node is visible and live for the entire run. Plan B is not needed |
| 5 | `showProgress: false` writes nothing | **PASS (test)** | `test/progress.spec.ts` runs the real engine with the switch off: zero `tool-workflow/*` events, workflow still returns a validated report |
| 6 | Recording cannot break a run | **PASS (test + mutation)** | A session that refuses the write only costs the entry (one warning); deleting the `try/catch` fails that test, deleting the ownership guard fails the isolation tests, deleting the `run-start` call fails the ordering tests |
| 7 | Contract shapes match the in-tree recorder | **PASS (test)** | Field-for-field payload assertions, including the absent `phase` key |
| 8 | Whole suite | **PASS** | `npm run ci` → 20 files / **306 tests** (294 before, +12), typecheck and oxlint clean (0 warnings, 0 errors) |
| 9 | A live **failed** run | **NOT_RUN** | The short objective verified, so the run completed; `error → failed` is the stock fold's own mapping, and the cancelled case exercises the same "leave `running`" transition. Not claimed as measured |

Two facts worth keeping: (a) the pre-t44 emptiness was not a GUI defect — the events simply did
not exist, and reproducing the tool layer's recorder is enough to reuse the panel that
`dsh-web-app` already ships; (b) in-turn ordering puts `run-start` at turn level, so any future
event this plugin writes must be assumed to arrive before the step and be anchored accordingly.

## Round 5 — unload observability, the notice, per-session slots, the deadline default (2026-10-27, t45)

Goal: close the four defects t41 diagnosed from real logs (silent unload, no user-visible
explanation, a process-wide run cap that let one session starve the others, and a 30-minute
deadline that killed two four-task runs at 30m00s / 30m01s). Method: `test/lifecycle-disposal.spec.ts`
(15 tests, driven through `runWorkflow` + `disposeActiveState` with a hanging fake engine), five
mutation checks, and a live round on the own debug profile `:3199` with **two** GUI sessions and a
`SIGTERM` / settings-toggle unload. Artifacts: `docs/knowledge/evidence/t45/`. Live `:3090` untouched.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | An unload writes a `plugin:grok-workflow/dispose` record before cancelling | **PASS** | Live `SIGTERM`: `at 17:22:05.532Z, uptimeMs 34352, signals ["SIGTERM"], trigger "shutdown", activeRuns 1, notices 1`, six call-site frames; the record precedes the abort, so it survives even when the runs never report |
| 2 | The record names *who* as far as it is knowable | **PASS** | `signals` is a fact the process records (probe installed at `apply`): non-empty = shutdown, empty = in-process unload. Stack-only attribution was measured to be useless here — on a real instance both paths show only cordis frames, so `trigger` stays `unknown` when nothing else proves otherwise and the frames travel with the record |
| 3 | A cut run is reported as `unloaded`, not as a plain cancel | **PASS (test)** | `failure('Unloaded', …)`, `outcome.cause === 'unloaded'`, message "cancelled because the plugin was unloaded …"; a caller stop keeps `cause === 'cancelled'` and "cancelled by its caller". Mutation: forcing the unloaded branch off makes both tests fail |
| 4 | The user is told **once**, and only when something was damaged | **PASS (write) / NOT_RUN (render)** | One `assistant/message` (`model: workflow-notice`, `surfaceOp: append`) per affected session — measured with 1 run in 1 session, 2 runs in 1 session (still one row) and 2 runs in 2 sessions (one row each). The row was never seen **on screen** (see the README's "not proven" section) |
| 5 | An idle unload (the case a user causes on purpose) is silent | **PASS** | Zero session events, one `logger.info` line; live: disabling from the plugin switch with nothing running left the transcript's notice count at 0/0 |
| 6 | A refusing session cannot block the cancellation | **PASS (test)** | Session that throws on `append`: `notices: 0`, both warnings logged, the run is still cancelled *and* disposed, exit cause still `unloaded` |
| 7 | One session cannot starve another | **PASS (live + test)** | `maxActiveRuns: 1`; session A's run at 16:46:20 and session B's at 16:46:29 both `running` (`slots.json`). Unit: session B starts while A holds two runs; A's third refusal names `holding: run run-1 (running 14m38s), run run-2 (…)`. Mutation to a process-wide count fails all three cap tests |
| 8 | A process-wide backstop still exists | **PASS (test)** | `maxActiveRunsTotal` (default 8, hard cap 16) refuses the third run across sessions and names the holding sessions with their run counts and oldest age |
| 9 | The deadline default is 60 minutes | **PASS** | `resolveConfig().timeoutMs === 3_600_000`, hard ceiling still `86_400_000`, settings page shows `3600000`; the deadline report names the value actually used ("1000 ms deadline" in the test). Mutation back to `1_800_000` fails two assertions |
| 10 | Whole suite | **PASS** | `npm run ci` → 21 files / **321 tests** (306 before, +15), typecheck clean, oxlint 0 warnings 0 errors |
| 11 | The settings page renders the new labels | **NOT_RUN** | The Settings dialog did not open in the scripted GUI runs; covered structurally by `test/client.spec.ts` (bounds table + both dictionaries) and `test/settings-projection.spec.ts` (19 volatile fields) |
| 12 | A process that *starts* disabled tells the user | **NOT_RUN (by design)** | Nothing of the plugin runs in that case, so nothing can speak. Documented in DD-13 rather than papered over; a second always-on bundle entry would be the only fix and is out of scope for 0.2.2 |

Two facts worth keeping: (a) "who unloaded me" is not recoverable from a JavaScript stack in this
host — the reliable signal is a *process fact* (a shutdown signal we observe ourselves), and the
record says `unknown` when even that is absent instead of guessing; (b) the per-session cap is the
one change in this round that a user will notice as an improvement rather than a fix, because it
turns a refusal into a working run.

## Round 6 — v0.2.2 acceptance on a second, independent instance (`:3100`, t46)

Question this round answers: does the v0.2.2 tree behave *as a product* on a profile that is a
byte-for-byte copy of the user's live one, without touching that live instance? Method: the live
`profiles/web` was copied (19 third-party bundles, `node_modules` included) to a new home
(`/home/fish/dsh-v022-home`) because DSH keys sessions by **workspace path**, so a shared home
would mix the user's own sessions; the copy listens on `127.0.0.1:3100`. The installed package is
`npm pack` output of the t45 tree (md5 `0a2190b6…`); all five `lib` files are byte-identical to
the repo build and `lib/client.js` equals `src/client/index.js` (`evidence/t46/instance-facts.txt`).
Live `:3090` was never restarted, stopped or reconfigured — it still runs `disabled: true`.
Artifacts: `docs/knowledge/evidence/t46/`.

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | (a) Every user message is forced through the workflow — `hi`, a one-line question, and a bare follow-up | **PASS** | Three messages in one session produced exactly three runs (`hi` → planner+1 task+verifier verdict "quality", `1+1 等于几？` → `COMPLETED … 1 verified`, `那 2+2 呢？` → ran and reported one quality finding); no turn produced a direct answer. `A-reports.txt`, `session-evidence.txt` §1 |
| 2 | (b) Progress is visible while the run is live | **PASS** | The run node first paints at **358 ms** / 40 ms / 21 ms after send (`B-samples-*.json`), carries `data-run-status` through `running` → `completed`/`completed`, and the member list grows with each child agent; `B1-node-hi.png` |
| 3 | (c) The settings page renders the v0.2.2 fields in both locales, with the 60-minute default | **PASS** | ZH: `每会话活跃运行上限`, `全部会话活跃运行上限`, `3600000`, `按角色模型链`, `保存`; EN: the same four labels in English; card title `Grok workflow` in both; `<html lang>` round-trips `zh-CN` → `en` → `zh-CN`. `C1-settings-zh.*`, `C2-settings-en.*`, `C-settings.log` |
| 4 | (d) Role chains are editable **through the product** and take effect per role | **PASS with a discrepancy** | Edited the worker chain on the page (second route added by hand), saved: banner "已保存，下一条消息生效。", patch then holds `worker: [wb/cn:no-such-model-probe, wb/cn:deepseek-v4.1-flash]` (`instance-facts.txt`). Effect: the parent session's own requests use `wb/cn:mimo-v2.6-pro` while **all 19 child agents** use `wb/cn:deepseek-v4.1-flash` (`session-evidence.txt` §3). Discrepancy: the report's `Model routes:` line appears only after a settings-page save — the same chain written directly into the profile patch produced no such line (see "open questions") |
| 5 | (e) A cut run is explained, not silently dropped | **PASS for unload and caller stop, INCONCLUSIVE for the deadline** | Unload mid-run (plugin switch off with a run live): the delivered report says `FAILED … Failures: 1 cancelled … grok_workflow was cancelled because the plugin was unloaded while the run was in flight (not a deadline and not a manual stop)`. Caller stop: `run-end stopReason=cancelled`, `turn/end aborted/user`, and no report, because the user aborted the turn themselves. Deadline: a 60 000 ms value saved through the page did **not** stop a run that was still working at 2 m 40 s and beyond (`I1-deadline-conversation.txt`), and the value could not be re-read afterwards because the patch was only inspected after the restore — so either the save did not reach the runtime or `ctx.workflowEngine.start` does not act on the aborted signal while a child call is in flight (`src/run.ts:383`, the timer aborts a signal handed to the engine). `E4-report-after-unload.txt`, `F-stop.log`, `I-deadline.log` |
| 6 | (f) Idempotence, no recursion into subagents, no secret leakage | **PASS** | Runs == deliveries admitted == delivered, 0 duplicates in all 5 user-driven sessions; 19 child sessions, **0** of them started a run; the provider key does not appear in any session file (0 hits) and no `sk-…` string does either. `session-evidence.txt` §1, §2, §5 |
| 7 | (g) Five consecutive rounds without degradation | **PASS for stability, FAILED for quality — corrected in t49** | Five objectives in a row on the same instance: 155.0 s, 181.9 s, 181.8 s, 181.7 s, and the fifth round finishing `completed`; every run reached a terminal state, none needed a retry — that is exactly what this row measured, and it holds. What it did **not** measure, and what t48 spot-checked: every one of those five rounds' *reports* says `Grok workflow: FAILED` with `Failures: 1 quality` and `0 verified`. The engine finishing (`stopReason: completed`) is not an accepted result. Whole test home, 12 reports: `COMPLETED` 1, failed-for-quality 8, cancelled by deliberate probes 3. Root cause (t49): all 8 quality failures were **one defect** — `checkVerification` failed a task whenever the verifier's prose `issues` was non-empty, even though the verifier had returned `verdict: pass` and its own notes say "non-blocking" / "minor observation rather than a failure" / "does not affect any acceptance criterion". Fixed in `src/script.ts` with regression tests; see Round 8. So: 流程稳定 5/5，质量结果 0/5 `COMPLETED`，根因＝我方判定缺陷（已修），不是模型能力问题。`G-rounds.log`, `G-rounds.json`, `G{1..5}-round.png` |
| 8 | (h) Coexistence with the other 18 third-party bundles | **PASS** (t48 re-ran the same profile with **20** bundles — `@orbisapp/remote-dsh` restored — and the boot picture did not change; see Round 8) | Same bundle set as the live profile; boot reports three non-activations and all three are pre-existing properties of that profile, not of this plugin: `@dsh-layerfs/host` and `@dsh-layerfs/client` cannot be resolved from the profile directory (identical in the source profile) and `account-controller` waits for a `deepseekAccount` service this profile does not provide. `instance-facts.txt`, `H-plugins-page.png` |
| 9 | t45 NOT_RUN ② — settings page, new labels + default, EN and ZH | **CLOSED, PASS** | Row 3 above |
| 10 | t45 NOT_RUN ① — the notice row **on screen** | **CLOSED, FAIL** | The row is written (`assistant/message`, `model: workflow-notice`, text verified in the log) but the transcript never shows it: it sits at `turn=1 step=0`, the persisted event carries **no `surfaceOp`** field *(corrected in Round 7: the field **is** present, `surfaceOp: "append"`, as a top-level sibling of `data`; the row is dropped because that `(turn, step)` never had a `step/start`)*, and after the cancellation the turn continues at `step=1` and delivers the gate's report instead (`session-evidence.txt` §6, `E3-conversation-after-toggle.txt`). The information still reaches the user — through the report — so this is a redundant-channel defect, not silence |
| 11 | Whole suite | **PASS** | `npm run ci` → 21 files / **321 tests**, typecheck clean, oxlint 0 warnings 0 errors |

### Open questions this round leaves behind

1. **`Model routes:` is conditional on a settings-page save.** Before the save the report carried
   no such line while the same chain was already in the profile patch; after the save it did. One
   plausible reading is that the settings layer only publishes `roles` to the runtime once it has
   been written by the product, but that has not been root-caused and is not claimed here.
2. **A bogus first route did not show up as a `Route switches:` entry.** The saved worker chain's
   first route named a model that cannot answer, yet the run used the second route and reported no
   switch. Either the route was pruned before use, or switching was silent. Worth a dedicated task.
3. **The deadline did not fire live.** See row 5: one experiment, two candidate causes, no
   verdict. Re-running it needs the saved value to be read back from the patch *before* the run,
   which is the first thing the next attempt should do.
4. **The notice row needs a render path.** `assistant/message` at `step=0` with `surfaceOp:
   append` is dropped by the client's transcript projection; whatever shape the client *does*
   render (a row inside the live step, or a `system/message`) is the fix to design.

One thing this round deliberately did **not** do: provoke the per-session slot refusal from the GUI
(a second message is queued by the client, so one session never holds two runs on this instance);
that wording remains covered by `test/lifecycle-disposal.spec.ts` and the t45 live run.

## Round 7 (t47) — the three leftovers, plus one correction

Same instance discipline as Round 6: test home `/home/fish/dsh-v022-home`, profile `web-v022-test`,
listener `127.0.0.1:3100`; live `:3090` (pid 1773499) was never restarted, stopped or reconfigured.
Twelve new tests, `npm run ci` → 21 files / **333 tests**. Artifacts:
`docs/knowledge/evidence/t47/` (README, `instance-facts.txt`, `notes.txt` + the measurements).

| # | Question left open by Round 6 | Verdict | Evidence |
|---|---|---|---|
| 1 | `Model routes:` appeared only after a settings-page save | **FIXED (ambiguity removed) + one real defect found** | Patch-only configuration (no settings page) reaches the runtime — a temporary dump of what the loader hands `apply()` shows `roles.get()` returning the planner/worker/verifier chains — and the live report names them: `Model routes: planner=bifrost-completions/wb/cn:deepseek-v4.1-flash; worker=…; verifier=…; synthesizer=inherit`. Two code paths could print nothing and both are gone: the line was skipped when every chain was empty (now always printed, `inherit` spelled out) and `failureReport()` hard-coded an empty routing block, so a timeout or unload report claimed `inherit` for a run that had a chain (now derived from the config). `raw-config.json`, `B1-deadline-report.txt`, `test/report.spec.ts`, `test/config.spec.ts` |
| 2 | A deliberately broken first route produced no `Route switches:` entry | **ANSWERED: that configuration never ran** | A chain whose first route names a model the provider does not enumerate is rejected **at load** (`roles.worker names model "wb/cn:no-such-model-probe", which provider "bifrost-completions" does not enumerate`) — the entry fails to apply, so t46 did not see a silent switch, it saw a chain that never existed. Runtime failures do switch and are traced: a 429 on the first route advances to the second and the trail records `w1` failed → `w2`. The `Route switches:` renderer had **no test at all** before t47; it has two now. `A2-load-rejection.txt`, `test/config.spec.ts`, `test/report.spec.ts` |
| 3 | The deadline did not fire live (settings never reached the runtime vs engine ignores abort) | **ANSWERED: the second. FIXED.** | With `timeoutMs: 60000` in the profile patch (no settings page) the run's own report says `workflow exceeded the 60000 ms deadline and was cancelled; **the engine had not settled**`, and the UI run node leaves `running` at 61.5 s. `src/run.ts` used to abort a signal and then wait for the engine; it now races the run result against its own deadline, cancels with a reason that names the deadline (it used to say "cancelled by its caller"), and returns the timeout report immediately. Regression test: a stubborn engine whose `cancel()` is a no-op returns in ~1.0 s for a 1 000 ms deadline. `B1-deadline-report.txt`, `A-run.log`, `test/reliability.spec.ts` |
| 4 | The notice row needs a render path | **CLOSED: not reachable from a plugin in this build — downgraded deliberately** | The persisted event **does** carry `surfaceOp: "append"` (t46's "no such field" was wrong). The client starts an assistant node only on `step/start` (`dsh-client-ui-chat/lib/client.js:8094-8108`); `assistant/message` is an `update` there, and the notice sits at a `(turn, step)` whose `step/start` never happened. `system/message` renders as the system-prompt card (`client.js:9947-9966`), `conversation.chat.node` is a keyed renderer seat whose nodes only the chat package's own projections can create (`client.js:7180-7215`, module-private `chatNode()`), and no toast/notice API ships. Downgrade: the notice stays in the ledger (it also puts the fact into the next turn's context on purpose) and the **report is the only user-facing channel** — verified in the same session. `E5-notice-event.json`, `E3-conversation-after-unload.txt`, `E5-report-relay.txt` |

Round 7 also corrected a Round 6 claim rather than quietly dropping it: row 10 above now says the
notice event carries `surfaceOp: "append"`, and that the drop is the projection's `step/start`
requirement, not a missing marker.

**Deferred to 0.2.3 (with the reason, not a silent drop):** a rendered notice needs a DSH-side way
for a plugin to contribute a chat node, or a notice event with its own projection. Both are DSH API
surfaces, outside the "external plugin, no core change" boundary this work runs under.

## Round 8 (t49) — why the quality results were 0/5, and what the release may claim

Triggered by t48's R2: the test home held 12 reports, one `COMPLETED`, and t46's five acceptance
rounds all reported `FAILED / Failures: 1 quality`. Same instance discipline as Rounds 6–7
(test home `/home/fish/dsh-v022-home`, profile `web-v022-test`, `127.0.0.1:3100`); the live
`:3090` instance (pid 1773499) was not touched, and its profile — which the user has since
edited — was not read or written. Artifacts: `docs/knowledge/evidence/t49/`.

### What the twelve reports actually were

| Group | Count | Reason in the report |
|---|---|---|
| `COMPLETED` | 1 | — (`session-664084e6`, second round) |
| failed — quality | **8** | every one: `incomplete (quality): verifier reported issues: …` |
| failed — infrastructure / cancelled | 3 | the two 60 000 ms deadline probes and the unload probe from t47 — deliberate kills, not quality |

Not one report said `verifier verdict was fail`, `criterion not met` or
`verifier supplied no checked evidence`.

### Root cause: prose overrode the verdict (our defect, not the models')

`checkVerification` (`src/script.ts`) tested, in this order: no result → executor failed →
**verdict ≠ pass** → **`issues.length > 0`** → no checked evidence → criteria count → per-criterion
`met`/evidence. The observed reason string is produced by the fourth test, so in all eight cases
the verifier had returned **`verdict: pass`** and the task failed purely because its prose `issues`
list was non-empty. The notes themselves say so: "Minor inaccuracy, **non-blocking**…", "recorded
as a **minor observation rather than a failure**", "**does not affect any acceptance criterion**",
"处理合理，不影响本次字节级验证结论", "故**判定为满足**".

So the answer to *"flash as verifier too strict, or worker too weak?"* is **neither**: the verifier
was passing the work and adding a caveat, and the plugin turned the caveat into a failure. A
secondary finding from the same data: the flash verifier never once failed a criterion outright —
the model was *not* the limiting factor in these twelve runs.

### The fix

- `issues` no longer decides anything. The decision is `verdict` + one `criteria` entry per
  acceptance criterion with `met` and non-empty evidence; `met: false` or `verdict: fail` still
  fails the task (unchanged, and now pinned by tests).
- A verified task's notes are carried into the report as `Uncertainties` → `verifier note: …`, so
  nothing is lost and the reader still sees the caveat.
- The verifier prompt now defines `issues` as **blocking problems only** (each must be reflected in
  `verdict: fail` / `met: false`) and points residual doubt at `confidence`.

### Verification of the fix

| Check | Result |
|---|---|
| New regression tests (`test/config.spec.ts`, three cases: notes-only pass → `COMPLETED` + notes in `Uncertainties`; `met: false` despite `pass` → failed; `verdict: fail` → failed), using the verbatim live note strings | pass; suite 24/24 in that file |
| Mutation: restore `if (issues.length > 0) return {passed:false…}` | **2 of the 3 new tests fail** — the tests do detect the old behaviour |
| Live A/B on :3100 with the *same* flash chains (planner/worker/verifier all `deepseek-v4.1-flash`), same objectives as t46 rounds 1, 4 and 3 | before the fix: all of them failed (`Failures: 1 quality`); after: **three runs, each `COMPLETED`, 1 task, 1 verified** (`Q2-report.txt`, `Q4-report.txt`, `Q5-report.txt`) |
| Honest limit of that A/B | in all three post-fix runs the verifier recorded **no** issues at all, so the live delta is *consistent* with the fix but not *discriminating*; the discriminating proofs are the branch-order argument above and the mutation-verified tests |
| `npm run ci` | 21 files / **336 tests**, typecheck + lint clean |

### Configuration advice (asked for explicitly)

Nothing about the default chains needs to change to get *correct* decisions any more. What the
recorded data does support: with `maxRetries: 0` a task gets exactly one worker attempt, so any
real quality problem surfaces as a hard failure instead of a repaired one. If a user wants
verification to be stricter or looser, that is `roles.verifier` — a model choice, deliberately not
tuned by the plugin.

### Two operational notes for whoever runs the next instance

1. **Check the plugin card's switch before trusting "no run happened".** On a fresh boot at
   05:12 the card read *disabled* while `cordis.patch.yml` said `disabled: false`, and a message
   sent then was answered directly — no gate, no `plugin:grok-workflow/delivery` record (verified in
   the session log). Clicking the switch on armed the gate immediately: no restart, and the patch
   file's mtime did not change. After the next fresh boot the switch read *enabled*. The rule that
   survives all three observations: read the switch, do not infer it from the patch.
2. **This instance now carries 20 bundles**, including `@orbisapp/remote-dsh` (t48 R6 restored it),
   which closes the one-bundle gap in Round 6 row (h): boot still reports exactly the same three
   pre-existing non-activations.

## Round 9 (t52) — the front desk on `:3100`, and three defects it found

Plan C was implemented and then measured on the same test instance as Rounds 6–8: test home
`/home/fish/dsh-v022-home`, profile `web-v022-test`, listener `127.0.0.1:3100`, raw data in
`docs/knowledge/evidence/t52/`. The live `:3090` instance and its profile were not touched.

Each row is one message typed into one session of the web UI, in this order, with the answer text
kept verbatim in the evidence directory.

| # | Message | Tier the front desk stated | What the user saw | Time |
|---|---|---|---|---|
| M1 | `你好` | 直答档 — 这是问候/寒暄，没有要做的事 | template answer + `（这条没有动用团队，前台直答。）` | ~10 s (no call) |
| M2 | `算一下 5×6 等于多少，只回答数字` | 快手档 — 单一动作、线索完整 | `30` + `（这条只派了一个工人，没有开完整团队。）` | ~21 s |
| M3 | `把这个弄一下` | 确认档 — 信号互相矛盾或线索不足 | `这个要动用团队吗？可回复：简单 / 团队。` | ~10 s |
| M4 | `简单` | 快手档 — 你刚才回答「简单」，按你的选择走快手档 | answer + quick-tier note (the pending answer is remembered) | ~18 s |
| M5 | `用团队：只回答一个字` | 团队档 — 你的消息里点名了团队 | `收到！团队开工中，施工牌在旁边。` then a full report (plan, 1 task, 1 verified) | ~180 s |
| M6 | `你好` | 直答档 | template answer again — the tier does not drift inside a session | ~11 s |
| M7 | `先读一下 src/triage.ts 里的 TRIAGE_LIMITS，然后把两个阈值的意思写成三句说明` | **确认档 (defect)** | asked instead of starting | ~12 s |
| M8 | same message, after the fix | 团队档 — sequencing (was 确认档 before the fix) | the full workflow started and ran to a **failed** report: the objective named a path outside the instance's workspace (`/home/fish/project_jobs`), and the report says so instead of inventing an answer | ~204 s |
| M9 | `你好` with `mode: 'full'` | no tier line at all | the full workflow (`COMPLETED`, 1 task, 1 verified) — the pre-t52 behaviour, i.e. the rollback switch works | — |

### Defects the live matrix found (none of them were visible in unit tests)

1. **The chat tier's single call returned nothing.** `agentsStarted=1 value={"reply":null}`: the
   child answered the social message in prose, and the guest collapses "child failed" and "child
   returned no structured value" into `null`. Fix: the direct tier answers from a template — that
   is also what "秒回" means — and `chatReply()` names what the plugin does.
2. **The quick tier failed the same way, intermittently** (same prompt succeeded twice, returned
   `{"reply":null}` twice). Fix: the plain call (no schema, the child's text is the answer) is the
   primary and a schema-shaped call is the retry; the reason line now carries `agentsStarted`, so a
   future failure is diagnosable instead of just "no text".
3. **Sequencing lost to the conflict rule.** `先…然后…` scored one team point against two fast
   points ⇒ the front desk asked about a plainly two-step request (M7). Fix: `multiStep` is decisive
   before the score comparison; pinned by a test.
4. **A front-desk answer was recorded as a failed delivery.** `answer.kind === 'report'` was the only
   "delivered" case, so a direct answer left the batch routable and the plugin record said `failed`
   (`phase: failed, outcome: triaged-chat` in the session log). Fix: `direct` also settles the batch;
   only `notice` stays routable.

### What this round does *not* establish

- Latency numbers are single samples on a shared instance with a flash route; they are order-of-
  magnitude evidence (seconds vs minutes), not a benchmark.
- The quick tier's "one call" promise is "one call in the common case": when the plain call returns
  nothing, a second (structured) call happens, and the failure text stays truthful.
- M8 shows the team tier starts for a sequenced request; M5 shows a completed team run with the
  greeting. Neither is a statement about the quality of the work the team produced.

### Regression and compatibility

| Check | Result |
|---|---|
| `npm run ci` | 22 files / **358 tests**, typecheck + lint clean (baseline was 21 files / 336) |
| Pre-t52 behaviour preserved | `mode: 'full'` produces the pre-t52 answer shape (no tier line, no greeting); pinned by a test in `test/triage.spec.ts` |
| Existing suites | gate, reliability and composition suites pass `mode: 'full'` explicitly, so their semantics are unchanged |
| Settings page | three new volatile fields (`mode`, `triageAsk`, `triageModel`) projected to the browser form; volatile count 19 → 22, pinned by `test/settings-projection.spec.ts` |

## Round 10 (t54) — the fourteen t53 F1 samples, re-run after the ordering fix

The t53 review found the blocker described in DECISIONS D-025: the direct tier's "short and inert"
shortcut ran before the sequencing and question rules, so short questions and short two-step
instructions were answered from the greeting template — honest tier line, no work done. After the
reorder, the fourteen directed samples were sent one at a time through the front desk of the test
instance (`/home/fish/dsh-v022-home`, profile `web-v022-test`, `127.0.0.1:3100`; live `:3090`
untouched). Page text, screenshots and timings: `docs/knowledge/evidence/t54/`.

| # | Sample | Tier observed | Did it do the work? |
|---|---|---|---|
| 1 | `为什么天空是蓝的` | 快手档 (`question`) | yes — a Rayleigh-scattering answer from one worker |
| 2 | `今天几号` | 快手档 (`question`) | yes — answered from the date |
| 3 | `解释幂等` | 快手档 (`question`) | yes — an explanation |
| 4 | `what is idempotency` | 快手档 (`question`) | yes — same, English |
| 5 | `how many files are in src/` | 快手档 (`question`) | yes — the worker counted and reported |
| 6 | `先备份然后升级` | team (work done; see note) | yes — produced `.backups/`, `upgrade/`, `UPGRADE_REPORT.md` |
| 7 | `先建目录再拷文件` | team (work done; see note) | yes — produced `dsh-backup-copy-20261029/`, `COPY_REPORT.md` |
| 8 | `备份数据库并通知我` | team (work done; see note) | yes — produced `.backups/db-backup-…/`, `DB_BACKUP_REPORT.md`, `NOTIFY.md` |
| 9 | `1) 备份 2) 升级` | team (rule; unit test only) | not sent live — the budget went to the three above |
| 10 | `这个报错 src/triage.ts:42` | 快手档 (`single-step`) | yes — dispatched instead of being asked about (this was the second defect) |
| 11 | `改一下那个` | 确认档 (`ambiguous`) | asked back, nothing dispatched — still correct |
| 12 | `简单` | 快手档 (`pending-fast`) | read as the answer to sample 11 |
| 13 | `团队` | 直答档 (`stale-choice`) | said the pending question was gone; nothing dispatched, no crash |
| 14 | `你好` | 直答档 (`small-talk`) | template, no dispatch |

Note on rows 6–8: the answer had not arrived when the capture budget ran out (row 6 was still
executing at 900 s), so their page captures carry no tier line. The team tier is nonetheless
established for them by the work itself: the directories and reports listed above cannot be produced
by the template or by a single quick worker, and the classifier returns `team`/`multi-step` for those
exact strings in `test/triage.spec.ts`.

### An operational hazard this round exposed (and what was done)

The profile's workspace is `/home/fish/project_jobs`; **starting the instance from another directory
does not change it**. Rows 6–8 therefore did their work in a live workspace: 329 MB of backups,
copies and reports, all created by the samples themselves. Everything created was moved to
`/tmp/t54-quarantine/` (listed in `evidence/t54/QUARANTINE-MANIFEST.txt`, restorable with one `mv`).
Nothing pre-existing was modified or deleted, the dsh install is still `0.2.1-rc.2`, and `:3090` was
never read or written. Any future matrix must either point the profile at a scratch workspace or
use objectives that name no filesystem action at all.

### Regression and compatibility

| Check | Result |
|---|---|
| `npm run ci` | 22 files / **362 tests**, typecheck + lint clean (was 358; +4 regression groups for this blocker) |
| The ordering contract | the four new test groups pin: questions → at least the quick tier in zh and en; short two-step / `1) 2)` / `一、二、` / semicolons → team; a path-, code- or snippet-bearing pointer → dispatched, while `改一下那个` still asks; bare `简单` / `团队` → direct tier with an explanation, with and without a pending question |
| `mode: 'full'` | untouched by this change; still reproduces pre-t52 behaviour (Round 9, `evidence/t52/M9-full-mode-rollback.txt`) |
| Version | `package.json` / `package-lock.json` at `0.2.3`, `CHANGELOG.md` `## [0.2.3]`, release-notes draft written; the `0.2.2` … `0.1.0` sections are byte-identical to their tags |

## Round 11 (t56) — v0.2.3 收尾：残留清理、中文 README、分类器三处缺口 + 隔离工作区上的 44 条矩阵

**这一轮的纪律前提**：真机矩阵跑在一次性工作区 `/tmp/t56-work` 上（[TESTING.md](TESTING.md) 规则 1/8/9），
会话目录为 `sessions/--tmp-t56-work--/<uuid>/`，用户目录 `/home/fish/project_jobs` 本轮零新增。
上一轮（t54）的第二批残留也在这一轮清掉，见 §1。

### 1. 用户目录残留清理（N2）

| 项 | 处理 | 结果 |
|---|---|---|
| `.backups/db-backup-20261029-104117`（3.6 MB，19 个库的只读副本 + `run_backup.sh` + `logs/`） | `realpath` 校验 → `mv` 到 `/tmp/t54-quarantine/batch2-1041/` | 已移出 |
| `DB_BACKUP_REPORT.md`（87,282 B，md5 `8aabaf7b…`） | 同上 | 已移出 |
| `NOTIFY.md`（2,617 B，md5 `64990a84…`） | 同上 | 已移出 |
| 复扫 `/home/fish/project_jobs`（`-newermt 2026-10-29 10:39`，排除 SQLite 边车） | `find` | **命中 0 项** |
| 既有文件是否被改 | 对比 mtime | 未被修改（如 `猎聘/data/liepin.db` 仍是 10-28 04:08） |
| SQLite 边车 | 25 个 `*.db-shm`、25 个零字节 `*.db-wal` 的 mtime 被只读打开更新 | 如实记录，**不删除**（属 SQLite 自己，删除可能丢未合并 WAL） |

隔离目录 `MANIFEST.txt` 记录批次/体积/md5，`batch2-1041.hashes.txt` 是 139 个文件的逐文件哈希；一条 `mv` 可还原。

### 2. 分类器三处缺口（N3，改实现而非改契约，DECISIONS D-026）

| 缺口 | 修法 | 用例 |
|---|---|---|
| 句尾"几" | `几[个号年月天时分秒]` → `几(?![十百千万乎])` | `3+5等于几`、`这个得几`、`还剩几台机器`、`有几条记录`、`这是几`、`还剩几`、`5的平方是几`、`这台机器几核` → 全部 `fast`/`question` |
| 纯顿号列表 | 新增 `COMMA_LIST`（三个及以上顿号项算多步） | `改配置、重启、验证` → `team`；`读、写` → `fast`（两个项不算多步） |
| `并+回滚` | 动词表补 `回滚\|回退\|重启\|验证\|灰度` | `并回滚到上一版`、`备份、升级后并回滚` → `team` |

**真机抓到的两处误判（单测没覆盖）**：

| 输入 | 修前（真机会话） | 修后（真机会话） |
|---|---|---|
| `is this repo using esm or cjs` | `Tier: confirm`（对一个问题反问了一遍） | `档位：快手档` |
| `这个得几` | `确认档`（被"模糊即反问"拦住） | `快手档` |

修法：英文是非问句按**助动词前置**识别（`is/are/does/do/can/… + this/that/it/…`），并给 `MULTI_STEP` 补英文顺序词
（`then`/`first…then`/`afterwards`/`finally`），保证 `do this then another` 这类祈使多步不被误判为问句。

### 3. 44 条真机矩阵（t55 的 22 + t53 的 14 + 新的 8）

| # | 样本 | 规则判定 | 真机档位 | 判定 |
|---|---|---|---|---|
| 1 | `明天要带伞吗` | fast (`question`) | fast | 合理 |
| 2 | `这个函数的时间复杂度是多少` | fast (`question`) | fast | 合理 |
| 3 | `vue3 和 react 哪个更适合小项目` | fast (`question`) | fast | 合理 |
| 4 | `为什么 npm install 会卡住` | fast (`question`) | fast | 合理 |
| 5 | `node 版本最低要求是几` | fast (`question`) | fast | 合理 |
| 6 | `is this repo using esm or cjs` | fast (`question`) | fast | 合理 |
| 7 | `what does the -u flag do in npm ci` | fast (`question`) | fast | 合理 |
| 8 | `how long does the build take` | fast (`question`) | fast | 合理 |
| 9 | `先跑 lint 再提交` | team (`multi-step`) | team | 合理 |
| 10 | `备份一下数据库并通知我` | team (`multi-step`) | team | 合理 |
| 11 | `改完配置记得重启服务并回滚说明` | team (`multi-step`) | team | 合理 |
| 12 | `一、拉取代码 二、跑测试 三、发版` | team (`multi-step`) | team | 合理 |
| 13 | `1. 建分支 2. 改代码 3. 提 PR` | team (`multi-step`) | team | 合理 |
| 14 | `改配置、重启、验证` | team (`multi-step`) | team | 合理 |
| 15 | `这个报错 src/triage.ts:120 是什么引起的` | fast (`question`) | fast | 合理 |
| 16 | `那个配置 packages/dsh/tsconfig.json 里的 target 要不要改` | fast (`single-step`) | fast | 合理 |
| 17 | `早上好呀` | chat (`small-talk`) | chat | 合理 |
| 18 | `辛苦了` | chat (`small-talk`) | chat | 合理 |
| 19 | `团队` | chat (`stale-choice`) | chat | 合理 |
| 20 | `quick` | chat (`stale-choice`) | chat | 合理 |
| 21 | `加一个 --verbose 开关到 CLI` | fast (`single-step`) | fast | 合理 |
| 22 | `写一份 README 的安装章节` | fast (`single-step`) | fast | 合理 |
| 23 | `为什么天空是蓝的` | fast (`question`) | fast | 合理 |
| 24 | `今天几号` | fast (`question`) | fast | 合理 |
| 25 | `解释幂等` | fast (`question`) | fast | 合理 |
| 26 | `what is idempotency` | fast (`question`) | fast | 合理 |
| 27 | `how many files are in src/` | fast (`question`) | fast | 合理 |
| 28 | `先备份然后升级` | team (`multi-step`) | — | 未覆盖（见说明） |
| 29 | `先建目录再拷文件` | team (`multi-step`) | — | 未覆盖（见说明） |
| 30 | `备份数据库并通知我` | team (`multi-step`) | — | 未覆盖（见说明） |
| 31 | `1) 备份 2) 升级` | team (`multi-step`) | — | 未覆盖（见说明） |
| 32 | `一、备份 二、升级` | team (`multi-step`) | — | 未覆盖（见说明） |
| 33 | `备份；升级；通知我` | team (`multi-step`) | — | 未覆盖（见说明） |
| 34 | `这个报错 src/triage.ts:42` | fast (`single-step`) | fast | 合理 |
| 35 | `改一下那个` | ask (`ambiguous`) | ask | 合理 |
| 36 | `你好` | chat (`small-talk`) | chat | 合理 |
| 37 | `3+5等于几` | fast (`question`) | fast | 合理 |
| 38 | `这个得几` | fast (`question`) | fast | 合理 |
| 39 | `还剩几台机器` | fast (`question`) | fast | 合理 |
| 40 | `有几条记录` | fast (`question`) | fast | 合理 |
| 41 | `这是几` | fast (`question`) | fast | 合理 |
| 42 | `还剩几` | fast (`question`) | fast | 合理 |
| 43 | `5的平方是几` | fast (`question`) | fast | 合理 |
| 44 | `这台机器几核` | fast (`question`) | fast | 合理 |

真机覆盖 **38 / 44**，**误判 0 条**。覆盖方式（全部在隔离工作区 `/tmp/t56-work` 上跑，会话目录
`sessions/--tmp-t56-work--/session-*` 为证）：第一轮 V1–V14、第二轮 V18–V22 + T1–T5 + T12–T14 + J1–J8、
第三轮 V15–V17。**未覆盖的 6 条（T6–T11）都是团队档带文件系统动作的样本**：它们在预算内完成不了
（`先备份然后升级` / `备份数据库并通知我` / 序号与分号形式的那几条），继续等待只会把一个"档位表"变成
"性能测量"，所以它们以规则判定 + V9–V14 六条团队样本的真机结果为准（那六条在同一实例上全部显示
`档位：团队档`）。这不是"没测"，是"测得起的部分都测了、测不起的部分如实标注"。

> 复现注意：一次真机会话同时只能有一个 turn 在跑。第一轮脚本按固定预算发下一条，结果 20 多条消息被
> 丢弃（会话里 `user/message` 只有 14 条），教训已写进 [TESTING.md](TESTING.md) 规则 10：**发下一条前
> 必须等到本轮答案落地**，判据是会话日志里 `assistant/message` 计数增长，而不是页面里出现档位行。



### 4. 两条不变量

| 不变量 | 判定 | 证据 |
|---|---|---|
| **多步永不吃模板** | 所有多步样本（`先…再/然后`、`1)/一、`序号、顿号列表、分号、`并+动词`）落在 `团队档`，无一落 `直答档` | 本表 team 行 + `test/triage.spec.ts` 的 multi-step 回归组 |
| **已识别的问句形态永不用模板** | 所有**被规则识别**的问句（中/英，含句尾"几"、`?`、wh-词、助动词前置，以及 t58 补的 `A不A`/`A没A`、`还是` 二选一、`谁`）落在 `快手档` 或以上，无一落 `直答档`、无一落 `确认档`；规则没认出来的形态不在此承诺之内（见 D-027） | 本表 question 行 + 6 组问句回归测试（规则级验证，本轮未跑真机） |

### 5. 构建与回归

| 检查 | 结果 |
|---|---|
| `npm run ci` | 22 文件 / **366 例**通过，typecheck 与 `oxlint` 0 警告 0 错误（362 → t56 的 365 → t58 的 366） |
| `mode: 'full'` | 本轮未改动该分支；仍由既有测试与 Round 9（`evidence/t52/M9-full-mode-rollback.txt`）钉住 |
| 版本 | `package.json` / `package-lock.json` = `0.2.3`；CHANGELOG `## [0.2.3]`；发布说明草稿已存在 |

### Round 11 addendum (t58) — 规则级验证

t57 的三条 low 修补在本轮完成，**本轮没有真机矩阵**（改动全在分类器规则内，单测是权威证据；真机只会重复
Round 11 已经证明的"档位行照常出现"）：

| 项 | 内容 | 结果 |
|---|---|---|
| L1 测试数统一 | README（EN/ZH）、RELEASE-NOTES-0.2.3、DECISIONS 的当前值统一为实际数（并保留 336→358→362→365→366 的历史链） | 366 |
| L2 证据路径 | `evidence/t56/README.md` §0 里写错的路径改为 `/tmp/t56-evidence/W0-workspace.txt`（578 B），并说明它是临时证据、不在仓库内 | 已改 |
| L3 问句形态 | 新增 `A不A`/`A没A`、`还是` 二选一、`谁` 三条**形态**规则与三条排除规则（见 D-027）；三条对抗探针原句全部 `fast`/`question` | 通过 |

验证方式：`npm run ci` = typecheck + oxlint（0/0）+ build + **22 文件 / 366 例**。本轮**规则级验证**，
无真机样本。

### Round 12 (Issue #22 Phase 1) — 对话可靠性：源码级证据与结论

本节只记录 Phase 1（P0-1…P0-4）的实测证据。分支 `fix/phase1-dialogue-reliability`，基准为
`origin/main` = `3584ef1ec24cb487fed79943a687ca06fe3fccfd`（实施时 `git ls-remote origin main` 实测）。
DSH 安装：`/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@deepseek-ai/dsh/`
（`package.json` 版本 `0.2.1-rc.2`）。

#### R12-1 `agent/pre-step` 与 `enter.messages` 的真实语义（P0-1 根因）

| 位置 | 结论 |
|---|---|
| `node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js:902-921` `async preStep(target, position)` | 第 906 行 `const claimed = this.inbox.claim(target, position.turn)` 把本轮消息**从 inbox 取出**；第 909 行开始 waterfall，默认 `next()` 在第 918 行返回 `{kind:'enter', messages:[...claimed, context]}` |
| `node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js:1066-1073` `async step(decision)` | 真正写 session 的是这里：对 `decision.messages` 逐条 `session.append("user/message", message, {surfaceOp:"append"})`（`runtime-context` 除外）。**`enter.messages` 是这一批消息唯一的提交点** |
| `node_modules/@deepseek-ai/dsh-agent/lib/types/runtime-types.d.ts:294-297` | 类型定义原文：`Reject a proposed step or replace the messages that enter it. Calling next() preserves the current messages.` / `payload.messages - messages removed from the inbox for this step.` |
| `dsh-agent-loop/lib/index.js:921` | waterfall 之后立刻 `signal.throwIfAborted()`：**已经 abort 的回合会丢弃 enter 决策**，所以取消时返回 `notice` 没有意义，只能 `reject` 让宿主把回合标成 interrupted |

结论：`preStep` 已经 `claim` 走的消息，只有 `enter.messages` 能把它写进 transcript；
只把报告放进 `enter.messages` 等于**删掉用户原话**。而 `enter.messages` 与
`session.append('user/message', …)` **不能同时用**——同一个对象会被写两次（一次在 `step()`，
一次在插件），所以：

- `in-turn`：把被 claim 的消息放回 `enter.messages`，报告追加在它后面（唯一写入者是 loop）；
- `relay` / `append`：整步 `reject`，没有任何东西会提交这一批，插件才自己 `session.append` 那一条。

#### R12-2 测试与回归

| 检查 | 结果 |
|---|---|
| 既有测试的语义调整 | `test/gate.spec.ts` 3 处：分类失败由 `reject` 改为带原因的 `enter`（P0-3）；`append` 策略现在会多一条「用户原话」写入（P0-1）；in-turn 断言从 `messages[0]` 改为「首条是原话、末条是答复」 |
| 新增 | `test/phase1-dialogue.spec.ts`（27 例，P0-1…P0-4，含重放/重开、TTL、串线、重复消费、脱敏、取消终态）与 `test/triage.spec.ts` 的 P0-2 纯函数组（3 例） |

#### R12-3 真实 DSH GUI + 真实模型（已测，证据在 `docs/knowledge/evidence/p1-gui/`）

隔离实例（不是 live `:3090`：它需要自己 `dsh web` 打印的令牌，仓库 D-013 也禁止重启/改配它）
用本分支 `npm run build` 产物加载插件，profile 从 shipped `web` 模板起，会话工作区是
`<worktree>/.dsh-home/workspace` 这个一次性目录（快捷工人自己在回答里报了该路径）。模型走
`bifrost-completions / wb/cn:deepseek-v4.1-flash`（密钥只在环境变量里）。四类路径都拍了真实浏览器截图：

| 路径 | 证据 | 结论 |
|---|---|---|
| P0-1 原话保留 + 重开会话 | `01-p01-before-reload.png`、`02-p01-after-reload.png`、`p01.log` | 原话在报告之前、只出现一次；刷新并重开会话后仍在、顺序不变（`AFTER_RELOAD_OCCURRENCES=1`） |
| P0-2 确认档往返 | `03-p02-question.png`、`04-p02-simple-answer.png`、`05-p02-team-running.png`、`p02sim.log`、`p02team.log` | 问句可见；答「简单」后快手档回答明说「『简单模式』只是对上一个确认档问题的回答，不是新的任务目标」，说明原任务与选择词同时到位；答「团队」后团队档真的开工 |
| P0-3 内部错误可见终态 | `08-p03-error-terminal.png`、`p03.log`、`p03-probe.patch.yml` | 只有 workflow 角色指向坏端点（助手自己的模型仍可用）时，界面上出现带原因的失败报告，`HAS_SUCCESS_WORDING=false` |
| P0-4 取消终态 | `06-p04-cancelled.png`、`07-p04-cancelled-after-reload.png`、`p02team.log` | 点一次停止后写出「运行已取消（cancelled）…」，刷新后仍在 |

#### R12-4 真机复核查出的缺口：取消时原话与终态一起消失（已修）

在同一实例上按停止后，会话事件里只有 `agent/inbox/spliced`（claim 走原话）→
`tool-workflow/run-end cancelled` → `turn/end aborted`，**没有任何 `user/message`，也没有任何报告**：
`answerInTurn` 在 abort 后只 `record(...)` 然后 `reject`，而那一批消息早已被 `inbox.claim` 取走，
于是用户看到的是一段空白 + 一个没有原因的「已停止」。修复：`src/gate.ts` 新增
`cancelledText()` 与 `commitCancelled()`，两条 abort 分支在 `reject` 之前先按原对象提交被 claim 的消息
（整步已 reject，插件是唯一写入者，不重复），再写一条说明终态的助手消息。
`test/phase1-dialogue.spec.ts` 的「P0-4: a cancelled turn keeps the message and states the terminal」
两例锁定该行为（GUI 截图见 R12-3 的 P0-4 行）。

#### R12-5 未包含（NOT_RUN）

- `npm run test:e2e`（`scripts/e2e-headless-in-turn.sh`）：未执行——它会写真实 `$DSH_HOME` 会话，
  本轮的真机证据改由上面的隔离 GUI 实例提供，两者不互相替代。
- `relay` / `append` 策略的真机行为：只有单测覆盖，未在 GUI 上验证，PR 未声称其已支持。

## Round 13 (t59) — PR #26 review close-out: three fallback findings, reproduced then fixed

`CONFIRMED` — every number below comes from a command run in a clean worktree on
`fix/fallback-shards` (branch `pr26-closer`, base `2e9c26a` = `origin/main` after PR #23; the branch
was rebased onto it from `334daf6`, work commit `68f3d15`, pre-rebase `5cbccf2`).

The three findings are the codex review on PR #26 at commit `6e902e0` (all P2,
`has_unresolved_findings: true`). Each was reproduced before it was fixed:

| Finding | Reproduced as | Fix | Test that pins it |
|---|---|---|---|
| Surrogate back-off adds a segment, but the cap came from a formula | 32,000-char objective with a surrogate pair at every 4,000 boundary splits into 9 segments vs `ceil(chars / 4000)` = 8; with `maxTasks: 6` the report is rejected as "has 9 tasks but maxTasks is 6" | segment count now comes from `src/shards.ts` (`shardCountFor`), shared by the generated script and host validation | `test/fallback-shards.spec.ts` "accepts the extra segment that surrogate back-off adds at every boundary" |
| JSON escaping tripped the 48,000-character aggregate budget | 32,000 quote characters serialize to 67,353 characters → `report-invalid` in `run.ts`, discarding the fallback | for `source: 'fallback'` the validator checks the segments themselves (exact equality with the splitter's output) instead of applying the authored-text budget | "...dense in JSON escapes" |
| Arbitrary slices became independent tasks | 4,001 characters produced `[4000, 1]` (a one-character task), every shard shared one generic criterion, cuts could land mid-sentence | balanced segments, cuts moved onto a nearby paragraph/sentence/word break, segment-scoped criterion and context | "balances a 4,001-character objective...", "moves a segment boundary onto the sentence end...", "scopes each segment criterion..." |

| Command | Result |
|---|---|
| `npm run ci` (typecheck + oxlint + build + vitest) | exit 0, **27 files / 487 tests passed**; oxlint 1 warning / 0 errors (pre-existing, `src/redact.ts:155`) |
| `npx vitest run test/fallback-shards.spec.ts test/objective-limit.spec.ts` | 2 files / 32 tests passed |
| `npm run build && git diff --exit-code -- lib/` | exit 0 — committed `lib/` matches the build |

Rebase onto `2e9c26a` (PR #23, P0 dialogue reliability) conflicted in two files, both resolved by
hand: `test/objective-limit.spec.ts` (main rewrote the scripted-child double to read
`parseMemberLabel` labels, while this branch rewords the verifier to answer the task it was handed —
kept main's label dispatch and the branch's `taskFromPrompt` answer) and this file (main's Phase 1
record already owned "Round 12", so this record became Round 13 and both are kept).
`src/gate.ts`, `src/run.ts` and `src/triage.ts` and their `lib/` outputs are unchanged from
`2e9c26a` (`git diff --stat 2e9c26a HEAD -- src/gate.ts src/run.ts src/triage.ts lib/gate.js
lib/run.js lib/triage.js` is empty), so the P0 semantics merged in PR #23 are not overwritten.

`NOT_RUN` — `npm run test:e2e` and a real DSH GUI run: both need a live profile and
model routing. Every case above executes the real generated script in `node:vm`
with scripted children; no model API is called.

## Round 14 (t59) — 隔离实例上的真模型 E2E（wb/cn:deepseek-v4.1-flash）：两个真 bug + 修复

**环境**：全新隔离 home `.dsh-home/e2e1`（真实 `~/.dsh` 与 `~/dsh-layerfs` 零改动），dsh `0.2.1-rc.2`，
node `26.8.1`，模型 `bifrost-completions / wb/cn:deepseek-v4.1-flash`（凭据仅经 `BIFROST_VIRTUAL_KEY`
环境变量）。`grok-e2e` = headless profile（`workflow-ptc` 自带开启）；`grok-web` = web profile
（插件行 + `workflow-ptc.disabled: false`）。证据：`.dsh-home/e2e1/evidence/t{1..7}`、`work.log`。

### 1. 测试矩阵

| # | 配置 / 输入 | 期望 | 结果 |
|---|---|---|---|
| T1 | `mode: triage` + `grokDefault: on`，一句问句 | 门控认领、前台分档 | **PASS**：`Tier: quick`，一个 worker，脚注"not the full team" |
| T2 | `mode: full` + `on`，写 `hello.txt` 并回读 | 完整流程 + 真证据 | **PASS**：`COMPLETED`，1 task verified；`ls/stat/python/od/sha256` 独立证据；文件 15 B 无尾换行 |
| T3 | `grokDefault: off`（默认），"reply PONG" | 不拦、直接答 | **PASS**：仅 `PONG`，无工作流 |
| T4 | `mode: full`，两个独立文件任务 | 并行 + 2/2 验证 | **PASS**：`COMPLETED`，2 tasks 2 verified，内容精确；verifier 如实记录兄弟任务不确定性 |
| T5 | 写 `/proc/grok-should-fail.txt` | 不谎报 | **FAIL（BUG-59-1）**：`COMPLETED`，1 verified —— 目标被 planner 软化成"尝试并如实报告（预期被拒）"，验证员对着软化标准全过 |
| T5b | 同上，修复后 | `FAILED` | **PASS**：`FAILED`，0 verified，`executor reported failed`；planner 恢复真实目标 |
| T6 | 一个成功 + 一个必然失败 | `PARTIAL` | **PASS**：`PARTIAL`，2 tasks，1 verified |
| T7 | 回归：`mode: full` 写 `regress.txt` | 仍 `COMPLETED` | 见下（本轮实测） |

### 2. BUG-59-1（质量，核心承诺）：失败的活被报成 COMPLETED

- **现象**：T5 的目标在 `/proc` 下必然失败，worker 自报 `BLOCKED`，但最终 `Grok workflow: COMPLETED`。
- **根因（两处叠加）**：
  1. `checkVerification` 只在 `execution.status === 'failed'` 时否决，**`partial` 不被拦**；
  2. planner 被允许把目标改写成"尝试 X 并如实报告"，验收标准因此绕开真实目标（T5 任务标题即
     `Attempt /proc/... write, then report ... (expected denial)`）。
- **修复**：`checkVerification` 改为 **只有 `execution.status === 'completed'` 才可能通过**
  （自报 partial/failed 是承认未完成）；planner 提示词加"验收标准必须是目标要求的**终态**，不得改写成
  '尝试并报告'/'预期失败'"；verifier 提示词加"executor 说被阻塞/拒绝/未达成时 verdict 必须 fail"。
- **回归**：`test/orchestrator.spec.ts` 新增"worker 自报 partial + verifier 通过 → 任务必须 failed、
  总状态 failed、尝试数 = 1 + maxRetries"。
- **复测**：T5b `FAILED`。

### 3. BUG-59-2（用户可见契约）：`/grok` 承诺完整流程，实际被前台分诊截走

- **现象**：`/grok` 成功文案说"每条消息都走完整工作流"，但部署默认 `mode: triage`，简单消息走直答/快手档
  （T1 已实测）。
- **修复**：`ModeRecord` 增加可选 `workflowMode: 'full' | 'triage'`；`/grok` 写入 `workflowMode: 'full'`；
  闸门在 `produceAnswer` 用会话记录的形状覆盖部署 `mode`（配置级 `grokDefault: on` 仍尊重 `mode`，
  供部署方选择）。
- **回归**：`test/triage.spec.ts` 新增"会话 `/grok` 记录 → 无档位行、引擎启动 1 次"；
  `test/mode.spec.ts` 增加 `workflowMode` 校验；`test/command.spec.ts` 断言写入形状。

### 4. 本轮测试数字

- `npm run ci`：**24 文件 / 400 例 PASS**（t59 前 396；+1 orchestrator、+2 mode、+1 triage；
  command/mode 既有断言随文案与形状更新）。
- 真模型 E2E：T1–T7（7 次真实运行），仅 T5 为失败样本（即 BUG-59-1），其余 PASS。

### 5. NOT_RUN（诚实边界）

- **真 Web GUI 里的 `/grok`**：web 实例已起在 `127.0.0.1:3199` 并完成 token 交换，但 API 是
  WebSocket（`/api/remote.mux`）的 Typert Remote 协议，本轮未手搓 RPC；命令行为由
  `test/command.spec.ts`（真 cordis + 真 commands 服务 + 真 Session，11 例）覆盖，**GUI 交互未验**。
- **设置页卡片在浏览器中的渲染**：未开浏览器，未验。

## Round 15 (t57) — 真 Web GUI：`/grok` 可切 + 设置页卡片渲染（隔离实例，PASS）

`CONFIRMED` — 在 `origin/main` `6806426` 上新建的一次性隔离实例里，用真 Chromium 驱动真 Web GUI，
把 Round 14 §5 留下的两项 `NOT_RUN` 跑完了：`/grok` 在 GUI 里可切（默认普通聊天 → `/grok` 全流程 →
`/grok off` 回普通聊天），设置页 `Grok workflow` 卡片可渲染、可保存、可持久化、并对**新会话**生效。
本轮**未改任何源码**（`src/` `lib/` `test/` 的 diff 为空）。

证据（只读，全部在本机 `.workflow-artifacts/gui-verify/` 下，未入库）：

- `README.md` — 隔离证明、模型偏离、逐步结论（本轮的原始记录）。
- `shots/` — 20 张 PNG（`A1`/`A2`、`B1`–`B4`、`C1`–`C4`、`D1`–`D5`、`E1`、`recon-*`/`probe-*`）。
- `logs/` — `dumpconfig-step1.txt`、`dumpconfig-step2.txt`、`plugin-add.txt`、`stepB2.log`、`stepC.log`、
  `stepD.log`、`stepD-recon.log`、`stepE.log`、`patch-before-settings.md5`。
- `scripts/` — 产出上述证据的 Playwright 脚本（`lib.cjs`、`stepA.cjs`、`stepB2.cjs`、`stepC.cjs`、
  `stepD.cjs`、`stepE-default-on.cjs`）。
- `dsh-home/` — 一次性实例的 home（sessions、patch 层、node_modules）。

### 0. 隔离边界（D-013：不碰在跑的服务）

| 项 | 值 |
| --- | --- |
| `DSH_HOME` | `.workflow-artifacts/gui-verify/dsh-home`（本轮新建） |
| Profile | `gw-gui`，由 `--from-default-profile web` 生成（stock 模板，未复用任何既有测试 home） |
| 会话工作区 | `.workflow-artifacts/gui-verify/work`（UI 侧栏名 `gw-gui-verify-work`，每张截图可见） |
| 实例端口 | `127.0.0.1:3199`（起前确认空闲；只杀自己的 PID） |
| 在跑的 `:3090` | 全程在听，其 `profiles/web/cordis.patch.yml` mtime 保持 `19:00` 未变 |

激活（D-014）：`cordis.patch.yml` 把 `workflow-ptc` 打开为 `disabled: false`，合成树确认该行生效
（`logs/dumpconfig-step2.txt:337`），插件行为 `dsh-grok-workflow`（`:1257`）；启动行干净，无
`pending (waiting for service: workflowEngine)`。

### 1. 验证 1 —— `/grok` 在真 GUI 里可切（三步）

同一实例、真 Chromium（Playwright `chromium-1248`）、真 Web GUI。

| 步 | 配置 / 输入 | 结果 | 截图 / 日志 |
| --- | --- | --- | --- |
| (a) 默认态 | `grokDefault: off`，新会话 `session-baa80b7b…`，普通消息「用一句话说明什么是 HTTP 状态码 404。」 | **PASS**：`Completed in 12s`，一条直答，`1 turns 1 steps`；**无** `GROK-WORKFLOW-REPORT`、无档位行、无 subagent 徽标 | `shots/A1-default-empty-session.png`、`A2-default-plain-answer.png` |
| (b) `/grok` | 新会话 `session-59bd9427…`，先 `/grok`，再「把 12、7、25 三个数字按升序排序…」 | **PASS**：GUI 渲染命令行 `grok — Grok workflow ON — every message now runs the full plan→execute→verify workflow.`；会话头出现 `3 subagents` 徽标；回答里是完整报告（`Grok workflow: COMPLETED`、`Plan: planner; 1 task(s); 1 verified`、`sort-average-123: verified (1 attempt)`、`Model routes: planner=inherit; worker=inherit; verifier=inherit; synthesizer=inherit`、`Deadline: 3600000 ms per run`）；`Completed in 1m 41s` | `shots/B1-command-menu.png`、`B2-command-submitted.png`、`B3-workflow-answer.png`、`B4-workflow-answer-top.png`、`logs/stepB2.log` |
| (c) `/grok off` | **同一**会话，`/grok off`，再「用一句话解释什么是 JSON。」 | **PASS**：命令行 `grok — Grok workflow OFF — normal chat.`；下一条 `Completed in 11s`，直答，**无**报告、无 subagent | `shots/C1-reopened-session.png`（证明同一会话仍留着第 (b) 步的报告）、`C2`、`C3-command-off-done.png`、`C4-back-to-plain-chat.png`、`logs/stepC.log` |

会话日志独立复核（本轮重跑，不只看 `README.md` 的自述）——`session.v4.jsonl.zstd` 解压后：

```text
session-59bd9427…: "command/run" name=grok args=" "        → command/done "…workflow ON…"
                   plugin:grok-workflow/mode {"enabled":true,"setBy":"command:/grok","workflowMode":"full"}
                   "command/run" name=grok args=" off"     → command/done "…workflow OFF…"
                   plugin:grok-workflow/mode {"enabled":false,"setBy":"command:/grok off"}
                   GROK-WORKFLOW-REPORT 出现 2 次；assistant/message 2 条；name=grok_workflow 1 次
session-baa80b7b…: GROK-WORKFLOW-REPORT 0 次；plugin:grok-workflow/mode 0 次（纯普通聊天）
```

这条与 Round 14 的 BUG-59-2 修复对应：`/grok` 写入 `workflowMode: 'full'`，所以在部署默认
`mode: triage` 下也走完整流程，而不是被前台分诊截走。

### 2. 验证 2 —— 设置页卡片渲染、保存、持久化、生效

Plugins 页 → `Grok workflow` 卡片存在（副标题 "A mandatory workflow for every message: entry gate,
per-role model chains, concurrency and run records"），安装的 bundle 名为 `dsh-grok-workflow`
（`shots/D1-plugins-page.png`）。打开卡片渲染出插件自己的页面，`Grok mode default` / `grokDefault`
是一个活的 `off | on` 选择器（`shots/D2-grok-card-open.png`）。

| 步 | revision | `grokDefault` | 保存按钮 | 截图 |
| --- | --- | --- | --- | --- |
| 打开 | `0` | `off` | `Save` | `D2-grok-card-open.png` |
| 改为 `on` | `0` | `on` | `Save (1)` | `D3-grok-default-on-edited.png` |
| 点保存 | **`1`** | `on` | `Save` | `D4-grok-default-saved.png` |
| 整页刷新 | **`1`** | `on` | `Save` | `D5-grok-default-after-reload.png` |

落盘证据：保存向 profile 的 `cordis.patch.yml` 写入新行，文件 md5
**`d7830129b011b732dfa9bec4059f9ff4` → `1f628a0c984daa951aca818879f43a4e`**
（`logs/patch-before-settings.md5` 存的是改前值；改后值本轮用 `md5sum` 重新核对，与 `README.md` 一致）：

```yaml
- id: grok-workflow
  name: dsh-grok-workflow
  config:
    grokDefault: on
```

保存的值是**功能性**的，不是装饰：保存后**新开**一个会话，不发 `/grok`，只说
「把 3 和 4 相加，只回答结果。」——工作流自己跑了起来，回的是快手档报告（`1 subagent`、
`Completed in 30s`、`档位：快手档 … （这条只派了一个工人，没有开完整团队。）`），
即 `grokDefault: on` 对新会话生效（`shots/E1-default-on-plain-message.png`、`logs/stepE.log`）。

### 3. NOT_RUN → CONFIRMED 的两项

| Round 14 §5 的 NOT_RUN | 本轮结论 |
| --- | --- |
| 真 Web GUI 里的 `/grok`（当时只到 WebSocket/Typert Remote 协议边界） | **CONFIRMED**：§1 (a)(b)(c) 三步在真 GUI 上通过，命令事件、模式事件、报告文本三处独立可查 |
| 设置页卡片在浏览器中的渲染 | **CONFIRMED**：§2 卡片渲染、编辑、保存（revision 0→1）、刷新后保持、新会话生效 |

> 对账澄清（2026-11-18，nr_reconcile）：WORKFLOW-DESIGN.md 的 NR-4（"…; no write was performed"）与 OQ-018（"settings write-to-disk … NOT_RUN — nested path writes are source-confirmed only"）是 t32 之前的过时措辞，已被本节 §2/§3 与 Round 3（t32）的实测取代——真 GUI 保存经 POST /api/settings/mutate 落盘 cordis.patch.yml（含 t32 嵌套 roles.planner 路由写入），revision 0→1、刷新/重启后仍在、对新会话生效，以实测为准。Reconciliation note (2026-11-18, nr_reconcile): WORKFLOW-DESIGN.md NR-4 ("…; no write was performed") and OQ-018 ("settings write-to-disk … NOT_RUN — nested path writes are source-confirmed only") carry stale pre-t32 wording, superseded by the measurements in §2/§3 here and Round 3 (t32) — a real-GUI save persisted to cordis.patch.yml via POST /api/settings/mutate (including t32's nested roles.planner route write), revision 0→1, survives reload/restart, applies to a new session; the measured record prevails.

### 4. 五处环境偏离（必须如实标注，勿当成"标准环境"证据）

1. **`DSH_HOME` 不在 `/tmp`**，在 `.workflow-artifacts/gui-verify/dsh-home`。原因：本沙箱 `/tmp` 是
   每次 shell 调用重建的 tmpfs（两次探针复现：上一次写的 `/tmp/gw-probe2/stamp.txt` 下一次即
   `No such file or directory`），`/var/tmp` 只读，常驻服务无法把 home 放那儿。该位置与任何既有测试
   home、与在跑的 home 都隔离。
2. **Profile 用 `web` 模板而非 `headless`**：Web GUI 需要 `@deepseek-ai/dsh-web-app`。仍是 stock 模板、
   本轮新建、非复用测试 home。
3. **浏览器是离屏（headless）Chromium**：本机无 X11 显示（无 `/tmp/.X11-unix`、无 `DISPLAY`），
   headed 不可能。页面、DOM、CSS、截图、网络都是真应用；只有窗口是离屏的。
4. **模型换成 `wb/cn:glm-5.3-flash`**：建议的 `bifrost-completions / wb/cn:deepseek-v4.1-flash`
   在 2026-11-01 直探得 `HTTP 400 model_unavailable`（"model is unavailable on every account
   (per-model cooldown)"），首个 GUI 轮次也复现为 `INVALID_REQUEST`。同一 provider 下换活模型：
   `wb/cn:glm-5.3-flash` 200 OK（本轮全部轮次用它）；`tokenrhythm/qwen3.8-flash` 502
   `upstream_credentials_exhausted`、`wb/cn:kimi-k2.6` 403 `model_blocked`、
   `freelane/deepseek-v4.1-flash-free` 429 免费额度用尽。凭据只经 `BIFROST_VIRTUAL_KEY` 环境变量
   （`apiKeyEnv`），未落盘，任何工件里都没有 key 值。
5. **Playwright 直驱模块，不用 `playwright-cli` daemon**：沙箱拒绝
   `mkdir ~/.cache/ms-playwright/daemon`。

### 5. 本轮不建立的东西（诚实边界）

- **`relay` / `append` 在长驻 GUI 里的投递仍 `NOT_RUN`**（NR-1 的剩下半边）：本轮走的是默认
  `in-turn` 投递，只证明"长驻 Web GUI 会话里 in-turn 投递能到达用户"，不证明另两条策略。
- **质量断言仍受模型边界限制**：全部轮次是 `glm-5.3-flash`，不是 `deepseek-v4.1-flash`；
  本轮没有跑质量矩阵（那需要多次运行与独立评分），所以不能据此扩大 `COMPLETED` 率的结论。
- **只有一个浏览器内核**（Chromium），没有 Safari/Firefox 证据；也没有移动端证据。
- **证据不入库**：`.workflow-artifacts/` 未提交，`shots/`、`logs/`、`dsh-home/` 只存在于本机；
  本文件只给出路径与关键文本，便于复跑时对照。

## Round 16 (t60) — v0.2.4 真机安装矩阵（隔离 headless + web，8 PASS + 2 NOT_RUN）

`CONFIRMED` — 在 `origin/main` `7357e5e`（`v0.2.4` 发布提交，tag `v0.2.4` 已打，Release 已建）上，
用全新隔离 `DSH_HOME` 跑完 10 项真机安装矩阵：item 1–7 `PASS`（item 7 带一次如实记录的直答异常），
item 8 部分通过（composition + boot 确认，API 命名空间未确认），item 9–10 `NOT_RUN`
（本环境无浏览器自动化；设置页与 web 聊天已在 Round 15 的真 GUI 上覆盖）。
本轮只读证据 + 三个记忆文件，**未改任何源码**（`src`/`lib`/`test` 无 diff）。

证据（只读，全部在本机 `.workflow-artifacts/matrix-024/` 下，未入库）：

- `EVIDENCE.md` — 逐项结论与日志指针（本轮原始记录）。
- `logs/` — `item1-boot*.txt`、`item1-dump-*.txt`、`item1-patch.yml`、`item2-*`、
  `item3-*.jsonl`、`item4-*`、`item5-*.jsonl`、`item7-run*.jsonl`、`item8-*`
  （含 `item8-create.txt`、`item8-dump-full.txt`、`item8-web-boot*.log`、`item8-describe.json`）。
- `home/`、`work/` — 一次性实例的 home 与会话工作区。

运行环境：`DSH_HOME=.workflow-artifacts/matrix-024/home`（本轮新建，未复用任何既有测试 home）；
在跑的 `:3090` 全程未动（未重启、未 kill）；模型 `bifrost-completions / wb/cn:glm-5.3-flash`，
凭据只经 `BIFROST_VIRTUAL_KEY` 环境变量（`apiKeyEnv`），未落盘，任何工件里都没有 key 值。

### 1. 逐项结果（1–10）

| # | 项 | 结论 | 关键证据 |
| --- | --- | --- | --- |
| 1 | install + boot | **PASS** | `item1-dump-full.txt:411` 有 `- id: grok-workflow / name: dsh-grok-workflow`；boot2 EXIT 0 `BOOT_OK`，stderr 空，无 pending/did-not-activate |
| 2 | default off plain | **PASS** | EXIT 0 `PLAIN_OK`，0 report 匹配 |
| 3 | full workflow | **PASS** | `item3-retry.jsonl`：`Grok workflow: COMPLETED`，`Plan: planner; 1 task(s); 1 verified`，EXIT 0。首轮 `item3-workflow.jsonl` 是被外层 `timeout 600` 杀掉（只有 turn_start + cancelled 提示，P0-4 路径），不是 verdict |
| 4 | off back to plain | **PASS** | EXIT 0 直接 JSON 短句，0 report 匹配 |
| 5 | bad model fail-closed | **PASS**（两种变体） | (a) 未知 role model → load-time row rejection，stderr 点名 model + 已声明目录，EXIT 0 直接 echo（row 从未激活，故无 gate）；(b) `bad subagentProvider=bifrost-completions` → EXIT 0 带显式 `GROK-WORKFLOW-REPORT` 拒绝 `no subagent provider registered for "bifrost-completions"`，什么都没执行、无直答 —— 运行时 fail-closed 实证。注：观测到的是 EXIT 0，不是 0.2.0 时代的 EXIT 1；(b) 的判定标准（显式错误 + 无静默直答）仍然成立 |
| 6 | secret scan | **PASS** | key 值在全部 logs 里 0 命中；在全部 16 个 session zstd store 里 0 命中；token 模式 `(?<![a-zA-Z])sk-[A-Za-z0-9_-]{8,}` 在 logs + stores 里 0 命中；收紧的 `(?<!ta)sk-` 0 命中（裸 `sk-` 命中全是 `task-` 子串） |
| 7 | stability | **PASS**（异常在案，见 §2） | run1/run2 `COMPLETED` verified EXIT 0；run3 首轮异常；同 prompt 重跑 `COMPLETED` verified EXIT 0；run4 `COMPLETED` EXIT 0；run5 `COMPLETED`（中文报告）verified EXIT 0。异常之后连续 3 个 EXIT 0 + 报告：rerun + run4 + run5 |
| 8 | web profile | **部分通过**（composition + boot 确认；API 边界止于 401） | `mx024-web` 由 stock web 模板建，装的是 `#v0.2.4`（0.2.4）；patch 打开 `workflow-ptc`（`disabled: false`）+ model route + roles（`item8-dump-full.txt:340,1259`）；隔离实例 `127.0.0.1:3201` LISTENING，boot 日志无 pending/did-not-activate；HTTP `settings`/`describe` 经 query-token 与 Bearer 两次尝试均 `401 unauthorized`（`item8-describe.json` 正文只有 `unauthorized`），认证方式未解开、未继续深探（避免锁号）。服务存活确认到 socket + boot 层；namespace 经 API 未确认 |
| 9 | settings page render | **NOT_RUN** | 本环境无浏览器自动化，留给 operator；设置页渲染已在 Round 15 的真 GUI 上 `CONFIRMED`（基点 `6806426`；与 `7357e5e` 之间 `src`/`lib`/`test` 无 diff，只有发版与文档，见 `git diff --stat 6806426 7357e5e -- src lib test` 为空） |
| 10 | web chat behavior | **NOT_RUN** | 同上；web 聊天（`/grok` 可切、in-turn 投递）已在 Round 15 的真 GUI 上 `CONFIRMED` |

### 2. item 7 异常原文（`logs/item7-run3.jsonl` 563 bytes；重跑 `logs/item7-run3-rerun.jsonl` 3667 bytes）

run3 首轮 EXIT 0，但直接回答、无报告。文件中的两行原文：

```jsonl
{"type":"text","text":"apple, banana, cherry"}
{"type":"final","text":"apple, banana, cherry"}
```

（其余只有 `turn_start` / `step_start` / `step_end`（`outputTokens: 7`）/ `turn_end`
（`reason: completed`），全程无 `GROK-WORKFLOW-REPORT`。）同 prompt 重跑一次即 `COMPLETED`
verified（3667 bytes，含完整报告 `Plan: planner; 1 task(s); 1 verified` + 独立证据行）。
该异常样本保留在 `logs/` 里，未删除、未掩盖；稳定性结论按"异常之后连续 3 个 EXIT 0 + 报告"
给出，不按"从未异常"给出。

### 3. 本轮不建立的东西（诚实边界）

- **item 8 的 namespace 经 API 未确认**：`401` 边界如 §1 表格；认证方式未解开，不猜、不深探。
- **item 9–10 在矩阵里 `NOT_RUN`**：覆盖来自 Round 15（基点 `6806426`，`src`/`lib`/`test`
  与 `v0.2.4` 一致），不是本轮重测。
- **`relay` / `append` 在长驻 GUI 里的投递仍 `NOT_RUN`**（NR-1 的剩下半边）：Round 15 与本轮走的
  都是默认 `in-turn` 投递。
- **质量断言仍受模型边界限制**：本轮全部轮次是 `glm-5.3-flash`，不是 `deepseek-v4.1-flash`；
  本轮没有跑质量矩阵，不能据此扩大 `COMPLETED` 率的结论。
- **证据不入库**：`.workflow-artifacts/` 未提交，`home/`、`work/`、`logs/` 只存在于本机；
  本文件只给出路径与关键文本，便于复跑时对照。

## Round 17 (2026-11-02/03) — 首条用户消息被隐藏（P0-5）：CONFIRMED 根因 + 修复 + 真机前后对比

**报告**：2026-11-02（Asia/Singapore），会话 `session-d3d9375f-041a-4670-8256-13db46670b3c`
（工作区 `qqbot`，标题「机器猫人格」）里，用户发的第一条消息从未出现在可见会话中，界面只有
「正在分析请求 / 深度求索中」这类状态。

### 1. 根因 —— `CONFIRMED`（一个机制，不是猜测）

**机制**：默认 `answerStrategy: in-turn` 的 `answerInTurn()` 在
`src/gate.ts` 里先 `record(..., 'started', 'admitted')`，然后 **`await produceAnswer(...)`
——整个工作流跑完才返回 `PreStepDecision`**。DSH 的 `AgentLoop.step()` 是"被 claim 的批次"
唯一的写入者，它在 step 真正开始时才把 `decision.messages` 逐条 `session.append('user/message')`
（`dsh-agent-loop/lib/index.js` `step()`：`for (const message of decision.messages) … else
this.session.append("user/message", message, { surfaceOp: "append" })`）。因此从 pre-step
把批次从 inbox claim 走，到工作流结束之间，会话里 **一条 `user/message` 都没有**：消息既不在
inbox（已被 claim），也不在 transcript（还没写）。GUI 只渲染持久事件，于是只剩运行状态；
提交时浏览器那个乐观回显（`PendingSubmissionBubble`，仅在本次页面内有效）在刷新/换端后消失，
用户就再也看不到自己发过什么。

**证据 A — 真实会话的磁盘 transcript**（`CONFIRMED`）：

```sh
S=/home/fish/dsh-layerfs/sessions/--home-fish-projects_mine-qqbot--/session-d3d9375f-041a-4670-8256-13db46670b3c
zstd -dc $S/session.v4.jsonl.zstd | python3 -c "import sys,json;[print(json.loads(l)['seq'],json.loads(l)['type']) for l in sys.stdin if l.strip()]"
```

51 条事件，`user/message` **0 条**。关键序列：

| seq | 事件 | 内容要点 |
|-----|------|----------|
| 6 | `agent/inbox/spliced` | `target: next-turn`, `start: 0`, `inserted: [<用户消息 d8fe5255…>]` —— 用户消息进 inbox |
| 7 | `turn/start` | `turn: 1` |
| 8 | `agent/inbox/spliced` | `start: 0`, **`removedCount: 1`, `inserted: []`** —— 被 pre-step claim 走 |
| 9 | `plugin:grok-workflow/delivery` | `phase: "started"`, `outcome: "admitted"`, `turn: 1` —— 插件已认领，等待运行 |
| 10…48 | `tool-workflow/run-start` / `agent-start` / `agent-end` / `subagent/catalog` | 团队在跑（41 个子智能体） |
| 49 | `session/title` | `messageSeqs: []` —— 标题生成也没拿到任何消息 |

同一会话的 projcache（`/home/fish/dsh-layerfs/storages/session_projcache/sessions/session-d3d9375f-…json`）
写着 `turnOutline.val.turns[0] = {turn:1, seq:7, prompt:"", response:""}`、
`titleInput.val = {first:null, count:0}`、`turnBoundary.openTurnStartSeq: 7` —— 首轮 1 小时 41 分
仍未关闭，宿主从未把这条消息当成 message 收下。

**证据 B — 真机 GUI（`http://100.111.111.88:3090`，同一实例、同一会话）**：
`docs/knowledge/evidence/first-message-visible/BEFORE-live-3090-session.png`
（截图时间 2026-11-02 23:5x SGT）：标题「机器猫人格」、`41 个子智能体`，正文只有
「正在分析请求」+「深度求索中，用时 1小时41分4秒…」，**没有任何用户消息气泡**。

**证据 C — 代码位置**：`src/gate.ts` `answerInTurn()`
（`record(agent, entry, 'started', 'admitted')` → `await produceAnswer(...)` → `enterAfter(...)`），
以及 `stepBase()` 的注释（"`step()` commits exactly `decision.messages` as `user/message`
events"）。旧实现把用户消息只放在 `enter.messages` 里，而 `enter` 发生在运行结束之后。

**为什么报告只提到"第一条"**：缺陷对每条 `in-turn` 消息都成立，但第一条最显眼——那时 transcript
里没有任何别的内容，空 turn + 状态就是全部画面。

### 2. 修复（`src/gate.ts`，`lib/` 同步重建）

- 新增 `withoutClaimed(base, claimed)`：按 message id 从 `enter.messages` 里剔除已发布批次
  （session 没有按 id 去重，留着就会渲染两遍）。
- `answerInTurn()`：在 `await produceAnswer(...)` **之前**取历史快照
  （`collectHistory(...)`，否则刚发布的这条会被当成"Conversation so far"重复进 objective），
  然后 `const surfaced = commitClaimed(agent, payload.messages)` —— 立即写 `user/message`
  （同一对象、同 id、同 source，保留 `rpcId`，GUI 的乐观回显据此正常退场）。
  运行结束后 `enterAfter(base, text, surfaced)`：`enter.messages` 只带报告（+ runtime context），
  用户的话只存在一份。
- `commitCancelled(..., alreadySurfaced)`：已经发布过的批次不再写第二遍。
- 回归测试：`test/gate.spec.ts` › `in-turn delivery (default strategy)` ›
  **"renders the first user message while the run is still in flight (P0-5)"**。断言运行还在飞时
  会话里已有且仅有一条 `user/message`（内容为用户原文），运行结束后仍是 1 条、`enter.messages`
  只余 1 条报告。离线、确定性、无模型/网络依赖。
- 受影响的既有断言同步改为新契约（`test/gate.spec.ts` 两处 `messages[0]`、
  `test/phase1-dialogue.spec.ts` 的 P0-1 用例改名为 "publishes the claimed message, then the
  report, once each, in that order"）。

### 3. 测试与 CI（`CONFIRMED`）

| 命令 | 环境 | 结果 |
|------|------|------|
| `npx vitest run test/gate.spec.ts -t "renders the first user message"`（**修复前**，`git show HEAD:src/gate.ts` 覆盖 `src/gate.ts`） | 本机 Node 26.8.1 | **FAIL**：`expected [] to equal [ '第一条消息：先把我说的话显示出来' ]` |
| 同上（修复后） | 同上 | PASS |
| `npx vitest run` | 同上 | **29 files / 522 tests passed** |
| `npm run ci`（typecheck + oxlint + build + vitest） | 同上 | **exit 0，29 files / 522 tests passed** |
| `git diff --exit-code -- lib/`（提交后重建） | 同上 | **exit 0**（`lib/gate.js` / `.map` / `.d.ts.map` 与 `src` 同步） |

### 4. 真机前后对比（同一台机器、真实 Web GUI）

隔离实例（D-013：不碰在跑的 :3090 服务）：`DSH_HOME=/tmp/dsh-fm-home`、
profile `fm`（`--from-default-profile web`）、`dsh plugin --profile fm add /home/fish/projects_mine/dsh-grok-workflow`
（link 安装，直接跑仓库 `lib/`）、`dsh --profile fm --host 127.0.0.1 --port 3299 --no-open`、
所有模型路由指向本机 mock（`MOCK_API_KEY=dummy-not-a-credential`，mock 接受请求后不回复），
于是工作流一直处于"运行中"，正好能观察运行期间画面。

| 状态 | 操作 | 结果 | 截图 |
|------|------|------|------|
| BEFORE（`lib/gate.js` = HEAD 未修复版） | 在 3299 发送首条消息 → 刷新页面并重新打开该会话 | 同标签页内消息可见（浏览器乐观回显）；**刷新后消息消失**，只剩「任务团队 / 规划 / 规划助手 Running」+「Deep diving for 13s」 | `docs/knowledge/evidence/first-message-visible/BEFORE-isolated-reload.png` |
| AFTER（`lib/gate.js` = 修复版） | 同样发送首条消息 → 刷新页面并重新打开该会话 | **刷新后消息仍在**（`P0-5 AFTER: message must survive a reload` 00:35 气泡），状态只作为状态显示：「任务团队 · 1 member Running / 规划 · Running 1 / 规划助手 Running / Deep diving for 20s」 | `docs/knowledge/evidence/first-message-visible/AFTER-isolated-reload.png` |

脚本化复跑（playwright-core + 本机 chromium 1248；token 只从日志取用，不写入任何文件）：

```sh
node iso_reload.mjs "$URL" OUT.png "P0-5 AFTER: message must survive a reload" "P0-5 AFTER"
# 输出：--- same tab, before reload: transcript contains message? true
#       --- after reload, message in transcript? true
```

### 5. 本轮不建立的东西（诚实边界）

- **:3090 实例没有热加载本次修复**：插件在进程内已加载，重载会中断该会话正在跑的运行，
  违反 D-013；因此 AFTER 证据来自同一 `dsh web` 产品的隔离实例（同版本 `0.2.1-rc.2`），
  BEFORE 证据同时包含**真实 :3090 会话截图**与隔离实例复现。
- **mock 模型**：隔离实例的规划/执行/校验都指向不回复的本地 mock，所以 AFTER 截图里团队
  **不会**产出报告；本轮只验证"消息是否可见"，不验证答案质量。
- **`relay` / `append` 的长驻 GUI 投递**仍 `NOT_RUN`（NR-1 剩余半边），本轮只覆盖默认 `in-turn`。
- **`gh` Issue 状态评论**：本机 `gh` 已登录 `free6589`，但本轮未向 `[COORDINATION]` Issue
  发状态块（`NOT_RUN`，由队长决定是否补发）。

## Round 18 (2026-11-03) — synthesis/synthesizer mismatch：配错也能起（P0 现场 + P1–P3 落地，lead 复核）

现场（OPER）：`web/cordis.patch.yml` 的 `grok-workflow.config` 配了 `roles.synthesizer`
链但缺 `synthesis`，落默认 `deterministic`，触发 `src/config.ts:371` throw，整行
`1 entry did not activate`，设置页一并消失。P0 按用户拍板方案 A：
`+ synthesis: model`（+1 行，备份
`~/dsh-profile-backups/cordis.patch.yml.20261103-222020-pre-synthesis-model`），
只读验证（grep + diff + plugin list `0.2.7`），未重启 `:3090`（D-013）。

P1–P3（PR #35，`feat/synthesis-fallback` `7c4a05e`，closes #34，lead 在 `7c4a05e`
独立复核后 reset 本地 main 回 `1024b1c`，工作只活在 feature 分支 + PR）：

| Check | Command | Result | Evidence |
|---|---|---|---|
| typecheck | `npm run typecheck` | PASS | exit 0 |
| focused tests | `npx vitest run test/config-synthesis-fallback.spec.ts test/client.spec.ts test/config.spec.ts test/routing.spec.ts` | PASS | 4 files / 93 tests |
| full CI | `npm run ci` | PASS | 31 files / 540 tests |
| lib sync | `git diff --exit-code -- lib/` | PASS | exit 0（`src` 改已重建 `lib/` 并同步提交） |
| lint | `npm run lint` | 3 warnings / 0 errors | 3 个均为基线原有（`1024b1c` 同样 3 个），本次未引入 |
| secrets | `grep` over changed `src/`+`test/` | PASS | 仅 `task-failed`/`id:` 等良性命中，无凭据 |
| isolated verify (partial) | `DSH_HOME=/tmp/p1-verify-home` + profile `p1web` + `127.0.0.1:3297`，坏配置 a/b 各起一例 | PARTIAL | 进程存活（精确 PID kill，无 live `:3090` 触碰）；boot warn/签名日志未捕获（stdout 仅 URL 行）；`/api/settings/describe` + 页面抓取 = 401（与 Round 16 item 8 同类已知死胡同）；设置页渲染 + 改回合法 `NOT_RUN` |

确定性证据齐全（8 例 fallback spec + 跨字段 spec + 全量 CI）；隔离真机 GUI 一半缺失，
见上表诚实边界。`resolveConfig` 硬规则未动（`test/config.spec.ts`/`routing.spec.ts`
仍钉 throw），R-06 不变。

## Round 19 (2026-11-03) — PR #35 merge + `v0.3.0` release: local checks, tag, workflow, GitHub Release

Environment: operator machine, `main` of `/home/fish/projects_mine/dsh-grok-workflow`,
Node `v26.8.1`, npm `11.19.0`, `gh` authenticated as `free6589` (`repo`, `workflow` scopes).

### 1. Merge PR #35（feature 先合）

| Check | Command | Result | Evidence |
|---|---|---|---|
| PR state before merge | `gh pr view 35 --json mergeable,mergeStateStatus,headRefOid` | MERGEABLE / CLEAN / `7c4a05e` | closes #34 |
| PR CI | `gh pr checks 35` | PASS | Node 22 `pass` 42s, Node 24 `pass` 36s — run `41659656218` |
| Merge | `gh pr merge 35 --merge --subject "Merge pull request #35 from free6589/feat/synthesis-fallback"` | MERGED | merge commit `af0394a`, `mergedAt 2026-11-03T15:24:10Z` |
| main content | `grep -n repairSynthesisInconsistency src/config.ts` | PASS | `src/config.ts:345`, `lib/config.js:329` on `origin/main` |
| main CHANGELOG | `git show origin/main:CHANGELOG.md` | PASS | bilingual `[Unreleased]` Fixed/修复 entry present before the release bump |

### 2. Release preparation (`release/0.3.0`, commit `f8cb09e`)

| Check | Command | Result | Evidence |
|---|---|---|---|
| branch | `git switch -c release/0.3.0` | PASS | based on `af0394a` |
| bump | `npm version minor --no-git-tag-version` | PASS | `v0.3.0`; `package.json:3` and `package-lock.json:3` (+ root entry) all `0.3.0`; `grep -c '0\.2\.7' package*.json` = 0 |
| install | `npm ci` | PASS | 17 high-severity `npm audit` advisories = existing baseline |
| typecheck | `npm run typecheck` | PASS | exit 0 |
| lint | `npm run lint` | 3 warnings / 0 errors, exit 0 | same three pre-existing warnings as `1024b1c` (`no-useless-escape`, `GROUPS_WITH_FIELDS`, `field`) |
| build | `npm run build` | PASS | `client bundle: 79752 bytes → lib/client.js` |
| lib sync | `git diff --exit-code -- lib/` | PASS | exit 0; `git status --porcelain --untracked-files=all -- lib/` empty |
| tests | `npm test` | PASS | 31 files / 540 tests, exit 0, 20.51s |
| package | `npm pack --dry-run` | PASS | `dsh-grok-workflow-0.3.0.tgz`, 56 files, package 246.5 kB |
| secrets | `git diff --cached \| grep -Ei "(api[_-]?key\|secret\|password\|token\|PRIVATE KEY\|sk-…)"` | PASS | 0 hits; only `CHANGELOG.md`, `package.json`, `package-lock.json`, `docs/releases/RELEASE-NOTES-0.3.0.md` staged (`.workflow-artifacts/` left untracked) |

### 3. Release PR and merge

| Check | Command | Result | Evidence |
|---|---|---|---|
| open PR | `gh pr create --base main --head release/0.3.0` | PASS | PR #36 |
| PR CI | `gh pr checks 36` | PASS | Node 22 `pass` 41s, Node 24 `pass` 38s — run `41664791714` |
| merge | `gh pr merge 36 --merge` | MERGED | release commit `3f5ad0a`, `mergedAt 2026-11-03T15:33:50Z` |
| main after | `git pull --ff-only` on `main` | PASS | `3f5ad0a`; `node -p "require('./package.json').version"` = `0.3.0`; `## [Unreleased]` then `## [0.3.0] - 2026-11-03` |

### 4. Tag, workflow, GitHub Release

| Check | Command | Result | Evidence |
|---|---|---|---|
| old tags baseline | `git ls-remote --tags origin` (before) | recorded | `v0.1.0`…`v0.2.7` SHAs |
| tag | `git tag v0.3.0 3f5ad0a && git push origin v0.3.0` | PASS | `* [new tag] v0.3.0 -> v0.3.0` |
| old tags untouched | `diff` of pre-existing tags before/after | PASS | `NO_CHANGES_TO_EXISTING_TAGS`; only `refs/tags/v0.3.0` added |
| Release workflow | `gh run view 41665410667` | PASS | conclusion `success`, all steps 1–16 `success` (tag↔`package.json`, typecheck, lint, build, `lib/` consistency, no-untracked check, tests, package list, changelog extraction, packaging, release creation) |
| GitHub Release | `gh release view v0.3.0 --json name,tagName,isDraft,assets` | PASS | `Grok Workflow for DSH v0.3.0`, `tagName v0.3.0`, `isDraft false`, asset `dsh-grok-workflow-0.3.0.tgz` 246,493 B, sha256 `3a8bf81b…`, published `2026-11-03T15:35:54Z` |

### 5. Boundary (what this round does NOT claim)

- The shipped behaviour change was not re-verified on a real GUI this round. Round 18's isolated
  result stands as-is: bad-config instances stayed alive, boot warn line not captured,
  `/api/settings/describe` + settings page `401` (same dead-end as Round 16 item 8), settings-page
  render/save-back `NOT_RUN`.
- The live `:3090` service was not reloaded, restarted or reconfigured (D-013); it still runs
  `dsh-grok-workflow@0.2.7`, and the operator `web` profile was not upgraded to `0.3.0`.
- npm publishing: not done and not planned (GitHub Releases only, per `docs/RELEASING.md`).

## Round 20 (2026-11-06) — PR #37 feature + `v0.4.0` release + isolated-profile live verification

Environment: operator machine, `main` of `/home/fish/projects_mine/dsh-grok-workflow`,
Node `v26.8.1`, DSH `0.2.1-rc.2`, `gh` authenticated as `free6589` (`repo`, `workflow` scopes),
model route `bifrost-completions/wb/cn:deepseek-v4.1-flash` via `BIFROST_VIRTUAL_KEY`.

### 1. Feature PR #37 (history-aware follow-up + hybrid + receipt/summary)

| Check | Command | Result | Evidence |
|---|---|---|---|
| PR CI | `gh pr checks 37` | PASS | Node 22 `pass` 38s, Node 24 `pass` 34s — run `42074144133` |
| merge | `gh pr merge 37 --merge` | MERGED | merge commit `9438b3d` |
| local CI on feature head | `npm run ci` on `e89daf9` | PASS | 32 files / 545 tests (incl. new `test/triage-followup.spec.ts` 5 cases); typecheck clean; lint 3 warnings / 0 errors (pre-existing); build clean; `lib/` in sync |
| regression note | `npm test` after deterministic-summary revert | PASS | 32 files / 545 tests; model-rewrite `humanSummary` variant reverted because one extra engine call broke 3× P0-2 + 1× triage count assertions; shipped `humanSummary` is deterministic `verified/total` + synthesis lead-in, zero extra calls |

### 2. Release preparation (`release/0.4.0`, commit `472d043`) + PR #38 + tag + workflow

| Check | Command | Result | Evidence |
|---|---|---|---|
| bump | `npm version minor --no-git-tag-version` on `release/0.4.0` | PASS | `package.json` + `package-lock.json` both `0.4.0` |
| changelog | `CHANGELOG.md` + `docs/releases/RELEASE-NOTES-0.4.0.md` | PASS | bilingual `## [0.4.0] - 2026-11-06` + 39-line release notes |
| local checks | `npm run typecheck` / `lint` / `build` / `git diff --exit-code -- lib/` / `npm test` / `npm pack --dry-run` | PASS | typecheck exit 0; lint 3/0 pre-existing; `client bundle: 81835 bytes`; lib sync exit 0; 32/545 PASS; 56 files / 250.7 kB `dsh-grok-workflow-0.4.0.tgz` |
| open PR | `gh pr create --base main --head release/0.4.0` | PASS | PR #38 |
| PR CI | `gh pr checks 38` | PASS | Node 22 `pass` 32s, Node 24 `pass` 42s — run `42075028625` |
| merge | `gh pr merge 38 --merge` | MERGED | release commit `708c315` |
| tag | `git tag v0.4.0 708c315 && git push origin v0.4.0` | PASS | `* [new tag] v0.4.0 -> v0.4.0`; pre-existing tags untouched (`v0.1.0`–`v0.3.0`) |
| Release workflow | `gh run view 42075318386` | PASS | conclusion `success`; `gh release view v0.4.0` → `Grok Workflow for DSH v0.4.0`, asset `dsh-grok-workflow-0.4.0.tgz` 250,693 B, sha256 `e10802ca…`, published `2026-11-05T17:31:21Z` |

### 3. Isolated-profile live verification (`gw040`, `v0.4.0` tarball, `wb/cn:deepseek-v4.1-flash`)

| Check | Command | Result | Evidence |
|---|---|---|---|
| isolated home | `DSH_HOME=./tmp-home040 dsh --profile gw040 --from-default-profile headless` | PASS | `gw040` created; `workflow-ptc provider: spawn` present in dump |
| install | `dsh plugin --profile gw040 add ./tmp-pack040/dsh-grok-workflow-0.4.0.tgz` | PASS | `+ dsh-grok-workflow file:…tgz`; dump shows `- id: grok-workflow / name: dsh-grok-workflow` + patched `grokDefault: on`, 4 new keys |
| chat tier | `dsh --profile gw040 --patch gw040.patch.yml "你好"` | PASS EXIT 0 | `级别：直接回答` + greeting template + `（本次未调用子代理团队…）`, `GROK-WORKFLOW-REPORT` envelope |
| fast tier | `… "算一下 5×6等于多少，只回答数字"` | PASS EXIT 0 | `档位：快手档` + `30` + `（这条只派了一个工人…）` |
| team tier | `… "帮我重构 run.ts 的超时逻辑，并补上回归测试"` in empty `/tmp/dshgw-040-work` | PASS (gate/report path) EXIT 0 | `档位：团队档` + `Grok workflow: FAILED` with honest `Incomplete (quality)` + uncertainties naming the unresolvable `run.ts` path; no writes outside `/tmp` (TESTING.md isolation kept; scratch dirs removed after) |

### 4. Boundary (what this round does NOT claim)

- Multi-turn follow-up (`说人话` with history in one live session) is covered by deterministic
  unit tests (`test/triage-followup.spec.ts`), not by one-shot headless: each headless turn is a
  fresh session, so `historyNonEmpty` is false there by construction.
- The live `:3090` service was not reloaded, restarted or reconfigured (D-013); it still runs
  `dsh-grok-workflow@0.2.7`, and the operator `web` profile was not upgraded to `v0.4.0`.
- npm publishing: not done and not planned (GitHub Releases only, per `docs/RELEASING.md`).

## Round 21 (2026-11-06) — cross-round context carry-over (bounded digest, v0.5 unreleased)

Environment: operator machine, checkout `/home/fish/projects_mine/dsh-grok-workflow`,
Node `v26.8.1`, npm `11.19.0`, DSH CLI `0.2.1-rc.2`, model route
`bifrost-completions/wb/cn:deepseek-v4.1-flash` (key through `apiKeyEnv: BIFROST_VIRTUAL_KEY`,
no credential written to any file), plugin loaded as `file://…/lib/index.js` (this working tree).

### 1. Deterministic suite

| Check | Command | Result | Evidence |
|---|---|---|---|
| typecheck | `npx tsc -p tsconfig.json --noEmit` | PASS | exit 0, no diagnostics |
| lint | `npm run lint` | PASS with same 3 pre-existing warnings | `0 errors`; warnings are the untouched `src/client/index.js` `GROUPS_WITH_FIELDS` / unused `field` sites |
| full suite | `npm test` (build + `vitest run`) | PASS | **33 files / 568 tests**; new `test/carryover.spec.ts` 21 cases + 2 new cases in `test/gate.spec.ts`; committed `lib/` rebuilt by the same command |

The acceptance-criterion tests are `test/carryover.spec.ts` "the real prompt path" and
`test/gate.spec.ts` "cross-round carry-over":

- round 1 is executed through the **real generated script** (`runWorkflowScript(WORKFLOW_SCRIPT, …)`),
  its report is rendered by the **real** `renderReport`, parsed back by the digest compiler, and
  round 2's planner/worker/verifier prompts are asserted to contain the round-1 finding while the
  follow-up's own words do not contain it (`carry-over: the real prompt path`);
- the same chain is asserted one level up, on the **real gate**: a session whose transcript holds
  round 1's plugin-typed report yields `engine.startCalls[1].args.carryover` containing the finding,
  and `args.objective` not containing it (`test/gate.spec.ts` "hands the second round a digest…");
- the cap is pinned by four cases (`400`…`1_000_000` budget, no budget, round cap, surrogate pair):
  the rendered digest never exceeds `min(callerCap, CARRYOVER_LIMITS.chars=12000)`, and the
  oversized-input case proves the generated script clamps an unbounded `args.carryover` itself.

### 2. Real DSH two-round test (isolated home + isolated workspace)

Exact commands, environment and captured output: `docs/knowledge/evidence/carryover-e2e/README.md`
(raw files in the same directory: `round-reports.txt`, `child-prompt-digest.txt`,
`digest-per-child-session.txt`, `session-surface-events.txt`).

| Check | Result | Evidence |
|---|---|---|
| isolated home/profile | PASS | `DSH_HOME=.carryover-e2e/home`, profile `carryover` from the shipped `headless` template; session workspace `.carryover-e2e/work` (encoded dir name `sessions/--home-fish-projects_mine-dsh-grok-workflow-.carryover-e2e-work--`) |
| round 1 (gated) | PASS EXIT 0 | `Grok workflow: COMPLETED`, task `compute-product` verified, confirmed evidence quotes `17 × 23 = 391` |
| round 2 (gated, same session, follow-up that never restates the number) | PASS EXIT 0 | `Grok workflow: COMPLETED`, task `add-nine-to-prior` verified, delivered answer `391 + 9 = 400，最终数字是 400。`; a criterion that explicitly forbids asking the user to repeat passes with the note "no question mark, no request for input, no hedge about missing context" |
| digest reached the round-2 children | PASS | `grep -c 'PRIOR ROUNDS'` per child session log: round-1 children 09:38–09:39 → `0`, 09:46–09:47 → `0`, round-2 children 09:49–09:51 → `2` each |
| digest content in a real child prompt | PASS | `child-prompt-digest.txt` shows the planner prompt carrying `PRIOR ROUNDS … Round -1 [completed] …` plus round 1's verified rows (`The final answer text contains the exact numeral 391 …`) |

### 3. Findings (observed, not all fixed here)

- **F1 — resuming a session whose first message went through the gate fails**:
  `stored log is corrupt: SessionFormatError: system/message requires a protected first surface
  head`. Cause: `in-turn` publishes the claimed message in `agent/pre-step` (P0-5 semantics,
  Round 17) before the loop writes its first `system/message`. Not introduced by this change and
  out of this task's scope (it is neither the digest nor its injection). Round 0 of the real test
  works around it by running one gate-off message first; **the defect itself is `CONFIRMED` and
  still open**.
- **F2 — the carry-over info line is invisible in headless runs**: `logger.info` has no channel the
  headless runner prints, so `grep 'carry-over' r2.err r2.jsonl` → `0`. The digest is evidenced by
  child prompts, never by a log line.

### 4. Scope check

| Check | Result | Evidence |
|---|---|---|
| DSH core untouched | PASS | `git -C <dsh install> status` → `fatal: not a git repository` (it is an installed package, not a checkout), so the check is a modification scan: `find /home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@deepseek-ai/dsh -newermt '2026-11-06 00:00:00' -type f` → **0** hits out of 62 903 files |
| `src/records.ts`, `src/triage.ts` untouched | PASS | `git status --short` lists only `src/carryover.ts` (new), `src/script.ts`, `src/run.ts`, `src/gate.ts`, `src/index.ts` (plumbing only; the gate's question-classification logic is byte-identical) |
| no new storage/archive | PASS | the digest is compiled on read from the plugin's own report messages; no record type, no file, no archive was added |

### 5. Boundary (what this round does NOT claim)

- One model, one session, one task pair: this is a behavioural check that the second round answers
  from the first, not a quality matrix.
- The digest's value was measured with a short numeric follow-up; long research rounds are covered
  by the deterministic tests (bounded compile, redaction, truncation) and not by live samples.
- The live `:3090` profile was not reloaded (D-013) and still runs an older plugin build.
- No npm publish, no version bump, no tag: this change is under `[Unreleased]`.

## Round 22 (2026-11-06) — 随做随存的增量记忆归档（`src/memory/*`，`[Unreleased]`）

**目标（用户原话）：** 每当一轮/子代理产出研究结果或完成阶段性工作，立即以结构化条目追加写入持久记忆，
而不是只在会话收尾时手工更新 STATE/HANDOFF；结束状态是任何「单次进来」的会话查记忆都能找到最近的研究
结果，「查了记忆，最近也没有存档」彻底消失。

**范围：** 只加归档写入器与接线（`src/memory/archive.ts`、`src/memory/recorder.ts`、
`src/memory/cli.ts`，`src/run.ts` 两处薄接线）。不改跨轮提示词/digest 构建，不改
`src/triage.ts`，不改 `src/gate.ts` 的提问判定逻辑，不改 DSH 核心。

### 1. 确定性测试（`CONFIRMED`）

```bash
npx vitest run test/memory-archive.spec.ts     # 21 tests PASS (3.05s)
npm test                                        # 34 files / 589 tests PASS (22.84s)
npx tsc -p tsconfig.json --noEmit               # no output = clean
npm run lint                                    # 3 warnings / 0 errors (全部在既有 src/redact.ts、src/client/index.js)
npm run build                                   # tsc -p tsconfig.build.json && node scripts/build-client.mjs
```

`test/memory-archive.spec.ts` 覆盖的判据：

| 判据 | 用例 |
|---|---|
| 写入时刻 = 轮次结算时刻（不是会话退出/dispose 钩子） | 真引擎 harness：运行中途由 verifier 激活时读归档，只见 agent 条目且 `runSettled === false`；轮次结束后同一文件出现 round 条目 |
| 子代理结算即写 | `agent-end` → `run:<runId>:agent:<seq>`，含 label/phase/outcome/发现 |
| 无会话状态的独立进程能读回 | `spawnSync(process.execPath, ['--input-type=module','-e', …])` 导入 `lib/memory/archive.js` 读到最新结果；另跑随包 CLI `lib/memory/cli.js recent` |
| 幂等 + 只追加 | 同一条目二次写入返回 `written:false, reason:'duplicate'`；追加后旧字节（含损坏行）逐字节保留 |
| 子代理发现的可读性 | 结构化提交（`structured_output`/`submit` 的 JSON 参数）→ `verdict pass · N criterion/criteria`、`plan: N task(s)`；纯散文子代理 → 其最后一段文本 |
| 失败不拖垮运行 | 写入目标不可写（同名文件当目录）→ `reason:'write-failed'`；引擎监听器内异常 → 只 warn |
| 脱敏 | `github_pat_…`、`Bearer …` 落盘前被替换 |

### 2. 真机（隔离 home，真模型，`CONFIRMED`）

环境：`DSH_HOME=.workflow-artifacts/incr-archive-e2e/home`（`dsh --profile incr
--from-default-profile headless` 建出，不碰 `:3090` 的 `/home/fish/dsh-layerfs`，D-013），
模型 patch `wb/cn:deepseek-v4.1-flash`（`bifrost-completions` / `openai-completions`），
插件 patch `file:///home/fish/projects_mine/dsh-grok-workflow/lib/index.js`，config
`{answerStrategy: in-turn, showProgress: true, grokDefault: "on"}`。

```bash
cd .workflow-artifacts/incr-archive-e2e/work
DSH_HOME=…/home dsh --profile incr --patch ../model.patch.yml --patch ../plugin.patch.yml --json \
  "请分两步：第一步创建 facts.txt，内容为 41*37=1517；第二步创建 verify.mjs，读取 facts.txt 并用 node:assert 断言等于 37*41，运行 node verify.mjs 并贴出真实退出码与 stdout。"
echo $?   # 0
python3 -c "…"   # 归档里该轮 4 条：run:77babf9f…:agent:1/2/3 + run:77babf9f…
```

| 检查 | 结果 | 证据 |
|---|---|---|
| 团队档真跑并结算 | PASS | `Grok workflow: COMPLETED`，任务 `facts-verify-node` verified，8 条判据 confirmed |
| 子代理条目按时写 | PASS | `plan: 1 task(s)`（规划）、其申报结果（执行）、`verdict pass · 8 criterion/criteria checked`（校验） |
| 轮次条目带结果与证据 | PASS | `status completed · verified 1/1 task(s) · confirmed 8 criterion/criteria`，evidence 引用真实 `od -c` / `ls -l` / 退出码 |
| 归档位置即默认约定 | PASS | `$DSH_HOME/memory/grok-workflow/archive.jsonl`（26 行累计，仅追加，无改写） |
| 前台档也归档 | PASS | 后续快手档回答写出 `run:c72d7023…`（label `Front desk`） |

### 3. 独立会话读回（判据 4，`CONFIRMED`）

**新起一个与产出轮完全不同的 DSH 会话**，只让它跑随包 CLI：产出轮在
`session-c9a1b100-1a81-43d9-9dc9-5c5cc09664b4`（04:19:31 写入 round 条目），读回会话是
**另一个进程里新起的** `session-1f907d27-c003-4eb3-ad2d-01f1dcba3227`，两者不共享任何内存、
没有前序上下文：

```bash
dsh --profile incr … --json "请在本机原样执行这条命令，并把输出前 14 行贴出来：node <repo>/lib/memory/cli.js recent --limit 4"
```

它引用了上一轮（另一会话产出）的条目：`run:77babf9f-2b5a-467b-9caa-cab8c5801664`（round）、
`…:agent:2`、`…:agent:3`，连 `verdict pass · 8 criterion/criteria checked` 都在输出里
（原始事件：`docs/knowledge/evidence/incremental-archive/fresh-session-quotes-archive.jsonl`；
CLI 直读输出：`…/cli-recent.txt`；该轮 4 条条目：`…/archive-run-77babf9f.jsonl`）。
**「查了记忆，最近也没有存档」不复现：新会话零上下文，未问用户，直接读到上一轮结果。**

### 4. 现场发现（均为实测，不是推理）

- **F0 — `grokDefault` 默认 `off`，全新 profile 里闸门根本没开：** 首轮真机 prompt 被当普通 chat
  直答，`archive.jsonl` 根本没生成。归档只在闸门真的运行时有内容；patch 里写
  `grokDefault: "on"` 后才进入分诊。**这是排除「无存档」时最容易误判的一条。**
- **F1 — `ctx.sessions` 在插件 fiber 上直接抛：** `cannot get property "sessions" without inject`
  （cordis 4 要求 `inject` 才能取服务；本插件故意不 inject，否则纯单测上下文里 `apply` 不会启动）。
  修法：用文档给出的 `ctx.get('sessions')` 读取。**在此之前，所有子代理条目都只写「读不到文本」。**
- **F2 — 引擎在 `agent-end` 送到宿主前就 dispose 了子会话：** 于是「结算时再查子会话」永远查不到；
  必须在 `agent-start`（子会话还活着）捕获 Session 对象，结算时读它的 `ownEvents()`。
- **F3 — 结构化子代理不产出 assistant 文本：** 真机子会话最后一条 `assistant/message` 只有
  `reasoning` + `tool-call`，`tool-call.arguments` 是 **JSON 字符串**，真正的结论在参数里
  （`structured_output` 的 `verdict`/`criteria`，执行体的 `summary`，规划的 `tasks`）。
  只读文本会让每条子代理条目都写着「没有结果」——这正是需要被消灭的失败形态。

### 5. 范围与安全

| 检查 | 结果 | 证据 |
|---|---|---|
| DSH 核心未改 | PASS | 未在 `/home/fish/.local/share/mise/…/@deepseek-ai/dsh` 下写入任何文件；只用文档化扩展点（`ctx.workflowEngine`、`ctx.on`、`ctx.get`） |
| `src/triage.ts`、gate 提问逻辑未改 | PASS | `git status --short` 中 `src/triage.ts` 不在列；`src/gate.ts` 无本次改动（其改动属另一任务的遗留工作） |
| 只追加、幂等 | PASS | 单测断言旧字节逐字节保留 + 重复 id 返回 `duplicate`；真机 26 行累计无改写 |
| 无凭据 | PASS | 条目写入前过 `redactSecrets`/`redactError`；证据文件里无 key（只做 `BIFROST_VIRTUAL_KEY` 存在性检查，从未打印其值） |
| 无 npm 发布/无版本号变更 | PASS | `CHANGELOG.md` 只加 `[Unreleased]` 条目，`package.json` 未改 |

### 6. 边界（本轮**不**声称）

- 并发压力：两个进程同时追加同一文件未做压测（`O_APPEND` 单行写 + 读时按 id 去重是设计保证，
  但 `NOT_RUN` 真机并发）。
- 归档**不会**替代跨轮 digest：digest 仍从会话内报告编译（D-035），归档是给「单次进来」的新会话用的。
- 在线模型只用了 `wb/cn:deepseek-v4.1-flash` 一个；子代理发现的可读性依赖该引擎的
  tool-call 形状，换引擎需重测（`HYPOTHESIS`）。
- 未重载 `:3090` 上的 operator profile（D-013），线上仍是旧构建。

## Round 23 (2026-11-06) — 先回捞后提问：提问前先读会话上文与磁盘记忆（`[Unreleased]`）

目标失败样本：`session-7e079b80-1a57-451b-aca4-795d24a14c4d`——会话里已有研究结果，随后的追问却被
以「遗忘了上下文」为由要求用户重新说明。本轮只改**提问之前**这一步：`src/triage.ts`（`recallFromPrior`
判定 + `recalled` 档 + 两条用户可见说明 + 回捞提示词）与 `src/gate.ts`（读取来源：会话上文、前序轮次
digest、磁盘 `docs/knowledge/*.md`），其余路径不改。

**范围纪律（本轮不声称）：** 不构建跨轮 digest 注入（属 D-035 另一任务，这里只**读**既有 digest）、
不新增归档存储（属 D-036 另一任务）、不改 DSH 核心、不新增配置键。

### 1. 确定性测试（`CONFIRMED`，无在线模型）

```bash
cd /home/fish/projects_mine/dsh-grok-workflow
npm run ci          # typecheck + lint + build + vitest run
npx vitest run test/triage-recall.spec.ts
npx vitest run test/triage.spec.ts test/gate.spec.ts test/triage-followup.spec.ts
```

| 检查 | 命令 | 结果 | 证据文件 |
|---|---|---|---|
| 全量 CI | `npm run ci` | **PASS** — `Found 3 warnings and 0 errors.`（3 个均为既有 warning）、`Test Files 35 passed (35)`、`Tests 617 passed (617)` | `docs/knowledge/evidence/history-first/ci-summary.txt` |
| 本轮新测试 | `npx vitest run test/triage-recall.spec.ts` | **PASS** — `Tests 28 passed (28)` | `docs/knowledge/evidence/history-first/recall-spec.txt` |
| 既有 triage/gate 回归 | `npx vitest run test/triage.spec.ts test/gate.spec.ts test/triage-followup.spec.ts` | **PASS** — `Test Files 3 passed (3)`、`Tests 89 passed (89)` | `docs/knowledge/evidence/history-first/regression-suite.txt` |

基线（改动前，见 Round 22）：34 文件 / 589 测试。当前 35 文件 / 617 测试 = 基线 + 1 文件 + 28 测试。

### 2. 两条分支各自怎么被钉住（判据 1、2）

| 分支 | 用例 | 断言 |
|---|---|---|
| 已存在（会话历史） | `replay: ... after the fix (earlier round has the research)` | 真 `Session` 里已有第 1 轮用户消息 + 插件写的 `grok-workflow` 报告；追问走**快手档** `recalled`，只 1 次前台调用，`script` 含报告里的 `dsh-web 进程占用` 与 `web.port`，正文含「先查后答」，**不含**「档位：确认档」「这个要动用团队吗」；`RE_ASK_AGAIN`（`重新说明/重新描述/restate/repeat what` 等）不匹配 |
| 已存在（磁盘记忆） | `answers from a docs/knowledge file that holds the answer` | 临时 `docs/knowledge/STATE.md` 命中 → 快手档 `recalled`，调用提示词含文件内容，回答含「先查后答」 |
| 真缺失 | `still asks once, and says what is missing, ...` | 会话里已说过话、记忆文件存在但**不覆盖**该问题 → 仍为确认档（只提问一次），提问正文含「先查后问」「还缺」，且 `startCalls` 为 0（**没有任何回答被编造**）；正文不含「重述/重新说明/restate」 |
| 无历史无记忆（回归） | `changes nothing when the memory directory does not exist` / `keeps a brand-new session's question byte-identical even with memory files present` / `leaves a greeting untouched even with memory files present` | 投递正文与 `frontDeskText([triageLine, '', askLine])`、`frontDeskText([triageLine, '', chatReply, '', tierNote])` **逐字节相等**；`classifyTriage` 在 `prior` 缺失与 `prior=miss` 两种情况下返回对象 `toEqual` |
| 判定本身 | `recallFromPrior` 7 例 + `classifyTriage` 5 例 + 说明/提示词 5 例 + 磁盘读取 4 例 | 命中/未命中/指针式引用/确定性/上限/脱敏/默认根目录与环境变量覆盖 |

**默认行为不变的口径（判据 3）：** 一个还没说过话的会话，即使磁盘上有记忆文件，得到的仍是改动前
那句提问（逐字节相等，`keeps a brand-new session's question byte-identical ...`）；只有"使用者已经说过话"
的会话，未命中时才会在提问下方附加一行「先查后问，还缺 X」——那种情况下问题是可指认的，说明查过哪里
才是有意义的。

**同一句追问的前后对照（真实投递文本，`docs/knowledge/evidence/history-first/before-after.txt`）：**

```text
follow-up: 刚才那个端口的事你再说一下

=== BEFORE (no earlier round) ===
档位：确认档 — 因为：信号互相矛盾或线索不足，前台不猜。

这个要动用团队吗？可回复：简单 / 团队。

=== AFTER (earlier round present) ===
档位：快手档 — 因为：这条本来会先问你一句，但所需信息已经在会话上文或磁盘记忆里，先回捞再作答。

（示例回答）8080 被 dsh-web 占用，换端口改 web.port。

（先查后答：这条据已有材料作答（本会话前序 1 轮报告），没有反过来问你。）
（这条只派了一个工人，没有开完整团队。）

=== worker calls: 1 ===
```

（"（示例回答）…" 是测试替身返回的固定串；这里被验证的是**材料进了提示词**与**正文形态**，
不是模型答案质量。）

### 3. 回放测试用的失败形态（判据 4）

`test/triage-recall.spec.ts` 里 `replay: a follow-up about earlier research is answered, not bounced back`
成对出现，前半段复现失败形态、后半段证明修复：

- 后半段第 1 轮内容（即失败会话里的"研究结果"）：8080 端口被 `dsh-web` 占用、换端口只改
  `cordis.patch.yml` 的 `web.port`、端口占用只表现为 GUI 白屏。
- 追问句：`刚才那个端口的事你再说一下`——**改动前**该句是确认档（前半段用例断言
  `档位：确认档` + `这个要动用团队吗？可回复：简单 / 团队`，且 0 次模型调用），**改动后**同一句
  在带前序报告的会话里直接按历史作答（快手档 + 1 次前台调用 + 不反问）。
- 该样本本身不在本机磁盘上（`ls -d ~/.dsh/sessions/*/session-7e079b80*` 无匹配），因此回放用的是
  它的**形态**（先有研究结果、随后指针式追问），不是逐字节转录——这一点如实记录，不冒充原始会话。

### 4. 实施中发现并修复的缺陷（`CONFIRMED`）

- **F1 — 把当前消息当成"历史"，自己命中自己：** 首版 `collectRecallSources()` 直接调
  `collectHistory(session)`。但 `relay`/`append` 策略在 `produceAnswer()` 之前就 `commitClaimed()`
  把本轮消息写进了会话（P0-5），于是「刚才那个端口的事你再说一下」的锚点全部在同一句话里命中 →
  任何问题都会"找到答案"并据自己作答。修法：给 `collectRecallSources()` 加 `exclude` 参数，按
  `textOf(message) === request` 剔除本轮消息；`test/triage-recall.spec.ts` 的 `before the fix`
  用例与两个磁盘记忆用例都依赖这一剔除（关掉剔除会立刻变红）。

### 5. 范围与安全

| 检查 | 结果 | 证据 |
|---|---|---|
| DSH 核心未改 | PASS | 只改 `src/triage.ts`、`src/gate.ts`、`test/triage-recall.spec.ts`；未写入 `/home/fish/.local/share/mise/.../@deepseek-ai/dsh` |
| 无新配置键 | PASS | `src/config.ts` 未改；记忆目录走 `memoryDocRoots()` 默认 `<cwd>/docs/knowledge` 或环境变量 `GROK_WORKFLOW_KNOWLEDGE_DIRS` |
| 只读 | PASS | 新增代码只 `readdirSync`/`readFileSync`；不写归档、不写记录、不新增事件类型 |
| 无凭据 | PASS | 记忆文件内容过 `redactSecrets` 后才可能进提示词/回答；证据与文档中无任何 key（测试用 `github_pat_…` 假值验证脱敏） |
| 有界 | PASS | `RECALL_LIMITS`：6 轮 / 3000 字符会话、4 轮 / 4000 字符 digest、12 文件 / 每个 2400 / 合计 16000 字符、摘录 700 字符 |
| 默认行为不变 | PASS | 无 `prior` 时 `classifyTriage` 走原分支（4 处 ask 判定统一改为 `ambiguousVerdict()`，`prior` 缺失时返回与改动前相同的 `ask`/`ambiguous-escalate`）；无来源时不追加任何说明行 |
| 真实加载 | PASS | `test/loader.spec.ts`（`npm test` 内含）用真 cordis Loader 载入 `lib/index.js` 并注册 `grok_workflow`，随构建产物一起跑过 |
| 构建产物 | PASS | `npm run build` 后 `lib/gate.js`、`lib/triage.js`（含 `.d.ts`/`.map`）已更新，`npm test` 每次都先 build |

### 6. 边界（本轮**不**声称）

- **真机在线模型回放 `NOT_RUN`**：本轮没有起隔离 DSH profile 跑真模型（需在线模型与 profile 准备，
  任务约束亦要求"单元测试不需要在线模型"）。判据 4 由上面的确定性回放用例满足；真机 GUI 上的
  「追问不再被要求重述」仍待一次带模型的 e2e 复验。
- **语义匹配是词面锚点，不是向量检索**：`recallFromPrior` 用去停用词的双字/词锚点 + 指针式引用，
  同义改写（例如把「端口」说成「监听地址」）不会命中，会退化为提问（`HYPOTHESIS`：真实会话里
  这类改写占比未知，本轮未采样）。
- **记忆文件只读 `*.md` 且只看默认根目录**：`docs/knowledge/` 之外（例如 `~/.dsh/memory` 的
  `archive.jsonl`）本轮不读——那是 D-036 的另一条路径，避免两处语义打架。
- 未提交、未 push、未 bump 版本、未发布 npm；工作树里同时还存在 D-035 / D-036 两个任务的未提交改动。

## Round 24 (2026-11-07) — 诊断：即时回执打断 token 计量 → 自动压缩永久静默停摆（session-3361cd6e）

**性质**：只读诊断，不改代码、不改配置、不改会话数据。完整报告：
`docs/knowledge/evidence/diag-ctx-compaction-2026-11-07.md`。

### 结论（CONFIRMED）

DSH 的自动压缩（`@deepseek-ai/dsh-compaction-basic@0.2.1-rc.2`）经 `agent/pre-step` → `compactIfNeeded()` →
`ctx.tokenMeter.measure()` 取数，阈值 `floor(min(contextWindow*0.8, window−maxTokens−headroom))`；
本路由（`contextWindow 1000000` / `maxTokens 32000` / `headroom 65536`）= **800,000**。

`session-3361cd6e` 的日志在 **seq 2339** 有一条 step 之外的 `assistant/message`
（`source: {provider:"grok-workflow", model:"workflow-receipt"}`，即本插件 `src/records.ts` `appendInstantReceipt()`
在 `turn/start` 之后、`step/start` 之前写入的团队档即时回执）。`dsh-token-meter` 的 `_foldEvent` 要求
`assistant/message` 必须落在 `step/start … step/end` 内（`lib/index.js:846-848`），否则抛
`token meter: assistant/message at seq 2339 has no matching step/start event`；抛错后 fold 游标不前进，
**此后每次测量都在同一处抛错**。压缩侧只在 `logger.warn(... continuing the turn)` 里吞掉（`compaction-basic/lib/index.js:839-850`），
于是会话从第 5 轮起再没有自动压缩，而 GUI 的占用百分比走独立投影（`contextPressure`）照常显示 92–95%。

### 取证

| 检查 | 结果 | 证据 |
|---|---|---|
| 会话占用 | CONFIRMED | `~dsh-layerfs/storages/session_projcache/sessions/session-3361cd6e-….json`：`pressureTokens` 921,147（seq 6361）→ 953,777（seq 6557）/ `contextWindow` 1,000,000 = 92.1% → 95.4% |
| 断点前后行为 | CONFIRMED | 全日志仅 1 次 `compaction/start`（seq 2148, turn 4），其压缩前最大 prompt 399,817（≈0.8×500,000 刚过线）；seq 2151 之后再无 `compaction/*`，而 turn 16/17 的 prompt 长期 800k–953k |
| 复现 | CONFIRMED | `node docs/knowledge/evidence/diag-ctx-compaction-verify-metric.mjs`（原在未跟踪的 `out/diag/`，已随证据入库）：STEP 1 raw `measure()` 抛上述错误；STEP 2 唯一孤儿 = seq 2339；STEP 3 修好回放后 `totalTokens=954,926`；STEP 4 阈值 800,000 |
| 跨会话 | CONFIRMED | 同工作区 5 个会话扫描：本会话与 `session-eb3f5542` 各 1 条回执孤儿，其余 0 |
| `/compact` 实测 | NOT_RUN | 会在活动会话上产生压缩，违反只读约束（源码上 `compactNow()` 同为 `measure()`，预计被包成 `busy`） |
| Web GUI API 取数 | BLOCKED | `curl http://100.111.111.88:3090/` → 401；按约束不读凭据，改用同源投影缓存 |

### 修复建议（未执行，留给用户决策）

1. 根因：`appendInstantReceipt()`/`appendUnloadNotice()`/`gate.ts` 两处 append 只在“存在与之匹配的 open step”时写，
   否则延后到该轮第一个 `step/start` 之后；配套单测 + `TokenMeter.measure()` 回放回归测试。
2. 立即规避（只对新会话）：`profiles/web/cordis.patch.yml` 的 `grok-workflow.config` 加 `instantReceipt: false`，重启 `dsh-layerfs-web.service`。
3. 上游：`dsh-token-meter` 容忍孤儿 `assistant/message`（或 `session.append` 前置校验、压缩失败升级为可见告警），
   否则已存在的会话无法原地恢复（重启 DSH 也不行，日志里的孤儿事件仍在）。
4. 未提交、未 push、未 bump 版本；工作树另有既有未跟踪目录 `.v050-home/`、`out/`。

## Round 25 (2026-11-07) — 路由 Cap 空陷阱提示 + 单 run 作用域 + 跨 run hint（B组+C1 收尾归档）

**性质**：收尾归档 + 提交。本轮不改 `src`/`test`/`lib` 行为（B组+C1 实现为既有工作树改动），只新增
`DECISIONS.md` D-038、本 Round 25、`STATE.md`/`HANDOFF.md` 刷新，然后 `git commit` + push 到
`origin release/0.5.1`。`CHANGELOG.md` 不动（B组+C1 条目已由实现任务写入）。

### 命令与结果（CONFIRMED，均在 `/home/fish/projects_mine/dsh-grok-workflow` 执行）

| 命令 | 结果 |
|---|---|
| `npm run build` | PASS（exit 0；`client bundle: 84123 bytes → lib/client.js`） |
| `npx vitest run test/route-concurrency.spec.ts test/client.spec.ts` | **47/47 PASS**（route-concurrency 13/13，client 34/34） |
| `npm run ci` | **PASS**（exit 0；typecheck 0 errors；lint 3 warnings / 0 errors 既有基线；vitest **35 files / 624 tests PASS**） |
| `lib` 同步 | `npm run build` 后二次重建 md5 幂等一致（`IDEMPOTENT_SYNCED`）；`lib/` 变更即 B组+C1 实现的编译产物，随本轮 commit 入库 |
| `git diff --exit-code -- lib/` | 以入库为准（上条确认后随 commit 同步；约束原文"若不是0则重跑"已满足——重跑后幂等无变化） |
| DSH core 改动 | 无（`CONFIRMED`：`git status` 仅本仓库文件，无 core 路径） |
| live `:3090` 重启 | 未做（D-013；live 实例仍跑 `0.2.7`，reload/upgrade 待用户批准） |
| 真机 live | `NOT_RUN`（本轮纯收尾归档，未起隔离 profile） |

### 归档内容

- `DECISIONS.md` D-038：B组（`warn.emptyCap` 黄字不拦 Save + `validateRoutes` notes + 单 run 作用域）+
  C1（`busyRoutes` run 级估计重排未试顺序、无 hint 逐字节不变、`skippedBusy` 复用 `'(cross-run hint)'` 标记、
  报告分开渲染）+ C2 不可行（A16，沙箱封闭）。
- 变更文件（随本轮 commit 入库，未 bump 版本、未打 tag、未发布 npm）：
  `src/{script,run,report,settings}.ts`、`src/client/index.js`、`docs/ARCHITECTURE.md`、
  `docs/knowledge/RESEARCH.md`（A16 已由 C2-spike 任务写入）、`CHANGELOG.md`（条目已由实现任务写入）、
  `test/{route-concurrency,client}.spec.ts`、`lib/` 编译产物。

## Round 26 (2026-11-07) — v0.6.0 isolated verification: dual-route worker overflow (release-runner)

**性质**：隔离 profile 真机验证（`v0.6.0` 发布后验证，不碰 live `:3090`，不改 DSH core）。
完整证据：`docs/knowledge/evidence/v060-route-cap/`（README + report-full.txt + session-events.jsonl 52 事件）。

### 命令与结果（CONFIRMED，均在 `/home/fish/projects_mine/dsh-grok-workflow` 执行）

| 命令 | 结果 |
|---|---|
| `npm ci` | PASS |
| `npm run typecheck` | PASS（0 errors） |
| `npm run lint` | **4 warnings / 0 errors**（3 既有 + 1 新增：`src/run.ts:29` 未使用的 `RoleName` import，本版未修） |
| `npm run build` | PASS（`client bundle: 84123 bytes → lib/client.js`） |
| `git diff --exit-code -- lib/` | exit 0 |
| `npm test` | **35 files / 624 tests PASS**（24.34s） |
| `npm pack --dry-run` | 64 files / 299.1 kB `dsh-grok-workflow-0.6.0.tgz`（npm 缓存只读，用 workspace-local cache 重跑） |
| PR #43 CI (run `42362505851`) | Node 22 pass / Node 24 pass |
| Release workflow (run `42362674837`) | success；GitHub Release `v0.6.0` published **2026-11-07T10:09:17Z**，asset `dsh-grok-workflow-0.6.0.tgz` **299,146 B** |

### 隔离验证（CONFIRMED）

新鲜 profile `v060r`（`--from-default-profile headless`，隔离 `DSH_HOME=out/v060-verify/home`），
模型 `wb/cn:deepseek-v4-pro` + `agnes-3.0-flash`（`wb/cn:deepseek-v4.1-flash` 当天 per-model cooldown 400，如实记录并换路）。
Turn 1 gate-off 问候 exit 0；turn 2 团队档（`mode: full`，worker 双路由各 `maxInFlight: 1`，2 任务）→
`Grok workflow: COMPLETED`，2 verified，报告含 `Route overflows (full lane yielded, not failures):` +
`skipped full bifrost-completions/wb/cn:deepseek-v4-pro` ×2，双 worker 路由均在 `Model routes:`。
工作区 `out/v060-verify/work/` 仅 `sum.txt`（`TOTAL: 611`，11 B）+ `prod.txt`（`PRODUCT: 611`，13 B），无外写。
跨 run `(cross-run hint)` 行本轮未产出（未起第二个并发 live run），由 `test/route-concurrency.spec.ts` 13 例确定性覆盖。

### 边界

- `warn.emptyCap` 黄字提醒的浏览器渲染本轮 `NOT_RUN`（`test/client.spec.ts` 34/34 单元覆盖）。
- 报告中另有一条真实 `Route switches:`（agnes 路由一次 `format-error`，按 `maxRetries: 0` 记录为 switch，运行仍 COMPLETED）——如实记录，非本版缺陷。
- live `:3090` 未动（仍 `0.2.7`，D-013）；operator `DSH_HOME` 未写；无 DSH core 改动；已发布 tag 未移动。

## Round 27 (2026-11-07) — 子代理显示名诊断：标签由 DSH core 写死，插件侧无扩展点（**BLOCKED**）

**性质**：只读源码取证诊断。**未改插件代码、未改 DSH core、未起隔离 profile、未碰 live `:3090`。**
任务目标（让顶栏每个子代理显示具体任务名、不出现 `任务团队 child N` 或提示词原文）在当前约束下**不可达**，
原因与证据如下（全部 `CONFIRMED`，逐行读过源码）。

### 根因链（CONFIRMED）

| 环节 | 位置 | 事实 |
|---|---|---|
| ① 插件确实传了标签 | `src/script.ts:1186-1191`（worker）、`1211-1216`（verifier）、`1322-1327`（planner）、`1436-1441`（synthesizer） | 每次 `agent(prompt, { label: memberLabel(...) })` 都带标签（`规划助手` / `执行` / `检查` / `汇总助手`，见 `src/naming.ts:258-265`） |
| ② 引擎文档把 label 定义为显示名 | `…/dsh-tool-workflow/lib/index.js:143` | 原文：`Other opts: \`label\` (display)` |
| ③ 引擎运行时只把它当进度标签 | `packages/workflow/workflow-ptc/src/runtime.ts:176` 与 `:183-188` | `const label = opts.label ?? defaultLabel(rawPrompt)` 只进 `WorkflowAgentInfo`；`children.startAgent({ prompt, schema, provider, model })` **不转发 label** |
| ④ 宿主写死子代理激活 label | `packages/workflow/workflow-ptc/src/host.ts:200-205`（`childRequest()` 在 `:45`） | `` label: `${this.meta.name} child ${callId}` ``；`childRequest()` 只取 prompt/provider/model/schema，任何 label 字段被丢弃 |
| ⑤ 该 label 成为持久描述符 | `dsh-subagent/lib/index.js:1404`（`snapshotSubagentDescriptor`）、`:1800`（`child.session.append("subagent/descriptor", …)`） | 子会话首个 `subagent/descriptor` 事件带的就是 `任务团队 child N` |
| ⑥ 描述符**不可改写** | `dsh-subagent/lib/index.js:686-698`（`foldSubagentDescriptor`） | 注释原文：`The first subagent/descriptor event is authoritative … a later same-type event cannot rewrite the declared composition`；实现用 `events.find(...)` 取第一条 |
| ⑦ GUI 顶栏主标签就取它 | `dsh-client-ui-subagent/lib/client.js:201` | `const label = entry.label ?? entry.id;`，次级行拼 `summary?.title`（子会话自动标题，故出现 `You are the planning agent`） |
| ⑧ `任务团队` 从哪来 | `src/script.ts:1659-1664`（`name: runTitle(...)`）+ `src/naming.ts:312`（`workflow: '任务团队'`） | 它是 **run 级** meta.name，一个 run 只有一个值，无法按子代理区分 |

结论：`任务团队 child N` 由 DSH core 在**创建子代理那一刻**写死，且被描述符契约锁成不可改写；
插件侧（含 workflow 脚本的 `agent()` 选项、`WorkflowMeta`、`WorkflowStartRequest.subagentProvider`、
自定义 `SubagentProvider`、客户端 slot）**没有任何文档化扩展点**能改它。
`WorkflowMeta` 只接受 `name/description/whenToUse/phases`（`…/dsh-workflow-ptc/lib/index.js:483-537` 的
`validateMetaShape`，未知字段直接 `META_INVALID`）；`WorkflowStartRequest` 只有
`script/meta/args/subagentProvider/maxTotalAgents/parent/signal`（`…/dsh-workflow/lib/types/runtime-types.d.ts:14-33`）。

### 已否决的绕行方案

| 方案 | 否决理由 |
|---|---|
| 追加第二个 `subagent/descriptor` 事件改 label | `foldSubagentDescriptor` 取**第一条**（`dsh-subagent/lib/index.js:686-698`），契约明写不可改写；且属未文档化的内部日志改写 |
| 自定义 `SubagentProvider`（`subagentProvider` 选项） | provider 拿到的 label 仍是 manager 传入的 `spec.label`（`dsh-subagent/lib/index.js:1407/1501`）；`ContinuableCreateSpec` 只有 `seed`，没有 label/descriptor 覆盖位 |
| 把 `meta.name` 改成描述性名字 | 仍是 run 级单值，只会得到 `任务团队 · N 个任务 child 1`，`child N` 还在 |
| 插件自己调 `ctx.subagents.startActivation({ label })` 建子代理 | 等于绕开 `ctx.workflowEngine` 的 `agent()` 钩子，违反本仓架构不变量（AGENTS.md「primary execution path is a workflow script executed by ctx.workflowEngine」），且验收条款要求"经 agent() 钩子创建的子代理" |
| 改 DSH core | 明令禁止（AGENTS.md + 本任务 constraints） |

### 需要的上游改动（**NOT_RUN**，未执行）

DSH core 两处、约 3 行：`runtime.ts` 的 `agent()` 把 `label` 放进 `startAgent(...)`；
`host.ts` 的 `childRequest()` 接收 `label`，`startChild()` 用
`` label: request.label ?? `${this.meta.name} child ${callId}` ``。改完后插件**现有代码即生效**（标签已经在传），
无需再改插件。

### 命令与结果（CONFIRMED）

| 命令 | 结果 |
|---|---|
| `git status --short --branch`（开工时） | `## release/0.6.0...origin/release/0.6.0`；工作树有**并发任务**改动（`src/client/index.js`、`lib/client.js`、`test/client.spec.ts` 已改，`test/panel-links.spec.ts` 未跟踪），非本任务产物，未触碰 |
| 源码取证 | 上表 8 处逐一 `sed`/`grep` 读过，行号即证据 |
| 已装 DSH 版本 | 7 个 mise node 安装下 `@deepseek-ai/dsh` 全为 `0.2.1-rc.2`（`node -e require(package.json).version` 逐一确认） |
| live `:3090` 版本与浏览器渲染 | `NOT_RUN`（`GET http://100.111.111.88:3090/` → `401 Unauthorized`，本会话无凭据；且根因已在源码层定死，渲染层无待验变量） |
| 隔离 profile 真机 | `NOT_RUN`（无修复可验；本轮为诊断） |
| 插件代码改动 | 无（`git diff` 中无本任务产生的源码改动） |
| DSH core 改动 | 无 |

## Round 28 (2026-11-07) — fix_child_names 复核：Round 27 结论独立重验 + 隔离 profile 真机复现（**BLOCKED 维持**）

**性质**：fix_child_names 第二次尝试。本轮把 Round 27 的源码结论**逐条独立重验**（不依赖上一轮记录），
并把 `隔离 profile 真机` 从 `NOT_RUN` 升级为 **PASS（复现成功）**——在真机 installed DSH 上观察到了
`任务团队 child N` 写进每个子会话首个 `subagent/descriptor`。结论不变：**BLOCKED**。
证据目录：`docs/knowledge/evidence/childname-blocked/`（README + 3 个摘录文件）。

### 独立重验的源码链（本轮自己读，非转抄 Round 27）

| 环节 | 本轮实际读到的位置与内容 |
|---|---|
| 引擎写死子代理 label | `…/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-workflow-ptc/lib/index.js:332`（打包后 host `startChild`）：`` label: `${this.meta.name} child ${callId}` `` |
| guest 不转发 label | 同文件内嵌 `WORKFLOW_GUEST_SOURCE`：`children.startAgent({ prompt, schema?, provider?, model? })`——`SUPPORTED_AGENT_OPTIONS` 里的 `label/phase` 只进 observer `agentStart(info)` |
| 描述符锁死 | `…/@deepseek-ai/dsh-subagent/lib/index.js`（`foldSubagentDescriptor` 用 `events.find(...)` 取第一条；`SubagentActivationSpec.label` 为 `readonly`，descriptor 由 manager `startLocal` 在 provider 钩子之前 `snapshotSubagentDescriptor({…label: spec.label…})` 快照） |
| GUI 直接渲染 | `…/@deepseek-ai/dsh-client-ui-subagent/lib/client.js:201`：`const label = entry.label ?? entry.id;`，次级行为 `[summary?.title, mode, activity].join(" · ")` |
| 半程缓解点存在 | `…/@deepseek-ai/dsh-session-title/lib/index.js:295`：`SessionTitleService.rename(session, title)` 确为文档化服务（改的是**次级行**，主标签不动） |

### 真机复现（隔离 profile，CONFIRMED）

| 命令 | 结果 |
|---|---|
| `DSH_HOME=out/childname-verify/home dsh --profile cnamer --from-default-profile headless --dump-config` | exit 0（隔离 home + headless profile 建立） |
| turn 1（gate off，复用 `out/v060-verify/model-pro.patch.yml` + `plugin-off.patch.yml`） | exit 0，`session-765de8f7-15ae-490b-8c16-ce39018edac9` |
| turn 2（gate on，`plugin-on.patch.yml`：`mode: full`、`maxTasks: 2`、`maxRetries: 0`、worker 双路由） | exit 0，团队档 COMPLETED，2 任务 verified（一条真实 agnes `format-error` route switch，同 Round 26 形态）；共 **6 个子代理**（planner 1 + worker 2/3/5 + verifier 4/6） |
| 父会话 `tool-workflow/run-start` | `"name":"任务团队"`（计划先行，开局无任务数后缀） |
| 父会话 `tool-workflow/agent-start` ×6 | **插件标签确实在传**：`{"label":"规划助手","phase":"规划",…}`、`{"label":"执行","phase":"任务 1 · Create and verify sum.tx…",…}`、`{"label":"检查",…}`（`parent-agent-start-excerpts.txt`） |
| 6 个子会话首个 `subagent/descriptor`（`zstdcat` + `grep`） | **全部为 `"label":"任务团队 child N"`（N=1..6），`seq 0`，`provider:"spawn"`**（`child-descriptor-events.txt`）——插件传的描述性 label 未到达持久描述符，与用户截图逐字一致 |

### 边界

- live `:3090` 未动（D-013，仍 `0.2.7`）；operator `DSH_HOME` 未写；DSH core 未改（`git -C ~/projects_mine/deepseek-harness status` 干净）。
- 浏览器渲染本轮 `NOT_RUN`（同 Round 24/27：GUI 401 无凭据；描述符标签已是渲染输入的唯一主标签来源，源码已定）。
- 插件源码零改动；`npm run ci` 本轮未跑（无本任务源码改动，且工作树含并发任务进行中的 client 改动，跑 CI 只会测到别人的中间态；基线仍是 Round 26 的 35 文件 / 624 测试 PASS）。
- `out/childname-verify/` 内两个中间摘录文件曾在相邻两次调用之间消失（`child1-events.jsonl`、`descriptor-excerpts.txt`；原因未查明，疑似与并发任务的 out/ 操作相撞）。已用「同一命令内生成+校验」的方式把三份摘录直接落盘到 `docs/knowledge/evidence/childname-blocked/`，落盘后跨调用复核仍在，证据不受影响。
- 模型密钥：`BIFROST_VIRTUAL_KEY` 仅做存在性布尔检查（`[ -n … ]`），全程未读、未写、未回显。

## Round 29 (2026-11-08) — fix_child_names 第三轮执行：链路再次独立重验 + 末两个扩展点候选用类型级证据关闭（**BLOCKED 维持**）

**性质**：fix_child_names 再次执行（编排器重试）。本轮不转抄前两轮记录，全部自己重读源码；Round 27/28
结论逐条复现一致，并新增**类型级证据**关闭此前仅以「理由否决」记录的末两个扩展点候选
（每 run `subagentProvider` 覆盖 + `ctx.subagents.registerProvider`）。插件源码零改动，结论不变：**BLOCKED**。

### 本轮自己重读并复核一致的源码链（installed DSH `0.2.1-rc.2`）

| 环节 | 本轮实际读到的位置与内容 |
|---|---|
| 引擎写死子代理 label | `dsh-workflow-ptc/lib/index.js:332`：`` label: `${this.meta.name} child ${callId}` ``，无条件分支 |
| guest 不转发 label | 同文件内嵌 `WORKFLOW_GUEST_SOURCE`（本轮全文读）：`SUPPORTED_AGENT_OPTIONS` 含 `label/phase`，但 `agent()` 只把 `prompt/schema/provider/model` 传给 `children.startAgent(...)`；`label/phase` 仅进 observer `agentStart(info)` |
| 描述符锁死 | `dsh-subagent/lib/index.js:697-698` `foldSubagentDescriptor` 取第一条 `subagent/descriptor`；`:1404` descriptor 由 `startLocal` 从 `spec.label` 快照；`:1800` 写入子会话；types.d.ts:29 `SubagentActivationSpec.label` readonly |
| 目录标签来源 | `dsh-subagent/lib/index.js:2575`：catalog entry 的 label = `foldSubagentDescriptor(子会话事件)?.label` → `dsh-client-ui-subagent/lib/client.js:201` `entry.label ?? entry.id` 直接渲染 |
| 插件侧已尽责 | `src/script.ts:1188/1213/1324/1438` 每次 `agent()` 都传 `label`（`memberLabel`）；`src/` 全文无 `sessionTitle` 调用（用户截图里任务 2/5 的描述性次级行来自子会话标题的提示词首行推导，非插件 rename） |
| core 检出无上游修复 | `~/projects_mine/deepseek-harness` HEAD `687f282e`（= release-dsh-0.2.1-rc.2 合入），`host.ts:205` 与 `runtime.ts:183-188` 与 installed 逐字一致——上游 ask 仍属必要 |

### 新增：末两个扩展点候选的类型级关闭（本轮新证据）

| 候选 | 关闭证据 |
|---|---|
| `WorkflowStartRequest` 是否有 label 字段 | `dsh-workflow/lib/types/runtime-types.d.ts:15-28` 全接口只有 `script/meta/args/subagentProvider/maxTotalAgents/parent/signal`——无 label；`meta.name` 可控但模板恒拼 ` child ${callId}` |
| 每 run `subagentProvider` + 自定义 `SubagentProvider` | 注册与选择 API 真实存在（`dsh-subagent/lib/types/index.d.ts:288` `registerProvider`；`workflow-ptc/src/index.ts:70-79` `resolveSubagentProvider`），但 continuable 子代理的 provider 参与**只有** `prepareContinuable → ContinuableCreateSpec { seed? }`（`dsh-subagent/lib/types/types.d.ts:187-213`，单字段、无 label，manager 拥有其余一切生命周期）；descriptor 由 `startLocal` 从 `spec.label` 快照，而 `startActivation` 的契约明说 label 由调用方拥有（types.d.ts:122-124，`request` 里 `Omit<…,'label'>`）——调用方是写死的 workflow host |
| 无 `prepareContinuable` 的 provider（external 一次性子代理） | `SubagentRunInfo` 只有 `runId/provider/id/local`（types.d.ts:88-102），无 label 无会话目录条目 → GUI 会渲染裸子会话 id，比 `任务团队 child N` 更差，且摧毁 continuable 任务团队模型（子会话、目录面板、插件经 `workflow/agent-end` 的归档全依赖 continuable） |
| 引擎配置 / 备选引擎 | `workflow-ptc/src/index.ts:105-111` Config 只有 provider/并发/上限/超时——无 label 模板；全 core checkout `extends WorkflowEngine` 仅 `PtcWorkflowEngine` 一处 |
| 插件直调 `startActivation` | `ctx.subagents` 服务面只有 `registerProvider/getProvider/list/interruptByParent/…`（index.d.ts:270-300）；`startActivation` 在 `SubagentRuntime` 类上（index.d.ts:135,145），host 侧直调将绕过引擎 `agent()` 钩子——违反本仓架构不变量与任务措辞 |

完整定位与推理：`docs/knowledge/evidence/childname-blocked/extension-points-closure.md`（本轮新增）。

### 边界

- 纯源码取证轮：未起隔离 profile（Round 28 的真机复现继续有效，其证据文件本轮复读完整）、未碰 live `:3090`（D-013）、operator `DSH_HOME` 未写、DSH core 未改。
- 插件源码零改动；`npm run ci` 未跑（无本任务源码改动；工作树仍含并发任务的 client 改动；基线 Round 26：35 文件 / 624 测试 PASS）。
- 无凭据读取；无密钥接触。

## Round 30 (2026-11-08) — fix_completed_links：已完成子任务在聊天任务列表保持可点击（**CONFIRMED，真机 PASS**）

**性质**：插件客户端修复（`src/client/index.js` 新增 `workflow-run` 聊天节点渲染器）+ 真实 Web GUI 验证。
**DSH core 零改动**（唯一涉及的 DSH 侧事实全部走文档化扩展点）；live `:3090` 未碰（D-013）；
operator `DSH_HOME` 未写；验证全部在隔离 home `.v070-home/`（web 模板 profile `panelcheck`，端口 3177/3179）完成。

### 根因（CONFIRMED，行号即证据）

- 库存任务列表是 `@deepseek-ai/dsh-client-ui-workflow-run` 的键控聊天节点渲染器（installed
  `dsh-client-ui-workflow-run/lib/client.js:176-179`）：`navigableMembers()` 要求
  `member.status === "running"` 且子会话属于本 run、投影出 `subagent` 身份——**已结束的行因此全部失去链接**。
- 子会话能否打开与状态无关：workflow 子代理由 `startLocal` 以 `mode: "continuable"` 创建
  （`dsh-subagent/lib/index.js` `snapshotSubagentDescriptor({ mode: "continuable", … })`），
  完成后子会话与 `values.subagent.mode` 都还在——**可开性在结束后依然成立**，被库存渲染器的
  running 条件错误掩盖。
- 键控槽位的替换机制是**优先级遮蔽**（`dsh-web-frontend/dist/assets/index-*.js` 内 `SlotCore.register`）：
  同键**同优先级**直接抛错（"already has an entry for key … register at a different priority to
  shadow it (lowest renders)"），`entriesOfSlot` 按优先级升序去重、最低者渲染。首轮实现（无
  `priority`，双方都落默认 0）实测：库存 `dsh-client-ui-workflow-run` 整个客户端 boot 失败
  （"web boot: 1 entry did not activate"），页面只剩错误屏；A/B 对照（`disabled: true` 同 profile）
  干净启动，冲突源锁定为本插件注册。加 `priority: -1` 后双注册并存、库存条目被遮蔽（插件卸载即恢复）。

### 修复（插件侧，全在文档化扩展点内）

`src/client/index.js`（= `lib/client.js`，md5 同步）新增 `mountPanel`：经
`ctx.slots.inject('conversation.chat.node', …)` 以 `key: 'workflow-run'`、`priority: -1`
重注册键控渲染器；行可开性由 `panelMemberMode()`（子会话存在 + `parentId` 匹配本 run +
`mode` 为 `continuable`/`one-shot`）决定，**不读成员状态**。`uiWorkspace` 为可选注入
（缺席时面板不注册、库存渲染器保留、设置页不受影响）。测试：`test/panel-links.spec.ts`
14 例（运行态链接/完成态保持链接/失败·取消·中断保持链接/running→completed→failed 引用
不变式/点击回调载荷/不可开行回退/双语词典/槽位注册含 `priority: -1` 钉死）+
`test/client.spec.ts` 2 处断言更新；`npm run ci` **36 文件 / 638 测试 PASS**（typecheck 0 错，
lint 4 warning / 0 error 基线），`git diff` 幂等重建 `lib/` md5 一致。

### 真机验证（隔离 profile `panelcheck`，DSH CLI `0.2.1-rc.2`，模型 v4-pro + agnes flash）

1. 插件 dev 安装进 web 模板 profile，`workflow-ptc` 启用 + 模型 patch（同 Round 26 叠加），
   实例起在 `127.0.0.1:3179`；headless Chromium（Playwright）打开 GUI：
   **boot 干净**（无 "Failed to load plugins"、无激活失败、console 0 错误）。
2. 团队档真跑（gate on + `mode: full`，计算类双任务）：**run `runStatus: completed`**
   （面板 `data-run-status="completed"`，共 6 子代理：规划 1 + 任务1 执行/检查 + 任务2 执行/检查，
   其中一条真实 agnes `format-error` route switch 的 `执行 failed` 行——同 Round 26 形态）。
3. **运行中**：`规划助手` running 行 = `<button data-member-openable="true">`（截图 04/05）。
4. **完成后**：6 行全部 `tag=button`、`data-member-openable="true"`、**0 行 inert**——
   `规划助手 已完成`（用户报告的缺陷行）与 `执行 failed` 都是链接（截图 06：全行下划线蓝链）。
5. **点击已完成的规划助手行**：主面板切到子会话视图（面包屑 `… / 任务团队 child 1`，
   含规划提示词全文与 "Completed in 34s"，截图 07）——与运行中行打开的是同一子任务视图。
6. 附带验证（首轮 run，写文件任务在 ro 挂载的 `/home` 下按预期失败）：**failed 行同样可点击**，
   run 终态 FAILED 时 6 行也全部为按钮——failed 分支的验收同轮覆盖。

证据：`docs/knowledge/evidence/panel-links-2026-11-08/`（README、result.json、截图 04–07）。
隔离实例用后即弃（job 已杀），实例访问 URL 含一次性 token 未入库（evidence 截图不含 URL/token）。

### 边界

- `relay`/`append` 投递形态下的任务列表渲染未单独验证（本轮验证的是默认 `in-turn`；渲染器
  消费的是同一批 `tool-workflow/*` 事件，与投递策略无关，`HYPOTHESIS` 级外推）。
- 深色主题/移动端宽度下样式未逐项核对（面板用内联样式 + `var(--dsw-alias-link)`，视觉差异
  可能存在，`NOT_RUN`）。
- 无凭据读取；无密钥接触；DSH core 未改；无 tag/发布动作。

## Round 31 (2026-11-08) — fix_child_names 第四次执行：twin 引擎 seam 真机 PASS（**CONFIRMED**）

**性质**：插件侧修复（新增 `src/team-engine.ts` + 提示词首行改造）+ 真实 headless DSH 验证。
DSH core 零改动（检出全程 clean，`687f282e`）；live `:3090` 未碰（D-013）；
operator `DSH_HOME` 未写；验证全部在隔离 home `out/childname-fix-verify/`（profile `cfix`，从
headless 模板创建）完成；插件从工作树构建 `file:///…/dsh-grok-workflow/lib/index.js` 加载
（`mode: full`、`maxTasks: 2`、`maxRetries: 0`、gate on、模型 `wb/cn:deepseek-v4-pro` + agnes flash，
key 走 `apiKeyEnv: BIFROST_VIRTUAL_KEY` 仅布尔存在性检查）。

### 根因与 seam（CONFIRMED，行号即证据；链路全图见 RESEARCH.md A18）

- Guest `agent()` 的 label 只进观察者事件，`startAgent` 转发体不带 label（`runtime.js:183-188`）；
  host `startChild` 写死 `` `${this.meta.name} child ${callId}` ``（`workflow-ptc/src/host.ts:205`），
  成为子会话**首个** `subagent/descriptor` 事件（first-wins），GUI 主名直取它
  （`dsh-client-ui-subagent/lib/client.js:201`）。
- `PtcWorkflowEngine.start()` 在 start 时读 `runCtx.subagents`（`workflow-ptc/src/index.ts:157`）→
  插件用注入引擎**自己的构造函数**建私有 twin（static-inject 判别、WeakMap 按 ctx 缓存、
  `reflect.provide` 置空），twin 的 subagents 视图在 `startActivation` 处重写
  `spec.label` = 提示词首行；非 PTC 引擎原样返回并 warn（`src/team-engine.ts`）。
- `src/script.ts`：planner/worker/verifier/synthesizer 提示词首行改为
  `规划助手`/`<任务标题>`/`检查 · <任务标题>`/`汇总助手`（人设第二行）；`src/triage.ts`、`src/gate.ts`
  的非团队路径首行 `快速应答`/`前台直答`/`前台任务`/`任务分类`。

### 两次真机失败（诊断价值，均 CONFIRMED）

1. twin ctx 用**代理视图**包插件 ctx → `cannot get property "ptcRuntime" without inject`：
   cordis get handler 以 receiver 为键做 shadow/fiber walk，`Reflect.get(target, prop, target)` 破坏解析。
2. 改为正确 receiver 转发后，从插件 ctx / 引擎 ctx **属性读**服务仍抛
   `cannot get property "subagents" without inject`（isolate guard；真机探针：同一 ctx 上
   `readSubagents` 抛错、`ctx.get('subagents')`/`ctx.reflect.get('subagents', false)` 返回 object）。
   **修复**：从引擎自身 ctx 经 `ctx.get(name)` 显式解析服务装入最小 holder（A18 三条硬事实）。
   探针轮（run 8，随后移除探针）：`twin built ok`、`twin=true`、`startActivation intercepted` ×6
   （引擎仍报 `任务团队 child 1..6`，重写发生在 descriptor 落盘前）。

### 真机验证（shipping 构建，无调试代码）

- 终验命令：团队档创建并读回 `final-sum.txt`/`final-prod.txt` → exit 0、
  `Grok workflow: COMPLETED`、6 个子会话首个 `subagent/descriptor` 全部为
  `规划助手` / `<任务标题>` / `检查 · <任务标题>`（含一条真实 agnes format-error route-switch 重试），
  **0 处 `任务团队 child N`**；前缀对照（同 patch、修复前构建）3/3 为旧标签。
- 确定性单测：`npx vitest run test/team-engine.spec.ts` → 12 passed（首行推导/重写/非 PTC 回退/
  fake 构造函数不被重调/twin seam 契约/WORKFLOW_SCRIPT 首行契约中英双语）；
  `npm run ci` → **37 文件 / 650 测试 PASS**（typecheck 0 错；lint 4 warning / 0 error，
  与 HEAD 基线一致）。lint 基线：`src/redact.ts:155`、`src/client/index.js:87+1188`、`src/run.ts:30`。
- 证据：`docs/knowledge/evidence/childname-fix-2026-11-08/`（README、
  `child-descriptor-events-final-run.txt`、`child-descriptor-events-prefix-run.txt`、
  `child-descriptor-events.txt`（run 8）、`session-dirs-newest-first.txt`）。

### 边界

- live `:3090` 仍是 0.2.7 旧插件（401，D-013），浏览器点开验证 NOT_RUN；GUI 主名判定由
  `client.js:201` 源码链 + 描述符事件钉死（次级行 = 提示词首行，与本修复一致）。
- 无凭据读取；无密钥接触；无 tag/发布动作；`package.json` 未动。

## Round 32 (2026-11-08) — fix_child_names GUI 浏览器验证：隔离 Web 实例 + 真 Chromium PASS（**CONFIRMED**）

**性质**：Round 31 修复的浏览器观察轮。**零源码改动**；live `:3090` 全程未碰（D-013）；
operator `DSH_HOME` 未写。验证全部在隔离 home `out/gui-verify/home/`（gitignored）完成：
profile `guiweb`（`--from-default-profile web`），插件 dev 安装（`dsh plugin add file:///…/dsh-grok-workflow`，
安装后 `lib/team-engine.js` md5 == 工作树构建），`workflow-ptc` 由 patch 启用（`provider: spawn`），
模型 `wb/cn:deepseek-v4-pro` + `agnes-3.0-flash`（`apiKeyEnv: BIFROST_VIRTUAL_KEY` 仅布尔存在检查）。
实例 `127.0.0.1:3199`（起前确认空闲；一次性 URL token 只从 boot stdout 取用、只经 `GUI_URL`
环境变量进驱动、不落任何文件；用后即杀，live `:3090` 的 PID/端口全程未触碰）。
浏览器：headless Chromium（playwright-core 取自 `@playwright/cli` 自带依赖，
`chromium_headless_shell-1248`），1440×900。DSH CLI 实证来自
`/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@deepseek-ai/dsh`（`0.2.1-rc.2`）。

### 命令（全部实际执行）

1. `DSH_HOME=$PWD/out/gui-verify/home dsh --profile guiweb --from-default-profile web`
2. `DSH_HOME=$PWD/out/gui-verify/home dsh plugin --profile guiweb add file:///home/fish/projects_mine/dsh-grok-workflow`
3. `DSH_HOME=$PWD/out/gui-verify/home dsh --profile guiweb --patch out/gui-verify/model.patch.yml --patch out/gui-verify/guiweb-patch.yml --host 127.0.0.1 --port 3199 --no-open` → boot 输出唯一行 `dsh web: http://127.0.0.1:3199/?token=…`（token 未入库）
4. `GUI_URL=<token URL> node out/gui-verify/driver.mjs`（第一遍：真实 composer 键入团队档双计算任务并回车，跑完全程并断言）→ exit 0
5. `GUI_URL=<token URL> node out/gui-verify/driver2.mjs`（第二遍：点开库存 `Session hierarchy` 面板，读取每个条目主标签并断言）→ exit 0
6. 基线：`npm run ci`（round 开始时于 `ad66118` 工作树）→ **37 文件 / 650 测试 PASS**（本轮零源码改动，未重跑）

### 结果

- **boot 干净**：无 pending / did-not-activate；两遍全程唯一异常是一条装饰性 404
  （`/open-in-app/icon/filemanager` 图标资源）。
- **真 GUI 驱动的团队档跑通**：composer 键入「919+27 / 919×3 双计算任务」→ 面板
  `data-run-status="completed"`；父会话 `session-0a8eb864…` 日志含 `Grok workflow: COMPLETED`；
  一条真实 agnes `format-error` route-switch 重试 → 共 6 个子代理（规划 1 + 执行 3——含一次
  failed 尝试与重试 + 检查 2）。
- **运行中**：顶栏 `Session hierarchy` 触发器 aria = `1 subagent running`（03-running.png）。
- **顶栏（用户投诉的库存子代理面板）**：展开后 6 个条目主标签全部为描述性任务名——
  `规划助手` / `计算并验算 919 + 27` / `计算并验算 919 × 3` / `检查 · 计算并验算 919 + 27` /
  `计算并验算 919 × 3` / `检查 · 计算并验算 919 × 3`；**0 处 `任务团队 child N`**、
  0 处以提示词原文作主标签（驱动断言 `bad=[]`、`ok=true`，见 `hierarchy-result.json`）。
  次级行 = 子会话标题（DSH 从子代理提示词派生；修复后提示词首行即描述性标题，故次级行以任务名开头）。
- **持久数据交叉核对**：6 个子会话首个 `subagent/descriptor` 的 label 与 GUI 面板逐字一致
  （`gui/child-descriptor-events-gui-run.txt`）。
- 截图与 DOM 证据：`docs/knowledge/evidence/childname-fix-2026-11-08/gui/`
  （README、03/04/11/12 四张截图、`hierarchy-result.json`、`result.json`、`mid-run.json`、描述符摘录）。

### live `:3090` 事实核查（只读）与边界

- **更正记忆**：live web profile（`/home/fish/dsh-layerfs/profiles/web`）的插件实为
  **released `0.6.0`**（2026-11-07 21:54 安装），非 0.2.7（STATE/HANDOFF 旧记录已过时）；
  其 `lib/team-engine.js` **不存在** → 是**不含本修复**的构建。把 `ad66118` 构建部署到 `:3090`
  属 D-013 步骤 5（需用户明确授权），本轮 `NOT_RUN`。
- 浏览器为 headless（本机无 X11 显示，同 Round 15/30）；无凭据读取；无 tag/发布动作；
  `package.json` 未动。

## Round 33 (2026-11-08, attempt 5): live `:3090` 持久面板数据实锤——当前轮子代理在 live 上仍显示「任务团队 child N」；认证边界复测；修复构建在 live home 全域缺席 — `CONFIRMED`（零源码改动）

- **目的**：attempt 5 重开唯一未达合取（验收条款 4 特指 `http://100.111.111.88:3090`），
  并为该条款收集 live 实例自身的证据。工作树自 `91cad68`（`release/0.6.0`，与 origin 同步）
  零源码改动。
- **命令与结果（全部本机实跑）**：
  1. `npm run ci`（`91cad68`）→ **37 文件 / 650 测试 PASS**（23.37s；本轮自己的基线，
     不沿用上轮转录）。
  2. 认证边界复测：`curl http://127.0.0.1:3090/`、`http://localhost:3090/`、
     `http://100.111.111.88:3090/` → **三者均 HTTP 401**（无 loopback 豁免；`ss -tlnp`
     显示监听在 `100.111.111.88:3090` 与 `127.0.0.1:3090`）。按 AGENTS.md 不读取凭据 →
     浏览器级 live 观察对任何代理会话都不可行。
  3. `find /home/fish/dsh-layerfs -name team-engine.js` → **0 命中**：修复构建在 live
     harness 的整个 `DSH_HOME` 里不存在（比上轮「web profile node_modules 缺文件」更强）。
  4. **新证据（决定性）**：只读抽取 live 持久会话日志
     `/home/fish/dsh-layerfs/sessions/--home-fish-projects_mine-dsh-grok-workflow--/`
     （orchestrator 工作区）最新 14 个子会话的首个 `subagent/descriptor` label：**全部为
     `任务团队 child 15` … `任务团队 child 28`**（mtime 2026-11-08 01:20:22–04:13:07），
     **0 个描述性标签**。其中 `任务团队 child 28`（`88e59d33…`，04:13:07）就是 attempt 5
     自己的执行子代理——live 顶栏此刻正把本轮子代理显示成泛化名。面板→descriptor 映射
     已在 Round 32 用真 GUI 逐字验证（`entry.label ?? entry.id`），故该抽取即 live 面板
     实际渲染内容。摘录：
     `docs/knowledge/evidence/childname-fix-2026-11-08/live-descriptor-labels-2026-11-08.txt`。
  5. 上轮不确定项 #2（live 进程是否已载入 0.6.0）就此关闭：live 运行中代码**可观察地**
     不含 label 重写（描述符行为即证据），与启动时刻无关。
  6. 分支告警（`CONFIRMED`）：仓库默认分支 = `main` @ `1f9065d`（v0.6.0 合并）；
     `git log main..release/0.6.0` 含 `ad66118`+`91cad68` → live profile 的
     `github:free6589/dsh-grok-workflow` 依赖 + `pnpm update` **不会**取到修复；部署必须
     显式安装 `ad66118` 构建（HANDOFF 步骤为准）。
- **结论**：条款 4 特指 URL 合取仍未达，且**未达原因是 live 实例的部署状态，不是验证
  缺口**——今天即便有凭据做浏览器观察，`:3090` 上看到的也是缺陷本身（子代理显示
  `任务团队 child N`，如本轮自己的 child 28）。本机 GUI 验证已在 Round 31/32 用同一
  `dsh` 二进制（mise 安装，0.2.1-rc.2）真浏览器完成。live 部署+重启 = D-013 步骤 5，
  用户保留，`NOT_RUN`。
- 边界：全程只读（live 实例未碰）；无凭据读取；证据文件只含标签/uuid/mtime，无用户
  会话内容；无 tag/发布动作。

## Round 34 (2026-11-08, attempt 6/6 最终轮): 全量复验——结果与 Round 33 零变化；唯一未达合取仍是 live `:3090` 的部署状态（用户保留动作） — `CONFIRMED`（零源码改动）

- **目的**：attempt 6（最终轮）不重做已验证的修复，只独立复验全部在案事实并收口记忆。
  工作树自 `b2bf3a8`（`release/0.6.0`，与 origin 同步）零源码改动。
- **命令与结果（全部本机实跑，2026-11-08 04:24–04:32 +08:00）**：
  1. `npm run ci`（`b2bf3a8`；链条 `typecheck && lint && test`）→ 前置步干净，vitest
     **37 文件 / 650 测试 PASS**（23.30s，04:30:35 起），含 `test/team-engine.spec.ts`
     12 例。与 Round 33 基线一致。
  2. 认证边界：`curl http://127.0.0.1:3090/`、`http://localhost:3090/`、
     `http://100.111.111.88:3090/` → **三者均 HTTP 401**（`ss -tlnp`：监听在
     `100.111.111.88:3090` 与 `127.0.0.1:3090`）。按 AGENTS.md 不读凭据 → 浏览器级
     live 观察对代理会话不可行。
  3. `find /home/fish/dsh-layerfs -maxdepth 8 -name team-engine.js` → **0 命中**；
     live web profile 仍为 released `dsh-grok-workflow@0.6.0`（spec
     `github:free6589/dsh-grok-workflow`）→ 修复构建在 live home 全域缺席。
  4. live 持久面板数据复抽（同 Round 33 方法，最新 8 个子会话）：首个
     `subagent/descriptor` label 全部为 `任务团队 child 25` … `任务团队 child 32`
     （mtime 04:00:47–04:30:29），**0 个描述性**。attempt 6 自证：对最新 4 个日志
     grep 任务标记 `ATTEMPT: 6 of 6` → 命中 child 30/31/32，即**本轮自己的
     验证/执行子会话在 live 顶栏此刻显示为泛化名**。摘录：
     `evidence/childname-fix-2026-11-08/live-descriptor-labels-2026-11-08-r34.txt`。
  5. 远端拓扑更新（本轮新事实）：`git fetch` 后 `origin/main` = `3b1d9a8`（Merge
     PR #44 = 并发任务的 P1 lifecycle 修复 `4e8d1c3`），已从 `1f9065d` 前进；
     `git merge-base --is-ancestor ad66118 origin/main` → **NO** —— 修复仍不在 main，
     live profile 的 `pnpm update` 仍取不到修复，HANDOFF「显式安装 ad66118 构建」
     指引不变。双侧分叉 `CONFIRMED`（PR #44 大改 `src/run.ts`；`ad66118` 对
     `src/run.ts` 两处小改）→ 日后合并分支时该文件可能需手工调和（推断，未实测）。
  6. DSH core mise 安装 `lib/` mtime 仍为 2026-10-22 21:59（原始安装值）→ core 零改动。
  7. 载用证据复核：`evidence/childname-fix-2026-11-08/gui/hierarchy-result.json`
     （Round 32 真浏览器）6/6 描述性主标签、`bodyHasTeamChildPattern=false`；
     `CHANGELOG.md` 行 40 双语 `[Unreleased]` 条目在位。
- **结论**：六轮尝试收口。条款 2/3/5/6 满足且本轮独立复验；条款 1/4 的代码与单测侧
  满足（Round 31/32 同一二进制真机 + 真 GUI），唯一未达 = live `:3090` 实例的
  部署+重启（D-013 步骤 5，用户保留动作）：本会话沙箱 workspace-write 不能写
  `/home/fish/dsh-layerfs`，GUI 401 且禁读凭据，live 进程承载本工作流自身。
- 边界：全程只读（live 未碰）；无凭据读取；证据文件只含标签/uuid/mtime/标记计数；
  无 tag/发布动作；未改 main。

## Round 35 (2026-11-08): 设置保存后子代理仍用旧模型 —— 网关把开机快照传给 run（已修复，`CONFIRMED`）

- **触发**：用户报告设置页把 `roles.worker` 第一名保存为 `wb/cn:deepseek-v4.1-flash`
  （revision 21、无红字、补丁文件该行确实正确），但新会话（`session-3884b55e…`、
  `session-00fca25f…`）的每个执行子代理仍在点 `wb/global:deepseek-v4.1-flash` →
  `wb/global:deepseek-v4.1-flash-sg` → `agent2api/autoclaw/glm-5.3-flash`，
  规划子代理用的是 `wb/cn:mimo-v2.6-pro`（补丁里 planner 是 muse-spark）。
- **根因（源码级 `CONFIRMED`）**：`src/gate.ts` 的 `installGate()` 解构出**开机时**的
  `deps.config`；`safe()`（实时）只用于分类、历史/排队上限，而 `runTeam()` 里的
  `runWorkflow({ ctx, config, … })` 与两处 `runSingleCall({ ctx, config, … })`
  （triage-classifier、quick-worker）传的都是那个开机快照。于是「设置保存 → 持有值更新」
  只影响准入判定，永远到不了子代理 —— 与用户现象完全一致。工具入口 `src/index.ts` 传的是
  `config: live`，两个入口因此行为不一致。
- **修复**：三处改为 `config: limits`（= `safe()` 的实时快照）。
- **确定性复现（负向对照，`CONFIRMED`）**：
  1. 隔离副本 `out/livefix`（`git archive HEAD` 干净导出 + node_modules 软链）。
  2. `test/reliability.spec.ts` 新增「uses the live roles chain for a gated run, not the
     load-time snapshot」：`roles` 以持有值注入，装载后把 worker 改成
     `wb/cn:deepseek-v4.1-flash` 再发消息，断言引擎收到的 `args.roles.worker[0].model`。
  3. 去掉修复跑该用例 → **FAIL**：`expected 'old-model' to be 'wb/cn:deepseek-v4.1-flash'`。
     装上修复 → **PASS**。
  4. 全量：`npx vitest run` → **37 文件 / 651 测试 PASS**；`tsc --noEmit` 干净。
- **提交**：`5b0e3df`（`src/gate.ts` 3 行 + 回归用例 + `lib/gate.js`/`.map` 重建）。
- **部署（用户保留动作，`NOT_RUN`）**：修复构建已写入
  `/home/fish/dsh-layerfs/profiles/web/node_modules/dsh-grok-workflow/lib/gate.js`
  （原文件已备份为 `gate.js.bak-before-livefix-<ts>`）。但 loader 用普通动态 `import()`
  （`cordis-plugin-loader/lib/index.js:214`，无 cache-bust），运行中的 `:3090` 仍持有旧模块，
  需重启该实例才会加载新代码。本轮未重启（用户明令禁止）。

## Round 36 (2026-11-08): B 方案 —— `full` 模式也说人话，机器台账按需显示（`CONFIRMED`，`61c3ac9`）

- **触发**：用户对 `session-00fca25f…`（`COMPLETED`）的判词是「你说这个是人话，但在我眼里不像人话」。
  核对源码确认这不是读错了报告，而是设计使然：`full` 模式（`/grok on`）在 `produceAnswer`
  里直接 `return runTeam(...)`，绕开了 triage 分支里唯一拼 `humanSummary` 的那段；同时
  `src/answer.ts` 的 `SUCCESS_PREAMBLE` 明令主模型「add no commentary … do not summarise it」，
  于是用户拿到的只能是 `Grok workflow:` / `Model routes:` / `Deadline:` / `Route switches:`
  这一串台账。
- **改动（用户明确选择「B」）：**
  1. `src/gate.ts` `runTeam`：`completed`/`partial` 时拼与 triage 同款的
     `【人话结论】任务 N/M 项已核验通过。…`，语言由 `detectLanguage(request)` 决定；
     `failed` 绝不拼（失败不得套成功口吻）。报告正文不变，只多一个 `header`。
  2. `src/answer.ts`：`SUCCESS_PREAMBLE` 改为「可先给最多 3 句人话，再原样贴 markers 内全文」；
     `FAILURE_PREAMBLE` 保持如实、禁止谎报成功；markers 结构不变。
  3. `src/report.ts`：`renderReport(report, { showDiagnostics })`，新配置
     `showDiagnostics`（默认 `false`）控制 `Model routes` / `Deadline` / `Route switches` /
     `Route overflows` / `Errors`。**`Uncertainties` 刻意留在开关之外**：它是给读者的诚实限定语，
     且 `src/carryover.ts` 的 `parseReportRound` 要从上一轮渲染文本里解析 `Uncertainties:`，
     一起藏掉会静默丢掉追问上下文——这一条由 `test/carryover.spec.ts` 的既有用例反向钉住
     （藏进去就 FAIL，`expected '' to contain 'only measured on one host'`）。
  4. `src/index.ts`：工具 `render` 在渲染时读 `readConfig().showDiagnostics`（读失败降级为隐藏，
     不让渲染异常吞掉已产出的报告）。
  5. `src/client/index.js`：设置页新增「机器台账 / Machine diagnostics」开关 + 中英文案，
     文案写明「不确定项始终保留」。
- **测试**：`tsc -p tsconfig.json --noEmit` → 0 错误；`npx vitest run` → **37 文件 / 655 测试 PASS**
  （= Round 35 的 651 + 本轮新增 4：`test/gate.spec.ts` 三条〔full 有 header / failed 无 header /
  `humanSummary:false` 抑制〕+ `test/report.spec.ts` 一条〔默认视图不含台账〕）。
  既有台账断言改为显式索取 `{ showDiagnostics: true }`；`test/settings-projection.spec.ts` 与
  `test/config.spec.ts` 的 volatile 字段数 27 → 28。`npm run lint` → 4 warnings / 0 errors
  （均为既有，含 `src/run.ts` 未使用的 `RoleName`）。
- **过程事实（不掩盖）**：执行子代理 `impl-b` 中途失联（background subagent failed），
  其改动先落在 stash `temp-gate-fix`；随后它自身的提交 `ef29e9b` 把 humanSummary 段当作
  「误入的无关 hunk」删除。本轮在 `61c3ac9` 里按用户决定重新加回并以测试钉死，
  故 `ef29e9b` 的删除已被覆盖。
- **部署（用户保留动作，`NOT_RUN`）**：`:3090` 未重启、live profile 未由本轮改动。

## Round 37 (2026-11-08): v0.7.0 发布 —— 合 main、打 tag、Release 全绿（`CONFIRMED`）

- **发布对象**：`v0.7.0` → commit `146dce7`（`main` 上）；annotated tag 对象 `3b96b16`
  （`git ls-remote --tags origin v0.7.0`）。
- **前置合并（有冲突，已解）**：`origin/main` 已前进到 `3b1d9a8`（PR #44，lifecycle/cancellation/
  startup-deadline 修复），与本分支在 `src/run.ts` 的启动段冲突（`git merge-tree --write-tree`
  预览确认，随后 `git merge origin/main` 实测两人冲突块）。解决口径：**保留 main 的启动 deadline race**
  （`start()` 不 settle 也不再挂死调用方；迟到的 run 会被 cancel+dispose），同时把两条入口的
  `ctx.workflowEngine.start(start)` 换成 `teamWorkflowEngine(ctx, logger).start(start)`，保住子代理
  的描述性显示名（`ad66118`）。`lib/` 不手改，删冲突产物后用 `npm run build` 重新生成。
- **合并后实测**：`tsc -p tsconfig.json --noEmit` → 0 错误；`npx vitest run` → **37 文件 / 660 测试
  PASS**（比 Round 36 的 655 多 5 个，来自 main 侧新增用例）。
- **发布准备**：`package.json` + `package-lock.json` 同步升到 `0.7.0`（脚本改写，diff 仅 3 行，
  无格式化噪声）；`CHANGELOG.md` 的 `[Unreleased]` 提升为 `## [0.7.0] - 2026-11-08`（98 行，
  远超发布工作流要求的 4 行），并在其上保留新的空 `[Unreleased]`。
- **发布前本机 CI**：`npm run ci` → typecheck 0 错误、lint 4 warnings/0 错误、37 文件 / 660 测试
  PASS、`git diff --exit-code -- lib/` 干净（构建可复现）。`main` 上再跑一次 `npm run ci` 同样 PASS。
- **推送与发布**：`release/0.6.0` → `146dce7`（`f222238..146dce7`）；`main` → `146dce7`
  （`3b1d9a8..146dce7`，release 分支已吸收 main，故为快进）；`git push origin v0.7.0` 新建 tag。
  GitHub Actions：CI `42474712526` **success**；Release `42474831253` **success**（43 s）。
- **产物（`gh release view` 实测）**：`Grok Workflow for DSH v0.7.0`，`publishedAt`
  `2026-11-08T11:14:41Z`，asset `dsh-grok-workflow-0.7.0.tgz` **317,470 B**，
  sha256 `de443167858b7df25d81576288c2c9521da1256e8ad8004c6a9575eaecf4a3ec`。
- **未做（`NOT_RUN`）**：live `:3090` 未重启、live 安装副本未由本轮改动（沙箱只读，见 Round 36 尾注）。

## Round 38 (2026-11-15) — wave1+wave2 收尾验证：`ci` 48/897 PASS、H1 安装+加载+前台 PASS、团队档 `BLOCKED`、H2 进度 Tab 真机 14 帧（`CONFIRMED`）

本轮只做验证与记忆落盘：**零 `src/`/`lib/`/`test/` 改动**，未 commit、未 bump、未 push。
两条独立证据线（组 H1 / 组 H2）各自建目录、各自收尾清理：

- `docs/knowledge/evidence/verify-H1/` —— 安装、加载、前台交互、模型边界
- `docs/knowledge/evidence/progress-tab-2026-11-15/` —— 进度 Tab 真机 GUI（14 帧）

### 环境（`CONFIRMED`）

```text
host omarchy · node v26.8.1 · npm 11.19.0 · dsh 0.2.2-rc.3
CWD /home/fish/projects_mine/dsh-grok-workflow
GIT ee5e013（工作树 dirty：81 文件 / +7014 / −534，wave1+wave2 未提交）
```

### 1. 回归快照

```text
$ npm run ci
> tsc -p tsconfig.json --noEmit      → exit 0（无输出）
> oxlint src test                    → Found 4 warnings and 0 errors
> npm run build                      → client bundle: 186091 bytes → lib/client.js
> vitest run                         → Test Files 48 passed (48) / Tests 897 passed (897)
EXIT=0   START 2026-11-15T02:43:42+08:00   END 2026-11-15T02:44:22+08:00（40 s）
```

- `lib-sync.txt`：再跑一次 `npm run build`，`git status --short lib` 的 md5 不变；`src/client/index.js`
  与 `lib/client.js` 同 md5。**50 个 `lib/` 条目相对 `HEAD` 是改动状态（46 修改 + 4 新增
  `progress-tab.*`），这是 wave1+wave2 未提交的预期，不是漂移。**
- `pack.txt`：`npm pack --dry-run --json` → `dsh-grok-workflow-0.8.0.tgz`（按工作树 `package.json`
  的旧值打包时点）、82 条，含 `lib/client.js` 与 `cordis.patch.yml`，不含 `docs/knowledge/**`。

### 2. H1 — 安装 / 加载（`CONFIRMED`）

```text
$ DSH_HOME=$PWD/.verify-gw/home dsh --profile gwverify --from-default-profile web --dump-config
$ DSH_HOME=$PWD/.verify-gw/home dsh plugin --profile gwverify add "$PWD"
→ exit 0；pnpm 写入 dsh-grok-workflow link:../../../..；node_modules/dsh-grok-workflow → 仓库
→ dsh.profile.bundles = 3 条（profile-bundles.json）
同一命令在 gwverify-hl（headless 模板）重复 → exit 0，3 条 bundle
```

```text
启用态 boot stdout（boot-enabled.txt）：只有一行 dsh web: http://127.0.0.1:3413/?token=<redacted>
对照 --patch 关掉 workflow-ptc（boot-control-workflow-ptc-disabled.txt）：
  dsh: warning: 1 entry did not activate
  grok-workflow (dsh-grok-workflow): pending (waiting for service: workflowEngine)
```

活实例（`http://127.0.0.1:3411`，隔离 home，真 `dsh`）：

```text
POST /api/settings/describe（RPC envelope {type:"client-request",rpcId,method,payload:{args:{}}}）
→ 23 个命名空间，其中 grok-workflow：autoGenerate=true、applies=live、28 projected fields、无 secret 槽
  （settings-describe.txt）
首页引用 dsh-grok-workflow/client.js（在 /plugins/??… 批里），取回字节 = lib/client.js + sourceMappingURL
  （client-bundle-serving.txt）
真实会话出站请求的工具表：requests=7、tools=24、includes grok_workflow=True（mock-boundary.txt）
```

### 3. H1 — 交互（前台 `PASS`；团队档 `BLOCKED`）

```text
$ DSH_HOME=.verify-gw/home dsh --profile gwverify-hl --patch mock.patch.yml "你好"
→ exit 0；stdout（插件自己产出）：
  档位：直答档 — 因为：这是问候/寒暄，没有要做的事，前台直接回答。

  你好！我在。要做事就直接说：简单的我派一个工人，复杂的我开团队，拿不准我会先问你一句。

  （这条没有动用团队，前台直答。）
→ 同一裁决写进会话日志：session-dcf8b852-b28b-4221-a921-fa953e40b9a5，event user/message seq 12
  （front-desk-relay-message.txt）
```

```text
$ DSH_HOME=.verify-gw/home dsh --profile gwverify-hl --patch mock.patch.yml "用团队跑一个小任务：…"
→ exit 0，run FAILED：
  Grok workflow: FAILED
  task-1: failed (2 attempts) — worker failed on every route: [format-error]
          child returned no valid structured result
（interact-team-tier.txt；档位行 = 档位：团队档 — 因为：你的消息里点名了团队，直接升级为团队档。）
```

**该 FAILED 是 mock 模型的性质，不是产品结论**：本轮 mock 只替换了模型 HTTP 端点，Loader、
服务注册表、插件生命周期、gate、workflow engine、子代理派生都是真的。真模型路径：

```text
$ DSH_HOME=.verify-gw/home dsh --profile gwverify-hl --patch .verify-gw/model.patch.yml \
    "Reply with exactly: MODEL_OK"
EXIT=1
stderr: dsh: TIMEOUT: Request timed out.: Connect Timeout Error
        (attempted address: models.fyrali.com:443, timeout: 10000ms) (UND_ERR_CONNECT_TIMEOUT)

getent hosts models.fyrali.com -> 100.111.111.99
tailscale status: 100.111.111.99 bifrost active; relay "sin", tx 10764 rx 0
ping 100.111.111.99: 2 packets transmitted, 0 received, 100% packet loss
TCP probe 80/443/3000/3065/8000/8080/8888/9000/11434/4000 on 100.111.111.99: all closed/timeout
备选 http://127.0.0.1:3065/v1 (agent2api)：/v1/models 有列表，
  POST /v1/chat/completions -> HTTP 401 model_api_key_required
  （取网关 key 需读用户凭据库 → AGENTS.md 禁止，故不取）
```

→ **真模型团队档 = `BLOCKED`（成因 `100.111.111.99` 不可达）**。全 bundle 没有任何伪造 PASS。

### 4. H1 — `engines.dsh`（B01）行为实测

```text
app-boot (== dsh runtime) version: 0.2.2-rc.3
plugin engines.dsh: >=0.2.1-rc.2 <0.3.0     plugin version: 0.8.0
verdict on the real runtime: null            ← 无未满足要求、无需版本豁免
runtime 0.2.1-rc.2 → compatible
runtime 0.2.2-rc.3 → compatible
runtime 0.2.2     → compatible
runtime 0.3.0-rc.1 → compatible             ← 上界不 fence rc
control engines.dsh="<0.2.0" → REFUSED {"engines.dsh":"<0.2.0"}
  + 完整不兼容警告原文（含 allow-version 提示）
```

原因（`CONFIRMED`，源码）：DSH 用 `semver.satisfies(runtime, range, { includePrerelease: true })`
判区间（`dsh-app-boot/lib/index.js`），prerelease 的 `0.3.0-rc.*` 仍排在 `0.3.0` 之下，故放行。

### 5. H2 — 进度 Tab 真机（14 帧，`CONFIRMED`）

实例：`dsh web` `127.0.0.1:3210`，`DSH_HOME=<repo>/.dsh-home`，profile `gwprog`（自 `web` 模板），
插件 = 本目录打包产物（`cmp` 校验：`lib/client.js` / `lib/progress-tab.js` 与工作树逐字节一致），
模型 = `127.0.0.1:18088` 真网关 `wb/cn:deepseek-v4.1-flash`，浏览器 = `/usr/bin/chromium` +
Playwright headless 1440×900 / 480×900。**无 mock**。收尾：`PORT_3210_CLOSED` / `TOKEN_LOG_REMOVED`。

```text
stage-a  A2_TABS=[{"Chat","selected":"true"},{"Trajectory"},{"Progress"}]  A2_TAB_COUNT=3
         A4_PROGRESS_DOM={"emptyText":"No workflow progress in this session yet…","nodeCount":0,…}
stage-b  TIMELINE  +0s 0/1·0%（Start:done, 规划:doing, End:doing, 5 模板阶段 pending）
                   +4s 1/2·50%    +21s 2/3·67%    +55s 3/3·100%
stage-c  DETAIL_HEADINGS=["Engine facts","Stage report"]  DETAIL_FIELD_COUNT=7
         DETAIL_SOURCES=["Source: not reported" ×7]
         NARROW_DETAIL_CSS={"position":"fixed","bottom":"0px",…,"fieldColumns":"450px","viewport":{"w":480,"h":900}}
         DARK_PROBE={"dark":true,"bodyBg":"rgb(21, 21, 23)","ringColors":["rgb(34, 197, 94)","rgb(84, 85, 87)",…]}
stage-d  CHAT_HAS_TASK=true CHAT_HAS_REPORT=true CHAT_HAS_TOGGLE_ON=true CHAT_HAS_CRASH_TEXT=false
         TRAJ_LEN=6132 TRAJ_HAS_EVENTS=true TRAJ_HAS_WORKFLOW=true
         DETAIL_BUTTONS=[Close(false), Open child session(false), Copy coordination block(true)]
stage-e  FINAL_STATES=["done","pending","cancelled"]
         FINAL_NODES=[Start:done, 6×pending, 规划:cancelled, …, End:cancelled]
         FINAL_PERCENT="1/1 · 100%"    GROK_ON=true
```

状态覆盖：`pending` / `doing` / `done` / `cancelled` = 真机 `CONFIRMED`（截图 `01`-`14`）；
`blocked` / `failed` = **真机 `NOT_RUN`**（无真实触发条件，不伪造），由单元补充：

```text
$ npx vitest run test/progress-tab.spec.ts test/client.spec.ts
 ✓ test/client.spec.ts (71 tests)  ✓ test/progress-tab.spec.ts (22 tests)
 Test Files 2 passed (2) / Tests 93 passed (93)   Duration 508ms
```

### 6. 真机发现的安装形态限制（现象 `CONFIRMED`，归因 `HYPOTHESIS`）

```text
link: 安装的实例里 /grok on →
  Failed
  grok
  Grok workflow toggle not changed: Receiver must be an instance of class Session.
  In this session no toggle was recorded.
（probes/probe-after-grok-on.png / probe-trajectory.png）

同一仓库改用它自己的打包产物安装 → 同一条命令：
  Grok workflow ON — every message now runs the full plan→execute→verify workflow.
（probes/probe-grok-on-existing.png；stage-e.log.txt GROK_ON=true）
```

归因未插桩：`HYPOTHESIS` = `link:` 时解析到工作树 `node_modules/@deepseek-ai/dsh-session`
0.2.1-rc.2（devDependencies），运行时是 0.2.2-rc.3，跨副本 brand check 抛错；打包 profile 里
没有第二份。**结论只用于流程**：真机验证 `/grok` 开关一律用打包产物，不用 `link:`。

另记 `CONFIRMED`：尚无会话的首页里发 `/grok on` 不执行，需先有一条普通消息建会话。

### 7. 本轮未做（`NOT_RUN` / `BLOCKED`）

- `BLOCKED`：真模型团队档端到端（含答案质量对比）。
- `NOT_RUN`：进度 Tab 的 `blocked`/`failed` 真机触发；live `:3080`/`:3086`/`:3090` 的部署与重启；
  单元测试之外的压力/长跑。
- 未提交、未打 tag、未 bump（版本由 V 组做）；写面仅限记忆文件 + `CHANGELOG` 的 `[Unreleased]`。

## Round 39 (2026-11-15) — v0.9.2 准备：B01/B02/B04 + 进度 Tab 脊椎/详情/连线；全量 934 中 2 条基线既有失败（`CONFIRMED`）

**性质**：收尾组 agent-26 的验证轮，**零源码改动**（只读源码 + 跑命令 + 写记忆）。
基线 `main` = `4b92278`（`HEAD` = `origin/main`）。工作树带上一轮未提交改动：
`src/` 4 文件（`config.ts`、`index.ts`、`progress-tab.ts`、`client/index.js`）、`test/` 3 文件、
`lib/` 12 个产物，未跟踪 `test/progress-connector.spec.ts` 与
`docs/knowledge/evidence/progress-tab-2026-11-15/Round2/`。

**发布状态**：CHANGELOG / 版本号 / commit / push / tag / Issue 全部 **HOLD**（用户 2026-11-15 指令，
经 lead 下达；成因是 Round2 `05` 截图里的报告太机器）。本节因此**不是发布记录**。

### 1. 环境与隔离

| 项 | 值 |
| --- | --- |
| Host | local Linux workspace（omarchy） |
| Node / npm | `v26.8.1` / `11.19.0` |
| DSH CLI | `0.2.2-rc.3` |
| `TMPDIR` | `<repo>/.tmp`（harness 的 `/tmp` 配额 `EDQUOT`，见 STATE） |
| harness 限制 | bash/glob/grep 工具 UNKNOWN 失败 → 全部命令经 Serena MCP shell 执行 |
| 基线对照 worktree | `.dsh-home/baseline-wt`（`git worktree add … 4b92278`，gitignored） |

### 2. 构建幂等与产物身份（`CONFIRMED`）

```text
$ export TMPDIR=$PWD/.tmp && npm run build
> tsc -p tsconfig.build.json && node scripts/build-client.mjs
client bundle: 204585 bytes → lib/client.js
BUILD_RC=0
LIB_UNCHANGED_BY_BUILD          # 构建前后 67 个 lib/*.js|*.d.ts 的 sha256 全等
CLIENT_MATCH                    # cmp lib/client.js src/client/index.js → 一致
```

### 3. 全量 `npm run ci`（`CONFIRMED`，命令原文与结果）

```text
$ TMPDIR=$PWD/.tmp npm run ci
> npm run typecheck && npm run lint && npm test
typecheck: tsc -p tsconfig.json --noEmit            → 0 errors
lint:      oxlint src test                          → Found 4 warnings and 0 errors.
           （4 条均为既有：src/run.ts RoleName 未用、src/redact.ts 多余转义、
             src/client/index.js GROUPS_WITH_FIELDS 未用、src/client/index.js field 未用）
build:     client bundle 204585 bytes → lib/client.js
vitest:    Test Files  1 failed | 49 passed (50)
           Tests       2 failed | 932 passed (934)
           Duration    52.59s
CI_RC=1
```

失败项全部在 `test/gate.spec.ts`（本轮未改 `src/gate.ts`）：

```text
× refuses a message explicitly when the queue is full and never retries it on its own
× writes the answer into the session when the append strategy is selected
```

### 4. 基线对照（`CONFIRMED`）——两条失败在 `4b92278` 上同样失败

```text
$ git worktree add .dsh-home/baseline-wt 4b92278
$ cd .dsh-home/baseline-wt && TMPDIR=<repo>/.tmp npx vitest run test/gate.spec.ts
 × refuses a message explicitly when the queue is full and never retries it on its own 1070ms
 × writes the answer into the session when the append strategy is selected 55ms
 Test Files  1 failed (1)
      Tests  2 failed | 53 passed (55)
```

同一条 spec 在**本轮工作树**上单跑：

```text
$ cd <repo> && TMPDIR=$PWD/.tmp npx vitest run test/gate.spec.ts
 × refuses a message explicitly when the queue is full and never retries it on its own 1074ms
 Test Files  1 failed (1)
      Tests  1 failed | 54 passed (55)
```

即：①`queue is full` 那条**稳定失败**（工作树与基线都失败）；②`append strategy` 那条
**基线失败、工作树单跑偶过、全量跑失败**——形态上是既有失败 + 时序敏感，不是本轮引入。
边界：本轮只证明"与基线同形"，**未定位根因、未修**。发版前是否连带处理由 agent-27 / 用户决定；
在此之前 934 全绿**不成立**，写"PASS"会是假话。

### 5. 真机 Round2（H2 进度 Tab + 安装/加载半边）— 引证，不是本轮自跑

本轮**没有**重跑真机（真机由 L2 组完成，证据已落盘，我只核对了目录内容与 README 的结论行）：

- 目录：`docs/knowledge/evidence/progress-tab-2026-11-15/Round2/`（13 PNG、5 份 stage 日志、
  `MANIFEST.sha256`、`run-state.json`）。
- 实例：`http://127.0.0.1:3221`，`DSH_HOME=<repo>/.dsh-home/r2`，profile `gwprog2`，
  插件装打包产物 `dsh-grok-workflow-0.9.1.tgz`（sha256 `ac51b89a…`），模型 `127.0.0.1:18088`
  的 `wb/cn:deepseek-v4.1-flash`，headless Chromium 1440×900 / 480×900。
- 真机四态：`pending` / `doing` / `done` / `failed` = `CONFIRMED`（`failed` 是真实沙箱边界那一次，
  `End:failed`，人话结论如实写"没做成"）；`blocked` / `cancelled` 本轮 `NOT_TRIGGERED`。
- 产物身份半条：`npm run build` 前后 `lib/` 哈希全等 + `cmp` 三者一致（工作树 ↔ profile 安装副本），
  与本节 §2 的本轮复跑结果一致。
- 安装/加载/前台半边的 Round1 证据仍是 `docs/knowledge/evidence/verify-H1/`（含"关掉
  `workflow-ptc` → `pending (waiting for service: workflowEngine)`"的对照），本轮未复跑，
  **不冒充本轮结果**。

### 6. 用户报告的"机器味"（`CONFIRMED`，截图 `Round2/05-chat-with-run-report.png`）

用户看到的那条会话消息，逐字含（我读了截图核对，不是转述别人的话）：

- 首行 `Grok workflow: COMPLETED Objective: Conversation so far (context only): User: 你好，只打个招呼，
  不要做任何事。 User: <system-reminder> The following information describes your current session: …`
  —— 把 objective 原文和注入的 `<system-reminder>` 一起端给读者；
- 六条任务 bullet，每条都是 shell 输出原文：`文件 … 存在且为普通文件 - stat -c %F %s bytes %n
  r2-todos.md output 'regular file 111 bytes r2-todos.md'`、`wc -l -> 3`、`python 校验`、
  `od -c 显示每行以 '·'（横线加空格，八进制 055 040）之后的 UTF-8 中文字节）起始`、
  `md5 a64a6f17a1c4c6b1fe39b8a1a8115982`、`find -mindepth 1 -maxdepth 1 -> 仅 'r2-todos.md'`；
- 结尾 `<<<END-GROK-WORKFLOW-REPORT>>>` 机器 marker；整条消息计 **18.6K token**。

**判定（`CONFIRMED`）**：这版 relay/in-turn 的出站默认是"证据全集"，人话结论即使存在也被机器块
盖住；对非技术读者不可读。**要求（用户，经 lead 下达）**：默认只发 human 块 + 下一步，机器证据
默认收进 Progress 详情 / 诊断开关（`showDiagnostics` 一类），不再 verbatim 全贴。该改动归 agent-27，
本节只记录证据与判据，**未实现、未验证**（`NOT_RUN`）。

### 7. 本轮未做（`NOT_RUN` / HOLD）

- CHANGELOG 条目、`package.json`/`package-lock.json` bump、commit、push、tag、Issue 评论：**HOLD**
  （用户指令，等人话报告改动回齐）。因此 `package.json` 仍是 `0.9.1`，`CHANGELOG.md` 工作树未改。
- 两条 `gate.spec` 失败的根因定位与修复：`NOT_RUN`（不在收尾组写面，`src/gate.ts` 归 agent-27）。
- `blocked` / `cancelled` 的真机补充：`NOT_RUN`。
- live `:3080` / `:3086` / `:3090` 的部署与重启：`NOT_RUN`（D-013，用户保留动作）。

## Round 40 (2026-11-15) — v0.9.2 收尾发版：两条基线既有失败按最小改法修同步、全量 948 全 PASS、本地提交 `5eb4942`（push/tag HOLD）

**性质**：收尾发版组 agent-30 的发版准备轮。基线 `main` = `4b92278`（= `origin/main`）。
**本地提交 `5eb4942`**（`release: prepare v0.9.2 …`）。**未 push、未打 tag、未发 Release、未动 Issue**
（lead 2026-11-15 (B) 口径）。写面：`test/gate.spec.ts`（仅等待条件）、`CHANGELOG.md`、`package.json`
+ `package-lock.json`、四个记忆文件；不碰 `src/` 产品代码。

### 1. 环境

| 项 | 值 |
| --- | --- |
| Host / Node / npm | 本机 omarchy / `v26.8.1` / `11.19.0` |
| vitest | `4.1.12`（`package-lock.json` 亦为 `4.1.12`） |
| `TMPDIR` | `<repo>/.tmp`（harness 的 `/tmp` 配额 `EDQUOT`） |
| harness | bash/glob/grep 工具不可用 → 全部命令经 Serena MCP shell |
| 基线对照 worktree | `.dsh-home/baseline-wt`（`4b92278`，gitignored） |

### 2. 两条失败：根因与改法（`CONFIRMED`，测试侧竞态，非产品缺陷）

先用一次性 DBG 探针（临时 `test/zz-dbg.spec.ts`，跑完删）把时序摊开：在第一条消息受理、
`complete(report())` 之后 **100 ms** 尺度上 `engine.startCalls` 确实到 2，而原用例的 5 ms 尺度上
第二次派发又被判队列满——即失败来自**用例等错了条件**，不是 run 起不来。

| 用例 | 原等待条件 | 为什么已经满足 | 改成 |
| --- | --- | --- | --- |
| `refuses a message explicitly when the queue is full and never retries it on its own` | `agent.followups.length >= 1` | 队列满**通知**投递后即满足（当时 followups=1），而首个 run 的答复还没到 → 5 ms 后重发时队列仍 `queued=1`，再次 `queue-full` | `>= 2`（通知 + 该 run 自己的答复） |
| `writes the answer into the session when the append strategy is selected` | `session.appends.length >= 2` | `[user/message, tool-workflow/run-start]` 即满足 → 断言早于 `assistant/message` 落盘 | `session.appends.some(a => a.type === 'assistant/message')` |

基线对照（`CONFIRMED`，独立 worktree）：

```text
$ cd .dsh-home/baseline-wt            # HEAD = 4b92278（v0.9.1 发布记录）
$ TMPDIR=<repo>/.tmp npx vitest run test/gate.spec.ts
 × refuses a message explicitly when the queue is full and never retries it on its own 1070ms
 × writes the answer into the session when the append strategy is selected 54ms
 Test Files  1 failed (1)
      Tests  2 failed | 53 passed (55)
```

即两条在 `4b92278` 上同样红。**同一提交在 GitHub CI 的 Node 22/24 上是绿的**（main 上
`43666296089` success，CI 跑 `npm test`），所以这是**本机时序敏感**，不是「CI 带红发版」——
措辞按此写，不夸大。改完：

```text
$ TMPDIR=$PWD/.tmp npx vitest run test/gate.spec.ts
 Test Files  1 passed (1)
      Tests  55 passed (55)
```

### 3. 全量 `npm run ci`（`CONFIRMED`，命令与结果）

```text
$ TMPDIR=$PWD/.tmp npm run ci
typecheck: tsc -p tsconfig.json --noEmit   → 0 errors
lint:      oxlint src test                 → Found 5 warnings and 0 errors
           （4 条既有：src/redact.ts 多余转义、src/client/index.js GROUPS_WITH_FIELDS、同文件 field、
             src/run.ts RoleName；新增 1 条：src/delivery/index.ts:264 no-useless-escape）
build:     client bundle 204585 bytes → lib/client.js
vitest:    Test Files  51 passed (51)
           Tests       948 passed (948)
```

### 4. 构建幂等与产物身份（`CONFIRMED`）

```text
$ before=$(find lib -type f \( -name '*.js' -o -name '*.d.ts' \) | sort | xargs sha256sum | sha256sum)
$ npm run build          # client bundle: 204585 bytes → lib/client.js
$ after =$(…同上…)
BEFORE=db64c890de347250260a1fb56ba51221474179fa2809d1b4e7b1146217de9c80
AFTER =db64c890de347250260a1fb56ba51221474179fa2809d1b4e7b1146217de9c80   → LIB_IDEMPOTENT=PASS
$ cmp lib/client.js src/client/index.js                                   → CLIENT_MATCH=PASS
```

`lib/` 已随 `5eb4942` 一起提交（Release workflow 的 `git diff --exit-code -- lib/` 与
「无未跟踪构建产物」两步的本地对应检查通过：暂存后 `git status --porcelain -- lib/` 为空）。

### 5. 提交内容与版本（`CONFIRMED`）

```text
$ git log --oneline -3
5eb4942 release: prepare v0.9.2 (human-first report, one clamp table, progress tab spine/detail/connector)
4b92278 docs(memory): v0.9.1 release record (stored limit clamp, user enable fix)
$ node -p "require('./package.json').version"        → 0.9.2
$ node -e "…package-lock…"                           → lock.version=0.9.2, packages[""].version=0.9.2
$ grep -n '^## ' CHANGELOG.md | head -3               → ## [0.9.2] - 2026-11-15 / ## [0.9.1] …
```

`CHANGELOG.md` 的 `[0.9.2]` 节 94 行：`### Added / 新增`（人话优先）+ `### Fixed / 修复`（存量钳制、
B02/B04 一张钳制表与一条告警、B01 横幅读用户层、进度 Tab 三条）+ `### Tests / 测试`（两条同步修复）。
Release workflow 要求「该节存在且 ≥4 行」这一条在本地按其脚本逻辑核对通过（节头精确匹配 `[0.9.2]`）。
**`[0.9.2]` 不写 layerfs 条目**：见 §7。

### 6. 放行的真实缺口：human-only 默认形态的真机复拍（`NOT_RUN`）

我在全树核过证据 mtime：最新真机证据是 `evidence/progress-tab-2026-11-15/Round2/`（11-15 11:44–12:09），
**早于** agent-27 的人话默认化改动，`05-chat-with-run-report.png` 正是用户点名「太机器」的那张。
因此「改后的人话默认形态」在真机上**没有任何截图或日志**，本项 `NOT_RUN`。需补图/补证的清单（交给
截图组，逐张都要能回指本轮提交 `5eb4942` 的构件）：

1. 三 Tab 共存且默认落对话（改后构建）；
2. 团队档一趟跑完后的**默认**入站消息：**只有人话块 + 下一步**，无 `stat -c` / `od` / `sha256` /
   绝对路径 / `<<<END-GROK-WORKFLOW-REPORT>>>`（这一张是用户点名的那张的对照）；
3. 同一会话里 `showDiagnostics` 关/开对照两张（关：台账不在标记内；开：台账回到标记内）；
4. ≤480 px 窄屏 + 深色主题下的同一条消息（人话块不被截断、不被 composer 遮住）；
5. 回归：对话 / 轨迹 / 进度三 Tab 各一张，含已完成行可点开子会话；
6. 机器可核对的旁证：`run-state.json` 形态的会话事件摘录，证明第 2 张里那条消息的正文确实落在
   结束标记之后（内部块）而不是人话块里。

### 7. layerfs 借鉴评估（`CONFIRMED` = 只读评估；`NOT_RUN` = 移植/真机）

agent-28（UI）与 agent-29（多 Agent）对 `/home/fish/projects_mine/layerfs` 做**只读评估**（本地检出
`87bd986`；LayerFS 的 UI = `dsh/packages`，多 Agent 面 = `dsh/scenarios/*` + `core/crates/*`）。
UI：8 条可借鉴 / 9 条不可搬；多 Agent：8 条可借鉴 / 7 条不可搬（逐条与理由见 D-049）。
**本轮零用户可见落地**：进度 Tab 的 `var(--dsw-alias-*)` token 色、≤480 px 抽屉、百分比空态
`data-progress-percent="none"` + `aria-live`、交付层人话块都是 **v0.9.0 既有实现**，无法证明是照
layerfs 搬的，故不写进 `CHANGELOG`（lead 口径：不冒认）。移植本身 `NOT_RUN`：没有一行代码来自
layerfs，也没有在 layerfs 侧做过任何改动（其检出仍是 `M core/crates/layerfs-store-service/src/install.rs`
等既有本地改动，与本仓库无关）。

### 8. 本轮 `NOT_RUN` / HOLD 汇总

- `push origin main`、`tag v0.9.2`、GitHub Release、Issue #1 评论：**HOLD**（lead (B) 口径，等 §6 截图）。
  因此远端 `origin/main` 仍是 `4b92278`，`git ls-remote --tags origin` 无需复核（本轮未产生新 tag），
  旧 tag（`v0.9.1` → `9103280`）未被触碰。
- §6 的真机复拍：`NOT_RUN`（新派截图组）。
- live `:3080` / `:3086` / `:3090` 部署与重启：`NOT_RUN`（D-013，用户保留动作）。


## Round 41 (2026-11-15) — v0.9.2 发布闭环：push / CI / tag / Release / Issue #1（`CONFIRMED`），证据集自陈三项缺口

发版执行组 agent-38。Base `origin/main` = `4b92278`；本轮推送后 `origin/main` = `98f26a8`。
本轮**没有改产品代码**：新增只有 `.gitignore`（收 `.tmp/`）与人话证据目录。

### 1. 五步结果（`CONFIRMED`，命令与返回值原文）

```text
$ git push origin main
   4b92278..98f26a8  main -> main            → exit 0（fast-forward，未 force）
$ gh run view 43698707930 --json …
   {"conclusion":"success","headSha":"98f26a8…","jobs":[Node 24 success, Node 22 success]}
$ git tag -a v0.9.2 5eb4942 -m "v0.9.2: plain-language answer by default, one clamp table, progress tab spine/detail/connector"
$ git push origin v0.9.2
 * [new tag]         v0.9.2 -> v0.9.2        → exit 0
$ gh run view 43698836519 --json …
   {"conclusion":"success","headBranch":"v0.9.2","headSha":"5eb4942…"}
$ gh release view v0.9.2 --json …
   {"tagName":"v0.9.2","publishedAt":"2026-11-15T09:22:08Z","assets":[{"name":"dsh-grok-workflow-0.9.2.tgz","size":464763}]}
```

**旧 tag 未动（`CONFIRMED`，推前 / 推后各查一次 `git ls-remote --tags origin`）**：
`v0.9.1` → `584dc22`（peel `9103280`）、`v0.9.0` → `936e625`（peel `2d2b347`）、`v0.8.0` → `9c590f2`、
`v0.7.0` → `3b96b16`（peel `146dce7`）及更早全部同 sha；新增 `v0.9.2` → `38ef237`（peel `5eb4942`）。
`git merge-base --is-ancestor 5eb4942 origin/main` 通过（Release workflow 的同一条检查在 CI 侧也绿）。

Issue #1 状态评论：`TEST_RESULTS: PASS`，
[issuecomment-6892286461](https://github.com/free6589/dsh-grok-workflow/issues/1#issuecomment-6892286461)
（模板 11 字段齐全；`LOCAL_RUNTIME_VERIFIED` 字段内明写三项缺口，未把缺口写成通过）。

### 2. 证据集自陈的缺口（不冒充通过）

`docs/knowledge/evidence/human-default-2026-11-15/`（8 PNG + stage 脚本/日志 + probes +
`MANIFEST.sha256` = 85 个文件 + `lib/client.js`、`lib/progress-tab.js`，`sha256sum -c` 全 OK）
覆盖 VALIDATION Round 40 §6 的六项，但按证据自己的 `README-r2.md` §3/§5：

| §6 项 | 状态 | 边界 |
| --- | --- | --- |
| 1 三 Tab 共存、默认落对话 | `CONFIRMED` | `01` |
| 2 默认消息只有人话块 + 下一步，无 `stat`/`od`/`sha256`/绝对路径/marker | 首轮 `CONFIRMED`；**第 2、5 轮被反证** | 首轮 1 645 字符仍带相对路径 `.tmp/` 与半句截断标记（F4）；第 5 轮漏 `od -c` 输出、第 6 轮漏 `test -` 片段 |
| 3 `showDiagnostics` 关/开对照 | 仅**转写侧** `CONFIRMED` | `07` 读者侧仍是人话块、`08` 标记内确有台账；`assistant/message` 无人话块外台账 → 「答案里看得见台账」`NOT_RUN`（F3） |
| 4 ≤480 px + 深色 | `CONFIRMED` | `03`（`scrollWidth = 480`）、`04` |
| 5 三 Tab 回归（含完成行点开子会话） | 对话/轨迹 `CONFIRMED`；点开子会话本实例 `NOT_RUN` | `05`、`06`、`probes/progress-tab-probe.png`；点子会话由 `evidence/progress-tab-2026-11-15/Round2/09–11` 与 `test/panel-links.spec.ts` 覆盖 |
| 6 机器可核对旁证 | `CONFIRMED` | `run-state-r2.json`（19 797 B）、`final-answer.json`、`stage-c*-r2.json/.log.txt` |

目录改名与 `.tmp` 清理的副作用见该目录 `LANDING.md`：结果 JSON 与堆栈里仍写原名
`human-report-2026-11-15`（未改写证据），`README-r2.md` 引用的 `.tmp/r2-dump-booted.yml`
与打包 tgz 已随 `.tmp` 清理删除（命令在文中，可重建）。

### 3. 本轮 `NOT_RUN`

- live `:3080` / `:3086` / `:3090` 的部署与重启：用户动作（D-013）。
- 上面 §2 表里的三项缺口：`NOT_RUN`，它们需要新的真机复拍或交付层设计改动，不在本轮范围。

## Round 42 — 2026-11-15 — 答案置顶 + 边聊边干（A/B/C），`npm run ci` 全绿

Command:

```sh
npm run ci
```

Result: **PASS**

- `npm run typecheck`: PASS, 0 错误。
- `npm run lint`: PASS, **4 warnings / 0 errors**（基线 5；本轮修掉 2 个自带
  `no-useless-escape`，另 1 个基线 warning 被 delivery 重写带走；`src/redact.ts:155`
  的既有 escape 未动）。
- `npm run build`: PASS（`tsc -p tsconfig.build.json` + 客户端打包；`lib/` 产物已更新）。
- `vitest run`: **51 文件 / 948 测试全 PASS**（基线 948，数量一致：只改断言、未加文件）。

Behavior-change notes (all intended, each pinned by an updated assertion):

- `test/delivery*.spec.ts`、`test/human-output-contract.spec.ts`、
  `test/gate-partial-head.spec.ts`、`test/gate.spec.ts`：`做完了/做了一部分/项任务全部核验通过`
  开头断言 → `答案：/Answer:` 开头 + `以上是结论；明细已记入台账。` 尾巴。
- `test/triage.spec.ts` team 两例：`startCalls` 1 → 2（首答 + 团队 run），固定 greeting
  断言删除。
- `test/phase1-dialogue.spec.ts` P0-2 五例 + B18：`startCalls[0]` → `startCalls[1]`
  （团队 run），`answered` 改断首答（含档位行、不含固定 greeting），B18 2 → 3
 （classifier + 首答 + 团队 run）；harness 认 `first-answer` label。
- `test/synthesis-guardrails.spec.ts` fallback 原文断言 → 转述断言 + `not.toContain` 原文。

Implementation bugs found and fixed in-round (both `CONFIRMED` by failing test):

1. `$1` 注入：`stripIds` 单字符分支 lookbehind 无捕获组，`$1` 逐字写回
   （`Task a：…` → `Task $1…`）。修：单字符分支替换串用空串。
2. `核验通过` 自杀：`answerLead` 回落句"有一项已核验通过。"命中自家 MIDLINE，
   被 `composeBlock` 整行丢弃。修：回落句改"有一项已得出可用结论。"。

Boundaries: 真机 Web 长驻验证 `NOT_RUN`（首答现场措辞、进度节点、中断重定向均未真机看过）；
headless e2e（`scripts/e2e-headless-in-turn.sh`）`NOT_RUN`；`full` 管线字节一致性由既有
`test/triage.spec.ts` full 回归 + `gate-partial-head` full 同 head 用例覆盖（PASS）。

## Round 43 — 2026-11-16 — 进度 Tab A+C：`npm run ci` 全绿 + 隔离真机复验

Command:

```sh
npm run ci
```

Result: **PASS**

- `npm run typecheck`: PASS, 0 错误。
- `npm run lint`: PASS, **4 warnings / 0 errors**（基线 4，无新增）。
- `npm run build`: PASS（client bundle 220535 B → `lib/client.js`，`cmp` 一致）。
- `vitest run`: **51 文件 / 951 测试全 PASS**（948 + 手风琴 3 例新测）。

Isolated real-machine verification (`CONFIRMED`, profile `acgtest`, `:3225`, 打包安装 md5 一致)：

- 脊 7 段满宽（DOM `segs:7`，各段 ~161px 均分）、单展开互斥（`branches:1`，`aria-expanded=true` ≤1）、默认开段（失败优先→doing→全收）、`+N` 实数（`+1 more (show all 4)`）、无横滚（`scrollW==innerW`，宽 1440 / 窄 480 均成立）。
- settled 态：7 段标题全显、计数行 `1/1` `2/2`、全绿线、`3/3 · 100%`、全收起。
- 窄屏：竖排 + 左竖线 + 成员卡片 + 详情底部抽屉（`position:fixed/bottom:0/60vh/auto` 生效）；深色 token 生效。
- 详情三段 + `Open child session` 真开子会话（三 Tab + planner 上下文）；Chat 回归正常。
- 真机抓到的实现 bug 4 个（STATE 段）：line 压 meta、分支挤扁段、link 规则丢失、badge 字面色——全部修好并复验。

Boundaries: live `:3080` 更新 `NOT_RUN`（禁重启，无已验证免重启路径，见 D-053）；commit/push/tag/Release 待用户指令。

## Round 44 — 2026-11-16 — v0.9.3 发布闭环：push / CI / tag / Release / 可用性 / live 换文件（`CONFIRMED`）

Base `7a31218` → release-prep `593f89e`（bump 0.9.3 + CHANGELOG 节头；`lib/` 无变化，`git diff --exit-code -- lib/` 通过）。

### 1. 五步结果（`CONFIRMED`）

```text
$ git push origin main
   7a31218..593f89e  main -> main            → exit 0（fast-forward，未 force）
$ gh run view 43738470054 --json …
   {"conclusion":"success","headSha":"593f89e…","jobs":[Node 24 success, Node 22 success]}
$ git tag -a v0.9.3 593f89e -m "v0.9.3: answer-first background delivery, progress spine accordion"
$ git push origin v0.9.3
 * [new tag]         v0.9.3 -> v0.9.3        → exit 0
$ gh release view v0.9.3 --json …
   {"tagName":"v0.9.3","assets":[{"name":"dsh-grok-workflow-0.9.3.tgz","size":483122}]}
```

**旧 tag 未动（`CONFIRMED`）**：`v0.9.1` → `584dc22`/peel `9103280`、`v0.9.2` → `38ef237`/peel `5eb4942`
与发版前同 sha；`v0.9.3` → `f63bb7c`/peel `593f89e`。`merge-base --is-ancestor` 通过。

### 2. tag 可用性（`CONFIRMED`）

`gh release download v0.9.3` → 483122 B，与本地 `npm pack` 同字节；解包 `version=0.9.3`，
`lib/client.js` 含 `gw-progress-seg` 31 处，md5 与仓库 `lib/client.js` 一致。

### 3. live 安装（`CONFIRMED` 文件，生效 `NOT_RUN` 待重启）

`dsh plugin --profile web add file:…0.9.3.tgz` → Done；live 包 `0.9.2 → 0.9.3`，
`lib/client.js` md5 一致。运行中 `:3080` 进程未重启（D-013），新渲染下次重启生效。
沙箱 EROFS 导致首次安装失败，经 danger-full-access 审批后重执行成功；未触碰凭据。

### 4. 本轮 `NOT_RUN`

- 运行中 live 的重载验证（需用户重启 DSH）。
- `#22` Phase 范围工作（本轮不算 #22 范围，未动其 PR/分支）。

## Round 45 — 2026-11-16 — 补交步 A：`npm run ci` 全绿（51/954），真机 NOT_RUN

Command:

```sh
npm run ci
```

Result: **PASS**

- `npx tsc --noEmit`: 0 错误。
- `oxlint`: **4 warnings / 0 errors**（无新增）。
- `npm run build`: client bundle 正常（本轮只改 script/report/types，lib 同步构建）。
- `vitest run`: **51 文件 / 954 测试全 PASS**（951 + `failure-paths.spec.ts` 新增 same-attempt resubmit 3 例）。

New tests (`CONFIRMED` PASS):

- 补交成功 → task `verified`、`attempts` 长 1、`resubmitted: true`、无 failure（maxRetries=0 下可恢复，证不花重试额度）；
- 补交再缺 → attempt 失败、`failure.class = format-error`、report 仍合法；
- 传输失败（503）→ 不补交（worker 只调 1 次），失败分类不变。

Boundaries: 隔离真机复验 `NOT_RUN`（建议发版前走一次 acgtest 跑个三城天气看 `resubmitted` 落盘）；
push/tag/Release 待用户指令；B（失败行分类显示）用户没点，`NOT_RUN`。

## Round 46 — 2026-11-16 — 补交步 A 已 push，远端 CI 双绿（`b23d2bd`）

```text
$ git push origin main
   01f86de..b23d2bd  main -> main            → exit 0（fast-forward）
$ gh run view <latest> --json …
   {"conclusion":"success","headSha":"b23d2bd","jobs":[Node 22 success, Node 24 success]}
```

工作树干净（`git status` 仅剩跟踪文件无修改）。tag/Release 待用户指令（建议攒到 B 或下次发版一起，
本轮 CHANGELOG 已在 `[Unreleased]`）。

## Round 47 — 2026-11-17 — v0.10.0 真机验收（新 profile `acgtest95` / 新端口 `:3231`）

**环境（`CONFIRMED`）**：`DSH_HOME=<repo>/.dsh-home/acgv095`（`.dsh-home/` 已 gitignore，不入库）、
profile `acgtest95`（新建，非复用 `acgtest`）、端口 `:3231`（此前在听的是 3065/3080/3086/3211）。
宿主 `dsh --version` = `0.2.2-rc.3`（比 `package.json` peer `0.2.1-rc.2` 新，落在
`engines.dsh >=0.2.1-rc.2 <0.3.0` 区间内）；模型路由为机器本地网关 `127.0.0.1:18088`
（`apiKeyEnv: BIFROST_VIRTUAL_KEY`，键值只在环境里，未读未写未打印）。

**安装（`CONFIRMED`）**：

```text
$ npm pack --pack-destination .tmp/v095            → dsh-grok-workflow-0.9.4.tgz（472,958 B，82 files）
$ DSH_HOME=…/acgv095 dsh plugin --profile acgtest95 add file:…/dsh-grok-workflow-0.9.4.tgz
  dsh: initialized profile acgtest95 … / + dsh-grok-workflow file:…  → exit 0
$ node -p 已装包 version → 0.9.4
$ md5sum 已装 lib/client.js vs 仓库 lib/client.js → d1e2df8c… 两侧一致（cmp 通过）
```

注：`dsh plugin … add` 首建 profile 只写 `@deepseek-ai/dsh-base` bundle，需手工把
`@deepseek-ai/dsh-web-app` 补进 `dsh.profile.bundles`（本机 profile 文件，不入库）。

**加载（`CONFIRMED`）**：

```text
$ DSH_HOME=… dsh --profile acgtest95 --patch …/patch.yml --dump-config
  → - id: grok-workflow（8 键：toolName/mode/grokDefault/synthesis/maxConcurrency=4/maxTasks=8/roles 3 链）
  → - id: workflow-ptc  disabled: false（web 层默认 disabled: true，overlay 按文档扩回）
$ DSH_HOME=… dsh --profile acgtest95 --patch … --host 127.0.0.1 --port 3231 --no-open
  → "dsh web: http://127.0.0.1:3231/?token=…"（token 不落报告）
$ curl -o /dev/null -w '%{http_code}' http://127.0.0.1:3231/  → 401（访问围栏生效）
```

浏览器侧（chromium + playwright，1440×900）：`/plugins/??…,dsh-grok-workflow/client.js,…`
被真实请求，无 requestfailed、无 console error；侧栏 Plugins 页出现
**"Grok workflow — A task-splitting tool: the entry gate, per-role model chains,
concurrency limits and run records."**，点进去是本版新设置页：

```text
page[data-page="grok-workflow"] present=true；input[data-field] = maxConcurrency=4, maxTasks=8；
switch=1（Work hard by default → On）；角色行 = Planner/Worker/Checker/Summarizer/Supervisor（1/50、1/50、1/50、0/50、0/50）；
Save/Discard 在位；scrollW=1440 = innerW（无横向溢出）
```

**交互（`CONFIRMED`，两次真实运行）**：

1. `用一句话介绍北京、上海、广州三座城市，然后汇总成一句话结论` → 会话标题「北京、上海、广州三城介绍与总结」，
   "4 subagents"，Progress 页 7 段：Start ✓ / Plan ✓ 1/1 / Execute / Verify / Synthesize ✓ 2/2 / Answer / End ✓，
   `3/3 · 100%`，`scrollW=innerW=1440`。
2. `分别查一下北京、上海、广州今天的天气，然后汇总成一句话结论` → 04:00 首答 7s 内落地
   （"档位：团队档 …… 后台会分别查三地天气 ……"），04:02 后台运行收尾给出
   "总体状态：已完成；1/1 项任务已由独立检查核验。"，台账
   `.dsh-home/acgv095/memory/grok-workflow/archive.jsonl` 记录
   `run:eef1f4b7-… status=completed · verified 1/1 · confirmed 6 criteria`，
   task `weather-3cities-summary` 带 2 条 uncertain（工作目录只读挂载、两源措辞差异）。

**观察到的缺口（`CONFIRMED` 现象 / `HYPOTHESIS` 归因，未定性为回归）**：两次运行的 Progress 页里
`Execute` / `Verify` 段显示 `Not reported in the events`（`members=0`、`branches=0`），而台账与答案
都写明该任务是执行过并由独立检查核验通过的（1/1 verified）。`deriveTrack()` 的成员来自
`run.members` 的 `phase`，故现象是成员事实没进到该会话的进度流。是否为本轮 T1–T6 引入
（supervisor 调用插在 verify 后）或 in-turn 后台投递路径的既有行为，本轮**未**定位——记此待查，
不写进 Release notes 当作已修。

**边界（`NOT_RUN`）**：live `web` profile（`:3080`）的安装与重启（D-013 用户动作）；窄屏 480px 复拍；
`Open child session` 点开子会话（本次运行未走到 running 成员卡）；headless e2e 脚本。

## Round 48 — 2026-11-17 — 设置页 UI bug 修复（10 子代理审计 + lead 合入）

**起因（`CONFIRMED`，用户报告）**：设置内容保存不了；设置 UI 与 mock 长得不一样；
角色顺序应为拆活1/干活2/检查3/监督4/收尾5，但页上看不到监督的模型设置。

**审计（`CONFIRMED`，10 子代理只读审计，lead 合入）**：
- 保存链无死路：`form.mutate(ops, revision)` 认深 path（Host `SettingsPathOp.path: readonly string[]`）；
  按钮状态机（disabled/validate/ops/save）走查无恒灰死路（agent-36）。
- 监督行非缺失而是被淹没：ROLES 5 键全渲染，5 空链文案一字相同（"跟现在一样"），
  监督在旧 bundle 排第 5（首屏下易被截断），用户浏览器跑的还是没重启的旧 bundle（agent-29/agent-35）。
- 保存失败真凶（agent-28）：① `+加备选` 产空行 → `missingModel` 红错锁保存，静默 return；
  ② `maxInFlight` 有校验无输入框，存量 cap 脏了永远红、永远灰，无处可改；
  ③ 数字行 `unit.jobs`/`unit.tasks` 字典缺键，后缀恒显示 `—`。

**修复（`CONFIRMED`，`e49acd1` 之后未 push）**：
1. ROLES 渲染顺序 → planner/worker/verifier/supervisor/synthesizer（序号 1-5 与执行序一致）。
2. 角色名带序号（`1 · 拆活` … `5 · 收尾`，中英双语）。
3. 空链文案 → "空着 = 跟这次对话用同一个，没加备选"（EN 同义）。
4. 数字行步进器（− / ＋，夹取 1-100）+ 补 `unit.jobs`/`unit.tasks`（件/jobs/tasks）。
5. 模式改双卡片二选一（自动挡/全员上，存 triage/full 不变）+ 新增 mode.* 文案键。
6. 每行加并发上限 cap 输入框（`data-route-cap`，空=不限）——存量脏 cap 终于有地方改。
7. 出错行行内红框（`badRows` 从 errors 反查 `{role,index}`），保存按钮不再无声灰着。
8. 保存/失败/拒绝文案换白话；`saveCount` 死键已删（Round 47 末）。
9. 卡片分区加标题（总开关和模式 / 谁来干 / 下多大力气）+ 状态行/页首文案重写。

**验证（`CONFIRMED`）**：`npm run build`（198003 B）→ `cmp` 一致；
`test/client.spec.ts` 74/74；全量 51 文件 / 953 测试 PASS；typecheck 0 错；lint 22w/0e（无新增）。

## Round 49 — 2026-11-17 — v0.10.1 发版（`CONFIRMED`，逐条可复核）

**内容**：`e49acd1`（序号/回退/去计数）+ `1757164`（专业重写 + 保存锁死修复）+
`ed61750`（升 0.10.1 + changelog）。`v0.10.0` tag 未动（peel `b2c4515` 不变）。

**发版动作（`CONFIRMED`）**：`package.json` + `package-lock.json` = `0.10.1`；
`CHANGELOG` 插入 `## [0.10.1] - 2026-11-17`（`[Unreleased]` 保留为空节）；
push（fast-forward `7300a6e..ed61750`，无 force）→ tag `v0.10.1`（peel `ed61750`）→
CI `44109698911` success → Release `44109723594` success，
Release `v0.10.1` + asset `dsh-grok-workflow-0.10.1.tgz` 已发布。

**新 profile 真机（`CONFIRMED`，`acgtest101x` / 未用端口，web 沙箱起不来故 CLI 侧）**：
`dsh plugin add file:…0.10.1…`（按同包重演，exit 0）→ 已装 `lib/client.js` md5 与
工作区修复版一致（`modeCards`/`data-route-cap`/`4 · 监督` 在列）→
`--dump-config` grok 行 8 键全 → 写 7/9 落盘、supervisor 链写入落盘。
浏览器点检 NOT_RUN（沙箱回收 web 后台进程）；用户 `:3080` 重启后所见以其浏览器为准。

**未做（`NOT_RUN`）**：live `:3080` 换装 v0.10.1 与重启（D-013 用户动作）；
进度 Execute/Verify 成员渲染缺口的定位与修复。

## Round 50 — 2026-11-17 — 设置页 error 根因修复（A1–A7 审计 + lead 合入，未发布）

**用户现象（`CONFIRMED`）**：v0.10.1 装上重启后，打开设置即 error，无法保存。

**审计（`CONFIRMED`，7 子代理只读，lead 合入）**：
- A2/A3 实锤整页 error 主因：存量 `roles` 非对象（null/字符串）→ `draftOf` 第 502 行
  `clone(value.roles)` 后取属性抛 TypeError → React 整页崩（A2 P3/A3-B,C）。
  另：`mode:"auto"` 等非法枚举值页面 0 错绿灯通过，存下去后 Host `resolveConfig`
  throw 整行拒载（A3-F，页面与 Host 双重标准）。
- A4 契约错位（记录，不修）：`entry.writable` 层级不对（per-ns entry 无此字段）、
  `revision` 应取 form 快照 fence 而非 mirror、`set` 不能代 `unset` 去覆盖。
  三处各一行 diff，已记待办，本轮不改（改动 Host 交互面，需单独发版验证）。
- A1 T1/T2（改名行放宽匹配、error 残值优先）不采纳：放宽误认别家 namespace，
  error 页有重试按钮是正道。T3（clone 防抛）采纳。
- A6：文案零遗漏零错字，无改动。A7：node 矩阵 + chromium 实渲染截图
  `.tmp/a7-render.png`（harness `.tmp/a7-harness.html`，脚本 `.tmp/a7-matrix.mjs`），
  脏输入矩阵全记录；M17（无效 mode 显示 OK）正是本轮 badEnum 要堵的口。

**修复（`CONFIRMED`，未 push）**：
1. `draftOf`：roles 非对象（null/字符串/数组）不再 clone，直接沿用空链（整页 error 根除）。
2. `validate` 新增 `error.badEnum`：enum 存量非法即红错锁保存（中英双语文案 + 测试钉住翻译全覆盖）。
3. `clone` 加 try/catch：BigInt/circular 等脏 mirror 值回退为空，不整页崩。
4. 顺手：EN `error.badEnum` 重复键删一处（lint 23→22 回基线）。

**验证（`CONFIRMED`）**：`npm run build` → `cmp` 一致；`test/client.spec.ts` 76/76；
全量 51 文件 / 955 测试 PASS；typecheck 干净；lint 22w/0e（回基线）。
新 profile `acgtest102x`：0.10.1 修复包重装（md5 `dd47bd15` 两侧一致）→ dump grok 行
8 键全 → 读写落盘通。新增测试：roles 非对象不抛、badEnum 中英红错。

## Round 51 — 2026-11-17 — A5 补修（validate/ops/catalog/translate 空值防御，未发布）

**来源（`CONFIRMED`）**：A5（agent-42）姗姗来迟的 render 崩溃审计，补了 3 条 lead
已合入之外的 throw 路径，逐条验中后修。

**修复（`CONFIRMED`，`27fad89` 之上未提交）**：
1. `validate`/`emptyCapWarn`：`draft.roles` 非对象时用空对象兜底（`draft.roles[role]`
   读属性抛 TypeError 整页崩；`emptyCapWarn` 同族）。
2. `opsFor`：`value.roles` 非对象不再取属性；`draft.roles[role]` 非数组回退 `[]`
  （坏 draft 不抛、不产幻影 op）。
3. `RouteRow`：`catalog` 为 null 时按无目录降级（`Object.keys(null)` 抛）。
4. `translate`/`panelTranslate`：`params` 非对象时按 `{}` 处理（`in` 运算抛）。
5. A1-T1（改名行放宽匹配）、T2（error 残值优先）不采纳：前者误认别家 namespace，
   后者改状态机风险大，error 页重试按钮是正道。A4 三处契约错位记待办，不在本轮。

**验证（`CONFIRMED`）**：`npm run build` → `cmp` 一致；`test/client.spec.ts` 76/76；
全量 51 文件 / 955 测试 PASS；typecheck 干净；lint 22w/0e（回基线）。
新增测试：坏 draft 下 validate/emptyCapWarn/opsFor 不抛且无 roles 幻影 op。

## Round 52 — 2026-11-17 — v0.10.2 发版（`CONFIRMED`，逐条可复核）

**内容**：`27fad89`（roles 非对象防御 + badEnum）+ `8b1d543`（A5 空值防御）+
`4eabee8`（升 0.10.2 + changelog）。旧 tag 未动（v0.10.0 peel `b2c4515`，
v0.10.1 peel `ed61750`）。

**发版动作（`CONFIRMED`）**：`package.json` + `package-lock.json` = `0.10.2`；
`CHANGELOG` 插入 `## [0.10.2] - 2026-11-17`（`[Unreleased]` 保留为空节）；
push（fast-forward `a8f60e6..4eabee8`，无 force）→ tag `v0.10.2`（peel `4eabee8`）→
CI `44116957934` success → Release `44116985460` success，
Release `v0.10.2` + asset `dsh-grok-workflow-0.10.2.tgz` 已发布。

**未做（`NOT_RUN`）**：live `:3080` 换装 v0.10.2 与重启（D-013 用户动作）；
A4 三处 Host 契约错位（writable 层级/revision fence/set 代 unset）的单独发版修复；
进度 Execute/Verify 成员渲染缺口的定位。

## Round 53 — 2026-11-18 — P2-02 脱敏形状：引号内 Cookie、签名链接、PGP armor、env 值边界（`CONFIRMED`）

**现象（`CONFIRMED`，先探针后改）**：对已构建的 `lib/redact.js` 直接探针，八条形状里五条是漏或损坏：
`curl -H 'Cookie: PHPSESSID=…'` 不变（规则锚在 `^|\n`）；`?X-Amz-Signature=` / `?X-Goog-Signature=` /
`?auth=` 不变（只有 Azure `sig`）；PGP armor 不变（只认 PEM 横幅）；`SECRET_KEY=x` / `PRIVATE_TOKEN=y`
不变（键名分支没有这两个）；`const token = await refreshToken()` 被改写成
`const token = [REDACTED] refreshToken()`；`if (password == null)` 被改写成
`if (password =[REDACTED] null)`；`db_pass=hunter2;user=app` 丢掉 `;user=app`；
`X-Amz-Credential=[REDACTED AWS ACCESS KEY]` 被二次脱敏成 `[REDACTED] AWS ACCESS KEY]`。

**修复（`CONFIRMED`）**：`cookie-header` 增加引号前缀并止于收尾引号；`azure-sas-signature` 更名
`url-signature-query` 并加 `X-Amz-Signature`/`X-Goog-Signature`/`auth`；新增 `pgp-private-key`；
`key-value-env` 加 `secret[_-]?key`/`private[_-]?token`、拒绝 `==`/`===` 与代码关键字、要求值止于
token 边界（空白、行尾、`,;}&|<>})]`）、拒绝已脱敏占位符；`isSensitiveKey` 用连字符归一化后比同一张
复合表（`x-api-key` 命中）。

**验证（`CONFIRMED`）**：`.rsi/evidence/round-005/red.txt`（改前 6 failed / 24 passed）、
`green.txt`（`test/redact.spec.ts` 32/32）、`ci.txt`（`npm run ci` exit 0，typecheck 0 错，
lint 22 warning / 0 error，**54 文件 / 993 测试 PASS**，基线 54/985）。

**一处既有断言调整**：`test/phase1-dialogue.spec.ts:655` 原先要求裸 `[REDACTED]`；provider-token
规则先命中，正确标记是 `[REDACTED API KEY]`，断言改为钉住该确切占位符（更严），原文密钥仍断言不存在。
未删、未跳过、未放宽任何断言。

**未验证（`NOT_RUN`）**：base64 包裹的 PEM（无规则，已写入 `docs/ARCHITECTURE.md` 已知缺口）；
`grok-workflow-dev` 真机消息路径（改动只在 `redact.ts`，`test/loader.spec.ts` 2 例真实 Loader 激活
仍由 `npm run ci` 覆盖）。

## Round 54 — 2026-11-18 — P1-03 `docs/LOCAL-TESTING.md` 与代码对账（`CONFIRMED`）

**对账结果（`CONFIRMED`，逐条）**：九个键与全部键名 = `CONFIG_KEYS`（9）✓；`maxRetries=1` =
`FIXED_MAX_RETRIES` ✓；`maxActiveRuns=2` 每会话 / `8` 每进程 = `FIXED_MAX_ACTIVE_RUNS` /
`FIXED_MAX_ACTIVE_RUNS_TOTAL` ✓；`timeoutMs` 默认 `3600000`、`0` 不限时 = `DEFAULT_TIMEOUT_MS` ✓。
三处不符：①四处安装示例写 `dsh-grok-workflow-0.2.0.tgz` / `-0.2.1.tgz`（发布线 0.11.x）；
②排障条目引用 `roles.synthesizer is set but synthesis is "deterministic"`——本构建从不输出该消息，
`apply()` 在 `resolveConfig` 之前就把 `deterministic` 修复成 `layered`（`src/index.ts:94-101`、
`src/config.ts:556-568`）；③中文 README 用 `maxActiveRuns` 每会话 `2` 的写法，与英文 `key=value`
不同构（数值相同）。

**修复（`CONFIRMED`）**：四处示例名改为当前产物名；`.rsi/tools/bump-version.py` 每次升版本同步改写
`docs/LOCAL-TESTING.md` 的 `dsh-grok-workflow-X.Y.Z.tgz`（本次输出 `local-testing.tgz=3`）；
排障条目改为引用代码真会输出的两条消息并说明哪两个取值是「修复而非拒绝」；中文 README 改成
`maxActiveRuns=2`（每会话） / `maxActiveRunsTotal=8`（每进程）。

**验证（`CONFIRMED`）**：`.rsi/evidence/round-006/red.txt`（新用例对改前文档：2 failed / 9 passed）、
`green.txt`（12/12）、`ci.txt`（`npm run ci` exit 0，typecheck 0 错，lint 22w/0e，
**54 文件 / 998 测试 PASS**，上一轮 54/993）。`test/docs-config-keys.spec.ts` 7 → 12 个 `it`，
无跳过、无放宽。

**未验证（`NOT_RUN`）**：GitHub 渲染后的排版未在浏览器里复核；本轮未重复 `grok-workflow-dev`
真机安装（真机结论归 round 8）。

## Round 55 — 2026-11-18 — 远端标签清单逐条对账（`CONFIRMED`，命令与输出见证据）

**范围**：基线轮遗留的开放问题「远端标签只看到尾部 v0.2.7..v0.9.4，README 却列 28 个」。

**方法（`CONFIRMED`）**：`git fetch origin --prune`；`git ls-remote --tags origin`（61 行 →
32 个标签，其中 26 个 annotated）；逐标签 `git show <tag>:package.json` 与
`git merge-base --is-ancestor <peeled> origin/main`；`git rev-parse HEAD` 对
`git rev-parse origin/main`；从 README 中英两份抽 `Published:` / `已发布：` 列表；
本地标签对象逐个对远端对象。

**结论（`CONFIRMED`）**：32/32 标签本地与远端对象完全相同（**没有被动过的标签**）；每个 peeled
提交都是 `main` 的祖先；两份 README 列表升序、无重复、无缺失无多余、末项 = 当前发布；
`HEAD == origin/main`。31 个标签的 `package.json` 与标签名一致；唯一例外是 `v0.2.0-rc.1`，
它早于发布流程，所在提交的 `package.json` 仍是 `0.1.0`。**已发布标签不移动**，因此改为在两份
README 写明「它不是发布版本」，并由 `test/docs-version.spec.ts` 新增 1 个 `it` 钉住该说明（7 → 8）。

**验证（`CONFIRMED`）**：`.rsi/evidence/round-007/remote-tags.txt`（原始 `ls-remote`）、
`audit.txt`（逐标签表 + 列表比对 + main 同步）、`local-vs-remote-objects.txt`（32/32 对象相同）、
`ci.txt`（`npm run ci` exit 0，typecheck 0 错，lint 22w/0e，**54 文件 / 999 测试 PASS**）。

**未验证（`NOT_RUN`）**：旧标签的 GitHub Release **附件**未重新下载核对（本轮审 refs，不审
Release 正文）；Release 工作流对预发布标签的处理未测（未改工作流）。

## Round 56 — 2026-11-18 — 真机 disposition：DSH 0.2.2-rc.3 上安装/激活/设置面 PASS，真模型消息 BLOCKED（`CONFIRMED`）

**做了什么（`CONFIRMED`，命令见 `.rsi/evidence/round-008/activation.txt`）**：`DSH_HOME=$PWD/.dsh-home/rsi-r8`
（仓库内、gitignore；沙箱下 `dsh` 无法写 `~/.dsh`，实测 `EROFS … /home/fish/.dsh/profiles/headless/cordis.yml`）→
`--from-default-profile web` → `dsh plugin --profile grok-workflow-dev add $PWD`（以 `link:` 安装）→
把 `workflow-ptc` 改回 `disabled: false` → 在 `127.0.0.1:3199` 启动。

**PASS（`CONFIRMED`）**：bundles = `["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app","dsh-grok-workflow"]`；
`--dump-config` 里 `workflow-ptc` `disabled: false`、`grok-workflow` 行在；启动输出只有一行 URL
（无 `pending`、无 `did not activate`）；用启动 token 换 cookie 后 `POST /api/settings/describe`
返回 200 / 43 056 B / **23 个命名空间，其中 `grok-workflow` 且 `autoGenerate: true`**。

**BLOCKED（不是 pass）**：`dsh --profile grok-workflow-dev headless "Use the grok_workflow tool …"`
退出码 1，`MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"`。
从别的 profile 拷密钥被任务禁止，故记 blocked；真实 Loader 路径仍由 `test/loader.spec.ts`（2 例）覆盖。

**顺手发现两处坑（已写入 `docs/LOCAL-TESTING.md`）**：`web` 模板的 profile 没有 `headless` 命令
（`too many arguments. Expected 0 arguments but got 2: headless, …`，`--host` 亦属未知选项）；
`--from-default-profile web` 会**启动** web app，若操作者实例已占 `:3080` 就会 EADDRINUSE（profile 仍会写入）。

**收尾（`CONFIRMED`）**：本轮启动的实例全部停止，`ss -ltn` 在 3199/3201/3203/3205/3207/3209/3211/3213
均无监听；带 token 的启动日志已就地脱敏，证据目录里 `token=` / `API_KEY=` 检索为空。
`npm run ci` exit 0，typecheck 0 错，lint 22w/0e，**54 文件 / 999 测试 PASS**。

## Round 57 — 2026-11-18 — P0-02 Progress 页 `执行`/`检查` 恒为「事件中没有报告」（`CONFIRMED`）

**缺陷（`CONFIRMED`，代码位置）**：`src/script.ts:1852/1886/1912/1950` 把 worker 与 verifier 调用的
`phase` 写成 `taskGroupTitle(...)` = `任务 n · 标题`；`src/progress-tab.ts` 的阶段绑定只按 `phase`
命中 `PROGRESS_STAGES` 的 token。因此每次运行都必然发生的 `执行`/`检查` 两个阶段永远分不到行，
渲染成空白并显示 `progress.notReported`（`src/client/index.js` 的 meta 分支），而真正跑过的行就在
其下的计划任务节点里。

**修复（`CONFIRMED`）**：新增第二条绑定通道——phase 未命中任何阶段的行，按其 **label**
（`memberLabel()` 生成的 `执行`/`检查`、`Execute`/`Check`）归属，并交叉引用到该阶段新增的
`evidence` 列表。`members` 仍是每行唯一的归属（`test/progress-tab.spec.ts` 的 `rendered` 断言保持
通过），状态优先取自有行、无自有行才取 evidence；role token 只匹配 label，不匹配 phase，所以标题
含 `check` 的任务不会变成 `检查`。浏览器镜像 `src/client/index.js` 逐条同步，渲染 meta 行改为
`{count} 行在下方任务节点中执行` / `{count} rows ran inside the plan tasks below`（两语言均已加键）。

**先红后绿（`CONFIRMED`）**：`.rsi/evidence/round-009/red-ts.txt` = `Tests 5 failed | 29 passed (34)`
（`evidence` 未定义 / `expected 'done' to be 'pending'` 的真失败）；同轮另有 2 条既有诱饵测试因
fixture 的默认 label 正是 `执行 N` 而转为失败——它们测的是 phase 通道，故把 fixture 的 label 改为
不含阶段名的 `Member` 并**加强**断言（同时断言 `members` 与 `evidence` 都为空），不是放宽。
`.rsi/evidence/round-009/green.txt` = `Tests 112 passed (112)`（progress-tab 34 + client 78）。

**全量门（`CONFIRMED`）**：`npm run typecheck` exit 0（`.rsi/evidence/round-009/typecheck.txt`）；
`npm run ci` = `Test Files 54 passed` / `Tests 1006 passed` / lint 22 warnings 0 errors / exit 0
（`.rsi/evidence/round-009/ci.txt`）。基线 v0.11.4 为 54/985，本轮较上一轮 54/999 增 7，无删除、无 skip。

**STOP 探针（`CONFIRMED`，本轮起强制留痕）**：`.rsi/tools/stop-probe.sh 9` 把
`test -e .rsi/STOP` 的判定追加到 `.rsi/evidence/stop-probes.txt`
（`round=9 … -> STOP ABSENT`），并在 `.rsi/LOG.md` 的 STOP 小节留一行。
Rounds 5–8 当时只把该判定写成 `.rsi/STATE.md` 的一句散文，没有证据文件——这是上一轮被复核指出的
记录缺口，本轮以工具 + 证据 + LOG 小节三处补上，历史轮次不追改。

## Round 58 — 2026-11-18 — P1-02 `docs/ARCHITECTURE.md` 版本状态锚定（`CONFIRMED`）

**审计（`CONFIRMED`）**：`grep -nE "in this release|current version|0\.1[01]\.[0-9]+" docs/ARCHITECTURE.md`
在修复前命中四处 `in this release`（`:405`、`:416`、`:419`、`:554`），没有 `current version` 字样，
也没有过期的包版本号——所以 POOL 里 P1-02 的字面措辞（「current version」）复现不出来，但同一类缺陷
（状态无法落到某个版本）确实存在。另有一处：`resume` 边界只写了 DSH `0.2.1-rc.2`（`:413`），而
round 8 已在 `0.2.2-rc.3` 上验证安装/激活/设置面。

**修复（`CONFIRMED`）**：checkpoint 一节改为 `ship since **0.8.0**`；用户可见面一节标题改为
`Since **0.8.0**:`；两处「没有生产调用方 / 树里没有实现」改为 `as of **0.11.9**`（依据实测：
`grep -rn "resume/" src` 只在 `src/checkpoint/wiring.ts` 里有一句注释，
`src/run.ts:21` 才 import checkpoint recorder）；边界行拆成「实测版本」与「round 8 复查版本」，
并明写 `did *not* re-measure` 那条 journaling 边界。

**守卫（`CONFIRMED`）**：新增 `test/docs-architecture-version.spec.ts`（3 条）——禁止发布相对措辞、
每条 `Status (` 必须带不超前于包版本的 `since **X.Y.Z**`、边界段落必须同时写出两个版本与
「没有重测」这一限定。写法上按**段落**取那条边界陈述（第一次按首行取，断言在截断句上通过了，
属测试自身的 bug，已改为读到空行为止）。

**先红后绿（`CONFIRMED`）**：`.rsi/evidence/round-010/red.txt` 是用**上一版文档**重放新 spec 的
结果（`2 failed | 1 passed`），`green.txt` = `3 passed`。全量 `npm run ci` = `Test Files 55 passed`
/ `Tests 1009 passed` / lint 22w 0e / exit 0（`.rsi/evidence/round-010/ci.txt`），
`npm run typecheck` exit 0。基线 v0.11.4 = 54/985。

**STOP 探针（`CONFIRMED`）**：`.rsi/tools/stop-probe.sh 10` → `round=10 … -> STOP ABSENT`。

## Round 59 — 2026-11-18 — P2-01 客户端 i18n 键齐全性（审计无缺陷，补守卫）（`CONFIRMED`）

**结构（`CONFIRMED`）**：bundle 里有两本词典——插件的 `DICT`（`src/client/index.js:409`，导出为
`GROK_WORKFLOW_DICT`）与 `PANEL_DICT`（`:1445`，在 `:3624` 以 `grok-workflow-panel` 命名空间注册）。
面板调用点（`:1664` `statusCount.*`、`:1726` `member.empty`、`:1790` `phase.*`、`:1835` `run.empty`）
拿到的是绑定 `PANEL_DICT` 的 translator（`:1556 panelTranslate`），因此它们的键**应当**只在面板表里。

**审计（`CONFIRMED`，无缺陷）**：插件每语言 137 键、面板每语言 19 键，两表各自语言对称
（`leftOnly`/`rightOnly` 皆空），无空文案；每个字面 `t('…')` 键可解析；每个拼接键
（`unit.jobs|tasks|ms`、`mode.auto|full.title|.detail`、`option.mode.triage|full`）可解析；
每种动态展开在**消费它的那张表**里可解析（`DICT`：`progress.stage.*` 7、`progress.field.*` 7、
`role.*` 5、`progress.derived.*` 2、`progress.source.*` 3；`PANEL_DICT`：`status.*` / `statusCount.*`
各 6）。

**新增守卫（`CONFIRMED`）**：`test/i18n-parity.spec.ts`（6 条）。关键设计：插件表里缺失的键必须
正好是那六个面板作用域键，所以「键换表」会把测试搞红，而不会被「某处存在」放过。

**先红后绿（`CONFIRMED`）**：`.rsi/evidence/round-011/red.txt` 是**故意变异重放**——从 bundle 删掉一个
`zh` 键（`unit.ms`）→ `2 failed | 4 passed`；随即还原（`git diff --stat src/client/index.js` 为空），
`green.txt` = `6 passed`。全量 `npm run ci` = `Test Files 56 passed` / `Tests 1015 passed` /
lint 22w 0e / exit 0，`npm run typecheck` exit 0。基线 v0.11.4 = 54/985。

**STOP 探针（`CONFIRMED`）**：`.rsi/tools/stop-probe.sh 11` → `round=11 … -> STOP ABSENT`。

## Round 60 — 2026-11-18 — RSI round 14：续跑（loop）面落地 + `0.11.14` 发版（`CONFIRMED`）

**前提（`CONFIRMED`）**：本轮开场 `git status --short --branch` = `## main...origin/main`，HEAD =
`7a79efb`（tag `v0.11.13`），工作树有 28 个 tracked 改动 + 未跟踪的 `src/loop.ts`、
`src/loop-surface.ts`、`test/loop.spec.ts`、`test/loop-surface.spec.ts`、`test/heartbeat-guard.spec.ts`、
`.rsi/HEARTBEAT.md`、`.rsi/tools/heartbeat-guard.sh`——即 round 14 的代码已经写完但未提交。本轮只改文档、
记录与版本，**未改任何运行时源码**（`src/`、`test/` 的改动都是本轮的既有工作，由发布提交一次落库）。

**门禁（`CONFIRMED`）**：
- `npm run typecheck` → exit 0，无输出。
- `npm run ci` → exit 0，`Test Files 60 passed (60)`、`Tests 1081 passed (1081)`、
  `Found 22 warnings and 0 errors`（oxlint），日志 `.rsi/evidence/round-014/ci.txt`（发布脚本那次）。
  文档侧先跑的一次是 `Test Files 60 passed` / `Tests 1080 passed`
  （`.rsi/evidence/round-014/pre-release-ci.txt`）：两次之间 `test/loop-surface.spec.ts` 多了 1 条
  路由用例，所以差 1，两个数字各带自己的日志，不合并成一句。
  上一轮基线 57 文件 / 1022 测试（`v0.11.13`）→ 本轮 +3 文件 / +59 测试；无删除、无 skip。
- 目标用例单独跑：`npx vitest run test/loop.spec.ts test/loop-surface.spec.ts test/heartbeat-guard.spec.ts`
  → `3 passed (3)` / `54 passed (54)`（27 + 13 + 14）。

**文档事实核对（`CONFIRMED`，逐条命令）**：
- `grep -rn "grok-workflow/loop" src/` → 仅 `src/loop.ts:56`（常量）。`src/client/index.js` 无任何
  该路由的调用点，所以「输入框旁的开关」**不存在**；README 两语种与 CHANGELOG 据此改写/写明。
- `grep -n "loopEnabled\|loopMaxRounds\|loopFailStreak\|loopIntervalMin" src/config.ts` → 四个键进
  `CONFIG_KEYS`、schema（`.volatile()`）、`resolveConfig`（`loopEnabled` 布尔校验 + 三个整数范围）。
- README 双语的表格四行 + 各自一节「Repeat runs / 自动接着跑」+ 已知限制一条互相一致；
  `test/docs-config-keys.spec.ts`（键表/键数/示例可载入）与 `test/docs-version.spec.ts`
  （版本句、安装 pin、已发布列表、CHANGELOG 首节 = 包版本）在 `npm run ci` 中全绿。

**未验证（`NOT_RUN`）**：真机心跳投递（`NOT_RUN`——没有创建/修改/删除任何定时任务，D-066 规定第一条
心跳是操作者动作）；在活的 Web GUI 中点击一个会 POST 该路由的控件（控件尚未实现，见 D-069「现状」）。

**发版动作（`CONFIRMED`）**：`0.11.14`（patch）。`package.json` + `package-lock.json` 联动；
两份 README 的版本句/安装 pin/已发布列表与 `docs/LOCAL-TESTING.md` 压缩包名同步；
`CHANGELOG.md` 插入 `## [0.11.14] - 2026-11-18` 双语并把 `[Unreleased]` 留空；
`.rsi/tools/finish-round.py` 走 R6 流程：一次 CI → ROUND.md/LOG.md/ledger → 单次提交 →
annotated tag `v0.11.14` → push main + push tag。**未移动任何旧标签、未 force-push、未发布 npm。**
commit 与推送结果见 `.rsi/ROUND.md` Round 14、`.rsi/evidence/round-014/git.txt`。

**发布结果（`CONFIRMED`，命令与输出）**：
- `git log --oneline -1` → `20eafea feat(loop): Host-scheduled repeat-run surface + bilingual docs (RSI round 14)`。
- `git rev-parse v0.11.14` → `2a7b0748576f3b4b6b8ccfc655f8e53b4ad72b80`；
  `git rev-parse 'v0.11.14^{commit}'` → `20eafea150d34d18dc99bae7523db62c1d8fcb38`。
- `git ls-remote origin main 'v0.11.14'` → `refs/heads/main` = `20eafea…`、`refs/tags/v0.11.14` =
  `2a7b074…`；`git merge-base --is-ancestor 20eafea origin/main` → 通过。
- `git ls-remote origin 'refs/tags/v0.11.13*'` → object `bac26e3f…` / peel `7a79efb…`，与 round 13 记录一致
  → **旧标签未被移动或覆盖**。`git ls-remote --tags origin` 的标签集合与本地 `git tag -l 'v*'`
  对比（`comm -3`）无差异（40 个标签）。
- 未强推（`git push origin main` 为 fast-forward，脚本在 tag 已存在或 CI 红时会 `REFUSED` 而不是重试），
  未发布 npm。
- **发布后树状态**：另一个进程在本提交之后继续修改了 `src/loop.ts`、`src/loop-surface.ts`、
  `test/loop-surface.spec.ts`（路由 `413`/`409` 用例）。这些改动不在 `20eafea` 中，本轮未提交它们，
  因此**当前工作树不是干净的**——这是如实记录，不是本轮引入的缺陷。

**发布后事故与修复（`CONFIRMED`，逐条命令与 run id）**：
- **远端 CI 红在发布提交上**：`gh run list --workflow ci.yml` → headSha `20eafea` = `failure`
  （run `44345615218`）、headSha `81a76ec` = `failure`（run `44347643600`）、headSha `8c8e367` =
  `success`（run `44349708692`）。本地 `npm run ci` 之所以全绿，是因为它跑的是**工作树**；远端跑的是
  **提交内容**。
- **Release 工作流失败**：`gh run list --workflow release.yml` → headSha `20eafea` = `failure`
  （run `44345622700`）；逐步骤看（`gh api …/runs/44345622700/jobs`）失败点在
  **`Verify committed build artifacts`**，其后的 `Test`/`Create GitHub Release` 全部 `skipped`。
  `gh release view v0.11.14` → **release not found**。
- **根因（`CONFIRMED`，在标签提交的干净 worktree 里复现）**：`git worktree add .worktrees/verify-2014
  20eafea` → `npm run build` → `git diff --stat -- lib/` = `lib/loop.js` ±41/−16、
  `lib/loop.js.map`、`lib/loop.d.ts.map`。即**提交里的 `lib/` 与提交里的 `src/` 不是同一次构建**：
  `git show 20eafea:src/loop.ts | grep -c callSchedule` = 12，而
  `git show 20eafea:lib/loop.js | grep -c callSchedule` = 0。`git status --porcelain -- src/` 在该
  worktree 里为空，所以不是 worktree 本身的问题。原因是同一棵工作树里另一个进程在 `npm test` 与
  `git add` 之间改了 `src/loop.ts`。
- **修复（`CONFIRMED`）**：`8c8e367 fix(build): rebuild lib/loop.js so the committed artifacts match
  the released source` —— 只含构建产物（`lib/loop.js` / `.js.map` / `.d.ts.map`），零源码改动；
  在独立 worktree 里对 `main` 的 `src/`（与标签提交的 `src/` 逐字节相同：`git diff --stat 20eafea
  main -- src/ test/` 为空）重新构建后提交，`git push origin lib-repair:main` 为 fast-forward
  （`81a76ec..8c8e367`）。远端 CI `success`（run `44349708692`）。
- **未做（按规则不做）**：**没有移动、删除或重打 `v0.11.14`**（已发布标签不可变），因此该标签
  **没有 GitHub Release**；`workflow_dispatch` 会 checkout 同一个不可变提交，重跑只会在同一步再失败。
  干净做法是从 `main` 打下一个 patch 版本；那是新建 Release，需操作者/lead 明确授权，本轮不自作主张。
- **连带事实（`CONFIRMED`）**：`20eafea` 的 `src/loop.ts` 带着 `loop/schedule-refused` 映射，但当时
  工作树里的 413/409 两条路由用例**没有**进这次提交（`git show 20eafea:test/loop-surface.spec.ts |
  grep -cE "413|409|schedule-refused"` = 0）。这两条用例与更多 `src/` 改动在本轮结束时仍在工作树里，
  未提交，留给下一轮连同验证一起落地。

## Round 61 — 2026-11-19 — RSI round 15：`v0.11.14` 发布事故收口（`0.11.15`，patch）（`CONFIRMED`）

**前提（`CONFIRMED`）**：主工作树 HEAD = `b0d6d10`、与 `origin/main` 平齐，但有另一位写入者的
21 个 tracked 改动 + 6 个未跟踪条目（客户端开关、`src/loop-brakes.ts`、`scripts/verify-lib.mjs` 等）。
本轮不碰它们：发版在独立克隆 `.worktrees/release-015` 里做（`git clone --no-hardlinks` 自本地仓，
`origin` 改回 `https://github.com/free6589/dsh-grok-workflow.git`），基线 `b0d6d10`。
`npm ci`（缓存指向工作区 `.tmp/`，因为默认 npm 缓存只读）后 `npm run build`，
`git diff --stat -- lib/` 为空——`main` 的已提交产物与它自己的源码一致；事故只存在于已发布的标签里。

**事故复述（`CONFIRMED`，命令）**：
- `git show 20eafea:src/loop.ts | grep -c callSchedule` = 12；`git show 20eafea:lib/loop.js | grep -c callSchedule` = 0。
- `gh run list --workflow release.yml` → headSha `20eafea` = failure（run `44345622700`）；逐步骤
  （`gh api …/runs/44345622700/jobs`）失败在 `Verify committed build artifacts`，其后包括
  `Create GitHub Release` 的步骤全部 `skipped`。
- `gh release view v0.11.14` → `release not found`；`gh release list` 最新仍是 `v0.11.13`。

**门禁（`CONFIRMED`）**：
- `npm run typecheck` → exit 0，无输出。
- `npm run ci` → exit 0，`Test Files 60 passed (60)`、`Tests 1081 passed (1081)`、
  `Found 22 warnings and 0 errors`（oxlint）。日志 `.rsi/evidence/round-015/pre-release-ci.txt`；
  发布脚本那次 `.rsi/evidence/round-015/ci.txt`。基线 `v0.11.13` = 57 / 1022，本轮 +3 文件 / +59 测试，
  无删除、无 skip；CI 重建后 `git diff --stat -- lib/` 仍为空。
- 文档守卫（`test/docs-version.spec.ts` 8、`test/docs-config-keys.spec.ts` 12、
  `test/docs-architecture-version.spec.ts` 3）全部在 `npm run ci` 内通过：README 版本句/pin/已发布列表
  与 `package.json` 一致，`[Unreleased]` 之后第一节 = `[0.11.15]`，每个已发布标签都有 CHANGELOG 节。

**改动（`CONFIRMED`）**：`src/`、`test/` 零改动（`git diff --stat -- src/ test/` 为空）；`package.json` /
`package-lock.json` / 两份 README 的版本句、安装 pin、已发布列表与 `docs/LOCAL-TESTING.md` 压缩包名由
`bump-version.py 0.11.15` 同步；README 中英的测试数改为 1081 / 60，并在「已发布」一句后写明
`v0.11.14` 不是发布版本、请固定 `v0.11.15`（避免 README 把用户送到一个没有 Release 的标签上）；
`CHANGELOG.md` 新增双语 `## [0.11.15] - 2026-11-19`；`DECISIONS.md` 新增 `D-070`。

**发版（`CONFIRMED`）**：`python3 .rsi/tools/finish-round.py --round 15 --version 0.11.15 --spec
.tmp/rsi-round-15.json --resume` → 单次提交 → annotated tag `v0.11.15` → `push origin main` →
`push origin v0.11.15`。未移动/删除/重打任何旧标签（`v0.11.13` object `bac26e3`、peel `7a79efb` 前后一致），
未 force-push，未发布 npm。commit、tag object/peel 与远端 CI/Release run id 见 `.rsi/ROUND.md` Round 15。

**未验证（`NOT_RUN`）**：npm 发布（未授权）；真机心跳投递（D-066 规定第一条心跳是操作者动作）；
主工作树里另一位写入者的客户端开关与 `verify:lib`（不属于本轮，未提交、未审阅、未运行其测试）。

**落地后验证（`CONFIRMED`，命令与输出）**：
- `git rev-parse 'v0.11.15^{commit}'` → `50c0321e371db076908d5fb6cec94bb8be25f37b`；
  `git rev-parse v0.11.15` → `e52a8f4c415a7619891be4fbad04c247439baba9`（annotated tag object）。
- `git ls-remote origin main 'refs/tags/v0.11.1*'` → `refs/heads/main` = `50c0321…`；
  `refs/tags/v0.11.15` = `e52a8f4…`（peel `50c0321…`）；`v0.11.14` = `2a7b074…` / peel `20eafea…`、
  `v0.11.13` = `bac26e3…` / peel `7a79efb…`，与前次记录逐字节一致。
- `gh run list` → headSha `50c0321`：CI = success（run `44359410024`）、Release = success
  （run `44359422843`）。`gh api …/runs/44359422843/jobs` 显示 16 个步骤全部 `success`，
  包括 `Verify committed build artifacts`、`Test`、`Create GitHub Release`。
- `gh release view v0.11.15` → 非 draft、非 prerelease，资产 `dsh-grok-workflow-0.11.15.tgz`
  （523743 B），`gh release list` 中为 Latest。
- `npm run ci` 在发布提交 `50c0321` 的干净树上 exit 0（60 文件 / 1081 测试）且
  `npm run verify:lib` 报 `lib/ at 50c0321 is the build of src/ at 50c0321 (141 files,
  byte-identical)`，`git diff --exit-code -- lib/` 为空（`.rsi/evidence/round-015/ci-committed.txt`）。
- **并发记录**：首次 `push origin main` 被拒（远端在运行期间前进到 `09d5daa`）；rebase 后重推，
  本地未推送过的 `v0.11.15` 标签删除并在 rebase 提交上重建。未 force-push。


## 2026-11-19 — `host_loop_service` 判据（A27）与文档记忆回接（`CONFIRMED`）

**范围**：只改文档（`docs/knowledge/RESEARCH.md`、`docs/knowledge/DECISIONS.md`、`docs/knowledge/HANDOFF.md`、
本文件）；`git status --short -- src test lib` 在本轮开工与收工时都只含他人未提交的改动，本轮**没有**写
`src/`、`test/`、`lib/`，也没有创建、修改或删除任何 Schedule 任务。

**做了什么（`CONFIRMED`）**：

- `RESEARCH.md` 新增 **A27**：「Host 侧 LoopService 是谁的对象：怎么挂、靠什么活、谁在什么时候删行」。
  依据 `src/index.ts:297/305`（apply 期建对象 + 装面）、`src/index.ts:290-296`（策略在 open 时读）、
  `src/loop.ts:504-512`（`scheduleServiceOf` 的 `ctx.get('schedule')` + 鸭子类型三方法）、
  `src/loop.ts:350`（`loop/unavailable`）、`src/loop-surface.ts:312-316`（503 映射）、
  `src/loop-surface.ts:96-141`（两个事件监听、卸载 disposer、两个 `mount`）、
  `src/loop.ts:460-476 / 477-479 / 543-551 / 566-579`（删光、删一行、删除即 `edit({action:'delete'})`、
  按 `catalog` 复核计数）、`test/loop-surface.spec.ts:228 / 241 / 263-293`、`test/loop.spec.ts:511-515`。
- `RESEARCH.md` A24 §5b 加一句时态更正：客户端控件只在**已落地**的 `v0.11.15` 缺席；工作树里
  `src/client/index.js:3522` 与 `src/loop-brakes.ts` 是另一位写入者未提交、未审阅的改动，
  `grep -rn "grok-workflow/loop" src/` 现在是 3 处（`src/loop.ts:70`、`src/client/index.js:3522`、
  `src/loop-brakes.ts:210`）。
- `DECISIONS.md` 撞号收口：被覆盖的既有决定重新落位——round 15 的发布事故条恢复为
  **`D-070`**，预设缺口条改为 **`D-071`**；`RESEARCH.md` A26 的引用同步改写。
- `STATE.md` / `HANDOFF.md` / `VALIDATION.md` / `.rsi/ROUND.md` / `.rsi/STATE.md` 的 round 15 记录
  被旧副本覆盖（`git diff --numstat` 分别为 `1/48`、`0/11`、`0/17`、`0/17`、`85/60`，四个纯删除、
  一个整篇回退），用 `git checkout HEAD -- <这五个文件>` 复原，复原不会丢掉他人的新增内容。

**命令与结果（`CONFIRMED`）**：

- `npx vitest run test/docs-version.spec.ts test/docs-config-keys.spec.ts test/docs-architecture-version.spec.ts`
  → `Test Files 3 passed (3)` / `Tests 23 passed (23)`，exit 0（07:36:58）。
- `grep -rn "ctx\.set" src/` → 4 处，全部是 `ctx.settings` 的注释字（`src/naming.ts:196`、
  `src/settings.ts:11/31/37`），零次服务注册——A27 §1 的依据。
- `grep -rn loopEnabled src/` → 命中只有 `src/config.ts`（schema/默认/repair）、`src/types.ts:157/200`、
  两处注释（`src/loop.ts:5`、`src/index.ts:295`）、以及客户端设置页/工作树里的 composer 开关；
  `src/loop.ts` 内唯一一处 `loopEnabled` 是文件头注释——「打开设置页的开关不会产生任何 `open`」的依据。

**未验证（`NOT_RUN`）**：真机上的「重载」语义（改设置是否重装插件 fiber、从而跑一次卸载 disposer）；
真机心跳投递与 `POST /grok-workflow/loop` 端到端。两者都要常驻 Host + 真实 profile，本机沙箱下未起实例。

**不是本轮结论的（`HYPOTHESIS`）**：`src/index.ts:292` 注释「an open loop survives a plugin reload and
an unload deletes it」的两半只有在「reload = Schedule 子 fiber 重启」时才同时成立；若「reload」包含插件
自身 dispose，行会被删掉。改注释要连 `lib/` 一起重建，留给拥有 `src/` 的那一轮。

## 2026-11-19 — RSI round 16：续跑开关 + 心跳刹车的门禁与本机核对（`CONFIRMED`）

**范围**：本轮把「composer dock 开关 + `src/loop-brakes.ts`」这份**未提交的实现**核对并落地：只补
`CHANGELOG.md` `[Unreleased]`、`DECISIONS.md` D-072（+ 两处过时句指回）、本文件 / `STATE.md` /
`HANDOFF.md` / `.rsi/ROUND.md` / `.rsi/STATE.md` 的本轮记录；`src/`、`test/` 的代码内容未在本轮改动
（开工指纹与收工复算一致：`src/loop.ts 55483a52…`、`src/loop-brakes.ts 34f56e70…`、
`src/client/index.js d2907655…`、`src/gate.ts 332d2313…`、`src/config.ts c4d05357…`）。本轮没有启动
DSH 实例，也没有创建、修改或删除任何 Schedule 任务。

**命令与结果（`CONFIRMED`，全部在静止的主工作树上跑，07:52-08:0x）**：

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| `git rev-parse HEAD` / `git status --porcelain \| wc -l` | `37cb0fc` / 46 条 dirty | `.rsi/evidence/segment-5/pre-head.txt`、`pre-status.txt` |
| `npm run build` | exit 0，`client bundle: 224412 bytes → lib/client.js` | `.rsi/evidence/segment-5/build-seg5-attempt2.txt` |
| 构建前后 `lib/`（145 文件）md5 清单比对 | **diff 为空**（幂等：树里的 `lib/` 就是这份 `src/` 的构建） | `lib-before.md5` / `lib-after-build.md5` / `lib-build-idempotence.txt` |
| `npx tsc -p tsconfig.json --noEmit` | exit 0，无输出 | `typecheck-attempt2.txt` |
| `npx oxlint src test` | exit 0，`Found 22 warnings and 0 errors`（107 文件） | `lint-attempt2.txt` |
| `npx vitest run` | exit 0，**62 文件 / 1139 测试 PASS**（24.21s） | `full-vitest-attempt2.txt` |
| `npm run verify:lib`（提交前，检验的是 `37cb0fc`） | exit 0，`lib/ at 37cb0fc is the build of src/ at 37cb0fc (141 files, byte-identical)` | `verify-lib-precommit.txt` |

**逐文件计数（同一次全量运行）**：`test/client.spec.ts` 92 · `test/loop.spec.ts` 30 ·
`test/loop-brakes.spec.ts` 35 · `test/loop-surface.spec.ts` 16 · `test/loop-runtime-wiring.spec.ts` 5 ·
`test/config.spec.ts` 36 · `test/config-limits-repair.spec.ts` 24 · `test/settings-projection.spec.ts` 4 ·
`test/docs-config-keys.spec.ts` 12 · `test/docs-version.spec.ts` 8。

**为什么 `verify:lib` 要跑两次**：这个脚本导出的是 `HEAD`，比对的是 `HEAD` 的 `lib/` 与 `HEAD` 源码的
构建。提交前它只能证明 `37cb0fc` 那一对是自洽的（141 文件；`HEAD` 里没有 `src/loop-brakes.ts`，客户端
bundle 是 206901 B，比工作树这份 224412 B 小 17511 B —— 差额就是 dock 开关那段）。提交后那一次才是对
本轮提交的证明。

**落地与提交后的核对（`CONFIRMED`）**：commit `e11d1009e0fc8b89a1ec8f1e20260c0802427336`（84 文件，
+8136 / −119）；`git push origin main` 快进 `37cb0fc..e11d100`，`origin/main` = `e11d100`；
`npm run verify:lib` → `lib/ at e11d100 is the build of src/ at e11d100 (145 files, byte-identical)`；
远端 CI run `44425357004` = **success**（`gh run view 44425357004`：`Node 22` success、`Node 24` success）；
`git status --untracked-files=no` 提交后为空（唯一未跟踪项是 `settings-simple-mock.html`，按 round 15 的
结论不入库）。没有 bump 版本、没有打标签、没有 GitHub Release、没有 npm 发布。

**未验证（`NOT_RUN`）**：真实 Web GUI 里点一次开关（需要常驻实例 + 浏览器会话）；真实心跳投递
（D-066 把第一跳定为操作者动作）；插件 reload 时 `Schedule` 子 fiber 的重启语义（A27 §5 的
`HYPOTHESIS`，本轮没有改动 `src/index.ts` 的注释）。

**证据索引**：`.rsi/evidence/segment-5/`（本轮全部日志与指纹）、`D-072`、`docs/knowledge/STATE.md`
Round 16 段、`.rsi/ROUND.md` Round 16。

## Round 62 — 2026-11-19 — RSI round 17 phase-1：Q5 心跳识别 bug 修 + F1 设置面说法统一（`CONFIRMED`，未发版）

**范围**：round 17 四个验证片（`baseline` / `ci` / `heartbeat-live` / `install`，证据
`.rsi/evidence/round-017/`）之后，对它们交出的两个 FAIL 做产品代码修复。
改动文件：`src/loop.ts`（`isLoopHeartbeat` 接受 DSH 包装形状）、`src/config.ts` /
`src/settings.ts` / `src/client/index.js`（注释 13→11/13）、`src/settings.ts`
（`describeSurface` 报 `11 of 13 field(s) on the page`）、`test/loop.spec.ts`（framing 用例）、
`test/gate.spec.ts`（`heartbeat classification` 2 条）、`test/config.spec.ts` /
`test/reliability.spec.ts`（计数断言改显式新文案）、`CHANGELOG.md`（`[Unreleased]` Fixed
两条，双语）、`README.md` / `README.zh-CN.md`（测试数 60/1081→62/1142）、记忆文件
（D-073、A28、本轮 STATE/HANDOFF/VALIDATION 段）。未动 `.rsi/ROUND.md` / `ledger.jsonl`
（round 17 的轮次记录等发版时由 `finish-round.py` 写）。

**命令与结果（`CONFIRMED`，共享树实跑）**：

| 命令 | 结果 |
| --- | --- |
| `npx vitest run test/gate.spec.ts test/loop.spec.ts`（修后） | 2 文件 / 83 测试 PASS（gate 47→52，loop 30→31） |
| `npx vitest run test/loop.spec.ts test/config.spec.ts test/reliability.spec.ts test/settings-projection.spec.ts` | 4 文件 / 96 测试 PASS |
| `npm run ci`（修后全量） | exit 0，**62 文件 / 1142 测试 PASS**（24s 内），lint 22 warnings / 0 errors |
| README 计数复核 | 与本次 `ci` 实测 62/1142 一致 |

**为什么修**：Q5（`results/00-verdicts.md`）——真机投递文本被 DSH 包了一层，
旧识别函数永远判 false，心跳分支与六道刹车在真机上不可达；F1（`install/00-conclusion.md`）——
13/11/“21 volatile fields”三处说法互相打架，`settings/describe` 实测投影 11 键。
两者都是“说法/识别”缺陷，不是安装失败：安装验收除 F1 外 10 项全 PASS。

**未验证（`NOT_RUN`，与上轮相同）**：rrule 定时到点的那次投递；真模型跑整轮；GUI 点击开关；
unload/归档监听的 firing（操作体已 CONFIRMED）。`src/index.ts:292` 注释仍是 HYPOTHESIS，未动。

## Round 64 — 2026-11-19 — RSI round 19：载入期路由校验漏掉 `supervisor`（`CONFIRMED`）

**编号说明**：本文件里 `## Round 63` 出现了两次（`:5` 发版记录、`:31` 常驻监护落地），
编号已经撞车。历史段不重写，本轮从 64 继续。

**缺陷**：`src/settings.ts:94` 的 `ROLE_ORDER` 只有 planner/worker/verifier/synthesizer。
`validateRoutes` 与「2+ 路由全空 `maxInFlight`」提示都从这张表取角色，所以
`roles.supervisor` 完全不在载入期校验范围内：provider 不在注册表、模型不在 provider
目录，都能装载成功，直到**那个任务**核验完、supervisor 环节真的被调用时才炸——那时
该任务的 worker 与 verifier 孩子调用已经付过费（`src/script.ts:1945`）。README 与 `docs/ARCHITECTURE.md` 当时都写「每个配置
的路由都校验」，实测只校验四个角色，按「记忆不覆盖实测」以实测为准。

**改动**：`src/settings.ts`（`ROLE_ORDER` 补 `supervisor`，与 `src/report.ts` 的
`ROLE_NAMES` 同序，并把「为什么必须有它」写进常量注释）、`test/config.spec.ts`
（新用例「checks every routed role, the supervisor included」：五角色 × 好/坏 provider/
坏模型的 3×5 断言）、`test/route-concurrency.spec.ts`（supervisor 两条空 cap 出提示、
有一条 cap 不出提示）、`README.md` / `README.zh-CN.md`（载入校验清单补 provider 与模型
存在性、写明含 `supervisor`）、`docs/ARCHITECTURE.md`（「all five routed roles,
`supervisor` included」）、`DECISIONS.md` D-075。

**命令与结果（`CONFIRMED`，本树实跑）**：

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| 基线 `npm run ci`（`6ee2e68`，改前） | exit 0，63 文件 / **1154** 测试 PASS | `.rsi/evidence/round-019/baseline-ci.txt` |
| 修前探针（`node …/probe-supervisor-route.mjs`） | supervisor 两种错配置各 **0** 条 error，其余四角色各 1 条 | `probe-supervisor-route-RED.txt` |
| 只 stash `src/settings.ts`，跑两条 spec | **2 failed / 49 passed**（断言原文：`expected '' to contain 'roles.supervisor names provider "nope"'`） | `red-spec-run.txt` |
| 恢复修复后同两条 spec | **51 passed** | `green-spec-run.txt` |
| 修后探针 | 五角色各 1 条 error（provider / 模型两个变体都是） | `probe-supervisor-route-GREEN.txt` |
| 修复后 `npm run ci` | exit 0，`tsc --noEmit` 0 error，oxlint **22 warnings / 0 errors**，63 文件 / **1155** 测试 PASS（+1，与基线比无删除无 skip） | `ci-post-fix.txt` |
| `npm run build` ×2 与 `diff -r` | 两次构建产物目录完全一致（幂等），`client bundle: 224525 bytes` | `lib-build-idempotence.txt` |

**未验证（`NOT_RUN`）**：在真实 profile 里放一条指向注册表外 provider 的 supervisor 路由
看装载是否被拒（需要改本机 profile 的 patch 文件，属操作者环境，本轮不碰）；真模型整轮。

**迁移**：若某 profile 的 supervisor 链指向未注册 provider 或 provider 未宣告的模型，
该行现在会装载失败。修法：改成已注册 provider / 已宣告模型，或只把该路由的 `provider`
留空（`validateRoutes` 视为继承 run 的 provider，`src/settings.ts:211`）。**不要**删掉
整条 supervisor 链——空链 = 监督门不跑（`src/script.ts:1945`、`:2418`），不是「行为不变」。

## Round 65 — 2026-11-19 — RSI round 20：诊断台账 `Model routes:` 行漏掉 `supervisor`（`CONFIRMED`）

**缺陷（`CONFIRMED`，本树实跑）**：`src/delivery/index.ts:695` 的 `machineLedger()`
只列四个角色（planner/worker/verifier/synthesizer），而 `src/report.ts:835` 的
`renderReport()` 列五个（`ROLE_NAMES` 含 supervisor）。有 supervisor 链的 run 在
ledger 里读成「无监督」（全 `inherit` 的那行里没有 supervisor 段）。红探针：
临时 spec 断言 `ledger` 含 `supervisor=p1/m-sv`，结果 `1 failed`
（`AssertionError: expected '…Model routes: planner=inherit; worker=inherit;
verifier=inherit; synthesizer=inherit' to contain 'supervisor=p1/m-sv'`），
见 `.rsi/evidence/round-020/red-spec-run.txt`。

**改动**：`src/delivery/index.ts`（角色表四改五，与 `ROLE_NAMES` /
`ROLE_ORDER` 同序；`MACHINE_DETAIL` 的 `role=` 剥离正则补 `supervisor`，让人话块
同样不透出 supervisor 的路由赋值）、`test/delivery.spec.ts`（新用例：supervisor
链具名 + 与 `renderReport` 同行逐行相等）、`test/report.spec.ts`（既有链用例补
一条 supervisor 链断言）、`DECISIONS.md` D-076、`lib/` 重建。

**命令与结果（`CONFIRMED`，本树实跑）**：

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| 基线 `npm run ci`（`762becc`，改前） | exit 0，63 文件 / **1155** 测试 PASS | 见轮内记录 |
| 红探针（临时 spec，修前） | **1 failed** | `red-spec-run.txt` |
| 修后 `test/delivery.spec.ts` + `delivery-human-block` + `report` + `human-output-contract` | **4 files / 75 passed** | `green.txt` |
| 修后 `npm run ci` | exit 0，`tsc --noEmit` 0 error，oxlint **22 warnings / 0 errors**，63 文件 / **1156** 测试 PASS（+1，无删除无 skip） | `ci.txt` |
| `npm run build` ×2 与 `diff -r` | 两次构建一致（幂等），`client bundle: 224525 bytes` | `build-twice-*.txt` |
| `npm run verify:lib` | 149 files, byte-identical | `verify-lib.txt` |

**未验证（`NOT_RUN`）**：真模型整轮（改动在渲染层，Loader 路径由 `loader.spec.ts` 覆盖）；
GUI 点击；rrule 定时到点。`src/run.ts:141` 的 `configRouteLabels` 仍是四角色——那是
C1 hint 输入，不是本轮主题，留给下一轮。

## Round 66 — 2026-11-19 — RSI round 21：C1 跨 run 路由提示漏掉 `supervisor`（`CONFIRMED`，未发版）

**缺陷**：`src/run.ts` `configRouteLabels()` 只摊平四个角色，`roles.supervisor` 链从不进入
C1 跨 run 忙闲快照（`.rsi/POOL.md` R21）。修前探针：只加新用例、不改源码，
`test/route-concurrency.spec.ts` **1 failed / 14 passed**，断言显示实收缺 `"sup/watcher"`
（`AssertionError: expected [ 'plan-a', 'p1/m1', 'check-a', …(1) ] to deeply equal
[ 'plan-a', 'p1/m1', 'check-a', …(2) ]`），见 `.rsi/evidence/round-021/red-spec-run.txt`。

**改动**：`src/run.ts`（角色元组四改五，顺序 = `src/report.ts` `ROLE_NAMES` =
`src/settings.ts` `ROLE_ORDER`）、`test/route-concurrency.spec.ts`（五角色完整标签列表用例）、
`CHANGELOG.md` `[Unreleased]` 双语 Fixed、`lib/` 重建。版本号未动。

**命令与结果（`CONFIRMED`，本树实跑）**：

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| 修前 `npx vitest run test/route-concurrency.spec.ts` | **1 failed / 14 passed** | `red-spec-run.txt` |
| 修后同命令 | **15 passed** | `green-spec-run.txt` |
| 收工复跑同命令 | **15 passed** | 本轮实跑 |
| `npm run typecheck` | exit 0，0 error | `typecheck.txt`、`ci-cleanup.txt` |
| `npm run ci`（改后） | exit 0，63 文件 / **1157** 测试 PASS，oxlint **22 warnings / 0 errors** | `ci.txt` |
| `npm run ci`（清理收尾后复跑） | exit 0，63 文件 / **1157** 测试 PASS | `ci-cleanup.txt` |
| `npm run build` ×2 + `diff -r` | 两次一致（幂等），`client bundle: 224525 bytes` | `build-second.txt`、`build-twice.diff`（空）、`build-idempotent.txt` |
| `npm run verify:lib` | `lib/ at 3cd68eb is the build of src/ at 3cd68eb`（149 files byte-identical） | `verify-lib.txt` |

**脏树与遗留文件**：`src/run.ts`、`test/route-concurrency.spec.ts`、`CHANGELOG.md`、
`lib/run.*`、`.rsi/evidence/round-021/` 均保留并提交（`3cd68eb`）；
`settings-simple-mock.html`（根目录遗留，`sha256 3fe1e657…`）存入
`.rsi/archive/settings-simple-mock.html` 后可恢复，根副本已删；仓库内无其它
`.bak/.orig/.tmp`（`.tmp/v100x-patch.bak` 在 `.gitignore` 的 `.tmp/` 内，属本地草稿区）。

**未验证（`NOT_RUN`）**：两个真实并发 run 的避让效果；GUI 中观察提示；发版（本任务不授权）。

## Round 67 — 2026-11-19 — RSI round 22：checkpoint `durationMs` 按行数上限丢时长（`CONFIRMED`，未发版）

**缺陷（`CONFIRMED`，本树实跑）**：`src/checkpoint/wiring.ts:786` 的 `snapshot()`
用 `CHECKPOINT_LIMITS.countCeiling`（1e6，行数上限）卡 `time.durationMs`，而读侧
`src/checkpoint/schema.ts:624` 接受到 `msCeiling`。跑超 16 分 40 秒的 run（默认
60 分钟死线的 run 全在此列）写成功但没有 `durationMs`——「跑了多久」这个唯一字段
丢了。红探针：可控时钟 33m20s，`snapshot().time.durationMs` 为 `undefined`
（`AssertionError: expected undefined to be 2000000`），见
`.rsi/evidence/round-022/red-spec-run.txt`。`POOL.md` R10 把因果写反了（说读侧卡
`countCeiling`），实测是写侧，以实测为准。

**改动**：`src/checkpoint/wiring.ts`（上限 `countCeiling` 改 `msCeiling` + 注释说明
为什么；「超限省略、永不截断」语义不变）、`test/checkpoint-wiring.spec.ts`
（新增 48h 用例，断言 `durationMs === 2 * day`）、`CHANGELOG.md` `[Unreleased]`
双语 Fixed、`DECISIONS.md` D-077、`lib/` 重建。版本号未动。

**命令与结果（`CONFIRMED`，本树实跑）**：

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| 修前临时探针 | **1 failed**（`expected undefined to be 2000000`） | `red-spec-run.txt` |
| 修后 `checkpoint-wiring` + `checkpoint-schema` + `checkpoint-engine-wire` | **3 files / 69 passed** | `green.txt` |
| 修后 `npm run ci` | exit 0，63 文件 / **1158** 测试 PASS，oxlint **22 warnings / 0 errors** | `ci.txt` |
| `npm run build` ×2 | 两次一致（幂等） | `build-twice.txt` |
| `npm run verify:lib` | byte-identical | `verify-lib.txt` |

**未验证（`NOT_RUN`）**：真实 16 分钟以上 run 的 checkpoint 回读（需要真跑一个长 run；
写入语义由单测覆盖）；发版（本任务不授权）。

## Round 68 — 2026-11-19 — 用户报障：续跑开关点不动 + `HTTP undefined`（`CONFIRMED`，未发版）

**缺陷（`CONFIRMED`，本树实跑 + 复现）**：`src/client/index.js` `LoopSwitch` 的生产默认
`const send = ... ? props.loopSend : loopSend` 把**请求体形**的 `loopSend(body, fetchImpl)`
当成了 **fetch 形**的发送函数。真机浏览器不传 `loopSend` prop，于是每次 `readLoop` 都在
`loopSend` 内部再包一层 `loopSend`：内层把外层的 `{action, sessionId}` 当 URL 去 `post()`，
返回的 `{ok:false, code:'loop/transport'}` 对象没有 `.status`，外层 `parseLoopPayload`
读到 `status === undefined`，开关永远 `phase: 'failed'` + 点不动，文案正是用户截图那句
`续跑服务没有回应：the loop route answered HTTP undefined`。复现（node 直跑双层调用）：
`PROD-PATH RESULT: {"ok":false,"code":"loop/response","error":"the loop route answered HTTP undefined"}`。

**改动**：`src/client/index.js`（默认改走页面自己的 `fetch`，无 fetch 的非页面环境才回退
`loopSend`；注释同步）、`test/client.spec.ts`（新增生产路径回归用例：不传 `loopSend`、
注入页面 fetch，mount→读→点开→点关全通）、`CHANGELOG.md` `[Unreleased]` 双语 Fixed、
`lib/` 重建。版本号未动。

**命令与结果（`CONFIRMED`，本树实跑）**：

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| 修前双层调用复现 | `loop/response` + `HTTP undefined` | 本轮记录（上） |
| 新增用例 `uses the page fetch on the production path` | PASS（含在 93 例内） | `ci.txt` |
| `npm run ci`（改后） | exit 0，63 文件 / **1159** 测试 PASS，oxlint **22 warnings / 0 errors** | `.rsi/evidence/round-023/ci.txt` |
| `npm run build` ×2 | `client bundle: 224700 bytes`，`src/client/index.js` 与 `lib/client.js` sha256 一致 | 工作树 `M lib/client.js` |
| `npm run verify:lib` | 提交前的 HEAD 仍一致（新改动尚未提交，属预期内） | 本轮实跑输出 |

**真机实测（`CONFIRMED`，复制 profile `loopfix-verify`，link 本工作树，端口 3451）**：
实例启动干净（无 `pending`/`did not activate`）；`POST /grok-workflow/loop`
`status→open→status→close→status` 全 200，关后 `schedule.json` 无残留行
（`.rsi/evidence/round-023/loop-route.txt`）；真实 bundle 的生产路径脚本
（不传 `loopSend`、cookie 走实例 jar）：mount 显示 `关`、点开变
`开 · 每 60 分钟 · 还剩 10 轮`（服务端确认 task 落地）、再点变回 `关`
（服务端确认关闭），`switch-prod-path.txt` PASS。实例已停，token/cookie 已清，
证据目录无密钥残留（`token=`/`dsh-auth-` 零命中）。

**未验证（`NOT_RUN`）**：用户自己浏览器里点一次（需用户在 GUI 操作）；发版（本任务不授权）。

## Round 69 — 2026-11-19 — `0.11.21` 发版：续跑开关生产路径修复（`CONFIRMED`）

**版本判定**：patch。开关从"点不动"恢复"能点"，配置面、报告 schema、5 角色语义都没变。

**命令与结果（`CONFIRMED`，本机实跑）**：

| 命令 | 结果 |
| --- | --- |
| `python3 .rsi/tools/bump-version.py 0.11.21` | `version=0.11.21`，5 处同步 |
| `npm run ci`（发版前全量） | exit 0，**63 文件 / 1159 测试 PASS**（`.rsi/evidence/round-023/ci-release.txt`） |
| `git commit 73cbd4b` + `git tag -a v0.11.21` + `git push origin main` + `git push origin v0.11.21` | push 成功，无 force-push，旧标签未动 |
| 远端 CI `44543705967` | success |
| Release `44543712011` | success；Release `Grok Workflow for DSH v0.11.21` 已建（asset `dsh-grok-workflow-0.11.21.tgz`） |

## Round 70 — 2026-11-19 — 用户报障：`/grok on` 之后发不出消息（`CONFIRMED`，未发版）

**用户原话**（取自本会话对话记录）：「刚才我 发提示词 到新会话 新会话无反应 这是bug
/ /grok on 打开 就无法发消息 / /grok off 就可以发消息。」

**根因（`CONFIRMED`，源码 + 复现）**：`/grok on` 写 `workflowMode: 'full'`
（`src/command.ts:142`），而 `full` 是唯一绕过交互式受理的形态：
`src/gate.ts` 的 `answerInTurn` 里 `answerTeamInteractive` 只接 `triage`
（修前 `src/gate.ts:1260` `if ((sessionShape ?? limits.mode) !== 'triage') return undefined`），
`full` 直接落到 `await produceAnswer(...)`（修前 `src/gate.ts:1458`，即
`in-turn` 把这一步一直开着等整个 workflow 跑完）。
真实 `AgentLoop` 只在当前 step 结算后才派发下一批：`dsh-agent-loop/lib/index.js`
的 `preStep()`（`:679`）第一句就是 `this.inbox.claim(target, position.turn)`（`:683`），
而 `turn()`（`:737`）的 `while (true)`（`:752`）先 `await this.preStep(...)` 再
`await this.step(decision)`（`:780`）—— 一个把整段 workflow 等完的 `agent/pre-step`
handler 会让 step 一直不结算，下一批消息就永远不被 claim。所以这一段时间里用户打的每条
消息都进队列但永不派发：默认 deadline 60 分钟（`src/config.ts:104`
`DEFAULT_TIMEOUT_MS = 3_600_000`），表现就是「发不出消息」，`/grok off` 走 `mode-off`
（`src/gate.ts:512-513`）直接 pass 所以「就行」。

**改动（最小面）**：`src/gate.ts` 新增 `answerFullBehind`（会话记录
`workflowMode==='full'` + 能后台交付时才走）：先回执、`enqueue` 后台跑
`runTeam`，结论用既有 `deliverAndRecord` 单独发一条；`src/answer.ts` 新增
`acceptedEnterText`（团队已开工的回执前言，与前台「没开工」措辞相反）；
`test/grok-on-ingress.spec.ts` 新增 5 条回归（复刻 `AgentLoop` 单步派发纪律 + 真
`Session` + 挂起引擎，无需在线模型）。部署级默认 `mode: 'full'` 保持 T4 `in-turn`
逐字不变（17 条 gate 用例钉着它）。
排队满（`FIXED_MAX_QUEUED_MESSAGES = 4`，`src/config.ts:203`）时 `enqueue` 返回
`false`，此时**不写** `started` 记录（否则会留下一条「后台已开工」而实际走的是阻塞
路径的账），直接回落 in-turn；`record(..., 'admitted-full-background')` 放在
`enqueue` 成功之后，仍在同一个同步 tick 内（`queue.tail.then(task)` 是微任务），
所以工具副作用执行前账已经落下。

**命令与结果（`CONFIRMED`，本树实跑）**：

| 命令 | 结果 |
| --- | --- |
| 修前 `npx vitest run test/grok-on-ingress.spec.ts`（4 例版） | **2 failed / 2 passed**：`dispatched` 里没有第二条消息、报告没有交付 |
| 修后同命令（4 例版） | **4 passed** |
| 修前 `npx vitest run test/grok-on-ingress.spec.ts`（5 例版，HEAD worktree） | **3 failed / 2 passed** |
| 修后同命令（5 例版） | **5 passed** |
| `npx vitest run test/gate.spec.ts test/phase1-dialogue.spec.ts test/human-output-contract.spec.ts test/grok-on-ingress.spec.ts` | **4 文件 / 99 测试 PASS**（4 例版时点）；5 例版下门禁相关 8 文件 = **191 测试 PASS** |
| `npm run typecheck` | 0 error（本任务改动的两个源文件） |

**独立复核（agent-17，2026-11-20，`CONFIRMED`）**：修前/修后各在工作树之外重跑一遍，
把结论从「作者自述」变成「可复现」：

| 命令 | 环境 | 结果 |
| --- | --- | --- |
| `npx vitest run test/grok-on-ingress.spec.ts` | `git worktree add --detach <tmp> HEAD`（修前源码，`answerFullBehind` 计数 0）+ 拷入新用例 | **exit 1，3 failed / 2 passed**（`expected [ 'refactor the parser' ] to include 'also check the lexer'`；`the report was not delivered`；`message 1 was not dispatched`）→ `docs/knowledge/evidence/grok-on-ingress-2026-11-19/repro-before-head-worktree.log` |
| 同上 | 本工作树（含修复） | **exit 0，5 passed** → `.../repro-after.log` |
| `npm run ci` | 隔离树 = `HEAD` + 只拷入 `src/gate.ts`/`src/answer.ts`/`test/grok-on-ingress.spec.ts`（把并发写入者的 `intake` 三处 hunk 还原，`src/intake.ts` 不放） | **exit 0**：typecheck 0 error、lint 22 warnings / 0 errors、`lib/ at 22bbe17 is the build of src/ at 22bbe17 (149 files, byte-identical)`、**64 文件 / 1164 测试 PASS** → `.../ci-isolated-fix-only.log` |
| `npm run ci` | 共享工作树（最终） | **exit 0**：typecheck 0 error、lint 24 warnings / 0 errors、`lib/ at 22bbe17 is the build of src/ at 22bbe17 (149 files, byte-identical)`、**67 文件 / 1218 测试 PASS** → `.../shared-tree-ci-green.log`。同日早几次跑是红的，红点全在并发写入者的半成品上（`src/client/index.js:1514` 语法错、`test/client.spec.ts` 的 `TS2304`、配置面 5 文件），随他们落地而转绿：`.../shared-tree-ci-red-parse-error.log`、`.../shared-tree-ci-red-1.log`、`.../shared-tree-ci-red-2.log` |

**未验证 / 边界（`NOT_RUN`）**：真机 GUI（浏览器里点一次 `/grok on` 再连发两条）本轮
未做——同一工作树有并发写入者（`src/loop.ts`/`src/command.ts`/`src/intake.ts`/
`src/client/index.js`），真机实例留给收尾组。`npm run ci` 已在两处跑绿：共享工作树
（67 文件 / 1218 测试）与「`HEAD` + 只本修复」隔离树（64 文件 / 1164 测试）。
**已知遗留**：部署级 `mode: 'full'` + 交互式会话仍走 in-turn（会把整步等到 run 结束）；
要改它必须连同 17 条钉住 T4 契约的用例一起改，属独立决策，不在本任务里做。

## 心跳身份与路由隔离审计 — 2026-11-20（`CONFIRMED`，未发版）

**范围**：循环心跳（`Loop heartbeat` / `[grok-workflow loop]` / `/grok-workflow/loop` /
`grok_loop`）与自迭代心跳（`RSI heartbeat` / `# RSI heartbeat — round N` / 无路由、无工具）
的身份、门禁分支与 Schedule 生命周期。审计正文与证据矩阵见
`docs/knowledge/HEARTBEATS.md`。

**修前的两个洞（`CONFIRMED`，源码 + 红测）**：

1. 重复行会让一个会话每间隔收两轮：`open()` 刷新活行后不清理旁边的 `ended` 行，删除被拒
   之后也照样 `create`。
2. 提示词被改写（DSH 的 `schedule_edit` 收 `prompt`）的行既刷不了也删不掉：投递不再带
   标记，门禁按 `non-user-source` 放过，开关在活行上显示「关闭」。

**改动**：`src/loop.ts` 新增 `isLoopSlot`（保留名 + `rrule` + 目标会话）作为存储身份，
`isLoopTask` 改为槽位 + 标记；`open()` 刷新/恢复后 `dropDuplicates`，删除被拒留下活行时
改写该行；`close`/`status`/`stopAll`/`deleteSessionHeartbeats` 改按槽位。门禁不动：
`isLoopHeartbeat` 仍是唯一路由身份（`src/gate.ts:532`）。

**命令与结果（本树实跑）**：

| 命令 | 结果 |
| --- | --- |
| 修前 `npx vitest run test/loop.spec.ts test/heartbeat-identity.spec.ts` | **7 failed / 38 passed**（4 条生命周期用例 + 3 条 `isLoopSlot` 用例） |
| 修后同命令 | **45 passed** |
| `npx vitest run test/loop-runtime-wiring.spec.ts` | **5 passed**（真 Loader + 构建产物：卸载只删自己那一行，`RSI heartbeat` 行留存） |
| `npx vitest run test/objective-limit.spec.ts test/loop.spec.ts test/heartbeat-identity.spec.ts` | **62 passed** |

**未验证 / 边界（`NOT_RUN`）**：真实定时投递（武装任务是操作者动作，D-066）；真机 GUI 里
改写一条循环任务的提示词再观察下一次投递；「自动化任务」列表如何显示被收回的行。
**并发说明**：同一工作树当时有另一个写入者（`src/intake.ts` / `src/gate.ts` /
`src/command.ts`），`npm run ci` 的首跑失败在 `test/objective-limit.spec.ts:423`——那是
对方改动中途的产物（构建产物已换、断言未换），与本任务无关；本任务收尾时该文件已绿。

**收尾复验（2026-11-20 00:21，agent-9 独立执行，`CONFIRMED`）**：

| 命令 | 结果 |
| --- | --- |
| `npx vitest run test/heartbeat-identity.spec.ts test/loop.spec.ts test/loop-runtime-wiring.spec.ts` | **50 passed**（10 + 35 + 5） |
| 负对照复跑：`git show HEAD:src/loop.ts` 临时换回修前文件，跑上述前两个文件 | **7 failed / 38 passed**，与上表逐条同名单（4 条生命周期 + 3 条 `isLoopSlot`；跑完按 sha256 `d492489e…` 逐字节还原） |
| `npm run ci`（`TMPDIR=$PWD/.tmp`） | exit 0 = **66 文件 / 1195 测试 PASS**（typecheck 0 错、lint 0 error、`verify:lib` 通过——`lib/` 是当前 `src/` 的构建） |
| `~/.dsh/storages/schedule.json` 只读检查 | 仍只有一条无关任务（「派发个人助理灵感箱」，active），两个心跳都没武装；mtime `00:06:39` 早于复验开始（00:18），本会话零写入 |

## 心跳身份与路由隔离 — 第二轮 — 自迭代心跳成为插件第二个实例后的一次真实串线（2026-11-20，agent-19，`CONFIRMED`）

**为什么有第二轮**：第一轮收口（agent-9）记录的自迭代心跳是「操作者的 Automation 任务，
无插件路由、无插件工具」。同一工作树随后加入了第二个服务实例与
`/grok-workflow/iterate` 路由（`src/index.ts:313`、`src/loop-surface.ts:148`、
`src/config.ts:166` 的 `iterateTemplate`），所以第一轮的 `HEARTBEATS.md` / RESEARCH A30
那句「无插件路由」已经过期——本轮按当前树重审，并把过期的说法改掉。

**串线（`CONFIRMED`，先复现后修）**：`createLoopService` 的 `forgetSession` 调
`deleteSessionHeartbeats`，后者用写死的 `isLoopSlot`（只认 `Loop heartbeat`）过滤，没有传
调用实例的槽位。于是**自迭代实例的归档清扫会删掉循环的行、留下自己的行**：一个心跳删了
另一个的任务，且一条旧 RSI 行活过归档。复现：两行（`task-loop` + `task-iterate`）上
`iterate.forgetSession('session-a')`，结果剩 `RSI heartbeat`、`Loop heartbeat` 被删。
**可达性如实说明**：当前接线只把**循环**实例挂到 `workspace/session-stop` /
`session-archived`（`src/loop-surface.ts:106`），所以这条路径今天从组合层走不到；但
`forgetSession` 正是归档清扫的接口、两个实例都暴露它，任何将来接线或调用都会删错行——
按「接口正确」而非「今天没人调」处理。

**修复**：`deleteSessionHeartbeats`（`src/loop.ts:752`）新增 `slot` 参数（默认
`isLoopSlot`，刹车因此仍只清循环行），`forgetSession`（`src/loop.ts:650`）传本实例的
`slotOf`（`src/loop.ts:457`）。

**新增测试**（都在本树实跑）：

| 文件 | 新增内容 |
| --- | --- |
| `test/heartbeat-identity.spec.ts` | 反方向 5 例：自迭代实例的 `status`/`close`/`forgetSession`+`stopAll`/`open`/重复行清理只碰自己的行；门禁 1 例：用户粘贴 `[grok-workflow loop]` 仍按 `admit` 处理、刹车零调用 |
| `test/loop-surface.spec.ts` | 「two switches, two routes」4 例：两条 exact 路由各绑自己的服务、各自开/关只动自己的行、卸载只删循环行 |
| `test/client.spec.ts` | 1 例：自迭代开关的 `routePath` = `ITERATE_ROUTE_PATH`，`open` 只 POST 到该路径、body 只有 `{action, sessionId}` |

**命令与结果（本树实跑，2026-11-20 01:20–01:36）**：

| 命令 | 结果 |
| --- | --- |
| `npx vitest run test/heartbeat-identity.spec.ts` | **16 passed**（修前同文件 10 例） |
| `npx vitest run test/loop-surface.spec.ts` | **20 passed**（修前 16 例） |
| `npx vitest run test/client.spec.ts` | **97 passed** |
| `npx vitest run test/loop.spec.ts` | **35 passed** |
| `npx vitest run test/loop-runtime-wiring.spec.ts` | **5 passed**（真 Loader + 构建产物） |
| 负对照 1：把 `forgetSession` 的 `slotOf` 参数去掉（只改这一处） | **1 failed / 14 passed**（失败的正是反方向归档用例）；恢复后 `sha256sum -c` 逐字节 OK（当次快照 `src/loop.ts` = `8ec1da9b…`；此后该文件只改过注释，逻辑未动） |
| 负对照 2：把 iterate 路由的 handler 绑到循环服务（只改这一处） | **2 failed / 18 passed**（串线被路由测试抓到）；恢复后 `sha256sum -c` OK（当次快照 `src/loop-surface.ts` = `a19c8920…`，此后未再改） |
| `npm run ci`（`TMPDIR=$PWD/.tmp`，不带管道取真实退出码） | **exit 0** — typecheck 0 错、oxlint 0 error、`verify:lib` 通过、**67 文件 / 1219 测试 PASS**；`lib/loop.js:552` 已带上 `slot = isLoopSlot` |

**live 档案零写入（`CONFIRMED`）**：`~/.dsh/storages/schedule.json` 只读检查 = 一条无关任务
（「派发个人助理灵感箱」，active），两个心跳都未武装；本会话没有创建/编辑/删除任何
Schedule 任务，也没有起 DSH 实例。运行时验证全部走单元 + 真 Loader 组合测试。

**并发说明（如实记录）**：同一工作树有另一个写入者（`src/intake.ts` / `src/command.ts` /
`src/answer.ts`、`test/client.spec.ts` 的生产路径用例、`test/iterate.spec.ts`）。
本轮 CI 的前两次运行红在对方**正在编辑**的 `test/client.spec.ts`：先是
`ReferenceError: createLoopService is not defined`（导入尚未加），随后是
`the iterate switch renders a toggle: expected undefined to be defined`；对方在 01:32 完成该
文件后，同一命令全绿（第三次运行，上表）。本轮在 `test/client.spec.ts` 只**新增**了自迭代
开关路由隔离 1 例与 bundle 类型字段，未改对方用例。

**`NOT_RUN`**：真实定时投递（武装任务是操作者动作，D-066）；真机 GUI 里观察归档后的
Automation 任务列表与开关重绘。

## Round 71 — 2026-11-20 — settings-toggle-ui：双开关 + 模板 textarea 的设置面验证与落地（`CONFIRMED`，未发版）

**任务**：`settings-toggle-ui`——验证并落地设置 UI 接线：两个开关（自动续跑 + 自迭代）各自只
创建/删除自己的 Schedule 行；模板 textarea 随档案持久化且不破坏消息流；生产路径测试走真实
fetch，不复刻 v0.11.21 的教训。

**修前状态（`CONFIRMED`，源码审计）**：`v0.11.21` 的树里「自迭代开关」不存在——`GROK_WORKFLOW_LOOP`
是唯一的 composer 开关（`src/client/index.js`），设置页只有四个 `loop*` 键、没有 textarea，
`ITERATE_ROUTE_PATH` / `iterateIntervalMin` / `iterateTemplate` 在 `src/` 全文零命中。
任务要求的双开关与模板持久化需要完整落地，不是只补测试。

**改动（`CONFIRMED`，全部本树实改）**：

| 文件 | 内容 |
| --- | --- |
| `src/loop.ts` | `ITERATE_TASK_TITLE`('RSI heartbeat')/`ITERATE_ROUTE_PATH`；`LoopServiceDeps.identity`（title/promptPrefix/defaultPrompt）；服务内 `slotOf`/`markedOf` 绑定身份，全部 catalog 过滤/删除/清理走 `slotOf`；默认身份 = 循环（行为不变） |
| `src/loop-surface.ts` | `InstallLoopOptions.iterate`；`handleLoopRoute` 加 dispatch 参数并导出为生产路径测试缝；`dispatchIterateAction`（open 不收 prompt/interval） |
| `src/config.ts` | `iterateIntervalMin`（HARD_LIMITS 10080、LIMIT_CAPS、clampedLimit）+ `iterateTemplate`（默认 `DEFAULT_ITERATE_TEMPLATE`，4000 上限）；CONFIG_KEYS 13→15 |
| `src/index.ts` | `iterate` 服务实例（identity=RSM heartbeat、defaultPrompt 读 live `iterateTemplate`、空白回退默认）；`installLoop({loop, iterate})` |
| `src/client/index.js` | `makeHeartbeatSwitch` 工厂（routePath/switchId/dataAttr/textPrefix 四参）；`GROK_WORKFLOW_ITERATE` 导出；`startBothSwitches` 双挂载；设置页新增「自迭代」分组（`iterateIntervalMin` 数字 + `iterateTemplate` textarea、`error.badTemplate` 校验）；中英字典 +20 键 |
| `src/types.ts` | `ResolvedConfig.iterateIntervalMin/iterateTemplate` |
| README 双语 + `docs/LOCAL-TESTING.md` | 配置表 +2 行、「十五个键」、自迭代开关一段 |

**测试（`CONFIRMED`，本树实跑）**：

| 命令 | 结果 |
| --- | --- |
| `npx vitest run test/iterate.spec.ts` | **9 passed**（新文件：开/关/status/stopAll 各自只动自己的槽位；按标题收回操作者手装的行并回写模板；空白模板回退；模板编辑经刷新落到活行；agent open 仍拒） |
| `npx vitest run test/client.spec.ts` | **97 passed**（含新「两开关走真实 page fetch → 真 `node:http` server → 真 `handleLoopRoute` → 真 `createLoopService`」生产路径用例：不传任何 send 覆盖、v0.11.21 的教训不复现；textarea draft→ops→save 与 4000 校验用例） |
| `npx vitest run test/loop-runtime-wiring.spec.ts` | **5 passed**（fake-web 改按 path 存路由，两条 exact 路由都拿到；卸载只删循环行、RSI 行留存） |
| `npm run ci` | **exit 0** — typecheck 0 错、oxlint 24 warnings / 0 errors、`verify:lib` 通过（149 files byte-identical）、**67 文件 / 1218 测试 PASS**（日志 `.rsi/evidence/round-024/ci-settings-run.log`） |

**真机（`CONFIRMED`，隔离 profile `loopfix-verify`，端口 3451，`lib/` 重建后重启实例）**：
`.rsi/evidence/round-024/switches-and-template.mjs` 驱动真实构建 bundle 的两个开关组件
（**不带任何 send 覆盖**——生产接线），页面 fetch = node fetch + 浏览器 cookie/Origin
（cookie 值不回显，布尔存在性检查），走运行中实例的真实路由与服务：

```
loop switch mounted via page fetch, reads 关 — OK
loop open: server confirms task schedule-7a7ccd53… (interval 60 min, 10 rounds) — OK
iterate switch mounted via page fetch, reads 关 (loop row is not its slot) — OK
iterate open: server confirms its own task, distinct from the loop task — OK
settings mutate accepted (real write path, revision 0) — OK
template read back from the profile verbatim (survives reload) — OK
iterate row still live after the template edit (refresh semantics) — OK
loop close deleted only the Loop heartbeat row — OK
iterate close deleted its own row; nothing left — OK
PASS
```

模板持久化走**真实设置写路径**（`POST /api/settings/describe` → `settings/mutate` 带
`expectedRevision` → 重 describe 逐字节读回），并在磁盘上的 `cordis.patch.yml` 落盘
（验证后已恢复）。两个开关的 close 各自只删自己的行，收尾后 schedule 存储无残留行
（本机 DSH home 的 schedule.json 复核：仅剩与本测试无关的操作者任务；本轮产生的三行
测试行已删除）。实例已停止。

**live 用户档案零改动（`CONFIRMED`）**：未触碰 `:3090` 与 `web` profile；测试只在
`loopfix-verify`（round-023 的隔离验证 profile，link 本树）进行。

**`NOT_RUN`**：真实定时投递（武装是操作者动作，D-066）；浏览器 GUI 里手动点击两个开关
（本轮用真实 bundle + 真实 transport 脚本驱动，DOM 真实渲染经由 React stub，视觉观感未拍照）。

**并发说明（如实记录）**：同一工作树的另一写入者在本轮期间完成了
`src/intake.ts`/`src/command.ts`/`src/answer.ts`/`src/gate.ts` 的 intake 与 `/grok on`
修复，并把 `test/heartbeat-identity.spec.ts`、`test/loop-surface.spec.ts` 扩到 16/20 例。
本轮在这些文件上的改动不冲突（`src/loop.ts` 的 identity 参数不与对方的 `slot` 参数冲突，
CI 全绿为共同基线）。

## Round 72 — 2026-11-20 — round-024 收口：`/grok on` 卡消息 + intake 吞提示词 + 双开关真机复核（`CONFIRMED`，未发版）

**范围**：把工作树里三条并发线收成一个可发版状态——agent-2 的 `/grok on` 后台受理
（Round 70）、agent-5 的新会话提示词入口加固（`src/intake.ts`）、settings-toggle-ui
的双开关 + 模板（Round 71）——外加本轮独立的真机复核（双路由隔离 + 双开关生产路径）。

**三条线的根因（`CONFIRMED`，各有复现，见 Round 70/71 与 prompt-intake 段）**：

1. `/grok on` 后发不出消息：`full` 形态绕过交互式受理落到 `await produceAnswer(...)`，
   in-turn 把整步等到 run 结束，`AgentLoop` 当前 step 不结算就不 claim 下一批。
   修法 `answerFullBehind`：先回执 + `enqueue` 后台跑 + `deliverAndRecord` 单发结论。
2. 新会话粘贴任务提示词无反应：首行 `/grok …` 被 `dsh-commands` 当命令吃掉，旧语法只回
   `Usage: /grok [on/off]`，无 `user/message`、无 run。修法 `src/intake.ts` 按形态分档
   拒绝（多行/超长带实测数字的双语拒绝），`/grok` 开关语义逐字未动。
3. 自迭代开关缺席：v0.11.21 树里只有循环开关。修法第二服务实例 + `/grok-workflow/iterate`
   路由 + 15 键配置 + `makeHeartbeatSwitch` 工厂 + 设置页 textarea（见 Round 71）。

**本轮独立复核（`CONFIRMED`，本树实跑）**：

| 命令 | 结果 |
| --- | --- |
| `npx vitest run test/grok-on-ingress.spec.ts` | **5 passed**（复刻 AgentLoop 派发纪律 + 真 Session + 挂起引擎） |
| `npx vitest run test/intake.spec.ts test/iterate.spec.ts test/heartbeat-identity.spec.ts` | **39 passed**（14 + 9 + 16） |
| `npm run ci` | **exit 0** — typecheck 0 错、oxlint 24 warnings / 0 errors、`verify:lib` 通过、**67 文件 / 1219 测试 PASS** |
| 真机双路由（`loopfix-verify` `:3451`，link 本树） | `/grok-workflow/loop` 与 `/grok-workflow/iterate` 各自 status→open→status→close 全 200，taskId 不同，互不串行；收尾两边都是 `open:false`（`both-routes.txt`） |
| 真机双开关生产路径（真实 bundle，零 send 覆盖） | 两个开关 mount 显示 `关` → 点开各建各的行（task 不同）→ 再点各删各的行；`switches-live.txt` PASS。选择器教训：iterate 开关的 DOM 键是 `data-iterate-*`，不是 `data-loop-*`，脚本已修正 |

**收尾动作**：实例已停；`boot.log` 已脱敏（token 行剔除），cookie jar 已删；
证据目录 `.rsi/evidence/round-024/` 扫描无 `token=`/`dsh-auth-`/JWT 残留
（唯一命中是脚本里的布尔检查注释行）。

**`NOT_RUN`**：真实定时投递（D-066）；浏览器 GUI 手动点击拍照；`/grok on` 后连发两条的
真机 GUI 复核（本轮是路由/开关面，命令面仍是单测级）；commit/push/发版（等收尾提交）。

## Round 73 — 2026-11-20 — `0.12.0` 发版：自迭代开关 + `/grok on` + 提示词入口（`CONFIRMED`）

**版本判定**：minor。第二开关 + 可改模板是向后兼容的新功能（配置只增不改、旧开关行为不变），另含 5 条用户可见修复。

**命令与结果（`CONFIRMED`）**：

| 命令 | 结果 |
| --- | --- |
| `python3 .rsi/tools/bump-version.py 0.12.0` | `version=0.12.0`，5 处同步 |
| `npm run ci`（发版前全量） | exit 0，**67 文件 / 1219 测试 PASS**（`.rsi/evidence/round-024/ci-release.txt`） |
| `git commit 9839025` + `tag -a v0.12.0` + `push main` + `push tag` | 成功，无 force-push，旧标签未动 |
| 远端 CI `44587743089` | success |
| Release `44587748822` | success；Release `Grok Workflow for DSH v0.12.0` + asset `dsh-grok-workflow-0.12.0.tgz` |

## Round 74 — 2026-11-20 — round-026 收口：R6 `grokDefault` 直读 fail-closed + R9 已恢复失败不计数（`CONFIRMED`，未发版）

**主题**：POOL 里两条"报假/报错"类 PENDING——R6（`resolveConfig` 从不校验 `grokDefault`，
拼写错误静默关工作流）+ R9（COMPLETED 轮次把重试救回来的失败也印进 `Failures:`）。

**R6 根因（`CONFIRMED`，复现见 `.rsi/evidence/round-026/red-config-probe.txt`）**：
`Config` schema 拒收坏值，但 `resolveConfig` 是第二条可达路径（手写配置对象、嵌入方、
测试替身），那里 `config.grokDefault ?? 'off'` 原样吞掉任何字符串：
修前 `grokDefault: 'onn'` → `"onn"`（无 throw），然后门禁 `=== 'on'` 判 false 按 off 跑。
修法与 `mode` 对齐 fail-closed（`src/config.ts:877-881`），`config.spec.ts` +1 断言。

**R9 根因（`CONFIRMED`，红测见 `red-spec-run.txt`）**：`failureSummary` 与台账 `failureCounts`
把已验证任务的历史失败尝试也计数，COMPLETED 轮次印出 `Failures: 1 infrastructure`。
修法两处各加 `if (task.status === 'verified') continue`（`src/report.ts`、`src/delivery/index.ts`），
重试仍以 `verified (2 attempts)` 留在任务行；PARTIAL 的行不受影响（对照用例钉住两边渲染器）。

**命令与结果（`CONFIRMED`，本树实跑）**：

| 命令 | 结果 |
| --- | --- |
| 修前 `npx vitest run test/delivery.spec.ts test/failure-paths.spec.ts`（新用例已加、源码未改） | **2 failed / 27 passed** |
| 修后同命令 | **29 passed**（`green-spec-run.txt`） |
| `npx vitest run test/config.spec.ts`（R6 断言） | 37 passed（含新 `resolveConfig` 拒绝断言） |
| `npm run ci` | exit 0，**68 文件 / 1229 测试 PASS**，typecheck 0 错，oxlint 24w/0e |
| `npm run build` | `lib/` 10 文件随 `src/` 重建（`client bundle: 237735 bytes`，client 与 src 一致） |
| `npm run verify:lib` | 提交前比的是 HEAD（`da7fb65` 一致，属预期内）；提交后复核见收尾 |

**真机（沿用 round-025 结论，不过度重测）**：本轮零路由/开关/模板改动，真机面无变化；
`ci-run.log`（68/1229）与 round-025 的 `live-iterate` 结论共同覆盖。NOT_RUN：真实定时投递、
GUI 手动点击拍照。

## Round 75 — 2026-11-20 — `0.12.2` 发版：R6 + R9（`CONFIRMED`）

**版本判定**：patch。两条"报假/报错"类修复，无配置面变化、无新功能。

**命令与结果（`CONFIRMED`）**：

| 命令 | 结果 |
| --- | --- |
| `git commit c1be0c7`（R6+R9 改动+记忆+CHANGELOG+证据） | 31 files，`npm run ci` 68/1229 全绿为基 |
| 发版 hygiene：round-024/025 的同类 harness 脚本均为跟踪态，本轮 `boot.sh` + `live-round26.mjs` 同样跟踪（`40228c5`，无密钥落盘：读 `/tmp` 私有 jar，只做布尔检查） | 与先例一致 |
| `npm run verify:lib`（提交后） | `lib/ at 40228c5 is the build of src/ at 40228c5`（153 files byte-identical） |
| `tag -a v0.12.2` + `push main` + `push tag` | 成功，无 force-push，旧标签未动 |
| 远端 CI `44641153858` | success |
| Release `44641158387` | success；Release `Grok Workflow for DSH v0.12.2` + asset `dsh-grok-workflow-0.12.2.tgz` |

## Round 76 — 2026-11-20 — round-027：检查点读侧把「载荷字节数」按行数上限卡死（`CONFIRMED`，发版 `0.12.3`）

**缺陷（`CONFIRMED`，代码路径 + 实测）**：`sealCheckpoint` 接受规范化载荷到 `maxBytes`
（1,048,576），`writeCheckpoint` 对整文件再卡一次同一个数；读侧 `assertCheckpoint` 却把
`integrity.bytes` 卡在 `countCeiling`（1,000,000，本来是行数上限）。于是载荷落在
(1,000,000, ≤1,048,450] 的检查点：封装成功、落盘成功、读回时被判
`CheckpointError('invalid', 'checkpoint integrity.bytes must be between 1 and 1000000')`——
续跑永远起不来。实测一条最大宽度证据行占 2,055 字节，481 行 → 1,001,015 字节（落在带内），
503 行仍在上限内，故带内至少 22 行宽，不是手工构造才够得着的角落。

**命令与结果（`CONFIRMED`，本树实跑）**：

| 命令 | 结果 |
| --- | --- |
| 修前 `npx vitest run test/checkpoint-schema.spec.ts -t "reads back a payload the writer accepted"` | **1 failed**（`checkpoint integrity.bytes must be between 1 and 1000000`，`red-test.txt`） |
| 修后 `npx vitest run test/checkpoint-schema.spec.ts` | **37 passed**（原 36，+1；`test-green.txt`） |
| `npm run ci` | exit 0，**68 文件 / 1230 测试 PASS**，typecheck 0 错，oxlint 24w/0e，`ci.txt` |
| `npm run verify:lib`（提交前，比的是 HEAD `fd241c8`） | 153 files byte-identical（预期，改的是工作树） |
| `npm run verify:lib`（提交后） | 见本文件 §0.12.3 发版段 |

**没有放宽任何断言**：只新增一个用例（`git diff --stat` 显示 +65 行测试、零删除）、
`src` 改一行上限加注释；既有 36 条用例全绿。

**未验证（`NOT_RUN`）**：真实定时投递（D-066）、GUI 手动点击截图。

### 0.12.3 发版记录（`CONFIRMED`，2026-11-20T08:37Z 起）

| 项目 | 值 |
| --- | --- |
| 发布提交 | `fd6a5ee`（`main`，27 files，含 `src`/`lib`/`test`/记忆/证据） |
| 标签 | annotated `v0.12.3`（tag 对象 `0c66263`，指向 `fd6a5ee`），已推，旧标签未动、无 force-push |
| `npm run verify:lib`（提交后） | `lib/ at fd6a5ee is the build of src/ at fd6a5ee`（153 files byte-identical，`verify-lib-postcommit.txt`） |
| `npm run ci`（bump 后、提交前） | exit 0，68 文件 / 1230 测试 PASS（`ci-after-bump.txt`） |
| 远端 CI | run `44647313571` success（main，Node 22/24） |
| Release workflow | run `44647317251` success；Release `Grok Workflow for DSH v0.12.3` 已发布（`isDraft=false`,`isPrerelease=false`） |
| 资产 | `dsh-grok-workflow-0.12.3.tgz`，597,237 B，sha256 `78e7e5f9…` |

**档案更新（`CONFIRMED`，未重启宿主）**：`~/.dsh/profiles/web` 由 `#v0.12.2` 升到
`#v0.12.3`（`dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.12.3`，输出
`EXIT=0`，`profile-install.txt`），`package.json` 里 pin = `#v0.12.3`、装入版本 `0.12.3`，
`lib/` 与 `git archive v0.12.3 lib` 的 `diff -r --exclude='*.map'` **exit 0**（`profile-after-install.txt`）。
宿主 pid `154637` 的 `lstart` 与 boot id `9d066162-…` 未变、`etimes` 208111s、`:3080` 仍回 401；
`plugin_manager` 列出 `include:grok-workflow` / `enabled: true` / `fiberPhase: active`——改动
档案后插件仍在运行宿主里挂载。**装好的那份产物本身**跑真实文件系统往返
（`shipped-roundtrip.txt`）：481 行 1,001,051 字节载荷 → 文件 1,001,180 字节 → 读回
`integrity.bytes` 一致、校验通过（改前同一形状会 `invalid`）。复制档案 `loopfix-verify`
升到 `0.12.3` 后在 `:3452` 起实例、`/` 回 401（服务在），验完已停。

**独立复查（子代理 `reviewer-027`，alternate-prompt）**：`ACCEPT`。它在 `HEAD fd241c8` 的
throwaway worktree 里把上限改回 `countCeiling`，新用例 **1 failed / 36 passed** 并在
`assertCheckpoint` 的旧上限处报错；另用真实 490 行载荷（1,019,510 B）实测修前
`write OK / read THREW invalid`、修后 `read OK`。测试 diff = 65 插入 / 0 删除；无既有断言被放宽。

**未验证（`NOT_RUN`）**：运行中宿主进程内存里的代码身份（插件不打印版本、ESM 缓存无版本标记，
无 watcher 观测手段）；复制档案实例的 GUI 交互需 cookie；真实定时投递（D-066）、GUI 手动点击截图。

## Round 77 — 2026-11-20 — R11：取消终结不再套跑完的包装（`CONFIRMED`，未发版）

**主题**：POOL 里 `R11 PENDING`——`cancelledText` 把保留的报告走 `relayText`，
于是取消终结带着成功前言（`finished and produced the result`）、
`REPORT_BEGIN/END` 标记和折叠台账（`Failures:`、`Confirmed evidence:`、`Model routes:`），
读起来像流程跑完了。

**改动**：`src/gate.ts` `cancelledText` 改走 `humanConclusion`（纯人话结论）；
注释与文档同步。已验证行仍在结论文本里（`做成的：Task a`），台账本来就记在进度节点里。

**红绿（`CONFIRMED`，本树实跑）**：
修前新断言在旧代码上 **1 failed / 11 passed**（正是 R11 的病：带 markers 和台账）；
修后 `test/gate-partial-head.spec.ts` **12 passed**。
`test/phase1-dialogue.spec.ts` 有 3 个旧断言建在"终结必须带机器细节"的假设上
（`PARTIAL` 状态词、证据原文、未开始任务标题原文），随行为同步更新——行为断言
（reject、消息恰保留一次、`cancelled`、无 `COMPLETED`）一个未动。

**门禁**：`npm run ci` exit 0 = **68 文件 / 1230 测试 PASS**，typecheck 0 错，
oxlint 24w/0e；`npm run verify:lib` 153 文件一致。证据 `.rsi/evidence/round-028/`。

**未验证（`NOT_RUN`）**：真机 GUI 手动取消一次看终结；真实定时投递。

## Round 78 — 2026-11-20 — `0.12.4` 发版：R11（`CONFIRMED`）

**版本判定**：patch。取消终结文案修正，无新配置面、无 API 变化。

**命令与结果（`CONFIRMED`）**：

| 命令 | 结果 |
| --- | --- |
| `git commit 5cd2b1c`（R11 改动+记忆+CHANGELOG+证据） | 21 files |
| `npm run verify:lib`（提交后） | `lib/ at 5cd2b1c is the build of src/ at 5cd2b1c`（153 files byte-identical） |
| `tag -a v0.12.4` + `push main` + `push tag` | 成功，无 force-push，旧标签未动 |
| 远端 CI `44652383452` | success |
| Release `44652387975` | success；Release `Grok Workflow for DSH v0.12.4` + asset `dsh-grok-workflow-0.12.4.tgz` |

## Round 79 — 2026-11-20 — round-029：base64 包裹的私钥原先整块落进报告（`CONFIRMED`）

**选题**：`POOL.md` 里红脱敏一节的 `P · Base64-wrapped PEM has no rule`（文档序上第一条非 DONE
项；按 PROTOCOL 的优先级属「功能错误」，泄漏面）。选题前与树对表：`src/redact.ts` 仍只有两条
armor 规则（`:27` `private-key`、`:31` `pgp-private-key`），都匹配解码后的横幅，base64 块里根本
不存在该横幅——条目成立，未陈旧。

**病与它的隐身方式**：`PRIVATE_KEY=<base64>` 这种带敏感名的写法，旧代码其实被 `key-value` 规则
顺手改成 `[REDACTED]`；所以缺陷只在「标签中性」时暴露（`tool result: <blob>`、JSON 里的 `k`），
整把私钥原样进报告。三组 base64 分组对齐（源字节偏移 0/1/2）各产生一种编码，一种字面量不够。

**改动**：`src/redact.ts` 新增 `base64-private-key` 规则（三条对齐标记，匹配整个 blob 含换行续行）；
`docs/ARCHITECTURE.md` 覆盖清单与「已知缺口」段、两份 README 安全条目同步；`lib/redact.js` 随
`src/` 重建（`lib/script.js` 字节不变——脚本在模块加载时从 `REDACTION_RULES` 渲染，规则自动跟着走）。

**红绿（`CONFIRMED`，本树实跑）**：在 `HEAD ce856cb` 的 detached worktree 里跑新 spec
`npx vitest run test/redact.spec.ts -t "base64"` → **2 failed / 1 passed / 32 skipped**，
失败输出是真泄漏：`expected 'tool result: LS0tLS1CRUdJTiBQUklWQVRF…' to contain '[REDACTED PRIVATE KEY]'`，
收到的整串就是 base64 私钥体。同文件在新代码上 **35 passed**（基线 32，+3）。
第三个新用例（base64 `CERTIFICATE`、PNG 块不动）在两侧都绿——它是防误伤守卫，不是修复探针。

**门禁**：`npm run ci` exit 0 = **68 文件 / 1233 测试 PASS**（基线 1230，只增不减），
`typecheck` 0 错，`oxlint` 24w/0e；`npm run verify:lib` = 153 files byte-identical。

**未验证（`NOT_RUN`）**：真机 GUI 手动把一段 base64 私钥喂给运行的插件看报告；
真实定时投递（D-066 属操作者动作，本会话是子代理，`schedule_*` 工具被拒）。

## Round 80 — 2026-11-20 — `0.12.5` 发版：base64 包裹的私钥（`CONFIRMED`）

**版本判定**：patch。安全/脱敏修复，无新配置面、无 API 变化、报告格式不变。

**命令与结果（`CONFIRMED`）**：

| 命令 | 结果 |
| --- | --- |
| `git commit 5b7cae1`（规则+测试+重建 lib+记忆+CHANGELOG+证据） | 21 files |
| `npm run ci`（提交后，落 `.rsi/evidence/round-029/ci-post.txt`） | exit 0；68 文件 / 1233 测试 PASS；`lib/ at 5b7cae1 is the build of src/ at 5b7cae1`（153 files byte-identical） |
| `git push origin main` | `ce856cb..5b7cae1`，fast-forward，无 force-push |
| `tag -a v0.12.5` + `push origin v0.12.5` | 成功；tag 对象 `47fcb52`；旧标签未动 |
| 远端 CI `44656151053`（head `5b7cae1`） | success |
| Release `44656153854` | success；Release `Grok Workflow for DSH v0.12.5`，asset `dsh-grok-workflow-0.12.5.tgz`（599,562 B，uploaded），非 draft 非 prerelease |

**版本串同步（`CONFIRMED`）**：`package.json` / `package-lock.json` 同步到 `0.12.5`；两份 README 的
声明版本、安装示例标签、已发布标签清单，以及 `docs/LOCAL-TESTING.md` 的 tarball 名四处由守卫逼出
（首轮 ci 因此 6 failed，改完复跑 exit 0）——这正是 `test/docs-version.spec.ts` 与
`test/docs-config-keys.spec.ts` 存在的意义。

## Round 81 — 2026-11-20 — round-030：base64 包裹的 GnuPG 私钥原先整块落进报告（`CONFIRMED`）

**选题**：`POOL.md` 红脱敏一节的第一条非 DONE 项 `P · Base64-wrapped *PGP armor*`（round 29 留下
的已知缺口，按 PROTOCOL 优先级属「功能错误」，泄漏面）。选题前与树对表：`src/redact.ts` 的
`base64-private-key` 仍只有三条 PEM 标记（`grep -c QR1AgUF src/redact.ts` → 0），条目成立，未陈旧。

**病**：`-----BEGIN PGP PRIVATE KEY BLOCK-----` 的编码形态（`base64` 过的钥匙串导出、JSON 字段里的
密钥）里不存在任何解码后的横幅，而两条 armor 规则只匹配字面横幅，于是整块 GnuPG 私钥原样进报告、
诊断信息和复查/重试提示词。GnuPG 块比裸 PEM 长得多，通常是多行折行的块，所以续行也必须吃掉。

**改动**：`src/redact.ts` 的 `base64-private-key` 规则从 3 条标记扩到 9 条——PGP `PRIVATE` 与遗留
`SECRET` 两种横幅 × 三种 base64 分组对齐；匹配窗口取到横幅第 17 字节，把 `PRI`/`SEC` 与 `PUB` 分开，
base64 公钥不误伤。`docs/ARCHITECTURE.md` 覆盖清单与「已知缺口」段、`CHANGELOG.md` 双语条目同步；
`lib/redact.js` 随 `src/` 重建（`lib/script.js` 字节不变——脚本在模块加载时从 `REDACTION_RULES` 渲染）。

**红绿（`CONFIRMED`，本机实跑，证据 `.rsi/evidence/round-030/`）**：
- 改前：在 `HEAD df6cf4b` 的 `git archive` 树里（`/tmp/rsi-old-030`，`node_modules` 软链，新 spec
  拷入）跑 `npx vitest run test/redact.spec.ts -t "GnuPG"` → **2 failed | 35 skipped**，失败输出是
  真泄漏：`expected 'Private key dump:\nLS0tLS1CRUdJTiBQR1…' to contain '[REDACTED PRIVATE KEY]'`，
  收到的整串就是 base64 后的 GnuPG 块（含续行）。`red-old.txt`
- 改后：`npx vitest run test/redact.spec.ts` → **37 passed**（基线 35，+2）。`red-new.txt`
- 第三条守卫（base64 `CERTIFICATE`、base64 `PGP PUBLIC KEY BLOCK`、PNG 块不动）两侧都绿——它是
  防误伤守卫，不是修复探针。

**门禁（`CONFIRMED`）**：`npm run ci` exit 0 = **68 文件 / 1235 测试 PASS**（基线 1233，只增不减），
`typecheck` 0 错，`oxlint` 24w/0e，`verify:lib` 153 files；日志 `.rsi/evidence/round-030/ci.txt`。

**未验证（`NOT_RUN`）**：真机 GUI 手动把一段 base64 的 GnuPG 私钥喂给运行的插件看报告；
真实定时投递（D-066 属操作者动作，本会话是子代理，`schedule_*` 被宿主拒绝：
`{"code":"subagent_session","message":"A delegated subagent cannot use scheduled tasks."}`）。
