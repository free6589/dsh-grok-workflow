# 进度页 UI 展示缺陷 — 复现与修复证据（2026-11-21）

状态：`CONFIRMED`（Chromium 实测几何 + 截图；单测与 `npm run ci` 实跑）。
修复前基线：`0eb5d8f`（`main`，0.12.15）。修复落在 `7496ae4` 与 `660d79d` 两个提交里
（被同轮并发提交一并扫入，代码与测试都在其中）。

## 1. 用户可见症状

打开会话的「进度」Tab，**只要有一次运行正在进行（`doing`）或失败（`failed`）**，轨道就散架：

- 七个阶段只剩一排竖线和零散字形（`✓`、`▸`、`×`），**没有任何阶段名**；
- 状态环是空的：一个 8–9×17–19 px 的内联 span，`border-top-width: 0px`，状态色只写进了
  一个不存在的边框上；
- 展开阶段的成员卡片变成一条横跨整行的面板，把轨道挤到 21 px 一列（1200 px 宽度下）。

修复后同一会话（1200 px）：七个阶段等分、环 28×28/2 px、阶段名可见，成员面板落在脊柱
下方并独占整行。

## 2. 根因（三处，`0eb5d8f` 的行号）

| # | 根因 | 位置（修复前） |
| --- | --- | --- |
| A | 展开阶段的成员分支被塞进**横向** `.gw-progress-track` 的 flex 行里，且带 `width: 100%`。它是 flex 子项，宽度从各 segment 身上抢，于是每个 segment 被压到 21 px，label 计算宽度 0。默认展开（`doing` 优先）意味着**运行中必然触发**。 | `src/client/index.js:3192`（`trackChildren.push({kind:'branch', …})`）、`:3310`（在 track 内渲染）、`:2846`（`width: 100%`） |
| B | `.gw-progress-ring` / `.gw-progress-glyph` **完全没有基础样式**：只有 `prefers-reduced-motion` 里引用过它。29×28 的环变成 0 尺寸内联 span，`borderColor` 写在无边框元素上，状态色与 `pending` 的空心环全部不可见。 | 缺失；唯一引用在 `:2908`（reduced-motion） |
| C | 每个 segment 内的 `top: 23px` 横线画在**透明**的 head 后面，会横穿环与 label；同时它与 `align-self: center` 的连接线（`:2879`）不在同一高度，形成两条错位的轴线。 | `:2819`、`:2879` |

附带：`跳转到首个失败` 按钮原本也是 flex 行内的一项（`0eb5d8f` 的 `ProgressView`），
会把整行再挤掉一列。

## 3. 修复（`src/client/index.js`，HEAD）

- 分支移出脊柱：`trackChildren` 只产出 segment 与连接线（`:3245`），打开的阶段单独渲染成
  轨道下方的面板（`:3386`），`data-state` 挂在面板上（`:3390`），stem 颜色按面板状态走。
- 环补齐几何：28 px、2 px 边框、`border-radius: 50%`（`:2852`），`pending` 因此显示空心环；
  环的 `borderColor` 与 `color` 同源（`PROGRESS_STATE_COLOR`），运行中脉冲由 CSS 负责（`:2856`）。
- 一条轴线：删掉 segment 内横线，连接线压到环心 `margin-top: 13px`（`:2913`），并新增
  `data-flowing`（`:3374`、`:2916`）表达「正跑向下一段」，`done` 仍只填 `filled`。
  reduced-motion 同时停掉脉冲与流动虚线（`:2947`）。
- head 改为可换行（`flex-wrap: wrap`），窄列时环叠到 label 上方（`:2948` 的 720 px 断点），
  label 不会再被压成 0；meta 行带 `title`，被省略号截断时仍可读。
- 空阶段打开时，面板写同一句说明而不是空盒子（`:3414`，`progressNodeMeta` 抽取到 `:2999`）。
- `跳转到首个失败` 移到轨道上方（不再是 flex 行内项）。
- 480 px 以下：连接线随竖排一起隐藏（`:2959`），面板收边距（`:2969`）。

样式仍全部走 `--dsw-alias-*` / `--dsw-font-*` token，无字面色值、无新依赖。

## 4. 复现步骤（可重复）

```bash
# 1) 页面：把真实 client bundle 放进 Chromium，用最小 React 兼容层渲染，
#    CSS 由浏览器真实排版（不是 jsdom）。
node docs/knowledge/evidence/progress-tab-ui-fix-2026-11-21/make-page.mjs \
  --source <某个版本的 src/client/index.js> --out /tmp/gw-progress-page.html

# 2) 截图（scenario = empty|loading|running|done|failed|longtext；w = 容器宽度）
~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome \
  --headless=new --disable-gpu --no-sandbox --user-data-dir=/tmp/gw-udd \
  --window-size=1200,900 --hide-scrollbars \
  --screenshot=/tmp/after-running-1200.png \
  "file:///tmp/gw-progress-page.html?scenario=running&w=1200"

# 3) 几何断言（48 个用例：6 个场景 × 8 个宽度，含一次点击展开）
node docs/knowledge/evidence/progress-tab-ui-fix-2026-11-21/check.mjs /tmp/gw-progress-page.html after
```

`make-page.mjs --source` 指向 `git show 0eb5d8f:src/client/index.js` 写出的文件，就是
「修复前」页面；指向工作树文件就是「修复后」页面。两者用同一个页面壳、同一批 fixture、
同一套 token 值，差别只有 bundle 本身。

## 5. 几何断言（客观口径）

每个用例检查：轨道无横向溢出、每个 segment 的 head 与 label 宽度 > 0、环存在且 ≥20 px 且
有边框、segment 之间不重叠、分支不宽于根、详情浮层不横向溢出。

| 版本 | 用例 | 结果 |
| --- | --- | --- |
| 修复前（`0eb5d8f`） | 48 | **FAIL**，40 个用例 / 884 条问题（`geometry-before.txt`） |
| 修复后（HEAD） | 48 | **PASS**，0 条问题（`geometry-after.txt`） |

修复前唯一通过的是 `empty`（空态没有轨道）。`loading@1440` 就已经是 `minSegment=20,
minLabel=0, rings 0/8`。

## 6. 文件清单

| 文件 | 内容 |
| --- | --- |
| `before-*.png` / `after-*.png` | 同名场景的前后截图：`running@1200`、`running@760`、`running@390`、`longtext@760`、`failed@900`、`detail@760`（点开阶段）、`empty@900` |
| `geometry-before.txt` / `geometry-after.txt` | 48 用例的几何表与逐条失败原因 |
| `red-probe.txt` | 同一组结构事实在 `0eb5d8f` 与工作树上的取值（四条全部翻转），证明新增单测在修复前必红 |
| `ci.txt` | `npm run ci` 全量输出（exit 0） |
| `make-page.mjs` / `check.mjs` / `red-probe.mjs` | 上述页面、断言与探针脚本 |

截图下方附带的 `<pre id="diag">` 就是该次渲染的实测几何，和 `geometry-*.txt` 同一份数据。

## 7. 未覆盖（`NOT_RUN`，不冒充）

- 真机 DSH Web 组合里的手点验收（本机 `:3080` 现有会话没有本插件写的 `tool-workflow/*`
  运行，需要先跑一次真实工作流）。本证据的边界是「真实 bundle + 真实 CSS + 真实排版」，
  不是真实 DSH 面板。
- `blocked` 详情浮层在 480 px 以下抽屉形态的独立截图（几何断言覆盖了溢出，未单独出图）。
- 用户偏好主题的视觉比对（样式只用 token，未新增字面色值）。
