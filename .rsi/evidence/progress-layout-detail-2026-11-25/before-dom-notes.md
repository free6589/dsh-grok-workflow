# Baseline DOM: progress page hooks (installed build 0.13.39, isolated soak instance)

Measured on the baseline build packed from the **main checkout** (`sha256(lib/client.js)` =
`38702aa1e50bb483ecdddeba0050632dc627b874eee05958c57f17071063fa6c`, 334321 bytes), one real
workflow run, three states. Counts are `document.querySelectorAll(...).length` taken by the same
probe that wrote each `innerText` capture (`driver/drive.py`, the `PROBE` hook list).

## Hook inventory per state

| hook | waiting | running | done | what it is |
| --- | --- | --- | --- | --- |
| `[data-gw-progress]` | 1 | 1 | 1 | the page |
| `[data-gw-progress-chip]` | 1 (`waiting`) | 1 (`running`) | 1 (`done`) | the five-state chip |
| `[data-gw-progress-guardian]` | **1** | **1** | **1** | the guardian block — present in the baseline |
| `[data-gw-progress-plan-row]` | 0 | 2 | 2 | one row per plan task |
| `[data-gw-progress-log-row]` | 0 | 2 | 9 | one row per call / summary draft |
| `[data-gw-progress-columns]` | **0** | **0** | **0** | **no columns wrapper: there is no `[data-gw-progress-main]` / `[data-gw-progress-side]` either** |
| `[data-gw-progress-plan-toggle]` | **0** | **0** | **0** | **no per-row fold toggle** |
| `[data-gw-progress-log-toggle]` | **0** | **0** | **0** | **no 展开全部 / 收起 control** |
| `[data-gw-progress-task-detail]` | **0** | **0** | **0** | **no opened-row panel** |

That is the red side of the layout change: the guardian is drawn, and it is drawn as one more
stacked section in a single column — nothing to fold, nothing to open.

## Single column, measured (`driver/measure.py`, done state, viewport 1500×1600)

`[data-gw-progress]` is `display: flex` (`grid-template-columns: none`, `overflow-x: visible`) at
x=280, w=1213, h=964, and every section it holds starts at the same x and spans the same width:

| child | x | width | y |
| --- | --- | --- | --- |
| `[data-gw-progress-bar]` | 280 | 1213 | 76 |
| `.gw-progress-now` | 280 | 1213 | 124 |
| `[data-gw-progress-steps]` | 284 | 1205 | 227 |
| `[data-gw-progress-plan-section]` | 280 | 1213 | 249 |
| `[data-gw-progress-log-section]` | 280 | 1213 | 398 |
| `[data-gw-progress-final-section]` | 280 | 1213 | 759 |
| `[data-gw-progress-guardian]` | 280 | 1213 | 845 |
| `[data-gw-progress-dock]` | 280 | 1213 | 958 |

`document.documentElement.scrollWidth` 1500 = `innerWidth` 1500: no horizontal overflow.

## Page copy at the three states (the page's own words)

- waiting: `任务团队 · 2 个任务` / `等你点头` / `正在拆活` + `开工`, with the guardian block already
  present (`Guardian 监控` / `监控中` / `子任务存活判断预算 · 7200 秒` / `0 条处置记录`).
- running: `进行中` / `任务 1 · 写 notes.md 安装步骤` / `执行 正在看 · 第 1 步，共 2 步` /
  `后面还有：任务 2 · 写 test.txt hello` / `要干的 2 件事` / `经过` / `交卷`(`这一轮没有交卷稿`).
- done: `已完成` / `做好了` / `2 步全过` / `执行 → 检查 → 复核` on both rows / 9 history lines ending
  in `汇总·第3稿（定稿）` / `收下这版`.
