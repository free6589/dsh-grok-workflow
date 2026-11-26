# raw-readings-phone.json 更正说明

## 结论

`phone-360-done` 与 `tablet-700-done` 两条的三项读数（`nodeCalls` / `traceActive` / `traceDim`）原记 `1 / 5 / 19`，与这两条名字旁边保留下来的两张 PNG 不符。保留的图像是**干净的完成态**，对应 `0 / 0 / 0`。已把这两条的三个字段改成 `0 / 0 / 0`；原值 `1 / 5 / 19` 没有删除，原样保留在同条新增的 `supersededFirstPass` 里，并标明它描述的是「完成 + 调用列表敞开」的另一个页面状态。

`readings.json`、两张 PNG、其余四条读数、以及本目录其他文件均未改动。

## 原值是怎么写进去的

`capture-phone.mjs` 第一趟：先在 390 px 上 tap 了 `execute_t1`，调用列表打开、读出 `1 / 5 / 19`（这一读数本身没错，`phone-390-trace` 记的就是它，`phone-390-trace.png` 里那张摊开的调用卡片就是同一刻）；紧接着脚本改视口到 360、再改到 700，**没有关掉这个列表**，于是这两次读数把 `1 / 5 / 19` 带进了 `phone-360-done` 与 `tablet-700-done`。

后来 `capture-widths.mjs` 重拍：打开同一个已完成会话、打开进度页、**只改视口、全程不碰页面**，写出 `raw-readings-widths.json`（`0 / 0 / 0`），并把两张同名 PNG 覆盖成了干净完成态。`timeline.json` 的 `reCapture_widths` 记了这次重拍的原因：「the 360 and 700 shots taken right after the tap still carried the opened call list; this pass opens the same finished session and only resizes」。

## 什么取代了它

`raw-readings-widths.json` → `readings.phone-360-done` / `readings.tablet-700-done`，值 `0 / 0 / 0`。与 `readings.json` 里同名的两条目一致，也与下面两张图的像素一致。

## 两张 PNG 实际显示的内容

- `phone-360-done.png`（720×1600，360×800 @2）：一张竖向排开的流程图，绿色已完成节点（任务 1 写 notes.md、任务 2 写 test.txt、任务 3 写 third.txt、复核、再一组三颗任务、汇总第 1 稿、汇总第 2 稿），节点右侧各有一个小圆点按钮。**没有任何摊开的调用列表或调用卡片**，也**没有蓝色高亮的作用线**（所有节点外观一致，没有变暗的节点）。画面停在树的中段，顶部导航只剩「对话 / 轨迹 / …」。
- `tablet-700-done.png`（1400×1800，700×900 @2）：同一张树的同一状态，宽出一档，能看到起点下方到「终点」这一段，标签条上「进度」这一页是直接可点的。**同样没有调用列表、没有卡片、没有蓝色高亮线**，节点无变暗。

对照：同一批里的 `phone-390-trace.png` 才是「列表敞开」的样子——被点的那颗任务下方叠着一张带「执行 任务 1 · 写 notes.md / 做完 / 打开子会话」的卡片，活动路径上的节点描蓝边。两张 done 图里这些特征一个都没有，所以 `1 / 5 / 19` 不描述这两张图。

## 复读图像的准确方式

不是 shell 命令，是宿主的 `read_image` 工具，逐个传入下面两个绝对路径（工具返回的 sha256 与本地 `sha256sum` 一致）：

```text
read_image .rsi/evidence/task-panel-2026-11-26/soak/phone-360-done.png
read_image .rsi/evidence/task-panel-2026-11-26/soak/tablet-700-done.png
```

校验用：

```bash
cd .rsi/evidence/task-panel-2026-11-26/soak && sha256sum phone-360-done.png tablet-700-done.png
# 1212d02272440d611317628de8da61c14dadc2805a212cbe686e0c3706ab7459  phone-360-done.png
# 5114bf36c6ca53e6def92c15263bebedee06945ab2479154b0ca818e972b51db  tablet-700-done.png
```

同一手法也读了 `phone-390-trace.png` 与 `desktop-1500-trace-open.png` 作对照，确认「摊开卡片 + 蓝线」在像素上是可辨的，不是靠文字推断。

## 同类问题（已发现，本次未改）

`raw-readings-desktop.json` 里有一个同名键 `phone-390-running`，存的却是**桌面已完成态**：它的每一项都与该文件的 `desktop-1500-done` 逐字段相同（`scrollWidth` 1500、`第 7 步，共 7 步`、`已完成`）。而 `raw-readings-phone.json` 里真正的 `phone-390-running` 是 `390` 宽、`进行中`、`第 2 步，共 3 步`、`pnodes` 6。两者矛盾，属于同一类问题（键名与内容对不上）。**没有改**：本证据目录里没有任何一份记录说明「桌面侧的 phone-390-running 应该是什么」，改写它只能靠编数字，所以只在此记录，交由后续决定。

另外两处只是**命名**不一致、数字本身与其状态相符，不构成矛盾，也未改动：该文件的 `desktop-1500-node-open-again` 对应保留下来的 `desktop-1500-trace-open.png`（已读图确认：卡片敞开 + 蓝线 = `1 / 5 / 19`）；`desktop-1500-done-before-click` 没有同名 PNG。`desktop-1500-trace` 的 `0 / 0 / 0` 与其同名图一致，但其名字容易误导——这点本目录外的发布记录已单独记过。
