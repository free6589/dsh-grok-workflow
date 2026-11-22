# 固定左栏 + 折线回环节（2026-11-22）

结论：`src/client/index.js` 的任务带改成「固定 40px 左栏 + 每组一条折线回环 + 每卡短 stub 箭头」。
下面全部是本机真实渲染产物 `lib/client.js` 在真实 Chromium 布局下的实测值（CONFIRMED），
不是设计稿推算。

## 改了什么

| 位置 | 改动 |
| --- | --- |
| `src/client/index.js:2850-2870` | 新增常量：`PROGRESS_WIRE_PAD=40`、`BAND_GAP=12`、`CHANNEL_X=18`、`CHANNEL_STEP=10`、`CHANNEL_INNER=38`、`LANE_GAP=4`、`LANE_STEP=8`、`LANE_CLEARANCE=4` |
| `:2949-2958` | `.gw-progress-tasks` 的 `padding-left` 改成常量 40px（原为 `var(--gw-wire-pad, 12px)`，由测量写入）；`margin-top` 改 `calc(12px + var(--gw-wire-depth, 0px))` |
| `:3021-3024` | `<=480px` 下 `padding-left: 12px` 且 `margin-top` 回到 12px（连线已 `display:none`） |
| `:3264-3382` | `EMPTY_PROGRESS_WIRES` 去掉 `pad`，改 `depth`；`sameProgressWires` 比较 `depth` 与逐顶点坐标；`measureProgressWires` 输出 4 顶点折线 + 每卡 2 顶点 stub |
| `:3423-3444` | 新增 `progressWireDraw`（顶点→`d`）与 `progressWireHead`（右向三角） |
| `:3590-3620` | trunk/stub 渲染改用 `points`；`data-owner` / `data-gw-progress-wire` / `data-gw-progress-wire-branch` / 三角箭头全部保留 |
| `:3663` | flow 的 inline style 由 `--gw-wire-pad` 改为 `--gw-wire-depth` |

不再有「量到哪就缩进到哪」的路径：`pad = max(pad, x + 30)` 已删除（原 `:3331`）。

## 怎么测的

- 渲染器：`.rsi/evidence/fixed-gutter-2026-11-22-harness.html`，加载真实构建产物
  `lib/client.js`，自带最小 React 替身把组件跑成真实 DOM，重渲到状态不再变化
  （连线效应会改顶边距，故每例至少两遍；实测 A/D/F 走 3 遍、其余 2 遍收敛）。
- 驱动：`.rsi/evidence/fixed-gutter-2026-11-22.py`（Playwright + 本机
  `~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`，视口由 Playwright 设定，
  480px 媒体查询真实生效）。原始数据在 `.rsi/evidence/fixed-gutter-2026-11-22.json`。
- 用例：A 三 owner（规划/执行/检查，11 行）、B 12 个计划任务（1 组 12 卡）、C 仅检查、
  E 仅执行、D 四 owner（规划/执行/检查/回答）、F 一组两卡 + 检查一组。
- 断言（脚本里逐条算，`problems` 为 0 才算过）：卡片左边距唯一且等于 padding-left；
  trunk 四顶点依次为 `(x_o, 轨道底) → (x_o, y_e) → (x_g, y_e) → (x_g, 末卡中心 y)`，
  且 `x_o` = owner 圆环中心、`y_e = 轨道底 + 4 + 8*i`、`x_g = 18 + i*10`（组数超过步长容量时按容量收窄）；
  每段与任何 `.gw-progress-task` 矩形不相交（0.5px 内缩）；stub 从 `x_g` 到卡片实际左边缘、
  y 等于卡中心；三角箭头顶点落在卡左边缘且朝右（底边在 `tip-8`）；各组的通道 x 与车道 y 互不相同。

## 结果（1440px 视口）

| 用例 | 卡片左边距 | padding-left | 卡片宽 | 组数 | 折线 | 交叉 |
| --- | --- | --- | --- | --- | --- | --- |
| A 三 owner | 40 | 40px | 1388 | 3 | `M241 88 L241 92 L18 92 L18 132` / `M446 88 L446 100 L28 100 L28 182` / `M651 88 L651 108 L38 108 L38 232` | 0 |
| B 12 卡同组 | 40 | 40px | 1388 | 1 | `M446 88 L446 92 L18 92 L18 670`（覆盖 120…670 全部卡中心） | 0 |
| C 仅检查 | 40 | 40px | 1388 | 1 | `M651 88 L651 92 L18 92 L18 120` | 0 |
| E 仅执行 | 40 | 40px | 1388 | 1 | `M446 88 L446 92 L18 92 L18 120` | 0 |
| D 四 owner | 40 | 40px | 1388 | 4 | 通道 18/24/30/36，车道 92/100/108/116 | 0 |
| F 两组三卡 | 40 | 40px | 1388 | 2 | 执行 `…L18 92 L18 174`（两卡 124/174）、检查 `…L28 100 L28 224` | 0 |

对照 motiv 的 recon 实测（改前）：1440 下 `--gw-wire-pad=681`、卡宽 747；`owner=answer` 时 pad 1091。
现在左边距与 owner 无关、恒 40px，卡宽 1388。760px 下同样恒 40px（改前 390 → 卡宽 358）。
C（仅检查）与 E（仅执行）卡片左边缘都是 40，这就是「与 owner 无关」的直接证据。

## 窄屏与退化

- 480px 视口：`.gw-progress-wires` computed `display: none`，`.gw-progress-tasks` 的
  `padding-left` 为 `12px`、`margin-top` 为 `12px`（A/B/C/D/E/F 全一致）。
- 无 layout 宿主（jsdom、零宽列）：`measureProgressWires` 返回 `EMPTY_PROGRESS_WIRES`，
  `paths` 为空 → 不渲染 `<svg>`，不产生任何假坐标；卡片仍落在 40px 常量左栏。
- 找不到 owner 圆环时（`anchor` 为空）整组跳过：没有量到起点就不画箭头。

## 脊椎与卡片内容

- `lib/client.js`（本次构建）跑 `.rsi/evidence/spine-parity-2026-11-21-harness.html?w=1440`：
  7 段、`distinctTops=[85]` 单行、`flex-direction: row`、无横向溢出；12 计划任务仍是 7 段 + 12 卡。
  与改前一致（该 harness 的对照记录见 `spine-parity-2026-11-21.md`）。
- `ProgressTaskCard` 未动（`git diff src/client/index.js` 里没有该函数的任何 hunk）。

## 命令与结果

| 命令 | 结果 |
| --- | --- |
| `timeout 120 node scripts/build-client.mjs` | `266237 bytes → lib/client.js`，`cmp` 与 src 逐字节相等 |
| `timeout 300 npm run typecheck` | 通过 |
| `timeout 120 npx oxlint src/client/index.js` | 0 error（7 个既有 warning，均不在本次改动行） |
| `timeout 300 npm run verify:lib` | `lib/ at c2cfbb6 is the build of src/ at c2cfbb6`（HEAD 配对未受工作区影响） |
| `timeout 900 npm test` | 78 文件 / 1449 测试 PASS |
| `timeout 300 python3 .rsi/evidence/fixed-gutter-2026-11-22.py 1440 760 480` | `problems: 0`（6 用例 × 3 视口） |

## 已知取舍

1. **组数超过通道容量时步长收窄**：通道 `18 + i*10` 在 3 组时是 18/28/38；4 组若照搬公式会到 48，
   落进卡片（左边缘 40）。所以 `channelStep = min(10, floor(20 / (组数-1)))`，4 组变 18/24/30/36，
   仍在栏内且互不相同；车道 `4 + 8*i` 不变。
2. **顶边距随组数增长**（12 → 12/16/24/32）：折线要先在脊椎下方走各自车道，车道必须在首卡之上，
   否则横段会横穿首卡。水平方向不动，这是「带子随 owner 右移」被消除后仅剩的位移，且按组数而非按 owner。
3. `docs/knowledge/HANDOFF.md:74-75` 的「统一内距」取舍与
   `docs/knowledge/evidence/progress-tab-two-track-2026-11-21/README.md:24` 的 `--gw-wire-pad` 说明
   已被本次实现取代，需要记忆/文档任务更新（本任务写域只有 `src/client/index.js`，未改）。
