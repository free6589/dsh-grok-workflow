# Grok Workflow for DSH

<p align="center">
  <strong>给 DSH 一个目标，让它规划任务、并行执行、独立验证，并如实汇报结果。</strong>
  <br />
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/free6589/dsh-grok-workflow/actions/workflows/ci.yml"><img alt="CI 自动检查" src="https://github.com/free6589/dsh-grok-workflow/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <img alt="需要 Node.js 22+" src="https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white">
  <img alt="需要 DSH 0.2.1-rc.2" src="https://img.shields.io/badge/DSH-0.2.1--rc.2-536DFE">
  <a href="LICENSE"><img alt="MIT 开源协议" src="https://img.shields.io/badge/License-MIT-blue.svg"></a>
</p>

**Grok Workflow for DSH** 是 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 的插件。它增加了一个工具 `grok_workflow`，帮助 DSH 把复杂目标拆成清晰、可检查的步骤。

你不需要编写工作流脚本。安装插件、重启 DSH 配置，然后让模型调用 `grok_workflow` 即可。

![工作流程：规划、执行、验证、有限重试、汇总](docs/images/workflow-overview.svg)

## 一条命令安装

**开始之前：** 需要 DSH **`0.2.1-rc.2`** 和 Node.js **22 或更高版本**。你的 DSH 配置需要包含 workflow 和 subagent 服务；标准 base/headless 组合已提供这些服务。

打开终端，运行：

```sh
dsh plugin --profile grok-workflow-dev add github:free6589/dsh-grok-workflow
```

这条命令会从 GitHub 安装插件，并把它添加到指定配置中。如果你的配置名称不同，把 `grok-workflow-dev` 换成自己的配置名称。如果还没有配置，可以先从 headless 模板创建：

```sh
dsh --profile grok-workflow-dev --from-default-profile headless --dump-config
```

然后重启该配置，让 DSH 加载插件：

```sh
dsh --profile grok-workflow-dev
```

可以用 `dsh --version` 和 `node --version` 检查版本。本项目**没有发布到 npm**，上面的安装命令直接使用 GitHub。

## 试用一下

启动 DSH 后，对模型说：

> 使用 `grok_workflow` 检查当前代码仓库，找出两个互相独立的问题，根据现有文件逐一验证，并总结仍然不确定的部分。不要修改文件。

就这样。模型可以自动制定计划。第一次使用通常不需要再做其他配置。

## 它是怎么工作的？

这个工作流的设计目标，是避免把 Agent 自己说的“完成了”直接当成真正完成。

| 步骤 | 做什么 |
|---|---|
| **1. 规划** | 把目标拆成较小的任务，并明确每项验收标准。 |
| **2. 执行** | 并行运行互相独立的任务，默认最多 3 个并发执行者。 |
| **3. 验证** | 由新的验证 Agent 根据验收标准和证据检查结果。 |
| **4. 重试** | 验证失败时有限返工，不会无限循环。 |
| **5. 汇总** | 清楚报告结果、证据、错误和未完成事项。 |

### 最终状态怎么看？

- **`completed`（完成）**：所有计划任务都通过验证，且没有使用降级计划。
- **`partial`（部分完成）**：部分工作已通过，但仍有未完成或不确定的事项。
- **`failed`（失败）**：没有任务成功通过验证，或者执行中途失败，无法生成有效报告。

报告会列出每项任务的状态、证据、尝试次数、错误和不确定因素，方便你看清哪些内容真的经过了验证。

## 默认限制

| 设置 | 默认值 | 硬上限 |
|---|---:|---:|
| 并行执行任务数 | 3 | 6 |
| 每项任务重试次数 | 1 | 3 |
| 每次运行的任务数 | 6 | 12 |
| 同时运行的工作流 | 2 | 4 |

插件复用 DSH 自带的工作流引擎和子 Agent，不会另造一套 Agent 引擎，也不会绕过 DSH 的审批和工具权限规则。

**需要注意：** 当前版本的并行任务共享 DSH 会话的工作目录。若任务会修改文件，请给每个任务分配不重叠的文件范围，或者将 `maxConcurrency` 设为 `1`。独立验证能提高可靠性，但不等于数学意义上的正确性证明。

## 遇到问题怎么办？

- **找不到工具：** 重启 DSH 配置，并确认它包含 workflow 引擎和 subagent provider。
- **DSH 版本不一致：** 当前只验证过 DSH `0.2.1-rc.2`。
- **想调整并发数或重试次数：** 查看[本机安装与故障排查](docs/LOCAL-TESTING.md)。
- **想了解技术设计：** 查看[架构说明](docs/ARCHITECTURE.md)和[验收清单](docs/ACCEPTANCE.md)。
- **发现 Bug：** [提交 Issue](https://github.com/free6589/dsh-grok-workflow/issues)。

## 开发者

克隆仓库后执行：

```sh
npm ci
npm run ci
```

自动化测试会检查工作流、输入限制、重试、脱敏、插件生命周期和真实 DSH Loader 组合，但不会调用在线模型。真实 DSH/模型验收结果另行记录在[验证日志](docs/knowledge/VALIDATION.md)中。

## 更多文档

- [本机安装与故障排查](docs/LOCAL-TESTING.md)
- [架构说明](docs/ARCHITECTURE.md)
- [验收清单](docs/ACCEPTANCE.md)
- [Issue 监控脚本（可选）](docs/ISSUE-WATCHER.md)
- [项目状态与交接记录](docs/knowledge/STATE.md)

## 许可证

[MIT](LICENSE)
