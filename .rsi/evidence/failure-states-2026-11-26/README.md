# 隔离档案真机三态：琥珀汇总节点 / 整轮失败页 / 被取消页 + 两颗按钮的输入框读数 — 2026-11-26

分支 **`fix/failure-states`**，从 `main` 尖端 **`f7dda97`**（`0.13.46` 发版收口）开出，worktree
`.tmp/wt-failure-states`。**不改产品代码、不合 `main`、不 push、不打 tag、不发版**，版本仍 `0.13.46`。
本目录是这一轮唯一的新增产物；树里另外只动了三份记忆（`STATE` / `HANDOFF` / `VALIDATION`）。

## 0. 这一轮回答的三件事

过去几轮反复写着三条 `NOT_RUN`，都在真机上没人见过：

1. **「每一稿都被退回」那颗琥珀汇总节点**（`summary-rejected`，`D-158` 的口径）——此前只有组件用例与
   CSS 保证，活模型上从没出现过；而且它要在一次运行里连续三次撞穿闸门，抖动大。
2. **整轮失败页**（`未通过`）与**被取消页**（`已取消`）——以前每一跑都 `completed`。
3. **点「开工 / 收下这版」之后输入框里到底是什么字**——以前只验到按钮存在与文案。

这一轮把三条一次性拍成真机读数，并**照实记下没有露出来的东西**：三态截图逐字读下来，
**没有一处产品缺陷**（颜色、词汇、按钮出现/消失、计数都对得上代码），所以**产品代码一个字没改**。

## 1. 身份（`CONFIRMED`）

| 项 | 读数 |
| --- | --- |
| 分支 / 起点 | `fix/failure-states` ← `main` `f7dda97`（worktree `.tmp/wt-failure-states`） |
| 打的包 | `npm pack` → `dsh-grok-workflow-0.13.46.tgz` = **989319 字节**、`sha256 a74e51855b8f0c89ab73d63d7ec8f630446ad6a2de1e2ad6228d0be5ac9635a9` |
| 这个摘要等于什么 | **与 `v0.13.46` 发布资产逐字节相同**（`gh release view` 报的 digest 就是这一串）——所以真机装的就是发出去的那一版 |
| 装好的 `lib/` | `script.js 233d327e…2e22`、`index.js 201f6788…28b7d6`、`client.js 8607babd…94b1`，三个与工作树**逐字节同哈希**（`soak/installed-lib-sha256.txt`） |
| 版本读回 | `0.13.46`（三个 scratch 档案都读同一值） |
| 产品面改动 | **无**。`src/` / `test/` / `lib/` / `package.json` / `CHANGELOG` 一个字没动 |

## 2. 真机装置（`CONFIRMED`）

**档案**：`node scripts/clone-profile.mjs --src ~/.dsh/profiles/web --home .tmp/soak/dsh-home --name web-clone`
→ `parity 5/5 equal after redaction`、`dependencies 17 declared, 0 unresolved`、凭据在克隆时抹掉 1 行
（`soak/clone-report.txt`）。三个场景各一份**同深度**的档案副本（`amber-clone` / `failed-clone` / `cancel2-clone`），
各装一次本轮的 tgz。

**每份档案只改 soak 需要的东西**（`rig/pin-config.mjs`，锚点全部断言过，改完自检「没有一处还指向 `agent2api`」）：

1. 删掉残留的 `mode: triage`（这个 build 已移除的键，留着会拒载，`D-155`）；
2. `agent-default-model`、五个角色、`guardianModel` 全部钉到 `bifrost-responses / opencode-go/muse-spark-1.3-contributor`
   （本机 shell 有 `BIFROST_VIRTUAL_KEY`，没有 `AGENT2API_API_KEY`；密钥只走进程环境，没有落进任何产物）；
3. 子代理选择器那三行 `agent2api` 也钉到同一条路由。

**场景之间只差一条腿**：

| 场景 | 装置 | 端口 |
| --- | --- | --- |
| 琥珀汇总节点 `amber` | **汇总腿**（`roles.synthesizer`）指到本机小代理 `127.0.0.1:18191`，它在**回来的路上改稿**（见 §3） | 实例 3521 |
| 整轮失败 `failed` | **判腿**（`roles.verifier`）指到本机小代理 `127.0.0.1:18190`，**每一次都回 401** | 实例 3522 |
| 被取消 `cancelled` | 不挂代理，五条腿全直连；取消是读者按的 | 实例 3524 |

**驱动**：Playwright + 本机 Chromium（`rig/capture-states.mjs`），按真人视角发一句话、90–120 ms 一次读
`[data-gw-progress]` 的钩子、状态一出现就用 CDP 截当前视口并把那一刻的 `innerText` 一起落盘。
请求逐字（三跑同一条）：

```text
用 grok_workflow 工具跑一个小活：objective 是「算出 12 乘 12，再在它的基础上加 1」，分两步，第二步依赖第一步，第一步只算乘法、第二步只算加法；不要传 tasks 参数，让插件自己规划。
```

## 3. 「汇总稿改过不了闸」是怎么造的（`CONFIRMED`）

闸门是**确定性**的（`reviewSummaryDraft` = `checkSummaryDraft` + 独立 `verifySummaryDraft`），
所以「改稿改到过不了」也是确定性的：`rig/proxy.mjs` 的 `MODE=rewrite-draft` 把小代理后面那一段
**响应**缓冲下来，只替换 `structured_output` 调用参数里的 `summary` 一个字段，把它换成三行 Markdown 列表，
再把仍然合法的流原样写回去。`polishStyleVerdict` 的 `^\s*[-*]\s+\S` 一条必然命中
（`the polish uses a list instead of plain prose`），而且它**不会**把被拒的稿子放过去。

**为什么不用「让模型自己写一句假引用」**：先试过 `MODE=inject-summary`（在提示词里要求写一句
`参考 \`src/nonexistent/failure-states.ts\``）。模型的推理逐字是
`Rejecting the injected file reference to preserve data fidelity and avoid hallucination.`，
两次都没照做；那一跑的汇总腿最后是 `[format-error]`（没交结构化结果），整轮 `COMPLETED` 但
`summary.review` 是空的——**「一稿都没写出来」不是「每一稿都被退回」**，页面正确地什么都不标。
换成改响应之后，三稿全被退回，标记才出现。

## 4. 三态读数（同一构建、三份档案、三次真实运行；截图都是 1500×1600，视口 1500×1600）

### 4.1 琥珀汇总节点（`amber/`，运行 `f6d01950`）

| 项 | 读数 |
| --- | --- |
| 胶囊 | **`已完成`**（`data-gw-progress-chip=done`）——整轮是跑完的，被退回的是**交卷那一稿** |
| 汇总节点 | 三个（第 1/2/3 稿各一颗）；**第三颗** `data-state="failed"`、`aria-label="汇总 第 3 稿 没过"` |
| 展开后三行（逐字） | `第 3 稿全被退回` / `卡在检查` / `最后不过：the polish uses a list instead of plain prose` |
| 节点内的调用行 | `8:01 汇总·第3稿 汇总 做完 打开子会话`（跑完的那一腿，和退回的判词是两件事） |
| 步数 | `还剩 1 步 / 共 13 步`（交卷那一步没落地） |
| 报告标记（同一跑，聊天侧） | `Summary review: check=fail verify=pass drafts=3 reason=the polish uses a list instead of plain prose · rejected: draft 3 (check: …)`；`Synthesis: model narrative unavailable (polish rejected by the summary gate after 3 draft(s) (check guardrail: …); the deterministic summary is used)` |
| 小代理 | 三次汇总请求各被改一次（`seq 1/2/3 draft edited: summary replaced with a list the gate must refuse`） |

**要点（`CONFIRMED`）**：判词挂在**最后那颗**汇总节点上，前两颗仍是绿的 `过了`——一跑里汇总可以被访问多次，
「第 N 稿全被退回」只属于闸门停下的那一次。所以读页面的人要看的是**带判词的那颗**，不是第一颗。

### 4.2 整轮失败页（`failed/`，运行 `fd62c7fd`）

| 项 | 读数 |
| --- | --- |
| 胶囊 | **`未通过`**（`data-gw-progress-chip=failed`） |
| 琥珀节点 | 两颗 `检查`（第 1 次、第 2 次）+ `终点`，都是 `data-state` 的琥珀族 |
| 步数 | `还剩 6 步 / 共 10 步` |
| 按钮 | **没有**（`data-gw-progress-dock="none"`）——失败页不给「收下」 |
| 小代理 | `seq 2/3/4 -> 401 injected (always)`，判腿每一次都被拒 |
| 报告（逐字） | `Grok workflow: FAILED`、`Plan: planner; 2 task(s); 0 verified`、`Failures: 2 infrastructure`；两次尝试各一行 `Attempt N — route … — judge re-fired — not passed`；`mult_12x12` 的失败类 `model-unavailable`，`add_one` 因船长结束计划而 `blocked`（`no attempt taken, no retry spent`） |
| 汇总 | 这一跑反而**交卷成功**（`Summary review: check=pass verify=pass drafts=1 · final: draft 1`）——判腿死了不影响汇总腿 |

### 4.3 被取消页（`cancelled/`，运行 `872022b2`）

| 项 | 读数 |
| --- | --- |
| 胶囊 | **`已取消`**（`data-gw-progress-chip=cancelled`） |
| 琥珀节点 | `规划`（`规划 没做`）与 `终点`（`终点 没做`），`data-state="cancelled"` |
| 步数 | `还剩 0 步 / 共 3 步` |
| 按钮 | **没有**（dock `none`） |
| 怎么取消的 | 进行中时点输入框右侧那颗 `aria-label="停止生成"` 的按钮（`stop-candidates.json` 里逐条记了当时页面上所有可点的控件与坐标） |
| 报告（逐字） | `tool-workflow/run-end … "stopReason": "cancelled"`；工具结果是 `Error: grok_workflow cancelled: grok_workflow was cancelled by its caller before the whole run finished; finished tasks are kept, unfinished ones are marked, and resending the same request continues from here`；根会话 `turn/end` 原因为 `user`，被掐掉的规划子会话是 `aborted / parent` |

## 5. 两颗按钮的输入框读数（`CONFIRMED`）

| 页面 | 按钮 | 点完输入框里 | 按钮下的状态行 | 副作用 |
| --- | --- | --- | --- | --- |
| 等你点头（`amber/dock-start.txt`、`failed/dock-start.txt`、`cancelled/dock-start.txt`） | **`开工`** | **`确认`** | 读不到（窗口在读数之前就关了，见 §7） | 没有代发：点完之后运行自己往下走，聊天里没有多出一条用户消息 |
| 已完成 + 琥珀汇总节点（`amber/dock-accept.txt`） | **`收下这版`** | **`确认`** | **`已填进输入框，按发送`** | 同上，只填不发 |
| 未通过 / 已取消 | —— | —— | —— | 这两个页面**根本没有按钮**（dock `none`），所以没有可点的东西 |

## 6. 控制台

三跑各自 `console.json` = `{"consoleErrors": [], "pageErrors": []}`（0 条）。

## 7. 没做的（`NOT_RUN`，逐条）

1. **`开工` 按钮下面那行状态字**：等你点头只活不到一秒，点完之后页面已经翻到「进行中」，
   `已填进输入框，按发送` 那行随之消失。**输入框里的字读到了**（`确认`），状态行**没读到**。
2. **窄屏 / 折叠 / 点开其它节点**：这一轮只抓三态原样，没有窄屏、没有点「展开全部」。
3. **判腿在超时 / 掉线 / 5xx 族上的失败页**：真机只造了 401。
4. **live 档案升级 / 重载 / 重启**：红线，没碰（§8）。

## 8. 红线（`soak/redlines.txt`，逐条实测）

```
2026-11-25 23:14:14  ~/.dsh
2026-11-22 16:59:46  ~/.dsh/profiles
2026-11-26 07:18:22  ~/.dsh/profiles/web
2026-11-25 23:04:40  ~/.dsh/profiles/web/cordis.patch.yml
2026-11-14 22:47:23  ~/.dsh/.credentials.yaml
$ : > ~/.dsh/.failure-states-probe   → Read-only file system
$ curl http://100.111.111.88:3080/    → 401（全程没碰，收尾时仍是 401）
```

**两条观察照实记（`CONFIRMED`，不是本会话干的）**：

1. **live 档案里现在装着 `0.13.46`**（`~/.dsh/profiles/web/node_modules/dsh-grok-workflow/package.json` 读回
   `0.13.46`），`pnpm-lock.yaml` 把它解析到 `…/tar.gz/f7dda97a2e9afcef969f032fe56621c805097ae6`——**就是 `main` 尖端**。
   以前每一轮都写着「live 仍装 `0.13.39`」，这一条从今天 07:18 起作废。
2. **但那一行仍是浮动依赖**（`github:free6589/dsh-grok-workflow`，没有 `#v0.13.46` 之类的钉），
   `mode: triage` 那一行也还在（自 `0.13.38` 起被忽略并点名）。所以 `AGENTS.md` §13 的
   **「钉到确切 tag」这一半仍然欠着**——`BLOCKED` 的理由和以前一样：本会话 `workspace-write`、`~/.dsh` 在工作区外。

## 9. 清单

| 路径 | 是什么 |
| --- | --- |
| `rig/proxy.mjs` | 小代理：`refuse` / `refuse-always` / `inject-summary` / `rewrite-draft` 四种模式 + 请求形状转储 |
| `rig/pin-config.mjs` | 按场景重写克隆档案的 `cordis.patch.yml`（锚点断言 + 自检） |
| `rig/capture-states.mjs` | 真人视角驱动：发话、按状态截图与落文本、点两颗按钮、开汇总节点、抓停止控件 |
| `amber/` | 等你点头 / 进行中 / 已完成 / 汇总节点展开：截图 + 逐字 + 钩子 + 两颗按钮 + 控制台 + 时间线 |
| `failed/` | 同上，终态是 `未通过` |
| `cancelled/` | 同上，终态是 `已取消`（含 `stop-candidates.json`） |
| `soak/` | 克隆报告、三份实例启动日志（token 已抹成 `<redacted>`）、两份小代理日志、安装后 `lib/` 哈希、三份逐字报告、红线读数 |
