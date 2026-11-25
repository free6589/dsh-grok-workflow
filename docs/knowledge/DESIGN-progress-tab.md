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
