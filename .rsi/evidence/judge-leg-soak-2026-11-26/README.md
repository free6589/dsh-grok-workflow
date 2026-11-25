# 判腿（verifier）被拒一次的真机读数 + README 门禁数字订正 — 2026-11-26

分支 **`fix/judge-leg-soak`**，从 `main` 尖端 **`c7975cc`**（`0.13.45` 发版收口后的记忆提交）开出，
worktree `.tmp/wt-judge-leg`。**不改产品代码、不合 `main`、不 push、不打 tag、不发版**，版本仍 `0.13.45`。
本目录是这一轮唯一的新增产物；树里另外只动了两个 README 的那两行数字。

## 0. 这一轮回答的两件事

1. **判腿被拒一次，整轮付多少代价。** `D-164`（`0.13.44` 发出）那条「钥匙被拒就在同一条路由上再问一次」
   的真机读数，**此前只有规划腿那一份**（`auth-retry-2026-11-26`，规划腿独占拒一次的小代理）。
   判腿（verifier）那一半当时只由单测覆盖（`judge-leg-retry` 9 条 + 红/绿），**真机 `NOT_RUN`**。
   这一轮把判腿单独指到同一种小代理上，其余四条腿直连，量的是：裁判第一次 401、同一条路由上再问一次、
   干活那条腿只跑一次、整轮 `completed`、那条被拒的路由**没有**被记成死路。
2. **README 两处门禁数字过期。** 英文与中文两份 README 的「测试与开发」那一段都还写着
   **1850 条 / 98 个文件**，而 `0.13.45` 发版门禁读的是 **103 个文件 / 1948 条**。

## 1. 改了什么（只有两份 README，各一行）

| 文件 | 行 | 改前 | 改后 |
| --- | --- | --- | --- |
| `README.md` | 355 | `**1850 deterministic tests across 98 files**` | `**1948 deterministic tests across 103 files**` |
| `README.zh-CN.md` | 337 | `**98 个文件 / 1850 个确定性测试**` | `**103 个文件 / 1948 个确定性测试**` |

`git diff --stat`：`README.md 2 +-`、`README.zh-CN.md 2 +-`。**没有第三处**——全仓只有这两行带这两个数字
（`grep -rn "1850\|98 files\|98 个文件"` 只命中这两行）。`src/`、`test/`、`lib/`、`package.json` 一个字没动。

## 2. 数字是这一轮实测的（不是为了改字而抄上一轮）

| 命令 | 环境 | 结果 | 转录 |
| --- | --- | --- | --- |
| `TMPDIR=$PWD/.tmp npx vitest run` | worktree `.tmp/wt-judge-leg`、`HEAD = c7975cc`、树与 `main` 相同、`npm ci` 独立装过 | **`Test Files 103 passed (103)` / `Tests 1948 passed (1948)`**、`Duration 101.60s`、`VITEST_EXIT=0` | `gate-full-suite.out`（214 行 / 15235 字节、`sha256 a4bd7ba0017f8b90666d8763dbadc8480801dcb0dc0a7086e0156fdfdc6fd83f`） |
| （同一件事的旁证） | | `ls test/*.spec.ts \| wc -l` = **103** | `gate-numbers.txt` |
| 全量 `npm run ci` | — | **`NOT_RUN`**（`AGENTS.md` §12：块内只跑 typecheck + lint + 改到的 spec；远端 CI 每次 push 都跑 Node 22 + 24） | — |

**为什么这里破了 §12 的「块内只跑定向 spec」**：这一轮唯一的产品面改动就是两个数字，而它们声称的是
「门禁跑出来多少条」。要写这个数字，就得有一次真的跑过；抄发版那份转录就等于把上一轮的证据当这一轮的。
所以只跑了 `vitest run` 这一截（不含 typecheck / lint / build），一次，读数与 `0.13.45` 发版门禁**完全一致**
（`103 / 1948`），说明这棵树没有漂。

## 3. 真机装置（`CONFIRMED`）

**档案**：`node scripts/clone-profile.mjs --src ~/.dsh/profiles/web --home .tmp/soak/dsh-home --name judgeleg-clone`
→ `parity 5/5 equal after redaction`、`dependencies 17 declared, 0 unresolved`、凭据在克隆时被抹掉 1 行（`soak/clone-report.txt`）。

**只改 soak 需要的东西**（脚本 `rig/pin-config.mjs`，可重放）：

1. 删掉残留的 `mode: triage`（这个 build 已移除的键，留着会拒载，`D-155`）。
2. `agent-default-model`、五个角色、`guardianModel` 全部钉到 `bifrost-responses / opencode-go/muse-spark-1.3-contributor`
   ——原档案里 worker / verifier / supervisor 走 `agent2api`，本机 shell 没有那把钥匙。
3. **新增一个只给判腿用的 provider `authprobe`**：同一个模型，`baseURL` 指到本机 **`127.0.0.1:18190`**
   —— `rig/proxy.mjs`，**第一次 `POST …/responses` 回 401，之后原样透传到真网关 `127.0.0.1:18088`**。
4. `roles.verifier` = `authprobe`（单路由链），其余四条腿直连 —— 这就是整个实验：
   **只有裁判那条腿的路由会拒第一次，别的腿一点没变。**

**装的是本轮的包**：`npm pack` → `dsh-grok-workflow-0.13.45.tgz`（`sha256 8d567305…985ad9`），
`dsh plugin --profile judgeleg-clone add file:…tgz`，`dsh plugin list` 读回 `dsh-grok-workflow@0.13.45`；
装好的 `lib/script.js`、`lib/index.js`、`lib/client.js` 与工作树**逐字节同哈希**
（`soak/installed-lib-sha256.txt`：`233d327e…2e22` / `201f6788…28b7d6` / `689e64ec…2ff4b`）。

**实例**：`DSH_HOME=.tmp/soak/dsh-home dsh --profile judgeleg-clone --port 3517 --host 127.0.0.1 --no-open`
（live 3080 全程没碰），headless Chromium + CDP 驱动（`rig/drive.mjs`、`rig/chrome.sh`）按真人视角发一句话。

**第一次尝试是装置故障，照实记**：`authprobe` 的模型条目漏了 `reasoningEfforts`，而五个角色都钉在
`high`，于是**判腿在 provider 层就死了**（`UNSUPPORTED_REASONING_EFFORT`，一个 HTTP 都没发出，小代理日志空），
那一轮（`7f6292d1`）`failed` 并作废。补上同一份 `reasoningEfforts` 表后重跑，才有下面这一跑。
细节与原文 `soak/first-attempt-rig-fault.txt`。

## 4. 绿的那一跑：五条判据逐条落地（run `bcd45b43-79ab-41b6-a2ce-573382c0e032`）

根会话 `session-ae3f1144-f336-48a3-a432-7caa6b51ba60`，`05:37:05` 起、`161324 ms`（2 分 41 秒）、
计划 2 个任务、12 条子腿（`soak/agent-legs.txt`）。

| 判据 | 读数 | 出处 |
| --- | --- | --- |
| **裁判第一次 401** | 判腿第一条腿 `检查 · 任务 1`（child `b76ef3b2`）在 `authprobe` 上死掉，原文 `authprobe API error (401): {"message":"401 Unauthorized: virtual key is required. Provide a virtual key via the x-bf-vk header.","type":"authentication_error"}`、`code AUTH` | `soak/verifier-legs.txt`、`soak/agent-legs.txt` 第 3 行 |
| 小代理确实只拒一次 | `seq 1 … -> 401 injected`，随后同路径同模型 `seq 2/3/4/5 -> forwarded 200` | `soak/proxy.log` |
| **记 `judge re-fired`** | 同一次尝试里出现**第二条 `检查` 腿**（child `2128a20e`，同一 phase「任务 1」、同一条路由），`completed`。**字面量 `judge re-fired` 在绿跑里不打印**——它只挂在技术审计尾上，而 `src/index.ts:282` 只在 `status !== 'completed'` 时附审计尾；绿跑的等价记录就是这「两条判腿、一条尝试」。§5 用一跑红的把它打成字面量 | `soak/verifier-legs.txt`、`soak/agent-legs.txt` 第 3–4 行；`src/report-audit.ts:134`、`src/report.ts:1424`、`src/index.ts:282` |
| **干活腿只跑一次** | 任务 1 的 `执行` 腿只出现一次（child `c6fd9e66`，`completed`）；checkpoint 读 `step1_mult … attempts 1`、`step2_add … attempts 1`；报告读 `verified (1 attempt)` ×2 | `soak/agent-legs.txt` 第 2 行、`soak/checkpoint-excerpt.txt`、`soak/report.txt` |
| **整轮 `completed`** | 报告首行 `Grok workflow: COMPLETED`、`Plan: planner; 2 task(s); 2 verified`；checkpoint `run.status = "completed"`、`plan.source = "planner"`、三段 stage 全 `completed`、两个任务全 `verified` | `soak/report.txt`、`soak/checkpoint-excerpt.txt` |
| **路由不记死路** | 路由台账里**只有一行** `verifier / chainIndex 0 / attempt 1 / outcome failed / failureClass model-unavailable`；**没有 `chainIndex > 0` 的行**（没有跨到第二条路由）。台账 schema 里根本没有「死路」字段（`src/records.ts:47-68`），死路只在运行内的 `deadRoutes` 里；它没被记下的直接证据是：**再问一次回到了同一条路由**（两条判腿的 `request/context` 都是 `authprobe/…`，见 `soak/verifier-legs.txt`），而整轮随后正常跑完 | `soak/routing-record.json`、`soak/verifier-legs.txt`、`soak/report.txt` |

其它读数：判腿只服务了两次「一问」（任务 2 的 `检查` 腿 child `46391f4e` 一次过），
`复核`（supervisor）两条腿都在 `bifrost-responses` 上——**只有裁判那条腿碰过小代理**；
汇总写了 3 稿，`Summary review: check=pass verify=pass drafts=3 · final: draft 3`。

## 5. 红的那一跑：把 `judge re-fired` 打成字面量（run `d7c1017c-f8cf-4d04-bc84-3631db0431fc`）

同一套装置，把小代理换成 **`PROBE_ALWAYS=1`（每次都回 401）**（`rig/proxy.mjs` 的第二种模式），
再跑一句只做一步的话（`rig/plan-refused.json`）：一次尝试里判腿被拒两次 → 尝试 2 再被拒两次，
共 `seq 1..4 -> 401 injected (always mode)`，整轮 `FAILED`。**因为不是 `completed`，报告带上了技术审计尾**，它逐字读作：

```
49:  Attempt 1 — route bifrost-responses/opencode-go/muse-spark-1.3-contributor — judge re-fired — not passed
57:  Attempt 2 — route bifrost-responses/opencode-go/muse-spark-1.3-contributor — judge re-fired — not passed
```

同一次运行还给了「不记死路」第二份读数：路由台账有 **4 行**、**全部 `chainIndex 0`**
（尝试 1 两次 + 尝试 2 两次），也就是说**再问一次算「同一路由上的又一次失败」，不算换路由**；
两条尝试的 `Calls` 段里判腿那两行都写着 `via authprobe/…`。
**一处口径要写准**：审计尾的 `Attempt N — route …` 那一行写的是**这次尝试的主路由**（干活那条腿的
`bifrost-responses`），不是裁判的路由；裁判走哪条要看同一份审计尾的 `Calls` 段（`verifier chain 0 … via authprobe/…`）。
全文 `soak/refused/report.txt`、腿表 `soak/refused/agent-legs.txt`、台账 `soak/refused/routing-record.json`。

这一跑**不是**为了证明「判腿该失败」，而是为了拿到那句只有非 `completed` 报告才打印的字面量，
以及「同一条路由被反复拒、路由表里 chainIndex 始终是 0」这一条。它同时也把代价照出来：
尝试 2 把**干活那条腿又跑了一遍**（`执行（尝试 2）`，child `ad55b15a`）——这正是 `D-164` 想省掉、而拒绝不消失时省不掉的那一笔。

## 6. 这一轮没做的（`NOT_RUN` / 边界）

- 全量 `npm run ci`：**`NOT_RUN`**（§12；只跑了一截 `vitest run` 用来写 README 的两个数）。
- typecheck、lint、build：**`NOT_RUN`** —— 没有代码改动，`lib/` 也没重建（装进 soak 的 `lib/` 就是 `main` 的那一份，哈希对得上）。
- 判腿「被拒 → 换第二条路由再问」的真机：**`NOT_RUN`**。真机用的是单路由链，正好对上 `D-164` 那句「同一条路由上再问一次」；
  多路由那半仍只有单测（`planner-resubmit` 12 条、`judge-leg-retry` 9 条）。
- 判腿在**超时/掉线/5xx**那一族的同路重问：**`NOT_RUN`**（真机只造了 401）。
- 合 `main`、push、打 tag、发版、live 档案升级：**都没做**（派单没要求；live 在 `workspace-write` 之外，也没碰）。
- `CHANGELOG`：**没动**。这两个数字不是用户可见的行为变化，`[Unreleased]` 保持空。

## 7. 红线（实测，不是声明）

`soak/redlines.txt`：`~/.dsh` mtime **`2026-11-25 23:14:14`**、`~/.dsh/profiles` **`2026-11-22 16:59:46`**、
`~/.dsh/profiles/web` 与 `cordis.patch.yml` **`2026-11-25 23:04:40`**、`.credentials.yaml` **`2026-11-14 22:47:23`**
—— 全都在本会话（05:27 起）之前；写探测 `: > ~/.dsh/.judge-leg-probe` → **`Read-only file system`**；
live 实例 `100.111.111.88:3080` 前后都是 **401**。
**密钥**：只用布尔存在性判断（`BIFROST_VIRTUAL_KEY` 在 shell 里、`~/.dsh/bifrost.env` 在，值没读、没打印、没写进任何文件）；
小代理把 `Authorization` / `x-bf-vk` 原样转发、**从不记日志**；scratch 实例的访问令牌只落在
`.tmp/soak/token.txt`（0600，随 scratch 删除），**没有进这个目录、没有进提交**。
scratch（`.tmp/soak`，档案副本 + tgz + chromium 用户目录 + npm cache）用完整棵删除，树里只留本目录。
