# 读屏走读记录（自动化等价：NVDA / VoiceOver 任一的树遍历等价）

分支 `fix/screen-reader-walk`，基线 `8f02c32`。本机无读屏软件（`orca`/`nvda` 均无），走读以渲染树为据：
按文档顺序遍历挂载后的树，把读屏软件会停靠的站点（地标 header / 状态 chip / 步骤句 / 任务句 /
图 group / 每张卡 button / 点开的 sheet region / 点开的 list / 卡住句 status）依次记下，
与 NVDA / VoiceOver 的浏览模式朗读顺序一致（均为 DOM 顺序 + 可访问名）。

机读底本：`reading-order.json`（同目录，脚本 `.tmp/walk/render-order.mjs` 生成，未入库）。

## 三态（未点开）

朗读顺序三态完全一致，只有文案随状态变：

1. 地标 `header[aria-label=运行名]` ——「RENAMED-wait / -run / -done / -failed」
2. 状态 `span[role=status]`（chip）——「等你点头 / 进行中 / 已完成 / 未通过」
3. 步骤句 `p[data-gw-progress-line]` ——「第 1/2/7/2 步，共 7 步（7 层流程）」
4. 任务句 `p[data-gw-progress-count]` ——「图上 0/0/1/0 个任务」
5. 图 `div[role=group][aria-label=运行名 + 的任务图]` ——「RENAMED-x 的任务图」
6. 卡片 `button[data-gw-progress-pnode-open]` ——「规划 在做 [可展开]」「X-task 1 过了 [可展开]」……
   （`aria-label=卡名 + 状态词`，`aria-expanded=false`；不可点的起点/终点为普通 `div`，不是停靠控件）
7. 卡住句（仅 failed 态）`p[role=status][aria-atomic=true]` ——「卡在 2：X-do 第 1 遍没过」

| 态 | 地标 | chip | 步骤句 | 卡住句 |
|---|---|---|---|---|
| waiting | RENAMED-wait | 等你点头 | 第 1 步，共 7 步 | 无（按设计） |
| running | RENAMED-run | 进行中 | 第 2 步，共 7 步 | 无（按设计） |
| done | RENAMED-done | 已完成 | 第 7 步，共 7 步 | 无（按设计） |
| failed | RENAMED-failed | 未通过 | 第 2 步，共 7 步 | 卡在 2：X-do 第 1 遍没过 |

## 点开（含卡住句的 failed 态同样适用）

以 running 态点开第一张可开卡（`plan/规划`）为例，图之后插入：

6. 图例 `ul[data-gw-progress-legend]` ——「亮线：走过的线 / 暗线：没走的线 / 六点：六环 / 五点：五验」
7. 展开区 `div[role=region][aria-label=调用：规划]` —— 点开卡的调用区自报家门
8. 调用表 `ol[id=gw-progress-calls-plan][aria-label=规划 的调用]` —— 与卡上
   `button[aria-controls=gw-progress-calls-plan]` / `aria-expanded=true` 双向咬合
9. 卡住句仍在展开区之后（failed 态点开同理，先读调用区、再读卡住句、再读 dock）

## 按钮名清单（读屏听到的控件名）

- 卡片：`aria-label`（卡名 + 状态词），展开态另有 `aria-expanded`；例「规划 在做，折叠/展开」。
- 收起：`button[data-gw-progress-sheet-hide]` 文案「收起」。
- 开工（仅 waiting）：`button[data-gw-progress-dock-fill]` 文案「开工」。
- 行内子会话胶囊（`progress.member.open`，本页默认不可开故为文本；可开时为按钮「打开子会话」）。

## 与旧版的差异（本分支补的 5 处 aria）

1. `header[aria-label=运行名]`（新）
2. 图 `aria-label` 由固定「任务图」改为「`{run}` 的任务图」（`progress.panel.graph` 加参）
3. 展开区 `role=region` + `aria-label=调用：{卡名…}`（新）
4. 调用表 `aria-label={卡名} 的调用`（新键 `progress.panel.list`）
5. 卡住句加 `aria-atomic=true`（原只有 `role=status`）
