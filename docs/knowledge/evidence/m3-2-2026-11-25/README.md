# M3.2 真机 soak 证据（2026-11-25）

验收对象：`feat/m3-switch` 尖端 **`2137afc`**（`9fdcb6e` → `94727b9` → `ad28f17` → `2137afc`，`lib/` 已重建并提交，版本 `0.13.34`）。
环境：Node **v26.8.1** / DSH **0.2.2-rc.3**；worktree `.tmp/wt-m3-switch`；scratch home `.tmp/m3-soak-2/dsh-home`（`DSH_HOME`），端口 **3311**。
口径：`AGENTS.md` §2 的四个状态词（`CONFIRMED` / `HYPOTHESIS` / `NOT_RUN` / `BLOCKED`）。每条结论都能回指本目录里的一个文件。

## 清单

| 文件 | 是什么 | 支撑哪条结论 |
| --- | --- | --- |
| `soak-all.txt` | 建 home（clone 7699 文件 / parity 5/5 / 脱敏 1 行）、装插件、版本读回 `0.13.34`、配置键（`blockIntake: true`，`legacyGate` 缺省）、端口、模型路由调整的理由、两条 M3.2 专属结论、`~/.dsh` 前后 stat、收尾、边界 | 全部四条的总前提；**claim A（心跳）= `NOT_RUN`**；**claim B（准入 `mode-off`）= `CONFIRMED`** |
| `soak-1-oneshot.txt` | 浏览器真开 GUI，点「新会话」，输入两条消息；会话日志抽取（`user/message` seq 9、`assistant/message` seq 18、`tool-workflow/run-start`/`run-end`、`tool/result`），relay 计数 0/0 | 普通消息不被拦截（`CONFIRMED`）；消息原样到达模型（`CONFIRMED`）；恰好一次运行（`CONFIRMED`）；运行结果 `COMPLETED`（`CONFIRMED`） |
| `soak-2-headless.txt` | `dsh --profile m32h '<objective>'` 的原文、exit 0、工作流自己的报告、会话日志里的 run 行；**并记录任务书里那条命令在本机 exit 1 的原文** | headless 端到端一次真实运行（`CONFIRMED`）；账本行（`CONFIRMED`）；命令偏差如实记录 |
| `soak-3-restart-resume.txt` | 运行中 kill（synthesize 阶段）、kill 前 checkpoint 读数（10 任务 / 0 verified / attempts 10）、三种重启各自的实测结果 | 中途 kill（`CONFIRMED`）；未重复计费（`CONFIRMED`）；重启带插件生成的 resume seed（`CONFIRMED`）；引擎不恢复运行状态（`CONFIRMED`）；`--session-id` 采纳被拒（`BLOCKED`） |
| `soak-4-uninstall.txt` | `dsh plugin --profile m32 remove`、bundle 行 21→20、重启后工具清单 8→0、普通消息仍正常作答、无新账本/心跳行、残留软链 | 卸载无残留（`CONFIRMED` ×5）；热卸载 `NOT_RUN` |
| `red-spec-on-baseline.out` / `green-spec.out` | 本块另一半交付的红/绿 spec 原文（本次 soak 未改动） | 单元层的红绿 |

## 结论与状态

| 结论 | 状态 |
| --- | --- |
| 普通用户消息不被拦截：两条会话的 `source.kind=grok-workflow` 中继消息都是 0 | `CONFIRMED` |
| 用户消息原样到达模型（seq 9 原文、`source.kind=user`，seq 18 是模型真答） | `CONFIRMED` |
| 一条消息恰好起一次工作流（1 次 `grok_workflow` 调用、1 个 runId、1 条 run-start / run-end） | `CONFIRMED` |
| 运行结果：`COMPLETED`，2 个任务 verified，9 个子智能体 | `CONFIRMED` |
| headless 端到端一次真实运行，exit 0，`COMPLETED` | `CONFIRMED` |
| 中途 kill 后重启不重复计费（attempts 10→10；resume 只带 1 个任务） | `CONFIRMED` |
| 卸载后 bundle 行消失、无块工具、无新账本/心跳行、普通消息仍作答 | `CONFIRMED` |
| **claim B：没开 grok 模式的会话开块被拒 `mode-off`（工具结果原文 `isError=true`）** | `CONFIRMED` |
| **claim A：心跳由窄监听裁决（`heartbeats-listen.jsonl` 出现 `continued`/`stopped`）** | `NOT_RUN` — 本次没有 open block，时间盒内未跑到 |
| `--session-id` 采纳跑过工作流的会话 | `BLOCKED` — 事件类型 `tool-workflow/guardian-start` 不被本 harness 接受（先于 M3.2，commit `891b8a2`） |
| 热卸载（运行中移除插件） | `NOT_RUN` |
| `~/.dsh` 未被写入 | `CONFIRMED` — 前后 size `1548`、mtime `1795362020` 完全一致 |

## 边界（不要把这些当成覆盖）

- **四条场景跑在 clone 上，且模型路由被改过**：clone 里没有 `agent2api` 的凭据，默认聊天模型因此报 `MISSING_CREDENTIAL`；所有路由改指 `bifrost-responses/opencode-go/muse-spark-1.3-contributor`（先用一条 200 的最小请求验活）。只换「谁回答」，不动四条场景要测的东西。
- **场景 2 没跑任务书里那条字面命令**：`dsh --profile m32 headless '<objective>'` 在本机 exit 1（`too many arguments … got 2: headless, …`）。改用一个同配置、同 build、只换 app bundle 的兄弟 profile `m32h`，偏差写在 `soak-2-headless.txt` 与 `soak-all.txt`。
- **场景 3 的重启不是引擎级恢复**：引擎没有 journal，`resume` 的语义就是「新起一次运行，把 checkpoint 的 seed 当 carry-over」。被 kill 的 checkpoint 至今仍是 `running` / 0 verified —— 这是设计，不是失败；但它确实不等于「原运行接着跑」。
- **场景 4 没有热卸载**：先停实例再移除 bundle 行。「无后台存活」是在冷启动上观察到的。
- **claim A 完全没跑到**：`$DSH_HOME/taskboards/` 在四条场景结束后根本不存在，`heartbeats-listen.jsonl` 与 `heartbeats.jsonl` 都没写过。这与「只在有 open block 时才写」的设计一致，但一致不是证据，所以标 `NOT_RUN`。
- **无截图、无大文件**：全部是命令原文加小型抽取，整个目录约 40 KB。
- **无密钥、无内网地址**：web 的 `token=` 在本目录里一律写成 `<REDACTED>`；不存在任何 API key 值；出现的地址只有 `127.0.0.1` 与 `127.0.0.1:18088`。
