# Feature DOM: progress page hooks (installed build `feat-progress-layout-detail`, isolated soak instance)

One real workflow run of the same kind as the baseline capture. Counts are
`document.querySelectorAll(...).length` from the probe that wrote each capture
(`driver/drive-after.py`), plus the computed layout facts read in the same page
(`driver/probe-after.py`). Installed identity: version read back `0.13.39`,
`sha256(lib/client.js)` = `5745b15c379d28e99d1536cefce90154d3ebcc5d9d5c7d2a9c7b991ab6fced3a`,
347526 bytes.

## Hook inventory per capture

| hook | waiting | running | done | detail-open | fold-open | narrow 700 | 
| --- | --- | --- | --- | --- | --- | --- |
| `[data-gw-progress]` | 1 | 1 | 1 | 1 | 1 | 1 |
| `[data-gw-progress-chip]` | 1 | 1 | 1 | 1 | 1 | 1 |
| `[data-gw-progress-guardian]` | **0** | **1** | **1** | **1** | **1** | **1** |
| `[data-gw-progress-columns]` | **0** | **1** | **1** | **1** | **1** | **1** |
| `[data-gw-progress-main]` | 0 | 1 | 1 | 1 | 1 | 1 |
| `[data-gw-progress-side]` | 0 | 1 | 1 | 1 | 1 | 1 |
| `[data-gw-progress-guardian-blocks]` | 0 | 1 | 1 | 1 | 1 | 1 |
| `[data-gw-progress-guardian-block]` | 0 | **4** | **4** | 4 | 4 | 4 |
| `[data-gw-progress-plan-row]` | 0 | 2 | 2 | 2 | 2 | 2 |
| `[data-gw-progress-plan-toggle]` | 0 | **2** | **2** | 2 | 2 | 2 |
| `[data-gw-progress-task-detail]` | 0 | **0** | **0** | **1** | 1 | 1 |
| `[data-gw-progress-log-row]` | 0 | 2 | 8 | 11 | 11 | 11 |
| `[data-gw-progress-log-toggle]` | 0 | 0 | **1** | 1 | 1 | 1 |
| `[data-gw-progress-log]` | 0 | 1 | 1 | 1 | 1 | 1 |

Readings worth stating exactly:

- **The waiting instant has no columns and no guardian.** At `等你点头` (`10-waiting.txt`, 15.84 s
  after the send) the page carries only the run title, the chip and the dock: `guardian 0`,
  `columns 0`. The two-column layout appears with the first declared call (`running`, 16.22 s).
  The dispatcher's rule "columns = 1 whenever the run recorded a guardian" holds: guardian 0 and
  columns 0 at waiting, guardian 1 and columns 1 from `running` on.
- **`log-row` is 8 at `done`, 11 once a row is opened.** This run's finished page carries eight
  history lines (two 执行, two 检查, two 复核, `汇总·第1稿`, `汇总·第2稿`); the baseline run carried
  nine. The three extra `log-row` elements after opening a task row are that row's own lines,
  which carry the same hook. `08` is a property of this run, not of the page.
- **`task-detail` 0 while closed, 1 after the click.** First toggle: `aria-expanded` `false` →
  `true`, `aria-controls="gw-progress-task-detail-0"`; second: `false`,
  `aria-controls="gw-progress-task-detail-1"`.
- **Fold:** `[data-gw-progress-log-toggle]` label `展开全部` (`aria-expanded="false"`) →
  `收起` (`aria-expanded="true"`), `aria-controls="gw-progress-log-list"`.

## Guardian tiles (`[data-gw-progress-guardian-block]`, done state)

| `data-gw-progress-guardian-block` | copy |
| --- | --- |
| `status` | `Guardian 监控` / `监控结束` |
| `budget` | `子任务存活判断预算 · 7200 秒` |
| `count` | `0 条处置记录` |
| `findings` | `暂无处置记录` |

## Computed layout facts

| viewport | `grid-template-columns` | main | side (guardian) | log list | scrollWidth / clientWidth |
| --- | --- | --- | --- | --- | --- |
| 1500 px, folded | `957px 240px`, gap 16px, `display: grid` | x=280 w=957 h=543 | x=1253 w=240 h=149 | `max-height: 264px`, `overflow-y: auto`, `data-expanded="false"`, `id="gw-progress-log-list"`, box 957×264 | 1500 / 1500 |
| 1500 px, row opened | `957px 240px` | w=957 h=681 | x=1253 w=240 h=149 | box 957×264 (moved down to y=564) | 1500 / 1500 |
| **700 px**, row + fold open | **`693px`** (one track) | x=0 w=693, y=233…937 | **x=0 w=693, y=953** (under the history) | `max-height: none`, `overflow-y: visible`, `data-expanded="true"`, box 693×287 | **700 / 700** |

At 700 px the single track is 693 px wide, the guardian leaves the right column and stacks
below the main column, and `scrollWidth` equals `clientWidth`: nothing overflows sideways.

## Detail line shape (opened row 1 · `任务 2 · Write test.txt`)

Three lines, document order, page copy verbatim:

```
21:38  执行  做完  打开子会话
21:38  检查  过了  打开子会话
21:38  复核  通过  打开子会话
```

i.e. `时刻 门词 结果词 [入口]`, each gate word appearing once.
