# 跑中插话的入口（`feat/inbox-steering`）证据 — 2026-11-26

分支 **`feat/inbox-steering`**（worktree `.worktrees/feat-inbox-steering`），从 `main` 尖端 **`4584b8d`** 开出。
这一轮要回答两件事，先后有序：

1. **探针（先做，15 分钟）**：`D-161` 说管道通着、但没有任何角色能在跑中往队列里塞话。宿主到底会不会在**工具调用还跑着**
   的时候把 `agent/inbox/inserted` 发出来？不发就改判乙（允许调度子代理跑 workflow、把通道键到根会话）。
2. **通了就做**：新增 `src/steering-inbox.ts`（订事件 + 过滤非真人 + 按会话入队 + 返回 dispose）、`src/index.ts` 挂载、
   `test/steering-inbox.spec.ts`（14 例，含 `replan` 显式断言）、重建 `lib/`、`CHANGELOG` + 记忆。

结论先说：**探针通了（甲可行）**，功能按甲做完，真机上一条跑中发出的话真的走到了波边界的拉取工具并被并进计划（见 §3）。

## 1. 探针（`CONFIRMED`，两次真机读数）

装置：live `web` 档案的**复制**（`DSH_HOME=<scratch>`、端口 **3461**、`--host 127.0.0.1`，live 3080 全程没碰），
装本轮 `npm pack` 的包，**另加一个只做记录、不改行为的探针 bundle**（`probe/inbox-probe-plugin.js`：订
`agent/inbox/inserted` / `claimed` / `discarded` / `status`，逐行写 JSONL，绝不改任何载荷）。驱动是 CDP 装置
（`probe/drive.mjs`，在上一轮的装置上加了 `steer` 步骤：写字 + **Ctrl+Enter**，并在按键前抓一次画面）。

**读数（两次运行一致，取跑得完整的那次）**：

- 根会话 `session-7ec93fc4-…`：seq **18** `tool/call` `grok_workflow`；seq **29** `agent/inbox/spliced`
  **target 是 `next-step`**，正文就是跑中打的那句话；这条调用的 `tool/result` 到那一刻还没出现 —— **工具调用还在跑**。
- 探针 bundle：`2026-11-25T18:21:28.586Z  inserted  sourceKind=user` 落在**根会话**，正文同一句。
  机制上也对得上：`inserted` 由 `ReactLoopInbox.mutate()` 在 `session.append('agent/inbox/spliced')` 之后**同步** emit
  （`dsh-agent-loop/lib/index.js:190-201`），所以「splice 落在调用当中」⇔「事件在调用当中发过」。
- 第一次运行（`plan-probe.json`）同一形状：`tool/call` seq 19 → `spliced target=next-step` seq 33，
  探针在 18:14:38 记到 `inserted`（`sourceKind=user`，根会话）。

**另一条必须记住的读数**：工作流引擎喂给**子代理**的那些提示词，`sourceKind` 也是 **`user`**（`规划（第1次）`、
`执行 · …` 等等都是 `role: user` + `source.kind: "user"`）。所以「user 角色」本身**不是**真人的判据，
会话键是第二道闸 —— 这条直接决定了实现里的过滤写法（见 §2 与 `D-162`）。

## 2. 门禁（块内只跑轻的，全量留给发版）

| 命令 | 结果 | 转录 |
| --- | --- | --- |
| `npx tsc -p tsconfig.json --noEmit` | `EXIT=0`（无输出） | `gate-typecheck.out` |
| `npx oxlint src test` | `Found 15 warnings and 0 errors.` / `184 files` / `EXIT=0`（与基线同数，新增两个文件后仍是 15） | `gate-lint.out` |
| `TMPDIR=$PWD/.tmp npx vitest run test/steering-inbox.spec.ts test/replan.spec.ts test/block-tools.spec.ts test/plugin-lifecycle.spec.ts test/composition.spec.ts test/lifecycle-disposal.spec.ts` | `Test Files 6 passed (6)` / `Tests 100 passed (100)` / `EXIT=0` | `gate-specs.out` |
| `TMPDIR=$PWD/.tmp npm run build` | `client bundle: 348559 bytes → lib/client.js`、`EXIT=0` | `gate-build-verifylib.out` |
| `node scripts/verify-lib.mjs` | 见 §4（要在产品提交上跑，才覆盖本轮的 `src/`） | `gate-build-verifylib.out` / `gate-verifylib-commit.out` |
| 全量 `npm run ci` | **`NOT_RUN`**（`AGENTS.md` §12：块内不跑全量，发版提交上跑） | — |

**红（先看它能红）**：把 `installSteeringInbox` 换成空实现（只返回一个空 disposer），只跑
`test/steering-inbox.spec.ts` → **`14 failed (14)`**、`EXIT=1`（`red-before-fix.out`）。恢复后 **`14 passed`**。

## 3. 真机（`CONFIRMED`，隔离档案、真模型、只跑改到的「跑中」那一态）

- **档案**：与 §1 同一个 scratch（`<worktree>/.tmp/probe/home`），本轮只装一次、只起一次；live `~/.dsh` 与 3080 全程没碰。
- **装的是本轮的包**：`dsh plugin --profile inboxprobe remove dsh-grok-workflow` 再 `add file:<tgz>`
  ——**同版本的 `file:` tgz 直接再 `add` 会被 pnpm 复用它上一次的解包**（第一次装出来 `lib/` 里没有
  `steering-inbox.js`，89 → 87 个文件的差别就是这么量到的）；先 remove 再 add 之后
  `sha256(lib/steering-inbox.js)` = **`8dbce218bb2edd23321c76b1a12fc69ea7ed944adaa98d27e9807dfed062685b`**，与工作树逐字节相同。
- **那一次运行**（三波、只读任务）：`规划（第1次）` → 任务 1 `执行/检查/复核` → **`规划（第2次）` `规划 · 波 1 边界`**
  → 任务 2 → **`规划（第3次）` `规划 · 波 3 边界`** …；运行时在输入框打一句话并按 **Ctrl+Enter**。
- **这一次是真的并进去了**（这是 `D-161` 那条边界第一次被消掉）：
  - 根会话 splice 进 `next-step`（seq 29），探针记到 `inserted`（18:21:28.586Z）；
  - 边界子会话 `364132ca-…` 的 `grok_replan_intents`（seq 17，token `steer-mwwg8rzu-1`）**返回的不是空队列**：
    ```json
    {"intents":[{"id":"steer-mwwg8rzu-1-1","text":"再加一条要求：最后额外报一个 CHANGELOG.md 与 README.md 行数的差值。","atMs":1795630888586}],"dropped":0}
    ```
    `atMs 1795630888586` = 18:21:28.586Z，与探针那条 `inserted` 同一个毫秒 —— 从收信箱事件到队列到边界拉取，一条链。
  - 同一个边界子接着调 `structured_output`，`action: "apply"`，加了一条 `task-4`（`dependsOn: ["changelog_count"]`），
    也就是**并进计划**而不是被拒。
- **运行结果与那条要求的去向（照实记，两件事要分开）**：运行 **`COMPLETED`**（runId `4e12d5a3-…`，3 个任务、3 个波、
  全部 `verified`，`stopReason: "completed"`）；**并进计划这一步没有落地** —— 边界子把要求转成了
  `structured_output {"action":"apply","edits":[{...}]}`，但那条 `add` 编辑把字段写在编辑层、没有 `task` 体，
  宿主归一化时按 `replan edit 1 adds a task with no body` 拒了（`src/script.ts:3484-3492`，是这条请求形状的既有规则，
  与本轮改动无关）。所以最终计划仍是三波、报告里没有「差值」那一条 —— 这一轮的读数是**投递链通了**，不是**合并成功**。
- 那条被并进队列的要求**随后按普通一轮被回答**了（18:26:14 `claimed`、02:26 的回复里给了 `4263 − 396 = 3867`）——
  `CHANGELOG` 与 `D-162` 里写明的「并入之后那条消息仍另起一轮」在真机上就是这个样子。

## 4. `lib/` 与 `verify:lib`

`verify-lib.mjs` 检查的是 **`HEAD`** 的 `src/`↔`lib/` 一对，所以工作树有未提交改动时它只会说 `4584b8d` 那对我没动过的文件
是逐字节相同（285 files）。**真正覆盖本轮的是在提交之后跑的那一遍**：`gate-verifylib-commit.out`。

## 5. 这一轮没做的（`NOT_RUN` / 边界）

- 全量 `npm run ci`：`NOT_RUN`（§12，留给发版）。
- 默认 Enter（不按 Ctrl+Enter）在运行中的行为：**没重测**，上一轮已有读数（话留在客户端排队条、模型这一轮结束后才看见），
  本轮只在实现注释与 `D-162` 里引用它。
- 心搏/定时任务的真实投递、卡片答复的真实投递：**没跑真机**，只有单测（`schedule` / `user-question-reply` 两种 kind 都被拒）。
- 合 `main`、push、打 tag、发版、live 档案升级：**都没做**（派单没要求；live 档案在本会话里是只读的）。
- 真浏览器里点那颗开关、设置页渲染：与本改动无关，没跑。

## 6. 红线（实测，不是声明）

- `~/.dsh` mtime **`2026-11-25 23:14:14`**、`~/.dsh/profiles` **`2026-11-22 16:59:46`**、
  `~/.dsh/profiles/web` 与 `cordis.patch.yml` **`2026-11-25 23:04:40`**、`.credentials.yaml` **`2026-11-14 22:47`**
  —— 全都在本会话（02:00 起）之前，本轮只读它们。
- 写探测 `: > ~/.dsh/.soak-probe` → **`Read-only file system`**（没有落盘）。
- live 实例（`100.111.111.88:3080`）前后都是 **401**；没有重启、没有重载、没有 kill。
- scratch（`<worktree>/.tmp/probe`，97 MB 档案副本 + 两份 tgz + 快照）用完删除；树里只留本目录的证据。
- 密钥：只用布尔存在性判断（档案里 `AGENT2API_API_KEY` 这一条**存在**但本机 shell 没有值，所以路线改钉 `bifrost-responses`
  才跑得动），没有读值、没有打印、没有写进任何文件。
