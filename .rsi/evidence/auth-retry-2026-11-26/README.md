# 钥匙被拒给一次同路重发（`fix/auth-retry`）证据 — 2026-11-26

分支 **`fix/auth-retry`**，从 `main` 尖端 **`7f0a47f`**（`0.13.43` 发版后的记忆提交）开出，
worktree `.agents/worktrees/fix-auth-retry`。**未合 `main`、未 push、未打 tag、未发版**，版本仍 `0.13.43`。

这一轮只回答一件事：**一条路由用钥匙错误（401/403）拒掉一次调用时，运行该不该就此付代价**。
改动前它一定付：判腿把「没有判」记下来、整轮重试连干活那条腿一起重跑；规划腿直接退到兜底切分，
而兜底计划永远报不出「已完成」。改动后这一次拒绝只花一次子调用：同一条路由上再问一次。

## 1. 改了什么（`src/` 两个文件 + 三份 spec + 重建 `lib/`）

- **`src/script.ts`**
  1. 新增独立谓词 **`refusalDeath(failure)`**：`class === 'model-unavailable'` 且不是设置故障。
     它回答的是「这次调用根本没被服务」，与 `routeHealthFamily`（超时／掉线／5xx／开关留在原路由上的 429）
     是两条不同的判据——**`ROUTE_HEALTH_FAMILIES` 一个字没动**，钥匙被拒仍然永远不进死路表。
  2. **`judgeLegTransportDeath` 改读它**：判腿的死因 = 线程死了 **或** 路由拒服务；两条判腿
     （verifier / supervisor）因此会在**同一次尝试里**把裁判再问一次，而不再重跑干活那条腿。
     日志按死因分两种说法（`judgeLegDeathWord`：`a transport death` / `a refusal`），
     原来的 `re-fired after a transport death` 对运输类死亡逐字不变。
  3. **规划腿 C 走廊**加一条 `else if (!plan && refusalDeath(planFailure))`：把计划**在同一条路由上再问一次**，
     而且只问一条——`repeatAvoid` 把这次调用已经付过的路由全部避开、只留最后那条（拒的那条），
     所以最多再花一个子调用，绝不顺着链再走一遍。它不看操作员的 `switchOn`：开关回答的是「要不要换一条路由」，
     这一次没有换。
  4. 三处注释订正（`CHILD_DEATH_FAMILIES` 的「钥匙被拒必须停止重投」、规划腿 A/B/C 走廊说明）。
- **`src/child-outcomes.ts`**：只有文档注释一句（「脚本会在它上面花一次同路重问」），行为零改动。
- **`test/planner-resubmit.spec.ts`** 10 → **12** 条：401 恢复（同一路由两次、`plan.source=planner`、`completed`、
  `deadRoutes` 未定义）、两条路由都被 403 拒时**只重问最后那条一次**（`['p1','p2','p2']`）且**仍然没有死路**。
- **`test/judge-leg-retry.spec.ts`** 8 → **9** 条：verifier 第一次 401、第二次正常 → `judgeRetried`、
  干活那条腿只跑一次、事件读作 `re-fired after a refusal`、`deadRoutes` 未定义。
- **`test/dead-routes.spec.ts`**：两条注释订正（护栏的既有断言一字未改，仍然钉住「钥匙被拒不进死路表」）。
- **`lib/`**：`npm run build` 重建（`lib/script.js`、`lib/child-outcomes.*` 与 map）；
  `client bundle: 348559 bytes`（浏览器包一行没动）。

## 2. 块内门禁（`AGENTS.md` §12：只跑 typecheck + lint + 改到的 spec）

| 命令 | 结果 | 转录 |
| --- | --- | --- |
| `npx tsc -p tsconfig.json --noEmit` | `TSC_EXIT=0`（无输出） | `gate-typecheck.out` |
| `npx oxlint src test` | `Found 15 warnings and 0 errors.` / `184 files` / `LINT_EXIT=0`（与基线同数） | `gate-lint.out` |
| `npx vitest run` 九份 spec（`planner-resubmit` `judge-leg-retry` `dead-routes` `null-collapse` `verifier-resubmit` `failure-paths` `routing` `child-evidence` `waves`） | `Test Files 9 passed (9)` / `Tests 165 passed (165)` / `SPECS_EXIT=0` | `gate-specs.out` |
| `npm run build` | `client bundle: 348559 bytes → lib/client.js` / `BUILD_EXIT=0` | `gate-build.out` |
| 六份文档守卫（写完记忆之后那一棵树） | `Test Files 6 passed (6)` / `Tests 82 passed (82)` | `gate-docs-guards.out` |
| 全量 `npm run ci` | **`NOT_RUN`**（§12，留给发版提交；远端 CI 每次 push 都跑 Node 22 + 24） | — |

**红（先看它能红）**：`git stash push -- src` 把 `src/` 退回 `main`、只留三份 spec →
**`Test Files 2 failed (2)` / `Tests 3 failed | 18 passed (21)`**、`RED_EXIT=1`（`red-before-fix.out`）。
三条红的正是本轮的三条新用例：

- `re-asks the route that refused, and keeps the plan it gets back`
- `spends the repeat once, on the route that refused last, and still never kills it`
- `re-fires a judge whose route refused the key, and never marks that route dead`

恢复后同样两遍：**`21 passed`**。

## 3. 真机（`CONFIRMED`，隔离档案、真模型、一次运行、判据全中）

**装置**：`node scripts/clone-profile.mjs --src ~/.dsh/profiles/web --home .tmp/soak/dsh-home --name authretry-clone`
（读数 `soak/clone-report.txt`：`parity 5/5 equal after redaction`、`dependencies 17 declared, 0 unresolved`）。
只改 soak 需要的东西：删掉残留的 `mode: triage`（被删键，留着会拒载）、
`agent-default-model` 与五个角色 + `guardianModel` 全部钉到 `bifrost-responses / opencode-go/muse-spark-1.3-contributor`
（本机 shell 有 `BIFROST_VIRTUAL_KEY`、没有 `AGENT2API_API_KEY`），
**新增一个只给规划腿用的 provider `authprobe`**，它的 `baseURL` 指向本机 **`127.0.0.1:18190`** ——
**一个「第一次 401、之后透传」的小代理**（`proxy.mjs`，第一次 `POST /openai/v1/responses` 直接回 401，
其余原样转发到真网关 `127.0.0.1:18088`）。

**装的是本轮的包**：`npm pack` → `dsh-grok-workflow-0.13.43.tgz`（`sha256 13607a3c…25756`），
`dsh plugin --profile authretry-clone remove`（本来没装，报错无妨）再 `add file:…tgz`；
装好的 `lib/script.js` / `lib/index.js` / `lib/client.js` 与工作树**逐字节同哈希**
（`soak/installed-lib-sha256.txt`：`ada7a58f…97b0a` / `201f6788…28b7d6` / `95f0e410…cb60`），
`dsh plugin list` 读回 `dsh-grok-workflow@0.13.43`。

**实例**：`DSH_HOME=… dsh --profile authretry-clone --port 3455 --host 127.0.0.1 --no-open`（live 3080 全程没碰），
headless Chromium + CDP 驱动按真人视角发一句话。

**这一次运行里发生了什么**（run `818754a2-115b-409a-96a2-e1dbf93a3283`）：

| 读数 | 值 | 出处 |
| --- | --- | --- |
| 规划腿的路由 | `authprobe/opencode-go/muse-spark-1.3-contributor`（只有规划腿走代理，别的腿直连真网关） | `soak/planner-pair.txt`（`plugin:grok-workflow/routing`）、`soak/root-session.jsonl` |
| 第一次规划调用 | `role planner` / `chainIndex 0` / `attempt 1` / **`outcome failed`** / **`failureClass model-unavailable`** / 理由里逐字带 `401 Unauthorized: virtual key is required` | `soak/routes-switches.txt`（同一行原文） |
| 小代理 | `seq 1 POST /openai/v1/responses model opencode-go/muse-spark-1.3-contributor → 401 injected`，随后 `seq 2/3/4` 同一路径同一模型 **200** | `soak/proxy.log` |
| 第二次规划调用 | 子代理 `seq 1` **failed** → 子代理 `seq 2` **completed**，两个子会话的 `request/context` 都是 **`authprobe/opencode-go/muse-spark-1.3-contributor`**（同一条路由） | `soak/planner-pair.txt`、`soak/planner-routes.txt` |
| 它不是形状走廊 | 这次运行里**没有任何子代理提示词带 `RESUBMISSION`**，所以第二次问是 C 走廊的同路重问，不是 B 走廊的同次重交 | `soak/planner-routes.txt` |
| 运行结果 | `Grok workflow: COMPLETED`、`Plan: planner; 2 task(s); 2 verified`、`Wave 1/2` + `Wave 2/2` 各 `verified (1 attempt)`；会话里读作「已完成，用时 3分21秒」 | `soak/report.txt`、`soak/s2-done.txt`、`soak/s2-done.png` |
| 计划来源 | checkpoint 里 `plan.source = planner`、`run.status = completed`、两个 task 都 `verified` | `soak/checkpoint-excerpt.txt` |

判据：**运行 `completed`（2/2 verified、计划来自 planner）+ 同一条路由上被再问一次**，两条都中。

## 4. `lib/` 与 `verify:lib`

`verify-lib.mjs` 比对 `HEAD` 的 `src/`↔`lib/`，所以只有**提交之后**跑才不是空证明：
产品提交上那一遍读作 `lib/ at <commit> is the build of src/ at <commit> (…, byte-identical)`、`EXIT=0`
（`gate-verifylib-commit.out`）。

## 5. 这一轮没做的（`NOT_RUN` / 边界）

- 全量 `npm run ci`：**`NOT_RUN`**（§12）。
- 判腿那条真机：**没单独跑**——同一个谓词，单测（`judge-leg-retry` 9 条 + 红/绿）覆盖；真机只跑规划腿这一条。
- 「一条路由上被拒之后又换路由重问」在真机上：**没跑**（真机用的是单路由链，正好对上「同路重问」这条判据）。
- 合 `main`、push、打 tag、发版、live 档案升级：**都没做**（派单没要求；本会话文件策略是 `workspace-write`，`~/.dsh` 在工作区外）。

## 6. 红线（实测，不是声明）

见 `../redlines.txt`：`~/.dsh` mtime **`2026-11-25 23:14:14`**、`~/.dsh/profiles` **`2026-11-22 16:59:46`**、
`~/.dsh/profiles/web` 与 `cordis.patch.yml` **`2026-11-25 23:04:40`** —— 全都在本会话（03:47 起）之前；
写探测 `: > ~/.dsh/.auth-retry-probe` → **`Read-only file system`**；live 实例（`100.111.111.88:3080`）前后都是 **401**。
密钥：只用布尔存在性判断，没有读值、没有打印、没有写进任何文件；scratch 实例的访问令牌只落在
`.tmp/soak/token.txt`（0600，已随 scratch 删除），没有进证据目录、没有进提交。
scratch（`.tmp/soak`，**283 MB** 档案副本 + tgz + chromium 用户目录 + npm cache）用完整棵删除，树里只留本目录。
