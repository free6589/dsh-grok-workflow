# 进度 Tab 真机证据 — verify-H2（2026-11-15）

本目录是**真机 GUI 证据**：一台隔离的 `dsh web` 实例，加载本工作树的构建产物（`lib/`），
由 headless Chromium 驱动截图。不是单元测试的替代品，两者在报告里分开列。

状态词汇沿用 `AGENTS.md`：`CONFIRMED` = 源码/命令/真机直接观测；`HYPOTHESIS` = 未验证推断；
`NOT_RUN` = 有意未执行；`BLOCKED` = 缺外部能力。

负责人：真机验证组 H2。产出目录自建，提交由 lead 统一做。

---

## 0. 实例与隔离

| 项 | 值 |
| --- | --- |
| 地址 | `http://127.0.0.1:3210`（独立端口，未触碰 live `:3080` / `:3086` / `:3065`） |
| `DSH_HOME` | `<repo>/.dsh-home`（gitignored；与仓库里既有的一次性 home 并列，未复用他人 profile） |
| Profile | `gwprog`，由**随包 `web` 模板**新建：`dsh gwprog --from-default-profile web` → bundles `[@deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app, dsh-grok-workflow]` |
| 插件安装 | 工作树打包产物 `dsh-grok-workflow-0.8.0.tgz`（见 §1），`dsh plugin --profile gwprog add file:…` |
| 模型 | `bifrost-completions` → `http://127.0.0.1:18088/openai/v1`，`wb/cn:deepseek-v4.1-flash`，密钥只从环境变量 `BIFROST_VIRTUAL_KEY` 读取（不进磁盘、不进截图） |
| 浏览器 | `/usr/bin/chromium` + Playwright（`@playwright/cli` 自带），headless，1440×900 / 480×900 |
| 会话 | 一次性 session「打招呼」，工作区 = 本仓库（任务是写入 `.dsh-home/` 内的临时文件） |
| UI 语言 | 该 profile 默认英文，故 Tab 文案是 `Chat / Trajectory / Progress`（对应中文「对话 / 轨迹 / 进度」），`zh` 文案键由 `test/client.spec.ts` 覆盖 |

**一次性 token 处理**：实例启动时打印 `dsh web: http://127.0.0.1:3210/?token=…`，写进
`.dsh-home/h2-server.log`；驱动脚本只通过环境变量 `DSH_URL` 拿到它。证据收完即
① 杀进程 ② 删日志 ③ 验证端口关闭：

```text
PORT_3210_CLOSED
TOKEN_LOG_REMOVED
```

仓库里任何文件都不含 token（收尾扫描 `grep -rn "token=[A-Za-z0-9]"` 为空）。

### 复现命令（exact）

```bash
cd /home/fish/projects_mine/dsh-grok-workflow

# 1) 工作树构建 + 打包（lib/ 已是当前源码的产物）
npm run build
npm pack --cache .dsh-home/npm-cache --pack-destination .dsh-home/h2-pack

# 2) 新建 web 模板 profile，并装入打包产物
export DSH_HOME=$PWD/.dsh-home
dsh gwprog --from-default-profile web
dsh plugin --profile gwprog add file:$PWD/.dsh-home/h2-pack/dsh-grok-workflow-0.8.0.tgz

# 3) 起隔离实例（前台常驻；日志只用于取 URL，收尾删除）
dsh gwprog --patch docs/knowledge/evidence/progress-tab-2026-11-15/gwprog.patch.yml \
  --port 3210 --host 127.0.0.1 --no-open > .dsh-home/h2-server.log 2>&1

# 4) 驱动（每个 stage 一个进程，互不依赖；stage-b 之后 stage-c/d/e 复用同一 session）
cd docs/knowledge/evidence/progress-tab-2026-11-15
export DSH_URL=$(sed -nE 's/^dsh web: (http[^ ]*)$/\1/p' ../../../../.dsh-home/h2-server.log | head -1)
node stage-a.mjs   # ① 三 Tab 共存 + ② 空态
node stage-b.mjs   # ③ 真跑一次小任务，抓 pending/doing/done
node stage-c.mjs   # ④ 节点详情三段 + ⑤ 窄屏/深色
node stage-d.mjs   # ⑥ 对话/轨迹零回归 + 已完成行可点
node stage-e.mjs   # 额外：跑到一半点停止 → cancelled（真实触发）
```

环境：`node v26.8.1`、`dsh 0.2.2-rc.3`、`/usr/bin/chromium`、模型网关 `127.0.0.1:18088`。

---

## 1. 构建产物身份（CONFIRMED）

打包内容与工作树构建逐字节一致，避免"装的是另一份 lib"：

```text
cmp .dsh-home/h2-unpack/package/lib/client.js src/client/index.js   → CLIENT_MATCH
cmp .dsh-home/h2-unpack/package/lib/progress-tab.js lib/progress-tab.js → PROGRESS_MATCH
cmp src/client/index.js lib/client.js                               → 一致（186091 bytes）
```

## 2. 真机发现：`link:` 安装下 `/grok on` 失效（CONFIRMED 现象，HYPOTHESIS 归因）

第一版按"工作树 link 安装"起实例（`dsh plugin --profile gwprog add link:<repo>`）。此时
在会话里执行 `/grok on` 得到的是**失败**，不是开启：

```text
Failed
grok
Grok workflow toggle not changed: Receiver must be an instance of class Session.
In this session no toggle was recorded.
```

（截图 `probes/probe-after-grok-on.png`、`probes/probe-trajectory.png`；同一命令的
palette/输入状态见 `probes/probe-slash-palette.png`、`probes/probe-slash-typed.png`。）

- `CONFIRMED`：换成本目录的**打包安装**后，同一条命令成功：
  `Grok workflow ON — every message now runs the full plan→execute→verify workflow.`
  （`probes/probe-grok-on-existing.png`，`stage-e.log.txt` 的 `GROK_ON=true`）。
- `HYPOTHESIS`（未插桩验证模块身份）：`link:` 安装时插件解析到**工作树自己的
  `node_modules/@deepseek-ai/dsh-session` 0.2.1-rc.2**（devDependencies），而运行时是
  `0.2.2-rc.3`；`appendPluginRecord` 落在旧副本的私有方法上，跨副本 brand check 抛错。
  打包安装没有这份副本（profile 里只有 `cosmokit` / `schemastery`），于是正常。
- 影响面：只影响"把工作树 `link:` 进 profile 做真机验证"的场景；不影响打包/npm 安装形态。
  验证组若要跑 `/grok` 开关，请用打包产物而不是 `link:`。
- 附带限制（`CONFIRMED`）：在新会话首页（尚无 session）里发 `/grok on` 不会执行——命令
  需要已存在的会话；必须先有一条普通消息把会话建出来。

---

## 3. 逐条验收结果

### ① 三 Tab 共存，默认落对话 — CONFIRMED（`01-three-tabs-default-chat.png`）

```text
A2_TABS=[{"label":"Chat","selected":"true"},{"label":"Trajectory","selected":"false"},{"label":"Progress","selected":"false"}]
A2_TAB_COUNT=3
A2_DEFAULT_SELECTED=["Chat"]
A2_PROGRESS_TAB_EXISTS=true
```

三个 Tab 由真实 `button[role="tab"]` 渲染，`Chat` 默认 `aria-selected="true"`；切到进度后
`Progress` 变 active、其余归位（`A5_TABS_AFTER`）。

### ② 进度 Tab 空态 — CONFIRMED（`02-progress-empty.png`）

会话里**没有**任何 `tool-workflow/*` 事件（插件当轮未接管），轨道为空：

```text
A4_PROGRESS_DOM={"present":true,"emptyText":"No workflow progress in this session yet\n\nThe track is folded from the four tool-workflow events this plugin records; it appears once a run starts.","title":"Task progress","percent":"No rows declared yet","nodeCount":0,...}
A4_EMPTY_STATE=true
```

即：有标题、有「No rows declared yet」，**无轨道、无节点、无百分比数字**。

### ③ 团队档小任务跑出 pending / doing / done — CONFIRMED（`03-progress-pending-doing-done.png`、`04-progress-run-settled.png`）

真实一次全流程运行（`/grok on` → 派发小任务：在 `.dsh-home/h2-scratch2.md` 写三行待办并读回）。
模型真答、引擎真派子会话、recorder 真写事件，**没有任何 mock**。

状态时间线（`stage-b.log.txt` 的 `TIMELINE`）：

| T | 百分比 | 节点状态 |
| --- | --- | --- |
| +0s | `0/1 · 0%` | Start:done, 5 个模板阶段 pending, **规划:doing**, End:doing |
| +4s | `1/2 · 50%` | 规划:done, **任务 1 · Write three bullet todo …:doing**, End:doing |
| +21s | `2/3 · 67%` | 同上（任务行仍未结算） |
| +55s | `3/3 · 100%` | 规划:done, 任务行:done, End:done（其余模板阶段仍 pending） |

- `pending / doing / done` 三态在**同一帧**出现（T+0、T+4s、T+21s 均可截图），
  见 `03-progress-pending-doing-done.png`（Start 绿=done、规划/End 蓝=doing、其余空环=pending）。
- 未命中的模板阶段（Sync / Diagnose / Fix / UI / On device / Clean up / Push/tag）保持
  `pending`，`title="Not reported in the events"`——没有借邻居状态。
- 追加节点用的是引擎报告的 phase 原文：`规划`、`任务 1 · Write three bullet todo …`。
- 收尾 `04-progress-run-settled.png`：`3/3 · 100%`，`doing` 消失。

### ④ 点节点详情：三段 + 来源徽标 — CONFIRMED（`06-node-detail-three-sections.png`）

点在 `规划` 节点（有引擎行的那个）上，浮层三段齐全：

```text
DETAIL_HEADINGS=["Engine facts","Stage report"]        ← 加头部「规划 / Done / Close」共三段
DETAIL_FIELD_COUNT=7
DETAIL_TEXT="规划\nDone\nClose\nEngine facts\nrunId\n6fd0ac85-…\n1 rows\n规划\nseq\n1\nLabel\n规划助手\n
             Phase\n规划\nChild session\n9ce9b2ed-…\nOutcome\ncompleted\nDuration\n5.3 s\nOpen child session\n
             Stage report\nFiles\n—\nSource: not reported\n…（七行同构）"
DETAIL_SOURCES=["Source: not reported" ×7]
```

- 引擎事实逐行原样：`seq / Label / Phase / Child session / Outcome / Duration`（5.3 s 来自两端时间）。
- 七字段 `Files / Commands / Result / Evidence / Risks / Next / Owner` 全部 `—` +
  徽标 `Source: not reported`（L3 落点，符合设计 §7：本 recorder 不写 `stage-detail`，
  视图侧也拿不到子会话正文）。
- 「Copy coordination block」在无真实协调块时 `disabled=true`（`stage-d.log.txt`
  `DETAIL_BUTTONS`），没有谎报可复制。

### ⑤ 窄屏 / 深色 — CONFIRMED（`07-narrow-480-drawer.png`、`08-dark-theme-detail.png`）

窄屏 480×900（同一页面 resize，命中 `@media (max-width:480px)`）：

```text
NARROW_DETAIL_CSS={"position":"fixed","bottom":"0px","left":"0px","right":"0px","maxWidth":"none",
                   "fieldColumns":"450px","viewport":{"w":480,"h":900}}
```

→ 详情变底部抽屉、字段单列；轨道仍在顶部（Tab 条在 480px 下也可见）。

深色（`colorScheme: 'dark'`）：

```text
DARK_PROBE={"dark":true,"bodyBg":"rgb(21, 21, 23)",
            "ringColors":["rgb(34, 197, 94)","rgb(84, 85, 87)","rgb(84, 85, 87)", …]}
```

→ done 环是 success 绿、pending 环是 idle 灰，全部来自 token，**没有硬编码浅色块**。

### ⑥ 对话 / 轨迹零回归 + 已完成行可点 — CONFIRMED

对话（`09-chat-regression.png`）：

```text
CHAT_HAS_TASK=true          # 原始任务文本仍在
CHAT_HAS_REPORT=true        # 工作流报告（<<<GROK-WORKFLOW-REPORT>>> 段）在
CHAT_HAS_TOGGLE_ON=true     # /grok on 的成功回执在
CHAT_HAS_CRASH_TEXT=false   # 无 TypeError / Cannot read 之类
```

轨迹（`10-trajectory-regression.png`）：

```text
TRAJ_LEN=6132  TRAJ_HAS_EVENTS=true  TRAJ_HAS_WORKFLOW=true
```

→ 时间轴（Duration/Turns/Calls/Subcalls）+ SYSTEM/USER/ASSISTANT/CONTEXT/TOOL 行照旧。

已完成行可点（`11-child-session-opened.png`）：详情里 `Open child session` 可点，
点后真实打开子会话「打招呼 / 任务团队 child 1」，子会话自己的 Chat/Trajectory/Progress 三个
Tab 与完整 planner 上下文都在。

```text
DETAIL_BUTTONS=[{"text":"Close","disabled":false},{"text":"Open child session","disabled":false},{"text":"Copy coordination block","disabled":true}]
OPEN_CHILD_BUTTONS=1
AFTER_OPEN_TABS=[Chat(selected), Trajectory, Progress]
```

### 附：cancelled（真实触发，非 mock）— CONFIRMED（`12-before-stop.png`、`13-progress-after-stop.png`、`14-chat-after-stop.png`）

跑到 `doing` 时点 composer 的停止按钮（真实用户动作），引擎按自己的词结算：

```text
FINAL_STATES=["done","pending","cancelled"]
FINAL_NODES=[Start:done, 6×pending, 规划:cancelled, Clean up/Push/tag:pending, End:cancelled]
FINAL_PERCENT="1/1 · 100%"
```

→ `cancelled` 用引擎原话（warn 色），没有由"没有结算"派生；`End` 也随之 cancelled。

---

## 4. 状态覆盖表

| 状态 | 真机 | 证据 |
| --- | --- | --- |
| `pending` | **CONFIRMED** | `03`、`04`（7 个未命中模板阶段，`title="Not reported in the events"`） |
| `doing` | **CONFIRMED** | `03`（规划 / End 蓝环脉冲帧），`TIMELINE` T+0…T+21s |
| `done` | **CONFIRMED** | `03`（Start）、`04`（3/3 · 100%）、`06`（规划 Done） |
| `cancelled` | **CONFIRMED** | `13-progress-after-stop.png`（停止按钮真实触发；停止后 12s 与 52s 两帧逐字节相同，故只留一张） |
| `blocked` | **NOT_TRIGGERED** | 本轮没有真实触发条件（引擎在 abort 时给了 `cancelled` 原话，未留下"运行结束仍有未结算行"）。单元覆盖：`test/progress-tab.spec.ts` 「blocked: derived from a run that ended over a row it never settled, and says why」/「an outcome that is neither completed nor cancelled is derived, not renamed」；`test/client.spec.ts` 「gives a blocked node the derived-state tooltip, not a guess」 |
| `failed` | **NOT_TRIGGERED** | 未构造失败子调用（不伪造真机）。单元覆盖：`test/progress-tab.spec.ts` 「failed wins over every other state, including an unfinished row」；`test/client.spec.ts` 「renders pending, doing, done, blocked and failed from the events alone」 |

`blocked` / `failed` 的补充走**单元快照**，不冒充真机截图：

```text
npx vitest run test/progress-tab.spec.ts test/client.spec.ts
→ Test Files 2 passed (2) / Tests 93 passed (93)   （unit-supplement.log.txt）
```

---

## 5. 本目录内容

| 文件 | 说明 |
| --- | --- |
| `01`…`14-*.png` | 真机截图（1440×900，除 `07` 为 480×900） |
| `gwprog.patch.yml` | 实例 overlay：模型路由（env 取 key）、`workflow-ptc` 解禁、grok-workflow roles |
| `lib.mjs` | Playwright 启动/断言工具（`DSH_URL` 只从环境变量取） |
| `stage-a…e.mjs` | 五个 stage 驱动（每个可单独重跑） |
| `stage-a…e.log.txt` | 各 stage 的实测输出（断言原文） |
| `run-state.json` | 机器可读汇总（session 标题、时间线、详情字段、窄屏/深色测量） |
| `unit-supplement.log.txt` | `blocked/failed` 的单元补充 |
| `probes/` | 定位选择器与诊断 `/grok on` 的探针脚本 + 过程截图（非交付证据） |

## 6. 明确不声称的事

- 没有在 live `:3080` / `:3086` 上做任何操作；没有改 DSH core、没有 push、没有 tag。
- 没有对模型/网络做 mock；`blocked`、`failed` 两个状态**没有**真机截图。
- 任务里"团队档"在本轮由 `/grok on` 的全流程（plan→execute→verify）承担，没有走
  triage 的「要动用团队吗」问答路径（`grokDefault` 保持 `off`，改用显式开关）。
- 单 run 展示：本会话里 `selectActiveRun` 取 anchorSeq 最大的 run，因此 `04` 之后
  只剩最新那次运行的轨道（旧 run 不再显示），与设计 §3 一致，未在此单列截图。
