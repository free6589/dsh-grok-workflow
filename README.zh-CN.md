# Grok Workflow for DSH

<p align="center">
  <strong>规划、并行执行、独立验证、如实汇报——需要的时候，模型调用一个工具就能拿到。</strong>
  <br />
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/free6589/dsh-grok-workflow/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/free6589/dsh-grok-workflow/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <img alt="Node.js 22+" src="https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white">
  <img alt="DSH 0.2.x" src="https://img.shields.io/badge/DSH-0.2.x-536DFE">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-blue.svg"></a>
</p>

**Grok Workflow for DSH** 是 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 的外部插件。它注册模型可直接调用的 `grok_workflow` 工具，以及一个可选的接单台，让模型把这项工作分成可复核的块来下单。从 `0.13.35`（M3.3）起，它在用户消息前面**什么都不放**：入口闸门和它所属的前台已经删除，消息按你写的样子原样到达模型。

会话内的开关（`/grok on|off`；配置默认值 `grokDefault: off` 是会话没有记录时报出的回退值）现在只管一件事：这个会话里接单台的六个工具能不能接活。它从不改变一条消息的遭遇——开或不开，消息都照样送达。

你不需要写工作流脚本。安装插件、重启 profile，然后提一件需要多个独立步骤的事：模型会调用 `grok_workflow`，那件事被规划、执行、逐条对照验收标准验证，并在同一轮内给出答案。

![规划、执行、验证、重试与汇报工作流](docs/images/workflow-overview.svg)

## 你会得到什么

| 需求 | 本插件的做法 |
|---|---|
| **消息前面什么都没有** | 从 `0.13.35` 起，用户消息不会被认领、拒绝、截短或加注：`agent/pre-step` 上只剩窄心跳监听与接单台的观测，两者都不决定一条用户消息。`test/block-flag-baseline.spec.ts` 把这条放行钉成了八种 payload 的字节。 |
| **按会话开启，且如实相告** | `grokDefault: off` 意味着一个会话在 `/grok` 开启之前就是普通聊天；`/grok off` 再关掉。开关词去掉首尾空白后不分大小写（`/grok ON`、`/grok  Off ` 都算），其它参数只回 `/grok [on|off|status]` 并且不动开关；`/grok status` 什么都不写，只报上一次运行——状态、停下的原因、守卫看到了什么、能不能从恢复点接着跑、哪些任务没做完。写不进去的开关会被报成失败，而不是被当成已生效。 |
| **按角色选模型** | `roles.planner`、`roles.worker`、`roles.verifier`、`roles.synthesizer` 各带自己的模型。 |
| **每角色有序备用链** | 每个角色最多 50 条路由；路由级失败会推进该角色的链，实际用到的路由会写进报告。 |
| **可操作的设置** | 导出的 `Config` **就是** DSH 设置页：字段是活值、未知键被拒绝并给出建议、链会对照运行时真实拥有的 provider 校验。 |
| **工作流形状可选** | 工作流形状由生成的脚本决定，不是一个配置开关：`test/engine-contract.spec.ts` 与 `test/engine-harness.ts` 走真实引擎契约来钉它；按档案改变工具面的开关只有接单台那六个工具。 |

## 一条命令安装

**开始之前：**需要 DSH **`>=0.2.1-rc.2 <0.3.0`** 与 Node.js **22 或更高版本**。这就是包在 `engines.dsh` 里声明的区间，也是 DSH loader 唯一评估的要求；`0.2.x` 的预发布版本包含在内。你的 profile 必须包含工作流与子代理服务（标准 base/headless 套件已提供）。

如果还没有 profile，请在安装插件**之前**先用 headless 模板创建：

```sh
dsh --profile grok-workflow-dev --from-default-profile headless --dump-config
```

然后安装插件：

```sh
dsh plugin --profile grok-workflow-dev add github:free6589/dsh-grok-workflow#v0.13.37
```

> `#v0.13.37` 是当前发布版本。请固定你真正想要的标签；省略标签会跟随 `main`，那不是发布版本。不要在 `plugin add` 之后再运行 `--from-default-profile`：它会重建 profile 并移除你刚装好的插件。

最后重启 profile，让 DSH 加载新插件：

```sh
dsh --profile grok-workflow-dev
```

## 启用与自检

bundle 行由 `dsh plugin add` 写入。重启后确认它确实被组合进去：

```sh
dsh --profile grok-workflow-dev --dump-config | grep -A4 'grok-workflow'
```

健康的行包含 `id: grok-workflow` 与 `name: dsh-grok-workflow`。启动时插件还会打印一行设置面诊断，例如 `settings surface: page auto-generated for "grok-workflow" (9 field(s), …)`。

**进了组合图 ≠ 被激活。** 插件注入 `workflowEngine`，而 Web 应用层默认禁用了工作流 provider，所以在 `dsh web` 上上面那行必要但不充分：

```yaml
# <profile>/cordis.patch.yml
- id: workflow-ptc
  config:
    provider: spawn
  disabled: false
```

四条校验才能证明它真的激活了：启动日志没有 `pending (waiting for service: workflowEngine)`、`POST /api/settings/describe` 里出现 `grok-workflow` 命名空间、插件页出现 **Grok workflow** 卡片、真实会话的工具列表里有 `grok_workflow`。完整流程（包括如何把"在跑的实例"迁到新构建、哪一步需要你授权）见 [`docs/LOCAL-TESTING.md`](docs/LOCAL-TESTING.md#activate-in-an-existing-live-profile--needs-the-operators-authorisation)。

设置 → 左列 **Workflow**（与「通用 / 模型 / 内置插件」平级）就是设置页；插件页仍保留同名 **Grok workflow** 卡片，点开是同一个页面。页面上是标量设置、五条角色链（每角色最多 50 条），以及显示为只读并给出原因的结构性字段；非法输入在到达 Host 之前就被拦下，保存后对下一条消息生效。


## 试一试

DSH 启动后，直接提问即可：

> 检查这个仓库，找出两个互相独立的问题，逐条对照当前文件验证每个发现，并总结还有哪些不确定的地方。不要修改文件。

消息本身什么都不经历：它按你写的原样到达模型。之后由模型判断这件事要不要动用工具；一次 `grok_workflow` 调用会以一行状态（`Grok workflow: COMPLETED`、`PARTIAL` 或 `FAILED`）加上已验证的任务、失败项与不确定项收尾。寒暄或一次简单查证，模型根本不会调用这个工具。

## 工作方式

工作流存在的目的，是不把“做完了”这句话当成任务完成的证据。

| 步骤 | 发生什么 |
|---|---|
| **1. 规划** | 把目标拆成带明确验收标准的小任务（已知时还会给出每个任务写入的路径）。 |
| **2. 执行** | 独立任务并行执行——默认同时 3 个——写入路径重叠的任务串行。 |
| **3. 验证** | 全新的验证者对照验收标准逐项检查，并要求每条标准都有证据。 |
| **4. 重试** | 验证失败只给有限的一次机会，不会无限循环。 |
| **5. 汇报** | 返回经过校验的结果：已验证任务、证据、带归类的失败与不确定项。 |

### 理解最终状态

- **`completed`** —— 全部计划任务通过验证，且没有退回降级的规划。
- **`partial`** —— 有实质工作通过，但仍有未完成或不确定的部分。
- **`failed`** —— 没有任何任务通过验证，或运行在产出可用报告前失败。

## 消息路径：对你意味着什么

- **没有任何监听器决定一条用户消息**（M3.3）。`agent/pre-step` 上只有窄心跳监听（只对带 Loop 标记的 `source.kind === 'schedule'` 投递动手）和接单台的观测（在决策之后记录一次心跳）。其它一切——打字的一轮、回答的问题卡、webhook、子代理提示词、空批——都原样交给模型。
- 答案在**同一轮内**到达。`0.10.0` 只剩 `in-turn` 一种投递方式——它是唯一能在一次性进程中存活的策略，原来的 `relay`、`append` 已删除。
- 插件不会启动的运行会**明确拒绝**并给出原因（`grok_workflow` 调用的目标超过 32,000 字符）。被拒绝的只是运行，不是**消息**。
- 每次运行的路由换人记录在会话日志里（`recordRouting`）；一个 run 能给它边界规划器排队的插入需求，上限固化在插件内部（`STEERING_LIMITS.maxQueued`，就是 `REPLAN_LIMITS.maxIntents` 那个 8）——没有对应的配置键。
- 想只留那两个常驻工具、完全不要接单台，就把 `blockIntake` 设为 `false`；窄心跳监听两种情况下都在，因为它是心跳唯一的裁决者。

### 目标长度上限

工作流目标上限为 **32,000 字符**，按一次运行拿到的目标计算。任意长度的用户**消息**仍会原样到达模型——上限管的是目标，不是你打多少字。

| 目标长度 | 行为 |
|---|---|
| 1–4,000 字符 | 接受。 |
| 4,001–32,000 字符 | 接受；整个目标原样保留。 |
| 32,001 字符及以上 | `grok_workflow` 调用被拒绝，提示里写明 32,000 字符上限；不会启动任何运行。 |

其它限制保持不变：每个任务字段（`objective`、`expectedOutput`、`context`）仍各限 `4000` 字符，任务 JSON 合计仍限 `48,000` 字符。`0.10.0` 起历史固化（`historyTurns=20` / `historyChars=20000`）；运行时限默认不限时且可配置（`timeoutMs`，`0` = 不限时）；每条角色链最多 `50` 条备用路由。因此更大的目标必须拆成多个任务，而不是放宽单个任务字段或时限。

规划失败时，fallback 计划会把整个目标切成若干连续分段，每段都不超过 4,000 字符的任务文本上限；分段按序拼接后与原始目标逐字一致，因此**不会**被二次拒绝，也不会丢失任何字符。运行以 `partial` 结束，并记录 `planning.source: "fallback"` 与规划错误。

## 插件对一条消息做什么（以及不做什么）

什么都不做。消息按你写的样子交给模型，插件自己的监听器只看定时心跳。消息路径上没有档位、没有迎宾、没有首行状态、也没有拒绝——那些都属于前台，`0.13.35`（M3.3）已经把前台连同配置它的 `mode`、`legacyGate` 两个键一起删除。

留下的是工具面：

- **`grok_workflow`** —— 模型带着一个目标（也可以带自己拆好的任务表）调用它。运行会规划、并行执行、逐条对照验收标准验证、在有界范围内重试，最后报 `completed` / `partial` / `failed`。
- **接单台** —— 六个 `grok_*` 工具，让模型把工作拆成 1–3 个可复核的块来下单，并用一本持久账本记下批准了什么、判了什么。默认打开（`blockIntake: true`），一个键就能关。

## 按角色配置模型与备用链

给每个角色一条有序链。路由是 `{ provider, model }`，也接受裸模型 id 简写：

```yaml
- id: grok-workflow
  config:
    roles:
      planner: [{ provider: my-provider, model: strong-planner }]
      worker:
        - { provider: my-provider, model: fast-worker }
        - { provider: my-provider, model: backup-worker }
      verifier: [{ provider: my-provider, model: strict-verifier }]
      synthesizer: []          # 空 = 继承父级路由
    synthesis: layered        # 或 model（需要 synthesizer 路由）；layered 时核验报告仍是唯一事实来源
```

- **路由级失败推进备用链**：`rate-limit`、`server-error`、`connection`、`timeout`、`model-unavailable`、`format-error`、`agent-start-failed`。
- **内容类失败永不推进**：`task-failed` 与 `verification-failed` 会在同一路由上重试，因为换个模型看到的还是同样的证据。
- 链耗尽时该任务报 `worker failed on every route: [class] reason`，绝不会被静默报成成功。
- 配置在载入时即校验：路由写的 provider 本机没有、或 provider 列出了模型目录而该模型不在其中，都会让载入失败；同一链内超过 50 条路由、同一链内重复路由、模型为空或过长、`synthesis: model` 却没有 synthesizer 路由——同样带原因被拒绝。每个被路由的角色都检查，含 `supervisor`。运行时无法判断某条路由时（没有 `llm` 服务、provider 注册表尚未就绪、没有设置服务、或该 provider 不列模型目录），校验降级为警告而不是拒绝。
- 实际用到的路由写在报告（`routing`）与答案里，因此“配了但没生效”不会看起来像“已经可用”。

## 失败告诉你什么

每个失败同时带 `class`（发生了什么）与 `category`（该谁修）：

| `category` | 含义 | 常见 `class` |
|---|---|---|
| `infrastructure` | provider 或传输层故障；工作本身没有被判定。 | `rate-limit`、`server-error`、`connection`、`timeout`、`model-unavailable`、`format-error`、`agent-start-failed` |
| `quality` | 工作执行了但没通过。 | `task-failed`、`verification-failed` |
| `configuration` | 运行无法按配置继续。 | `budget-exhausted`、setup 类错误、运行级取消、无法校验的报告 |
| `cancelled` | 你（或宿主）停掉了它。 | 主动停止、插件卸载 |
| `unknown` | 未归类——插件不猜。 | 其余未匹配项 |

渲染的答案会增加 `Failures: 1 infrastructure, 1 quality` 这样的行，因此 provider 故障不会被读成“活干得不好”。

卡住的子代理和主动停止走同一条上报：常驻并行监护从运行开始就盯着每个孩子
（`workflow/agent-start` / `agent-end`），某一个在预算内毫无进展——取运行死线与
10 分钟的较小值、显式不限时的运行则 disarm——它最多取消一次运行，并记一条点名
那个孩子的 `Guardian` 错误，于是读者能分清“活卡住了”和“活被判了不合格”。它从不
判质量：判质量仍是串行监督的事（检查之后、只能判失败）。

## 配置参考

配置写在 profile 的 `cordis.patch.yml`（或 `--patch` 覆盖层）里，位于 bundle 行下。`0.11.0` 起配置面为九个（新增 `timeoutMs`），现在为十九个（新增单次调用预算 `childTimeoutMs`、限流换人开关、四个 `loop*` 续跑键、两个 `iterate*` 自迭代键、守卫判停单路由 `guardianModel` 与默认打开的接单台开关 `blockIntake`）；其它键在载入时直接被拒绝——旧补丁会明确报错，而不是变成"设了也不生效"。M3.3 之前负责路由用户消息的两个键 `mode` 与 `legacyGate` 已移除：补丁里还带着它们会直接报 `removed configuration key`：

```yaml
- id: grok-workflow
  config:
    toolName: grok
    grokDefault: 'on'
    synthesis: layered
    maxConcurrency: 10
    maxTasks: 10
    roles:
      planner:
        - provider: deepseek-official
          model: deepseek-flash
```

| 键 | 默认值 | 硬上限 | 含义 |
|---|---:|---:|---|
| `toolName` | `grok_workflow` | 正则 `^[a-z][a-z0-9_]{1,40}$` | 面向模型的工具名（注册时固定） |
| `grokDefault` | `off` | `on` \| `off` | 会话没有 `/grok` 记录时的默认：`off` 不碰普通对话，`on` 只是一个没有记录的会话报出来的值——它是回退值，不是记录，本身不会让接单台接活 |
| `roles` | 空链 | 每个角色 ≤50 条 | `{ planner, worker, verifier, synthesizer, supervisor }` 有序链；串行监督在检查之后运行，只能判失败、不能判通过；同时常驻并行监护盯着每个子代理是否卡住（见下） |
| `guardianModel` | 空路由 | `{provider?, model?}` 各 ≤120 字 | 判停单路由（非链）：子代理卡死先取证再判，判 `wait` 最多延长 5 分钟×2 且不越过运行死线；留空 = 不判停，超时直接按失败重试 |
| `synthesis` | `layered` | `layered` \| `model` | `layered` 让核验报告保持唯一事实来源；`model` 追加一次模型总结 |
| `maxConcurrency` | `10` | `100` | 每次运行的并行子代理数 |
| `maxTasks` | `10` | `100` | 调用方或规划器任务上限 |
| `timeoutMs` | `0`（不限时） | 任意非负整数（`0` = 不限时） | 运行时限（毫秒）。`0` 不设 timer；大于 `2147483647`（`setTimeout` 上限）的值在内部按不限时处理，报告里仍如实记录配置的数字 |
| `childTimeoutMs` | `7200000`（120 分钟） | `1000`–`7200000` | 单次子调用预算（毫秒）。一次 `agent()` 调用最多跑这么久，超时只算该次失败走任务重试；整轮仍受运行死线约束 |
| `replan` | `true` | `true` \| `false` | 跑中重规划。打开后，跑中发来的消息立刻得到回执，并并入正在跑的这一轮，而不是另起一轮：波边界把它并进还没开始的任务，已完成的工作原样保留、不重跑，计划版本与边界台账写进报告。回执会说明这条要求去了哪里、怎么叫停；只有裸的 `停`/`stop`/`取消` 才会取消整轮，整轮结束时还没取用的要求会开启下一轮而不是丢失。默认打开（设置页"自动接着干"分组里有可见开关），因为主会话必须一直能说话；每个边界要花一次规划调用（每轮至多 `min(波数, 4)` 次），且只在跑中真的收到消息时才花 |
| `switchOnRateLimit` | `true` | `true` \| `false` | 限流（429）时是否换到链上的下一个模型。打开即内置策略：429 与其它传输类失败一样往下换。关掉后只有其余六个类别换人，429 留在原路由、由任务的有界重试决定——当下一个模型明显更贵时这是对的取舍 |
| `loopEnabled` | `false` | `true` \| `false` | 续跑的部署默认值。会存下、校验并投影到设置页，但目前还没有自动驱动读它：除非有浏览器请求把循环打开（见[自动接着跑](#自动接着跑循环心跳)），否则什么都不会被调度。只把它存成 `on` 并不会开始任何一轮 |
| `loopMaxRounds` | `10` | `100` | 存进循环调度规则（`COUNT`）的轮数上限，跑满后调度自己结束。每轮都是一次完整工作流运行，所以这是额度信封，不是偏好 |
| `loopFailStreak` | `3` | `20` | 心跳文案里请这一轮「连败这么多轮就停」的数字。Host 只记录投递、不记录单轮成败，所以这是带进轮次的提示，不是 Host 强制的计数器 |
| `loopIntervalMin` | `0`（`0` = 用循环自己的下限） | `10080`（七天） | 两轮之间的分钟数。实际等待不会低于一轮最坏耗时、也不低于 60 分钟，所以 `0` 是「上一轮跑完就接上」，不是「立刻开始」 |
| `iterateIntervalMin` | `0`（`0` = 用心跳自己的下限） | `10080`（七天） | 自迭代心跳之间的分钟数，下限语义与 `loopIntervalMin` 相同：不低于一轮最坏耗时、也不低于 60 分钟 |
| `iterateTemplate` | 内置默认，即 `docs/iterate-template.md` | 最多 4000 字符 | 「自迭代」开关武装心跳时，存进 `RSI heartbeat` 调度任务的整段提示词。纯空白回退到内置默认。内置默认就是 `docs/iterate-template.md` 里的轮次提示词（POOL 优先选题、R1–R6、三重评审、四道刹车、禁区），`test/iterate-template.spec.ts` 保证文件与常量逐字节一致。在设置页「自迭代」分组的文本框里编辑、随档案保存；不带路由标记，编辑它不会改变一条投递被当成什么 |
| `blockIntake` | `true` | `true` \| `false` | 是否挂上接单台：六个 `grok_*block*`/`grok_steer`/`grok_stop` 工具、判一个块交工的监工，以及接单台自己的那个心跳 `agent/pre-step` 观测。M3.3 起默认打开，什么都不写的档案也能拿到这些工具。它是载入期开关（工具在载入时注册一次），因此不投影到设置页。设为 `false` 时一个块工具都不注册、接单台观测也不装，只留那两个常驻工具；决定心跳去留的窄监听不属于这个开关（每次载入都有），接单台也从不改变路由决策——它的观测把决策原样传下去 |
| `configVersion` | `1` | `1` | 配置面版本 |

四个 `loop*` 键配置续跑面。会话的循环打开时，续跑服务读取 `loopMaxRounds`、`loopFailStreak`、`loopIntervalMin`，写进一条持久 Schedule 规则；Host 没有装配 Schedule 服务时，这些键只是存下来，一条消息仍然只跑一次。`loopEnabled` 是自动驱动的部署默认值，目前还没被读取——打开循环始终是用户自己的显式动作（见[自动接着跑](#自动接着跑循环心跳)）。`loopIntervalMin` 是等待，不是预算：它只能把循环的下限抬高；`loopFailStreak` 会写进心跳文案当提示，因为 Host 记录的是投递，不是单轮成败。

其余一律固化在插件内部、不再接受：`maxRetries=1`、`maxActiveRuns=2`（每会话） / `maxActiveRunsTotal=8`（每进程）、`historyTurns=20` / `historyChars=20000`、`maxQueuedMessages` 已删除（队列上限是内部常量，不是键）、`recordLimit=256`、`answerStrategy=in-turn`、`triageClassifier=rules`、`triageAsk`、`triageModel` 未设、`triageFollowupAsFast`、`instantReceipt`、`humanSummary`、`showDiagnostics=false`、`recordRuns`、`showProgress`、`switchOn` 已删除（按内置备用策略生效，存了值会被当未知键拒绝）、`subagentProvider` 未设；消息闸门本身也没了：`enforceGate`/`gateRequired`/`gateScope`/`gatePreset` 更早那轮就删了，M3.3 又把最后两个路由键 `mode` 与 `legacyGate` 连同它们配置的前台一起删掉。

**从 ≤0.9.4 迁移：** 把这些键从补丁里删掉。还带着它们会被当未知键拒绝，而被删的值没有替代项——按上面的固定值生效。

键表下面还有两层按同样规则受检（自 **0.12.10** 起）：本构建不路由的角色名（如 `roles.reviewer`）与路由对象没有的字段（如把 `maxInFlight` 写成 `maxInflight`）都会带完整路径被拒绝。在这之前，这两层被丢掉的键会让补丁看着配好了，运行却当它不存在。

### 设置页

由于插件导出了自己的 `Config`，DSH 会把它投影到标准设置面：页面上的字段就是插件读取的字段——不存在第二份装饰性的真相来源。编辑是活值：编辑对下一条消息生效，非法编辑会带原因被拒绝，而投递继续使用上一次合法快照。

页面把字段分成五组，除此之外不显示别的：第 1 组是一个开关，决定会话在还没打 `/grok` 时报什么；第 2 组是守卫和五条角色链（"通道 → 模型"双下拉，目录读运行时已声明的模型）；第 3 组是四个运行上限（同时干几件、一次拆几件、运行死线、单次调用上限）；第 4 组是续跑（开关、跑中并入活计划，加三个边界：轮数、连败几轮、两轮间隔几分钟）；第 5 组是自迭代（间隔和提示词模板）。两个预算字段各带一行说明，最底下那张卡片印着升级用的 `dsh plugin add` 一行，没有诊断面板。

### 自动接着跑（循环心跳）

一个循环就是 Host 的 Schedule 服务里的一条持久任务，不是插件内部的定时器。存下来的是一条 `rrule` 心跳，投递目标就是同一个会话，每次投递就是一轮普通回合。插件自己不设任何 timer，也不另开一条执行通道：这一轮做什么，由那个回合自己决定，和你手打一条消息没有区别。

**开关。** 设置页的「自动接着干」一组里有四个 `loop*` 键（见上表），它们和其它键一样被存下、校验并投影到页面；但 `loopEnabled` 是一个目前没有自动驱动读取的部署默认值，所以把它存成 `on` 本身不会开始任何一轮。

**输入框下面那个开关。** 轮数上限和间隔来自上面这几个存下来的键，花掉它们的开关在输入框下面那条 dock 里——槽位 `conversation.composer.dock`，id `grok-workflow-loop`。它挂载时用 `status` 读一次、之后不轮询，读取期间点不动；点击会为当前会话发 `open` 或 `close`，自己不另带数字：规则按存下来的 `loopIntervalMin`、`loopMaxRounds`、`loopFailStreak` 生成。被拒绝的点击不会翻面——它把上一次知道的状态留在页面上，并说明这次点击为什么没生效。这个开关是下面那条路由的调用方，不是第二套实现：同一条持久行、同一批服务方法。

**它旁边的「自迭代」开关。** 第二个 dock 开关，id `grok-workflow-iterate`，POST 到 `/grok-workflow/iterate`，驱动第二个服务实例——它的槽位是 `RSI heartbeat` 这个保留标题，所以两个开关永远不会创建、读取或删除对方的行。它的 `open` 不带 prompt 也不带间隔：存进去的提示词就是档案里的 `iterateTemplate`（在设置页「自迭代」分组的文本框编辑；纯空白回退内置默认），间隔下限是 `iterateIntervalMin`。`RSI heartbeat` 的投递是不带 Loop 标记的普通调度消息，所以窄监听不会动它——而且这一行刻意比插件活得久（它是仓库自己的节拍）；用同一个开关关掉，或走 DSH 自己的「自动化任务」删除。

**再接一个「工作流开关」。** 第三个 dock 开关，id `grok-workflow-mode`，就是可点的 `/grok on|off`：POST 到 `/grok-workflow/mode`，body 是 `{"action":"status"|"set","sessionId":…,"enabled":…}`，读写的是会话自己的模式记录——斜杠命令写的那条 `plugin:grok-workflow/mode`，也是接单台准入规则读的那条，所以按钮和命令不会各说一套。挂载时读一次，之后只在会话记录被写入时（比如你打字 `/grok on` 或 `/grok off`）再读一次、不轮询，界面只画路由回读出来的状态（宿主拒绝的写入保留上一状态并说明原因）；会话还没有记录时显示「未开 · 还没设过」——那个会话什么都没定过，部署默认值 `grokDefault` 是路由报给 `/grok status` 和设置页看的，不是这颗按钮会去认领的状态。也没有第二份开关存储。关闭有三重提示——文案、空心指示灯、熄灭的胶囊——灰色开关不会被读成「还在跑」。

打开一个循环是一次显式的浏览器请求：

```json
POST /grok-workflow/loop
{ "action": "open" | "close" | "status", "sessionId": "<会话 id>", "intervalMinutes": 60, "prompt": "可选：替换心跳文案" }
```

只有这条路径能打开循环。面向模型的 `grok_loop` 工具只提供另外两个动作：`status` 读已存的循环，`close` 删掉它，`open` 会以 `loop/user-only` 被拒绝——代理可以报告或停掉循环，但不能替用户开一个。这条路由还站在宿主自己的连接闸门后面（Host/Origin 校验 + 浏览器认证），跨站或未认证的请求在到达服务前就被拒。没有装配 Schedule 服务的组合会返回 `loop/unavailable`（HTTP 503），插件其余部分照常工作。

**心跳是什么。** 存下来的文案以 `[grok-workflow loop]` 开头——清理时按这个标记加标题 `Loop heartbeat` 认领自己的行——并要求这一轮接着做本会话没做完的事、不重做已完成的步骤、做完就报告并停下、以及连续失败到配置的轮数就停下报告而不是继续重试。投递到达时带的是 `source.kind = "schedule"` 与 Loop 标记，所以窄监听会在这一轮跑起来之前先审刹车；这一轮本身是由主模型处理的普通会话回合，也拿不到 `carryover` 的跨轮摘要——连续性靠的是仓库和本会话已有的内容。

**什么时候停（breaker）。** 四样东西约束一个循环，其中只有一条是宿主强制的：

1. **轮数上限（`loopMaxRounds`）——强制。** 上限写进规则的 `COUNT`，所以投递到那么多轮之后调度自己停止，行留在 `ended` 状态。`ended` 的行不能恢复，下一次打开会用一条新行替换它。
2. **连败轮数（`loopFailStreak`）——是提示，不是计数器。** 投递回执只证明 Session 收件箱收下了消息，不证明那一轮做成了，所以 Host 没有诚实的失败数可比。这个数字被写进心跳文案当指令，插件如实说明这条限制，而不假装它有强制力。
3. **间隔下限（`loopIntervalMin`）——是等待，不是预算。** 实际间隔取三者最大：60 分钟、一轮最坏耗时（`timeoutMs` 向上取整到分钟）、`loopIntervalMin`；再封顶七天。所以 `0` 的含义是「上一轮跑完就接上」，不是「立刻开始」——上一轮还在跑时到点的心跳会把轮次堆起来。
4. **关闭、卸载、归档——删行，不是暂停。** 关闭会删掉那一行：暂停的行仍然是一条存着的心跳。插件卸载会删掉本插件拥有的每一行；会话停止或归档会删掉该会话那一行，所以没有心跳会活得比它的主人久。宿主拒绝删除时会记日志，而不是把它报成一次干净的关闭。

对一个已经存在的循环再次 open 是刷新而不是再造一行——只有间隔或轮数上限变了才重算规则；暂停的行会被恢复；`ended` 的行会被替换；并发的 open 会串行化，所以一个会话不可能出现两行。

### 停用与卸载

```yaml
- id: grok-workflow
  disabled: true
```

```sh
dsh plugin --profile grok-workflow-dev remove dsh-grok-workflow
```

停用或未安装时，工具与接单台都不会注册；普通 DSH 会话不受影响。

## 并行任务与写入路径

并行任务共享会话工作目录。任务可以声明自己写入的路径：

```json
{ "id": "docs", "title": "更新文档", "writesPaths": ["docs/knowledge"] }
```

声明路径重叠的任务依次执行，其余保持并行，`maxConcurrency` 仍是上限。`[]` 表示“这个任务不写文件”；什么都不声明表示“未知”，按保守方式处理（不与任何声明了路径的任务并行）。重叠判定是词法的：`.`、`..`、分隔符与大小写会被归一，前缀按段比较，因此 `src` 覆盖 `src/a.ts`，而 `src/a` 不覆盖 `src/ab`。

这是缓解措施，不是沙箱：验证者仍是独立检查而非形式证明，任务若违背自己的声明也超出插件可见范围。写入密集的工作还可以直接设 `maxConcurrency: 1`。

真实规划模型是否会填写 `writesPaths`，目前**没有结论**：唯一一次实测（目标里明确要求每个任务声明写入路径）中规划器没有声明，任务以 `writesPaths: null` 到达 worker。计划不声明时，调度行为与本功能之前完全一致。因此这项缓解目前只对“任务自己声明了路径”的计划自动生效。

## 默认的合理上限

| 设置 | 默认值 | 硬上限 |
|---|---:|---:|
| 并行 worker | 3 | 6 |
| 每任务重试 | 1 | 3 |
| 每次运行任务 | 6 | 12 |
| 并发工作流运行 | 2 | 4 |
| 每角色链路由数 | 0（继承） | 50 |
| 每次运行台账条数 | 64 | 256 |

插件复用 DSH 的工作流引擎与子代理，不替换 DSH 的 agent 循环，也不绕过其审批与工具策略。

## 出问题时

- **工具没出现：** 重启 profile，并确认它包含工作流引擎与子代理 provider。
- **想把接单台的工具有关掉：** 把 `blockIntake` 设为 `false`。窄心跳监听两种情况下都在，它是心跳唯一的裁决者。
- **消息被拒绝而不是被回答：** 原因会被打印（消息为空，或目标超过 32,000 字符）。没有执行任何工作，也不会自动重试。
- **某个键在载入时被拒绝：** 错误信息会给出最接近的合法键。静默忽略是有意不提供的。
- **DSH 版本不同：** 包声明的是 `engines.dsh: ">=0.2.1-rc.2 <0.3.0"`，bundle 是否载入由这个区间决定。DSH 评估该区间时**包含预发布版本**（正因如此 `0.2.2-rc.3` 才装得上）：`0.2.x` 的预发布版被接受，`0.3.0` 及以后被拒绝——但 `0.3.0` 的**预发布**版仍满足 `<0.3.0`，因此仍会载入。行为在 `0.2.1-rc.2` 上验证；在 `0.2.2-rc.3` 上该 bundle 可安装、能激活（行不再是 `pending`）并对外提供设置命名空间。
- **想了解设计：** 见[架构说明](docs/ARCHITECTURE.md)、[设计知识库](docs/knowledge/WORKFLOW-DESIGN.md)与[验收清单](docs/ACCEPTANCE.md)。
- **发现 Bug：** [提交 Issue](https://github.com/free6589/dsh-grok-workflow/issues)。

## 版本与发布说明

本仓库声明的包版本是 `0.13.37`。需要安装或回退到某个已发布版本时，在地址后加标签：

```sh
dsh plugin --profile grok-workflow-dev add github:free6589/dsh-grok-workflow#v0.13.37
```

只使用 GitHub 上确实存在的标签。已发布：`v0.1.0`、`v0.2.0`、`v0.2.1`、`v0.2.2`、`v0.2.3`、`v0.2.4`、`v0.2.5`、`v0.2.6`、`v0.2.7`、`v0.3.0`、`v0.4.0`、`v0.5.0`、`v0.5.1`、`v0.6.0`、`v0.7.0`、`v0.8.0`、`v0.9.0`、`v0.9.1`、`v0.9.2`、`v0.9.3`、`v0.9.4`、`v0.10.0`、`v0.10.1`、`v0.10.2`、`v0.11.0`、`v0.11.1`、`v0.11.2`、`v0.11.3`、`v0.11.4`、`v0.11.5`、`v0.11.6`、`v0.11.7`、`v0.11.8`、`v0.11.9`、`v0.11.10`、`v0.11.11`、`v0.11.12`、`v0.11.13`、`v0.11.14`、`v0.11.15`、`v0.11.16`、`v0.11.17`、`v0.11.18`、`v0.11.19`、`v0.11.20`、`v0.11.21`、`v0.12.0`、`v0.12.1`、`v0.12.2`、`v0.12.3`、`v0.12.4`、`v0.12.5`、`v0.12.6`、`v0.12.7`、`v0.12.8`、`v0.12.9`、`v0.12.10`、`v0.12.11`、`v0.12.12`、`v0.12.13`、`v0.12.14`、`v0.12.15`、`v0.12.16`、`v0.12.18`、`v0.12.19`、`v0.13.0`、`v0.13.1`、`v0.13.2`、`v0.13.3`、`v0.13.4`、`v0.13.5`、`v0.13.6`、`v0.13.7`、`v0.13.8`、`v0.13.9`、`v0.13.10`、`v0.13.11`、`v0.13.12`、`v0.13.13`、`v0.13.14`、`v0.13.15`、`v0.13.16`、`v0.13.17`、`v0.13.18`、`v0.13.19`、`v0.13.20`、`v0.13.21`、`v0.13.22`、`v0.13.23`、`v0.13.24`、`v0.13.25`、`v0.13.26`、`v0.13.28`、`v0.13.29`、`v0.13.30`、`v0.13.31`、`v0.13.32`、`v0.13.33`、`v0.13.34`、`v0.13.35`、`v0.13.36`、`v0.13.37`。未固定版本的命令跟随 `main`，不会固定到发布版本。GitHub 上还存在 `v0.2.0-rc.1`，但它不是发布版本：它早于发布流程，其 `package.json` 仍声明 `0.1.0`。`v0.13.27` 也不是发布版本：它的门禁在远端跑挂了，因此没有发布任何东西，同样的改动随 `v0.13.28` 一起发。`v0.11.14` 也不是发布版本：它提交里的 `lib/` 是用更早的 `src/` 构建的，发布工作流在产物检查一步就停了，从未发布过它。请使用上面固定的 `v0.11.15`；那个标签仍留在仓库里，只是因为已发布的标签不可变。版本规则与回退流程见[更新日志](CHANGELOG.md)与[发布指南](docs/RELEASING.md)。

## 测试与开发

```sh
npm ci
npm run ci
```

`npm run ci` 依次运行 typecheck、lint、build 与**98 个文件 / 1850 个确定性测试**，不需要在线模型。测试覆盖生成的脚本、真实 PTC 引擎契约、消息路径的放行、交付路径、接单台、路由与备用链、失败归类、配置面、写入路径隔离，以及一组可靠性用例（取消、超时、并发、递归、脱敏、卸载/重载）。带模型的端到端检查是独立脚本，记录在[验证日志](docs/knowledge/VALIDATION.md)；headless 单轮交付检查是 `scripts/e2e-headless-in-turn.sh`。

## 安全与兼容性

- 在 DSH **`0.2.1-rc.2`**（完整运行）与 **`0.2.2-rc.3`**（安装、激活、设置投影）以及 Node.js **22 及以上**上验证过。包把自己的 DSH 要求声明为区间 **`engines.dsh: ">=0.2.1-rc.2 <0.3.0"`** —— 自带的 `engines.dsh` 单独决定兼容性，所以是这一区间（而不是 peer 区间）决定运行时能否载入，也让更高的版本在载入期就被拒绝，而不是拖到运行期出错。构建所针对的 peer 包仍精确固定（`@deepseek-ai/cordis` 使用兼容的 `~4.0.5` 区间）。这是 DSH 外部 bundle，不修改 DSH 核心。
- 不绕过 DSH 的审批、沙箱策略或工具策略。子代理不能递归调用 `grok_workflow`；它们的其它工具仍受 DSH 自身策略约束。
- 子代理继承父会话可用的工具与权限。没有只读能力模式；验证者提示词要求它不要修改文件，但那不是硬性沙箱保证。
- 脱敏是尽力而为，且只有一个实现（`src/redact.ts`；生成的工作流脚本镜像同一张规则表，用于提示词）。覆盖 PEM 与 PGP 的 `PRIVATE KEY` 块（含块本身被 base64 包裹的形式，例如 `base64 -w0` 的密钥文件或 base64 JSON 字段）、JWT、`sk-`/`ghp_`/`github_pat_`/`glpat-`/`npm_`/`xox*`/`AKIA`/`ASIA`/`AIza`/`ya29.`/Telegram 机器人令牌、`Bearer` 与 `Basic` 认证、`Cookie`/`Set-Cookie` 头（含写在 shell 引号参数里的形式）、URL userinfo、签名链接的查询参数（`sig`、`X-Amz-Signature`、`X-Goog-Signature`、`auth`、`token`），以及 env/JSON/头部形式的敏感名赋值。任何形状清单都不完整：不要把凭据写进目标、任务文本或日志，报告也不保证子代理从未接触过密钥。
- 并行任务共享会话工作目录；写入密集的工作请声明 `writesPaths` 或设 `maxConcurrency: 1`。
- 不发布到 npm；请从本 GitHub 仓库安装。

## 已知限制

- 一次 `grok_workflow` 运行值不值得开，是模型的判断：插件不再对消息做分流，所以既没有东西逼着一句小问题走工作流，也没有东西阻止一个大目标被直接答掉。
- **未在真实设置 GUI 中实测：** 自动生成页面的存在与运行时识别已有证据，但在活的 Web GUI 中点击操作、以及在该页面编辑 `roles` 数组，均为 NOT_RUN（设计台账中的 NR-1/NR-7/NR-8）。
- **`writesPaths` 的规划器填充率尚无结论：** 唯一一次实测（目标明确要求声明）中规划器没有声明，因此没有发生串行化。目前只有调用方自己声明路径时才会自动获得缓解。
- **真实 provider 的失败文案未穷尽实测**（NR-5/NR-6）：归类是白名单，未匹配的一律如实记为 `unknown`，不做猜测。
- 没有暂停/恢复、日志化（journaling）或跨进程续跑；取消是协作式的。
- 没有后台任务模式，调用在前台运行。
- **自动接着跑不是后台任务，而是一条调度行：** 只能从浏览器那条路径打开（模型只能读或关），投递由 Host 负责（上一轮还在跑时到点的心跳会被合并，停机后只补最近一次错过的投递），而 Host 也不把「这一轮失败」记成失败计数——见[自动接着跑](#自动接着跑循环心跳)。
- 没有任务依赖图；任务在设计上相互独立，只有写入路径重叠会被串行化。
- 没有自定义 Web UI；结果使用 DSH 通用工具卡片，链编辑器属 Phase 9 工作。
- 完整清单见[已知架构限制](docs/ARCHITECTURE.md#known-architecture-limits-mvp)。

## 文档

- [本地安装与排错](docs/LOCAL-TESTING.md)
- [架构](docs/ARCHITECTURE.md)
- [任务提示词模板](docs/task-prompt-template.md)
- [验收清单](docs/ACCEPTANCE.md)
- [设计知识库](docs/knowledge/WORKFLOW-DESIGN.md)
- [路线图](docs/knowledge/WORKFLOW-ROADMAP.md)
- [Issue 监控（可选）](docs/ISSUE-WATCHER.md)
- [更新日志](CHANGELOG.md)
- [版本与发布指南](docs/RELEASING.md)
- [项目状态与交接记录](docs/knowledge/STATE.md)

## 许可证

[MIT](LICENSE)
