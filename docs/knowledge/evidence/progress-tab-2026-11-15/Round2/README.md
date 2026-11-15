# 进度 Tab 真机证据 — Round 2（2026-11-15）

本目录是**真机 GUI 证据（第二轮）**：一台隔离的 `dsh web` 实例加载本工作树的构建产物（`lib/`），
由 headless Chromium 驱动截图。不是单元测试的替代品；本轮不做单元测试，见 §6。

负责任务：L2 真机验证组 B。目录自建，提交由 lead 统一做。

状态词汇沿用 `AGENTS.md`：`CONFIRMED` = 源码/命令/真机直接观测；`HYPOTHESIS` = 未验证推断；
`NOT_RUN` = 有意未执行；`BLOCKED` = 缺外部能力。

**与前一轮的关系**：`../`（Round 1，verify-H2）验证的是 03:00 前后的工作树。本轮验证的是
**11:22 之后的工作树**（`src/progress-tab.ts`、`src/client/index.js`、`src/config.ts`、
`src/index.ts` 均有未提交改动），因此独立重跑，不复用上一轮的实例、profile 或截图。

---

## 0. 实例与隔离

| 项 | 值 |
| --- | --- |
| 地址 | `http://127.0.0.1:3221`（新端口；未触碰 live `:3080` / `:3086` / `:3065`） |
| `DSH_HOME` | `<repo>/.dsh-home/r2`（全新目录，gitignored；未复用 Round 1 的 `.dsh-home` 或任何他人 profile） |
| Profile | `gwprog2`，由**随包 `web` 模板**新建：`DSH_HOME=<repo>/.dsh-home/r2 dsh gwprog2 --from-default-profile web` |
| 插件安装 | 工作树打包产物 `dsh-grok-workflow-0.9.1.tgz`（sha256 `ac51b89aa3a7ad7d7b23c74c3380759680c4f1e1c959aec4ee0772a8393e5441`）→ `dsh plugin --profile gwprog2 add file:…` |
| 模型 | `bifrost-completions` → `http://127.0.0.1:18088/openai/v1`，`wb/cn:deepseek-v4.1-flash`；密钥只从环境变量 `BIFROST_VIRTUAL_KEY` 读取（网关 `/models` 带该密钥返回 `200`） |
| 浏览器 | `/usr/bin/chromium` + Playwright（`@playwright/cli` 自带），headless，1440×900 / 480×900 |
| 工具链 | `node v26.8.1`、`dsh 0.2.2-rc.3` |
| UI 语言 | 该 profile 默认英文，故 Tab 文案是 `Chat / Trajectory / Progress`（对应中文「对话 / 轨迹 / 进度」） |
| 会话 | 一次性 session「简单问候」（首个消息是纯问候），工作区 = profile 默认 `default-workspace` |

**没有任何 mock**。模型是机器上的真实本地网关，网络没有被拦截，`tool-workflow/*` 事件由插件自己的
recorder 真实写入，子会话由工作流引擎真实派生。本轮连"代理/挡板"都没有用。

**一次性 token 处理（`CONFIRMED`）**：实例启动时把 `dsh web: http://127.0.0.1:3221/?token=…` 写入
`.dsh-home/r2/r2-server.log`；驱动脚本只通过环境变量 `DSH_URL` 拿到它（`chmod 600` 的
`.dsh-home/r2/dsh-url.env`，从不打印、从不出现在任何日志或截图）。收尾：

```text
PORT_3221=CLOSED
SERVER_LOG_PRESENT=NO
ENVFILE_PRESENT=NO
EVIDENCE_TOKEN_SHAPED=0        # 本目录内 token 形状的字符串
R2_HOME_TOKEN_SHAPED=0         # 隔离 home 内
TRACKED_NEW_TOKEN_SHAPED=0     # src/ lib/ test/ docs/ 内
```

删掉的是 `r2-server.log` 与 `dsh-url.env`（含 token 的两个文件）；本目录、仓库与隔离 home 均无残留。

---

## 1. 构建产物身份（`CONFIRMED`）

装进 profile 的必须是这个工作树的构建产物，而不是另一份 `lib`：

```text
npm run build → BUILD_RC=0 ；重新构建前后 lib/*.js lib/*.d.ts 的 sha256 全等 → LIB_UNCHANGED_BY_BUILD
cmp lib/client.js src/client/index.js → CLIENT_MATCH（两者 sha256 均为 1711997cf58b6db5e34e2eee030714ed3cb48c9416448081ad2ff52509ec3465）
cmp <profile>/node_modules/dsh-grok-workflow/lib/client.js       src/client/index.js → CLIENT_MATCH
cmp <profile>/node_modules/dsh-grok-workflow/lib/progress-tab.js lib/progress-tab.js → PROGRESS_MATCH
```

即：**浏览器里跑的就是工作树构建**。加上 §2 的 DOM 断言全部命中本修订新增的
`data-gw-progress*` / `data-progress-*` 属性（这些属性只存在于本次构建），身份链闭合。

---

## 2. 逐条验收结果

### ① 三 Tab 共存，默认落对话 — `CONFIRMED`（`01-three-tabs-default-chat.png`）

```text
A2_TABS=[{"label":"Chat","selected":"true"},{"label":"Trajectory","selected":"false"},{"label":"Progress","selected":"false"}]
A2_TAB_COUNT=3
A2_DEFAULT_SELECTED=["Chat"]
A2_PROGRESS_TAB_EXISTS=true
A5_TABS_AFTER=[Chat:false, Trajectory:false, Progress:true]      # 切到进度后 active 转移
```

三个 Tab 是真实 `button[role="tab"]`；`Chat` 默认 `aria-selected="true"`。

### ② 进度 Tab 空态 — `CONFIRMED`（`02-progress-empty.png`）

该会话此时**没有任何** `tool-workflow/*` 事件，面板是真正的空态：

```text
A4_PROGRESS_DOM={"present":true,"emptyPresent":true,
  "emptyText":"No workflow progress in this session yet\n\nThe track is folded from the four tool-workflow events this plugin records; it appears once a run starts.",
  "title":"Task progress","percent":"No rows declared yet","percentAttr":"none",
  "trackPresent":false,"nodeCount":0,"classNodeCount":0,"agree":true, ...}
A4_EMPTY_STATE=true
```

即：有标题、有「No rows declared yet」，**连轨道元素都没有**（`trackPresent=false`），
不是"渲染了一条空轨道"。`percentAttr="none"` 说明百分比在无声明行时是**缺省**，不是 `0%`。

### ③ 团队档小任务跑出 pending / doing / done — `CONFIRMED`（`03`、`04`、`05`）

真实一次团队档运行（`/grok on` → 派发小任务：在工作区根目录建 `r2-todos.md`、写三行待办并读回）。
模型真答、引擎真派子会话、recorder 真写事件。

状态时间线（`stage-b2.log.txt`）：

| T | 百分比 | 节点状态（节选） |
| --- | --- | --- |
| +0s | `0/1 · 0%` | Start:**done**、Plan:**doing**、Execute/Verify/Synthesize/Answer:**pending**、End:**doing** |
| +6s | `1/2 · 50%` | Plan:done、`任务 1 · 在工作区根目录创建 r2-todos.md 并写…`:**doing** |
| +30s | `2/3 · 67%` | 同上（任务行未结算） |
| +50s | `3/3 · 100%` | 任务行:**done**、End:**done** |

```text
T+0s states=["done","doing","pending"] percent="0/1 · 0%" nodes=7      → SHOT_03_T+0
TRIPLE_SEEN=true
FINAL_PERCENT="3/3 · 100%"   FINAL_PERCENT_ATTR="100"   FINAL_STATES=["done","pending"]
FINAL_CLASSES_AGREE=true
```

- **三态同帧**出现在 T+0（`03-progress-pending-doing-done.png`：Start 绿环打勾=done、
  Plan 蓝环脉冲=doing、Execute/Verify/Synthesize/Answer 空环=pending、End 蓝环=doing），
  并在 T+6s / T+30s 持续可截。
- 未命中的模板阶段保持 `pending`，`title="Not reported in the events"`——没有借邻居状态。
- 追加节点用引擎报告的 phase 原文（`规划`、`任务 1 · 在工作区根目录创建 r2-todos.md 并写…`）。
- **两条独立读取路径一致**（`data-*` 属性与 `.gw-progress-*` class）→ `FINAL_CLASSES_AGREE=true`。
- 收尾 `04-progress-run-settled.png`：`3/3 · 100%`，`doing` 消失、`End:done`；
  `05-chat-with-run-report.png` 是对应的人话结论 + 机器报告。

### ④ 点节点详情：三段 — `CONFIRMED`（`06-node-detail-three-sections.png`）

点在 `Plan` 节点（带引擎行）上，浮层三段齐全：

```text
DETAIL_TITLE="Plan"   DETAIL_STATE="Done"
DETAIL_HEADINGS=["Engine facts","Stage report"]      # 加头部共三段
DETAIL_SECTION_COUNT=3
DETAIL_FIELD_COUNT=7
DETAIL_TEXT="Plan\nDone\nClose\nEngine facts\nrunId\n0741fc7e-047a-4d2e-8acc-41c3b255fa92\n1 rows\n规划\n
             seq\n1\nLabel\n规划助手\nPhase\n规划\nChild session\nb98dec61-4cd3-4b4b-ba5e-d45c383f00a6\n
             Outcome\ncompleted\nDuration\n7.1 s\nOpen child session\nStage report\nWork commit\n—\nSource: not reported\n…（七行同构）"
DETAIL_SOURCES=["Source: not reported" ×7]
DETAIL_ACTIONS=[{"text":"Copy coordination block","disabled":true,"title":"No coordination block to copy"}]
```

- 段一：头部（阶段名 / 状态词 / Close）。段二：引擎事实逐行原样
  （`runId`、`1 rows 规划`，以及每行 `seq / Label / Phase / Child session / Outcome / Duration`），
  `Duration 7.1 s` 由两端时间算出。
- 段三：七个字段 `Work commit / Changes / Tests run / Test results / Local runtime verified /
  Blockers / Next action` 全部 `—` + 徽标 `Source: not reported`。本 recorder 不写
  `stage-detail`，视图侧也拿不到子会话正文——**如实标"未报告"，没有编内容**。
- 「Copy coordination block」在无真实协调块时 `disabled=true` 且 `title="No coordination block
  to copy"`，没有谎报可复制。

### ⑤ 窄屏 / 深色 — `CONFIRMED`（`07-narrow-480-drawer.png`、`08-dark-theme-detail.png`）

窄屏 480×900（同一页面 resize，命中 `@media (max-width:480px)`）：

```text
NARROW_DETAIL_CSS={"position":"fixed","bottom":"0px","left":"0px","right":"0px","maxWidth":"none",
                   "fieldColumns":"450px","trackVisible":true,"viewport":{"w":480,"h":900}}
NARROW_NODE_COUNT=8
```

→ 详情变底部抽屉、字段塌成单列，**轨道与三个 Tab 在 480px 下仍可见**（截图可见）。

深色（`colorScheme: 'dark'`）：

```text
DARK_PROBE={"dark":true,"bodyBg":"rgb(21, 21, 23)",
            "states":["done","done","pending","done","pending","pending","pending","done"],
            "ringColors":["rgb(34, 197, 94)","rgb(34, 197, 94)","rgb(84, 85, 87)","rgb(34, 197, 94)","rgb(84, 85, 87)"…]}
DARK_HEADINGS=["Engine facts","Stage report"]   DARK_DETAIL_OPEN=true
```

→ done 环是 success 绿、pending 环是 idle 灰，全部来自主题 token，**没有硬编码浅色块**。

### ⑥ 对话 / 轨迹零回归 + 已完成行可点 — `CONFIRMED`

对话（`09-chat-regression.png`）：

```text
CHAT_HAS_TASK=true          # 原始任务文本仍在
CHAT_HAS_REPORT=true        # 工作流报告（<<<GROK-WORKFLOW-REPORT>>> 段与「人话结论」）在
CHAT_HAS_TOGGLE_ON=true     # /grok on 的成功回执在
CHAT_HAS_CRASH_TEXT=false   # 无 Cannot read / TypeError / Uncaught / undefined is not
CHAT_LEN=3854
```

轨迹（`10-trajectory-regression.png`）：

```text
TRAJ_LEN=4398   TRAJ_HAS_EVENTS=true   TRAJ_HAS_WORKFLOW=true   TRAJ_HAS_CRASH_TEXT=false
```

已完成行可点（`11-child-session-opened.png`）：

```text
DETAIL_INDEX=1  DETAIL_NODE_STATE=done  DETAIL_OPEN_BUTTONS=1
点击 [data-gw-progress-open] →
AFTER_OPEN_TABS=[Chat(selected), Trajectory, Progress]      # 子会话自己的三 Tab
AFTER_OPEN_HEAD="…Workspaces\nDefault workspace\n简单问候\n3min\nMore\n简单问候\n/\n任务团队 child 1\n
                 Standard mode\nChat\nTrajectory\nProgress\n规划助手\nYou are the planning agent inside a verified workflow…"
```

→ 点下去真的开了子会话「简单问候 / 任务团队 child 1」，面包屑、三 Tab 与 planner 的完整上下文都在。

---

## 3. 额外：真实 `failed` 帧（`extra-03`、`extra-04`）

本轮**第一次**派发的任务（`stage-b.log.txt`）把文件写到
`<repo>/.dsh-home/r2/scratch-r2.md`，即**会话工作区之外**。子执行体的挂载在那里是只读，于是运行以
引擎自己的词结算为失败：

```text
T+104s states=["done","pending","failed"] percent="5/5 · 100%" nodes=8
FINAL_STATES=["done","pending","failed"]
FINAL_NODES=[… {"label":"End","state":"failed"}]
```

对话侧如实回话，没有把失败包装成成功：

```text
【人话结论·未完成】这次没有做成，没有可交付的结果（其中 0/1 项已核验通过，但整体不算完成）。
原因：write-scratch-todos: executor reported failed。 下一步：工作没达到验收标准：把任务拆小一点、
把验收条件写清楚，再发一次。
…
write-scratch-todos: 目标路径位于工作区 /home/fish/Documents/deepseek-harness/default-workspace 之外，
且底层挂载对当前会话呈只读 …
```

**这不是插件缺陷**，是真实的沙箱边界（task 环境问题）。它的价值是：`failed` 状态在真机上出现了
一次，且来自引擎的真实结局，不是构造的。随后按"把目标路径改到工作区内"重跑（§2 ③），运行正常收尾
`End:done`。两条运行的截图都留在目录里，没有丢弃。

---

## 4. 状态覆盖表

| 状态 | 真机 | 证据 |
| --- | --- | --- |
| `pending` | **CONFIRMED** | `03`、`04`（未命中模板阶段，`title="Not reported in the events"`） |
| `doing` | **CONFIRMED** | `03`（Plan / End 蓝环脉冲帧），`stage-b2.log.txt` T+0 / T+6s / T+30s |
| `done` | **CONFIRMED** | `03`（Start、任务行）、`04`（`3/3 · 100%`）、`06`（`DETAIL_STATE="Done"`） |
| `failed` | **CONFIRMED** | `extra-03`、`extra-04`（执行体报告失败的真实结局，见 §3） |
| `blocked` | `NOT_TRIGGERED` | 本轮没有真实触发条件（不伪造真机）。单元覆盖见 `test/progress-tab.spec.ts`、`test/client.spec.ts` |
| `cancelled` | `NOT_TRIGGERED` | 不在本组（B 组：进度 Tab 截图）的范围；Round 1 已用真实"停止"按钮触发并留证 |

---

## 5. 与 Round 1 的差异，以及本轮 harness 的已知限制

1. **会话标题是动态的。** `stage-a.mjs` 读到的 `A3_SESSION_TITLE="Running"` 是会话行在回合进行中的
   状态行；回合结束后同一行变成 `简单问候`。Round 1 用"标题前缀点击"进会话，在本轮会点错。
   本轮的 `enterSession` 改为**按 role + 行 class 定位会话行**，记录策略与结果
   （`ENTER=token-url+sessionRow(2)`、`ENTER_HAS_GREETING=true`），标题只作偏好、不作必要条件。
2. **SPA 落地 URL 不含 token。** `A3_SESSION_URL=DIFFERENT` → 实际捕获到的是
   `http://127.0.0.1:3221/`（tokenless）。因此后续 stage 必须**先用带 token 的 URL 打开**再点会话行；
   `enterSession` 已内建该回退。（好处：落盘的 `run-state.json` 里没有 token，见 §0 扫描。）
3. **`AFTER_OPEN_HAS_BACK=false` 是 harness 正则的差异，不是回归。** 第 11 张图的子会话视图用面包屑
   （`简单问候 / 任务团队 child 1`）而不是 Back/返回 按钮；子会话确实打开了（标题、三 Tab、
   planner 上下文俱在）。Round 1 的正则 `/Back|返回|subagent|Subagent/i` 在本轮文本上不命中。
4. **任务路径必须落在会话工作区内。** Round 1 的会话工作区是仓库，Round 2 的是
   `default-workspace`，所以任务目标改到工作区内（§3 说明了差异带来的 `failed` 帧）。
5. 本轮**未跑单元测试**：B 组的交付物是进度 Tab 的真机截图，`NOT_RUN`（不是失败）。
   `blocked` / `cancelled` 的真机补充不在本轮范围。

---

## 6. 本目录内容

| 文件 | 说明 |
| --- | --- |
| `01-three-tabs-default-chat.png` | ③ 前件：三 Tab 共存、默认 `Chat` |
| `02-progress-empty.png` | ② 进度空态 |
| `03-progress-pending-doing-done.png` | ③ pending/doing/done 三态同帧（`SHOT_03_T+0`） |
| `04-progress-run-settled.png` | ③ 收尾 `3/3 · 100%`、`End:done` |
| `05-chat-with-run-report.png` | ③ 对应的人话结论 + 机器报告 |
| `06-node-detail-three-sections.png` | ④ 节点详情三段 + 七字段来源徽标 |
| `07-narrow-480-drawer.png` | ⑤ 窄屏 480 底部抽屉 |
| `08-dark-theme-detail.png` | ⑤ 深色主题 |
| `09-chat-regression.png` / `10-trajectory-regression.png` | ⑥ 对话 / 轨迹零回归 |
| `11-child-session-opened.png` | ⑥ 已完成行的 `Open child session` 真开子会话 |
| `extra-03-triple-failed-run.png` / `extra-04-settled-failed-run.png` | §3 真实失败运行的两帧 |
| `stage-a.log.txt`、`stage-b.log.txt`、`stage-b2.log.txt`、`stage-c.log.txt`、`stage-d.log.txt` | 各阶段原始输出（含 `CONFIRMED` 行） |
| `lib.mjs`、`stage-a.mjs`、`stage-b.mjs`、`stage-b2.mjs`、`stage-c.mjs`、`stage-d.mjs`、`probe-sidebar.mjs` | 驱动脚本（可重跑） |
| `r2.patch.yml` | 实例 overlay（模型/插件配置；密钥只走环境变量） |
| `probes/probe-sidebar.txt` | 会话列表 DOM 探针原始输出 |
| `run-state.json` | 跨阶段状态（含时间线与节点快照；无 token） |
| `MANIFEST.sha256` | 本目录全部产物 + 工作树 `lib/client.js`、`lib/progress-tab.js` 的 sha256 |

---

## 7. 复现命令（exact）

```bash
cd /home/fish/projects_mine/dsh-grok-workflow
export TMPDIR=$PWD/.tmp

# 1) 工作树构建 + 打包（构建幂等：前后 lib/ 哈希全等）
npm run build
npm pack --cache .dsh-home/r2/npm-cache --pack-destination .dsh-home/r2/pack

# 2) 全新隔离 home + 新 web profile + 装入打包产物
export DSH_HOME=$PWD/.dsh-home/r2
dsh gwprog2 --from-default-profile web --dump-config > /dev/null
dsh plugin --profile gwprog2 add file:$DSH_HOME/pack/dsh-grok-workflow-0.9.1.tgz

# 3) 起实例（前台常驻；日志只用于取 URL，收尾删除）
set -a; . ~/.bashrc; set +a                       # 载入 BIFROST_VIRTUAL_KEY，绝不回显
setsid nohup dsh gwprog2 --patch docs/knowledge/evidence/progress-tab-2026-11-15/Round2/r2.patch.yml \
  --port 3221 --host 127.0.0.1 --no-open > .dsh-home/r2/r2-server.log 2>&1 &
umask 077
awk '/^dsh web: http/{print "DSH_URL=" $3; exit}' .dsh-home/r2/r2-server.log > .dsh-home/r2/dsh-url.env

# 4) 驱动（每 stage 一个进程；DSH_URL 只经环境变量传入）
cd docs/knowledge/evidence/progress-tab-2026-11-15/Round2
set -a; . $DSH_HOME/dsh-url.env; set +a
node stage-a.mjs    # ① ②
node stage-b2.mjs   # ③ 真跑一次小任务（stage-b.mjs 是工作区外路径的失败运行，见 §3）
node stage-c.mjs    # ④ ⑤
node stage-d.mjs    # ⑥

# 5) 收尾
kill <实例 pid>; rm -f $DSH_HOME/r2-server.log $DSH_HOME/dsh-url.env
```

环境：`node v26.8.1`、`dsh 0.2.2-rc.3`、`/usr/bin/chromium`、模型网关 `127.0.0.1:18088`。

---

## 8. 结论

本轮要求的六项在真机上全部 `CONFIRMED`，**零回归**：三 Tab 共存且默认落对话；进度空态是真空态
（连轨道都没有、百分比缺省而非 0%）；真实团队档小任务跑出 pending/doing/done 三态同帧并收尾
`3/3 · 100%`；节点详情三段齐全且七字段如实标"未报告"；窄屏落底部抽屉、深色走主题 token；
对话与轨迹无回归、已完成行可点并真开子会话。额外撞到一次真实的 `failed` 结局（沙箱边界），如实留证。

```json
{
  "verdict": "PASS",
  "instance": "http://127.0.0.1:3221 (isolated DSH_HOME=.dsh-home/r2, profile gwprog2, plugin 0.9.1 tgz)",
  "shots": [
    "docs/knowledge/evidence/progress-tab-2026-11-15/Round2/01-three-tabs-default-chat.png",
    "docs/knowledge/evidence/progress-tab-2026-11-15/Round2/02-progress-empty.png",
    "docs/knowledge/evidence/progress-tab-2026-11-15/Round2/03-progress-pending-doing-done.png",
    "docs/knowledge/evidence/progress-tab-2026-11-15/Round2/04-progress-run-settled.png",
    "docs/knowledge/evidence/progress-tab-2026-11-15/Round2/05-chat-with-run-report.png",
    "docs/knowledge/evidence/progress-tab-2026-11-15/Round2/06-node-detail-three-sections.png",
    "docs/knowledge/evidence/progress-tab-2026-11-15/Round2/07-narrow-480-drawer.png",
    "docs/knowledge/evidence/progress-tab-2026-11-15/Round2/08-dark-theme-detail.png",
    "docs/knowledge/evidence/progress-tab-2026-11-15/Round2/09-chat-regression.png",
    "docs/knowledge/evidence/progress-tab-2026-11-15/Round2/10-trajectory-regression.png",
    "docs/knowledge/evidence/progress-tab-2026-11-15/Round2/11-child-session-opened.png",
    "docs/knowledge/evidence/progress-tab-2026-11-15/Round2/extra-03-triple-failed-run.png",
    "docs/knowledge/evidence/progress-tab-2026-11-15/Round2/extra-04-settled-failed-run.png"
  ],
  "states_covered": ["pending", "doing", "done", "failed"],
  "regressions": [],
  "evidence_dir": "docs/knowledge/evidence/progress-tab-2026-11-15/Round2"
}
```
