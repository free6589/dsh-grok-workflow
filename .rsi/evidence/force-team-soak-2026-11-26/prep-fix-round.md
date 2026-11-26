# 强制团队路由 soak：修复轮 · 阶段 1 准备 — 2026-11-26

为「闸门接受团队工具 `tool/call`」那次修复做的重新准备。**这一轮只准备**：克隆、钉配置、工作区、
端口、启动行复核。**没有装任何包、没有跑任何会话**（新构建还没到手上），见 §7 `NOT_RUN`。
刻度与上一轮（`prep.md` / `soak.md`）一致，装置 `rig/` 三个脚本**原样复用，一字未改**。

## 1. 与上一轮的差别（`CONFIRMED`）

live 档案在上一轮收尾时被**别的施工者**装过插件（见 `soak.md` §9），所以这次的克隆源已经变了：

| 读数 | 上一轮（11:16 克隆） | 本轮（11:57 克隆） |
| --- | --- | --- |
| live `dsh-grok-workflow` | `0.13.47` | **`0.13.48`** |
| 克隆文件数 | 7742（88584422 字节） | **7745（88611936 字节）** |
| 克隆里 `lib/force-team.js` | 存在（0.13.47 带） | **不存在**（0.13.48 是 release 构建，不含本特性） |

这不影响流程：新构建会用 `file:<tgz>` 覆盖整行，装完照样按 `sha256(lib/force-team.js)` 认身份。

## 2. 克隆读数（逐字，`CONFIRMED`）

```
$ node scripts/clone-profile.mjs --src ~/.dsh/profiles/web --home .tmp/soak-force-team/dsh-home --name web-clone
clone-profile: ok — /home/fish/projects_mine/dsh-grok-workflow/.tmp/soak-force-team/dsh-home/profiles/web-clone
  files 7745 -> 7745 (88611936 bytes)
  links 5 (relinked 2, already dangling in the source 1)
  parity 5/5 equal after redaction
  dependencies 17 declared, 0 unresolved (8/21 bundles from the installation)
  credentials redacted: 1 line(s) in 1 file(s); vendored fixtures: 4 file(s)
EXIT=0
```

克隆完 `du -sh .tmp/soak-force-team` = **104M**。`git check-ignore` 命中 `.gitignore:29:.tmp/`。

## 3. 钉配置（与上一轮逐字相同，`CONFIRMED`）

`web-clone/cordis.patch.yml` **635 → 632 行**：

1. 删掉 `mode: triage`（本 build 已移除的键）→ `grep -c` = **0**。
2. `planner` / `worker` / `verifier` / `synthesizer` / `supervisor` + `guardianModel` 全部
   `bifrost-responses / opencode-go/muse-spark-1.3-contributor`。
   `grep -c 'provider: agent2api'` **8 → 3**，且 `grok-workflow` 块内 **0** 条
   （剩的 3 条在 `subagent-model-selection-settings.allowedModels`，未动）。
   `roles:` 段内 `bifrost-responses` 出现 **5** 次（五个角色）。
3. `agent-default-model` 本来就是这一对（`reasoningEffort: max`，line 450-455），**未改**。

密钥只走进程环境：`BIFROST_VIRTUAL_KEY` 在 shell 里（不读值、不落盘），`AGENT2API_API_KEY` 不存在。

## 4. 工作区指向（`CONFIRMED`）

`.tmp/soak-force-team/dsh-home/storages/workspace.json`，schema 照 live 的 `unit {workspace,2}`：

- workspace id `d007eaf2-d92e-421a-adb2-7eeccccd35c9`
- `title: soak-force-team`，`sessionIds: []`
- `path: /home/fish/projects_mine/dsh-grok-workflow/.tmp/soak-force-team/work`（已建，试写 `probe` 读回后删除）

## 5. 集合与启动（`CONFIRMED`）

```
$ DSH_HOME=$PWD/.tmp/soak-force-team/dsh-home dsh plugin --profile web-clone list
… 17 packages
EXIT=0
```

**启动行（上一轮实测校正过的形态，soak-prep §4 那条是错的）**：

```
export DSH_HOME=$PWD/.tmp/soak-force-team/dsh-home
dsh --profile web-clone --port 3392 --host 127.0.0.1 --no-open
```

- 为什么不能用 `dsh web --profile web-clone …`：`dsh web` 本身就是 `dsh --profile web`（第一个位置参数被展开成
  `--profile`），再给一次就报 `error: option '--profile <name>' argument 'web-clone' is invalid. select a profile only once`。
- 本轮实测：起来后 `ss -ltn` 见 `LISTEN 127.0.0.1:3392`，日志第 134 行
  `dsh web: http://127.0.0.1:3392/?token=<已脱敏>`，裸 `GET /` 回 **401**（token 围栏在）。
- 起来后**已停掉**：新构建装完要重启一次才生效，留着没有意义。停掉后 3392 已释放（`ss -ltn` 无监听）。
- 启动**没有**动到配置：`cordis.patch.yml` 仍是 632 行 / 5 个 bifrost 角色 / 0 个 `mode: triage`。

端口：**3392**（`ss -ltn` 中 `3390-3399` 整段无监听）。采集代理将用 **18190**（当前也无监听）。

## 6. 工具链与两处坑（`CONFIRMED`）

| 东西 | 读数 |
| --- | --- |
| `dsh --version` | `0.2.2-rc.3` |
| `node -v` | `v26.8.1` |
| `npm -v` | `11.19.0` |

- **坑 A（上一轮新发现，本轮提前避开）**：`~/.npm` 不可写，`npm pack` 会以
  `EROFS: read-only file system, open '/home/fish/.npm/_cacache/tmp/…'` 失败。
  本轮**从第一条命令起**就备好工作区内的缓存目录：
  `export npm_config_cache=$PWD/.tmp/soak-force-team/npm-cache`（目录已建）。
- **坑 B（沿用）**：全局 `playwright` CLI 是坏的 Python 包装；装置走
  `@playwright/cli` 里的 `playwright/index.mjs`。
- **坑 C（沿用）**：任何 `dsh` 命令之前先 `export DSH_HOME=<scratch>`。

## 7. 还没做（`NOT_RUN`，等 lead 发新构建）

- `NOT_RUN` — 取新构建（commit sha + tgz）、`dsh plugin --profile web-clone add file:<tgz>`、按哈希认身份。
- `NOT_RUN` — 起服务、浏览器驱动、下面这三轮的真机取证：
  1. 「开团：先读一下 README.md 第一行，再告诉我这行几个字」——**修复后应不再被拒**
     （注入仍在请求体里；**0** 条 `grok-workflow-force-team`；回合走到答案或真团队）。
  2. 「开团：1+1 等于几」——同样**不应被拒**，注入在，一句话答案。
  3. 无关键词、无团队的对照轮——行为必须与修复前完全一致（不注入、不拒）。
- `NOT_RUN` — 全量 `npm run ci`（`AGENTS.md` §12：块内不跑）。

## 8. 装置（复用，未改）

| 文件 | 用途 |
| --- | --- |
| `rig/capture.mjs` | 18190 → 18088 纯透传，落盘每个请求体，**不记请求头** |
| `rig/drive.mjs` | 发一句（可带 `--pre '/grok on'`）、等稳定、存页面 `innerText` + 截图 |
| `rig/inspect.mjs` | 重开会话再看一眼页面 |

## 9. 红线（`CONFIRMED`，开工前与启动复核后两次）

```
2026-11-25 23:14:14.025606767 +0800 /home/fish/.dsh
2026-11-22 16:59:46.687805286 +0800 /home/fish/.dsh/profiles
2026-11-26 11:22:40.166632045 +0800 /home/fish/.dsh/profiles/web      ← 上一轮记录的别人那次安装，之后未再变
2026-11-26 08:40:55.161514610 +0800 /home/fish/.dsh/profiles/web/cordis.patch.yml
~/.dsh not writable
curl 127.0.0.1:3080/ → 401
```

未写 `~/.dsh`；未碰 / 未重启 3080；未改核心 DSH；未动合并者工作树；未 push / 打 tag / bump 版本；未装包；未跑会话。
收尾会删 `.tmp/soak-force-team/` 并报体积（本阶段 **104M**）。