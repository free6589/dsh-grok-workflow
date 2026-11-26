# 强制团队路由（forced team routing）真机 soak 证据 — 2026-11-26

被测：`release/0.13.49` 的两颗提交 —— 第一轮 **`3ec12d5`**（合流，`lib/force-team.js` = `23a4ab3e…` / 21096 字节）、
第二轮 **`772ac32`**（修复，`lib/force-team.js` = `e7b57260…` / 23388 字节，与分支尖端逐字节相同）。
环境：`~/.dsh/profiles/web` 的克隆 `web-clone`（`DSH_HOME=<scratch>/dsh-home`）、端口 **3392**、
抓包代理 **18190 → 18088**、真实模型 `bifrost-responses / opencode-go/muse-spark-1.3-contributor`。
live `~/.dsh` 与 3080 全程只读。状态词汇按 `AGENTS.md` §2；本索引里的行数 / 字节数 / 计数是写字的人自己 `wc -lc`、
`find`、`sha256sum`、`python3` 读的，**没有一条是转述**。

## 1. 四份报告（原件，未改）

| 文件 | 行 / 字节 | `sha256`（前 16） | 是什么 |
| --- | --- | --- | --- |
| `prep.md` | 245 / 10838 | `cfed92d4ccceb8a8…` | 第 1 轮准备：克隆读数、钉配置、工作区、端口、红线 |
| `soak.md` | 293 / 19145 | `6c49b91676bda88a…` | **第 1 轮**（`3ec12d5`）：断言 1/2/3 的判定与 F1–F5 |
| `prep-fix-round.md` | 125 / 6714 | `eb260fdf1d60ee50…` | 第 2 轮准备：重新克隆、校正过的启动行 |
| `soak-fix.md` | 161 / 10196 | `6a5676ad2c34e192…` | **第 2 轮**（`772ac32`）：修复是否成立、新增 F6 |

## 2. 目录（102 个文件 / 7,291,003 字节，`find | wc -l` 与 `du -sb` 各读一次；**其中 10 个被 `.gitignore:20` 的 `sessions/` 规则挡住，仓库里放的是逐字节副本 `session-logs/`，所以进仓的是 92 个**）

| 目录 | 文件数 / 字节 | 由什么产生 |
| --- | --- | --- |
| `rig/capture.mjs` | 3 个 / 11174 | 透传抓包代理：`127.0.0.1:18190` → 真实网关 `127.0.0.1:18088`，把每个请求体原样落盘，**从不记请求头** |
| `rig/drive.mjs` | 同上 | 在页面上发一句话、等页面稳定，存 `innerText` + 截图 + 消息行 |
| `rig/inspect.mjs` | 同上 | 重开会话再读一次页面（拒绝是否可见要看这个） |
| `capture/` | 4 个 / 411238 | `index.txt`（**43 条请求**：序号/时刻/路径/模型/字节/状态）+ 3 份请求体 `req-001` / `req-003` / `req-007` |
| `capture-fix/` | 4 个 / 406850 | `index.txt`（**13 条请求**）+ 3 份请求体 `req-001` / `req-003` / `req-012` |
| `turns/` | 35 个 / 1006527 | 第 1 轮每轮的页面逐字（`*.txt`）、截图（`*.png`）、控制台（`*-console.json`）、消息行（`*-transcript.json`）、工作区（`*-workspace.txt`）；A/B/C/D/E/F 六轮，另加 `turnB-reopened.*` 两张（重开验证）与 D/E/F 的 `-pre.txt`（`/grok on` 之后那一刻的页面） |
| `turns-fix/` | 26 个 / 783595 | 第 2 轮同样五件套 × 5 次（`fix1` / `fix1b` / `fix2` / `fix3` / `fix4`）+ `trials.json` |
| `sessions/` | 10 个 / 1772007 | 原始落盘位置：第 1 轮**全部 20 个会话**的机器摘要 `trials.json`，加 9 份原始 JSONL（6 个父会话全留 + 3 个代表性子代理）。**被 `.gitignore:20` 的 `sessions/` 规则挡住，不进仓库** |
| `session-logs/` | 10 个 / 1772007 | 上面那 10 个文件的**逐字节副本**，逐份 `sha256sum` 比过、无差异——仓库里能打开的是这一份，`soak.md` §8 里写的 `sessions/*.jsonl` 指的就是它们 |
| `sessions-fix/` | 5 个 / 1071229 | 第 2 轮五个会话的原始 JSONL（`turn1a` / `turn1b` / `turn2` / `turn3` / `turn4`） |
| `sessions-fix/` | 5 个 / 1071229 | 第 2 轮五个会话的原始 JSONL（`turn1a` / `turn1b` / `turn2` / `turn3` / `turn4`） |

**两处与 `soak-fix.md` §7 清单不一致，以本目录实物为准**：`capture-fix/` 只留了 **3** 份请求体（`req-001`、
`req-003`、`req-012`），不是 `req-001…011` 全套；`sessions-fix/` 是 **5** 份 JSONL，没有另存 `trials.json`
（第 2 轮的摘要表在 `turns-fix/trials.json`）。报告里那两行是打算留、实际没留。

## 3. 会话级读数（`session-logs/trials.json`（原件 `sessions/trials.json`）与 `turns-fix/trials.json`，字段 `steps` / `forceTeamRows(ft)` / `wfEvents(wf)` / `end`）

第 1 轮（20 个会话：`completed` **16**、`blocked` **4**）：

| 会话 | 请求 | 步 | 拒绝行 | `tool-workflow/*` | 结局 |
| --- | --- | --- | --- | --- | --- |
| `session-28f9…` A | 开团：1+1 等于几 | 1 | 1 | 0 | `blocked` |
| `session-2be6…` B | 开团：先读一下 README.md 第一行… | 1 | 1 | 0 | `blocked` |
| `session-01dd…` C | 开团：用 grok_workflow 工具统计… | 1 | 1 | 0 | `blocked` |
| `session-dbde…` D | 同上，先 `/grok on` | 1 | 1 | 0 | `blocked` |
| `session-f4df…` E | 开团：请直接调用 `grok_workflow` 工具本身… | 1 | 0 | 0 | `completed`（模型一步就停，闸门没第二次门机会 = F5） |
| `session-d127…` | **不带**关键词：用 `grok_workflow` 跑一个小活 | 2 | 0 | **33** | `completed` |

第 2 轮（5 个会话：`completed` **4**、`blocked` **1**）：

| 会话 | 请求 | 步 | 拒绝行 | 调过的工具 | 结局 |
| --- | --- | --- | --- | --- | --- |
| `session-6e6a…` fix1 | 开团：先读一下 README.md 第一行… | 1 | **1** | `todo_write` | **`blocked`** |
| `session-c55e…` fix1b | **同一句**再跑一次 | 1 | 0 | 无 | `completed` |
| `session-919e…` fix2 | 开团：1+1 等于几 | **4** | 0 | `grok_open_block`、`todo_write`×2 | `completed` |
| `session-6f48…` fix3 | 「…不要开团，也不要组队」（**命中关键词**，作废的对照） | 1 | 0 | 无 | `completed` |
| `session-cdf5…` fix4 | 干净对照：用一句话回答今天是几号 | 1 | 0 | 无 | `completed` |

## 4. 写字的人自己复核过的六个数（都能回指一个文件）

1. **注入块的字节**：`capture/req-001.json`（135198 字节）里 `input[1].content[0].text` = **502 字节 / 180 字符 / 6 行**；
   用户原话 `开团：1+1 等于几`（**10 字符 / 22 字节**）是它的**字节相同前缀**，余下 **480 字节**以
   `【强制：这一轮走团队模式】` 开头、以 `第一步是拆活，现在就做。` 结尾，中文回合里**没有**英文块。
2. **团队真跑起来**：`session-logs/session-d127bbb6-…jsonl` 里 `tool-workflow/*` 事件 **33 条**，
   `tool-workflow/agent-start` 与 `agent-end` 各 **14** 条，`run-start` / `run-end` / `guardian-start` /
   `guardian-end` / `summary-final` 各 1 条。
3. **拒绝行的形状**：`session-logs/session-2be61f93-…jsonl` 里 `source.kind == 'grok-workflow-force-team'` 的
   `user/message` **1 条、4 行**，正文里写 `33 characters` / `33 字符`，与被敲进去的那句实测 **31 字符**那次（第 2 轮）
   一样都是真测量；该回合只有 1 个 `step/start`，结局 `turn/end {"reason":{"kind":"blocked"}}`。
4. **拒绝不可见（F2）**：`turns/turnB-gate.txt` 与 `turns/turnB-reopened.txt` 里 `这一轮要的是团队` 命中 **0** 次；
   `turnB-reopened.txt` 第 34 行逐字是 **`已完成，用时 16秒`**（原文没有「16 秒」中间那个空格）。
5. **注入进了 UI（F1）**：`【强制：这一轮走团队模式】` 在 `turns/turnA-inject.txt`、`turnB-gate.txt`、
   `turnC-workflow.txt` 各出现 **1** 次，在干净对照 `turns-fix/fix4-control-clean.txt` 里 **0** 次。
6. **第 2 轮那条放行确实是新分支**：`session-919e…` 走完 **4** 步、**0** 条拒绝行、**0** 条 `tool-workflow/*`，
   工具调用是 `grok_open_block` + `todo_write`×2——`tool-workflow/*` 一条都没有，能放行它的只有 `tool/call` 那条新证据。

## 5. 两轮各自否掉了什么（结论，别只读一半）

- **第 1 轮 `FALSIFIED` 两次**：① 注入「不进 UI / 这句只给模型看」不成立（块原样渲染在用户气泡里，
  侧边栏标题也被它截断成 `开团：1+1 等于几 【强制：这`）；② 拒绝「用户看得见」不成立（页面显示已完成）。
  另有 F3（`grok_open_block` 一条 `tool-workflow/*` 都不写，闸门只认那类事件 → 五轮开团全进死路）、
  F4（`grokDefault: on` 与接单台的口径不一致，`grok_open_block` 回 `Error: mode-off`）、F5（一步停住可绕过闸门）。
- **第 2 轮 `FALSIFIED` 一次**：派单要求的「『开团：先读…』不得被拒」**不成立**——同一提示词跑两次，
  一次被拒并 `blocked`、一次没被拒但只走 1 步就收尾。修复本身生效（`fix2` 4 步、0 拒绝行、0 条 `tool-workflow/*`），
  但**过闸变成取决于模型这一轮挑了哪个工具**（F6），而且**一次失败的团队工具调用也算团队证据**
  （`grok_open_block` 那条返回的是 `Error: mode-off`）。F1 / F2 / F4 / F5 四项在第 2 轮**仍然在**。

## 6. 两条方法校正（写进档案，别重踩）

- **启动行**：`soak-prep.md` §4 写的 `dsh web --profile web-clone …` 是**错的**——`dsh web` 本身就是
  `dsh --profile web`，再给一次报 `select a profile only once`。实测可用的是
  `DSH_HOME=<scratch>/dsh-home dsh --profile web-clone --port 3392 --host 127.0.0.1 --no-open`。
- **`~/.npm` 不可写**：`npm pack` 以 `EROFS: read-only file system, open '/home/fish/.npm/_cacache/tmp/…'` 失败，
  把 `npm_config_cache` 指到工作区内即可（第 2 轮从第一条命令起就备好）。

## 7. 红线（`CONFIRMED`，`stat` / `curl` 各读一次，见 `prep.md` §7 与 `soak-fix.md` §8）

`~/.dsh` = `2026-11-25 23:14:14`、`~/.dsh/profiles` = `2026-11-22 16:59:46`、
`~/.dsh/profiles/web/cordis.patch.yml` = `2026-11-26 08:40:55`、`~/.dsh not writable`、
`curl 127.0.0.1:3080/` → **401**。`~/.dsh/profiles/web` 的 mtime 在 **11:22:40** 变过一次，那是**别的施工者**
在同一时段装插件（live 读回 `0.13.48`、不含 `lib/force-team.js`），**不是本会话**。
未写 `~/.dsh`；未重启 / 重载 / kill 3080；未改核心 DSH；未动合并者的 worktree `.tmp/wt-release-0.13.49`；
未 push / 打 tag / bump 版本 / `npm publish`。scratch `.tmp/soak-force-team/` 跑完删掉。