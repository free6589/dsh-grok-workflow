# 挂死路由形状取证 — 2026-11-24（4–5 任务真机 soak）

**结论：PASS。** 5 个任务真的跑起来了（`Plan: caller; 5 task(s); 4 verified`），挂死路在一轮里被真正调用 **3 次**：
任务 1 自己付了 2 次（两次尝试），任务 2–5 **一次都没打它**（全部落在活路），第 3 次不是任务尝试，
而是 LLM 传输层把任务 1 第一次尝试遗留的孤儿 socket 在 300 s 后重发了一次（请求体字节数与第 1 次完全相同）。
无计时器预算**结算了**：每次挂死调用的结算时延落在 `childTimeoutMs = 45000 ms` 上（从端点收到请求算 44.65–44.93 s，
差额是子代理自己的启动开销），不是永不结算、也不是被别的看门狗收尾。真机走的是 **Atomics 延迟路径**，
无计时器兜底（`watchNoTimer`）在本机**不可达**。

两轮独立复现（shipped build 一轮 + 单行可见性翻转一轮），形状完全一致。

| | |
| --- | --- |
| 基线 | `git rev-parse HEAD` = `4f616d1f6c4177854f17ad7baa12021fc542c5ca`（main 实际尖端，已复核） |
| `lib/index.js` | git blob `0bd502ba2e8086dbc976a6d7655c1f877f7a0eed`；sha256 `3e014bd1f8f469ed66be92a832f6b417d12967a1706c5f6732df2a1d98b190a3`；20 683 bytes |
| 树状态 | `git status --short` 31 行，全部是**本轮之前就存在**的未跟踪证据目录 + 一条 ` D .rsi/STOP`；本轮只新增 `.rsi/evidence/soak-hang-shape-2026-11-24/`（见 `baseline.txt`） |
| 产品代码 | `src/`、`lib/`、`test/` **一行未动**；没有 `npm run build`；没有 checkout / 提交 / push |
| 运行时 | node v26.8.1，dsh 0.2.2-rc.3 |

---

## ① Rig

```
node scripts/clone-profile.mjs --src ~/.dsh/profiles/headless \
  --home .tmp/soak-hang/dsh-home --name headless-soak          # parity 4/4, 0 credentials
node scripts/clone-profile.mjs --src ~/.dsh/profiles/headless \
  --home .tmp/soak-hang-vis/dsh-home --name headless-soak     # 第二轮（可见性）用独立 home
./run.sh scenario-hang.yml     prompt-tasks.txt run-1.txt     gateway.log      # 第一轮
SOAK_DIR=.../.tmp/soak-hang-vis ./run.sh scenario-hang-vis.yml prompt-tasks.txt run-2-vis.txt gateway-vis.log
```

`run.sh` 一次跑完一整轮：起假网关 → 等 `listening` 行（不猜睡眠时间）→ 在隔离 `DSH_HOME` + `HOME` 下跑一次
`timeout 1200 dsh --profile headless-soak --patch <overlay> <prompt>` → 收尾杀网关。`~/.dsh/bifrost.env` 只
`source` 进进程环境，不打印、不复制、不回显（`upstream-probe.txt` 里只有 `key present: yes`）。3080 上的实例
全程没碰、没重启。工作目录全在 `.tmp/soak-hang*/` 下，`.tmp/` 在 `.gitignore` 第 29 行。

假端点 `gateway.mjs`（**18591 / 18592 / 18593**，与旧轮的 18471/18472、18491/18492/18493 都不撞）：

| 端口 | 模型 id | 行为 |
| --- | --- | --- |
| 18591 | `soak/hang-always` | 读完整请求体，然后**永远不答**（socket 一直开着）。每次 completion 记一行：时间戳、每模型第几次、字节数、请求体片段、`opened_at` |
| 18592 | `soak/auth-bad` | 401（本轮没用上） |
| 18593 | `soak/work-live` / `plan-live` / `judge-live` / `sup-live` / `synth-live` | 代理到本机真网关 `127.0.0.1:18088`，把 `body.model` 改写成上游 id 再发，响应原样透传 |

foreground 的活调用全部走 18593 代理（不是直连），这样「活路被调了几次」也有独立计数，能和挂死路的计数并列看。

Overlay（`scenario-hang.yml` / `scenario-hang-vis.yml`，由 `gen-patch.mjs` 从一张表渲出）：

- `insert` 插件行指向本仓库的 `lib/index.js`（**不复制、不重建**，就指仓库里那份）。
- `mode: full`、`maxConcurrency: 1`、`loopEnabled: false`、`grokDefault: 'off'`
  （`off` 是为了避免自动 intake 在同一轮里起第二个 run —— 0.13.29 那轮踩过，两个 run 并发会让计数无法归因）。
- worker 链 = `[soak-hang/soak/hang-always, soak-pool/soak/work-live]`；planner/verifier/supervisor/synthesizer 全在活路。
- **不配 `guardianModel`**：配了会给每次超时调用追加 300 s 宽限（`GUARDIAN_WAIT_MS`），预算测量直接作废。
- `childTimeoutMs: 45000`。

### `childTimeoutMs = 45000` 的选择依据

要同时满足「活调用必活、挂死调用必死」。本机实测最慢的单次活调用是 synthesizer 约 **10.4 s**、worker 约 **6.2 s**
（`.rsi/evidence/soak-release-01329/README.md` §Budget 的表），45 s 是 **≥4× 最慢活调用**的余量。
代价是两次挂死共付 2 × 45 s ≈ 90 s 墙钟——两轮实测 `elapsed` 分别 369 s / 359 s，没有把整轮拖死。

> 口径说明：报告的渲染行写的是「the **1 minute** child budget」，因为渲染器做
> `Math.round(45000 / 60000) = 1`。准确数字在 `Child budget: 45000 ms per call` 那一行，本文一律用 45000。

## ② 逐任务计数表

判读口径：**一条 `mode=hang` 的 completion 行 = 挂死路被真正调用一次**。不用「跳过了多少」当证据。
完整原始行见 `gateway.log` / `gateway-vis.log`，机器化归因见 `analyze-run1.txt` / `analyze-run2-vis.txt`。

第一轮（shipped build，T0 = `2026-11-24T07:04:06.096Z`）：

| 任务 | 挂死路调用次数 | 谁付的 | 该任务最终状态 |
| --- | --- | --- | --- |
| t1 `17+25` | **2** | attempt 1（07:04:06.929）+ attempt 2（07:04:52.210） | **failed**（infrastructure / timeout） |
| t2 `144 的平方根` | **0** | — | verified（1 attempt） |
| t3 `1000-378` | **0** | — | verified（1 attempt） |
| t4 `13×7` | **0** | — | verified（1 attempt） |
| t5 `2 的 10 次方` | **0** | — | verified（1 attempt） |
| *（非任务尝试）* | **1** | t1 attempt 1 遗留 socket 的传输层重发（07:09:07.468） | 无归属，见下 |

第二轮（`lib-vis` 单行可见性翻转，T0 = `2026-11-24T07:14:31.546Z`）形状完全一致：

| 任务 | 挂死路调用次数 | 谁付的 | 状态 |
| --- | --- | --- | --- |
| t1 | 2 | attempt 1（07:14:37.025）+ attempt 2（07:15:22.233） | failed（infrastructure / timeout） |
| t2–t5 | 0 | — | 4 × verified（各 1 attempt） |
| *（非任务尝试）* | 1 | t1 attempt 1 的传输层重发（07:19:37.493） | — |

**挂死路 HTTP 请求总数 = 3**，其中任务尝试 2 次（全归 t1），传输层重发 1 次。

### 为什么是「任务 1 付 2 次、任务 2 起归零」而不是「前两个任务各付 1 次」

这不是故障，是挂死族的 `switchModel=false` 直接后果（`src/script.ts` 的 `classifyFailureText` / `routeHealthFamilyOf`）：
timeout 属于 `ROUTE_HEALTH_FAMILIES` 会记 dead-route 账，但**不在** `switchOn` 里，所以任务重试时**不换路**，
第 2 次尝试照旧落回挂死路。于是：

- t1 attempt 1 → 挂死路 → 45 s → `timeout`（streak 1）
- t1 attempt 2 → 挂死路（`switchModel=false`，不换路）→ 45 s → `timeout`（streak 2 → 进 dead 表）
- 重试上限 `maxRetries` 固定为 1 → t1 两次用完 → **failed**
- t2 起：挂死路已在 dead 表里，`preferredIndices()` 把它排到最后 → worker 直接拿活路

503 形状之所以是「前两个任务各付 1 次」，是因为 server-error 在 `switchOn` 里，重试会换路，于是任务 1、2 都能验过。
**两种形状在「第 3 条任务起不再被调用」这一点上是同一件事**：t2–t5 四个任务的 worker 全部落在
`soak-pool/soak/work-live`，一次都没碰 18591。逐条可数。

### 那第 3 次是什么（必须说清，不能含糊）

- 请求体字节数：#1 = **43694**，#2 = 43963，#3 = **43694** —— #3 与 #1 完全相同。#2 不同（重试换了措辞）。
- 时间关系：#1 打开 07:04:06.929，#3 打开 07:09:07.468，相距 **300 539 ms**。
- 任务 1 第一次尝试的子会话（`sessions-run1/2e45710b-t1-attempt1.jsonl.zstd`）在 **07:09:06.927** 记了一条
  `llm/retry`（`policyKey = ["normal",5,["EMPTY_RESPONSE","RATE_LIMIT","SERVER","TIMEOUT","TRANSPORT"],500,10000,0.1]`），
  在 **07:09:07.454** 记了 `llm/retry-started`，**14 ms 后**假网关接到 #3。

也就是说：插件在 45 s 就把**脚本侧**的等待结算掉了，但它**不杀子代理**（`raceChildCall` 的注释写明「the engine
owns the child, the script owns only the decision to stop waiting」）。那个子代理的 HTTP 请求继续开着，直到
undici 的 300 s headers 超时到期（TIMEOUT/TRANSPORT 在重试策略里），传输层把**同一个请求体**重发了一次。
这次重发没有任何任务在等它，它是被运行收尾时连带中断的（子会话 `turn/end` 07:09:30.062，`aborted/parent`）。

所以计数上：**挂死路被调用 3 次，任务尝试占 2 次，都归 t1；没有第 6 个任务、也没有 t2–t5 的贡献。**
这条必须写进结论，因为它意味着「每轮挂死路被调用的次数」在真机上会被传输层重发抬高 1 次，
不能直接当成「有几个任务付过账」。

## ③ 问题二：无计时器的预算到底结不结算

### (a) 每次挂死调用的结算时延 vs `childTimeoutMs`

结算时刻插件不写日志，所以用**两头可观测事件夹**：请求所属子会话的 `turn/start`（≤ 计时器 arm 时刻）
和下一个子会话的 `turn/start`（重试或下一个任务，必定晚于 fire 时刻）。计时器按
`afterDelay(max(1, floor(45000)))` 臂上，fire = arm + 45 000 ms，所以：

| 轮 | 请求 | 端点收到请求 | 计时器 fire 落在 | 从端点收到请求算的结算时延 | 预算 |
| --- | --- | --- | --- | --- | --- |
| 1 | #1 | 07:04:06.929 | [07:04:51.846, 07:04:51.858]（12 ms 夹） | **44 917 – 44 929 ms** | 45 000 ms |
| 1 | #2 | 07:04:52.210 | ≤ 07:05:36.858 | **≤ 44 648 ms**（= 45 000 − 352 ms 子代理启动开销） | 45 000 ms |
| 2 | #1 | 07:14:37.025 | [07:15:21.925, 07:15:21.938]（13 ms 夹） | **44 887 – 44 900 ms** | 45 000 ms |
| 2 | #2 | 07:15:22.233 | ≤ 07:16:06.938 | **≤ 44 705 ms**（= 45 000 − 295 ms 开销） | 45 000 ms |
| 1 | #3 | 07:09:07.468 | 无 | 无 —— 没有任何预算在等它（传输层重发，运行收尾时中断，开了 22 594 ms） | — |
| 2 | #3 | 07:19:37.493 | 无 | 同上（开了 41 671 ms） | — |

结论：**结算了，而且结算在预算上。** 从「调用自己的起点」算精确等于 45 000 ms；从「端点收到请求」算
差 0.07–0.35 s，差额是子代理 arm 之后到真的发出 HTTP 请求之间的启动开销（第一轮 83 ms / 352 ms，第二轮 100 ms / 295 ms）。
不是永不结算，也不是被别的看门狗收尾：运行级 deadline 是 1 800 000 ms，整轮只跑 324 s，
checkpoint 里 `watchdog = {"cancelled":false,"deadlineHit":false,"deadlineMs":1800000}`；
`Guard: 0 finding(s)`（没配 guardian，所以也没有 300 s 宽限插进来）。

### (b) 真机实际走哪条时钟路径；无计时器兜底可不可达

`src/script.ts` 第 166–177 行把三条路做成了纯函数式的判定，输入只有 realm 的全局对象：

```js
hasHostTimer = typeof setTimeout === 'function' && typeof clearTimeout === 'function'
sleepCell    = SharedArrayBuffer + Atomics.waitAsync 可用
canRaceCalls = hasHostTimer || sleepCell !== null
raceChildCall(promise) { if (!canRaceCalls) { … watchNoTimer(…) } … }   // 兜底只在这个分支里
```

引擎侧（`@deepseek-ai/dsh-workflow-ptc` 的 `WorkflowExecution`，本插件确认走的就是它——`src/team-engine.ts`
靠 `PtcWorkflowEngine.inject` 的 DI 标记认出这个引擎）：

```js
this.compiled = new vm.Script(`(async () => {\n${body}\n})()`, …)
this.context  = vm.createContext({}, { name: `workflow:${meta.name}` })
const globals = { agent, parallel, pipeline, phase, log, args }   // 就这六个
for (const [key, value] of Object.entries(globals)) this.context[key] = …
```

空对象建的 `node:vm` context 只带 ECMAScript 内建，**不带任何 host 函数**。实测（`realm-probe.mjs` / `realm-probe.txt`，
用完全相同的 `vm.createContext({})` + 同样六个名字复刻）：

```
setTimeout = "undefined"     clearTimeout = "undefined"     setInterval = "undefined"
SharedArrayBuffer = "function"    Atomics = "object"    waitAsync = "function"
hasHostTimer = false    sleepCell != null = true    canRaceCalls = true
```

于是：**`hasHostTimer = false` → 走 `Atomics.waitAsync` 延迟分支**（`afterDelay` 的第二个 case）。
`raceChildCall` 的 `if (!canRaceCalls)` 那一支**永远不进**，所以 `watchNoTimer`（用 `Date.now()` 轮询的
无计时器兜底）**在本机真机不可达**。

再补一条机制旁证：`Atomics.waitAsync` 是真的「等」，不是自旋——`realm-probe.mjs` 实测 200 ms 的等待只花
**0.49 ms user + 0.14 ms sys CPU**。如果真走 `watchNoTimer` 的微任务自旋，两个 45 s 的挂死会把一个核钉住 90 s。

顺带记录一个 Node 26.8.1 的坑（影响复现脚本，不影响插件）：`await Atomics.waitAsync(cell,0,0,ms).value`
写在模块顶层会**永远不 settle**（进程 exit 0 就走），因为这个 promise 不 ref 事件循环。
`afterDelay` 用的是 `.then(run, run)`，所以插件本身没这个问题；`realm-probe.mjs` 里加了一个
`setTimeout` keepalive 才拿到数字，注释里写明了。

## ④ 台账原文行

shipped build 把 `showDiagnostics` 固定为 `false`（`src/config.ts:349`，且这个键在 `REMOVED_CONFIG_KEYS` 里，
patch 带不进去），所以 `Dead routes` 那一段在正式构建里**不会打印**。第二轮因此用了一份
`.tmp/soak-hang/lib-vis/` 的 `lib/` 副本，**只翻了一行**：

```diff
218c218
<                         text: renderReport(value),
---
>                         text: renderReport(value, { showDiagnostics: true }),
```

完整 diff 就是这一对（`diff -r lib .tmp/soak-hang/lib-vis | grep -c '^[<>]'` = 2）。路由、重试、预算、报告决策
逐字节相同，只有可见性变了。**两轮都跑了**，shipped build 那轮是主证据，这轮只把已经存在的事实变得可读。
原文行（`run-2-vis.txt`）：

```
Model routes: planner=soak-live/wb/global:deepseek-v4.1-flash; worker=soak-hang/soak/hang-always → soak-pool/soak/work-live; verifier=soak-pool/soak/judge-live; supervisor=soak-pool/soak/sup-live; synthesizer=soak-pool/soak/synth-live
Deadline: 1800000 ms per run (enforced by the plugin)
Child budget: 45000 ms per call (the run stops waiting on one call after this long)
Route switches:
- worker attempt 1 via soak-hang/soak/hang-always: timeout — worker call exceeded the 1 minute child budget and was settled as a timeout; retry with a smaller step
- worker attempt 2 via soak-hang/soak/hang-always: timeout — worker call exceeded the 1 minute child budget and was settled as a timeout; retry with a smaller step
Dead routes (two consecutive transport failures; live routes are tried first):
- soak-hang/soak/hang-always: timeout (2 in a row)
```

`Route switches` 两行 + `Dead routes` 一行，与网关日志里挂死路恰好 2 次任务尝试、且第 3 条任务起换活路**逐条对得上**。

## ⑤ 搭形状记录：5 个任务真的成立

**成立。** 两轮都是 caller 直接给 5 个任务，planner 腿没跑，没有塌成兜底单任务：

| 证据 | 值 | 出处 |
| --- | --- | --- |
| 报告行 | `Plan: caller; 5 task(s); 4 verified` | `run-1.txt` / `run-2-vis.txt` |
| plan 来源 | `plan.source = "caller"`, `plan.taskCount = 5` | checkpoint（`baseline.txt` 同目录的 run 目录，见下） |
| 任务行数 | 报告 `Failures` + `Confirmed evidence` 共 5 条任务行（t1…t5） | `run-1.txt` |
| 每任务尝试数 | t1 = 2，t2–t5 = 1 | checkpoint `tasks[]` |
| 子会话数 | 15 个（t1 两个执行会话 + t2–t5 各 worker/verifier/supervisor 12 个 + 1 汇总） | `analyze-run1.txt` §child turns、`checkpoint-run1.txt` §agents |
| 维度 | `Failures: 2 infrastructure`（t1 的两次尝试）+ `4 verified` | `run-1.txt` |

上上轮（0.13.27）塌成 1 个任务的原因是 planner 腿超时进兜底，而这轮 caller 直接给了 `tasks`，
planner 根本不该跑——两轮日志里也确实一次没有 planner 调用：`grep -c 'model=soak/plan-live' gateway.log` = 0，
`gateway-vis.log` 同样 = 0。
所以这次没有「搭不成」，不需要列失败原因链。

checkpoint 位置（run 1）：`.tmp/soak-hang/dsh-home/checkpoints/grok-workflow/checkpoint-d0132702-*.json`；
`plan` / `tasks` / `stages` / `watchdog` / `agents` 的关键字段已逐字抄进本目录的 `checkpoint-run1.txt`。

## ⑥ 诚实缺口

1. **上游模型替换。** 简报指的 `wb/cn:deepseek-v4.1-flash` 在本机网关上实时探测是
   `503 no_healthy_account`（`upstream-probe.txt`，15:21 又探一次，同样 503）。所有活路改用
   **`wb/global:deepseek-v4.1-flash`**——同一个网关、同一把 key、同一个模型 id，只换路由组。
   假网关启动行记录的也是 `upstream=127.0.0.1:18088/wb/global:deepseek-v4.1-flash`。
2. **`Dead routes` 原文行来自可见性翻转的副本。** 正式构建把 `showDiagnostics` 固定成 false 且该键被
   `REMOVED_CONFIG_KEYS` 拒收，所以原文行只能从一份单行翻转的 `lib/` 副本渲出。shipped build 的那轮
   是主证据（计数、结算时延、任务归属全部来自它），副本那轮只提供渲染文本。diff 全量就是上面那 2 行。
3. **第 3 次挂死路调用是传输层重发，不是任务尝试。** 真机上「每轮挂死路被调用几次」会被 undici 的
   300 s headers 超时抬 1 次。这不是插件的 dead-route 逻辑漏洞，但它确实让「按 completion 行计数」和
   「按任务归因计数」不再是一比一，任何后续读数都必须先分清这两件事。
4. **t1 是 failed 而不是 verified。** 因为 `switchModel=false`，两次尝试都不换路，重试上限 1 次用完就没了。
   这是机制的正确表现（简报明确允许「任务 1 自己付 2 次」），但它意味着挂死形状下**第一个任务拿不到结论**——
   与 503 形状（5/5 验过）不同，这点不能混着说。
5. **没测到的形状。** 401 端口（18592）、`dead503` 模式、三条以上路由的链、`guardianModel` 配了之后的
   300 s 宽限、以及运行级 deadline 真的到期的情形——本轮一个都没碰，本目录里也没有任何结论依赖它们。
6. **`Child budget` 渲染行的单位。** 报告写「the 1 minute child budget」，实际是 45 000 ms
   （`Math.round(45000/60000) = 1`）。准确数字只在 `Child budget: 45000 ms per call` 那行。

## 文件清单

| 文件 | 内容 |
| --- | --- |
| `README.md` | 本文件 |
| `baseline.txt` | HEAD / blob sha / sha256 / 树状态 / node+dsh 版本 |
| `upstream-probe.txt` | 开跑前两条上游路由的实时探测（`key present: yes`，无明文） |
| `checkpoint-run1.txt` | 插件自己的 checkpoint：`plan.source=caller` / `taskCount=5` / 每任务尝试数 / 15 条 agent 记录 / `stages` / `watchdog` |
| `gateway.log` | 第一轮假网关原始日志（含每次挂死请求的 `opened_at` / 字节数 / 请求体片段） |
| `gateway-vis.log` | 第二轮同样格式 |
| `run-1.txt` / `run-2-vis.txt` | 两轮 `dsh` 的完整输出（含工具返回全文与 `exit=/elapsed=` 收尾行） |
| `analyze-run1.txt` / `analyze-run2-vis.txt` | `analyze.mjs` 的机器化归因：挂死路请求逐条、代理路每模型计数、子会话时间线、结算夹、字节相同配对 |
| `realm-probe.txt` | realm 探针输出（`canRaceCalls = true`、兜底的不可达判定、Atomics 低 CPU 旁证） |
| `scenario-hang.yml` / `scenario-hang-vis.yml` | 两轮的 overlay（`gen-patch.mjs` 渲出） |
| `sessions-run1/` `sessions-run2-vis/` | 根会话 + t1 两次尝试的子会话（`llm/retry` / `llm/retry-started` / `turn/end` 就在里面） |
| `gateway.mjs` `gen-patch.mjs` `run.sh` `analyze.mjs` `realm-probe.mjs` | 复现脚本 |
| `extract.mjs` `counters.mjs` | 从 0.13.29 那轮借来的工具，**本轮未使用**：本轮 `tool/result` 的 `data` 里只有渲染后的文本，
没有 canonical report 对象，`extract.mjs` 的 walker 找不到东西（`### tool/result #1 … --- no canonical report object found ---`）。
canonical 字段改由 `checkpoint-run1.txt` 提供（插件自己写的 checkpoint，含 `plan.source` / 每任务尝试数 / 15 条 agent 记录）。 |

### 重跑命令与退出码

```
$ node scripts/clone-profile.mjs --src ~/.dsh/profiles/headless --home .tmp/soak-hang/dsh-home --name headless-soak
  → exit 0   (parity 4/4 equal after redaction; credentials redacted: 0 line(s) in 0 file(s))
$ node .rsi/evidence/soak-hang-shape-2026-11-24/gen-patch.mjs
  → exit 0   (childTimeoutMs=45000 liveModel=wb/global:deepseek-v4.1-flash)
$ node .rsi/evidence/soak-hang-shape-2026-11-24/realm-probe.mjs
  → exit 0   (canRaceCalls = true; watchNoTimer 不可达)
$ .rsi/evidence/soak-hang-shape-2026-11-24/run.sh scenario-hang.yml prompt-tasks.txt run-1.txt gateway.log
  → exit 0   (dsh 内部 exit=0 elapsed=369s)
$ SOAK_DIR=.../.tmp/soak-hang-vis .rsi/evidence/.../run.sh scenario-hang-vis.yml prompt-tasks.txt run-2-vis.txt gateway-vis.log
  → exit 0   (dsh 内部 exit=0 elapsed=359s)
$ node .rsi/evidence/soak-hang-shape-2026-11-24/analyze.mjs <gateway.log> .tmp/soak-hang/dsh-home 45000
  → exit 0   (TOTAL hang-route requests: 3)
```

### 怎么重建可见性副本（`.tmp/soak-hang/lib-vis/`）

跑完就删了，两行重建（产物只在 `.tmp/` 里，不碰仓库）：

```
cp -r lib .tmp/soak-hang/lib-vis
sed -i 's|text: renderReport(value),|text: renderReport(value, { showDiagnostics: true }),|' .tmp/soak-hang/lib-vis/index.js
diff -r lib .tmp/soak-hang/lib-vis | grep -c '^[<>]'    # 必须是 2（删 1 行、加 1 行）
```

收尾：`.tmp/soak-hang/` 与 `.tmp/soak-hang-vis/` 下的隔离 home（以及上面的 `lib-vis` 副本）已删除，
证据目录保留；`git status --short` 除本证据目录外无新增残留。
