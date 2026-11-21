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
`起点 → 规划 → 执行 → 检查 → 汇总 → 回答 → 终点`（`PROGRESS_STAGES`，`src/progress-tab.ts`），
计划任务节点插在 `执行` 与 `检查` 之间。逐条事实：

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
| `failed` | 该节点任一行 `outcome === 'failed'` | 事件原话 |
| `doing` | run 未结束且存在未结算行 | 事件（缺 `agent-end`） |
| `done` | 行非空且**全部**结算为 `completed` | 事件原话 |
| `blocked`（派生） | run 已结束仍有未结算行；或某行 outcome 既非 completed 也非 cancelled | 由缺失/异常**推导**，tooltip 说明 |
| `cancelled` | 存在 `outcome === 'cancelled'` 的行 | 引擎原话（不派生） |
| `pending` | 其余（含无行的模板阶段） | 空态 |

**blocked 一律带 tooltip**：`progress.derived.runEndedUnsettled`（运行已结束但有未结算行）或 `progress.derived.outcomeUnsettled`（引擎 outcome 既非完成也非取消）。`blocked` 是唯一派生状态；`cancelled` 只用引擎自己的词，绝不由「没有结算」推出来。

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
- **连接线**：`segment 之间`一条轴线（`.gw-progress-link`，18×2px，`margin-top: 13px` 与环心同高）；
  `data-filled` 只在该段 `done` 时填绿，`data-flowing` 表示下一段正在跑（蓝色流动虚线）。
  segment 内部的横线已删除（旧实现会在透明 head 后面横穿环与 label）。
- **doing 脉冲只在 CSS**（`@keyframes gw-progress-pulse` 作用于 doing 的环），
  `@media (prefers-reduced-motion: reduce)` 同时停掉脉冲与流动虚线。
- **缩放**：`--gw-zoom` + `font-size: calc(13px * var(--gw-zoom))`，`localStorage['dsh.gw.progress.zoom']`（0.8–1.6，步长 0.1）；storage 被拒只损失偏好，不损失 Tab。
- **键盘 / aria**：轨道 `role="group"` + `aria-label`；节点是 `button`，`aria-label` = `「阶段 · 状态」`，`aria-expanded` 表示详情是否展开；roving tabindex（恰好一个 0，其余 −1），`←/→/Home/End` 移动并同步焦点。
- **窄屏**：`@media (max-width: 720px)` 收紧间距、连接线收窄，head 转为竖排（环在上、label 在下）；
  `@media (max-width: 480px)` 轨道转竖排 step list（连接线隐藏）、详情变为**底部抽屉**（字段单列）。
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

- 轨道 = `PROGRESS_STAGES` 七段固定脊椎（`src/progress-tab.ts:181`），未命中任何阶段的
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
| 1 | 任务节点一多，标签全被截断 | 截图 1506 px 宽、16 个节点，`任务 2…` 至 `任务 8…` 全部 ellipsis。根因是模板段（恒 7 个）与任务段（1..N 个，N 由计划决定）共用一条等分 `flex` |
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
| D | 结算堆积条：一条 100% 宽分段条，按 `outcome` 分色 + 计数 | 失败了几条，不用逐个点开 | 现有事件已足够（`outcome` 原话 + `declared`） | 低：替换或补充 header 里的 `7/11 · 64%` | 极低 |
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
