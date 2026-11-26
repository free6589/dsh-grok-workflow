# 泳道矩阵真机 soak：开工说明（阶段 1 准备）— 2026-11-26

本文件只记**准备**：隔离环境、克隆读数、克隆里动过的东西、端口、工具链、还不确定的地方。
真机三态（等你点头 / 进行中 / 已完成）**这一轮没跑**，见 §8 的 `NOT_RUN`。

状态词汇按 `AGENTS.md` §2。每条读数都能回指一个命令或一段原文。

## 1. 位置与身份（`CONFIRMED`）

- 工作树 `.tmp/worktrees/flowchart-v2`，分支 `feat/flowchart-v2`，基线 `main` 尖端 `e772cd6`。
- 起手时尖端 `cf527ff`（验收标尺）。**写作期间另一位施工者一直在推进**：`16a389b`（泳道矩阵实现）→
  `dffd681` → `bd2e1c4`，`git status --short` 每次都是干净的。本会话对 `src/` `lib/` `test/` 一个字没碰。
- scratch 目录 `.tmp/soak-lanes/`（`git check-ignore` 命中 `.gitignore:29:.tmp/`）。
  根 `.gitignore` 的未提交改动、`.rsi/evidence/progress-now/` 一律没碰。

## 2. 克隆读数（逐字，`CONFIRMED`）

```
$ node scripts/clone-profile.mjs --src ~/.dsh/profiles/web --home .tmp/soak-lanes/dsh-home --name web-clone
clone-profile: ok — …/.tmp/soak-lanes/dsh-home/profiles/web-clone
  files 7742 -> 7742 (88584422 bytes)
  links 5 (relinked 2, already dangling in the source 1)
  parity 5/5 equal after redaction
  dependencies 17 declared, 0 unresolved (8/21 bundles from the installation)
  credentials redacted: 1 line(s) in 1 file(s); vendored fixtures: 4 file(s)
EXIT=0
```

克隆完 104 MB。live 只读：`~/.dsh` 与 `~/.dsh/profiles` 的 mtime 全程没动（§9）。

## 3. 克隆里动过的东西（逐条，`CONFIRMED`）

只动 soak 需要的那几类，产品代码 / schema / 默认值一个字没动。

1. **删掉残留的 `mode: triage` 一行**（`web-clone/cordis.patch.yml`，`grok-workflow` 的 `config:` 第一条）。
2. **五个角色 + `guardianModel` 全部钉到 `bifrost-responses / opencode-go/muse-spark-1.3-contributor`**。
   原有形状：`planner`、`synthesizer` 本来就是这一对；`worker`（两条候选）、`verifier`、`supervisor`、
   `guardianModel` 原是 `agent2api / deepseek-v4.1-flash`（本机 shell 没有 `AGENT2API_API_KEY`，不钉就一次子调用都起不来），
   现改为同一个 bifrost 条。`worker` 的两条候选并成一条（`agent2api` 那两条在这个 home 里都不可用）。
3. **默认 agent 模型**（`agent-default-model`）：原本就是 `bifrost-responses / opencode-go/muse-spark-1.3-contributor`
   （`reasoningEffort: max`），**未改**——照实记，这属于「确认过、没动」。
4. **工作区指向一次性目录**：新建 `dsh-home/storages/workspace.json`（schema 照 live 的 `unit {workspace,2}` 抄），
   单条目 `title: soak-lanes`、`path: …/.tmp/worktrees/flowchart-v2/.tmp/soak-lanes/work`，`sessionIds: []`。
   目录已建并试写成功（`printf > work/.write-probe` → 读回 `probe`）。
5. **端口 3391**：不是配置项，是启动参数（§4）。探测：`ss -ltn` 无监听；3392–3395 同样空闲。

改动只有这两处 diff（`diff -u` 原文；文件 635 → 632 行，其余不变）：

```diff
@@ -560,7 +560,6 @@
 - id: grok-workflow
   name: dsh-grok-workflow
   config:
-    mode: triage
     grokDefault: on
@@ -572,22 +571,20 @@
       worker:
-        - provider: agent2api
-          model: deepseek-v4.1-flash
-        - provider: agent2api
-          model: glm-5.3-flash
+        - provider: bifrost-responses
+          model: opencode-go/muse-spark-1.3-contributor
       verifier:
-        - provider: agent2api
-          model: deepseek-v4.1-flash
+        - provider: bifrost-responses
+          model: opencode-go/muse-spark-1.3-contributor
       synthesizer:
         （不变）
       supervisor:
-        - provider: agent2api
-          model: deepseek-v4.1-flash
+        - provider: bifrost-responses
+          model: opencode-go/muse-spark-1.3-contributor
     guardianModel:
-      provider: agent2api
-      model: deepseek-v4.1-flash
+      provider: bifrost-responses
+      model: opencode-go/muse-spark-1.3-contributor
```

密钥只走进程环境：`BIFROST_VIRTUAL_KEY` 在 shell 里存在（`len 42`），**没有**写进 scratch、没有进任何产物或日志。
`AGENT2API_API_KEY` 在 shell 里不存在。

**克隆自洽性（`CONFIRMED`）**：改完之后跑

```
$ DSH_HOME=$PWD/.tmp/soak-lanes/dsh-home dsh plugin --profile web-clone list
… 17 packages，含 dsh-grok-workflow@0.13.47（live 装的那个），EXIT=0
```

17 个依赖全部解析（`dsh-system-prompt-design@link:…` 也已按克隆位置重链），说明改后的档案能组装。

## 4. 端口与启动形态

- 端口 **3391**（`127.0.0.1`），备选 3392–3395 都空。
- 阶段 2 的启动行（**还没跑**）：

```
DSH_HOME=<worktree>/.tmp/soak-lanes/dsh-home \
  dsh web --profile web-clone --port 3391 --host 127.0.0.1
```

`--port/--host/--profile` 这三个形状抄的是上一块真机（`steering-reconnect-2026-11-26`，端口 3399）的实测启动行；
本轮**没有**逐字复核 `dsh web` 自己的 flag 表（见 §8 `H3`）。启动时它会打印带 token 的 URL，那一条要原样抓进证据。

## 5. 工具链（`CONFIRMED`）

| 东西 | 读数 | 备注 |
| --- | --- | --- |
| `node -v` | `v26.8.1` | |
| `npm -v` | `11.19.0` | |
| `dsh --version` | `0.2.2-rc.3` | |
| `/home/fish/.local/bin/playwright --version` | `1.62.0` | **是 Python 包装**（`from playwright.__main__ import main`），见 §6 |
| 浏览器缓存 | `~/.cache/ms-playwright/chromium_headless_shell-1248/`、`chromium-1248/` | 在位 |
| 系统浏览器 | `/usr/bin/chromium` | 在位（上一块的 CDP 装置用的就是它） |
| 可用的 playwright | `node /home/fish/.npm/_npx/e41f203b7505f1fb/node_modules/playwright` → **1.64.1** | 它的 `playwright-core` 期望 revision **1248**，与缓存对得上 |

**没有** `npm install` 任何东西（沙箱只读，装了会挂）。

## 6. 三处坑（都是 `CONFIRMED`，阶段 2 直接绕开）

1. **全局 `playwright` CLI 起不来**：它（Python 版 1.62）找 `chromium_headless_shell-1234`，缓存里只有 `1248` →
   `Error: Executable doesn't exist at …/chromium_headless_shell-1234/…`。`playwright install` 不许跑（下载 + 写
   `~/.cache`，都在工作区外）。
2. **`playwright cli -s=… open` 用不了**：daemon 要建 `~/.cache/ms-playwright/daemon/<hash>/`，
   沙箱挡成 `ENOENT: no such file or directory, mkdir …`（工作区外不可写）。
   **可用路径**：直接用 playwright API 脚本（`import pw from '<npx 缓存>/playwright/index.js'`），
   冒烟已过 —— `fill` 中文、`click`、`evaluate`、`screenshot`、`viewport 700×480` 全部正常，
   读回 `{"title":"lane","w":700,"o":"任务 1"}`，产物 `toolcheck/pw-interact.png`（scratch，收尾删）。
   备用路径仍是上一块的裸 CDP 装置（`/usr/bin/chromium --remote-debugging-port=…` + `drive.mjs`）。
3. **`dsh web --help` 不是纯帮助**：它先去 `prepareProfile`（写档案的 `cordis.yml`），于是直接对 live 档案动手，
   被沙箱挡成 `EROFS: read-only file system, open '/home/fish/.dsh/profiles/web/cordis.yml'`。
   **没有任何文件被改**（live 三个文件 mtime 见 §9，都在本会话之前），但这条是教训：
   **任何 `dsh` 命令之前先 `export DSH_HOME=<scratch>`**，别指望 `--help` 安全。

## 7. 安装身份怎么认（这条会影响证据的可信度）

`package.json` 的版本是 **`0.13.47`**，live 档案里装着的也是 **`0.13.47`**。
所以「版本读回」在本块**不能当判别器**——装成本地包以后版本号读回来还是一样。
判别用哈希：

| 侧 | `sha256(lib/client.js)` | 字节 |
| --- | --- | --- |
| live 档案里装的 `0.13.47` | `20c04ff680b1a5d2fb78904b56d6831afbdfdb2b7af2a19745e5b1b9830073c8` | 348559 |
| 工作树 `16a389b` 之后（08:56 那次读数） | `59fe38a9bee748ff…`（只记了前 16 位） | — |
| 工作树 `bd2e1c4` 之后（08:58 那次读数） | `4ca240f0e2c3a0534b2ba515a03e2d7e4a015036b8dc8acd9bb948a04cf4ac95` | 365866 |

**两次读数不同，说明施工者还在重建 `lib/client.js`。** 阶段 2 打包前必须先把工作树钉在一个提交上
（或记下打包那一刻的 `sha256(lib/client.js)`），否则「装进去的到底是哪一版」说不清。

## 8. 不确定 / 还没跑（`HYPOTHESIS` / `NOT_RUN`）

- `NOT_RUN` — `npm pack`、`dsh plugin --profile web-clone add file:<tgz>`、`dsh web` 起服务、
  浏览器驱动、三态截图与逐字文本、钩子计数、窄屏截图。派单要求这一轮只准备。
- `NOT_RUN` — 全量 `npm run ci`（`AGENTS.md` §12：块内不跑，发版提交上跑）。
- `NOT_RUN` — `dsh web` 的 flag 表逐字复核（§4 的三个 flag 抄自上一块真机读数，不是本轮实测）。
- `HYPOTHESIS` — **「等你点头」那一态能截到**：它的窗口是 `run-start` 到第一条 `agent-start`，上一块用 250 ms
  轮询抓到 9–16 秒的一瞬。本块照同一办法；抓不到就照实报 `NOT_RUN`，不拿组件用例冒充真机（D-156）。
- `HYPOTHESIS` — **子代理能往 `work/` 写文件**：上一块（steering）的真机里子代理沙箱把 `/home` 挂成只读，
  `printf > .tmp/…` 直接 `Read-only file system`，两次尝试用尽，run 以 FAILED 收场；
  更早两块（progress-layout / flowchart）同样的写法却写成功了，原因不明。
  本块要看到「已完成」，就得有一次能落盘的 run。若再撞只读，改用一个不需要写文件的请求（回答式任务），
  并在证据里写清换了请求、为什么换。
- `HYPOTHESIS` — 端口 3391 整轮不被别人占；开跑前重探一次即可。

## 9. 红线读数（`CONFIRMED`）

```
$ stat -c '%y %n' ~/.dsh ~/.dsh/profiles ~/.dsh/profiles/web/cordis.yml ~/.dsh/profiles/web/cordis.patch.yml
2026-11-25 23:14:14 /home/fish/.dsh
2026-11-22 16:59:46 /home/fish/.dsh/profiles
2026-11-22 22:40:31 /home/fish/.dsh/profiles/web/cordis.yml
2026-11-26 08:40:55 /home/fish/.dsh/profiles/web/cordis.patch.yml   ← 本会话（08:54 起）之前，别的施工者写的
$ [ -w ~/.dsh ] → 不可写
$ curl -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/  → 401（开跑前）
```

未重启 / 未重载 3080、未 push、未打 tag、未 bump 版本、未 publish、未装插件。
scratch 在 `.tmp/soak-lanes/`（gitignored），仓库根 / `docs/` / `src/` 没有留下任何东西。

## 10. 等着的东西

- **等 `lib/client.js` 定稿**：写作期间 08:57 / 08:59 两次不同哈希，说明重画那条线还在动。打包要钉提交。
- **等 lead 发话**才进阶段 2（装包 → 起服务 → 三态 → 窄屏 → 证据）。
