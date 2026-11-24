# 进度页任务卡：整名显示 + 运行中时间（Q10 b，2026-11-22）

结论：CONFIRMED（本机实测，真实构建产物 `lib/client.js`，headless Chromium）。

## 怎么测的

- 渲染器：`.rsi/evidence/progress-card-q10b-2026-11-22-harness.html`，由
  `.rsi/evidence/spine-parity-2026-11-21-harness.html` 的 React 替身派生（真实 DOM，
  布局/媒体查询/getBoundingClientRect 全由浏览器回答），数据换成两行：
  一行 42 字长任务名（已结算），一行无 `endedAt` 的运行中任务。
- 浏览器：`~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome --headless=new
  --disable-gpu --no-sandbox --hide-scrollbars --user-data-dir=/tmp/cq10b2
  --virtual-time-budget=4000 --dump-dom file://<harness>`
- 原始测量：`.rsi/evidence/progress-card-q10b-2026-11-22.json`

## 结果

| 视口 | 任务名 | 名字是否被裁 | 名字高 | 卡片高 | 时间 |
| --- | --- | --- | --- | --- | --- |
| 1440 | 42 字 | 否（scrollWidth==clientWidth，text-overflow: clip） | 16.19（1 行） | 40 | 3.0 s（已结算，实测） |
| 760 | 42 字 | 否 | 32.38（2 行） | 46.38 | 3.0 s |
| 420 | 42 字 | 否 | 48.56（3 行） | 90.56 | 3.0 s |
| 1440/760/420 | 运行中行 | 否 | 16.19 | 40/40/62 | 5.0 / 5.0 / 5.1 s（无 endedAt，用面板时钟算） |

- 名字里没有 `…`（`nameHasEllipsisChar=false`），三档宽度都没有横向溢出。
- 运行中行的时间非空且随渲染时钟变化（5.0→5.1 s），结算行保持实测 3.0 s。
