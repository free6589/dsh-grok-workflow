# 窄屏行为与效果图的适用范围（2026-11-21）

回答一个遗留待确认项：真实进度页在 ≤480 px 怎么排，`flow.html` 效果图在同样宽度怎么排，
以及「七段主干横排一行、与稿一致」这条结论到底在哪个宽度成立。

结论先行：

- 真实 UI 在 ≤480 px 把主干折成竖排 step list（7 行），效果图在任何宽度都保持横排一行。
  两者在手机宽度上形态不同。
- 实测单行横排的下界是 481 px。效果图对照截图取 760 px 与 1440 px，因此对齐结论按
  **≥760 px** 表述，不覆盖手机宽度。
- 本轮只记录行为，没有改动任何响应式 CSS。

## 1. 真实源码的断点

`src/client/index.js:2890-2891`：

```js
'@media (max-width: 480px) {',
'  .gw-progress-track { flex-direction: column; }',
```

同一个块（2890-2901）里还有：段间连接线与 SVG 连线一起隐藏（`src/client/index.js:2899`），
段改为左侧 2 px 竖线并按状态着色（2892-2898），任务带内距收到 12 px（2900）。

上一级断点在 `src/client/index.js:2880-2885`：≤720 px 收紧段内距、连接线宽度 18→10 px，
`.gw-progress-seg-head` 由横排改竖排（环在上、label 在下）。这一级不改变行数，主干仍是单行。

构建产物与源码一致：`lib/client.js:2890-2891` 是同一行同一内容。

## 2. 实测真实 UI 的行数

方法：把 `src/client/index.js` 里的 `PROGRESS_CSS`（109 行）抽出来灌进一个最小页面，
用本机 Playwright 缓存的 Chromium（`~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`）
headless 渲染。headless 窗口有 500 px 最小宽度，≤500 px 的读数改用固定宽度 iframe 提供视口。
读数取 `.gw-progress-track` 的 `flex-direction`，以及各段 `getBoundingClientRect().top`
的去重数（行数）。

| 视口 | flex-direction | 行数 | 连接线 | SVG 连线 | seg-head |
| --- | --- | --- | --- | --- | --- |
| 360 | column | 7 | none | none | column |
| 400 | column | 7 | none | none | column |
| 480 | column | 7 | none | none | column |
| 481 | row | 1 | list-item | block | column |
| 640 | row | 1 | list-item | block | column |
| 720 | row | 1 | list-item | block | column |
| 760 | row | 1 | list-item | block | row |
| 1440 | row | 1 | list-item | block | row |

形态切换落在 480/481 之间，与 `max-width: 480px` 一致。481-720 之间主干仍是单行，
但 head 已按 720 规则竖排，与 760 px 截图里的横排 head 不同。

## 3. flow.html 没有任何媒体查询

- 全文 `@media` 计数为 0；`media` 这个词在 378 行的文件里出现 0 次。
- Chromium 读 CSSOM：该页唯一样式表的 `CSSMediaRule` 数量为 0，在 360 / 480 / 760 / 1440
  四个宽度下读到的都是 0。
- 脚本里唯一与宽度相关的是 `flow.html:374` 的 `addEventListener('resize', draw)`，
  它重画 SVG 连线，不做版式分支。

因此效果图在窄屏不会换形态：`.gw-track` 是 flex 行（`flow.html:47`），段是
`flex: 1 1 0; min-width: 0`（`flow.html:48-52`），只会被压窄，不会折行。

实测（同样用 iframe 视口）：

| 视口 | flex-direction | 行数 | 段宽 | 文档滚动宽 |
| --- | --- | --- | --- | --- |
| 360 | row | 1 | 30 | 416（大于 360，横向溢出） |
| 480 | row | 1 | 48 | 480 |
| 760 | row | 1 | 88 | 760 |
| 1440 | row | 1 | 185 | 1440 |

## 4. 结论的适用范围

「七段主干横排一行、与稿一致」按 **≥760 px** 表述：

- ≥760 px：真实 UI 与效果图都是单行，head 都是横排，对齐成立。
- 481-720 px：真实 UI 单行但 head 竖排，效果图没有这个形态，未做对照。
- ≤480 px：真实 UI 竖排 7 行并隐藏连线，效果图仍横排单行且会横向溢出，形态不同。
  此处不宣称对齐。

手机宽度下的进度页从未与任何设计稿比对，因为 `flow.html` 没有画这个形态
（`README.md` 的「边界」一节已写明 760 px 版本没有复刻 720 / 480 断点）。

## 5. 未做

- 真机 DSH Web 面板里拖窄窗口手测：`NOT_RUN`。上面的读数是同一份 CSS 在 Chromium 里的
  计算结果，不是 GUI 截图。
- 481-720 px 之间 head 竖排形态的视觉评审：`NOT_RUN`，不在本轮对照范围内。
