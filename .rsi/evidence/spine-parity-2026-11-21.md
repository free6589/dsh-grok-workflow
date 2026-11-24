# 七段进度主干与 flow.html 稿的核对（2026-11-21）

结论：三项验收条件全部通过（CONFIRMED，本机实测）。渲染对象是真实构建产物
`lib/client.js`，不是效果图本身；对照源是
`docs/knowledge/evidence/progress-tab-mockup-2026-11-21/flow.html`。

## 怎么测的

- 渲染器：`.rsi/evidence/spine-parity-2026-11-21-harness.html`（本次核验的完整副本）。
  它在页面里补一个 `window.__ModuleLoader__` 壳、一个最小的 React 替身（`createElement`
  直接调函数组件，`useState`/`useRef`/`useMemo`/`useEffect`/`useSyncExternalStore` 按调用
  顺序存槽），把组件返回的元素树落成真实 DOM，并把组件自带的 `PROGRESS_CSS` 一起渲染，
  然后反复重渲到状态不再变化（连线效应会改任务带缩进，所以至少两遍）。布局、媒体查询、
  `getBoundingClientRect` 全部由浏览器回答。
- 浏览器：`~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`，
  `--headless=new --disable-gpu --no-sandbox --hide-scrollbars --dump-dom`
  （截图用 `--screenshot`）。
- 数据：11 行（规划 1 / 执行 8 含 1 失败 / 检查 2 含 1 未结束）；另加一份 12 个计划任务的
  run 验证“主干是模板不是计划”。
- 效果图侧：把 `flow.html` 复制到 `.tmp` 后追加一段测量脚本（**未改原文件**），
  逐宽度设 `body` 宽度后量 `.gw-seg`。

## 结果（1440 px 视口）

| 项 | 真实 UI | flow.html |
| --- | --- | --- |
| 段数 | 7 | 7 |
| 顺序/文字 | 起点 / 规划 / 执行 / 检查 / 汇总 / 回答 / 终点 | 同左（逐字符串相等） |
| 段 top | 全部 84.8 | 全部 155 |
| 段高 | 74 | 74 |
| 段宽 | 187 × 6 + 186 | 184.7 × 6 + 183.72 |
| 轨道宽 | 1440，`scrollWidth == clientWidth`（无横向溢出） | 1440 |
| 主干底 / 任务带顶 | 162.8 / 174.8（带在主干下方，间距 12） | 253（间距 18） |
| 主轴 | `flex-direction: row` | `row` |

段键：`stage:start, stage:plan, stage:execute, stage:verify, stage:synthesize,
stage:answer, stage:end`——没有 `phase:*` 混进主干。

## 逐宽度（真实视口，`?w=` 与 `--window-size` 一致）

| 视口 | 段数 | 单行 | top 集合 | 主轴 | 横向溢出 |
| --- | --- | --- | --- | --- | --- |
| 1440 | 7 | 是 | {85} | row | 无 |
| 1024 | 7 | 是 | {85} | row | 无 |
| 800 | 7 | 是 | {85} | row | 无 |
| 760 | 7 | 是 | {85} | row | 无 |
| 759 | 7 | 是 | {85} | row | 无 |

容器宽度扫描（视口固定 1600，只改容器宽 1440→420）同样 7 段单行、无溢出。

计划任务压力测试（12 行 `任务 n · 步骤`，`stopReason=completed`）：主干仍是 7 段、单行，
任务带 12 张卡，1 根主干线 + 12 根分支，全部挂在 `执行` 段（`data-owner="stage:execute"`）。

## 与稿的差异（不在本次验收范围内，据实记录）

1. 轨道左右内边距：实现 `10px 12px 4px`，稿 `12px 20px 6px` → 段宽 187 vs 184.7。
2. 主干与任务带间距：实现 12 px，稿 18 px。
3. 760 px 时实现把 `执行` 的 label 折到状态环下面（`.gw-progress-seg-head` 允许换行），
   段高 119；稿用 `white-space: nowrap` + 省略号保持 75。文字本身相同，只是窄屏排布不同。
4. 窄屏：headless 窗口被钳在 500 px（探针：请求 420 → `innerWidth=500`），所以窄视口用
   定宽 iframe 提供（`spine-parity-2026-11-21-harness-narrow.html`，
   `--allow-file-access-from-files` 让父页读得到子页的测量结果）。实测：

   | iframe 视口 | 主轴 | 行数 | top 集合 |
   | --- | --- | --- | --- |
   | 520 | row | 1 | {85} |
   | 500 | row | 1 | {85} |
   | 481 | row | 1 | {85} |
   | 480 | column | 7 | {85,182,279,410,507,604,701} |

   即单行横排的下界是 481 px，≤480 按 `@media (max-width: 480px)` 折成 7 行竖排，
   段数与文字不变。验收要求的 ≥760 px 落在单行区间内；手机宽度与稿（稿无媒体查询、
   始终横排）形态不同，这是已知且已记录的行为差异。

## 其它事实

- `lib/client.js` 与 `src/client/index.js` 字节相同（`cmp` 通过，
  sha256 `96c6b191a3cbd35a73bcb3694182db3ebbfd614b3290110c71a565ddab473cc6`）。
- 工作树有一处非本次改动：`test/client.spec.ts` +90 行（未提交）。`npx vitest run
  test/client.spec.ts` → 114 tests passed。
- 本次核验没有改任何 UI 代码。

## 复现

```bash
CHROME=$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome
$CHROME --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
  --user-data-dir=/tmp/spine-udd --window-size=1440,3200 --virtual-time-budget=6000 \
  --dump-dom "file://$PWD/.rsi/evidence/spine-parity-2026-11-21-harness.html?w=1440"
```

窄视口（<500 px）改用 iframe 版：

```bash
$CHROME --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
  --allow-file-access-from-files --user-data-dir=/tmp/spine-udd-n \
  --window-size=1600,2200 --virtual-time-budget=8000 \
  --dump-dom "file://$PWD/.rsi/evidence/spine-parity-2026-11-21-harness-narrow.html"
```

（iframe 版引用同目录的 `...-harness.html`，两文件需放在一起。）

数据与截图同目录：`spine-parity-2026-11-21.json`、`...-ui-1440.png`、`...-ui-760.png`。

设备=agent-35，时间 2026-11-21
