# 图例第五句描边兜底（legend-fallback）烘焙证据

- 分支：`fix/legend-fallback`，基线 `a9d0537`（= `main` = `origin/main`）。
- 改动：`src/client/index.js` 图例 pending 描边加嵌套兜底，`lib/client.js` 重建逐字节一致，`test/progress-panel.spec.ts` 加一条守卫。
- 烘焙方式：静态 HTML 离线烘焙（stub React + `__ModuleLoader__` 读 bundle 的 `GROK_WORKFLOW_PROGRESS.css`，拼五句图例，同源 CSS 注入），系统 chromium 读 DOM 计算样式。
- PNG：本沙箱内 `Page.captureScreenshot` 报 `Protocol error: Unable to capture screenshot`，截图 `BLOCKED`；以 DOM 读数 + 规则文本为证（见下）。

## 读数（`legend-readings.json`）

- `boxShadow`: `rgb(255, 255, 255) 0px 0px 0px 1px inset` —— 描边真实画出（白色系 Canvas 兜底生效）。
- `background`: `rgba(0, 0, 0, 0)` —— 圆心保持透明（空心暗点语义不变）。
- 五句话逐字：`亮线：走过的线 / 暗线：没走的线 / 六点：六环，走完六个阶段 / 五点：五验，通过五道验收 / 暗点是还没跑到，不是没过`。
- `cssRule`: `.gw-progress-legend-dot[data-state="pending"] { background: transparent; box-shadow: inset 0 0 0 1px var(--dsw-alias-state-idle-primary, var(--dsw-alias-label-primary, Canvas)); }`

## 文件

- `legend-fallback.html`：烘焙用静态页（含同源 CSS 与五句图例）。
- `legend-readings.json`：DOM 读数 + 规则文本（本轮证据主体）。
- `legend-tree.json`：`hasLegendCss: true, hasFallback: true`（bundle 自检）。
