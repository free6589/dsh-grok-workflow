# round-068 — 保命2：取消也留全尸（checkpoint 无报告时的任务行/子代理行）

状态：`CONFIRMED`（本文件中的每个结论都来自下面列出的真实命令输出）

- 基线：`main` 系 worktree `.agents/worktrees/fix-synth-resubmit`，HEAD `cda5d4e`（`STATE.md` 首条已对齐）。
- 本次分支/worktree：`fix/checkpoint-lifeline-tasks`，从 `cda5d4e` 起，独立 worktree，主工作树未动。
- 未提交、未推送。

## 1. 现象与根因

被取消（或报告失效、超时）的 run，checkpoint 里 `tasks` / `agents` / `evidence` 三行全空：
`buildInput`（`src/checkpoint/wiring.ts` 的 `snapshot()`）只在 `wiring.report !== undefined` 时
才写 `tasks` / `evidence`，`agents` 也只在有报告时从 `report.routes` 映射。
于是引擎明明跑过子代理、事件流里全都记着，落盘的文件却对这段工作一言不发——尸体在，口袋是空的。

## 2. 改动（一条需求，三处分支）

改动文件：`src/checkpoint/wiring.ts`（+ 一个回归用例文件 `test/checkpoint-wiring.spec.ts`）。

1. **`agents` 分支**：报告优先；无报告时改用 `agentsFromObserved()`，从已监听的
   `workflow/agent-start` / `workflow/agent-end` 事件出子代理行。只记已结算的调用，
   只记调用自身 label 明确点名的角色（`parseMemberLabel` 是 `memberLabel` 的官方逆函数，
   读不回角色就不写角色，不猜、不造第六个角色）。
2. **`tasks` 分支**：报告优先（`tasksFromReport`）；无报告时改用 `tasksFromObserved()`，
   每条已观察到的子代理调用一行：`id`（事件的 `childId`，缺则 `agent-<seq>`）、
   `title`（`phase` 是任务组标题时用 phase，例如 `任务 1 · 标题`；只是阶段名时退回 `label`）、
   `status`、`attempts`（label 里声明的尝试次数）。
3. **`evidence` 分支**：保持报告独占，无报告时不出行。证据是验证者的结论，宿主的
   事件流里没有任何字段携带它，编造一行就是冒充验证——不写才是诚实的空。

配套：`WiringState.children` 新增每 run 的已观察调用表（`childrenOf()`，上限
`CHECKPOINT_WIRING_LIMITS.observedCalls = 512`，与 `rememberedRuns` 同样的淘汰规则）；
`noteAgent` 在原有计数器之外补记调用行，按引擎自己的 `seq` 归并 start/end，
**start 先于本 recorder 存在也能落一行**（只沿 end 补记，时间戳只有 end 时刻，不臆造开始时刻）。

### 状态映射为什么 `completed` 不写成 `verified`

`completed` 只说明一次调用返回了，验证是另一件事、只有报告里有。写成 `verified` 有两个后果：
一是声称了没人做过的证明；二是 `resumeDecision` 把「非 verified」当作未完成，
写成 verified 会让续跑跳过从未验证过的工作。所以无报告时 `completed` 保持 `running`，
只有 `agent-end` 明确给 `failed` / `cancelled` 才落对应状态。

副作用（正向）：被取消的 run 现在 `resumeDecision` 从 `action: 'none'`（"carries no task rows"）
变成 `action: 'resume'`，并能列出要重跑的 id。

## 3. 红绿对照

都是同一个用例文件、同一台机器、离线、无模型调用。

- 旧码（`git checkout -- src/checkpoint/wiring.ts`，只留新用例）：
  `npx vitest run test/checkpoint-wiring.spec.ts` → **2 failed | 41 passed (43)**
  失败用例：
  - `writes task and agent rows from the engine events when no report exists`
    （`checkpoint.tasks` 期望 4 行、实际 `[]`）
  - `keeps a row for a call whose start predates the recorder`
    （同样期望 1 行、实际 `[]`）
  输出见 `red-old-code.txt`。
- 新码：同命令 → **43 passed (43)**，其中新增 3 个用例全绿 → 绿。输出见 `green-new-code.txt`。

新增用例：
1. `writes task and agent rows from the engine events when no report exists`（红→绿的回归：无报告时任务行非空，id/status/attempts 全部来自事件；agent 行只出已结算且有角色的调用；续跑决策从 none 变 resume）
2. `keeps a row for a call whose start predates the recorder`（红→绿：只见到 end 也留一行，且不写没亲眼看见的开始时刻/时长）
3. `lets a report win over the observed rows, as before`（守卫：有报告时报告行仍优先，旧码也是绿）

## 4. 门禁

- `npm run build` → exit 0（`tsc -p tsconfig.build.json` + client bundle 303813 bytes）。
- `npm run ci` → **exit 0**：typecheck / oxlint / `verify:lib` / `tsc` + vitest 全过，
  **87 文件 / 1659 测试 PASS**（基线 1656 + 本次 3 条）。输出见 `ci.txt`。
- `verify:lib` 比的是 HEAD 的 src↔lib 配对，与工作树并发改动无关，故不受本次影响。

## 5. 边界与脱敏

- 未写 live 家目录（`~/.dsh`），未启停任何服务，未触碰 core。
- 证据中无 token/密钥/家目录绝对路径；用例目录是 `mkdtemp` 的临时目录，跑完即删。
- 依赖：本 worktree 的 `node_modules` 是指向同一提交的兄弟 worktree 的符号链接（已被 git 忽略），
  未在仓库内留下任何文件；`lib/` 由 `npm run build` 正常重生成，属于本仓库要提交的产物。
