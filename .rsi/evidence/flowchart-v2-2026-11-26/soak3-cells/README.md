# 第三趟：方块格子（主验意见）— 2026-11-26

主验看过上一轮截图说「格子太圆，像药丸」，圆角从 `10px` 改成 **`6px`**（26px 高的格子，10px 是 77% 半高读作胶囊，
6px 是 46%）。这一趟只为一件事：**拍清楚改完的格子读作方块**。

## 0. 身份（钉死，先对这三行再看图）

| 项 | 值 |
| --- | --- |
| 分支 | **`feat/flowchart-v2`**（工作树 `.tmp/worktrees/flowchart-v2`，`git rev-parse HEAD` 复核过） |
| 提交 | **`ef9b474050523a2d93f881f15347afc4f0840603`**（`ef9b474`，打包前现场读的） |
| `sha256(lib/client.js)` | **`e51daa662d0303b4ffc5a310f1b9e0de638238b56a53779d7522410bcc0a3cff`** / **372480 字节** |
| 包 | `dsh-grok-workflow-0.13.47.tgz` = **`dfc25f246a48309a33d8a4013cdfbb475ec5107a6df631a2a93faf5ddc4529bb`** / 997049 字节 |
| 装进克隆的副本 | 同哈希 `e51daa66…`，`readlink` 为空（rsync 真拷贝，不是软链） |
| 装置 | 克隆 live 档案 `web-clone`（`files 7742 -> 7742`、`parity 5/5`、`dependencies 17 declared, 0 unresolved`），`DSH_HOME=.tmp/soak-cells/dsh-home`，端口 **3393**，工作区 `.tmp/soak-cells/work`，真模型 `bifrost-responses/opencode-go/muse-spark-1.3-contributor`（五角色 + guardian 全钉这一条），`mode: triage` 已删 |

另一条分支 `feat/force-team-routing`（`e9a48b9`）**没有**被打包、没有被测——本次只装 `ef9b474` 这一包。

## 1. 三条读数（量出来的，不是看出来的）

| 读数 | 值 | 怎么量的 |
| --- | --- | --- |
| **computed `border-radius`** | **`6px`**（四角同值） | `getComputedStyle(cell).borderTopLeftRadius`，宽屏与 700px 两次都读到 `6px` |
| **computed `height`** | **`26px`** | 同上；放大图里盒子高 **104 设备像素 = 26 css px**，与 `height` 一致 |
| **像素级圆角（左上角第一行 inset）** | **13 设备像素 = 3.25 css px** | 从 `cell-zoom-4x.png`（4 倍、1420×168）逐像素数：首行前 13 颗像素是背景，第 14 颗起是格子的边框/填充 |

逐行 inset（4 倍图，设备像素 / css px）：`+0 → 13 / 3.25`、`+1 → 10 / 2.50`、`+2 → 8 / 2.00`、`+3 → 6 / 1.50`、
`+4 → 5 / 1.25`、`+5 → 4 / 1.00`、`+6 → 4 / 1.00`、`+7 → 3 / 0.75`。圆弧在 6 css px（24 设备像素）内收平，
8 行之内就落到 1 px 以下——这正是「一小段圆角」而不是「半圆头」。

**结论（一行）：`6px` 在这个 26px 高的盒子上读作方块**——四个角有可见圆角，但首行只内收 12.5% 的高度，
轮廓是矩形；按老值 `13px`（半高）推算，首行要内收约 45 设备像素（≈43% 高度）才会读成药丸。

## 2. 状态色与形状（宽屏完成页）

- 页头逐字 `已完成`，页脚 `还剩 0 步 / 共 13 步`，dock 有 `收下这版`。
- **13 列 / 6 个格组 / 6 格**：`执行 / 检查 / 复核` 三列下各挂 `任务 1 · 计算12乘12` 与 `任务 2 · 在第一步结果上加1`，
  六格 `data-state` 全 `done`（绿），逐 lane `top = 176 / 176 / 176` 与 `208 / 208 / 208`（**极差 0.00 px**）。
- 每格：`height 26px`、`border-radius 6px`、`border 1px solid`（绿 45%）、`linear-gradient(绿 12% → 5%)`、
  宽 `82px`（1500 px、13 列时）。
- 步骤节点仍是 `10px`、起终点仍是胶囊 `999px`（源码 `src/client/index.js` 的 `.gw-progress-node` 规则，未变）。
- **一处宽度后果照实记**：1500 px 下 13 列把每格压到 82 px，格里的任务名读作 `任…`（ellipsis）；
  700 px 折成两列一行后每格 339 px，任务名完整。**主图（4 倍裁图）取自 700 px 那一次**，
  因为圆角不随宽度变，而主验要看的是「一格长什么样」。

## 3. 窄屏 ≤720

`cells-done-narrow-700.png`：列折成两列一行，`colRowTops = [138, 178, 282, 386, 490, 594, 634]`（7 行装 13 列），
`scrollWidth 700 === clientWidth 700`（**没有横向滚动**），格宽 339 px、任务名完整、圆角仍是 6 px。

## 4. 控制台

`console.json` → `{"consoleErrors": [], "pageErrors": []}`（整趟零报错）。

## 5. 这一趟之前废掉的一次

第一次跑的是「写三个小文件」那个请求（想多要几个格），结果：克隆的工作区没被指到 scratch（`workspace.json` 默认
`~/Documents/deepseek-harness/default-workspace`），子代理一个文件都没写进去，任务逐个被判不过，
跑成 **未通过**（13 列 / 18 格 / 3 次重试浪）。那份读数对「方块格子」没用，已删除；改法是把工作区指到
`.tmp/soak-cells/work` 再跑「算 12 乘 12 加 1」，得到上面这份**已完成**页。

## 6. 文件

| 文件 | 是什么 |
| --- | --- |
| `cells-done-wide.png` | 已完成页 · 宽屏 1500（13 列、六格全绿、方块） |
| **`cell-zoom-4x.png`** | **主图**：一格 4 倍放大（1420×168），圆角与边框看得清 |
| `cell-zoom-meta.json` | 放大时读到的 `radius / height / width / label / host box` |
| `cells-done-narrow-700.png` | ≤720 窄屏（列折行、无横向滚动） |
| `cells-done-wide.json` / `.txt` | 宽屏那一拍的钩子计数、逐格 computed 样式、逐字面板文本 |
| `cells-done-narrow-700.json` | 窄屏那一拍 + `colRowTops` |
| `console.json` / `timeline.txt` | 控制台与轮询时间线（发送 → 格子出现 → 终态 → 两拍） |
