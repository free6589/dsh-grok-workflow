# M3.3 真机 soak 证据（2026-11-25）

验收对象：`feat/m3-delete-gate` 尖端 **`d2d5115`**（`09aa1bd` 删旧前台链 → `d2d5115` 删前台 spec、重钉 baseline 夹具、同步文档守卫；
`lib/` 已重建并提交，版本 `0.13.34`）。四条 soak 打的是 **`09aa1bd`**（`src` + `lib` 与尖端逐字节相同，尖端只动 `test/` 与 `docs/`）。
环境：Node **v26.8.1** / DSH **0.2.2-rc.3**（build `6b729fe`）；worktree `.tmp/wt-m3-delete-gate`；
scratch home `.tmp/m3-soak-3/dsh-home`（`DSH_HOME`），端口 **3311**。
口径：`AGENTS.md` §2 的四个状态词（`CONFIRMED` / `HYPOTHESIS` / `NOT_RUN` / `BLOCKED`）。每条结论都能回指本目录里的一个文件。

## 清单

| 文件 | 是什么 | 支撑哪条结论 |
| --- | --- | --- |
| `ci-gate.txt` | dispatcher 亲自跑的 `TMPDIR=$PWD/.tmp npm run ci` 原文四行：`EXIT=0`、`Found 15 warnings and 0 errors.`、`lib/ at d2d5115 is the build of src/ at d2d5115 (281 files, byte-identical)`、`Test Files 98 passed (98)` / `Tests 1850 passed (1850)` | 门禁（`CONFIRMED`）；四条 soak 的前提是这份构建 |
| `soak-all.txt` | 建 home（clone **7699** 文件 / parity **5/5** / 脱敏 **1** 行）、装插件（`link:` 到本 worktree，版本读回 `0.13.34`）、端口、`~/.dsh` 前后 `stat`、**迁移发现**（`mode` 旧键让插件拒绝激活）、两条 setup-only 失败（worker 路由重复、子代理模型选择重复，去重后清掉）、边界 | 全部四条的总前提；**迁移发现 = `CONFIRMED`**；`~/.dsh` 零写入 = `CONFIRMED` |
| `soak-1-gui.txt` | 真 Chromium（Playwright，headless）打开真 web app，两条消息：普通消息 8 秒直答；旧前台必接的「今天天气怎么样？」31 秒直答并反问城市。会话日志抽取（`seq 9` 用户原文 `source.kind=user`、`seq 18`/`17` 模型真答）、中继 0 / `tool-workflow/*` 0、`request/header` 96 个工具 / **9 个 grok 工具** | 普通消息不被拦（`CONFIRMED`）；原话逐字到模型（`CONFIRMED`）；旧前台的典型受害者不再触发运行（`CONFIRMED`）；六个块工具在默认载入里注册（`CONFIRMED`）；**可见窗口 `NOT_RUN`** |
| `soak-2-headless.txt` | 兄弟 profile `m33h`（同配置、同构建，只把 app bundle 换成 `dsh-headless`）跑一次真工作流：命令原文、`EXIT=0`、工作流自己的结论 17×23=391 与独立验算、checkpoint 路径 | headless 端到端一次真运行（`CONFIRMED`）；worker + 独立 verifier 都跑了（`CONFIRMED`） |
| `soak-3-restart.txt` | 中途 kill（`SIGTERM`）→ kill 前 checkpoint 读数（`running` / 10 任务 / 0 verified / attempts `[1]`）→ kill 后重读**一字未变** → 重启起新运行（新 checkpoint）算出 5×6=30、`EXIT=0` | 中途 kill 留下 `running` checkpoint 且不被改写（`CONFIRMED`）；不重复计费（`CONFIRMED`）；重启是新运行（`CONFIRMED`）；**引擎级恢复 `NOT_RUN`**；`--session-id` 采纳 `NOT_RUN`（M3.2 记的 `BLOCKED`，未重试） |
| `soak-4-uninstall.txt` | `dsh plugin --profile m33 remove` → bundle 行 **21→20**、依赖消失、重启 boot 干净（0 条 `did not activate`）、工具 **87 / grok 0**、普通消息 7 秒作答、`taskboards/` 不存在、无新心跳行、checkpoint 未变（最新 08:58 早于 ~09:00 的卸载） | 卸载无残留（`CONFIRMED` ×5）；**热卸载 `NOT_RUN`** |

## 结论与状态

| 结论 | 状态 |
| --- | --- |
| 默认载入不拦任何消息：两条会话的 `source.kind=grok-workflow` 中继消息都是 0，`tool-workflow/*` 也是 0 | `CONFIRMED` |
| 用户消息原样到达模型（`seq 9` 原文、`source.kind=user`；`seq 18` / `seq 17` 是模型真答） | `CONFIRMED` |
| 「今天天气怎么样？」——旧前台必接的典型句——现在被直答，不再起一轮团队 | `CONFIRMED` |
| 六个块工具在默认载入里注册（96 个工具 / 9 个 grok 工具） | `CONFIRMED` |
| headless 端到端一次真实运行，`EXIT=0`，17×23=391 并独立验算 | `CONFIRMED` |
| 中途 kill 不改写 checkpoint（`running` / 10 任务 / 0 verified / attempts `[1]`，kill 前后一字未变） | `CONFIRMED` |
| 重启跑的是新运行（新 checkpoint），算出 5×6=30 | `CONFIRMED` |
| 卸载后 bundle 行 21→20、工具 87 / grok 0、boot 干净、无新账本/心跳行、普通消息仍作答 | `CONFIRMED` |
| **迁移发现：还带着 `mode` 的补丁会让插件拒绝激活**（`removed configuration key "mode" … delete it from your patch`），删掉那行后干净激活 | `CONFIRMED` |
| `~/.dsh` 未被写入 | `CONFIRMED` — 前后 size `1548`、mtime `1795362020` 完全一致 |
| 可见浏览器窗口（不是 headless Chromium） | `NOT_RUN` — GUI 场景用的是 Playwright 的 headless Chromium，客户端 bundle、websocket 与会话日志都是真的 |
| 引擎级恢复（被 kill 的运行自己接着跑） | `NOT_RUN` — 引擎没有 journal，`resume` 的语义是「新运行 + checkpoint seed」，本轮没有请求它 |
| `--session-id` 采纳被 kill 的运行 | `NOT_RUN` — M3.2 记的是 `BLOCKED`（`tool-workflow/guardian-start` 不被本 harness 接受，先于本块），本轮未重试 |
| 热卸载（运行中移除插件） | `NOT_RUN` — 先停实例再移除 bundle 行 |

## 记忆引用

本目录被以下四处引用，读哪一条都能落到具体文件：

- `docs/knowledge/STATE.md` 顶部 **2026-11-25 09:30（M3.3）** 条——分支/提交/文件数、四句改动、测试面、门禁原文、soak 四句、迁移发现、边界、死代码清单。
- `docs/knowledge/VALIDATION.md` 的 **M3.3** 条——逐行的命令、环境与结果，四条场景的标签，外加 `Honest boundary`。
- `docs/knowledge/HANDOFF.md` 顶部 **M3.3** 条——这一支是什么、已经证实了什么、下一步（发版说明 + 死代码清理）与三件会踩的事。
- `CHANGELOG.md` 的 `[Unreleased]` ——升级前要删旧键这条用户可见的迁移说明。
- 设置落点（`468e30f`，同一个记忆块）的证据在 **`.rsi/evidence/m3-settings-section/`**（4 张 PNG + README）：设置面板左列的
  `Workflow` 一项、整页表单、插件页卡片仍在；那份 README 里也记了同一条 `mode` 迁移发现。

配套的决策记录是 `DECISIONS.md` 的 **`D-141`**（删 14 个 spec 的判据）、**`D-142`**（baseline 夹具重钉而不是删）、
**`D-143`**（`answer.ts` 只删三块）、**`D-144`**（配置签名行删 `gate=on`）。

## 边界（不要把这些当成覆盖）

- **四条场景跑在 clone 上，且模型路由被改过**：所有路由改指 `bifrost-responses/opencode-go/muse-spark-1.3-contributor`
  （先用一条 200 的最小请求验活）。只换「谁回答」，不动被测行为；没有从线上 home 拷任何凭据，也没有读。
- **GUI 不是可见窗口**：用的是 Playwright 的 Chromium（headless）打真 web app，客户端 bundle、websocket 与会话日志都是真的，
  但「屏幕上长什么样」不是本轮的证据。
- **场景 3 不是引擎级恢复**：被 kill 的 checkpoint 至今仍是 `running` / 0 verified——这是设计（引擎无 journal），不是失败；
  它确实不等于「原运行接着跑」。
- **场景 4 没有热卸载**：先停实例再移除 bundle 行。「无后台存活」是在冷启动上观察到的。
- **迁移发现只证明了「拒绝激活」这一条**：真机打出警告与错误原文，删掉那一行后干净激活；「其余 profile 功能在那一行没激活时是否
  完全正常」没有单独记录（`NOT_RUN`）。
- **四条 MCP（serena / mdcg / phone / mobile）在 boot 时打 traceback**：沙箱里写不了家目录，与本插件无关；boot 继续、插件激活。
- **无密钥、无内网地址**：web 的 `token=` 一律写成 `<REDACTED>`；不存在任何 API key 值。
