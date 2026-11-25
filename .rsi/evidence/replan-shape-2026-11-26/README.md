# 边界子的请求单（`fix/replan-shape`）证据 — 2026-11-26

分支 **`fix/replan-shape`**，从 `main` 尖端 **`26b4bdd`** 开出（worktree `.tmp/wt-replan-shape`；基线是主检出的
`main` = `origin/main` = `26b4bdd`，即 `0.13.42` 发布后的那颗记忆提交）。

这一轮只回答一件事：**真机上那道边界子给出的「加一条任务」为什么被拒，以及怎样让它真的并进计划**。
上一轮（`feat/inbox-steering`）的读数把原因钉死在一处：边界子把任务字段写在编辑层、没写 `task` 体，
宿主按 `replan edit 1 adds a task with no body` 整条拒掉（`.rsi/evidence/inbox-steering-2026-11-26/soak-pull-and-merge.txt`）。

## 1. 改了什么（产品面两个文件 + 一份 spec + 重建的 `lib/`）

- **`src/script.ts`**
  1. `REPLAN_SCHEMA` 的 `edits.items` 从一团 `{type:'object'}` 换成三分支 `oneOf`（`add` / `update` / `remove`）：
     `add` 要求 `task` 存在且带 `id/title/objective/expectedOutput/acceptanceCriteria`，每个字段带说明；
     `edits`、`task`、`action`、`order` 各带一句说明（"任务自己的字段属于 `task` 里面"）。
  2. 新增 `REPLAN_BODY_FIELDS` / `replanEditBody()` / `replanMissingFields()`：写在 `action` 旁边的任务字段在读之前被提到
     `task` 里（`add` 连 `id` 一起提，`update` 不提——那里 `id` 是目标）；`add` 仍要过 `normalizeTask`，
     拒绝语从 "adds an invalid task" 变成 "adds an invalid task (missing or unusable: …)"。
  3. `replanPrompt()` 的 RULES 多两条（字段属于 `task`；`dependsOn` 只能写本提示词印出来的 id），
     后面加一条**逐字可抄的完整 `apply` 例子**（含 `add` 的完整 `task` 与一个真实上游 id）。
     `replanResubmitPrompt()` 同步一句「字段写在 `task` 里」。
- **`src/replan.ts`**：合并器源码（`MERGE_SOURCE`）加同一份字段表与 `editBody(edit, keepId)` 提层，
  `add` / `update` 两条路都走它；`add` 不再要求 `edit.task` 一定要存在，只要提上来的体里有合法 `id`。
- **`test/replan.spec.ts`**：21 → 24 条（+3，全部用真机原话，见 §3）。
- **`lib/`**：`npm run build` 重建（`lib/script.js`、`lib/replan.js` 与两份 map）；`client bundle: 348559 bytes`（与基线同值，
  这一轮没碰浏览器包）。
- **`CHANGELOG.md`** `[Unreleased]` 一条（英、中两半 + 升级须知）、**`D-163`**、`RESEARCH.md` 一条源码事实。

## 2. 块内门禁（`AGENTS.md` §12：只跑 typecheck + lint + 改到的 spec）

| 命令 | 结果 | 转录 |
| --- | --- | --- |
| `npx tsc -p tsconfig.json --noEmit` | `TSC_EXIT=0`（无输出） | `gate-typecheck.out` |
| `npx oxlint src test` | `Found 15 warnings and 0 errors.` / `184 files` / `LINT_EXIT=0`（与基线同数） | `gate-lint.out` |
| `npx vitest run test/replan.spec.ts test/block-tools.spec.ts test/naming-sequence.spec.ts test/planner-resubmit.spec.ts test/steering-inbox.spec.ts test/composition.spec.ts test/report-audit.spec.ts` | `Test Files 7 passed (7)` / `Tests 98 passed (98)` / `SPECS_EXIT=0` | `gate-specs.out` |
| `npx vitest run` 六份文档守卫（`docs-version` `i18n-parity` `docs-config-keys` `update-entry` `update-surface` `docs-architecture-version`） | `Test Files 6 passed (6)` / `Tests 82 passed (82)` | 见 §7（跑在写记忆之前的那棵树） |
| `npm run build` | `client bundle: 348559 bytes → lib/client.js` / `BUILD_EXIT=0` | `gate-build.out` |
| `node scripts/verify-lib.mjs` | 必须在产品提交上跑才覆盖本轮（见 §6） | `gate-verifylib-commit.out` |
| 全量 `npm run ci` | **`NOT_RUN`**（§12，留给发版提交；远端 CI 每次 push 都跑 Node 22 + 24） | — |

**红（先看它能红）**：`git stash push -- src` 把 `src/` 退回 `main`，只跑这份 spec →
**`Test Files 1 failed` / `Tests 3 failed | 21 passed`**、`EXIT=1`（`red-before-fix.out`）。三条红的正是本轮的三条新用例：

- `lifts a task body written beside "action" and runs the added task` —— `expected 1 to be 2`（计划版本没动）；
- `refuses the same answer for the content it never wrote, not for where it wrote it` —— 拒绝语里没有点名缺哪个字段；
- `reads a task body written beside "action" (a live boundary wrote one there)` —— 合并器按 "adds a task without an explicit id" 拒。

恢复后 **`24 passed`**。

## 3. 三条新用例用的是什么原话

`test/replan.spec.ts` 里 `LIVE_BODY` / `LIVE_REASON` 逐字来自 2026-11-26 那次真机的 `structured_output`：

```json
{"action":"apply","edits":[{"action":"add","dependsOn":["changelog_count"],"id":"task-4",
 "objective":"基于已统计的 README.md 与 CHANGELOG.md 行数，计算两者行数差值（CHANGELOG - README）并在最终报告中额外给出",
 "title":"报告 CHANGELOG 与 README 行数差值"}],
 "reason":"新增差值报告需求依赖两文件的行数统计，将其作为依赖 changelog_count 的新收尾任务追加，不改动已沉淀任务。"}
```

三条用例分别钉：① 同样的**平铺**写法（把 `expectedOutput` / `acceptanceCriteria` 补齐、依赖指向计划里真有的
`c`）被提上来、真的跑在下一波，`plan.version = 2`、`addedTaskIds = ['task-4']`；
② 上面那条**原封不动**的回答被拒，理由点名 `expectedOutput, acceptanceCriteria`，且**不是** "no body"，
运行仍 `completed`、两条既有任务照旧 `verified`；③ 合并器直接吃同一条平铺编辑（不经过脚本归一化）也能加出 `task-4`，
而它编出来的 `changelog_count` 依赖仍被点名拒（`task task-4 depends on unknown task changelog_count`）。

## 4. schema 本身能不能被宿主接受（`CONFIRMED`，一次探针）

宿主只接受一个封闭子集（`dsh-tools` 的 `assertObjectJsonSchema`，事实写在 `RESEARCH.md` 的同日条目里）。
把本轮生成的 `REPLAN_SCHEMA` 从 `lib/script.js` 里跑出来、交给**真的** `assertObjectJsonSchema`：

```
SCHEMA_SUBSET_OK; oneOf branches = 3
EDIT_KEYS = type,additionalProperties,description,required,properties | （同上） | （同上）
ADD_REQUIRED = ["action","task"] TASK_REQUIRED = ["id","title","objective","expectedOutput","acceptanceCriteria"]
```

原件 `schema-subset.out`（`node .tmp/probe/schema-probe.mjs`，探针跑完即删）。这一条只是把「不会一开跑就变成设置故障」
提前证掉；真正的证明是 §5 里真机上那道边界子拿到了新 schema 并照着写对了。

## 5. 真机（`CONFIRMED`，隔离档案、真模型、插话、一次运行）

- **档案**：`node scripts/clone-profile.mjs --src ~/.dsh/profiles/web` 克隆到 `$DSH_HOME=<worktree>/.tmp/soak/dsh-home`，
  名字 `replan-clone`；**只改了 soak 需要的东西**：删掉残留的 `mode: triage`、`roles` 五个角色 + `guardianModel` +
  `agent-default-model` 全部钉到 `bifrost-responses / opencode-go/muse-spark-1.3-contributor`
  （本机 shell 有 `BIFROST_VIRTUAL_KEY`、没有 `AGENT2API_API_KEY`；密钥只走进程环境，没有拷进 scratch、没有落盘）。
  克隆读数见 `soak/clone-report.txt`（`parity 5/5 equal after redaction`、`dependencies 17 declared, 0 unresolved`）。
- **装的是本轮的包**：`npm pack` → `dsh-grok-workflow-0.13.42.tgz`（`sha256 f4a9a0f7…eed22`），
  `dsh plugin --profile replan-clone remove …`（本来没装，报错无妨）再 `add file:…tgz`；装好的
  `lib/script.js` / `lib/replan.js` 与工作树**逐字节同哈希**（`soak/installed-lib-sha256.txt`：
  `2f37be12…f7bdb` / `db776e66…f7f73`），`dsh plugin list` 读回 `dsh-grok-workflow@0.13.42`。
- **实例**：`DSH_HOME=… dsh --profile replan-clone --port 3413 --host 127.0.0.1 --no-open`（live 3080 全程没碰）。
- **装置**：headless Chromium（`/usr/bin/chromium`，`--remote-debugging-port=9223`）+ 上一轮那份 CDP 驱动
  （`drive.mjs`，本轮原样复用，`soak/plan.json` 是步骤表：`fresh` → `send`（三波数行数）→ 等 28 s →
  在输入框打一句话并按 **Ctrl+Enter** → `settle`）。
- **这一次要求真的并进了计划**（上轮同一装置、同一句话，只换构建）：

| 读数 | 值 | 出处 |
| --- | --- | --- |
| 根会话：`tool/call` 与插话 | seq **19** `grok_workflow`，seq **33** `agent/inbox/spliced` target **`next-step`**，两者之间没有 `tool/result` | `soak/root-splice-and-report.txt` |
| 边界子取到要求 | `grok_replan_intents {"token":"steer-mwwi1v6s-1"}` → `{"intents":[{"id":"steer-mwwi1v6s-1-1",…,"atMs":1795633928748}],"dropped":0}`（与 splice 的 `time 1795633928747` 差 1 ms） | `soak/boundary-chain.txt` |
| 边界子给出的编辑 | `{"action":"apply","edits":[{"action":"add","task":{…id "task-4"…,"dependsOn":["count-changelog"]}}]}` —— **体在 `task` 里、五个必填字段齐、依赖是真 id** | 同上 |
| 合并结果 | 下一道边界子的提示词读作 **`CURRENT PLAN VERSION: 2`**，`UNSTARTED TASKS` 里多出 **`wave 4: task-4 "报告 CHANGELOG 与 README 行数差值" dependsOn count-changelog`** | 同上（boundary 2 / boundary 3 两处） |
| 运行结果 | 报告 `Plan: planner; 4 task(s); 4 verified`，`Wave 4/4: - task-4: verified (1 attempt)`，`stopReason completed`；`memory/grok-workflow/experience.md` 记 `verified 4/4` | `soak/root-splice-and-report.txt` |
| 被并进去的那句话 | 仍按普通一轮被回答（03:17 那一步，给出 `4287 − 396 = 3891`）——`CHANGELOG` 写明的行为，不是缺陷 | `soak/w5-done.txt` |

判据对上了：**`plan.version = 2` + `addedTaskIds` 含 `task-4`**（`task-4` 随后真的跑完并验过）。
三条截图：`soak/shots/w2-running.png`（跑着、4 个子代理）、`w3-steer.beforekey.png`（按键前的输入框与提示）、
`w5-done.png`（跑完、Wave 4 那一行）。

## 6. `lib/` 与 `verify:lib`

`verify-lib.mjs` 比对的是 **`HEAD`** 的 `src/`↔`lib/`，工作树有未提交改动时那句话只说明基线那对没动；
本轮的覆盖是**在产品提交之后**跑的那一遍：`gate-verifylib-commit.out` 读作
`lib/ at <commit> is the build of src/ at <commit> (289 files, byte-identical)`、`EXIT=0`。

## 7. 这一轮没做的（`NOT_RUN` / 边界）

- 全量 `npm run ci`：**`NOT_RUN`**（§12，留给发版提交）。
- 合并被拒之后的重投（同一条边界再问一次）：**没做**，也不是本轮加的——`D-163` 的 rejected 里写了为什么
  （拒绝理由已经进报告台账；接上重投会让一道边界花两次子调用，属于下一块要不要买的开销）。
- `update` 的平铺写法在真机上：**没单独跑**，只有单测（合并器那条用例覆盖 `add`，`update` 走同一个 `editBody`）。
- 合 `main`、push、打 tag、发版、live 档案升级：**都没做**（派单没要求；live 档案在本会话里是只读的）。
- 六份文档守卫那一遍跑在**写记忆之前**的树上（只影响 `CHANGELOG.md` 的那一段，`docs-*` 守卫读的是版本与键，不读正文）。

## 8. 一条观察，照实记（不是本轮改的，也没修）

真机提示词里 `SETTLED TASKS` 每一行都读作 `- count-agents [undefined] `——状态与标题都是空的。
原因是脚本把 `statuses`（`Record<id, status>` 字符串）传给 `requestReplan`，而 `replanPrompt` 按
`row.status` / `row.task.title` 读（`src/script.ts`，`runWave` 里 `statuses[id] = settled[id].status` 与
`replanPrompt` 的循环）。**与本轮改动无关**（那两处一行没动），影响是边界子看不到已沉淀任务的状态与标题、
只能靠 `id` 和它自己的记忆判断。要么修那行读取，要么把 `statuses` 换成整行——留给下一块。

## 9. 红线（实测，不是声明）

- `~/.dsh` mtime **`2026-11-25 23:14:14`**、`~/.dsh/profiles` **`2026-11-22 16:59:46`**、
  `~/.dsh/profiles/web` 与 `cordis.patch.yml` **`2026-11-25 23:04:40`**、`.credentials.yaml` **`2026-11-14 22:47`**
  —— 全都在本会话（03:00 起）之前，前后同值。
- 写探测 `: > ~/.dsh/.replan-shape-probe` → **`Read-only file system`**（没有落盘）。
- live 实例（`100.111.111.88:3080`）前后都是 **401**；没有重启、没有重载、没有 kill。
- scratch（`<worktree>/.tmp/soak`，**273 MB** 档案副本 + tgz + 截图 + chromium 用户目录 + npm cache）用完整棵删除，
  树里只留本目录的证据；`/tmp` 下的临时件也删了。
- 密钥：只用布尔存在性判断，没有读值、没有打印、没有写进任何文件；scratch 实例的访问令牌只落在
  `.tmp/soak/token.txt`（0600、已随 scratch 删除），没有进证据目录、没有进提交。
