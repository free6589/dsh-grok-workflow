# 强制团队路由（forced team routing）真机 soak：阶段 1 准备 — 2026-11-26

本文件只记**准备**：隔离环境、克隆读数、在克隆里动过的两处、端口、工具链、红线读数。
真机验证（注入 / 回合闸门 / 开关）**这一轮没跑**，见 §8 的 `NOT_RUN`。
配方照 `.rsi/evidence/flowchart-v2-2026-11-26/soak-prep.md`。

状态词汇按 `AGENTS.md` §2。每条读数都回指一个命令或一段原文；没看见的数字不写。

## 1. 身份与位置（`CONFIRMED`）

- 工作树：`/home/fish/projects_mine/dsh-grok-workflow`，分支 `main`，尖端 `a5dfc75`
  （`docs(memory): record the 0.13.48 release`）。`git status --short --branch`：
  `## main...origin/main`，加两个**本会话之前就有**的条目：` M .gitignore`、`?? .rsi/evidence/progress-now/`。这两处本会话一个字没碰。
- 被测特性不在 `main` 上：`feat/force-team-routing` 尖端 `e9a48b9`（10:16:19），
  `git cat-file -e feat/force-team-routing:src/force-team.ts` → `present`。
  `git show --stat` 的自述：该分支是「强制路由单独一条」，`e772cd6` 上摘 `0412a23` 加一个构建提交。
  **合并后的 release/0.13.49 尚不存在**，所以本轮按派单只做准备。
- scratch：`.tmp/soak-force-team/`，`git check-ignore -v` → `.gitignore:29:.tmp/`。
  仓库根 / `docs/` / `src/` 没有留下任何东西。

## 2. 克隆读数（逐字，`CONFIRMED`）

```
$ node scripts/clone-profile.mjs --src ~/.dsh/profiles/web --home .tmp/soak-force-team/dsh-home --name web-clone
clone-profile: ok — /home/fish/projects_mine/dsh-grok-workflow/.tmp/soak-force-team/dsh-home/profiles/web-clone
  files 7742 -> 7742 (88584422 bytes)
  links 5 (relinked 2, already dangling in the source 1)
  parity 5/5 equal after redaction
  dependencies 17 declared, 0 unresolved (8/21 bundles from the installation)
  credentials redacted: 1 line(s) in 1 file(s); vendored fixtures: 4 file(s)
EXIT=0
```

与上一块（flowchart-v2，`soak-prep.md` §2）的读数**逐字相同**：7742 文件 / 88584422 字节 / 17 依赖 0 未解析。
克隆完 `du -sh` = **104M**（`profiles/web-clone` 本身 104M，`dsh-home` 与之同）。

## 3. 克隆里动过的两处（`CONFIRMED`）

只动 soak 需要的那两处；产品代码 / schema / 默认值一个字没动。文件 **635 → 632 行**（与上一块同）。

### 3.1 删掉残留的 `mode: triage`

这是本 build 已移除的键，留着会让档案拒绝加载。

```diff
   name: dsh-grok-workflow
   config:
-    mode: triage
     grokDefault: on
```

### 3.2 角色与 `guardianModel` 钉到本机唯一能服务的那条路由

`BIFROST_VIRTUAL_KEY` 在 shell 里存在（`len 42`）；`AGENT2API_API_KEY` 不存在。
所以 `agent2api/*` 在这个 home 里一次子调用都起不来，必须钉到 `bifrost-responses / opencode-go/muse-spark-1.3-contributor`。

改前（克隆里的原文，逐字）：

```
      worker:
        - provider: agent2api
          model: deepseek-v4.1-flash
        - provider: agent2api
          model: glm-5.3-flash
      verifier:
        - provider: agent2api
          model: deepseek-v4.1-flash
      synthesizer:
        - provider: bifrost-responses
          model: opencode-go/muse-spark-1.3-contributor
      supervisor:
        - provider: agent2api
          model: deepseek-v4.1-flash
    guardianModel:
      provider: agent2api
      model: deepseek-v4.1-flash
```

改后（`sed -n '/^- id: grok-workflow/,/^- id: session-log-deepseek/p'` 的原文）：

```
- id: grok-workflow
  name: dsh-grok-workflow
  config:
    grokDefault: on
    maxConcurrency: 20
    timeoutMs: 7200000
    loopEnabled: true
    loopMaxRounds: 100
    loopFailStreak: 5
    roles:
      planner:
        - provider: bifrost-responses
          model: opencode-go/muse-spark-1.3-contributor
      worker:
        - provider: bifrost-responses
          model: opencode-go/muse-spark-1.3-contributor
      verifier:
        - provider: bifrost-responses
          model: opencode-go/muse-spark-1.3-contributor
      synthesizer:
        - provider: bifrost-responses
          model: opencode-go/muse-spark-1.3-contributor
      supervisor:
        - provider: bifrost-responses
          model: opencode-go/muse-spark-1.3-contributor
    guardianModel:
      provider: bifrost-responses
      model: opencode-go/muse-spark-1.3-contributor
```

- `planner` / `synthesizer` 本来就是这一对，**未改**（确认过、没动）。
- `worker` 的两条候选并成一条：`agent2api` 那两条在这个 home 里都不可用。
- 计数校验：`grep -c 'provider: agent2api'` **8 → 3**，剩下的 3 条都在 `grok-workflow` 块之外
  （`subagent-model-selection-settings` 的 `allowedModels`）；`grok-workflow` 块内 **0** 条。
- `grep -c 'mode: triage'` → **0**。

**没动的**：`agent-default-model` 原本就是 `bifrost-responses / opencode-go/muse-spark-1.3-contributor`
（`reasoningEffort: max`，line 450-455），未改。`bifrost-responses` provider 本身（line 25-33，
`baseURL: http://127.0.0.1:18088/openai/v1`、`apiKeyEnv: BIFROST_VIRTUAL_KEY`）未改。

密钥只走进程环境，**没有**写进 scratch、没有进任何产物或日志。本文件不含任何密钥片段。

## 4. 工作区指向一次性目录（`CONFIRMED`）

新建 `.tmp/soak-force-team/dsh-home/storages/workspace.json`，schema 照 live 的
`unit {workspace,2}` + `tables.workspaces` 表抄（行的键序 `path,title,sessionIds,createdAt,updatedAt` 一致）：

```json
{
  "unit": { "name": "workspace", "version": 2 },
  "global": {
    "initialized": true,
    "defaultWorkspaceId": "c8d269cd-f83a-4020-9ef4-1ede3b902753",
    "workspaceIds": ["c8d269cd-f83a-4020-9ef4-1ede3b902753"],
    "archivedSessionIds": [],
    "pinnedSessionIds": []
  },
  "tables": {
    "workspaces": {
      "c8d269cd-f83a-4020-9ef4-1ede3b902753": {
        "path": "/home/fish/projects_mine/dsh-grok-workflow/.tmp/soak-force-team/work",
        "title": "soak-force-team",
        "sessionIds": [],
        "createdAt": "2026-11-26T03:18:06.810Z",
        "updatedAt": "2026-11-26T03:18:06.810Z"
      }
    }
  }
}
```

目录已建并试写成功：`printf 'probe' > work/.write-probe` → 读回 `probe` → 已删。

## 5. 克隆自洽性（`CONFIRMED`）

```
$ export DSH_HOME=$PWD/.tmp/soak-force-team/dsh-home
$ dsh plugin --profile web-clone list
dsh-profile-web …/.tmp/soak-force-team/dsh-home/profiles/web-clone (PRIVATE)
│   dependencies:
├── @ai-native-sdlc-plugin/dsh-sdlc@0.6.2
├── @dickpy/dsh-imagegen@1.9.3
├── @mill413/dsh-session-resume@0.4.2
├── @mzzsfy/dsh-cron-board@0.7.5
├── @nanmicoder/dsh-agent-teams@0.1.30
├── chat-in-dsh@1.4.0
├── dsh-delete-session@0.2.4
├── dsh-grok-workflow@0.13.47
├── dsh-infinite-gen-5@file:../../plugins/dsh-infinite-gen-5
├── dsh-llm-error-retry@0.20.1
├── dsh-model-fix@0.36.11
├── dsh-peak-valley-router@0.17.8
├── dsh-personal-todo@0.1.0
├── dsh-system-prompt-design@link:../../../projects_mine/dsh-system-md
├── dsh-voice-free@0.1.0
├── dsh-web-mobile@3.2.1
└── dsh-workspace-mover@2.4.3

17 packages
EXIT=0
```

17 个依赖全部解析（`dsh-system-prompt-design@link:…`、`dsh-infinite-gen-5@file:…` 两条相对链接已按克隆位置重链），
说明改后的档案能组装。`dsh-grok-workflow@0.13.47` 是 live 装着的那个版本 —— 阶段 2 装本地包以后
**版本号读回不能当判别器**（上一块 §7 的教训），要用 `sha256(lib/client.js)` 之类区分。

## 6. 端口与工具链（`CONFIRMED`）

- **端口 3392**（`127.0.0.1`）：`ss -ltn | grep -c ':3392 '` → `0`（空闲）。3080 是 live 实例，不碰。
  本机已在监听的口径（`ss -ltn` 端口列去重）：`… 3065 3080 3086 3109 … 18088 …`，`3390-3399` 整段不在其中。
- 阶段 2 的启动形态（**还没跑**，形状抄上一块）：

```
export DSH_HOME=$PWD/.tmp/soak-force-team/dsh-home
dsh web --profile web-clone --port 3392 --host 127.0.0.1
```

| 东西 | 读数 |
| --- | --- |
| `dsh --version` | `0.2.2-rc.3` |
| `node -v` | `v26.8.1` |
| `npm -v` | `11.19.0` |
| 全局 `playwright` CLI | 坏的 Python 包装（上一块 §6.1，不重踩） |
| 可用 playwright | `@playwright/cli` 里的 `playwright/index.mjs`（`rig/capture-states.mjs` 就是这条 import） |

**没有** `npm install` 任何东西。

## 7. 红线读数（`CONFIRMED`，开跑前）

```
$ stat -c '%y %n' ~/.dsh ~/.dsh/profiles ~/.dsh/profiles/web ~/.dsh/profiles/web/cordis.patch.yml
2026-11-25 23:14:14.025606767 +0800 /home/fish/.dsh
2026-11-22 16:59:46.687805286 +0800 /home/fish/.dsh/profiles
2026-11-26 08:40:55.240515003 +0800 /home/fish/.dsh/profiles/web
2026-11-26 08:40:55.161514610 +0800 /home/fish/.dsh/profiles/web/cordis.patch.yml
$ [ -w ~/.dsh ] → 不可写
$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/  → 401
```

四条 mtime 全部**早于本会话**（本会话 11:16 起）；`~/.dsh` 本身不可写。

**live 装着的插件版本**（从 live 档案的 `node_modules` 读回，纯读）：`version: 0.13.47`；
`~/.dsh/profiles/web/package.json:12` 声明为 `"dsh-grok-workflow": "github:free6589/dsh-grok-workflow"`
（浮动引用，所以「装的是什么」只能靠 `node_modules` 里的实际版本 + 文件哈希认）。

未重启 / 未重载 / 未 kill 3080；未改核心 DSH；未 push / 未打 tag / 未 bump 版本；未装插件；未起服务。

## 8. 不确定 / 还没跑（`HYPOTHESIS` / `NOT_RUN`）

- `NOT_RUN` — `npm pack`、`dsh plugin --profile web-clone add file:<tgz>`、`dsh web` 起服务、
  浏览器驱动、三条断言的真机取证。**合并后的 0.13.49 还不存在**（`main` 尖端是 `a5dfc75`），
  阶段 2 等 lead 发合并提交 sha + tgz 路径。
- `NOT_RUN` — 全量 `npm run ci`（`AGENTS.md` §12：块内不跑）。
- `NOT_RUN` — `dsh web` 的 flag 表逐字复核（§6 那三个 flag 抄自上一块真机读数）。
- `HYPOTHESIS` — 3392 整轮不被别人占；开跑前重探一次即可。
- `HYPOTHESIS` — 子代理能不能往 `work/` 写文件：上一块撞过 `Read-only file system`，
  更早两块同样的写法却成功过，原因不明。阶段 2 若要「完成型」run，需当场看落盘。
- `HYPOTHESIS` — 阶段 2 要证明的三条（注入 / 闸门 / 开关）都得从 scratch home 下的
  会话 JSONL 里逐字取，不能拿组件用例冒充真机（D-156）。`tool-workflow/*` 事件名与
  `grok-workflow-force-team` 这个 source kind 还没在本机真机上见过。

## 9. 收尾约定

阶段 2 完成后删 `.tmp/soak-force-team/dsh-home`，并报告删掉的体积（当前 **104M**）。
