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
- **轨道**：`height: 96px`、`overflow-x: auto`、`scroll-snap-type: x mandatory`、节点 `scroll-snap-align: center`；28px 环形标记 + 标签（`width: 84px`，超出 ellipsis）。
- **doing 脉冲只在 CSS**（`@keyframes gw-progress-pulse`），`@media (prefers-reduced-motion: reduce)` 停用。
- **缩放**：`--gw-zoom` + `font-size: calc(13px * var(--gw-zoom))`，`localStorage['dsh.gw.progress.zoom']`（0.8–1.6，步长 0.1）；storage 被拒只损失偏好，不损失 Tab。
- **键盘 / aria**：轨道 `role="group"` + `aria-label`；节点是 `button`，`aria-label` = `「阶段 · 状态」`，`aria-expanded` 表示详情是否展开；roving tabindex（恰好一个 0，其余 −1），`←/→/Home/End` 移动并同步焦点。
- **窄屏**：`@media (max-width: 720px)` 收紧间距与节点宽；`@media (max-width: 480px)` 详情变为**底部抽屉**（`position: fixed; bottom: 0`，字段单列）。

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
