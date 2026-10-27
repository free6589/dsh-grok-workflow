# Grok Workflow for DSH

<p align="center">
  <strong>每条消息都走完整工作流：规划、并行执行、独立验证、如实汇报。</strong>
  <br />
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/free6589/dsh-grok-workflow/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/free6589/dsh-grok-workflow/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <img alt="Node.js 22+" src="https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white">
  <img alt="DSH 0.2.1-rc.2" src="https://img.shields.io/badge/DSH-0.2.1--rc.2-536DFE">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-blue.svg"></a>
</p>

**Grok Workflow for DSH** 是 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 的外部插件。它为 DSH 提供用户消息的强制工作流（自 `0.2.0` 起默认开启），同时注册模型可直接调用的 `grok_workflow` 工具。

你不需要写工作流脚本。安装插件、重启 profile、直接提问即可：闸门会认领这条消息，做规划、执行任务、逐条对照验收标准验证，并在同一轮内给出答案。

![规划、执行、验证、重试与汇报工作流](docs/images/workflow-overview.svg)

## 你会得到什么

| 需求 | 本插件的做法 |
|---|---|
| **每条消息都走完整工作流** | `agent/pre-step` 闸门认领每条用户消息，并用校验通过的
工作流报告作答——不会静默退回到普通直接回答。 |
| **按角色选模型** | `roles.planner`、`roles.worker`、`roles.verifier`、`roles.synthesizer` 各带自己的模型。 |
| **每角色有序备用链** | 每个角色最多三条路由；路由级失败会推进该角色的链，实际用到的路由会写进报告。 |
| **可操作的设置** | 导出的 `Config` **就是** DSH 设置页：字段是活值、未知键被拒绝并给出建议、链会对照运行时真实拥有的 provider 校验。 |

## 一条命令安装

**开始之前：**需要 DSH **`0.2.1-rc.2`** 与 Node.js **22 或更高版本**。你的 profile 必须包含工作流与子代理服务（标准 base/headless 套件已提供）。

如果还没有 profile，请在安装插件**之前**先用 headless 模板创建：

```sh
dsh --profile grok-workflow-dev --from-default-profile headless --dump-config
```

然后安装插件：

```sh
dsh plugin --profile grok-workflow-dev add github:free6589/dsh-grok-workflow#v0.2.2
```

> （`#v0.2.2` 于本 tag 发布后可用；发布前请用 `#v0.2.1`。）

请固定你真正想要的标签；省略 `#v0.2.2` 会跟随 `main`，那不是发布版本。不要在 `plugin add` 之后再运行 `--from-default-profile`：它会重建 profile 并移除你刚装好的插件。

最后重启 profile，让 DSH 加载新插件：

```sh
dsh --profile grok-workflow-dev
```

## 启用与自检

bundle 行由 `dsh plugin add` 写入。重启后确认它确实被组合进去：

```sh
dsh --profile grok-workflow-dev --dump-config | grep -A4 'grok-workflow'
```

健康的行包含 `id: grok-workflow` 与 `name: dsh-grok-workflow`。启动时插件还会打印一行设置面诊断，例如 `settings surface: page auto-generated for "grok-workflow" (17 field(s), …)`。

**进了组合图 ≠ 被激活。** 插件注入 `workflowEngine`，而 Web 应用层默认禁用了工作流 provider，所以在 `dsh web` 上上面那行必要但不充分：

```yaml
# <profile>/cordis.patch.yml
- id: workflow-ptc
  config:
    provider: spawn
  disabled: false
```

四条校验才能证明它真的激活了：启动日志没有 `pending (waiting for service: workflowEngine)`、`POST /api/settings/describe` 里出现 `grok-workflow` 命名空间、插件页出现 **Grok workflow** 卡片、真实会话的工具列表里有 `grok_workflow`。完整流程（包括如何把"在跑的实例"迁到新构建、哪一步需要你授权）见 [`docs/LOCAL-TESTING.md`](docs/LOCAL-TESTING.md#activate-in-an-existing-live-profile--needs-the-operators-authorisation)。

**Grok workflow** 卡片就是设置页：17 个可编辑字段、四条角色链（每角色最多 3 条）、4 个只读结构性字段并给出原因；非法输入在到达 Host 之前就被拦下，保存后对下一条消息生效。


## 试一试

DSH 启动后，直接提问即可：

> 检查这个仓库，找出两个互相独立的问题，逐条对照当前文件验证每个发现，并总结还有哪些不确定的地方。不要修改文件。

自 `0.2.0` 起，无论模型是否会调用工具，闸门都会对这条消息运行工作流。答案末尾会有一行状态（`Grok workflow: COMPLETED`、`PARTIAL` 或 `FAILED`），以及已验证的任务、失败项与不确定项。

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

## 强制入口：对你意味着什么

- 闸门**默认开启**（`enforceGate: true`），每一条**用户**消息都会被认领。其它来源的消息——用户问题回复、团队消息、webhook、定时任务、子代理提示词——**故意不认领**；空批直接放行。
- 答案在**同一轮内**到达（`answerStrategy: in-turn`）。这是唯一能在一次性进程中存活的策略；`relay`、`append` 保留给长驻界面。
- 插件不会执行的消息会**明确拒绝**并给出原因（消息为空，或目标超过 4000 字符）。不会执行任何工作，也不会自动重试。
- 交付按消息记录：同一批消息被派发两次不会启动第二次运行；每个 agent 的等待队列由 `maxQueuedMessages` 封顶。
- 设 `enforceGate: false` 可只保留 `grok_workflow` 工具、跳过拦截。要求“绝不静默降级”的部署还应设 `gateRequired: true`：把“运行时没有 `agent/pre-step` 钩子”从警告变成载入错误。

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
    synthesis: deterministic   # 或 model（需要 synthesizer 路由）
    switchOn: [rate-limit, timeout, server-error]   # 空 = 内置策略
```

- **路由级失败推进备用链**：`rate-limit`、`server-error`、`connection`、`timeout`、`model-unavailable`、`format-error`、`agent-start-failed`。
- **内容类失败永不推进**：`task-failed` 与 `verification-failed` 会在同一路由上重试，因为换个模型看到的还是同样的证据。
- 链耗尽时该任务报 `worker failed on every route: [class] reason`，绝不会被静默报成成功。
- 配置在载入时即校验：一个角色超过三条路由、同一链内重复路由、模型为空或过长、`switchOn` 写了未知类别、`synthesis: model` 却没有 synthesizer 路由——都会带原因被拒绝。
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

## 配置参考

配置写在 profile 的 `cordis.patch.yml`（或 `--patch` 覆盖层）里，位于 bundle 行下：

```yaml
- id: grok-workflow
  config:
    maxConcurrency: 3
    maxRetries: 1
    maxTasks: 6
```

| 键 | 默认值 | 硬上限 | 含义 |
|---|---:|---:|---|
| `toolName` | `grok_workflow` | 正则 `^[a-z][a-z0-9_]{1,40}$` | 面向模型的工具名（注册时固定） |
| `enforceGate` | `true` | 布尔 | 是否通过闸门认领每条用户消息 |
| `gateRequired` | `false` | 布尔 | 运行时无法承载闸门时是否载入失败 |
| `gateScope` | `process` | `process` \| `preset` | 闸门认领哪些 agent |
| `gatePreset` | `''` | 字符串 | `gateScope: preset` 时拥有闸门的 agent preset |
| `answerStrategy` | `in-turn` | `in-turn` \| `relay` \| `append` | 答案如何到达用户 |
| `historyTurns` | `4` | `20` | 作为上下文带上的对话轮数 |
| `historyChars` | `4000` | `8000` | 该上下文的字符预算 |
| `maxQueuedMessages` | `4` | `8` | 每个 agent 的等待消息上限，超过即拒绝 |
| `maxConcurrency` | `3` | `6` | 每次运行的并行子代理数 |
| `maxRetries` | `1` | `3` | 每个任务首次尝试后的重试次数 |
| `maxTasks` | `6` | `12` | 调用方或规划器任务上限 |
| `timeoutMs` | `1800000` | `86400000` | 整体运行时限 |
| `maxActiveRuns` | `2` | `4` | 每个插件实例并发的 `grok_workflow` 运行数 |
| `subagentProvider` | 引擎默认 | 字符串 | 可选的子代理 provider 覆盖 |
| `roles` | 空链 | 每个角色 ≤3 条 | `{ planner, worker, verifier, synthesizer }` 有序链 |
| `synthesis` | `deterministic` | `deterministic` \| `model` | 确定性聚合，或由模型撰写总结 |
| `switchOn` | `[]`（内置） | 白名单 | 允许推进备用链的失败类别 |
| `recordRuns` | `true` | 布尔 | 是否把路由/交付台账写进会话 |
| `recordLimit` | `64` | `256` | 每次运行的台账条数上限（0 = 不写） |
| `configVersion` | `1` | `1` | 配置面版本 |

未知键会在载入时被**拒绝**并给出最接近的合法键（`maxRetires` → “did you mean `maxRetries`?”），因为被静默忽略的键与“设置不生效”无法区分。

### 设置页

由于插件导出了自己的 `Config`，DSH 会把它投影到标准设置面上：页面上的字段就是插件读取的字段——不存在第二份装饰性的真相来源。编辑是活值：编辑对下一条消息生效，非法编辑会带原因被拒绝，而投递继续使用上一次合法快照。链会对照运行时实际拥有的 provider 校验，因此不存在的模型会在载入时被发现，并列出已声明的 id。

目前**还没有**带模型下拉的链编辑器；那需要客户端模块（登记为 U-6 / Phase 9）。在那之前，profile patch 与普通表单就是编辑同一批值的两种方式。

### 停用与卸载

```yaml
- id: grok-workflow
  disabled: true
```

```sh
dsh plugin --profile grok-workflow-dev remove dsh-grok-workflow
```

停用或未安装时，工具与闸门都不会注册；普通 DSH 会话不受影响。

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
| 每角色链路由数 | 0（继承） | 3 |
| 每次运行台账条数 | 64 | 256 |

插件复用 DSH 的工作流引擎与子代理，不替换 DSH 的 agent 循环，也不绕过其审批与工具策略。

## 出问题时

- **工具没出现：** 重启 profile，并确认它包含工作流引擎与子代理 provider。
- **现在每个回答都像工作流：** 这是 `enforceGate: true` 的效果；设为 `false` 即恢复 `0.1.0` 行为。
- **消息被拒绝而不是被回答：** 原因会被打印（消息为空，或目标超过 4000 字符）。没有执行任何工作，也不会自动重试。
- **某个键在载入时被拒绝：** 错误信息会给出最接近的合法键。静默忽略是有意不提供的。
- **DSH 版本不同：** 本版本只在 DSH `0.2.1-rc.2` 上验证过。
- **想了解设计：** 见[架构说明](docs/ARCHITECTURE.md)、[设计知识库](docs/knowledge/WORKFLOW-DESIGN.md)与[验收清单](docs/ACCEPTANCE.md)。
- **发现 Bug：** [提交 Issue](https://github.com/free6589/dsh-grok-workflow/issues)。

## 版本与发布说明

本仓库声明的包版本是 `0.2.2`。需要安装或回退到某个已发布版本时，在地址后加标签：

```sh
dsh plugin --profile grok-workflow-dev add github:free6589/dsh-grok-workflow#v0.2.2
```

> （`#v0.2.2` 于本 tag 发布后可用；发布前请用 `#v0.2.1`。）

只使用 GitHub 上确实存在的标签。已发布：`v0.1.0`、`v0.2.0`、`v0.2.1`；`v0.2.2` 是本仓库当前的版本，由发布本次提交的流程打标签。未固定版本的命令跟随 `main`，不会固定到发布版本。版本规则与回退流程见[更新日志](CHANGELOG.md)与[发布指南](docs/RELEASING.md)。

## 测试与开发

```sh
npm ci
npm run ci
```

`npm run ci` 依次运行 typecheck、lint、build 与**18 个文件 / 264 个确定性测试**，不需要在线模型。测试覆盖生成的脚本、真实 PTC 引擎契约、闸门与交付路径、路由与备用链、失败归类、配置面、写入路径隔离，以及一组可靠性用例（取消、超时、并发、重复启动、递归、上下文边界、脱敏、卸载/重载）。带模型的端到端检查是独立脚本，记录在[验证日志](docs/knowledge/VALIDATION.md)；headless 单轮交付检查是 `scripts/e2e-headless-in-turn.sh`。

## 安全与兼容性

- 只在 DSH **`0.2.1-rc.2`** 与 Node.js **22 及以上**验证过；包声明了精确的 DSH peer 版本（`@deepseek-ai/cordis` 使用兼容的 `~4.0.5` 区间）。这是 DSH 外部 bundle，不修改 DSH 核心。
- 不绕过 DSH 的审批、沙箱策略或工具策略。子代理不能递归调用 `grok_workflow`；它们的其它工具仍受 DSH 自身策略约束。
- 子代理继承父会话可用的工具与权限。没有只读能力模式；验证者提示词要求它不要修改文件，但那不是硬性沙箱保证。
- 脱敏是尽力而为：不要把凭据写进目标、任务文本或日志。报告不保证子代理从未接触过密钥。
- 并行任务共享会话工作目录；写入密集的工作请声明 `writesPaths` 或设 `maxConcurrency: 1`。
- 不发布到 npm；请从本 GitHub 仓库安装。

## 已知限制

- **未在真实设置 GUI 中实测：** 自动生成页面的存在与运行时识别已有证据，但在活的 Web GUI 中点击操作、以及在该页面编辑 `roles` 数组，均为 NOT_RUN（设计台账中的 NR-1/NR-7/NR-8）。
- **`writesPaths` 的规划器填充率尚无结论：** 唯一一次实测（目标明确要求声明）中规划器没有声明，因此没有发生串行化。目前只有调用方自己声明路径时才会自动获得缓解。
- **真实 provider 的失败文案未穷尽实测**（NR-5/NR-6）：归类是白名单，未匹配的一律如实记为 `unknown`，不做猜测。
- 没有暂停/恢复、日志化（journaling）或跨进程续跑；取消是协作式的。
- 没有后台任务模式，调用在前台运行。
- 没有任务依赖图；任务在设计上相互独立，只有写入路径重叠会被串行化。
- 没有自定义 Web UI；结果使用 DSH 通用工具卡片，链编辑器属 Phase 9 工作。
- 完整清单见[已知架构限制](docs/ARCHITECTURE.md#known-architecture-limits-mvp)。

## 文档

- [本地安装与排错](docs/LOCAL-TESTING.md)
- [架构](docs/ARCHITECTURE.md)
- [验收清单](docs/ACCEPTANCE.md)
- [设计知识库](docs/knowledge/WORKFLOW-DESIGN.md)
- [路线图](docs/knowledge/WORKFLOW-ROADMAP.md)
- [Issue 监控（可选）](docs/ISSUE-WATCHER.md)
- [更新日志](CHANGELOG.md)
- [版本与发布指南](docs/RELEASING.md)
- [项目状态与交接记录](docs/knowledge/STATE.md)

## 许可证

[MIT](LICENSE)
