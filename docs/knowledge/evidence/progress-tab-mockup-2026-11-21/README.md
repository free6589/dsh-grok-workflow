# 进度 Tab 候选图型效果图（2026-11-21）

设计依据：[`docs/knowledge/DESIGN-progress-tab.md` §15](../../DESIGN-progress-tab.md)。
本目录只有效果图，**没有改动任何源码或测试**：`mockup.html` 是独立页面，按现有
token 名与几何（28 px 状态环、13 px 正文、18 px 连接线、1 px `--dsw-alias-border-l2`）
重画候选版式，不加载 `src/client/index.js`。

## 图中画了什么

| 图元 | 对应 §15 的候选 | 位置 |
| --- | --- | --- |
| 顶部按 `outcome` 分色的结算条 + 图例 | D 结算堆积条 | header 下方 |
| 「流程」带：固定 7 段脊椎 | A 双带拆分（上带） | 第一条轨道 |
| 每段 label 下方 3 px 时长条 | B 段内耗时条 | 上带每段 |
| 「任务」带：计划任务 chip，换行不滚动 | A 双带拆分（下带） | 第二条轨道 |
| 展开面板里 执行 → 检查 的竖向连接与缩进 | C 执行/检查配对 | 底部面板 |

数字（7/11 · 64%、各段耗时、任务名）是**演示数据**，不来自任何真实运行；页面底部
已标注这一点。

## 可点击版本

`flow.html` 是可交互的效果图：上面 7 个阶段横排一行，`执行` 下方垂一根竖线，8 个任务挂在这根线上。

- 任务卡本身不可点（点空白处什么都不发生）；卡里的「执行」「检查」小胶囊是跳子会话的入口，
  hover 显示目标 child。
- 效果图里胶囊是占位链接（`#child-<id>`），实现时换成 `openChild(childId)`。
- 深色：`flow.html?theme=dark`。

## 重画


```text
node shot-flow.mjs   # flow.html：浅色 / 深色
node shot.mjs
→ mock-light-1440.png  (1440×790 @2x)
  mock-dark-1440.png   (1440×790 @2x, ?theme=dark)
  mock-light-760.png   (760×900 @2x)
```

`shot.mjs` 用本机 Playwright 缓存的 Chromium
（`~/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`）headless 截图，
`--user-data-dir` 落在本目录 `udd/`。直接改 `mockup.html` 即可，不需要构建。

## 边界

- 这不是验收证据，不证明任何实现可运行；它只回答「版式长什么样」。
- 760 px 版本按真实 CSS 的断点（≤720 环上 label 下、≤480 竖排）**没有**复刻，
  本图只示意双带在窄屏的换行行为。
- 真实 UI 与效果图在窄屏的差异、以及「单行横排」结论的宽度范围，见
  [`RESPONSIVE.md`](RESPONSIVE.md)。
