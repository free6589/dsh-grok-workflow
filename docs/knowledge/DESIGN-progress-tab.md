# 进度 Tab — L2 设计（组 G 实现记录）

状态词汇沿用 `AGENTS.md`：`CONFIRMED` = 源码/命令/测试直接观测；`HYPOTHESIS` = 未验证的推断；`NOT_RUN` = 有意未执行。

## 1. 范围与非目标

会话标题下第三个 Tab「进度」（id `grok-progress`，order 20，位于 chat 0 / trajectory 10 之后）。它把本插件 recorder 已写入的四个 `tool-workflow/*` 事件折叠成一条横向阶段轨道，并在节点上提供三段式详情。

非目标（刻意不做）：

- 不写任何 session 事件，不发网络请求，不改 recorder（`src/records.ts` 属 wave1 成果区）。
- 不显示 ETA、token 数、完成任务数、通过率或任何事件流里不存在的数字。
- 不把「子调用结束」说成「任务通过」：`agent-end: completed` 只说明子进程结束。
- 不实现 P1-2 的九态任务状态机（上游 `dsh-workflow-ptc` 没有该通道，见 `docs/task-progress-panel.md`）。

## 2. 数据契约（CONFIRMED）

只读本插件 recorder（`src/records.ts`，`createWorkflowProgressRecorder`）写出的四个事件：

| 事件 | 负载 | 用途 |
| --- | --- | --- |
| `tool-workflow/run-start` | `runId`, `name` | 建节点、run 标题、anchorSeq |
| `tool-workflow/agent-start` | `runId`, `seq`, `label`, `phase?`, `childId` | 声明一行（阶段绑定、子会话） |
| `tool-workflow/agent-end` | `runId`, `seq`, `outcome` | 按 `seq` 结算一行 |
| `tool-workflow/run-end` | `runId`, `stopReason` | 关闭 run，决定终点状态与 blocked 派生 |

会话事件的 `seq` / `time` 由外层事件提供，用于 anchorSeq 与耗时；`data` 内没有时间戳。

**事件流里没有的东西**：计划任务总数、任务级 verdict、ETA、进度百分比、stage 明细。因此本 Tab 不渲染它们（见 §5、§7）。

## 3. 折叠规则

`foldProgressRuns`（`src/progress-tab.ts`）/ `foldProgressEvents`（`src/client/index.js` 手写镜像）：

1. **两遍扫描，顺序无关**：先为每个 `run-start` 建 run，再应用其余事件。因此重放的乱序窗口（`agent-start` 早于 `run-start` 到达）仍归属同一 run。
2. **幂等**：重复 `agent-start` 不新增行；重复 `agent-end` 不二次改判（同一事件值相同，last-wins）。
3. **乱序结算可 settle**：`agent-end` 先于自己的 `agent-start` 到达时，结算先入 settlements，start 到达后补齐。
4. **不发明行**：没有人声明的 `seq` 结算被丢弃；没有 `run-start` 的 run 整体丢弃（行代表真的启动过的子调用）。
5. **anchorSeq** = 该 run 触及的最小 session `seq`；多 run 时按它排序。

**多 run**：Tab 只显示一个 run —— `selectActiveRun` 取 `anchorSeq` 最大者；同 anchor（recorder 不会产生）时优先仍运行的 run（无 `stopReason`）。「运行切换」即由此自然发生：新 run 的 `run-start` 一定带更大的 `seq`。

一个会话里通常只有一个 run：recorder 只记自己 adopted 的 run id，且每个 run 自带会话（`src/records.ts` 规则 1）。同一会话若出现其它 bundle 的 `tool-workflow/*` 事件，本 Tab 会把它当作 run 渲染——这与 chat 面板接管全部 `workflow-run` 节点的既有事实一致，且不改变任何事件语义。

## 4. 阶段绑定（轨道）

### 固定脊椎（模板）

`起点 → 同步对比 → 排查 → 修复 → UI 改 → 真机验证 → 清理 → push/tag → 终点`

这是**流程模板，不是断言**。每个工作阶段带关键词（`同步/sync`、`排查/诊断/triage`、`修复/fix`、`ui/界面`、`真机/实机/device`、`清理/cleanup`、`push/tag/推送/发布`）；一个被记录的 `phase` 头命中某阶段关键词，就聚合进该阶段节点（多个 phase 聚合时，节点 tooltip 列出它们的原文）。没有 phase 命中的阶段保持 `pending`，tooltip 写「事件中没有报告」——不借邻居状态。

### 追加节点（真实计划任务）

命中不了任何关键词的 `phase` 是**独立节点**，label 用记录的 phase 原文，插在「真机验证」之后、「清理」之前（工作段位置），按 run 启动顺序排列。没有任何 `phase` 的行也生成一个节点（空 label → 文案 `progress.unphased`），保证**轨道与百分比统计的是同一批行**。

`任务 n · 标题` 绑定：phase 原文即组标题（由 `src/naming.ts` 生成，n 是计划位次），所以同名标题不会合并（n 在字符串里）。本 Tab 直接渲染该字符串，不重新编号、不截断（截断交给 CSS ellipsis + `title`）。

### 边缘节点

`起点` / `终点` 报 run 自身的事实：起点在 run 存在时即 `done`；终点未结束为 `doing`，结束按 `stopReason`（`completed → done`、`cancelled → cancelled`、其它 → `failed`）。

### 4.1 实现回填：两条绑定通道（2026-11-18，RSI round 9）

上面 §4 描述的是早期模板脊椎；**实际发布**的脊椎是
`起点 → 规划 → 执行 → 检查 → 汇总 → 终点`（`PROGRESS_STAGES`，`src/progress-tab.ts`），
计划任务节点插在 `执行` 与 `检查` 之间。原先第七格「回答」已删除（manual item Sec.2-5）：
最终答案由 gate 在整轮结束后直接交付，从不经过 workflow 子调用，所以没有任何事件能填这一格。
逐条事实：

- **通道一（phase）**：`agent-start` 的 `phase` 命中阶段 token 时，行聚合进该阶段节点。
  CJK token 按子串匹配，拉丁 token 必须落在词边界上（`ui` 不命中 `build`）。
- **通道二（role label）**：脚本把 worker/verifier 调用的 `phase` 写成计划任务组标题
  （`任务 n · 标题`，`src/script.ts:1852` 起），这类行的 phase **永远**不含 `执行`/`检查`。
  因此一条行若 phase 未命中任何阶段，就用它的 **label**（`memberLabel()` 产出的角色名：
  `执行`/`检查`、`Execute`/`Check`）判一次它属于哪个工作阶段，并把该行**交叉引用**到该阶段的
  `evidence` 列表。
- **不变量不变**：`members` 仍是每条行唯一的归属（`evidence` 是引用，不是第二个家），
  所以「轨道节点里的行」与百分比统计的仍是同一批行（`test/progress-tab.spec.ts` 的
  `rendered` 断言）。阶段状态优先用自己的 `members`，只有它为空时才由 `evidence` 决定。
- **标签只对 label 匹配**：`check the build` 这种任务标题不会因为含 `check` 变成 `检查`，
  因为 role token 不参与 phase 匹配。
- **文案**：阶段有 evidence 而无自有行时，tooltip 用 `progress.evidenceHint`、meta 行用
  `progress.branch.evidenceRows`（`{count}` 行），不再落回「事件中没有报告」。

## 5. 状态与优先级

优先级（固定顺序，先命中先返回）：`failed → doing → done → blocked → cancelled → pending`。

| 状态 | 判定 | 数据来源 |
| --- | --- | --- |
| `failed` | 该节点存在**当前**失败行（历史失败、且同一单元后续尝试已 `completed` 的行不算） | 事件原话 + §5.1 的恢复规则 |
| `doing` | run 未结束且存在未结算行 | 事件（缺 `agent-end`） |
| `done` | 行非空且**全部**结算为 `completed` | 事件原话 |
| `blocked`（派生） | run 已结束仍有未结算行；或某行 outcome 既非 completed 也非 cancelled | 由缺失/异常**推导**，tooltip 说明 |
| `cancelled` | 存在 `outcome === 'cancelled'` 的行 | 引擎原话（不派生） |
| `pending` | 其余（含无行的模板阶段） | 空态 |

**blocked 一律带 tooltip**：`progress.derived.runEndedUnsettled`（运行已结束但有未结算行）或 `progress.derived.outcomeUnsettled`（引擎 outcome 既非完成也非取消）。`blocked` 是唯一派生状态；`cancelled` 只用引擎自己的词，绝不由「没有结算」推出来。

### 5.1 红色只表示「现在还是坏的」（2026-11-22）

引擎把**尝试**记成行，不把任务记成行：`任务 2` 第 1 次 `执行` 失败、第 2 次通过，流里就是
`执行:failed` + `执行（尝试 2）:completed` + `检查（尝试 2）:completed` 三行。旧规则
「该节点任一行 `failed` → 节点 `failed`」于是把**已经修好**的任务继续染红：任务卡、执行段、
顶部结算条全红，纵向连线还被染成红色，连带指着别的任务卡。用户已经明确否掉这条读法。

现在的规则：

- **单元（unit）** = 同一 `phase` + 同一角色通道（label 去掉 `（尝试 n）` / `(attempt n)` 后缀）。
  同一单元的多行就是同一调用的多次尝试；不同任务的 worker 行 label 相同但 phase 不同，
  所以**一个任务的成功永远不能把另一个任务的失败判成恢复**。
- **恢复** = 同一单元里存在 `order` 更靠后的 `completed` 行。这时该失败行仍留在 `members`
  （百分比照旧统计它），只是不再决定卡片、段、条的聚合状态（`recoveredFailureSeqs()`）。
- **未恢复**：后续尝试还在跑就没恢复（仍红）；后续尝试又失败也没恢复（仍红，且两条都计入）。
- **行级痕迹保留**：该失败行自己的 pill / `data-state` 仍是 `failed`，读者能看到
  「失败过一次，然后通过了」。
- **四处的颜色来源**：任务卡（`node.state` → 环 + 左侧红边）、脊椎段（`data-state` + 红点 +
  红色计数徽标）、顶部结算条（`data-tone="bad"`）、以及 `失败 {count}` 那句 meta 文案，
  全部只看当前失败（`currentFailureCount()`）。
- **纵向连线不带状态**：主干与分支线只用 `--dsw-alias-border-l2` 描边，没有 `data-tone`、
  没有虚线、没有内联 style。一条线会指着多张卡，染红就等于把绿的、还没跑的一起定罪。
  状态只由卡片自己的环、pill 和脊椎段表达。
- **结算条新增 `retried` 色调**（`progress.settle.retried`，`{count} 已重试`）：这一行结算了、
  但现在不红；叫它 `完成` 会谎报那次失败，所以单独一档灰色。


## 6. 百分比

`percent = settled / declared × 100`（四舍五入整数）；`declared === 0` 时**不显示百分比**，改显示 `progress.unsettled`。

- `declared` = 该 run 已声明的行数（`agent-start` 数）；`settled` = 其中已有 `agent-end` 的行数。
- **为什么不除计划任务数**：事件流里没有计划总数（`run-start` 只有 `name`），把 `任务团队 · 3 个任务` 里的数字解析出来当分母是猜，且 triage/单调用 run 的标题里根本没有数字。所以分母只能是引擎真正声明过的行。
- 文案同时说清：`progress.percent` 显示 `3/4 · 75%`，`progress.percentHint` 写明「已声明 4 行，已结算 3 行；这不是任务通过数 / not a task verdict」。若干行未结束时，百分比只表示结算进度，不表示任务完成。

## 7. 详情浮层（点节点）

三段，顺序即读者需要的顺序：

1. **头**：阶段名、状态词、关闭按钮。
2. **引擎事实**（逐行原样，不解释）：`runId`、行数、聚合的 phase；每行 `seq`、`label`、`phase`、`childId`、`outcome`、耗时（`endedAt - startedAt`，两端都有才显示，否则 `—`）。
3. **阶段报告**：七字段 `files / commands / result / evidence / risks / next / owner`，每行右侧带**来源徽标**。

### 三级来源（判定阶梯）

| 级别 | 来源 | 现状 |
| --- | --- | --- |
| 1 | `tool-workflow/stage-detail` 事件负载 | **本 recorder 不写此事件**；解析已实现，事件出现即生效 |
| 2 | 子会话协调块（围栏 `grok-coordination`，或含 `coordination` 对象/≥2 已知字段的 `json` 围栏） | 视图侧拿不到子会话正文，注入点已留（`detailSources`） |
| 3 | `未报告` | 当前实际落点：值渲染 `—`，徽标 `progress.source.notReported` |

规则：

- 逐字段独立判定：某个字段有 L1 用 L1，否则 L2，否则 L3。绝不把散文当结构化数据。
- 空字符串、空数组视为「未报告」，不当作「没有发生」。
- 「复制协调块」只在解析到真实块时启用（否则 disabled + `progress.detail.noBlock`），复制内容为围栏内原文；`navigator.clipboard` 失败显示 `progress.detail.copyFailed`，不谎报成功。
- 「打开子会话」逐行判定，复用 chat 面板的 `panelMemberMode`：`sessions.subagentAddress(childId)` 的 `parentSessionId` 必须等于当前会话、`mode` 必须是 `continuable`/`one-shot`，否则该行不出现按钮（避免打开错的会话）。

## 8. 注册与生命周期

- `conversation.view` **list** 槽：`{ name, id: 'grok-progress', order: 20, locale: NS, label: () => t('view.progress'), inject(sessionId) }`。**不带 `priority`**（那是 keyed 替换的语义，此处无物可替换）；不设置任何默认选中，`view: null` 仍解析到 chat，所以默认仍落对话 Tab。
- 会话注册：`uiConversation.events.register({ kind: 'grok-progress-run', target: 'grok-progress', … })` 与 `uiConversation.views.register({ target: 'grok-progress', create })`。`target`/`kind` 都带 `grok-progress` 前缀：这两个是注册表身份，重复注册会**抛错**，前缀保证撞上的是本插件自己的 bug，而不是悄悄顶掉别人的 target。
  - 说明（有意偏差）：`target`/`kind` 不写进 `conversation.view` 的 slot options —— 该槽的合法键是 `name/id/order/locale/label/inject/children`，多塞未知键没有收益；防重名发生在真正会抛错的 registry 层。
- **try/catch 降级 + `console.warn`**：事件/视图定义注册失败、slot 注册失败都只损失这个 Tab；返回 `undefined`，设置页显示 `status.progressFailed`（带 registry 原文）。绝不让插件 fiber 因 Tab 失败。
- **locale 变更重挂先 dispose**：`restartProgress()` 先调用旧 disposer，再 `startProgress()`。`ctx.inject(['locale'])` 的分支在重挂页面/面板的同时重挂本 Tab；`teardown` 与 locale scope 的 disposer 都只做拆除，不在死 scope 里重建。
- **无 `uiConversation` 服务时跳过**：Tab 的挂载放在 `ctx.inject(['uiConversation', 'sessions'], …)` 里；服务缺席则回调不执行、Tab 不注册，`i18n.progress` 保持 `unmounted`，设置页状态行显示 `status.progressMissing`（该状态通过 store 订阅，服务迟到/失败能实时反映）。
- 会话绑定失败（replayed/已关闭的 session）不抛进 shell：退回空快照 + 一次 `console.warn`。

## 9. 样式

- **颜色全走 token**：`doing→--dsw-alias-state-business-primary`、`done→…-success-primary`、`failed→…-error-primary`、`blocked/cancelled→…-warn-primary`、`pending→…-idle-primary`；边框 `--dsw-alias-border-l2`，浮层底 `--dsw-alias-bg-layer-2`，文字 `--dsw-alias-label-primary/secondary`。**无 hex、无 rgba**（测试断言 CSS 中不含任何字面色值），因此深/浅色与对比度主题下不会留下硬编码浅色块。缺 token 时回退到 `inherit`/`transparent`，不会渲染出错误的浅色。
- **字体**：`--dsw-font-family-sans`（正文）、`--dsw-font-family-mono`（引擎事实）。
- **`<style>` 作用域**：所有规则以 `.gw-progress` 开头；样式元素渲染在 Tab 自己的树里，Tab 卸载时由 React 移除——切换 Tab 无残留样式，即使残留也因前缀不会外溢。
- **轨道**：`display: flex`，等分（`flex: 1 1 0`）、无横向滚动（`test/client.spec.ts` 钉住
  `not.toContain('overflow-x: auto')`）；每段 = 28px 状态环 + 阶段名（ellipsis）+ 一行 meta，
  head `flex-wrap: wrap`，窄列时环叠到 label 上方而不是把 label 压成 0。
- **状态环**：`.gw-progress-ring`（28×28、`border: 2px solid --dsw-alias-state-idle-primary`、
  `border-radius: 50%`）+ `.gw-progress-glyph`；颜色由内联 `borderColor`/`color` 取
  `PROGRESS_STATE_COLOR`，`pending` 因此是空心环而不是空白。
- **连接线**：`segment 之间`一条轴线（`.gw-progress-link`，18×2px，`margin-top: 19px` = 段 6px 上内距 + 14px 半环，与环心同高）；
  `data-filled` 只在该段 `done` 时填绿，`data-flowing` 表示下一段正在跑（蓝色流动虚线）。
  segment 内部的横线已删除（旧实现会在透明 head 后面横穿环与 label）。
- **doing 脉冲只在 CSS**（`@keyframes gw-progress-pulse` 作用于 doing 的环），
  `@media (prefers-reduced-motion: reduce)` 同时停掉脉冲与流动虚线。
- **缩放（0.12.19 删除）**：曾经的 `--gw-zoom` 倍率、`localStorage['dsh.gw.progress.zoom']` 与三颗
  按钮一起移除——它是界面装饰而不是信息，而且会把实测的连线几何再乘一次。字号改为固定 px。
- **键盘 / aria**：轨道 `role="group"` + `aria-label`；段是静态 `li`（无 `tabIndex`、无 `onClick`、无 `aria-expanded`），`aria-label` = `「阶段 · 状态 · meta」`；唯一的控件是行胶囊（`button`，`aria-label` = `「打开子会话 · 行名」`）。
- **窄屏**：`@media (max-width: 720px)` 收紧间距、连接线收窄，head 转为竖排（环在上、label 在下）；
  `@media (max-width: 480px)` 轨道转竖排 step list（连接线与连带 SVG 一起隐藏），任务带回到 12px 内距、
  卡片满宽——这一宽度下没有画干线的地方，顺序本身承载拓扑（见 §17）。
- **展开分支在脊柱之外**：见 §14。

## 10. 降级矩阵

| 情形 | 行为 |
| --- | --- |
| 会话没有任何 `tool-workflow/*` | 空态（标题 + 说明），无轨道、无百分比 |
| `run-start` 缺 `name` | 标题空串（不猜名字）；其余字段照常 |
| 事件缺 `phase` | 该行进入 `progress.unphased` 节点，仍计入百分比 |
| 事件缺 `childId` | 该行不可打开（无按钮），事实行显示 `—` |
| 事件缺时间 | 耗时不显示（`—`），不估算 |
| 未知 `outcome` | 结算为「已结算」，状态按优先级派生为 `blocked` 并说明 |
| 未知 `stopReason` | 终点 `failed`（与 recorder 的 `progressStopReason` 规则一致），不读成完成 |
| 复制失败 / 无剪贴板 | `copyFailed` 文案，不显示「已复制」 |
| 注册失败 / 无服务 | Tab 缺席 + 设置页状态行说明 |

## 11. 测试与验证（CONFIRMED）

```text
npm run build
→ tsc -p tsconfig.build.json 通过；client bundle: 186091 bytes → lib/client.js
  （lib/client.js 必须与 src/client/index.js 逐字一致，client.spec 对此断言）

npx vitest run test/progress-tab.spec.ts test/client.spec.ts
→ Test Files 2 passed, Tests 93 passed

npx tsc -p tsconfig.json --noEmit
→ exit 0（无输出）

npx oxlint src/client/index.js src/progress-tab.ts test/progress-tab.spec.ts test/client.spec.ts
→ 0 errors（2 warnings，均为本文件既有代码：`GROUPS_WITH_FIELDS`、`booleanRow` 的局部 `field`）

npx oxlint src test
→ 0 errors（4 warnings，全为既有代码）

# 相邻回归（确认对话/轨迹未受影响）
npx vitest run test/client.spec.ts test/progress-tab.spec.ts test/panel-links.spec.ts
→ 106 passed
npx vitest run test/panel.spec.ts test/phase1-dialogue.spec.ts
→ 46 passed
```

覆盖点：

- 五态 + 优先级：`test/progress-tab.spec.ts`（`pending/doing/done/blocked/failed/cancelled`，含 failed 压过未完成行、blocked 两种派生理由、cancelled 原话）与 `test/client.spec.ts`（同一批 fixture 跑手写 JS 镜像）。
- 红色只表示当前失败（§5.1）：`test/progress-tab.spec.ts` 的「red is the current state, not the history」（恢复后卡片/段变 `done`、重试未结算仍 `failed`、跨任务不互相恢复、同一 attempt 内 resubmit 算恢复、百分比照旧含失败行）与 `test/client.spec.ts` 的同名块（结算条无红段且出现 `retried`、脊椎无红点/红徽标/`失败 n` 文案、卡片环 `done` 而失败行 pill 仍 `failed`、连线无 tone 无 style、CSS 只用 border token）。Before/after 实测见 `.rsi/evidence/red-semantics-2026-11-22.md`。
- 百分比：`settled/declared`、`declared=0` 缺席、`75%`、`100%`。
- 详情三级来源：L1 压过 L2、L2 补齐、其余 `not-reported`、空值 `—`、坏块/散文拒绝、L1+L2 都缺时七行全 L3。
- 降级：无 run 空态、缺字段渲染不抛、绑定失败、注册失败（含 `console.warn` 断言）、无 clipboard。
- 注册契约：id/order/locale/label、无 `priority`、不默认选中、target/kind 前缀、locale 重挂 dispose 顺序、disposer 幂等。
- 快照身份：`apply([])` 与同数据 upsert 返回同一引用。
- 派生状态可解释：blocked 节点的 `title` 是 `progress.derived.runEndedUnsettled`；cancelled 不带 `data-derived`；未报告的模板阶段 `title` 是 `progress.notReported`。
- 样式：token 前缀、无字面色值、`96px`/`overflow-x`/`snap`/断点/抽屉/reduced-motion/28px/`--gw-zoom`。

两处实现（TS 纯函数 + 浏览器手写 JS）无法互相 import（host 逐字投递 `lib/client.js`），所以用**同一批 fixture 双份断言**防漂移，而不是"假设一致"。

## 12. 明确的已知限制

1. 阶段关键词匹配是**展示分组**，不是语义归类：标题里出现「修复」二字的任意任务都会聚合到「修复」阶段。节点 tooltip 列出真实 phase 原文，读者可核对；不改变任何状态/百分比。
2. `declared` 是「已声明的行数」，不是计划任务数（见 §6）。
3. L1（stage-detail）与 L2（子会话协调块）在当前 recorder/视图 API 下都拿不到真实数据，详情实际落在 L3；阶梯已实现并有单测，未来接入无需改 UI。
4. 子会话「打开」依赖 `sessions.subagentAddress`；`mode: 'unknown'` 时按 `panelMemberMode` 的既有规则保持不可点。
5. 真机截图/浏览器视觉验收 **NOT_RUN**：本组不在本机启动真实 DSH Web 组合做视觉验证，截图留给验证组；本文件所有"已运行"结论仅覆盖上面的 vitest/tsc/oxlint 命令。
6. 「`执行`/`检查` 显示『事件中没有报告』」这一缺陷已在 round 9 关闭（见 §4.1 通道二）：
   真实流里 worker/verifier 的 phase 是计划任务组标题，旧实现只按 phase 匹配，因此两个必然发生的
   阶段永远是空的。现在按 role label 交叉引用，状态与计数随之正确；没有 role label 可用时仍如实
   报「没有报告」，不猜。

## 13. 收尾回填（2026-11-15，真机验证组 H2）

本节只回填事实，不改本文档前面任何设计决定。证据目录
`docs/knowledge/evidence/progress-tab-2026-11-15/`（14 张真机截图 + 5 个 stage 日志 + `run-state.json`）。

- **§12 第 5 条「真机截图/浏览器视觉验收 `NOT_RUN`」已作废**：本轮由 H2 组在隔离实例
  （`dsh web` `127.0.0.1:3210`、profile `gwprog`、打包产物安装、真模型 `127.0.0.1:18088`、
  headless Chromium 1440×900 / 480×900、收尾杀进程删 token 日志）完成，**无任何 mock**。
- **真机覆盖（`CONFIRMED`）**：三 Tab 共存且默认对话（`01`）；空态（`02`）；
  `pending`/`doing`/`done` 同帧（`03`）+ 收尾 `3/3 · 100%`（`04`）；详情三段与
  `Source: not reported`（`06`）；窄屏 480 底部抽屉 + 单列（`07`）；深色 token 环色（`08`）；
  对话/轨迹零回归（`09`、`10`）；已完成行点开真实子会话（`11`）；
  跑到 doing 点停止 → `cancelled` 引擎原话（`12`、`13`、`14`）。
- **真机未覆盖（`NOT_RUN`，不冒充）**：`blocked`、`failed`。前者需要「运行结束仍留下未结算行」，
  后者需要失败的子调用；本轮没有真实触发条件，所以只由 `test/progress-tab.spec.ts` +
  `test/client.spec.ts` 的 93 个测试覆盖（`unit-supplement.log.txt`）。
  §5 的优先级规则（failed 压过未完成行、blocked 两种派生理由）仍只有单测证据。
- **设计假设得到确认的两点**：①「未命中阶段保持 pending 且不借邻居状态」在真机上成立
  （7 个阶段空环 + `title="Not reported in the events"`）；②「详情阶梯在本 recorder 下落 L3」
  成立（7 字段全 `—` + 同一徽标，`Copy coordination block` 在无协调块时 `disabled=true`，
  没有谎报可复制）。
- **一处需要记住的实现事实**：`link:` 安装形态下 `/grok on` 会因跨副本 `Session` brand check 失败
  （现象 `CONFIRMED`、归因 `HYPOTHESIS`，见 RESEARCH A20 / DECISIONS D-046）。进度 Tab 自身不依赖
  该开关，但复现本文档 §11 的验证步骤时必须用**打包产物**安装，否则会先卡在开关上。
- **仍未做**：单 run 之外的历史轨道、`relay`/`append` 形态的进度展示、多语言切换的实时重绘截图
  （locale 重挂有单测，没有截图）。

## 14. 回填：展开分支移出脊柱（2026-11-21，UI 缺陷修复）

本节只回填事实与修正。证据目录
`docs/knowledge/evidence/progress-tab-ui-fix-2026-11-21/`（前后各 7 张截图、48 用例几何表、
red-probe、`npm run ci` 日志、可重跑的页面与断言脚本）。基线 `0eb5d8f`，修复在
`7496ae4` / `660d79d` 两个提交里。

- **缺陷（`CONFIRMED`，Chromium 实测）**：A+C 方案把「展开阶段的成员」作为
  `.gw-progress-track` 的又一个 flex 子项渲染，且它带 `width: 100%`——于是打开一个阶段就是
  让分支去和七个 stage 抢宽度。默认展开规则（`failed` 优先，其次 `doing`）意味着**任何进行中
  的运行都会触发**：1200 px 下每个 segment 只剩 21 px，head 与 label 计算宽度 0，7 个阶段名
  全部消失。同时 `.gw-progress-ring` 只有 reduced-motion 里的一处引用、没有基础规则，环是
  8–9×17–19 px 的无边框内联 span，状态色写在看不见的 `borderColor` 上。
- **修法**：分支改为轨道**下方**的独立面板（`data-state` 挂在面板上，stem 颜色随它），
  `跳转到首个失败` 移到轨道上方；`.gw-progress-ring` / `.gw-progress-glyph` 补齐几何；
  segment 内横线删除，连接线压到环心（13px）并新增 `data-flowing`；head `flex-wrap: wrap`，
  720 px 以下环上 label 下；≤480 px 连接线随竖排隐藏。空阶段打开时面板写
  `progress.notReported` / `progress.branch.evidenceRows`（`progressNodeMeta` 抽取共用），
  不再是空盒子。
- **不变量未变**：分支仍只属于一个阶段（`aria-controls` 仍指向 `gw-branch-<key>`），
  `.gw-progress-link` 的填充规则与 `test/progress-connector.spec.ts` 的断言一致
  （只在前一段 `done` 时 `data-filled`），样式仍全 token、无字面色值、无横向滚动。
- **测量口径**：48 个用例 = 6 场景 × 8 宽度（1440/1200/900/760/600/520/480/390），其中一个
  用例包含一次点击展开。修复前 **40 例 / 884 条**不变量失败（仅空态通过），修复后 **0 条**。
- **未覆盖（`NOT_RUN`）**：真机 DSH Web 面板手点（本机会话里没有本插件写的 `tool-workflow/*`
  运行）；`blocked` 详情在 ≤480 px 抽屉形态的单独截图。


## 16. 详情卡删除与胶囊直达（2026-11-21，实现，Phase 1 落地）

用户拍板：Q1 阶段与任务的详情卡一起删除；Q2 点卡片空白处什么都不发生；
Phase 2（失败重试）暂不做。本节记录实际改动。

- **删掉的东西**：`ProgressDetail` 组件与 `gw-progress-detail` 全套样式（含 ≤480 px
  底部抽屉规则、`gw-progress-facts/row/field/actions`）；`selectedKey` / `copy` /
  `focusedKey` / roving tabindex / `toggleSegment` / `onKeyDown` 方向键处理；
  `detailSources` 注入点；`progress.detail.*`（18 key）、`progress.none`、
  `progress.collapse`、`progress.branch.memberCount/blockedCount` 文案；
  `detailFor` / `detailSources` / `parseCoordination` 的 bundle 导出。
  `detailFields` / `detailEventType` 导出保留（fold 仍收 `stage-detail` 事件，见下）。
- **阶段（`ProgressNode`）**：`button` → 静态 `div`，无 `onClick` / `tabIndex` /
  `aria-expanded` / `aria-controls`；`title` tooltip 与 `aria-label` 保留。
- **成员卡（`ProgressMemberCard`）**：`button` → 静态 `div`，无 `onClick`；
  文案末的 `.gw-progress-member-note` 不再 `margin-left: auto`（右端让给胶囊）；
  可开行（`childId` 非空且 `canOpen(childId)`）末尾多一个 `.gw-progress-open`
  胶囊（文案 `progress.member.open`：「打开子会话」/「Open child session」，
  `title` + `aria-label` 带行名），点击直调 `openChild(childId)`；
  不可开行无胶囊、整卡 inert。
- **分支面板**：默认展开规则不变（首个 failed，无则首个 doing，否则全收）；
  空分支仍显示同一句 `progressNodeMeta` 说明。
- **数据源不变量未动**：fold（四个 `tool-workflow/*` + `stage-detail` 归档到
  `details`）与 `detailSourcesOf`（`src/progress-tab.ts`）保留——事件照收，
  只是视图不再消费。重试（Phase 2）将来若立项，可直接用这批 `details`。
- **测试**：`test/client.spec.ts` 的「detail ladder」整块替换为三例（无详情 DOM、
  一行可开一胶囊且能打开、不可开行全 inert）；手风琴/aria 断言按静态阶段更新；
  `mono` 字体断言改为 `not.toContain`（详情是唯一的 mono 用途）；
  `test/progress-connector.spec.ts` 的两例改断「默认分支仍按 failed→doing 打开」，
  不再断 `aria-expanded`。
- **效果图**：`docs/knowledge/evidence/progress-tab-mockup-2026-11-21/flow.html`
  已同步（删 hint 段落、删 inspector、任务卡 inert、胶囊为 `#child-<id>` 占位链接；
  `flow-task-detail.png` / `flow-stage-detail.png` 两张旧截图已删除）。

## 15. 候选图型评估（2026-11-21，只有设计，无施工）

本节只记判断与数据边界。`src/progress-tab.ts`、`src/client/index.js`、任何测试均**未修改**，
因此本节没有任何可运行的验证结果——所有「可以做」都是 `HYPOTHESIS`，所有「数据在」都是
对 `src/progress-tab.ts` 的 `CONFIRMED` 阅读结论。

触发点：用户在 1506×549 的真机截图上问「进度页还有什么别的流程图画法更好」。

### 15.1 现状复述（CONFIRMED）

- 轨道 = `PROGRESS_STAGES` 六段固定脊椎（`src/progress-tab.ts:181`），未命中任何阶段的
  `phase` 追加为独立节点，插在 `执行` 与 `检查` 之间（§4.1）。
- 渲染 = 单行 `flex` 等分：段内 28 px 状态环 + label（ellipsis）+ 一行 meta，段间 18 px
  连接线（`src/client/index.js:3359` 起）。展开的分支面板在轨道**下方**（§14）。
- 「无横向滚动」是既有断言：`test/client.spec.ts:2007` 要求 CSS 不含 `overflow-x: auto`。
- 时间信息齐备，但只出现在详情浮层：`ProgressMemberFact.startedAt/endedAt`
  （`src/progress-tab.ts:127-130`）、`ProgressRunFacts.startedAt/endedAt`（同文件 142-145）。
  口径是**父会话观测到该事件的时刻**，不是子进程 CPU 时间。

### 15.2 观测到的三个盲点

| # | 现象 | 证据 |
| --- | --- | --- |
| 1 | 任务节点一多，标签全被截断 | 截图 1506 px 宽、16 个节点，`任务 2…` 至 `任务 8…` 全部 ellipsis。根因是模板段（恒 6 个）与任务段（1..N 个，N 由计划决定）共用一条等分 `flex` |
| 2 | 并发不可见 | 工作流并发默认 10（`AGENTS.md` 架构不变量）；轨道是线性脊椎，两行并行与两行串行渲染完全相同 |
| 3 | 耗时不可见 | 时间戳只进详情浮层（§7），轨道节点自身没有任何时间痕迹 |

### 15.3 候选图型

「数据来源」列只区分两件事：**现有事件已足够**（四个 `tool-workflow/*` 事件 + 外层 `seq`/`time`），
还是**需要 recorder 扩展**（会动 `src/records.ts`，属另一批改动）。

| 代号 | 图型 | 回答的问题 | 数据来源 | 不变量影响 | 代价 |
| --- | --- | --- | --- | --- | --- |
| A | 双带拆分：上带只放 7 个模板段，下带放真实任务节点 | 任务节点多时不再压垮模板段，标签不再截断 | 现有事件已足够（`deriveTrack` 已区分 `stage` 与追加节点） | 中：下带若要滚动，与 `client.spec.ts:2007` 的「无横向滚动」冲突，须先决定是「只对上带断言」还是「下带换行不滚动」 | 中高，需按 §14 的 8 宽度用例表重测 |
| B | 段内耗时条：每个节点下一条 2 px 条，长度 = 该段成员总耗时 ÷ run 总时长 | 哪一段慢、卡在哪 | 现有事件已足够（`startedAt`/`endedAt` 两端都有才画，缺一端不估算） | 低：纯段内新增元素，不动等分与连接线 | 低 |
| C | 任务内执行/检查配对：同一 `phase` 的 worker 行与 verifier 行竖向连线、检查行缩进 | 这个任务验了没、验的是什么 | 现有事件已足够（`label` 角色词，`STAGE_ROLE_LABELS` 已在用） | 低：只改分支面板内部的排列，不动轨道、不动状态与百分比 | 低 |
| D | 结算堆积条：一条 100% 宽分段条，按 `outcome` 分色 + 计数（2026-11-22 起为五档：`ok`/`bad`/`retried`/`warn`/`open`，`bad` 只数当前未恢复的失败） | 失败了几条、有几条是失败后重试通过的，不用逐个点开 | 现有事件已足够（`outcome` 原话 + `declared`） | 低：替换或补充 header 里的 `7/11 · 64%` | 极低 |
| E | Run 历史条：顶部 chip 列表，每 run 一个（名字、终态色、时长），点击切换 | 上一次跑到哪、多久 | 现有事件已足够（`foldProgressRuns` 返回全部 run，`selectActiveRun` 只挑一个，`src/progress-tab.ts:469`） | 中：引入「非活动 run」状态，需处理旧 run 无 `doing` 行的空态；`selectActiveRun` 语义要改写或并存 | 中低 |
| F | 真依赖图（DAG，带分支与汇合） | 任务之间谁等谁 | **需要 recorder 扩展**：`run-start` 加计划（任务 id / 标题 / 依赖） | 高：现有「模板脊椎」概念要重写 | 高，且属新事件契约 |

### 15.4 分批建议

1. **第一批：C + D + B。** 三者都在现有 DOM 内加东西，不动等分布局，不动状态机与百分比
   语义，风险集中在几何断言的更新（`test/client.spec.ts`、`test/progress-connector.spec.ts`）。
2. **第二批：A。** 它解决 15.2 的第 1 条，但要动布局契约与那条 `overflow-x` 断言，
   须单独一轮按 §14 的口径做测量（6 场景 × 8 宽度）。
3. **第三批：E，然后 F。** E 是 §13 已列出的未做项；F 必须排在 recorder 扩展之后，
   否则连线只能按到达顺序编，违反 §1「不显示事件流里不存在的数字/关系」。

### 15.5 明确不做

- **环形百分比仪表**：与 header 里已有的 `7/11 · 64%` 重复，纯装饰。
- **ETA / 剩余时间**：事件流里没有计划总数与速率，估算即发明数字，与 §1 非目标冲突。
- **跨任务依赖连线**：任务之间的依赖关系事件里没有。C 只画**任务内部**的 worker→verifier
  配对，那是真事实；跨任务箭头不是。

### 15.6 若将来施工的前置条件

- 颜色仍全走 token，CSS 不含字面色值（§9 的既有断言）。
- 新数字只能来自事件：`declared`、`settled`、`outcome`、时间戳两端。缺一端就写 `—`。
- TS 纯函数与 `src/client/index.js` 手写镜像**双份 fixture 断言**（§11 的既有做法），
  新增派生（如耗时、堆积段、配对分组）必须在两边各写一次。
- 任何布局改动都要跑 §14 的几何用例表，而不是只看一张截图。

### 15.7 未决问题（施工前必须回答）

1. A 的下带：允许带内横向滚动（改断言），还是固定换行、超过 N 行折叠成「+N 个任务」？
2. B 的条长基线：run 总时长（跨段可比），还是该段最长成员（段内可比、跨段不可比）？
   两者信息不同，不能混用同一个视觉。
3. C 在 ≤480 px 的底部抽屉形态下怎么排：缩进 + 连线，还是两行合成一张卡（执行/检查各一行）。
4. E 切换历史 run 时，header 的百分比与「跳转到首个失败」是否跟着切（`selectActiveRun`
   目前假定只有一个活动 run）。

## 17. 双带落地：固定脊 + 竖向任务带（2026-11-21，0.12.19）

参照物是 `docs/knowledge/evidence/progress-tab-mockup-2026-11-21/flow.html`（§15 的 A+C+D+B 组合）。
本节只记**实际做了什么**与**仍然不做什么**；几何证据在
`docs/knowledge/evidence/progress-tab-two-track-2026-11-21/`（9 个场景×宽度 + 两张图），
组件与测量在 `src/client/index.js`（`ProgressView`、`ProgressNode`、`ProgressTaskCard`、
`ProgressPill`、`measureProgressWires`、`progressSettleParts`）。

### 17.1 结构（`CONFIRMED`）

```text
section.gw-progress
  style            ← 作用域样式表，随 Tab 卸载
  .gw-progress-head       标题 + 「已结算/已声明 · 百分比」（live region）
  .gw-progress-settle     结算条（按 outcome 分段，虚线 = 未结算）+ 图例；有运行就一直在
  .gw-progress-flow
    ul.gw-progress-track  6 段固定脊（每段：环 + label + meta + 3px 耗时条）+ 5 条段间连接线
    ul.gw-progress-tasks  任务带：每组行一张卡（卡 = 环 + 名称 + 已结算/耗时 + 行胶囊）
    svg.gw-progress-wires 实测的干线（每 owner 一条）+ 支线（每卡一条，带箭头）
```

- **脊只有 6 段。** `node.kind !== 'extra'` 才进脊；`任务 n · …` 这类计划任务进任务带。所以计划
  任务再多，六个模板段也不会被挤窄（§15.2 的第 1 条盲点）。
- **任务带按 owner 挂线**：`data-owner` = `stage:execute`（计划任务，引擎在 `执行` 槽里宣告它）
  或该行 phase 点名的段。干线 x = 该段圆环中心 x，支线 y = 卡片中线 y，终点 = 卡片左边
  （`viewBox` 用 `.gw-progress-flow` 的相对坐标）。
- **卡与段都是 inert**：没有 `onClick`、没有 `tabIndex`。唯一控件是行胶囊；`canOpen(childId)` 为假
  时胶囊退化成 `span`（形状保留、不可点），因此打不开的行不会跳到别的会话。
- **实测而不是估算**：干线 x 是 flex 折出来的结果，只能量。`useEffect` 每次渲染后量一次，并用
  `ResizeObserver`（有的话）+ `window.resize` 重画；测量结果与上一次相同则不触发渲染，所以收敛
  在 2–3 帧内结束。没有 layout 的宿主（桩渲染器、零宽列）量不到就不画连线，任务带退化成普通列表。
- **窄屏（≤480 px）**：脊转竖排 step list，`.gw-progress-wires` 与段间连接线一起隐藏，任务带
  回到 12px 内距、卡片满宽。这一宽度下没有画干线的地方，顺序即拓扑——这是**明确的取舍**，
  不是遗漏。

### 17.2 时间（`CONFIRMED`，口径同 §15.6）

- 段的耗时 = 该段各行 `endedAt - startedAt` 之和，**两端都在才算**；缺一端的分段不计，整段没有
  可测行则该段 `data-empty="true"`（虚线轨道），不画零长度填充。
- 耗时条基线 = 本次运行里最慢的一段（跨段可比、跨运行不可比）；同一数字同时写在 meta 行，
  读屏不依赖条长。
- 结算条的分段宽度 = 该 outcome 的行数 ÷ 已声明行数；`未结算` 画成虚线缺口，因为那里没有结果。

### 17.3 明确删除（`CONFIRMED`）

手风琴分支面板与 `+N` 收起行（`.gw-progress-branch/members/member/more/stem`）、跳到首个失败
按钮、缩放控件（`PROGRESS_ZOOM_*`、`readProgressZoom`/`writeProgressZoom`、三颗按钮、三条文案、
`--gw-zoom` 倍率）、以及 §16 已删的详情卡。测试里用 `data-gw-progress-*` 逐个断言它们的缺席
（`test/client.spec.ts`、`test/progress-connector.spec.ts`），浏览器证据里另有
`removed={jump:0,branch:0,member:0,more:0,detail:0,zoom:0,retry:0,copyButton:0}` 的扫描。

### 17.4 仍然不做（Phase 2 / 未立项）

- **失败重试**：仍然没有（用户已定推迟）。`src/progress-tab.ts` 的 `details`/`detailFor` 仍照收
  `stage-detail` 事件，视图不消费；将来立项时不必改 fold。
- **run 历史条（E）**、**跨任务依赖箭头（F）**：不画事件流里没有的关系。
- **zoom**：不复活。要更大的字请调浏览器/DSH 字号，Tab 不再自己造一个倍率。

## 18. Guardian 监控侧栏与清新配色（0.13.8）

进度页新增一条独立的 Guardian 监控侧栏。它只消费会话中实际写入的
`tool-workflow/guardian-start`、`guardian-finding`、`guardian-end` 事件，不根据
运行时间猜测“卡住”，也不把 Guardian 的存活判断当成任务质量结论。

- **状态来源**：启动事件写入 timeout guard 是否启用及子任务预算；每次 finding
  由 Guardian 的同一处受控入口写入；结束事件记录是否取消本轮与处置数量。
- **展示范围**：侧栏显示监控中/未启用/结束/已取消、检查预算、救援指导或整轮取消
  记录。旧会话没有这些事件时不显示空的 Guardian 卡片。
- **职责分离**：Guardian 记录只解释存活监控与处置；任务通过与否仍由原有 report /
  verifier 证据决定。结算比例仍是已结算 child call / 已声明 child call，不是任务通过率。
- **配色**：结算卡、任务卡和 Guardian 卡使用 DSH 语义 token 与 `color-mix()` 混合
  出轻量薄荷绿、浅青蓝表面，不固定浅色背景；暗色和高对比主题仍由宿主 token 决定。
  720px 以下总览上下堆叠，窄屏继续沿用既有脊线竖排和任务列表布局。

## 19. 重画契约：一页三态（2026-11-25，`feat/progress-redesign`）

本节是施工契约，不是回填。参照物是仓库根目录的三态设计稿（`.progress.html` 与
`.progress-desktop.png`，gitignored 的本地稿）：**等你点头 / 进行中 / 已完成** 三屏。
状态词汇同 `AGENTS.md`：`CONFIRMED` = 已在本机观测；本节里的「数据」列全部是对
`src/progress-tab.ts` / `src/records.ts` 的 `CONFIRMED` 阅读结论，没有一条来自猜测。

### 19.0 口径订正：六段，不是七段

- `PROGRESS_STAGES`（`src/progress-tab.ts:233`）导出 **6** 条：`start / plan / execute /
  verify / synthesize / end`，`test/progress-tab.spec.ts` 已逐键钉住。
- 旧文本里的「七」是 0.11 时代第七格「回答」的残留：那一格在 §4.1 已删（没有事件能填它）。
  §15.2 与 §17.1 的读数本轮改成 6；§13 里的「7 个阶段空环」是 2026-11-15 当时的实测记录，
  属于历史，不回改。
- 本轮之后**脊椎整体退场**（渲染层不再出现固定六段），但 `PROGRESS_STAGES` 仍是阶段绑定的
  数据契约（phase / role label 命中它、Guardian 与 fold 仍用它），所以「6」这个数字继续由测试钉住。

### 19.1 四区（本轮改动面）

| 区 | 位置 | 现在是什么 | 改成什么 |
| --- | --- | --- | --- |
| 头部 | Tab 顶部 | 标题「任务进度」+ `3/4 · 75%` + 一句结算解释 | run 名（原样）+ 状态胶囊（五态）+「现在」主标题 + 一行小字 |
| 轨道 | 头部下方 | 六段环 + 连接线 + 实测 SVG 干线 + 任务带 + 结算条 | 一条等分分段条（一步一段）+ 琥珀提示条 + 「后面还有」一行 + 步骤清单 |
| 收尾 | 轨道下方 | 任务带 + Guardian 卡 | 「经过」逐行日志 + 「交卷」卡 + Guardian 卡（保留，仅换色） |
| 聊天任务卡片 | `workflow-run` 节点 | 折叠区 + 每 phase 一段行 | 同一套状态词与颜色；行 = 角色 + 任务标题 + 状态词 + 打开胶囊 |

### 19.2 状态与步骤（`CONFIRMED` 数据来源）

- **胶囊五态**（读 run 事实，不读计划数）：`waiting` = 未结束且 `declared === 0`；
  `running` = 未结束且 `declared > 0`；`done` = 已结束且 `stopReason === 'completed'`；
  `cancelled` = 已结束且 `stopReason === 'cancelled'`；`failed` = 其余已结束。
  `stopReason` 由 `src/records.ts` 按报告写，`completed` 已经等于「每个任务都核过」，不是「程序跑完了」。
- **步骤（轨道分段）**：有计划任务（`kind === 'extra'` 且 `taskNumber` 有值、非 Guardian）时，
  一步 = 一个计划任务，按 `taskNumber` 排；没有计划任务时（triage / 单调用 run），
  一步 = 一行已声明的**工作腿**调用（`执行` / `检查` / `复核`），按 `seq` 排——`规划` 与 `汇总`
  两条腿不是「要做的事」，它们照常出现在「经过」里，但不占一步（真机读数见 §19.9 第 1 条）。
  `total = steps.length`。
  `at` = 第一个 `doing` 的步，否则第一个 `failed`，否则第一个未完成的步，否则 `total`。
- **段色**：`done → 绿`、`doing → 蓝（流动）`、`failed → 琥珀`、其余 `灰`。**任何地方不出现红**。
- **现在**：主标题 = 当前步的标题（计划任务标题原样，不截断不重编号）；**没有步时**（还没拆出计划、
  这一轮没有计划任务、或计划任务都还没声明）一律写 `progress.now.planning`；已结束且全过时写
  `progress.now.done`。小字 = 正在跑的那一行的角色 +
  `progress.now.suffix`，已结束写 `progress.now.allPassed`，并附 `progress.now.step`。
- **琥珀提示条**：仅当当前步存在未恢复的失败时出现，数字取该单元的尝试次数
  （label 的 `（尝试 n）` 后缀，已有 `progressAttemptOf` 一类规则）。
- **后面还有**：当前步之后的步标题，按顺序，`、` 连接；没有就整行不渲染。
- **经过（日志）**：每行一条已声明调用，按 `seq`；时间取 `startedAt`，角色取 label（去掉尝试后缀，
  沿用 `memberLabel` 的词），标题取 phase 原文（计划任务标题），状态词按角色：执行→做完、
  检查→过了、复核→通过、汇总→交卷（若该行就是 `summary-final` 指定的稿）、失败→没过、未结算→正在看。
  失败行与正在跑的行用琥珀 / 浅蓝底，其余行只用分隔线。
- **交卷**：`summary-final` 的 `draft` → 第 n 篇汇总稿那一行（按 `seq` 第 n 个汇总角色行）。
  卡片写「汇总·第 n 稿（定稿）」+ 打开胶囊；**事件里没有汇总正文**，所以卡片不显示正文（见 §19.8）。
  没有 `summary-final` 时显示 `progress.final.missing`，不猜哪一稿是定稿。
- **依赖既有派生**：`progressNodeState` / `recoveredFailureSeqs` / `PROGRESS_CHAIN` /
  `progressTaskNumber` / `orderTaskCards` 全部继续用（§5.1 的「红只表示现在还是坏的」改成琥珀后语义不变）。

### 19.3 文案表（施工以本表为准；中英同键，缺一即失败）

| 键 | 中文 | English | 用在哪 |
| --- | --- | --- | --- |
| `progress.chip.waiting` | 等你点头 | Waiting for you | 头部胶囊 |
| `progress.chip.running` | 进行中 | Running | 头部胶囊 |
| `progress.chip.done` | 已完成 | Done | 头部胶囊 |
| `progress.chip.failed` | 未通过 | Not passed | 头部胶囊（琥珀） |
| `progress.chip.cancelled` | 已取消 | Cancelled | 头部胶囊（琥珀） |
| `progress.now.label` | 现在 | Now | 小标题 |
| `progress.now.planning` | 正在拆活 | Planning | 主标题（还没声明行） |
| `progress.now.done` | 做好了 | Done | 主标题（已结束全过） |
| `progress.now.suffix` | 正在看 | is checking | 小字：`{role}` + 本键 |
| `progress.now.allPassed` | {total} 步全过 | All {total} steps passed | 小字（已结束） |
| `progress.now.step` | 第 {at} 步，共 {total} 步 | Step {at} of {total} | 小字 |
| `progress.steps.aria` | 进度：第 {at} 步，共 {total} 步 | Progress: step {at} of {total} | 轨道 `aria-label` |
| `progress.flag.retrying` | 第 {n} 遍没过，正在重看 | Attempt {n} failed, rechecking | 琥珀条 |
| `progress.flag.failed` | 第 {n} 遍没过 | Attempt {n} failed | 琥珀条（已结束） |
| `progress.rest` | 后面还有：{list} | Still to come: {list} | 轨道下方一行 |
| `progress.plan.title` | 要干的 {count} 件事 | {count} things to do | 步骤清单标题 |
| `progress.plan.waiting` | 等着 | Waiting | 步骤状态词 |
| `progress.plan.running` | 在做 | Doing | 步骤状态词 |
| `progress.plan.done` | 过了 | Passed | 步骤状态词 |
| `progress.plan.failed` | 没过 | Not passed | 步骤状态词（琥珀） |
| `progress.plan.cancelled` | 没做 | Cancelled | 步骤状态词 |
| `progress.log.title` | 经过 | History | 日志标题 |
| `progress.log.done` | 做完 | Did it | 行状态词 |
| `progress.log.passed` | 过了 | Passed | 行状态词 |
| `progress.log.reviewed` | 通过 | Approved | 行状态词（复核） |
| `progress.log.running` | 正在看 | Checking | 行状态词 |
| `progress.log.failed` | 没过 | Not passed | 行状态词（琥珀） |
| `progress.log.shipped` | 交卷 | Shipped | 行状态词（定稿） |
| `progress.log.cancelled` | 取消 | Cancelled | 行状态词 |
| `progress.final.title` | 交卷 | Handed in | 卡片区标题 |
| `progress.final.mark` | （定稿） | (final) | 稿名后缀 |
| `progress.final.missing` | 这一轮没有交卷稿 | This run handed in no draft | 无 `summary-final` |
| `progress.dock.start` | 开工 | Start | 按钮（等你点头） |
| `progress.dock.accept` | 收下这版 | Accept this version | 按钮（已完成） |
| `progress.dock.hintStart` | 要改就说一声，我重拆 | Say what to change and I'll re-plan | 按钮下小字 |
| `progress.dock.hintAccept` | 不满意就说，我重做 | Say what's off and I'll redo it | 按钮下小字 |
| `progress.dock.quiet` | 不用你说话，好了叫你 | Nothing needed from you; I'll call you | 无按钮时那一行 |
| `progress.dock.fill` | 确认 | yes | **填进输入框的那几个字**（§19.5） |
| `progress.dock.filled` | 已填进输入框，按发送 | Filled the box; press send | 点完后的状态行（`aria-live`） |
| `progress.member.open` | 打开子会话 | Open child session | 行胶囊（沿用） |
| `progress.chain.execute` | 执行 | Execute | 任务内链（沿用） |
| `progress.chain.check` | 检查 | Verify | 任务内链（沿用） |
| `progress.chain.review` | 复核 | Review | 任务内链（沿用） |

**删除的键**（两本字典一起删，`test/i18n-parity.spec.ts` 的键集必须两边同时少）：
`progress.title`、`progress.aria`、`progress.percent`、`progress.percentHint`、`progress.unsettled`、
`progress.stage.*`（六个）、`progress.extraHint`、`progress.state.*`（六个）、
`progress.derived.runEndedUnsettled`、`progress.derived.outcomeUnsettled`、`progress.notReported`、
`progress.empty.body`、`progress.settle.*`（六条）、`progress.tasks.aria`、`progress.branch.*`（四条）、
`progress.evidenceHint`、`progress.chain.pendingHint`、`progress.source.*`、`progress.field.*`。
`progress.empty.title`、`progress.guardian.*` 保留。

### 19.4 按钮①：只填框，不代发（`CONFIRMED` 机制）

- 机制：`conversation` 服务的输入门面。`services.sessions.binding(sessionId).ctx` 是会话作用域
  上下文（`dsh-api-session-controller` 的 `SessionBinding.ctx`），
  `conversation.input.for(binding.ctx).setDraft(progress.dock.fill)` 把字写进输入框。
- **绝不调 `conversation.send`**：`send` 是「代用户发一条消息」，与「只填框」相反；本 Tab 也不写会话事件。
- 词表对得上：`src/block/approval.ts` 的 `APPROVAL_ANSWERS` 收 `确认 / 开工 / 可以 / 同意 / 没问题`
  与 `yes / ok / approve / go ahead / confirmed / proceed`；`progress.dock.fill` 取 `确认`（中）/ `yes`（英），
  所以填完用户自己按发送就能过门禁。
- 服务缺席时（组合里没有 `conversation`）：**不渲染按钮**，退回 `progress.dock.quiet` 那一行，
  不假装填过。填失败（门面拒绝、编辑器锁定）时不显示 `progress.dock.filled`。
- 按钮是页面上唯一的控件之一（另一个是行胶囊）；卡、段、日志行仍 inert（§16 的 Q2 不变）。

### 19.5 视觉不变量（测试逐条钉住）

- **颜色全走 token**：正文用 `--dsw-alias-label-primary/secondary`，边 `--dsw-alias-border-l2`，
  底 `--dsw-alias-bg-layer-2`，绿 `--dsw-alias-state-success-primary`，蓝 `--dsw-alias-state-business-primary`，
  琥珀 `--dsw-alias-state-warn-primary`，灰 `--dsw-alias-state-idle-primary`。
  **进度页 CSS 里不出现 `--dsw-alias-state-error-primary`，不出现任何字面色值**（既有断言，继续钉）。
- **无横向滚动**（`not.toContain('overflow-x: auto')` 继续钉）；轨道 `display: grid` 等分，
  ≤480 px 转竖排（步骤清单本身就是竖排，轨道在窄屏可退化为一行数字，但不得溢出）。
- **退场的 DOM**：`.gw-progress-track`、`.gw-progress-seg`、`.gw-progress-ring`、`.gw-progress-glyph`、
  `.gw-progress-link`、`.gw-progress-wires`、`.gw-progress-overview`、`.gw-progress-settle*`、
  `.gw-progress-detail*`、`--gw-zoom` 全部不再出现（`test/client.spec.ts` 逐条断言缺席）。
- **新 DOM 钩子**（测试与真机都按这些找）：`[data-gw-progress-chip]`、`[data-gw-progress-now]`、
  `[data-gw-progress-steps]`、`[data-gw-progress-step]`（带 `data-state`）、`[data-gw-progress-flag]`、
  `[data-gw-progress-rest]`、`[data-gw-progress-plan]`、`[data-gw-progress-log]`、
  `[data-gw-progress-log-row]`（带 `data-state`）、`[data-gw-progress-final]`、
  `[data-gw-progress-dock]`、`[data-gw-progress-dock-fill]`。
- **风格作用域**：所有规则以 `.gw-progress` 开头，`<style>` 随 Tab 卸载（既有做法）。

### 19.6 聊天任务卡片

- 保留既有 DOM 钩子（`data-workflow-run`、`data-run-title`、`data-run-status-text`、`data-phase-*`），
  所以已有的外部读取不破；改的是词与色：状态词改用 §19.3 的五态词，失败行琥珀不红，
  行 = 角色 + 任务标题 + 状态词 + 打开胶囊，去掉「N 行」解释句与空的「事件中没有报告」。
- 卡片的「展开/收起」保留（它是惰性结构，不是解释）；行胶囊仍只在 `canOpen` 为真时出现。

### 19.7 诚实边界（不做）

1. **开工前的计划清单**：事件流里没有计划，只有已经声明过的调用。所以「等你点头」这一态的
   清单只能列出声明过的任务；没声明的步不画、不猜，轨道总长就是已声明的步数。
2. **交卷正文**：最终答案由 gate 在整轮结束后直接交付，不是子调用行，事件里没有它的文字；
   交卷卡只写稿名与打开胶囊。
3. **百分比 / ETA / 通过率**：一个新数字都不加，`declared/settled` 也不再当页首指标（改由步数与日志陈述）。
4. **跨任务依赖箭头、run 历史条**：仍不做（§15.5、§17.4 不变）。

### 19.8 守卫（先红后绿）

- 文档口径：`test/progress-tab.spec.ts` 既有「六段」守卫保留，并新增两条：脊的段数陈述里
  不得再出现七（本轮订正的两处句式）、以及任务带段数的陈述与 `PROGRESS_STAGES.length` 一致。
- 文案：`test/i18n-parity.spec.ts` 键集对齐；新增一条：本表列出的新键在两本字典里都存在，
  删除清单里的键两边都不存在。
- 零说明：`test/progress-hint-absent.spec.ts` 的禁用族扩到本轮删掉的解释句（含 `percentHint` 的原文
  「这不是任务通过数」/「not a task verdict」、`notReported` 的「事件中没有报告」、`derived` 的两句）。
- 渲染：`test/client.spec.ts` 新增三态 fixture（等你点头 / 进行中 / 已完成）逐字断言胶囊、主标题、
  小字、轨道分段数与 `data-state`、琥珀条、经过行、交卷卡、按钮文案；再加一条：点击按钮调用
  `setDraft` 且**没有**调用 `send`（用手写替身门面断言调用记录）。
- 模型：`test/progress-tab.spec.ts` 新增同一批 fixture 的 `deriveProgressStory` 断言（TS 与
  `src/client/index.js` 的手写镜像双份，沿用 §11 的做法）。

### 19.9 回填：第一轮真机读数（2026-11-25 19:37–19:39，`CONFIRMED`）

环境：隔离克隆（`node scripts/clone-profile.mjs` 从 live `~/.dsh/profiles/web` 克隆，profile `web-clone`）、
`DSH_HOME=.tmp/soak-progress/dsh-home`、端口 **3361**、`npm pack` 后 `dsh plugin --profile web-clone add
file:…/dsh-grok-workflow-0.13.38.tgz`（版本读回 `0.13.38`，`sha256(lib/client.js)` = `abaac0e9…` 与工作树逐字相同）、
五个角色 + guardian + 默认 agent 模型钉到 `bifrost-responses/opencode-go/muse-spark-1.3-contributor`（本机没有
`AGENT2API_API_KEY`）、工作区指到一次性 `.tmp/soak-progress/work`。一个真实运行：目标「写 notes.md 三行安装步骤 +
写 test.txt 一行 hello」，**9 条声明调用 / 2 个计划任务 / 约 2.5 分钟 / `console_errors: []`**，页面先 `进行中`
后 `已完成`（截图与逐字文本在 `.rsi/evidence/progress-redesign-2026-11-25/`）。

**这条读数改了一处契约（§19.2，已改）**：没有计划任务的窗口里，旧规则把「规划」这条腿算成一步，
于是屏幕上写着「第 1 步，共 1 步 / 要干的 1 件事：规划」。规划与汇总是 run 自己的两头，不是要做的事，
所以它们现在只出现在「经过」里、不占一步；没有步时主标题写 `progress.now.planning`。

**一条上游缺口（`CONFIRMED`，本轮不修，不是本页的错）**：这次运行产出了 `汇总·第1稿/第2稿/第3稿` 三条，
却**没有写 `summary-final` 事件**（会话日志里 `tool-workflow/*` 共 24 条：`run-start` 1、`agent-start` 10、
`agent-end` 10、`guardian-start` 1、`guardian-end` 1、`run-end` 1、`summary-final` **0**）。
原因是 `src/report.ts:1170` 的 `shippedSummaryDraft()` 只认 review 里逐字出现的 `check=pass verify=pass drafts=N`；
这一轮的 review 不是这个形状，于是「哪一稿是定稿」从未被记录。本页因此如实显示 `progress.final.missing`——
它没有猜（§19.7 第 2 条），但这也意味着：**交卷卡在真机上多半是空的，直到那条 review 形状被修**。

**没有截到的一态**：`等你点头`（`declared === 0`）的窗口是 `run-start` 到第一条 `agent-start` 之间，
真机上手点不到（D-156 已写明截不到就照实报 `NOT_RUN`）。这一态由组件用例覆盖（真实 DOM + 真实事件 fixture），
不冒充真机读数。

## 20. 布局细化：两栏躯体、Guardian 四块、任务行就地展开、经过折叠（2026-11-25，`feat/progress-layout-detail`）

§19 定的是这一页**说什么**（五态胶囊、现在、分段条、步骤、经过、交卷、按钮）。本节记的是**同一页怎么说**：
躯体变成两栏，Guardian 从「标题 + 一条清单」变成四块瓦片，每颗计划任务行都能就地展开**它这一次任务**的调用，
「经过」超过一屏时留一个字收放。本节全部是 `CONFIRMED`：源码 `src/client/index.js`（五颗提交之后与
`lib/client.js` 逐字相同，blob `e14880c`，`347526` 字节），用例 `test/progress-layout.spec.ts` 的 20 条，
门禁转录 `.rsi/evidence/progress-layout-detail-2026-11-25/gate-d0c924a.out`（`d0c924a`）。

一条边界先说清楚：**产品面只动了浏览器包**。`src/progress-tab.ts`、fold、`src/records.ts`、事件集，以及页面上
每一个数字，一个字没改；`b0fbd20..d0c924a` 的改动面只有 6 个文件（`src/client/index.js`、`lib/client.js` 与四个 spec）。

### 20.1 躯体结构（`CONFIRMED`）

```text
section.gw-progress
  style
  .gw-progress-head            头部：run 名 + 五态胶囊
  .gw-progress-now             「现在」主标题 + 一行小字
  .gw-progress-steps           等分分段条
  .gw-progress-flag            琥珀条（仅当前步有未恢复的失败）
  .gw-progress-rest            「后面还有」
  div.gw-progress-columns      ← 只有 run.guardian.started === true 才渲染
    div.gw-progress-main         左列：步骤清单 → 「经过」 → 「交卷」，按这个顺序
    aside.gw-progress-side       右列：aside.gw-progress-guardian（沿用 data-state / aria-label）
  .gw-progress-dock            底部按钮，或「不用你说话」那行
```

- **头部到「后面还有」都在网格之上，dock 在网格之下**。它们不参与分栏——两条小标题线不会被右列挤窄。
- **没有 Guardian 就没有包裹层**：三个 section 直接是页面的流，既没有 `div.gw-progress-columns`，也没有一列空的
  `aside`。空列是一句这一页兑不了的承诺（D-157）。
- **Guardian 内部是四块瓦片**：`div.gw-progress-guardian-blocks[data-gw-progress-guardian-blocks]` 里
  `div.gw-progress-guardian-block[data-gw-progress-guardian-block]` = `status` / `budget` / `count` / `findings`。
  findings 那一块横跨两列，里面仍是原来的清单，或 `progress.guardian.empty` 那一句。
- **任务行是一个按钮加一段详情**：`li.gw-progress-plan-row[data-open]` 里
  `button.gw-progress-plan-toggle`（序号 + 标题 + 命中的链段，`aria-expanded`、
  `aria-controls="gw-progress-task-detail-<index>"`、`title` = `progress.task.detail`）；状态词留在按钮**外面**，
  所以行的可见文字与改造前逐字相同——按钮只多了一个**看的方式**，没有多一个**要读的词**。展开时
  `ol.gw-progress-plan-detail[data-gw-progress-task-detail]` 挂在同一行里（`331f181` 把它从 `div` 改成真正的
  `ol`：里面是 `li`，`li` 必须有列表父节点）。

### 20.2 钩子表（`CONFIRMED`，测试与真机都按这些找）

| 钩子 | 挂在谁身上 | 取值 / 作用 |
| --- | --- | --- |
| `data-gw-progress-columns` | `div.gw-progress-columns` | 有 Guardian 才出现；两栏网格容器 |
| `data-gw-progress-main` | `div.gw-progress-main` | 左列：步骤清单、经过、交卷 |
| `data-gw-progress-side` | `aside.gw-progress-side` | 右列：Guardian |
| `data-gw-progress-guardian-blocks` | `div.gw-progress-guardian-blocks` | 四块瓦片的网格 |
| `data-gw-progress-guardian-block` | `div.gw-progress-guardian-block` | `status` / `budget` / `count` / `findings` |
| `data-gw-progress-plan-toggle` | `button.gw-progress-plan-toggle` | 每颗任务行一个；`aria-expanded` + `aria-controls` |
| `data-gw-progress-task-detail` | `ol.gw-progress-plan-detail` | 值 = 该步的 step key；`id` = `gw-progress-task-detail-<index>` |
| `data-gw-progress-task-chain` | 详情行里的链段 chip | `执行` / `检查` / `复核`；角色点不到槽位时不出现 |
| `data-gw-progress-open` | 详情行末尾的胶囊 | 沿用既有胶囊；只在 `canOpen(childId)` 为真时出现 |
| `data-gw-progress-log-toggle` | `button.gw-progress-log-toggle` | 超过 6 行才出现，落在「经过」标题同一行的右端 |
| `data-expanded` | `ol.gw-progress-log` | `true` / `false`；折叠状态的唯一 DOM 读数 |
| `id="gw-progress-log-list"` | `ol.gw-progress-log` | 折叠按钮 `aria-controls` 的目标 |

详情行保留历史行的四个钩子（`data-gw-progress-log-row`、`data-state`、`data-gw-progress-log-time`、
`data-gw-progress-log-word`），一行一条该任务的成员，按 `seq` 排。**历史行不加胶囊**：详情是同一条声明的第二种读法，
不是它的替代。

### 20.3 CSS 契约（`CONFIRMED`，测试逐条钉住）

- 两栏：`.gw-progress-columns { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 16px; align-items: start; }`
  ——右列固定 240px，左列 `minmax(0, 1fr)`（长标题只会自己省略，不会把网格撑破）。
- 窄屏：`@media (max-width: 720px) { .gw-progress-columns { grid-template-columns: minmax(0, 1fr); } }`
  ——一列，Guardian 落到步骤清单与经过之下，正是 DOM 本来的顺序。
- 瓦片：`.gw-progress-guardian-blocks { grid-template-columns: repeat(2, minmax(0, 1fr)); }`，findings 那块
  `grid-column: 1 / -1`。
- 折叠：`.gw-progress-log[data-expanded="false"] { max-height: 264px; overflow-y: auto; }`，
  `.gw-progress-log[data-expanded="true"] { max-height: none; overflow-y: visible; }`。
- **仍然没有 `overflow-x: auto`**（既有断言继续钉）；**仍然没有字面色值**（`#hex` / `rgba()` 不出现），
  也仍不出现 `--dsw-alias-state-error-primary`。

### 20.4 折叠：阈值与上限（`CONFIRMED`）

- `PROGRESS_LOG_FOLD_AT = 6`，判据是 `story.log.length > 6`：**六行及以下连按钮都不出现**，六行正好不折。
- 折叠时列表高 264px、竖向滚动；展开时把上限拿掉。**没有一行被丢掉，也没有一行被概括**——上限是画的上限，
  不是数据的摘要。
- 按钮两个词，各管一个方向：`progress.log.more`（展开全部 / Show all）↔ `progress.log.less`（收起 / Collapse）。

### 20.5 展开状态（`CONFIRMED`）

- `ProgressView` 里两个 `useState`：`openTasks`（按 step key，**行与行独立**，默认全关，越界就 `delete`）与
  `logOpen`（默认关）。这是页面上仅有的两处「读者自己打开的东西」。
- **没有用原生 `<details>`**：行的可见文字必须逐字不变，而展开状态必须来自一个 `useState`——壳自己的渲染
  不保证 `<details>` 的展开状态跨快照存活（D-157）。

### 20.6 一条详情行说什么（`CONFIRMED`，`08018bf` 改，`d0c924a` 钉）

- 详情行 = **时刻 · 门 · 结果 · [胶囊]**。链段 chip 站的是**角色的位置**（`memberLabel()` 写的正是链段的动词），
  所以不再在 chip 旁边重复一遍角色词；任务标题上一行的行头已经写着，行里也不再印第二遍。
- 一条展开的行在真机上读作（包工头的独立探针，行头是 `1 任务 1 · 建表 执行 → 检查 过了`）：

  ```text
  6:15 执行 做完
  6:16 检查 过了 打开子会话
  ```

- **角色点不到槽位时词留下**：这时没有 chip 可以顶替它，一条「有时刻、有结果、不说谁跑的」行，比它替换掉的那行说得更少。
- 历史行（不传 options）**一个字没动**：角色 + 任务名，仍照 `title === role` 那条规则去重。
- 没有新钩子、新文案、新 CSS：chip 的规则与一行的四列本来就在。
- `d0c924a` 把这条形状钉进守卫：整行逐字文本、一行只有一个门词、标题在行头出现 1 次而详情里 0 次、
  无门的那行留角色词且没有 chip。

### 20.7 文案（`CONFIRMED`）

三个新键，中英各一份，`test/i18n-parity.spec.ts` 的 `REDESIGN_COPY` 表同步加三行：

| 键 | 中文 | English | 用在哪 |
| --- | --- | --- | --- |
| `progress.task.detail` | 详情 | Detail | 任务行按钮的 `title` |
| `progress.log.more` | 展开全部 | Show all | 经过折叠按钮（折叠态） |
| `progress.log.less` | 收起 | Collapse | 经过折叠按钮（展开态） |

没有第四句解释。**Guardian 没有新词**：四块里每一个字都是既有的 `progress.guardian.*`——状态块 = 标题 + 状态词，
预算块 = `progress.guardian.budget`，计数块 = `progress.guardian.count`，findings 块 = 清单或
`progress.guardian.empty`。

### 20.8 两处偏差（照实记）

1. **链段 chip 的 class 是 `gw-progress-plan-chain`，不是 `gw-progress-task-chain`**：`test/progress-connector.spec.ts`
   禁止已退役的 `gw-progress-task` 这个子串，class 只能改名。身份仍在钩子上——`data-gw-progress-task-chain`。
   class 只负责样式，钩子才是指纹。
2. **行按钮的 `aria-controls` 指向的元素只在行展开时存在**。disclosure 模式允许这样（控件先声明它将要画的那块），
   严格的校验器会把它挑出来。接受这个不完美，比给每一行常驻一个空容器更干净。

### 20.9 没动的（`CONFIRMED`）

- `src/progress-tab.ts`、fold、`src/records.ts`、四类 `tool-workflow/*` 事件、`summary-final`：零改动。
- 页面上每一个数字：零改动。新布局不印百分比、不印估算、不印通过率（`test/progress-layout.spec.ts` 末条钉住）。
- 步骤清单、经过、交卷的**词**：行的可见文字逐字相同；详情是同一批声明的第二次渲染，由 `progressStoryLogRow()`
  一处供料（`deriveProgressStory` 的 log 也走它），所以详情不会把一次调用描述成与日志不同的样子。

### 20.10 与 §16 / §17.1 / §19.4 的取代关系（重要）

§16 的「成员卡 inert」、§17.1 的「卡与段都是 inert」、§19.4 的「按钮是页面上唯一的控件之一（另一个是行胶囊）；
卡、段、日志行仍 inert」——这句话里**「页面除 dock 按钮与打开胶囊之外全惰性」的部分，本节起不再成立**。
现在页面上的控件是四类：dock 按钮、行胶囊、**每颗计划任务行一个展开按钮**、
**「经过」标题旁的折叠按钮**。

三个变的是惰性口径、不是交互语义：

- §16 的 Q2（点卡片空白处什么都不发生）不变：按钮是按钮，行的空白处仍然什么都不做。
- 段的等分、琥珀条、`data-state` 语义不变；折叠与展开不改任何状态词。
- 新控件都不写会话事件、不发网络请求、不调 `conversation.send`（§19.4 的机制一个字没改）。

### 20.11 真机回填（2026-11-25，隔离档案；`CONFIRMED`）

产物全部在 `.rsi/evidence/progress-layout-detail-2026-11-25/`（25 个文件 / 1.4 MB）：截图、逐字 `innerText`、
钩子计数、时间线、两侧控制台、门禁原始输出、以及写清每条读数出处的 `README.md`。**这台浏览器是 soak agent
开的，本轮读的是产物**，不是本节作者亲手敲的。

**环境与安装身份。** Node v26.8.1 / npm 11.19.0 / DSH 0.2.2-rc.3；`web-clone` 从 live `~/.dsh/profiles/web`
克隆（`files 7731 -> 7731 (88493399 bytes)`、`links 5`、`parity 5/5 equal after redaction`、
`dependencies 17 declared, 0 unresolved`、`credentials redacted: 1 line(s) in 1 file(s)`），端口 3371，
playwright 1.62 + `chromium_headless_shell-1248`，视口 1500×1600，poll 250 ms。克隆只动 soak 四类东西
（删残留 `mode: triage`、角色与模型钉到 `bifrost-responses/opencode-go/muse-spark-1.3-contributor`、
工作区重指、端口），**产品代码与 schema 一个字没动**。两侧都是真安装：

| 侧 | tgz `sha256` | 版本读回 | `sha256(lib/client.js)` | 字节 |
| --- | --- | --- | --- | --- |
| 基线 `b0fbd20` | `28c5d8b4c7f7f0258be6205a3747bc28bfab04cf25eb327c914211d274bff88b` | `0.13.39` | `38702aa1e50bb483ecdddeba0050632dc627b874eee05958c57f17071063fa6c` | 334321 |
| 本分支（产品 `d0c924a`） | `acf2476d08b6677ec8427a717c7e05526ca3306f8f0789f85005de7d680840d9` | `0.13.39` | `5745b15c379d28e99d1536cefce90154d3ebcc5d9d5c7d2a9c7b991ab6fced3a` | **347526** |

**三态与前后对照。** 同一脚本、同一份克隆档案各跑一次真运行：基线 等你点头 **9.19 s** / 进行中 **9.79 s** /
已完成 **197.83 s**，本分支 **15.84 s / 16.22 s / 170.00 s**；两侧完成页都写 `做好了` / `2 步全过`。
完成态钩子（`querySelectorAll(...).length`）：`columns` **0 → 1**、`main`/`side` **0/0 → 1/1**、
`guardian` 1 → 1、`guardian-blocks` **0 → 1**、`guardian-block` **0 → 4**（`status`/`budget`/`count`/`findings`）、
`plan-toggle` **0 → 2**、`log-toggle` **0 → 1**、`task-detail` 0 → 0（点开后 1）、`log-row` **9 → 8**、
`plan-row` 2 → 2。四条主断言（columns / plan-toggle / log-toggle / guardian-block）在真机上全部成立。

**两处必须照实记。** ① **「等你点头」那一瞬还没有 Guardian**（事件还没写），所以那时 `guardian 0`、`columns 0`——
「有 Guardian 才有两栏」这条规则在真机上正好对上，而不是被真机推翻（running 与 done 都是 1/1）。
② 本分支这一轮的完成页是 **8** 条历史行（基线那轮是 9 条）且照样出现折叠按钮：条数是**这次运行**自己的性质，
不是页面的性质；6 行阈值与 8 行的关系也说明按钮按的是条数、不是高度。

**开一行、折历史、窄屏。** 点第一行 `[data-gw-progress-plan-toggle]`：`aria-expanded` `false → true`、
`aria-controls="gw-progress-task-detail-0"`、`task-detail` 0 → 1，行内三行逐字是

```text
21:38  执行  做完  打开子会话
21:38  检查  过了  打开子会话
21:38  复核  通过  打开子会话
```

也就是 §20.6 那条形状（`时刻 门词 结果词 [入口]`，每个门词只出现一次）。折叠：`展开全部 → 收起`、
`aria-expanded` `false → true`、`data-expanded` `false → true`、
`max-height: 264px / overflow-y: auto` → `none / visible`、`id="gw-progress-log-list"` 始终在。
1500 px：`grid-template-columns: 957px 240px`、gap 16 px、main 957 宽、side 240 在 x=1253、
`scrollWidth 1500 = clientWidth`。**700 px**：单轨 `693px`、Guardian 落到历史下面（main `y=233…937`、side `y=953`）、
`scrollWidth 700 = clientWidth 700`——没有横向滚动。

**控制台与红线。** 两侧整轮 `{"consoleErrors": [], "pageErrors": []}`。`~/.dsh` 与 `~/.dsh/profiles` 的 mtime
全程未变（`2026-11-22 23:40:20` / `2026-11-22 16:59:46`）、`touch ~/.dsh/.soak-probe` →
`Read-only file system`、3080 开跑前与收尾后都是 401、3371 只在实例活着时 401、scratch `.tmp/soak-layout/`
（140 MB）整棵删除。未 push、未打 tag、未 bump、未 publish。

**仍然 `NOT_RUN` 的四条**（不要升级成「验过」）：发送前的基线页面快照（空会话不挂载进度 Tab，两侧都没有，
早期那两张被删掉、没有补拍）、未通过 / 已取消两态（两次运行都 `completed`）、点「开工 / 收下这版」之后读输入框里的字
（只验到按钮存在与文案）、live 档案升级 / 重载 / 重启（红线）。

## 21. 流程图：一步一节点、当前高亮、底下挂行、底部计数（2026-11-25，`feat/progress-flowchart`）

§19 定「说什么」，§20 定「怎么说」，本节把这两节一起换掉：操作者拍板**改回可视化流程图**——四区版退场。
本节全部是 `CONFIRMED`：源码 `src/progress-tab.ts`（`deriveProgressFlow`）、`src/client/index.js`（镜像 + 渲染 + 样式）、
五个 spec、门禁转录 `.rsi/evidence/progress-flowchart-2026-11-25/`，基线是 `main` 尖端 **`57dcf04`**。

### 21.1 页面（`CONFIRMED`）

```text
section.gw-progress
  style
  header.gw-progress-bar      run 名 + 五态胶囊（钩子不变）
  div.gw-progress-flow        流程图：svg.gw-progress-wires 实测连线 + ol.gw-progress-nodes
    li.gw-progress-node       一个节点：圆点 + 腿词 + 角标 +（有行时）展开按钮 +（展开时）它自己的调用
  aside.gw-progress-guardian  沿用（钩子、四块瓦片、词都没动）
  footer.gw-progress-foot     还剩 N 步 / 共 M 步 + dock（只有按钮与 filled 行）
```

- **节点 = 一条腿的一次访问**：`起点 / 规划 / 执行 / 检查 / 复核 / 汇总 / 终点`。
  两端是结构节点（`start` 恒 `done`；`end` 随 `stopReason`：未结束 `pending`、`completed` `done`、
  `cancelled` `cancelled`、其余 `failed`）。中段五条腿由**调用自己的 label** 认出来，不看 `phase`（`phase` 是任务标题）。
- **重复的腿各占一个节点**：同一腿连排且这一行 label 里没有数字（或数字等于已开那颗的序号）→ 并进前一颗；
  否则按 label 里的**第一个整数**开新的一颗（`规划（第2次）` → 2、`汇总·第2稿` → 2、`执行（尝试 2）` → 2）。
  于是「规划两次」是两颗节点，「汇总写过三稿」是三颗节点，「两个任务各跑一次执行」是一颗节点挂两行。
- **角标**：`汇总` 每一颗都写「第 N 稿」；其余腿只有 `ordinal > 1` 才写「第 N 次」（一次就是常态，不给常态加字）。
- **认不出腿的行不许丢**：挂到前一个节点；前面没有任何中段节点时挂到 `start`（所以 `start` 的 `members` 通常为空，
  但不保证为空——宁可多一颗按钮，也不丢一条已声明的调用）。
- **Guardian 那行不进图**：它有自己那一块监控。

### 21.2 状态与当前（`CONFIRMED`）

| 观感 | `data-state` | token |
| --- | --- | --- |
| 已过变绿 | `done` | `--dsw-alias-state-success-primary` |
| 当前高亮（呼吸点 + 外描边） | `doing` | `--dsw-alias-state-business-primary` |
| 未到置灰（虚线边、空心点） | `pending` | `--dsw-alias-state-idle-primary` |
| 失败 / 阻塞 / 取消 = 琥珀 | `failed` / `blocked` / `cancelled` | `--dsw-alias-state-warn-primary` |

中段节点的状态直接取 `nodeState(members, ended)`（既有函数：恢复过的失败不算、未结算算 doing、结束仍挂空算 blocked）。
`at`（当前节点，1 基）：最早一条未结算调用所在的节点 → 否则未结束取 `end` → 否则第一颗 `failed`/`blocked` →
否则 `total`；一条中段节点都没有且未结束时是 1。`remaining = total - at`，`total = nodes.length`（**含两端**）。
高亮节点若本身是 `pending`，渲染成 `doing`；其余节点 `data-current="false"`。

### 21.3 连线（`CONFIRMED`）

- 渲染后**实测**：`measureProgressFlowWires()` 读 `.gw-progress-flow` 与每个 `[data-gw-progress-node]` 的 rect，
  只画两种真实相邻——同一行左右相邻（横线：右缘中点 → 左缘中点）与上下相邻（竖线：下缘中点 → 上缘中点）。
  **折到下一行的那一对不画线**：画了就是在主张一条读者看不见的路。
- 每次渲染量一遍，`ResizeObserver`（有的话）+ `window.resize` 重画；测量结果与上次相同则不重渲（不会自己喂自己）。
- 没有 layout 的宿主（桩渲染器、零宽列）量不到就一个 `path` 都不画，图退化成一条节点串——不报错、不占位。

### 21.4 钩子（测试与真机都按这些找）

| 钩子 | 挂在谁身上 | 取值 |
| --- | --- | --- |
| `data-gw-progress-flow` | `div.gw-progress-flow` | 测量与连线的坐标系 |
| `data-gw-progress-wires` | `svg.gw-progress-wires` | `aria-hidden`；`path` 数 = 真实相邻对数 |
| `data-gw-progress-nodes` | `ol.gw-progress-nodes` | 节点列表 |
| `data-gw-progress-node` | `li.gw-progress-node` | 值 = 节点 `key`（`flow:start` / `flow:end` / `flow:<位置>:<kind>:<ordinal>`） |
| `data-kind` / `data-state` / `data-ordinal` / `data-current` | 同上 | 七种 kind / 五种观感 / 0 或 N / `true`·`false` |
| `data-gw-progress-node-word` | `span` | 腿词 |
| `data-gw-progress-node-ord` | `span` | 角标，不写时不渲染元素 |
| `data-gw-progress-node-toggle` | `button` | 仅该节点有行；`aria-expanded` + `aria-controls`；`title` = `progress.task.detail` |
| `data-gw-progress-node-calls` | `ol` | 仅展开时；里面是既有行（`data-gw-progress-log-row` 等四个钩子） |
| `data-gw-progress-left` | `p` | 还剩 N 步 / 共 M 步 |
| 沿用 | `-bar` / `-run` / `-chip` / `-guardian*` / `-dock` / `-dock-fill` / `-filled` / `-open` | 一字未改 |

**退场**（`test/progress-connector.spec.ts` 逐条钉住缺席：40 个退役类名 + 28 个退役钩子，样式表按规则选择器解析、
源码按整属性名带边界匹配）：`now` / `eyebrow` / `headline` / `sub` / `steps` / `step` / `flag` / `rest` /
`columns` / `main` / `side` / `plan*` / `log`（列表本体与标题、折叠按钮）/ `final*` / `dock-hint` / `quiet`。

### 21.5 文案（`CONFIRMED`）

新增 11 个键：`progress.flow.start/plan/execute/check/review/summarize/end`（起点/规划/执行/检查/复核/汇总/终点）、
`progress.flow.visit`（第 {n} 次）、`progress.flow.draft`（第 {n} 稿）、
`progress.flow.left`（还剩 {left} 步 / 共 {total} 步）、`progress.flow.aria`（进度流程图）。
删除 19 个四区版键：`progress.now.*`（六）、`progress.steps.aria`、`progress.flag.*`（两）、`progress.rest`、
`progress.plan.title`、`progress.log.title`、`progress.log.more`、`progress.log.less`、`progress.final.title`、
`progress.final.missing`、`progress.dock.hintStart`、`progress.dock.hintAccept`、`progress.dock.quiet`。
保留并仍在用的：`progress.chip.*`（头部）、`progress.plan.waiting/running/done/failed/cancelled`（节点的
**无障碍状态词**，画面上不印）、`progress.log.*`（七个行状态词）、`progress.task.detail`、`progress.member.open`、
`progress.dock.start/accept/fill/filled`、`progress.guardian.*`。`progress.final.mark`（定稿）留在字典里但**没有读者**——
交卷卡退场后，哪一稿是定稿已由那一行的角色词（`汇总·第2稿（定稿）`）说出，不再另起一张卡。

### 21.6 宽度（`CONFIRMED` 的断言口径）

宽屏节点横排、折行；`max-width: 720px` 纵排成一列；`480px` 不溢出。
**CSS 里没有 `overflow-x: auto`**（既有断言继续钉），也仍**没有字面色值**、没有 `--dsw-alias-state-error-primary`。
新的 class 名里不含子串 `gw-progress-task`（那是退役指纹；链段 chip 的 class 是 `gw-progress-call-chain`，
身份在 `data-gw-progress-task-chain` 钩子上）。

### 21.7 取数口径（`CONFIRMED`，两条已知边界）

1. **重试成功仍留一颗琥珀**：`执行（尝试 1）` 与 `执行（尝试 2）` 是两颗节点（各有各的访问），第一颗按自己的成员算
   就是 `failed`，`recoveredFailureSeqs` 只在同一颗节点内部抵消失败。这是**故意的**：那颗节点上那一次真的没过，
   抹掉它等于把「重试过」这件事藏起来；整轮 `completed` 与第二颗的绿都不受影响。
2. **label 里的数字会被读成「第几次」**：取的是第一个整数。`naming.ts` 生成的角色词不会带任务号，
   所以真实形状（`执行`、`执行（尝试 2）`、`规划（第N次）`、`汇总·第N稿（定稿）`）都读得对；将来若有标签形如
   `执行 3`，会裂成第三颗执行节点——这是这条规则已知的代价，写在这里而不是留给下一个人踩。

### 21.8 与 §19 / §20 的取代关系

- §19 的五个区（头部 / 轨道 / 收尾 / 聊天卡）里，**头部与聊天卡保留**，轨道（现在的分段条）与收尾（经过、交卷、Guardian 的两栏）
  **不再存在**；Guardian 那一段本身（§18 的能力、§20 的四块瓦片）**保留**，只是不再占第二列。
- §20 的「任务行就地展开自己的调用」升级成「**节点**就地展开自己的调用」：同一条历史行渲染器，挂在节点下面。
- §19.4 的按钮机制（只填框、不代发）一字未改；页面上仍然只有三类控件：dock 按钮、展开按钮、行胶囊。
- §22 的汇总结论链（标记 → 读回 → 事件）说的是「基于什么事实」，图说的是「怎么摆」；它在这一版的出口是「汇总」节点的
  琥珀状态与节点展开的调用行（§22.5）——本节退场的「交卷」卡就是这条出口的旧形态。

## 22. 汇总结论与「每一稿都被退回」：标记 → 读回 → 事件，界面出口是「汇总」节点（2026-11-26 合流后）

§19 的「交卷」只认识两态：通过的那一稿，或者一句「这一轮没有交卷稿」。第二种其实盖住了两件不同的事——
**闸门一次都没判过草稿**，和**每一稿都被退回**。后者的原因此前根本没落进记录：分层策略写
`check=fail verify=pass drafts=N` 却不带理由，`model` 策略连标记都不写，只剩 `synthesis.error` 的一段散文。
`fix/synth-outcome` 那一轮把第三件事补进了记录（`D-158`），`feat/progress-flowchart` 那一轮把页面换成流程图（`D-159`）、
四区版退场（`D-160`）。本节是两者的合流契约：**事实链（标记 → 读回 → 事件）一个字没变，变的是它的界面出口**——
「交卷」卡这个界面元素不再存在，但「每一稿都被退回」仍然可见：它落在「汇总」那颗节点的琥珀状态里，
退回了几稿与最后卡在哪道门写在点开该节点后的调用行里（§22.5）。
合流口径是操作者拍的板：**「全部被拒」= 汇总节点转琥珀，理由挂在它展开的调用里，不另开卡片。**

**状态口径**：§22.1–§22.3 是 `CONFIRMED`（`fix/synth-outcome` 那一轮的门禁与用例，见 `D-158` 的 Evidence 段）；
**§22.4–§22.5 的界面出口是合流口径，验证在合流后的门禁与真机那一轮**。

### 22.1 标记文法（`synthesis.review`，`CONFIRMED`）

```text
通过：  check=pass verify=pass drafts=N                 ← 与这一节之前逐字相同
退回：  check=fail verify=pass drafts=N reason=<一行>     ← 检查阶段没过的样子
        check=pass verify=fail drafts=N reason=<一行>     ← 复核阶段没过的样子
```

- **`reason=` 排在最后**，它就是「剩下的整行」。所以理由里再出现 `drafts=3 reason=…` 这样的字面文本也不会
  改变化解析——解析器从左往右取最左的那一组。
- **理由是一行、有上限**：`summaryReviewReason()` 把控制字符（换行、制表、U+2028/2029）换成空格、空白折叠、
  `clip(...,300)`。理由是**模型或护栏自己的文本**，不限长就能改写整条台账行。
- **理由为空就不写 `reason=`**（保留旧的两段式标记）：一句「被退回但不说为什么」不是这次要发布的那个事实。
- **一次只可能有一个阶段失败**：闸门在第一道失败处停下，所以 `check=fail verify=fail` 不是本插件会写的形状。
- 两处写入点：分层策略（`synthesisSummary === '' && review !== null` 之后）与 plain `model` 策略的同名分支。
  `review === null`（第一次请求就空手而归）与「确定性叙述自己也没过闸」两种情形**照旧不写标记**：
  「一稿都没写出来」不是「每一稿都被退回」。

### 22.2 读回（`src/report.ts`，`CONFIRMED`）

`summaryGateOutcome(review)` 返回三选一：

| 输入 | 返回 |
| --- | --- |
| `check=pass verify=pass drafts=N`（`N≥1`） | `{ kind: 'shipped', draft: N }` |
| 恰好一段 `fail`、`drafts≥1`、`reason` 非空 | `{ kind: 'rejected', drafts, stage, reason }` |
| 缺理由 / `drafts<1` / 两段同词 / 别的形状 / 非字符串 | `undefined` |

`shippedSummaryDraft()` 一字未改，仍是「哪一稿真的交了」的唯一读法；台账行的后缀读的是**解析值**而不是被
`oneLine(...,240)` 截过的那段字符串，否则理由掉进截断里就只剩「退回」两个字：

```text
Summary review: check=fail verify=pass drafts=3 reason=cites "x", which the report lacks · rejected: draft 3 (check: cites "x", which the report lacks)
```

退回的那一段是 ` · rejected: draft N (<stage>: <reason>)`，理由另限 160 字；通过时仍是 ` · final: draft N`。
`synthesis.review` 在 schema 里就是 `string()`，**没有长度上限**，所以更长的标记不会开始让报告非法。

### 22.3 事件（`src/records.ts`，`CONFIRMED`）

| 项 | 值 |
| --- | --- |
| type | `tool-workflow/summary-rejected`（常量 `PROGRESS_SUMMARY_REJECTED`） |
| payload | `{ runId, drafts, stage: 'check' \| 'verify', reason }` |
| 记录规则 | 只给本 recorder 宣布过的 run 写（与 `summary-final` 同）；`drafts≥1`、`stage` 二选一、`reason` 去空白后非空且 ≤300；不满足就**丢掉这条事实**，append 被拒则把这个 run 从 owned 里删掉 |
| 为什么另开一条事件 | 退回的运行**没有** final 稿；把结论塞进 `summary-final` 就得让 `draft` 一会儿是「第几稿」一会儿是「几稿」，读方要么猜要么自相矛盾。分成两个名字，旧读方看到一个没有 final 的运行，与今天渲染的一样 |

写入点：`src/run.ts` 的完成路径与取消/保留路径各一支；`shippedSummaryDraft` 的调用保持不变，
退回事件只在**没有**通过稿时才解析、才发。

### 22.4 折叠（`src/progress-tab.ts` 与 `src/client/index.js` 的镜像）

- `ProgressRunFacts.summaryRejected?: { drafts, stage, reason }`；fold 与 `summary-final` 同样的「第一条有效声明
  胜出」，`drafts<1` / 未知 stage / 空白理由一律丢。
- 它是 `PROGRESS_EVENT_TYPES` 的成员（两半各一份，`test/progress-tab.spec.ts` 逐条比对），否则宿主根本不会把
  这个事件递给 Tab。
- 数据仍是判别式：通过 `{ kind: 'shipped', draft, label, row }`、退回 `{ kind: 'rejected', drafts, stage, reason }`。
  `undefined` 仍是「什么都没记录」，**不是**退回。**两种事实同时出现时通过优先**：recorder 不会写两条，
  但手写的会话流可能，页面不能否认一次真的交过稿。
- **这一版换了读者**：`main` 侧那条事实原先由故事模型的 `final` 字段喂给「交卷」卡；故事模型整块删除之后
  （§21 / `D-159` 第 7 条），同一份折叠数据改为喂「汇总」节点的状态与它展开的调用行。浏览器镜像的 `update`
  重放列表必须继续带上它，否则下一次 `run-end` 一重折就把它抹掉（「定稿」曾经就是这样丢的）。

### 22.5 界面：琥珀的「汇总」节点（合流口径）

| 情况 | 页面 |
| --- | --- |
| 通过 | 「汇总」节点按自己的成员与结束状态着色（过了绿、当前那颗亮着、未到灰虚线）；哪一稿是定稿由那一行的角色词说（§21.5） |
| 每一稿都被退回 | 「汇总」节点 `data-state` 取 `failed`（琥珀），点开展开的调用行里写着退回了几稿与最后卡在哪道门，用运行自己那句话 |
| 什么都没记录 | 页面上**没有**补白句子：图下只有「还剩 N 步 / 共 M 步」（§21.5 的零说明文字契约） |

- **不再存在的东西**：交卷卡、它上面的第三态（琥珀块）、以及整套 `data-gw-progress-final*` 钩子。
  退回的事实改由节点承载——**「没有卡片」不等于「看不出被退回」**，这是这一版的全部要点。
- 琥珀用的是页面上既有的 `--dsw-alias-state-warn-primary`（失败行、取消行、断过的节点同一个 token），
  **没有新的字面色值**。
- 退场前那两条卡片文案是 `progress.final.rejected`（`第 {n} 稿全被退回` / `Every draft was rejected: {n}`）与
  `progress.final.rejectedReason`（`最后不过：{reason}` / `Last failure: {reason}`）——记在这里是为了让下一轮认得出孤儿键，
  不是让谁把它们再用一次；连同 `data-gw-progress-final*` 那套钩子一起，合流后若仍留在字典里就按孤儿处理
  （`progress.final.mark` 的孤儿身份见 §21.5）。

### 22.6 不变量与仍然没验的（`CONFIRMED` / `NOT_RUN`）

- **通过态一字未动**：标记仍是 `check=pass verify=pass drafts=N`，台账行仍是 ` · final: draft N`，通过稿的角色词不变。
- **退回一句话也不进 `synthesis.error` 的替代位**：`error` 仍写它原来那句话，标记只多带理由，两者不互替。
- **理由为空的退回事实被丢掉**：recorder 与读回都在理由空白时返回「没有这件事」——「被退回但不说为什么」比
  「没有任何结论」更坏，它看起来像已经解释过。
- **`NOT_RUN`：真机上的「每一稿都被退回」**。要在活模型上连续三次撞穿闸门，抖动大、烧额度；`main` 侧那次真机
  只验了通过态（完成页 `汇总·第1稿` + `（定稿）` + 一个胶囊，控制台空）。**琥珀这一层到合流为止没有人在真机上见过**，
  它由组件用例与 CSS 保证。
- **`NOT_RUN`：`check=pass verify=fail` 的写入端**没有在活引擎上跑过：解析端与渲染端有用例；写入端复用的是既有的
  阶段三元表达式，新增的只有理由后缀。
## 23. 泳道矩阵：行 = 任务、列 = 腿，失败重试画进图（2026-11-26，`feat/flowchart-v2`）

§21 把页面换成了流程图（一步一节点、节点底下挂行）。操作者这一段又拍了一次板：**子任务不要藏在节点里，直接画在图上**——
执行 / 检查 / 复核 每一步下面挂「任务 1..N」的格子，常显、不用点开；随后又追加一条：**失败重试也要画出来**
（一格里有几次尝试、第几遍、重看线）。本节是这两条的产品契约，写的是**页面怎么摆**，事实来源与形状由 §21 / §22 继续管。

本节全部 `CONFIRMED`：源码 `src/client/index.js` 的镜像与渲染、`test/progress-lanes.spec.ts` / `test/progress-flow.spec.ts` /
`test/client.spec.ts` / `test/progress-connector.spec.ts`、真机读数在
`.rsi/evidence/flowchart-v2-2026-11-26/`（`README.md` 是索引，`soak/` 是三态，`soak2/` 是重试 / 失败 / 取消，
`soak2-pre-build/` 是同一套场景在「重建 `lib/` 之前」那一棵树上的读数），裁决条目见 `D-166`。

### 23.1 只动浏览器包（本块最重要的一条边界，`CONFIRMED`）

- **`src/progress-tab.ts` 一个字没改**：`deriveProgressFlow()` 不新增 `subs`，「哪些行属于哪个任务」这条分组
  **只存在于 `src/client/index.js` 的镜像里**。它是对已折叠行的**呈现分组**，不改事件、不改 recorder、不改任何数字：
  `total = nodes.length`、`at`、`remaining`、`nodeState()` 全部沿用。
- 用例把这条边界钉住：`src/progress-tab.ts` 里不出现 `subs` / `lane` / `swim`；`test/progress-tab.spec.ts` 零改动。
- **代价（照实记）**：§11 的「TS 与镜像双份 fixture」在本块**不适用**——泳道只存在于浏览器侧，所以这批用例只存在于
  浏览器 spec（`progress-lanes` / `progress-flow` / `client` / `progress-connector`）。这不是遗漏，是本块的边界。

### 23.2 DOM（`CONFIRMED`，钩子是真机与用例一起用的那一套）

```text
div.gw-progress-flow[data-gw-progress-flow]                坐标原点（既有测量宿主）
  svg.gw-progress-wires[data-gw-progress-wires]            aria-hidden；<defs><marker id="gw-progress-arrow">
  ol.gw-progress-cols[data-gw-progress-cols]               列容器：flex + wrap + gap 12
    li.gw-progress-col[data-gw-progress-col="<kind>"]      一列 = 一条腿；data-state 该腿聚合态；data-current
      div.gw-progress-node[data-gw-progress-node]          列头 = 步骤节点（钩子、腿词、角标、toggle 全沿用 §21）
      ol.gw-progress-subs[data-gw-progress-subs]           仅工作腿且点到任务号时出现
        li.gw-progress-sub[data-gw-progress-sub]           一格 = 一个任务在这一列的那几次调用
           data-task / data-lane / data-ordinal = 任务号；data-state = 该格聚合态
          span.gw-progress-sub-dots                        点的容器
            span.gw-progress-sub-dot[data-attempt="1..N"][data-state="<该行自己的状态>"]
          span.gw-progress-sub-word[data-gw-progress-sub-word]    phase 原文，ellipsis + title
          span.gw-progress-sub-badge[data-gw-progress-sub-badge]  只有 N>1；文字 progress.flow.attempt
          button[data-gw-progress-sub-toggle="<key>"]     格子自己的展开按钮（裁决 A）
          ol.gw-progress-sub-calls[data-gw-progress-sub-calls]    仅展开时；既有 ProgressLogRow
```

- **`ol.gw-progress-nodes` 退场**，节点从 `li` 变成列里的 `div`，列本身是 `li`；`data-kind` / `data-state` /
  `data-ordinal` / `data-current` 四个属性一个不少。
- **列序** = 既有 `flow.nodes` 的顺序（起点 / 规划 / 执行 / 检查 / 复核 / 汇总 / 终点）；汇总写过两稿就是两列。
- **裁决 A（包工头口径）**：格子自己的展开按钮用自己的钩子 `data-gw-progress-sub-toggle`，
  步骤节点继续用 `data-gw-progress-node-toggle`——同一个钩子同时挂在两种控件上会让「节点 toggle 数 =
  还有杂行的步骤数」这条既有读法失效。
- **裁决 B**：「步骤节点不再有 toggle」**只对每一行都带任务号的腿成立**；规划 / 汇总 / 两端这类腿的行不带号，
  它们**保留 toggle**，否则那条已声明的调用在页面上无处可读（真机：完成态 7 颗节点里 2 颗汇总各有一个 toggle，
  工作腿一个都没有）。

### 23.3 几何与对齐（数字是硬约束，`CONFIRMED` 真机实测）

| 东西 | 值 | 真机读数（`soak/soak-30-done.json`） |
| --- | --- | --- |
| 步骤节点 | 高 `32px`、圆角 `10px`；起点/终点胶囊 `999px` | 列头高 `32` |
| 子任务格 | 高 `26px`、圆角 `10px`、格间距 `6px`、列间距 `12px` | 格高 `26`，同一列 `176 → 208 → 240` |
| 状态填充 | 同一 token `12% → 5%` 竖向渐变，`background-color: transparent` | `linear-gradient(color(srgb .13 .77 .37 / .12), … / .05)` |
| `pending` | 唯一虚线、唯一空心点、**无渐变** | `border-style: dashed`、`background-image: none` |
| 展开的调用清单 | **绝对定位**浮在节点/格下方，不推动任何兄弟 | 展开后列宽 `161.9` 不变 |
| 横向 | 无 `overflow-x: auto`、无 `#hex`、无 `rgba()`、无 `--dsw-alias-state-error-primary` | 插件样式表逐项 0 命中 |

**对齐靠网格、不靠测量（裁决 C）**：列内 `ol.gw-progress-subs` 是
`display: grid; grid-template-rows: repeat(var(--gw-lanes, 1), 26px); gap: 6px`，每格 `grid-row: <任务号>`，
`--gw-lanes` 是整张图**最大的任务号**。缺号就留白，不补位元素、不加 class，格子计数与 `data-*` 口径都不变。
真机逐 lane 实测 `getBoundingClientRect().top`：`lane 1 = 176/176/176`、`lane 2 = 208/208/208`、
`lane 3 = 240/240/240`（execute / check / review 三列），**极差 0.00 px**，三个时刻（进行中早期 / 进行中中段 / 已完成）都一样。

**窄屏（≤720px）列折行，对齐只在行内成立**：700 px 实测列折成两行（`top` 138 / 274 / 410 / 450），
同一 lane 跨行后 `176 / 312 / 312`（极差 136 px）；480 px 单列纵排（极差 272 px）。
**这是折行的必然，不是缺陷**；两条硬指标仍然成立：`scrollWidth === clientWidth`（700/700、480/480），
没有横向滚动。

### 23.4 连线（有向 + 折行肘弯 + 重看线，`CONFIRMED`）

- **有向**：`<marker id="gw-progress-arrow" markerWidth="8">`，每条 `path` 带 `marker-end`，
  箭头填 `--dsw-alias-border-l2`（线不表状态，状态由点和节点自己说）。
- **画什么**：列头相邻对（`flow.nodes` 的相邻列）+ 同一 lane 的相邻两格（执行→检查→复核）。
  真机完成态：相邻列对 **6** + 同号格对 **6** = **12** 条连线；`querySelectorAll('svg path')` 读到 **13**，
  多的那 1 条是 `<marker>` 自己的三角形 `M0 0 L8 4 L0 8 Z`——读数时按「总数 − 1」算。
- **折行肘弯**：相邻两个落点不在同一行时画**三段折线**（下 → 横 → 下，拐角 90°），不再「不画」。
  700 px 实测 6 条 4 顶点的路径，例如 `M520 32 L520 84 L173 84 L173 136`。
  **这一条取代 §21.3 的「折到下一行的那一对不画线」。**
- **重看线**：同一格里相邻两次尝试，前一行的状态不是 `completed` 时，从那一颗点的右缘中点到下一颗点的左缘中点
  画一条短线，`data-gw-progress-retry`、`stroke-dasharray: 3 3`、`marker-end` 同一条箭头。
  真机「失败一次后重试通过」：**1 条** `M300 51 L303 51`，`stroke-dasharray = 3px, 3px`；
  「两次都失败」：**2 条**。
- 仍由 `measureProgressFlowWires()` 读矩形，`sameProgressWires()` 的「同一次测量不重渲」不变；
  没有 layout 的宿主一条都不画、不报错（真机没有这种宿主，这一条只有组件用例覆盖）。

### 23.5 尝试可见：一格里的每颗点、第 N 遍（追加 8，`CONFIRMED`）

- **格的状态不变**，仍是 `nodeState(该格的行, ended)`：失败过一次、第二次过了 → **格是绿的**（恢复规则）。
- **点改成每行一颗**（`data-attempt="1..N"`，按 `seq` 从左到右），每颗点**只看它自己那一行**的状态：
  `completed` 绿、`failed`/`blocked`/`cancelled` 琥珀、未结算蓝。
  于是「失败过一次、第二次过了」读作：**两颗点，第一颗琥珀、第二颗绿，格自己绿**。真机实测的正是这个形状
  （`soak2/retry` 的 check 列任务 1：`[{1, failed}, {2, done}]`，格 `done`）。
  **这一条取代 §21.7 第 1 条**（那里为了不抹掉「重试过」，把第一颗节点留成琥珀；现在琥珀落在**点上**，
  节点与格子可以绿，事实仍然看得见）。
- **第 N 遍**：`N = 该格的行数`，`N > 1` 才多一个角标 `progress.flow.attempt`（中文 `第 {n} 遍`，
  English `Attempt {n}`）；`N === 1` 不加字。真机：`任务 1` 在检查列读作 `第 2 遍`。
- **`at` 的重试口径**：重试正在跑时高亮停在那一列，不往后跳也不往前滑；`remaining = total - at` 口径不变。
  真机「第二次尝试在跑」时：`data-current="true"` 落在第二颗 `execute` 列，页脚 `还剩 1 步 / 共 4 步`。

### 23.6 三种终态页（同一张图、同一套钩子，`CONFIRMED`）

| 页面 | 真机读数 |
| --- | --- |
| 已完成（重试通过） | 12 列 / 6 格 / 1 条重看线 / 页脚 `还剩 0 步 / 共 12 步` / `收下这版` |
| 未通过（整轮失败） | 10 列 / 6 格 / 2 条重看线 / 2 个 `第 2 遍` 角标 / `还剩 6 步 / 共 10 步` / **没有按钮**（`dock` 里没有 `收下这版`） |
| 已取消 | 见 `soak2/cancelled/`（读者按「停止生成」中途掐断） |

三张页都**没有新句子**：叶子文本仍只有运行名、状态词、腿词、角标、任务标题、计数行与按钮
（`soak/soak-92-styles.json` 的 `leafTexts` 里那 19 条，第一项是 `<style>` 自己，静态检查用）。

### 23.7 与 §21 / §22 的取代关系

- **取代**：§21.1 的 DOM（`ol.gw-progress-nodes` → `ol.gw-progress-cols` + 列 + 任务轨）；§21.3 的「折行不画线」
  → 三段肘弯；§21.7 第 1 条的「重试留一颗琥珀节点」→ 琥珀落在**每颗尝试点**上；§21.4 钩子表里的
  `-nodes` 退场，新增 §23.2 那一批。
- **不取代**：§21.2 的状态词与 `at` 口径、§21.5 的腿词 / 角标 / 计数文案、§21.6 的宽度与「无字面色值」，
  §21.8 的按钮机制（只填框、不代发）、§22 的汇总结论链与其界面出口（汇总节点的琥珀 + 展开行）。
- **文案增量只有一个键**：`progress.flow.attempt`（键数 54 → 55）；`test/progress-hint-absent.spec.ts` 一字未改。

## 24. 手机：矩阵变成分支树（2026-11-26，`fix/flowchart-mobile-tree`）

读者一句话：「手机排版难看」。手机上（真浏览器渲染的 390 / 360 模拟屏）6 条腿并排挤成一条条窄缝，任务名一律被省略号切断——**这一轮没有真手机读数**，见 `STATE.md` 同日的 `BLOCKED` 那一格。矩阵（§23）
在桌面上是**行 = 任务、列 = 腿**，这个口径手机放不下，所以 ≤720px 换个画法，**不是缩一版矩阵**。

### 24.1 断点与结构（`CONFIRMED`，断言口径）

- `@media (max-width: 720px)` 内三条：`.gw-progress-cols` 改 `flex-direction: column`（一条腿一整行、整宽）；
  `.gw-progress-col` 改 `flex: 0 0 auto; width: 100%`；`.gw-progress-subs` 改**两轨网格**
  `grid-template-columns: repeat(2, minmax(0, 1fr))`、`grid-template-rows: none`、`column-gap: 8px`、`row-gap: 24px`。
- **格子的行不再是任务号**：桌面靠内联 `grid-row`（= 任务号）对齐，手机靠轨道排布，所以这条规则里用
  `grid-row: auto !important` 把内联值压掉 —— 内联样式只有 `!important` 能盖，理由与 `PageStyle()` 里那条一样。
- **轨道由钩子决定，不由 `nth-child` 决定**：`data-gw-progress-branch-side` = `left` / `right` / `none`，
  位置偶数（0、2、4…）走左轨、奇数走右轨，**一条腿只有一格时是 `none`，跨两轨**。属性在每个宽度都写在
  `li.gw-progress-sub` 上，桌面读都不用读（那里是矩阵）。
- **24px 的空档是画线的地方，不是留白**：腿卡 → 任务卡、任务卡 → 下一张腿卡，两条横杆都落在这 24px 里，
  所以空档比 8px 的列间距大。480px 断点**不再重排一次流程**（只留 dock 与调用行的时刻列），
  因为第二次重排正是「树丢掉分支」的地方。

### 24.2 线：分叉（叉出去）与收回（收回下一腿）（`CONFIRMED`，效果图 `.tmp/mock/mobile-tree.html` + 真页面 `.rsi/evidence/mobile-tree-2026-11-26/soak/20-running.json` 的 `wirePaths`）

- **分叉**：腿卡底边中点 → 12px 竖茎 → 横杆（最左分支中心到最右分支中心）→ 每张分支卡**顶边中点**各落一根竖茎，
  箭头停在卡片顶边（不压边框）。只有一张分支卡时是**一根直竖线**，不做横杆。
- **收回**：每张分支卡底边中点 → 12px 竖茎 → 横杆 → 一根竖茎进下一张腿卡**顶边中点**。
- 横杆的纵坐标**不是固定偏移**：它落在**自己那个目标上方那段空档的中点**——`band = (上一张框的底 + 目标顶) / 2`
  （`progressWireBranch()` 量的是矩形，不猜）。24px 的空档里就是离两端各 12px，与上面两条「12px 竖茎」的读法一致
  （模拟屏 390px、三任务并行那一跑的量测：腿头底 `92` → 分叉杆 `104`；最后一张卡底 `246` → 收回杆 `258` → 下一张腿头顶 `270`，
  连线层坐标）。同一条空档里同时有分叉杆和收回杆时，**两根共用不了同一条横杆**：分叉的目标是这一腿自己的任务卡、
  收回的目标是下一张腿卡，两段空档不在同一高度——那一跑里分叉杆在 `104` 与 `181`、收回杆在 `258`，
  三个 y 互不相同；两条轨道中间的 8px 缝就是主干的位置，所以竖线永远不穿卡。效果图里那对 8px / 16px 是
  **效果图自己的取法**，不是产物的形状。
- 线仍是 `stroke: --dsw-alias-border-l2`、1.5px、实线；≤720px 加 `stroke-linecap/linejoin: round`（树的拐角）。
  重试仍是 `data-gw-progress-retry` 的 `3 3` 虚线，画在同一层里。

### 24.3 不截字（`CONFIRMED`）

- ≤720px：`.gw-progress-sub` 与 `.gw-progress-node` 都是 `height: auto; min-height: 34px; white-space: normal;
  overflow-wrap: anywhere; text-overflow: clip`；`.gw-progress-sub-word` / `.gw-progress-node-word` 停止
  `nowrap` + 省略号（`overflow: visible`、`white-space: normal`）。长名字**把卡撑高并折行**，不再截。
- 格子内部改成两行：第一行「尝试点（+ 重试虚线）+ `第 N 遍` 角标 + 明细箭头」，第二行任务名**独占整宽**
  （`grid-template-areas: "dots badge toggle" "word word word"`）。名字不与角标抢同一行，这是被挤断的直接原因。
- **真机（真浏览器渲染的 390 / 360 模拟屏）量到的数**（`.rsi/evidence/mobile-tree-2026-11-26/` 的 `soak/*.json`）：
  390px 下两轨各 **183.5px**、流程宽 **383**；360px 下两轨各 **168.5px**、流程宽 **353**；两档
  `scrollWidth - clientWidth` 都是 **0**、被截的卡与腿词都是 **0**、穿过卡片内部的线都是 **0 条**，
  所以 360px **不需要**降成单轨。
- 效果图那一套另有自己的数（`.tmp/mock/README.md`，`mobile-tree.html` 量到 360px 任务名可用 **145px**、
  390px **160px**、412px **171px**；同一份说明里 `verify.html` 用真 CSS + 真 DOM 量到 **138 / 153 / 164px**）——
  那是**效果图**的读数，不是产物在真页面上的读数，别混用。

### 24.4 桌面不变，与 §23 的关系（`CONFIRMED`）

- **>720px 一个字节没动**：`flex` 行、等宽列、`--gw-lanes` 的 `grid-template-rows`、每格内联 `grid-row` 全部原样；
  新规则只写在 media query 里，`data-gw-progress-branch-side` 在桌面上是死属性。
- **取代**：§23.3「两列一行的窄屏」→ 一条腿一行的树；§23.4 的「列头相邻对 + 同号格对」连线形状在手机上
  → 分叉/收回两组线（测量仍读矩形，桌面口径不变）。
- **不取代**：§23.2 的 DOM 顺序（`flow > wires + cols > col > (node, subs > sub)`）与全部钩子、
  §23.5 的尝试点与 `第 N 遍`、§23.6 的三种终态、§23.7 的文案增量。DOM 里**没有**新增元素，
  只多了一个属性，所以文案键数仍是 55。

## 25. 任务面板：一句话 + 一张由 Mermaid 文本自己画出来的图 + 只在卡住时出现的一句（2026-11-26，`feat/task-panel`）

**§21–§24 被本节取代**（泳道矩阵、手机两轨树、第一版流程图三样都退场）；§22 的退回事实链（标记 → 读回 → 事件）仍然成立，
它的界面出口挪到了「汇总」节点**点开后的调用行**（§25.1 第 3 条、§25.8）。本节写的是**页面现在是什么**，
事实来源与状态口径仍由 §21.2 / §22 继续管。

本节全部 `CONFIRMED` 的部分：源码 `src/client/index.js` 的镜像与渲染、`test/progress-panel.spec.ts`（25）与
`test/progress-panel-model.spec.ts`（31）、`test/client.spec.ts` 里被改写的页面形状用例（条数没变：153 → 153，
其中 7 条标题重写、其余按 1:1 承接；块里记的「25 条」我没有逐条数出来，见 §25.9），
**隔离档案里的真装真跑**（`.rsi/evidence/task-panel-2026-11-26/`，12 条读数，见 §25.9），
以及审稿稿 `.rsi/evidence/task-panel-2026-11-26/mockup/task-panel.html` 的几何自检（`.tmp/mock/geometry.json`、`shots/measurements.json`）。
裁决条目见 `D-173`。**真机读到的是「进行中 / 已完成 + 点击」四态四宽度；「等你点头 / 未通过 / 已取消」与卡住那句的文字是 `NOT_RUN`**（§25.9）。

### 25.1 三区（`CONFIRMED`）

| 区 | 元素 | 说什么 |
| --- | --- | --- |
| 头 | `header.gw-progress-bar` › 运行名 + 五态胶囊 + `p.gw-progress-line` | `第 N 步，共 M 步`；能量出来时接 ` · 还剩约 …` |
| 图 | `div.gw-progress-graph` › `svg.gw-progress-wires` + `ol.gw-progress-pnodes` | 每一步一颗节点，步走过的计划任务各挂一条分支；边指方向 |
| 卡住 | `p.gw-progress-stuck[role="status"]` | 一句，**只在真的卡住时存在**；不卡住就没有这个元素、也不留空位 |

- 顺序固定：头 → 图 → 卡住那句 → Guardian 卡 → footer（dock）。用例逐条钉「卡住那句在图之后、Guardian 之前」。
- **头那句话就是原来那行计数**：`at` / `total` / `remaining` 全沿用 `deriveProgressFlow()`，
  删掉的是 `progress.flow.left`（`还剩 N 步 / N steps left`）那一行本身，不是它的数。
- **汇总节点的裁决出口**：一颗没有一个调用、但带着「每一稿都被退回」的汇总节点**也可开**（`openable`），
  点开的行里写着退回了几稿、最后卡在哪道门（§22.5 的三条事实原样搬进列表：`drafts` / `stage` / `reason` 三行，
  `data-gw-progress-node-rejected` 带上这三个值，`drafts` 那一行用琥珀 token）。`model` 策略下这颗节点一个调用都没有，
  只认调用就会让这条判决无处可读。
- **定稿那一行**：`flow.final` 原样带进 `graph.final`，点开的列表按 `seq` 标出闸门**真正交的那一行**，不另猜一次。

### 25.2 DOM 与钩子（`CONFIRMED`，用例与真机都按这些找）

```text
header.gw-progress-bar[data-gw-progress-bar]
  span.gw-progress-run[data-gw-progress-run]                 运行名（title 同文，长名省略）
  span.gw-progress-chip[data-gw-progress-chip="<state>"][data-state]  role="status"，五态
  p.gw-progress-line[data-gw-progress-line][title=<eta 依据 | 无>]
div.gw-progress-graph[data-gw-progress-graph][data-gw-progress-source="<mermaid 全文>"]
      role="group" aria-label=progress.panel.graph；width/height 由版面算出
  svg.gw-progress-wires[data-gw-progress-wires]              aria-hidden；<defs><marker id="gw-progress-arrow">
    path[data-gw-progress-edge][data-from][data-to][data-kind="chain|branch|join"][data-trace="active|dim"]
  ol.gw-progress-pnodes[data-gw-progress-pnodes]
    li.gw-progress-pnode[data-gw-progress-pnode="<id>"]
       data-kind / data-state / data-current="true|false" / data-ordinal / data-task（仅任务）/ data-trace（仅被点亮的）
      button.gw-progress-pnode-body[data-gw-progress-pnode-open="<id>"]   openable 时；aria-expanded / aria-controls
      div.gw-progress-pnode-body                                          不可开时（同样的盒子，只是一个记号）
        span.gw-progress-pnode-dot                                       aria-hidden
        span.gw-progress-pnode-word[data-gw-progress-pnode-word]         title=全名
        span.gw-progress-pnode-badge[data-gw-progress-pnode-badge]       第 N 遍（任务，>1 才有）/ 第 N 稿（汇总）/ 第 N 次（重复访问的腿，>1 才有）
        span.gw-progress-pnode-dots（仅任务）                             aria-hidden 容器
          span.gw-progress-pnode-attempt[data-attempt="1..N"][data-state]
          span.gw-progress-pnode-retry                                   失败那次与下一次之间的虚线
      ol.gw-progress-node-calls[data-gw-progress-node-calls="<id>"][id="gw-progress-calls-<id>"]
         › 既有 ProgressLogRow 行（+ 汇总节点的退回行）
p.gw-progress-stuck[data-gw-progress-stuck]                   role="status"
```

- **`-pnode-body` / `-pnode-dots` / `-pnode-attempt` / `-pnode-retry` 是 class，不是 `data-` 钩子**；
  点上的两次尝试靠 `data-attempt` + `data-state` 读，重试那一段靠 class 读（它是装饰，没有语义可读）。
- **节点的可开与否写在控件上，不写在节点上**：`openable` 才渲染 `button` 并带 `-pnode-open`；
  不可开的节点是 `div`，`aria-label` 仍说「词 + 角标 + 状态词」。所以「节点 toggle 数 = 还有杂行的步骤数」这条老读法
  不再成立（也没有 toggle 了），新的读法是「`-pnode-open` 数 = 真能点开的节点数」。
- **被点亮的线才有 `data-trace`**：没点开时每条边都没有这个属性（不是 `dim`），「没人问过」与「被压暗」在 DOM 里也分得开。
- **`-source` 带的就是那份 Mermaid 全文**：一整段 `flowchart TD`，含中文标签；它是结构来源，不是注释。

### 25.3 模型（`CONFIRMED`）

| 名字 | 在哪一半 | 做什么 |
| --- | --- | --- |
| `deriveProgressFlow()` | 类型侧 + 镜像 | 老口径：走腿、算 `at` / `total` / `remaining`、聚合状态、`final`。**本节一个字没改它** |
| `derivePanelGraph(run, t)` | 镜像 | 图模型：腿节点 + 任务分支节点 + 边 + 头部句子 + `stuck`；末尾用 `panelMermaid()` 把文本写进 `graph.mermaid` |
| `panelMermaid(graph)` | 镜像 | 写 `flowchart TD`：一节点一行、一边一行、两空格缩进 |
| `parsePanelMermaid(text)` | 镜像 | 读回本页写得出的子集；别的一律忽略；指向未声明节点的边丢掉 |
| `layoutPanelGraph(parsed, sizes, width)` | 镜像 | 分层、居中、堆叠判定、每颗盒子的坐标、每条边的 `d` |
| `panelEdgeKey(from, to)` | 镜像 | 一条边的键（`\u0000` 连接），点亮的集合按它比对 |
| `panelTraceNodes(graph, traced)` | 镜像 | 点亮哪些节点：它自己 + 与它相连的那些，**全部从 `graph.edges` 派生** |
| `panelTraceEdges(graph, traced)` | 镜像 | 点亮哪些边；其余标 `dim` |
| `openable` | 镜像 | 有调用 **或** 带着全被退回的裁决；决定 `button` 与 `div` |
| `final` | 两边 | 闸门交的那一行（`{ draft, seq }`），只用来标定稿 |

- **`derivePanelGraph()` 不新增事件、不改折叠、不改数字**：它是呈现层的分组（一条腿 → 它走过的任务），
  与 §23.1 同一条边界——`src/progress-tab.ts` 一个字没改。
- **label 在这里解析**（`t` 是读者自己的字典），因为 Mermaid 文本是结构来源，它必须带着读者会看见的词；
  **计划任务的标题是 recorder 写的原文**，不缩、不译、不改写。
- **id 规则**：一条腿是 `kind`，重复访问是 `kind_<ordinal>`；一条任务分支是 `<腿id>_t<任务号>`；
  两端叫 `start` / `end`——**只有文本里把 `end` 写成 `finish`**（`end` 关 `subgraph`），解析回来仍是 `end`。

### 25.4 文案（`CONFIRMED`；中英同键，缺一即失败）

| 键 | 中文 | English |
| --- | --- | --- |
| `progress.panel.step` | `第 {at} 步，共 {total} 步` | `Step {at} of {total}` |
| `progress.panel.eta` | `还剩约 {time}` | `about {time} left` |
| `progress.panel.etaBasis` | `按 {n} 个已完成步骤的实测耗时推算` | `from the {n} finished steps actually measured` |
| `progress.panel.stuck.failed` | `卡在 {at}：{role} 第 {n} 遍没过` | `Stuck at {at}: attempt {n} of {role} did not pass` |
| `progress.panel.stuck.blocked` | `卡在 {at}：这一步没有回报` | `Stuck at {at}: this step never reported back` |
| `progress.panel.stuck.rejected` | `卡在 {at}：{n} 稿全被退回` | `Stuck at {at}: every draft was rejected ({n})` |
| `progress.panel.durationSec` | `{s} 秒` | `{s}s` |
| `progress.panel.durationMin` | `{m} 分 {s} 秒` | `{m}m {s}s` |
| `progress.panel.durationHour` | `{h} 小时 {m} 分` | `{h}h {m}m` |
| `progress.panel.trace` | `看线` | `Trace its wires` |
| `progress.panel.graph` | `任务图` | `Task graph` |

- **十一颗新键**，`progress.*` 键数 **55 → 64**。
- **删掉的两颗**：`progress.flow.left`（`还剩 N 步`——顶上那句话接替它）与 `progress.flow.aria`（图的标签——`progress.panel.graph` 接替它）。
  两颗都进了 `test/i18n-parity.spec.ts` 的删除清单，两本字典里都不许再出现。
- **页面上没有第二套句子**：叶子文本只有运行名、状态词、腿词、任务标题、`第 N 遍` / `第 N 稿` / `第 N 次` 三种角标、头部那一句、
  卡住那一句、Guardian 自己的话、dock 按钮与「已填进输入框」那一句。`progress.panel.trace` **只做悬停提示**，
  不进任何 `aria-label`、也从不印在页面上。

### 25.5 布局数字（`CONFIRMED`：常量 + 用例断言；效果图那一档是审稿稿实测）

| 东西 | 桌面（≥ 720 px） | 堆叠（< 720 px，或某一层比容器宽） |
| --- | --- | --- |
| 兄弟间距 | `12px`（`PANEL_PNODE_GAP_X`） | —（一卡一行） |
| 层间距 | `44px`（`PANEL_PNODE_GAP_Y`） | `30px`（`PANEL_PNODE_STACK_GAP_Y`） |
| 卡与卡 | — | `26px`（`PANEL_PNODE_STACK_GAP`）；分叉横杆就画在这段空档里，离卡片 `8px` |
| 侧槽 | — | 卡左右**各留 24px**（`PANEL_RAIL_GUTTER`），轨在 `12px` 内侧（`PANEL_RAIL_INSET`） |
| 竖线 | 直落 / 一次折弯 | 茎 `12px`（`PANEL_RAIL_STEM`）、挂角 `8px`（`PANEL_RAIL_HOOK`） |
| 拐角 | `8px` 圆角，且不超过所连两段的一半（`panelSmoothStep` / `panelPolyline`） | 同左 |
| 盒子 | 腿 = 容器整宽、高由 CSS 定（`min-height: 32px`）；任务 `min-height: 34px` | 卡宽 = 宽 − 2×24 |

- **两侧都留槽是刻意的**：分叉走左槽、汇合走右槽，所以没有任何一条竖线需要穿过卡片才够得着自己的目标
  （审稿稿 9 组状态×宽度自检：`bodyCrossings` 全是 **0**，箭头落在目标上边缘 **12/12、16/16、1/1**）。
- **断点只有一个数**：`720`。宽度不可量时先用 `PANEL_DEFAULT_WIDTH = 720`；某一层比容器还宽时**那一层**也走堆叠。
- **盒子尺寸是量出来的**：`.gw-progress-pnode` 的内联样式只给 `left` / `top` / `width`，**高度留给内容**
  （`height: auto`），量到之后再排一次。第一帧用默认尺寸（stadium `80×32`、任务 `max(120, min(260, 28+13×字数))×34`、
  腿 `max(96, min(220, 24+14×字数))×32`）。

### 25.6 状态词汇：红色不是一个词（`CONFIRMED`）

| `data-state` | 词（`progress.plan.*`） | token |
| --- | --- | --- |
| `done` | 过了 | `--dsw-alias-state-success-primary` |
| `doing` | 在做（当前那颗，呼吸） | `--dsw-alias-state-business-primary` |
| `pending` | 等着（**唯一虚线、唯一空心点、无渐变**） | `--dsw-alias-state-idle-primary` |
| `failed` | 没过 | `--dsw-alias-state-warn-primary` |
| `blocked` | 没过（同一个词） | `--dsw-alias-state-warn-primary` |
| `cancelled` | 没做 | `--dsw-alias-state-warn-primary` |

- **`--dsw-alias-state-error-primary` 整张样式表一次都不出现**（用例逐条断言）：没过是琥珀，不是错。
- 每颗尝试点**只看它自己那一行**：失败一次、第二次过了 = 一颗琥珀 + 一颗绿，节点自己是绿的；重试那一段是 `1px` 虚线。
- `prefers-reduced-motion: reduce` 下呼吸动画关掉（`animation: none`）。
- **状态由点、边框、词一起说**，连线**从不**承载状态（线只有方向：箭头 + `border-l2`）。

### 25.7 诚实边界（`CONFIRMED`）

1. **估算只能量出来**：`mean(已跑完步骤自己的跨度) × 还剩几步`，一分钟以下取 `5s`、以上取 `10s`；
   **一步没量到、或者没有剩余步 → 不打印**（连 `title` 都没有）。可见句子里不说方法，只有悬停说（`progress.panel.etaBasis`）。
2. **没有百分比、没有通过率**：全页文本里不出现 `%`，也不出现「通过率 / 预计 / 剩余 / 大约 / ETA」。用例七态逐条钉。
3. **不从计划推任何东西**：事件流里没有计划，所以「步」= 一条腿的一次访问，不拿任务数当分母。
4. **没卡住就没有元素**：卡住那句不是「空着」，是**不存在**；取消的运行也不算卡住（胶囊已经说了）。
5. **一句话都不解释页面**：`title` / `aria-label` 里的字都短于 60 字、不带句末标点——工具提示可以点名一条腿，
   但不能变成一段关于页面的说明。

### 25.8 两个交互（`CONFIRMED`）

- **一次点击两件事**：摊开/收起这颗节点的调用（`opened`），并把跟它有关的线点亮（`traced`）。
- **同时只点亮一颗**：`traced` 是单值；点另一颗，线就搬到那一颗身上（不是两颗一起亮）。
- **可以同时摊开好几颗**：`opened` 是列表；点别的节点不收起已经开着的。
- **空白处只取消线**：图形容器自己的点击清 `traced`，**不清 `opened`**——摊开的调用是读者的位置。
- **冒泡的点击不读第二次**：容器只在 `event.target === event.currentTarget` 时动作，节点自己的点击不会被当成「点空白」。
- **两个都不写**：用例把门面调用记下来，除 dock 那颗按钮（`setDraft`，不 `send`）之外一次服务调用都没有。

### 25.9 验证指针与没验的（`CONFIRMED` / `NOT_RUN`）

- **门禁（本轮同树实测）**：`npx tsc -p tsconfig.json --noEmit` `EXIT=0`；`npx oxlint src test`
  `Found 14 warnings and 0 errors.`（187 文件 / 96 规则）；八份进度 spec **`8 files / 326 passed`**
  （client 153 + panel 25 + panel-model 31 + connector 15 + hint-absent 8 + i18n-parity 8 + progress-tab 72 + progress 14，
  逐行在 `.rsi/evidence/task-panel-2026-11-26/gate-45909bb.out`）；整仓 `TMPDIR=$PWD/.tmp npx vitest run`
  **`105 files / 2030 passed`**（转录 `.rsi/evidence/task-panel-2026-11-26/suite-45909bb.out`，尾段逐字，`Test Files 105 passed (105)` / `Tests 2030 passed (2030)` 都在里面）；
  `cmp lib/client.js src/client/index.js` 空输出，两份都是 **399448 字节**。
- **用例分工**：`test/progress-panel.spec.ts`（25）管页面形状与两个交互（三区顺序、金额与数字边界、点开、点亮、清空、dock）；
  `test/progress-panel-model.spec.ts`（31）管模型与样式（分层、居中、侧轨、穿卡、Mermaid 往返、ETA 四种情形、`stuck` 三级、
  无字面色值、红色缺席、断点换行）。被删的两份各 45 / 40 条，条目级承接关系写在 `progress-panel.spec.ts` 的文件头。
- **真机（`CONFIRMED`，隔离档案真装真跑；数字全在 `.rsi/evidence/task-panel-2026-11-26/soak/readings.json`）**：
  装进去的是 `45909bb` 打出来的 tgz（**1 025 655** 字节 / `sha256 1554571b…eac3d`），隔离 home `.tmp/soak-panel/dsh-home`、
  端口 **3411**、Node v26.8.1 / npm 11.19.0 / dsh 0.2.2-rc.3；装好的副本读回 **`0.13.52`**、`lib/client.js` 与工作树同哈希、
  软链 **0** 个。**跑了三次**：桌面 1500×1600 **129.8 s**（进行中 / 已完成 / 三次点击）、390 px 一次作废、
  390 px 再来一次 **149.3 s**（手机进行中 / 已完成 / 点按）。**12 条读数**：`scrollWidth == clientWidth` 四档全成立
  （1500 / 700 / 390 / 360）、`[data-current="true"]` **每态 1 颗**、三次会话 `consoleErrors: []` / `pageErrors: []`；
  完成态 **16 节点 / 21 条线**，桌面进行中 16 / 21 且那行字是 `第 6 步，共 7 步 · 还剩约 25 秒`，
  手机进行中 6 / 7 且**没有**「还剩约」（那时还没有一步能量完），完成态 `第 7 步，共 7 步`；
  **卡住那句在每一态每一宽度都不存在**（这一轮没有失败、没有没回报、没有被退稿，按设计它不该出现）；
  底部按钮完成态 `收下这版`、进行中为空。**页面自己的真值核对每行都对**：`-source` 首行 `flowchart TD`、
  以 `end` 开头的行 **0**、解析出的节点/线数与 DOM 相等（6=6 / 7=7、16=16 / 21=21），完成态源文本 38 行存在 `soak/mermaid-done.txt`。
- **两个交互（量到的）**：点第一颗任务节点 → 调用列表 0→**1**、`[data-trace="active"]` **5**（2 边 + 3 节点）/ `dim` **19**；
  **第二次点同一颗 → 0 / 0 / 0**；第三次 → 回到 1 与 5 / 19。**一次点击同时开关列表与线**（见「口径」）。
- **口径要照实测读**：块里的说明写「再点一次只取消线」，实测是**列表也一起收起**。§25.8 说的「空白处只取消线、摊开的列表留着」
  仍然成立（那是容器的点击），但**节点自己的第二次点击不是**——这两件事在真机上是分开的，别混着读。
- **窄屏的一条宿主观察（不是本节的规则）**：同一会话探针 **700 / 600 / 500 px 标签条有 `对话,轨迹,进度`；
  420 / 390 / 360 px 只剩 `对话,轨迹`，整份 DOM 里连「进度」两个字都没有**——它退到右侧的**更多会话视图**菜单里，
  手机与平板那几张图都从那里进去。这是宿主标签条的行为，本节照实记，不当作本页要修的东西。
- **版面观察（记录，不判对错）**：展开的调用列表浮在邻居上——手机上压在「任务 2 · 写 test.txt」那张卡上、
  桌面 1500 遮住「检查」的一部分；字仍读得出，`scrollWidth == clientWidth` 也成立。
- **审稿稿**：`.rsi/evidence/task-panel-2026-11-26/mockup/task-panel.html`（**审稿用，不上线**；它是在 `.tmp/mock/` 里做出来的，那里现在只是构建位置）。几何自检跑的是 **9 组**状态×宽度
  （1440 / 390 / 360 × 进行中 / 已完成 / 等你点头），截图另有 10 张（多一张 1440 带点亮的、一张展开 Mermaid 源码的）：
  9 组里**穿过卡片身体的竖线 0 条**、`scrollWidth === clientWidth` 在 1440 / 390 / 360 三档全成立、
  **被切标签 0 个**、连线数 12 / 16 / 1 与箭头数一一相等。几何自检在 `.tmp/mock/geometry.json`（把每条路径拆成线段算的，
  不是看图）。
  **稿子里那块可见的 `Mermaid 源码` 只是审稿时拿来对着图核字的，产物不显示它**——产物只把文本挂在 `-source` 属性上。
  稿子里的示例文本把终点写成 `end`（需求样例的写法），**产物的写法是 `finish`**（真机读数里以 `end` 开头的行是 0 条）。
- **`NOT_RUN`：** ①「等你点头」态（发出后 **0.59 s** 进度页就已是「进行中」，那个窗口没硬造）；
  ② **卡住那句在真机上的文字**（要读它得制造一次没过的尝试 / 没回报的一步 / 被退稿的汇总，这一轮没有）；
  ③ **未通过 / 已取消 / 出错**三态；④ **421–499 px** 之间的宽度（只探了 420 与 500 两侧）；
  ⑤ **live 档案升级 / 重载 / 重启**（红线：live 里那份插件仍读作 `0.13.48`）；⑥ 读屏软件实测；⑦ Firefox / Safari；
  ⑧ 真 Mermaid 渲染器（这台机器上没有，也不联网——真机核的是「文本与 DOM 数得一样」，不是「渲染出来一样」）。

## 26. 横排分叉面板：七层、六环、五验（2026-11-26，`feat/task-fork`）

**§25 的页面被本节取代**：竖排步骤树（腿一行、计划任务挂在腿下）连同 `flowchart TD` 文本一起退场，
dock 上那颗「收下这版」（`progress.dock.accept`）也删掉。§25 里**仍然成立**的是数据口径那一半：
§22 的退回事实链（标记 → 读回 → 事件）、§25.7 的诚实边界（不编数字、不从计划里推）、§25.6 的状态词汇与颜色 token。
本节写的是**现在的模型与契约**（同一块里排版那一半按它渲染：几何、CSS、DOM、真机读数不在本节，见 §26.9）。

本节 `CONFIRMED` 的部分：源码 `src/client/index.js` 的模型与文本写入、`test/progress-panel-model.spec.ts`（23 条）、
`test/i18n-parity.spec.ts`（8 条），以及门禁三条命令（§26.9 逐字）。裁决条目见 `D-175`。

### 26.1 七层，一列一件事（`CONFIRMED`）

| 层 | 盒子 | id | 形状 | 说什么 |
| --- | --- | --- | --- | --- |
| 0 | 起点 | `start` | stadium | `progress.flow.start`（起点），恒 `done`，无调用 |
| 1 | 规划 | `plan` | stadium | `progress.flow.plan`（规划）；它自己的调用 |
| 2 | 任务 | `t<号>` / `u1` | round | recorder 写的 phase **原文**（计划任务自己的名字） |
| 3 | 子任务 | `<任务id>_s<seq>` | rect | 那条调用说的腿词（`执行` / `检查` / `复核`）；不认腿的行用自己那一行标签 |
| 4 | 汇合 | `sum` | stadium | `progress.flow.summarize`（汇总）；它自己的调用 + 退回裁决 |
| 5 | 验收 | `accept` | stadium | `progress.flow.accept`（验收）；五盏验 |
| 6 | 终点 | `end` | stadium | `progress.flow.end`（终点），恒为这一轮的收尾状态 |

- **七层永远都在**：等你点头的一轮、走到一半的一轮、从来没跑到汇总的一轮，`nodes[]` 里都画齐这七层；
  没有任务就没有层 2 的盒子，没有调用就没有层 3 的盒子，层数本身不缩。
- **`nodes[]` 的顺序是「先层、后记录序」**：`start`、`plan`、按号排的任务卡（`t2` 在 `t10` 前）、再按任务分组
  的顺序排各条分支（每组内按 `seq`）、`sum`、`accept`、`end`。
- **`at` 是层号 + 1**：`total` 恒为 **7**（`PANEL_LEVELS`），`remaining = 7 − at`。读者站的那一盒
  （`current: true`，全图恰好一颗）见 §26.6。

### 26.2 一个盒子有哪些字段（`CONFIRMED`）

| 字段 | 出现在 | 意思 |
| --- | --- | --- |
| `id` | 全部 | 见 §26.1 的 id 规则；文本里只有 `end` 写成 `finish` |
| `kind` | 全部 | `start` / `plan` / `task` / `sub` / `summarize` / `accept` / `end` |
| `level` | 全部 | 0–6 |
| `label` | 全部 | 读者会看见的词；只有任务卡是 recorder 的原文，别的都是腿词 / 键词 |
| `state` | 全部 | `done` / `doing` / `failed` / `blocked` / `pending` / `cancelled`，折法见 §26.3、§26.4 |
| `current` | 全部 | 读者站的那一盒 |
| `calls` | 全部 | 它拥有的行，按 `seq` 排；两端与 `accept` 恒为 `[]` |
| `openable` | 全部 | 有调用即可开；`sum` 带着退回裁决时也可开（照 §25.1 的老规矩） |
| `rings` | 仅层 2 | 六盏，顺序固定（§26.3） |
| `checks` | 仅层 5 | 五盏（§26.4）；同一份 `graph.checks` |
| `rejected` | 仅层 4 | 每一稿都被退回的裁决，原样来自 `run.summaryRejected` |
| `subtask` | 仅层 3 | `{ taskId, taskNumber?, seq, leg?, attempt }` |

- **没有 `ordinal` / `attempts` / `taskNumber` / `leg`**：任务号在 id 里（`t3`），一次任务试了几遍写在它各条分支上。
  旧的两样（重试圆点、访问号角标）跟着旧图一起退场。
- **`subtask.taskNumber` 只在有号时出现**：`u1` 那一组的分支没有这个字段，别拿它当必有项。

### 26.3 六环：一张任务卡上的六盏灯（`CONFIRMED`）

顺序固定：`plan` → `execute` → `check` → `review` → `accept` → `summarize`（`PANEL_RING_KEYS`）。

| 灯 | 怎么折 |
| --- | --- |
| `plan` | **规划那一盒的状态**（每一张卡同一个事实） |
| `execute` / `check` / `review` | 只看这张卡**自己**的、标签认这条腿的行：`progressNodeState()` 那一套（`ended` 有感知）；一条都没有 → `pending` |
| `accept` | `check` 或 `review` 是 `failed` / `blocked` → `failed`；两门都 `done` → `done`；任一门 `doing` → `doing`；否则 `pending` |
| `summarize` | **汇合那一盒的状态** |

- **腿只看标签，相位永远不绑腿**：`phase` 认的是任务，一张名叫 `任务 7 · 检查口径` 的任务卡不会因此多出一盏检查灯。
- **重试过的那次不算没过**：`progressRecoveredFailures()` 之后才折，所以「先没过、后来过了」是绿灯
  （那条分支自己仍是红的——它是那一次调用的事实）。
- **一门没跑就不算过**：`accept` 只在两门都 `done` 时绿；`model` 之类只跑了检查的流，验收灯是暗的，不是绿的。

### 26.4 五验：一轮的五盏灯（`CONFIRMED`）

顺序固定：`machine` → `model` → `isolated` → `human` → `ledger`（`PANEL_CHECK_KEYS`）。

| 灯 | 谁点它 |
| --- | --- |
| `machine` | 标签认**检查**这条腿的行（机器验收） |
| `model` | 标签认**复核**这条腿的行（模型复核） |
| `isolated` | 标签或相位带 `真机` / `隔离` / `soak` / `isolated` 的行 |
| `human` | 标签或相位带 `人验` / `人工` / `human` 的行 |
| `ledger` | 标签或相位带 `对账` / `核对` / `reconcil` 的行 |

折法（顺序就是契约的字面顺序）：**一条都没有 → `pending`；有任何一条还没结算 → `doing`；全都结算且没有当前失败
→ `done`；否则 `failed`**。「当前失败」= 扣掉被后来的同单位尝试替代的那些（`progressRecoveredFailures()`）。

- **只有记录能点灯**：页面从不替事件流勾选任何一道验。这一轮没跑真机，`isolated` 就是暗的，不会因为「大概没问题」变绿。
- **拉丁词按词干认**：`reconcil` 是一个词首前缀，所以 `reconciliation` 算对账；中文词照 `progressPhaseCarriesToken()`
  的边界规则，`人工` 里的字不会误吞。
- **灯在图上也在验收卡上**：`graph.checks` 与 `accept.checks` 是同一份，读者在哪一处读都读到同一件事。

### 26.5 边与 Mermaid 文本（`CONFIRMED`）

边只有这几种用途，别的边一条都不发：

| 边 | kind |
| --- | --- |
| `start → plan` | `chain` |
| `plan → sum`（**只在没有任何任务卡时**，一轮里只有规划/汇总行也算） | `chain` |
| `plan → t1`、`plan → t2`…（每张任务卡一条） | `fork` |
| `任务 → 它自己的每条分支` | `branch` |
| `每条分支 → sum` | `join` |
| 一条调用都没有的任务卡 `→ sum` | `join` |
| `sum → accept` | `chain` |
| `accept → end` | `chain` |

- **文本是结构来源**：`panelMermaid()` 写 `flowchart LR`，一盒一行、一边一行、两空格缩进；
  页面排的是 `parsePanelMermaid()` 读回来的那份图，不是 `nodes`（§25.5 的规矩不变）。
- **形状**：`start` / `plan` / `summarize` / `accept` / `end` → `(["…"])`（stadium），任务卡 `("…")`（round），
  分支 `["…"]`（rect）。**终点在文本里仍写 `finish`**（`end` 会关 `subgraph`），模型、DOM 钩子与所有边仍叫 `end`。
- **六环、五验、第几遍是装饰，不进文本**；但分支自己的词条（含 `· 第 2 遍`）是它的标签，所以那半句在文本里。
- **每一种状态都是**一个**连通块**：没有任务卡时（等你点头的一轮、只有规划/汇总行的一轮），`plan` 与 `sum` 之间
  **补一条 `chain` 边**，否则「起点 → 规划」会跟「汇总 → 验收 → 终点」两半分着飘。有任务卡时那道缺口由图的分叉
  自己接上，这条边**一条都不发**，所以「不许有别的边」仍然成立；两种情形 `test/progress-panel-model.spec.ts` 都钉住了。

### 26.6 顶上那句话与「还剩约」（`CONFIRMED`）

- **读者站的那一盒**：有没结算的行 → 那行**最具体**的归属盒（分支优先于它那张任务卡）；这一轮结束了而什么都没开着
  → 第一颗 `failed` / `blocked` 的盒；否则 → `end`。**一行都没声明、也没结束** → `start`。
- **`at` = 那一盒的层 + 1**，`total` = 7，`remaining` = 7 − at。等你点头的一轮是「第 1 步，共 7 步」。
- **估算按层量**：一层算「量到了」要**这一层的每一盒都 `done`、且这一层每一行两个时间戳都在**；这一层的跨度 =
  `max(endedAt) − min(startedAt)`。估算 = **已量到的层跨度的平均** × 还剩几层，按老规矩圆整
  （一分钟以下取 5 秒、以上取 10 秒，`progressPanelRounded()`）；**一层都没量到、或者没有剩余层 → 这半句不打印**。
- **不编数字**：没有百分比、没有通过率，看不见的数一个都不出现（§25.7 的边界原样保留）。

### 26.7 图是数据推出来的，且一行都不丢（`CONFIRMED`）

- **每一次渲染都从 `run.members` 重推**：没有一份缓存，也没有一步「记住上次的计划」。所以**重规划**之后
  （多一张任务、多几行），图自己长出那张卡、它各条分支和它们的线，别的盒子一个字段都不变
  （`test/progress-panel-model.spec.ts` 里那条重规划用例就是逐字段比的）。
- **每一行恰好落在一个归属盒**：归属只有三种——`plan`、某张任务卡、`sum`。分支是任务卡的**再分**，
  不是第四个归属，所以「每一行恰好一处」与「一条调用一条分支」同时成立。
- **归属规则**：认腿的行跟腿走（`规划` → plan、`汇总` → sum、`执行`/`检查`/`复核` → 它 phase 认的那张任务卡）；
  不认腿的行留在它原来那个位置——**第一条工作行之前**归 plan、**最后一条工作行之后**归 sum、
  **夹在两条工作行之间**归它前面那条工作行的那张卡（§25 的老插入规则，用来保证不丢行）。
- **Guardian 自己那一行不算这一步的活**（它有自己那张卡，照 §25 的规矩），所以它不在任何盒子的 `calls` 里。

### 26.8 文案：加十四颗、删一颗（`CONFIRMED`）

| 键 | 中文 | English |
| --- | --- | --- |
| `progress.flow.accept` | 验收 | Accept |
| `progress.ring.plan` / `.execute` / `.check` / `.review` / `.accept` / `.summarize` | 规划 / 执行 / 检查 / 复核 / 验收 / 汇总 | Plan / Execute / Check / Review / Accept / Summarize |
| `progress.verify.machine` / `.model` / `.isolated` / `.human` / `.ledger` | 机器远端 / 模型复核 / 真机隔离 / 人验 / 对账 | Remote machine / Model review / Isolated real machine / Human review / Ledger reconciliation |
| `progress.panel.rings` / `progress.panel.checks` | 六环 / 五验 | Six stages / Five checks |

- **删掉的一颗**：`progress.dock.accept`（收下这版）——点一下接受这一版的那个动作随旧面板一起退场，
  两本字典都不许再出现它，`test/i18n-parity.spec.ts` 的删除清单里有它。dock 只剩「开工」那一颗。
- **`progress.*` 键数 64 → 77**（+14 −1），两本字典仍然逐键平行。
- **`progress.panel.etaBasis` 的文案没改**：它说的是「按 {n} 个已完成**步骤**的实测耗时推算」，而 `basis` 现在数是**层**。
  这一块没有改文案的授权，照实记在这里（见 §26.9 的开放点）。

### 26.9 验证指针与没验的（`CONFIRMED` / `NOT_RUN`）

- **门禁（本块收尾，本树自己跑）**：`npx tsc -p tsconfig.json --noEmit` **`EXIT=0`**；`npx oxlint src test`
  **`Found 14 warnings and 0 errors.`**（187 文件 / 96 规则）；八份进度相关 spec **`8 files / 331 passed`**
  （client 153 + progress-panel 38 + progress-panel-model 23 + progress-connector 15 + progress-hint-absent 8 +
  i18n-parity 8 + progress-tab 72 + progress 14）。整仓套件与 `npm run ci` **`NOT_RUN`**（§12：块里只跑碰到的 spec）。
- **浏览器包**：`lib/client.js` **422 685** 字节 / `sha256 c6387e1b…be0186`，与 `src/client/index.js` 同哈希、
  `cmp` 空输出（`node scripts/build-client.mjs` 之后）。
- **这一半管什么**：`test/progress-panel-model.spec.ts`（23 条）管模型（七层与 id、边、六环、五验、一句话与估算、
  `flowchart LR` 往返、重规划、卡住三级、dock 没有接受键）。**排版、样式与 DOM 钩子是同一块的另一半**，
  由 `test/progress-panel.spec.ts`（38 条）与 `test/progress-connector.spec.ts`（15 条）加下面的真机读数覆盖；
  本节只转述它们的结论，不记几何数字。
- **真机（`CONFIRMED`，隔离档案：克隆 live `web` 档案、`DSH_HOME` 走 scratch、端口 **3412**、真模型、三个任务的真实工作流，收尾已拆）**：
  装进去的是 `file:….tmp/soak-fork/pack4/dsh-grok-workflow-0.13.53.tgz`（**1 033 214** 字节 / `sha256 b5b7d208…3c46` / 164 文件），
  读回 **`0.13.53`**、装好的 `lib/client.js` sha 与工作树相同（`c6387e1b…`）、软链 **0** 个。
  **七张读数**：桌面 1500 进行中 **11 节点 / 12 边**、完成态 **17 / 24**、点开一颗节点 17 / 24（调用列表 **1** 行、亮线 **9** / 暗 **20**）；
  手机 390 三张同计数；外加一张 native-390 完成态 17 / 24。**18 盏环 = 3 张任务卡 × 6**、验收卡 **5 盏验**
  （`machine=done, model=done, isolated/human/ledger=pending`）、完成态 dock 里 `dock-fill` **0** 颗（没有「收下这版」）、
  卡住那句每张都没有、顶上那句进行中 `第 3 步，共 7 步 · 还剩约 …` / 完成态 `第 7 步，共 7 步`。
  **页面真值核对每张都对**：`-source` 首行 `flowchart LR`、节点行 / 线行数与 DOM 相等、**一个连通块**、终点写作 `finish`；
  `document.scrollWidth === clientWidth` 两档成立、390 下图在自己内部横向滚（1078 / 383）；控制台 **0** / 页面异常 **0**；
  这一轮真的写出 `notes.md` **90 B**、`test.txt` **6 B**、`third.txt` **4 B**。
- **真机截图抓到、套件事先没抓到的四条**（都在同一分支修掉、各补一条守卫，逐条见 `D-175`）：① 「汇总」那颗盒子被裁成只剩「汇」；
  ② 展开的调用行塌成一字一行；③ 邻居卡片盖住展开的列表（开卡补 `z-index`）；④ 列表透出背景（主题 token 死了，改成
  `var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, Canvas))`，实测算出来 `rgb(255,255,255)`）。
  **①–④ 是真装真跑拍出来的，不是套件先抓到的；把它们挡在门外的是补上的守卫。**
- **`NOT_RUN`：** ① 原生手机上的**进行中**截图；② 等你点头态（`开工` 那颗按钮）在真机上；③ 分支上的 `· 第 n 遍`
  （三个任务都是一次过，没造出重试）；④ 深色主题；⑤ 320 px；⑥ 读屏软件；⑦ Firefox / Safari；⑧ 真 Mermaid 渲染器；
  ⑨ live 档案升级 / 重载 / 重启（红线：不动 `~/.dsh` 与在跑的实例）；⑩ 整仓测试与 `npm run ci`（§12）。
- **开放点（照实记，等裁决）**：`u1` 那一组没有任务号，所以它的分支上没有 `subtask.taskNumber`，
  页面也就没有 `data-task` 可读；`at` 走「分支优先」，所以「卡在哪」那一句说的是任务层（`at` 3）、
  而顶上那句说的是分支层（`at` 4）——两个数都对，但读者会同时看到两个不同的步号；
  `progress.flow.visit` 这颗键现在没有代码读它（访问号角标退场后只剩在字典里），删不删等裁决。
