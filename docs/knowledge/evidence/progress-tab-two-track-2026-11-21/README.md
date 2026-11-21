# 进度 Tab 双带布局：真机几何证据（2026-11-21）

目标图：[`../progress-tab-mockup-2026-11-21/flow.html`](../progress-tab-mockup-2026-11-21/flow.html)。
实现：`src/client/index.js` 的 `ProgressView` / `ProgressNode` / `ProgressTaskCard` / `measureProgressWires`。
本目录只放可复算的证据，不放结论。

## 怎么复算

```text
node make-page.mjs      # 用真实 bundle 生成 page.html（假 React，真 DOM/真样式表）
node run.mjs            # 9 个场景×宽度跑几何，截 2 张图 → geometry.txt
```

Chromium 用本机 Playwright 缓存：`~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`。
每次启动用一次性 `--user-data-dir`：共用 profile 时 `file://` 文档会走缓存，第二个场景会悄悄渲染第一个场景的 fixture（本轮踩到过，`run.mjs` 里有注释）。

窄于 500 px 的视口用同源 iframe 承载（Chrome 窗口最小 500 px），媒体查询看到的是 iframe 自己的视口。

## `geometry.txt` 里读什么

| 行 | 断言的是 |
| --- | --- |
| `spine:` | 7 段、`single-row`（≥500 px）或 `stacked`（≤480 px）；段 key 顺序即 `PROGRESS_STAGES` |
| `band:` | 卡片数、是否在脊下方、`--gw-wire-pad` 实际值 = 第一条卡片左边距 |
| `cards:` | 每张卡的 `data-owner`（挂在哪条段线上）、每颗胶囊的 `seq:state:childId` |
| `wires:` | 干线与支线的 `d`，坐标相对 `.gw-progress-flow`：干线 x = 该段圆环中心 x，支线 y = 卡片中线 y，支线终点 = 卡片左边 |
| `settle:` | 结算条图例与各段像素宽（宽度是计数占比，不是估算） |
| `removed=` | 跳失败按钮 / 分支面板 / 成员卡 / `+N` / 详情卡 / 缩放 / 重试 / 复制 全部为 0 |
| `inertClicks=` | 点阶段 + 点卡片空白：`openedDelta:0`，DOM 未变 |
| `pills=` | 逐颗点开：`targets` 与 `opened` 同序，每颗打开自己的 childId |

关键实测（1440 px, `mixed` fixture）：脊 `y=64` 单行 7 列；`execute` 圆环 `x=432,w=28` → 干线 `M446 86 L446 220`；两张 `execute` 卡片 `y=218/282` → 支线 `y=170/220`（相对坐标）指向卡片左边 `x2=476→681`。

## 图

- `two-track-1440.png` — `mixed` 场景（规划/执行/检查三段各有卡片，含运行中虚线与 `执行 → 检查` 迷你箭头）。
- `two-track-760.png` — `running` 场景，断点收窄后标签仍不截断、无横向滚动。

截图不是直接截运行中的页面：headless 截图在第一帧就落盘，那时连线还没收敛。`run.mjs` 先把**收敛后的 DOM** dump 成 `static-*.html`（只取 `#host` 子树，丢掉 bundle 脚本，否则静态页会自己重渲染成默认 fixture），再用真样式表截图。

## 边界（`NOT_RUN` / 不属于本证据）

- 没有在真实 DSH GUI 里截图：本目录证明的是 bundle + 样式表在 Chromium 里的布局与交互，不证明宿主挂载。
- 没测 Firefox / Safari，没测 200% 浏览器缩放，没测 CJK fallback 字体以外的字体族。
- `mixed`/`running`/`failed`/`done` 是测试 fixture（`make-page.mjs` 里手写的 `tool-workflow/*` 事件），不是任何一次真实运行的记录。
