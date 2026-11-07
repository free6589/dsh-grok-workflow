# 诊断报告：session-3361cd6e 上下文占用 ~92–95% 却不触发自动压缩

- 诊断时间：2026-11-07 02:30–02:55 (+08:00)
- 对象会话：`session-3361cd6e-ff7e-41a0-b086-cb1c72f6341a`（cwd `/home/fish/projects_mine/dsh-grok-workflow`）
- 安装版 DSH：`/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@deepseek-ai/dsh`，`package.json` version `0.2.1-rc.2`（`dsh --version` → `0.2.1-rc.2`）
- DSH_HOME（本次会话实际使用的 home）：`/home/fish/dsh-layerfs`（`env | grep ^DSH`）
- 方式：纯只读诊断。未修改会话数据、未改压缩阈值、未改 DSH 核心、未读取任何凭据值。

状态词汇：`CONFIRMED` 直接观测（源码/命令/真实日志）；`HYPOTHESIS` 未实机验证的推断；`NOT_RUN` 明确未执行；`BLOCKED` 因外部条件无法执行。

---

## 0. 结论速览

**根因不在阈值、不在开关，而在 token 计量器的会话回放被一条“不属于任何 step 的 assistant/message”打断。**
本仓库插件 `dsh-grok-workflow` 的「即时回执（instant receipt）」在 turn 开始后、第一个 `step/start` 之前写了一条
`assistant/message`（`source.provider = grok-workflow`, `model = workflow-receipt`）。DSH 的 `@deepseek-ai/dsh-token-meter`
在回放日志时要求每条 `assistant/message` 都落在 `step/start … step/end` 之内，否则抛错；该错误使
`@deepseek-ai/dsh-compaction-basic` 的每次自动压缩尝试都在“测量”这一步就失败，被 `agent/pre-step` 处理器
`catch` 成一条 `logger.warn`，于是**上下文继续涨，压缩永远不触发，而界面上看不出任何异常**。

一句话：**GUI 的 92% 由独立投影算出（照常工作），压缩用的 `tokenMeter.measure()` 从第 5 轮起永久抛错（静默停摆）。**

---

## 1. 该会话的实际上下文占用（数值 + 来源 + 采集时间）

### 1.1 权威投影数据（CONFIRMED）

数据源：会话投影缓存
`/home/fish/dsh-layerfs/storages/session_projcache/sessions/session-3361cd6e-ff7e-41a0-b086-cb1c72f6341a.json`
（该文件由 DSH 运行时持续写入，只读打开；读取时间 2026-11-07 02:35 与 02:48 两次）。

| 字段 | 快照 A（文件内 `seq = 6361`，02:32 左右） | 快照 B（`seq = 6557`，02:48 左右） |
| --- | --- | --- |
| `contextPressure.val.pressureTokens` | **921,147** | **953,777** |
| `contextPressure.val.surfaceTokens` | 651,095 | 676,146 |
| `contextPressure.val.sampledSurfaceTokens` | 651,028 | 675,826 |
| `contextPressure.val.contextWindow` | 1,000,000 | 1,000,000 |
| 推导 `projectedTokens = pressure + surface − sampled` | 921,214 | 954,097 |
| **占用百分比（projected / window）** | **92.1%** | **95.4%** |
| `contextBreakdown.val` | system 10,051 / tools 38,553 / messages 641,148（surface 651,199） | — |
| `sessionStats.val` | turns 17 / steps 933 | turns 17 / steps 961 |
| `modelSelection.val.lastUsed` | `bifrost-responses` / `opencode-go/muse-spark-1.3-contributor` / effort `max` | 同 |

- **用户看到的 ~90% 就是 `projectedTokens / contextWindow`**（92% → 95%）。公式出处：
  `dsh-client-ui-conversation/lib/client.js:18443-18451`（`contextOccupancy()`：`percent = round(usedTokens / contextWindow * 100)`，
  `usedTokens = pressure.projectedTokens ?? pressure.pressureTokens`），面板取数处 `client.js:18529`（`useProjection("contextPressure")`）。CONFIRMED。

### 1.2 原始用量（CONFIRMED）

`tokenUsage.val.last`（快照 B，turn 17 / step 71）：`uncachedInputTokens 576 + cacheReadTokens 953,201 + cacheWriteTokens 0`
→ prompt 侧 953,777（与 `pressureTokens` 完全一致；`pressureFrom()` 定义见 `dsh-token-meter/lib/index.js:365-366`：
`inputTokens + cacheRead + cacheWrite`）。累计 `cacheReadTokens 503,561,137`、`outputTokens 800,336`。

### 1.3 采集口径说明与未取到的入口

- 上述数值来自 DSH 本地投影缓存（与 Web GUI 同源）。CONFIRMED。
- Web GUI HTTP API：`curl -s -o /dev/null -w '%{http_code}' http://100.111.111.88:3090/` → **401**；该实例需要鉴权，
  按任务约束不读取/使用任何凭据，故**未走 API 取值**：`BLOCKED`（不影响结论，投影缓存即为 GUI 数据源）。
- 未修改会话：全程只读（`zstd -dc` 解压到内存/脚本 stdin，未写回）。

### 1.4 会话事件日志中的实测压力轨迹（CONFIRMED）

日志：`/home/fish/dsh-layerfs/sessions/--home-fish-projects_mine-dsh-grok-workflow--/session-3361cd6e-ff7e-41a0-b086-cb1c72f6341a/session.v4.jsonl.zstd`
（解压后 6,513 行；seq 0…6557 连续；`type: session` 头 → `agentPreset: "standard"`）。

- 首次 prompt ≥ 800k：`seq 5100`（turn 16 / step 146，802,094）。
- turn 17 全程 911k–953k（例：`seq 6359` step 44 = 921,147；`seq 6431` step 55 = 930,437）。
- 整个日志中**只有 1 次压缩**：`compaction/start` seq 2148（turn 4，11-06 02:13:57）→ `compaction/summary` 2149 → `compaction/end` 2151；
  此外 seq 1378–1410、2131 有 `compaction/prune`（其上游同样是压缩流程）。**seq 2151 之后再无任何 `compaction/*` 事件**，尽管压力长期 ≥ 800k。

---

## 2. 安装版 DSH 中「自动压缩」的准确名称与触发条件

组件：`@deepseek-ai/dsh-compaction-basic@0.2.1-rc.2`
（`dsh/package.json` dependencies 与 `dsh/node_modules/@deepseek-ai/dsh-compaction-basic/package.json`；
description：*"Token-meter-driven compaction policy and LLM summarization backend"*）。
源码（安装版为打包后的 ESM，行号即该文件真实行号）：
`/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-compaction-basic/lib/index.js`

### 2.1 默认阈值原文（CONFIRMED）

```
15:  const DEFAULT_THRESHOLD_RATIO = .8;      // “Default request-pressure fraction for every routed model.”
17:  const DEFAULT_RETAIN_RATIO = .16;         // 保留尾部原文比例
63:  const headroomTokens = config.headroomTokens ?? 65536;
64:  const maxTokens = config.maxTokens ?? headroomTokens;
85:  auto: config.auto ?? true                // 自动压缩默认开启
```

### 2.2 阈值公式（CONFIRMED）

```
126: messageBudgetTokens  = contextWindow - reservedCompletionTokens
130: pressureBudgetTokens = messageBudgetTokens - policy.headroomTokens
132: thresholdTokens      = floor(min(contextWindow * policy.thresholdRatio, pressureBudgetTokens))
133: retainTokens         = floor(messageBudgetTokens * policy.retainRatio)
134: 若 retainTokens >= thresholdTokens 则抛 TargetPressureConfigError
```

`reservedCompletionTokens`（同文件 757-758 行）= `agent.session.requestHeader().config.maxTokens ?? defaultMaxTokens ?? 0`。

**代入本会话**（路由 `bifrost-responses / opencode-go/muse-spark-1.3-contributor`，配置见 §3.2）：
`contextWindow = 1,000,000`、`maxTokens = 32,000`、`headroom = 65,536`
→ `thresholdTokens = floor(min(800,000, 902,464)) = ` **800,000**；`retainTokens = floor(968,000 × 0.16) = 154,880`。

### 2.3 触发点与判定（CONFIRMED）

```
839:  ctx.on("agent/pre-step", async ({ agent, signal }, next) => {
841:      const result = await this.compactIfNeeded(agent, "pressure", signal);
843:      } catch (error) { …
849:          ctx.logger.warn(`step compaction failed: ${message}; continuing the turn`);
…
919:  let measurement = meter.measure(agent.session);       // ← 测量（先于任何阈值判断）
941:  if (measurement.totalTokens < spec.thresholdTokens) return null;
```

即：口径是 **token 数**（不是消息数、不是百分比），在每个 step 之前由 `agent/pre-step` 触发；另外还有一条
“provider 报 context overflow”恢复路径（`agent/request-error`，同文件 872 行），它同样要先 `measure()`。
**注意：`measure()` 在 919 行、阈值判断在 941 行——测量一旦抛错，阈值根本没机会被比较。**

`measure()` 的定义：`dsh-token-meter/lib/index.js:722`；它把
`baseline.tokens（优先用 provider usage）+ surfaceDelta` 作为 `totalTokens`（同文件 733-770）。
而 `usageTokens()`（674-676）含输出侧 token，`pressureFrom()`（365-366）不含——这就是 `totalTokens ≈ 922k/955k`
与 GUI 语义的细微差别来源，但两者都远超 800,000。

---

## 3. 本机 DSH 生效配置中与压缩/上下文相关的键值

### 3.1 宿主层：官方 web 模板把压缩后端“移出宿主平面”，预设内再挂载（CONFIRMED）

`@deepseek-ai/dsh-web-app/cordis.patch.yml`（`.../node_modules/@deepseek-ai/dsh-web-app/cordis.patch.yml`）：

```
532: # The token METER stays on the host plane; only the compaction backend that
533: # reads it moves. …
539: - id: compaction-basic
540:   disabled: true
542: - id: command-compact      （同段 disabled）
```

`@deepseek-ai/dsh-web-app/presets/standard.patch.yml:66-82` 在隔离组内重新挂载：

```
66:  - id: compaction
67:    name: cordis:group
68:    group: true
69:    isolate: { compaction: true, toolResultPruner: true }
72:      - id: compaction-basic            # 无 config → 全部取默认（auto=true, ratio=0.8, retain=0.16, headroom=65536）
75:      - id: command-compact
77:      - id: tool-result-pruner { thresholdChars: 8192, headChars: 4096, tailChars: 1024 }
```

组合后的整棵配置树（只读方式复现：把 `profiles/web` 复制到临时 home 后 `DSH_HOME=/tmp/dshdiag dsh --profile web --dump-config`，
2,322 行；真实 profile 目录在运行实例里是只读层，直接 dump 会 `EROFS: /home/fish/dsh-layerfs/profiles/web/cordis.yml`）中，
宿主层那几项显示为 `disabled: true`，预设 `standard` 内为启用。会话头 `agentPreset: "standard"`（`session.v4.jsonl` 首行）→
**本会话使用 preset 内那份实例**。

> 佐证：本会话第 4 轮真的压缩过一次（§1.4）。说明“压缩功能本身是启用且可工作的”。

### 3.2 模型路由声明的容量（CONFIRMED）

`/home/fish/dsh-layerfs/profiles/web/cordis.patch.yml`（`llm-pi-ai` → `bifrost-responses`）：

```
32:  - id: opencode-go/muse-spark-1.3-contributor
34:      contextWindow: 1000000
35:      maxTokens: 32000
```

会话内 `request/context` 事件也印证：`seq 15` = `contextWindow 500000`（更早的配置），`seq 4132`（11-06 23:45:51）= `1000000`。
即阈值在会话中途由 0.8×500,000 = 400,000 抬到 800,000。

### 3.3 插件自身配置（与压缩无直接关系，但决定是否产生“孤儿回执”）

`/home/fish/dsh-layerfs/profiles/web/cordis.patch.yml:1044-1051`：

```
- id: grok-workflow
  name: dsh-grok-workflow
  config:
    grokDefault: on
    historyChars: 80000
    maxRetries: 5
    timeoutMs: 86400000
    maxActiveRuns: 4
```

`instantReceipt` 未写入 → 取默认 `true`（`src/config.ts:137` `instantReceipt: z.boolean().default(true)`）。

### 3.4 直接回答“自动压缩当前是启用还是禁用”

- **本会话：启用**（standard preset 挂载，默认 `auto: true`；第 4 轮已真实触发）。CONFIRMED
- **宿主平面那份：禁用**（`dsh-web-app/cordis.patch.yml:539-540`），这是官方的平面归属设计，不是本次故障点。CONFIRMED
- 结论：不是“被禁用”，也不是“阈值没到”。

---

## 4. 根因结论（逐条对应证据）

### R1（主因，CONFIRMED）token 计量器回放被一条“孤儿 assistant/message”打断

日志证据（同一 `.jsonl.zstd`，按 seq 顺序）：

| seq | type | 关键内容 |
| --- | --- | --- |
| 2333 | `turn/end` | turn 4 结束 |
| 2335 | `turn/start` | turn 5 开始（此时**没有** open step） |
| 2337 | `plugin:grok-workflow/delivery` | `phase: "started"`, `turn: 5`, `outcome: "admitted"` |
| 2338 | `user/message` | 用户本轮输入（rpcId `88392d9e…`） |
| **2339** | **`assistant/message`** | `turn: 5, step: 0`，`source: {kind:"model", provider:"grok-workflow", model:"workflow-receipt"}`，文本「档位：团队档 — 因为：…」 |
| 2340 | `tool-workflow/run-start` | 团队档 workflow 起跑 |

代码证据：
- 该条消息由本仓库写入：`src/records.ts:671-693` `appendInstantReceipt()`，其中 `const { turn, step } = lastTurnOf(session)`
  后 `session.append('assistant/message', { turn, step, …, source: { provider: 'grok-workflow', model: 'workflow-receipt' } }, { surfaceOp: 'append' })`；
  调用点 `src/gate.ts:787-793`（实际 append 在 790 行；team 档“先回执后执行”，注释即“so the run never looks blank while in flight”）。
- DSH 侧的硬约束：`dsh-token-meter/lib/index.js:846-848`
  `if (stepStart === void 0 || stepStart.turn !== event.data.turn || stepStart.step !== event.data.step) throw new Error(`token meter: assistant/message at seq ${event.seq} has no matching step/start event`)`。
- 失败不可自愈：`_sync()`（同文件 792-803）只有 fold 成功才推进 `state.consumedEvents`，抛错后游标停在 2339，
  **之后每次 fold 都会在同一处再抛**。

复现（本次诊断执行的确定性回放，只读）：
`docs/knowledge/evidence/diag-ctx-compaction-verify-metric.mjs`（`node docs/knowledge/evidence/diag-ctx-compaction-verify-metric.mjs`，Node 26.8.1）输出：
_（诊断当时脚本放在未跟踪的 `out/diag/verify-metric.mjs`；发布 v0.5.1 收尾时随证据入库，路径如上，内容未改。）_

```
STEP 1  raw measure()          : THROWS -> token meter: assistant/message at seq 2339 has no matching step/start event
STEP 2  orphan assistant events: [{"seq":2339,"turn":5,"step":0,"source":{"kind":"model","provider":"grok-workflow","model":"workflow-receipt"}}]
STEP 3  repaired measure()     : totalTokens=954926 (baseline.kind=usage, surfaceTokens=676821, nodes=1731)
STEP 4  thresholdTokens        : 800000 (0.8*1000000 vs window-reserved-headroom=902464)
STEP 5  verdict                : totalTokens 954926 >= threshold 800000
```

> 注：该会话仍在运行，`STEP 3` 的数值随日志增长（02:50 复跑 `954,926`，02:55 再跑 `958,767`）；
> `STEP 1/2` 的报错与孤儿 seq 恒定不变——这两项才是判定依据。

### R2（CONFIRMED）该异常被压缩流程吞掉，只留一条 warn —— 所以“看起来什么都没发生”

`dsh-compaction-basic/lib/index.js:839-850`：`agent/pre-step` 的 try/catch 对非 `TargetPressureConfigError`
也只做 `ctx.logger.warn('step compaction failed: …; continuing the turn')`，然后 `return next()`。
会话日志里不会出现任何 `compaction/*` 事件，Web GUI 也不会报错 → 现象就是“占用 90% 而压缩不动”。

### R3（CONFIRMED）阈值确实早已被越过——所以问题不可能在阈值/口径

- 计数正常时（STEP 3）`totalTokens = 954,926 ≥ 800,000`（STEP 4）。
- 反证：第 4 轮那次压缩发生在窗口还是 500,000 的时候，压缩前最大 prompt = **399,817**（seq 2126，turn 3 / step 307）+
  该步输出 535 + surface delta ⇒ 刚刚越过 `0.8 × 500,000 = 400,000` 就压缩了。这条独立印证了 `thresholdRatio=0.8`
  默认值确实生效，且**断点前后行为完全一致：断点前触发，断点后打死不触发**。

### R4（CONFIRMED）这是系统性缺陷，不是该会话独有

对同工作区最近 5 个会话存档做同样的“回执是否落在 step 内”扫描：

```
6235cc6a-…  receipts=0 orphans=0
d34eda05-…  receipts=0 orphans=0
session-3361cd6e-… receipts=1 orphans=1      ← 本会话
session-eb3f5542-… receipts=1 orphans=1      ← 同样中招
d5448c9a-…  receipts=0 orphans=0
```

即：**只要 grok-workflow 的 `instantReceipt` 在 turn 边界之后、`step/start` 之前落盘，该会话的自动压缩就永久失效。**

### R5（HYPOTHESIS，源码推导，未实机触发）连“溢出兜底”也一起失效，且手动 `/compact` 也会失败

- `agent/request-error` 的 overflow 恢复路径同样先 `measure()`（919 行）→ 同样抛错 → 真实触达 1M 窗口时没有兜底。
- 手动压缩 `compactNow()`（985-1010 行）也调用 `this.ctx.tokenMeter.measure(…)`，其外层 catch 会把任意错误
  包成 `ManualCompactionError("busy", …)` → 用户会看到“busy / 无法压缩”的误导性提示。
  为遵守“不修改会话数据”的约束，**本次未在活动会话上真的执行 `/compact`**：`NOT_RUN`。

### 明确排除的假设

| 假设 | 判定 | 依据 |
| --- | --- | --- |
| 压缩被禁用 | 排除 | preset 内挂载且第 4 轮已触发；宿主层 `disabled: true` 是官方平面设计（§3.1） |
| 阈值未达到 / 口径不同 | 排除 | R3：954,926 ≥ 800,000；0.8×窗口公式见 §2.2 |
| 阈值被配成 >1.0 或 modelPolicies 覆盖 | 排除 | profile 内无任何 compaction 配置键（`grep -i compact cordis.patch.yml` 无命中） |
| 该 session 类型不支持压缩 | 排除 | 同 session 第 4 轮压缩过（seq 2148-2151） |
| 只有手动触发 | 排除 | 第 4 轮是 `agent/pre-step` 的自动压力压缩（无 `/compact` 命令事件） |

---

## 5. 修复方案

### 5.1 根因修复（本仓库，推荐；改完新会话即恢复自动压缩）

**目标：插件永不在没有 open step 的情况下写 `assistant/message`。**
`assistant/message` 是 token meter 唯一要求 step 配对的 surface 类型
（`SURFACE_EVENT_TYPES` 见 `dsh-session/lib/index.js:160-165`；只有 `assistant/message` 在 token-meter 846-848 行被强校验）。

改法（`src/records.ts` `appendInstantReceipt`，约 671-693 行；`appendUnloadNotice` 745 行同理；`src/gate.ts:463`、`:973` 需复核）：

1. 写之前先判定“当前是否处于打开的 step 且 `(turn, step)` 与 `lastTurnOf()` 一致”；
2. 不一致时**延后**：把回执挂到该轮第一个 `step/start` 之后再写（用真实的 `turn/step`），或直接跳过回执；
3. 兜底断言：`session.append('assistant/message', …)` 外层已有 try/catch，但要让“无 step 可挂”成为**显式跳过**而不是写坏日志。

回归测试（必须，且确定性、不依赖在线模型）：

- 单测：构造 `turn/start` 后立即调用 `appendInstantReceipt`，断言**未产生**孤儿 `assistant/message`
  （或断言延后到下一 `step/start` 后写入且 `turn/step` 匹配）。
- 回放测试：把一段含回执的会话事件喂给 `TokenMeter.measure()`（可直接 import
  `@deepseek-ai/dsh-compaction-basic` 的 peer `@deepseek-ai/dsh-token-meter`），断言**不抛错**；
  本报告 `docs/knowledge/evidence/diag-ctx-compaction-verify-metric.mjs` 的 STEP 1/2/3 就是该断言的雏形。

### 5.2 立即可用的配置规避（不改代码；只对**新**会话有效）

在 `/home/fish/dsh-layerfs/profiles/web/cordis.patch.yml` 的 `- id: grok-workflow` → `config:` 下加一行：

```yaml
- id: grok-workflow
  name: dsh-grok-workflow
  config:
    instantReceipt: false      # 关闭团队档“即时回执”，避免产生 step 外 assistant/message
    grokDefault: on
    …
```

改完需重启承载实例（`systemctl --user restart dsh-layerfs-web.service`，unit 见
`~/.config/systemd/user/dsh-layerfs-web.service`，`ExecStart=/home/fish/.local/bin/dsh web --host 100.111.111.88 --port 3090 --no-open`）。
注意：该 profile 目录在运行实例中是只读层（直接 `dsh --dump-config` 会 `EROFS`），写入需按既有流程（备份 `cordis.patch.yml.bak-*`）在宿主侧完成。
代价：团队档起跑时不再有即时回执，用户可能短暂看到空白。**本次未执行该改动（任务要求只给建议）。**

### 5.3 上游加固建议（不能改 DSH 核心，仅提交 issue/等版本）

- `@deepseek-ai/dsh-token-meter`：对“无 step 配对的 `assistant/message`”容错（当作仅入 surface 的节点计价，或跳过并只 warn），
  而不是抛断整个 fold；或
- `dsh-session` 的 `session.append` 对 `assistant/message` 的 `turn/step` 做前置校验，让插件在写入时就拿到明确错误；
- `dsh-compaction-basic`：把“测量失败”升级为可见状态（如 session 事件 / GUI 告警），不要只 `logger.warn` 吞掉。

只有 5.2/5.3 任一落地后，**已存在的会话（含本条 seq 2339）才可能恢复**：修复后重启 DSH，`measure()` 回放能穿过孤儿事件。
单纯重启 DSH **不会**修复本会话（日志里的孤儿事件仍在，回放照样抛错）。

### 5.4 当前这条会话怎么办

- 无法原地修复（token meter 回放状态卡在 seq 2339；手动 `/compact` 走同一 meter）。
- 建议：完成手头这一轮后**新开会话**继续（新版插件 + 5.2 配置）；把本报告 §4 作为交接依据。
- 风险提示：真实窗口 1,000,000，当前 prompt 已 953,777（95%），溢出兜底同源失效（R5），**继续增长会直接请求失败**。

---

## 6. 执行清单（哪些跑了、哪些没跑）

| 动作 | 状态 | 命令/路径 |
| --- | --- | --- |
| 读会话投影缓存 | CONFIRMED | `python3 -c` 读 `~dsh-layerfs/storages/session_projcache/sessions/session-3361cd6e-….json` |
| 解压并统计会话事件 | CONFIRMED | `zstd -dc …/session.v4.jsonl.zstd`（6,513 行，seq 连续） |
| 组合配置树 | CONFIRMED | `DSH_HOME=/tmp/dshdiag dsh --profile web --dump-config`（真实 profile 只读，`EROFS`） |
| token meter 回放复现 | CONFIRMED | `node docs/knowledge/evidence/diag-ctx-compaction-verify-metric.mjs`（STEP 1–5；原在未跟踪的 `out/diag/`，已随本证据入库） |
| 跨会话同类扫描 | CONFIRMED | 见 R4（5 个会话，2 个中招） |
| Web GUI API 取数 | BLOCKED | `curl` → HTTP 401；不读凭据 |
| 手动 `/compact` 实测 | NOT_RUN | 会在活动会话上产生压缩，违反“不改会话数据”约束 |
| 修改配置/阈值/插件代码 | NOT_RUN | 任务要求只给方案 |

## 7. 证据索引

1. `/home/fish/dsh-layerfs/storages/session_projcache/sessions/session-3361cd6e-ff7e-41a0-b086-cb1c72f6341a.json`（`contextPressure` / `contextBreakdown` / `tokenUsage` / `sessionStats`）
2. `/home/fish/dsh-layerfs/sessions/--home-fish-projects_mine-dsh-grok-workflow--/session-3361cd6e-ff7e-41a0-b086-cb1c72f6341a/session.v4.jsonl.zstd`（seq 15/2148/2151/2335-2340/4132/5100/6557）
3. `.../@deepseek-ai/dsh-compaction-basic/lib/index.js`（15/17/63-64/85/126-134/757-758/839-850/919/941/985-1010）
4. `.../@deepseek-ai/dsh-token-meter/lib/index.js`（365-366/674-676/722/733-770/792-803/835-848）
5. `.../@deepseek-ai/dsh-session/lib/index.js:160-181`（`SURFACE_EVENT_TYPES` / `isSurfaceEvent`）
6. `.../@deepseek-ai/dsh-web-app/cordis.patch.yml:532-542`、`presets/standard.patch.yml:66-82`
7. `.../@deepseek-ai/dsh-client-ui-conversation/lib/client.js:18443-18451, 18529`
8. `/home/fish/dsh-layerfs/profiles/web/cordis.patch.yml:26-44（模型 contextWindow/maxTokens）, 1044-1051（grok-workflow 配置）`
9. `src/records.ts:671-693`、`src/gate.ts:787-793`、`src/config.ts:137`
10. `docs/knowledge/evidence/diag-ctx-compaction-verify-metric.mjs`（已入库；诊断时位于未跟踪的 `out/diag/verify-metric.mjs`）+ 其 STEP 1–5 输出（§4 R1）
