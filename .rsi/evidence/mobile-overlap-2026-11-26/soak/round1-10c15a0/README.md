# 第一轮：提交 `10c15a0` 的取证（归档）

> 这是**第一轮**的记录，整体归档在 `soak/round1-10c15a0/`：本文件与它引用的读数、图、脚本都在
> 这个目录里。第二轮（提交 `5ba1ca2`）的证据在上一层的 `README.md` 与 `soak/` 根下。
> 这一轮证明的是「列表不压隔壁卡」；它没有、也不可能证明「点完当下就看得见」——那是第二轮补的。

# 手机重叠修复：一次真机 soak（2026-11-26）

被测的是 worktree `.tmp/wt-mobile-overlap` 上的提交 **`10c15a0`**
（`fix(progress): a phone's opened calls come out of the tree instead of landing on the card
next door`），基线 `main` 尖端 `fe6d631`，包版本 `0.13.53`，无标签
（`git describe` = `v0.13.53-2-g10c15a0`）。产品代码、测试、`docs/`、`package*.json`、
`CHANGELOG.md` 一个字没改；没有提交、没有推送、没有打标签、没有升 live 的插件。

要证的事只有一件：**≤720 px 时，点开一颗节点的调用列表，它不再压住隔壁那张卡，也不再压住
「收下这版」**。这一轮在隔离实例里跑真工作流，在 390 和 360 两个宽度各拍一次「列表已摊开」，
把相交面积逐条读出来。

## 1. 跑了什么

| # | 是什么 | 结果 | 用在哪 |
| --- | --- | --- | --- |
| 1 | 第一遍取样（390 + 360，点开 `check_t2`） | 完成，读数全对，但**取景不合格**：抽屉在图外面、贴着视口底边，被输入框压住，两张图里看不见它 | 图留在 `first-pass-framing-*.png`，读数留在 `first-pass-readings.json` |
| 2 | 第二遍取样（同上两宽度，改成先把抽屉滚到画面中间再拍） | 完成（190 s / 198 s 到两个宽度），四张图都含抽屉 | 本文件 §3–§7 的正式证据 |

两遍各自都真的跑了一次工作流（不是复用同一份会话），实例内归档里两条运行记录都在
`runs.json`：

- `run:b5cf5650-…` 12:36:43 → 12:40:01，`status completed · verified 3/3 task(s) · confirmed 6 criterion`
- `run:b1549fac-…` 12:41:40 → 12:44:43，`status completed · verified 3/3 task(s) · confirmed 7 criterion`

发出去的是同一句话（压成一行，逐字未改）：

```text
用 grok_workflow 工具跑一个工作流，拆成三个互相独立、可以并行的任务，每个任务都要真的写一个文件：任务一：写 notes.md，内容是三行安装步骤；任务二：写 test.txt，内容是一行 hello；任务三：写 third.txt，内容是一行 bye。三个任务并行跑，不要串行；跑完把每个任务写了什么汇总一下。
```

三个文件真的写出来了（一次性工作区里，收尾时随工作区一起删掉）：

| 文件 | 字节 | 内容 | 第一遍 | 第二遍 |
| --- | --- | --- | --- | --- |
| `notes.md` | 90 | `1. 安装依赖：npm install` / `2. 构建项目：npm run build` / `3. 启动服务：npm start` | 12:37:11 创建 | 12:42:05 自查「already existed with exactly three non-empty installation steps」，没有重写（所以 mtime 停在第一遍） |
| `test.txt` | 6 | `hello` | 12:37:15 | 12:42:11 重写 |
| `third.txt` | 4 | `bye` | 12:37:08 | 12:41:53 重写 |

第一遍那棵树 17 个节点（3 张「汇总」草稿），第二遍 16 个（2 张）——同样的输入，草稿轮数不同，
所以在两遍之间比节点数没有意义；每一遍内部两个宽度共用同一份 DOM，比宽度才有意义。

## 2. 环境（每条都能回指 `install.txt`）

| 项 | 读数 |
| --- | --- |
| 提交 | `10c15a0`（无标签，5 文件 +585/−26） |
| 构建 | `npm run build` → 客户端包 410 497 B；重建后 `git status` 为空、`cmp lib/client.js src/client/index.js` 无输出 |
| 客户端哈希 | `dbcfaf1403715975df0717c3dcf0286a2c9dca590527e5d67b797910e8bbc8ba`（`lib/client.js` = `src/client/index.js`） |
| 服务端哈希 | `ac69070e3eda3889a6bb36a9f967512efb5843e2e1ffc9ac80b32021defa2c32`（`lib/index.js`，与 0.13.52 相同——这一版没动服务端） |
| 包 | `dsh-grok-workflow-0.13.53.tgz`，**1 029 904 B**，`sha256 0d2dede5a8ab9e6fc2cfe7abf109d87385ee635eca9281d3aa28a0fb48813b30`，164 文件 |
| 安装方式 | `dsh plugin --profile web-clone add file:<tgz 绝对路径>`；依赖行写死这个 `file:`，不是范围、不是 link |
| 装好的副本 | 版本读回 `0.13.53`；`lib/client.js` 与 `lib/index.js` 两个 sha256 都等于 worktree；插件目录里软链 **0** 个；`readlink -f` 落回 clone 自己 |
| 隔离 home | `.tmp/soak-overlap/dsh-home`（从 `~/.dsh/profiles/web` 克隆：7753 文件、5 链接、5/5 抹除后逐字节相等、凭据抹除 1 行、克隆里除占位符与 4 个第三方假钥匙外无密钥） |
| 工作区 | `.tmp/soak-overlap/work`（一次性，收尾删除） |
| 端口 | 先定 3421 → 起进程时被别的进程占走（`EADDRINUSE`）→ 改 **3431**，起进程前实测空闲，起成后 `ss -ltn` 显示 LISTEN |
| 运行时 | Node v26.8.1 / npm 11.19.0 / dsh 0.2.2-rc.3 |
| 模型钉法 | worker / verifier / supervisor / guardian 从 `agent2api/…` 改钉 `bifrost-responses/opencode-go/muse-spark-1.3-contributor`（本机没有 `AGENT2API_API_KEY`，只查过存在与否）；另删掉已移除的 `mode: triage` 一行。全在克隆里，live 一次没碰 |

密钥只走进程环境（`~/.dsh/bifrost.env` 打进那个进程），没有落进任何写出的文件；实例的访问令牌
也没有写进证据目录（`grep 'token='` 在证据里只命中占位符）。

## 3. 四张图，每一张是什么

| 文件 | 宽度 / 像素 | 这一刻画面里有什么 |
| --- | --- | --- |
| `phone-390-calls.png` | 390×844 / 780×1688 | **列表摊开**：树尾「终点」下面、图**外面**的抽屉——标题「调用」、右上「收起」、摊开的那颗节点自己那一行「任务 2 · 写 test.txt」，一行调用「20:42 检查 任务 2 · 写 test.txt 过了 打开子会话」。抽屉上沿与「终点」卡片之间有空隙，上面几张卡（任务 3 / 汇总 第1稿 / 第2稿 / 终点）一张都没被压到 |
| `phone-390-calls-dock.png` | 390×844 / 780×1688 | 同一刻，向下滚到「收下这版」：**抽屉与蓝色「收下这版」按钮同时在画面里**，中间隔着 Guardian 卡，抽屉没盖住按钮 |
| `phone-360-calls.png` | 360×800 / 720×1600 | 最窄一档的同一刻：抽屉同样在树外、卡片下方，卡片无遮挡 |
| `phone-360-calls-dock.png` | 360×800 / 720×1600 | 最窄一档 + 「收下这版」露出来：抽屉、Guardian、按钮三层都在框里，互不叠 |
| `first-pass-framing-390-calls.png` | 390×844 | 第一遍那一帧（不用于验收）：抽屉矩形是 739→844，正好贴在视口底边、藏在输入框那层后面，所以画面里看不见它 |
| `first-pass-framing-360-calls.png` | 360×800 | 同上，360 那一帧（695→800） |

## 4. 读数（`readings.json`，每条与它旁边那张图同一刻读的）

每一项都在**一次** `page.evaluate` 里读完，所以读数和那一帧是同一刻。

| 读数 | 宽 | 调用列表 | 抽屉 | 列表在抽屉里 | 列表在图里 | 与节点卡相交面积 | 与 dock 相交 | 与 dock-fill 相交 | 滚动宽=客户宽 | `[data-current="true"]` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `phone-390-calls` | 390 | 1 | 1 | 是 | 否 | **0**（`overlaps: []`） | **0** | **0** | 390 = 390 | 1 |
| `phone-390-calls-dock` | 390 | 1 | 1 | 是 | 否 | **0** | **0** | **0** | 390 = 390 | 1 |
| `phone-390-calls-closed` | 390 | **0** | **0** | — | — | 0 | 0 | 0 | 390 = 390 | 1 |
| `phone-390-calls-hidden-by-button` | 390 | **0** | **0** | — | — | 0 | 0 | 0 | 390 = 390 | 1 |
| `phone-360-calls` | 360 | 1 | 1 | 是 | 否 | **0**（`overlaps: []`） | **0** | **0** | 360 = 360 | 1 |
| `phone-360-calls-dock` | 360 | 1 | 1 | 是 | 否 | **0** | **0** | **0** | 360 = 360 | 1 |
| `phone-360-calls-closed` | 360 | **0** | **0** | — | — | 0 | 0 | 0 | 360 = 360 | 1 |

四条硬指标逐条对照：

1. **相交面积合计 = 0**，两个宽度都是（列表摊开那一刻、滚到 dock 那一刻、点开即读那一刻都是 0）；
2. **抽屉在**：`[data-gw-progress-sheet]` = 1，列表的 `closest('[data-gw-progress-sheet]')` 命中
   （`callsInsideSheet: true`），而 `closest('[data-gw-progress-graph]')` 不命中
   （`callsInsideGraph: false`）；点第二次之后抽屉与列表**双双为 0**，两个宽度都是；
3. **没有横向滚动**：390 时 `scrollWidth = clientWidth = 390`，360 时 `= 360`；
4. **dock 没被压**：列表与 `[data-gw-progress-dock]`、`[data-gw-progress-dock-fill]` 的相交面积
   都是 0，滚到 dock 那一帧 `dockInsideViewport: true`。

第五项（不是硬指标，顺手验的）：抽屉右上那个「收起」按钮走同一套开关——390 上点开、点「收起」，
抽屉与列表都归 0（`hideButton: { reopenedSheetCount: 1, hideLabel: "收起", afterHideSheetCount: 0,
afterHideNodeCalls: 0 }`）。

点的是哪颗节点：`check_t2`（`任务 2 · 写 test.txt 过了`），9 颗可摊开的任务节点里取中间那颗
（index 4），两个宽度点是同一颗。

## 5. ① 列表与哪张卡都不相交（面积 = 0，附几何）

`overlapAreaTotal` 是把列表矩形与**每一张**节点卡（`.gw-progress-pnode-body`，共 16 张）的相交面积
逐个算出来再相加；相交的会逐条列进 `overlaps`（id、面积）。这一轮 `overlaps` 是**空数组**，两个宽度、
两个时刻都是。

把矩形摆出来看更直白（CSS px，视口坐标）：

```
390 · phone-390-calls         抽屉  [0,407 → 383,512]   383×105
                              列表  [11,469 → 372,503]  361×34
390 · phone-390-calls-dock    抽屉  [0,349 → 383,454]
360 · phone-360-calls         抽屉  [0,385 → 353,490]   353×105
360 · phone-360-calls-dock    抽屉  [0,305 → 353,410]
```

抽屉是这 16 张卡之外的一块（`callsInsideGraph: false` 就是它不在图里的直接读数），所以相交面积
只能来自"卡片压到抽屉上"这一种情形；画面里它上沿与「终点」卡之间留着看得见的空隙。

对照"改之前会是什么样"：上一轮同一台机器上拍的 `../../task-panel-2026-11-26/soak/phone-390-trace.png`
里，列表就是从节点下面浮出来、和「任务 2 · 写 test.txt」那张卡叠在一起（那一轮的 README §7.7 记了
这件事）。这一轮同样的动作，叠压为 0。

自检还钉住了这个数不是"永远为 0"：`capture-phone.mjs --self-test` 的第三份夹具是"抽屉吃掉 dock"，
它读出 15 600 px²（`dockFillOverlapArea` 7 800），第一份是"浮出的列表压住下面那张卡"，读出
12 480 px²（= 390 × 32，与手算一致）。也就是说这把尺子既能读出 0，也能读出非 0。

## 6. ② 抽屉没盖住「收下这版」（面积 = 0，附一张同框的图）

`phone-390-calls-dock.png` 是硬证据：同一帧里同时有抽屉（「调用 / 收起 / 任务 2 · 写 test.txt / 一行调用」）
和蓝色的「收下这版」按钮，两者之间还隔着 Guardian 卡。

```
390 dock 帧：抽屉 [0,349 → 383,454]   dock [4,622 → 379,730]   间距 168 px   相交 0
360 dock 帧：抽屉 [0,305 → 353,410]   dock [4,578 → 349,628]   间距 168 px   相交 0
             dock-fill（按钮的填充层）与抽屉相交同样是 0
```

也就是说：抽屉既没被 dock 压住，也没压住 dock；按钮那 375×50 / 345×50 的矩形完整露在外面。

## 7. 抽屉的尺寸（实测）

| 读数 | 390 | 360 |
| --- | --- | --- |
| 抽屉高度 | **105 px**（`sheetRect.height`） | **105 px** |
| 高度上限（计算样式） | `max-height: 240px` | `240px` |
| 溢出方式 | `overflow-y: auto` | `auto` |
| 列表自身定位 | `position: static`（在抽屉里正常排版） | `static` |
| 占面板可见高度 | 0.143（摊开那一刻）／0.155（滚到 dock 后） | 0.147／0.166 |
| 点开后（未额外滚动） | 0.124 | 0.131 |

比例会随滚动变化，因为分母是"面板此刻露在视口里多少"（390：844 → 734 → 676 px），分子恒为 105 px。
抽屉这次只有一行调用，所以远没到 240 px 的上限；多行时按 `min(50vh, 240px)` 自己纵向滚。

## 8. 控制台

`raw-capture.txt` 与 `console.json`：两遍浏览器会话合计
`consoleErrors: []`、`pageErrors: []`。隔离实例里起不来的两个插件是 serena（`~/.serena/logs`
只读）和 mdcg 的心跳文件（`~/agent-memory` 只读），都在服务端、不进页面控制台，与本改动无关。

## 9. 失败、偏差与 `NOT_RUN`（一条不藏）

**9.1 第一遍取景不合格，重跑了第二遍。** 抽屉渲染在图**外面**（`callsInsideGraph: false`），点开时
页面自己的 `scrollIntoView({block:'nearest'})` 只把它滚到"刚好贴住视口底边"——390 时抽屉矩形是
739→844、360 时 695→800，正好落在固定在底部的输入框那一层后面。读数全对，但两张图里**看不见抽屉**，
这样的图证明不了任何事。第二遍改成先把抽屉滚到画面中间再拍，四张图都含抽屉。第一遍那两个帧保留在
`first-pass-framing-*.png`，读数在 `first-pass-readings.json`。

**这条同时是一条版面观察（不是本轮的验收项，也没判对错）**：在 390 上点开一颗节点，抽屉会在视口
最底边出现、并被输入框挡住一整块，读者要自己再滚一下才看得全。是否要改由你定；这一轮的取样脚本
因为要"图里必须有抽屉"，统一做了居中滚动，所以四张图都不反映这个初始落点。

**9.2 端口 3421 被抢。** 准备阶段实测空闲、绑过两次都成功；20:33 起进程时 `EADDRINUSE`，实例没起来
（`webserver (required)` 失败、8 个插件等 `webServer`）。`ss -ltnp` 看不到 pid，同时 3411 上也有一个
同样特征的空闲监听者——像是另一个沙箱里的实例。换 3431 一次起成。原文见 `install.txt` §7。

**9.3 第二遍的 `notes.md` 没被重写。** 子任务回了「already existed with exactly three non-empty
installation steps」，所以它的 mtime 停在第一遍的 20:37。文件内容是对的，三个任务在两次运行里都是
`verified 3/3`。

**9.4 用的选择器与要求写的不完全一样。** `[data-gw-progress-pnode-body]` 这个 **data 属性**在代码里
不存在（`gw-progress-pnode-body` 是 CSS 类；按钮上有的是 `data-gw-progress-pnode-open`）。脚本优先认
属性、没有就用类，并把实际用到的写进每条读数（`cardSelector: ".gw-progress-pnode-body"`，命中 16 张）。

**9.5 树里的节点数两遍不同（17 / 16）。** 同样的输入，草稿轮数不同（3 张汇总 vs 2 张）。同一遍内
两个宽度是同一份 DOM，所以宽度之间的比较不受影响。

**`NOT_RUN`**

1. **>720 px 那一侧（桌面 / 700 px 平板）**：这一版声明"一个字没改"，本轮没有复测；桌面那处叠压
   是**故意不修**的，也没有拿它当失败。
2. **721 px 与 720 px 的断点边界**：只测了 390 与 360，没有逐像素找断点位置。
3. **`matchMedia` 的 `change` 监听（拖窗口从宽到窄、不刷新）**：没有验；本轮两个宽度是同一个页面
   改视口，走的是 `change` 之外的重排路径（读数一致，但没单独证明监听本身）。
4. **多组同时摊开**：只摊开一颗节点。抽屉设计上可以装"每个摊开的节点一组"，本轮没造两组。
5. **抽屉内容超高的滚动**（超过 240 px 上限）：这次只有一行调用，没造多行。
6. **live 档案升级 / 重载 / 重启**：`NOT_RUN`（红线）。
7. **「等你点头」/ 未通过 / 已取消 / 出错四个状态**：本轮运行一路顺利，完成态之外没出现。

## 10. 红线（`redline.txt` 是原文）

```
                        BEFORE (20:09)                     AFTER (20:50)
~/.dsh                  2026-11-25 23:14:14.025606767      同一个值
~/.dsh/profiles         2026-11-22 16:59:46.687805286      同一个值
~/.dsh/profiles/web     2026-11-26 19:41:49.334856619      同一个值

$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/   → 401（前） / 401（后）
$ bash -c ': > ~/.dsh/.soak-probe'                                → Read-only file system（前、后各一次）
$ node -p "…/profiles/web/node_modules/dsh-grok-workflow/package.json.version"  → 0.13.53（没升）
```

live 实例一次没重启、没重载、没改设置；隔离实例在收尾时停掉（3431 已释放），
`.tmp/soak-overlap/`（含 104 MB 克隆 home 与 tgz）整体删除。

## 11. 目录里有什么

| 文件 | 是什么 |
| --- | --- |
| `README.md` | 本文件 |
| `install.txt` | 构建 / 打包 / 安装 / 引导的命令与哈希（tgz、两个 sha256、版本读回、软链 0）、克隆报告、端口事故原文 |
| `redline.txt` | 只读探针、三个 mtime、3080 前后、shell 里已导出的 `DSH_HOME` 陷阱、端口实测 |
| `capture-phone.mjs` | 取样脚本（`node capture-phone.mjs <url> <outDir>`，另有 `--self-test` 离线自检） |
| `readings.json` | 10 条读数（每宽度：点开即读 / 摊开 / dock / 收起 / 重开 / 按钮收起）+ 全部几何 |
| `interaction.json` | 点了哪颗节点、两个宽度的四张图与硬指标汇成一份 |
| `runs.json` | 两次运行的归档记录（开始、完成、每个子任务的说法） |
| `raw-capture.txt` | 采集脚本第二遍的逐行原始输出 |
| `console.json` | 控制台错误（空） |
| `first-pass-*.png` / `first-pass-readings.json` | 第一遍：读数对但取景不合格的那两帧（§9.1） |
| `verify-readings.mjs` / `verify-readings.txt` | 把本文件 §4 的每条硬指标对着读数重算一遍（21 条，全过；`node verify-readings.mjs` 可复跑（在本目录里跑）） |
| `phone-{390,360}-calls.png` / `phone-{390,360}-calls-dock.png` | 四张验收图（§3） |
