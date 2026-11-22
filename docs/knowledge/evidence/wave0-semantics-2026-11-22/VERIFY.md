# Wave 0 — 薄语义设计：证据与复核记录

- 日期：2026-11-22
- 交付物：`docs/knowledge/DESIGN-dynamic-steering-semantics.md`
- 本目录：复核记录、可读性检查器、检查输出
- 范围：只写本目录与那份设计文档。`src/`、`test/` 一行未改，只读。

## 0. 结论

设计文档已落盘，五条验收标准逐条对上（§2）。复核过程改了八处（§3），其中三处是**事实错误**
而不是措辞问题：旧稿把「不存在的失败分类方案」写成了现状、把面板派生显示态 `blocked` 当成了
任务终态、以及漏掉了一条当时正在落地的契约失败规则。若不改，Wave 2–4 会照着错的语义写代码。

## 1. 复核方式

不是读文档改错字，而是**逐条回代码核对**旧稿的每一条「现状」断言。核对到的每个符号都记录在
设计文档的附录 A（符号锚点 + 采样行号 + `CONFIRMED`）。

采样时间 2026-11-22 00:50–01:15。`src/carryover.ts` 在此期间被另一个 agent 改过一次
（mtime 00:55:24，新增 `changedFields`），`src/script.ts` 新增了 `contractFailure()`。
正因为文件在动，正文改成按符号名引用，行号只作采样值并在文档里写明会漂移。

## 2. 验收标准对照

| 验收标准 | 落在哪 | 复核证据 |
| --- | --- | --- |
| 三态定义 `verified` `failed` `blocked` | 设计文档 §1（表 + 四条不变量 + 契约失败例外） | `src/types.ts` `TaskStatus`；`src/script.ts` `blockedResult()` |
| 报告判定表，覆盖 `partial` 与「含 `blocked` 不为 `completed`」 | 设计文档 §2（七行判定表 + 五条推论） | `src/report.ts` `assertWorkflowReport()` 的 `completed` / `partial` / `failed` 分支；`src/script.ts` 报告装配段 |
| 取消结算 `keepCancelledWork` 遇 `blocked` 修形 | 设计文档 §3 | `src/run.ts` `keepCancelledWork()` |
| 继承 `retain`/`redrive`/`reverify`/`replan` 与回避规则 | 设计文档 §4、§5 | `src/carryover.ts` `ResumeKind` / `resumeDecisions()`；`src/script.ts` supervisor 门控注释 |
| Markdown 可读性、无截断半句 | 本目录 `readability.txt`：`findings: 0` | `check-readability.mjs`，另有反向夹具证明它有牙（§4） |

## 3. 复核中发现并修掉的问题

1. **旧稿 §1 注 2 是半句话，且写了一个不存在的方案。** 原文
   「`category` 用 `configuration` 之外的专用说法：本轮实现用 `cancelled` 之外的 `blocked` 语义句」
   既不成句，也不成立：`FailureCategory` 里没有 `blocked`，代码的注释明写「no category is
   invented for it」。改为「不给它发明失败分类」，并给出真实落点。
2. **面板 `blocked` 与任务 `blocked` 被混为一谈。** 旧稿给了面板文案「未跑（前置失败连累）」，
   但面板现在的 `blocked` 是**派生显示态**（`src/progress-tab.ts` `nodeState()`，含义是
   「这行没结算」／「引擎给的结果既非 completed 也非 cancelled」，i18n 中文「阻塞」）。
   照旧稿实施会把两种不同的 `blocked` 合并成一种。改为：明确区分，并把面板单独文案列为
   Wave 1 规则。
3. **漏掉契约失败规则。** `src/script.ts` 新增 `contractFailure()`：上游 `verified` 但交不出
   任何 artifact 时，下游记 `failed`（不是 `blocked`），一行没跑、不烧重试。旧稿的
   「没跑 → `blocked`」会被这条打破，故在 §1 写明例外，并在 §2 补推论 5
   （`failed` 不要求「真跑过」，实现不得用「有 execution 才算 failed」去校验）。
4. **旧稿 §5 自相矛盾。** 第一条把「同一路由 + 同一调用世代」当成 verifier 身份，
   第三条却说「同一路由不构成回避理由」。重写为 V1–V5：产出与判定分离、复核 fail-only、
   verifier 不得被复核环节当证据、配置塌陷标 `self-review`、不引入新状态。
5. **旧稿 §2 判定表缺两种情况。** 一是 0 任务 / plan 不可用（`failureReport()`：
   `failed` + `plan.source: 'unavailable'` + `workflow` 占位行）；二是 `completed` 报告的
   `errors` 可能非空——校验通过后 guardian 会追加 `phase: 'Guardian'` 而行且不改 `status`。
   后者不写清，Wave 3 会以为「`completed` 一定 `errors` 空」而写出过度校验。
6. **旧稿 §4 把已实现的东西写成待实现。** 继承摘要其实已接进 planner/worker 提示词
   （`run.ts` `inheritanceForSession()` → `buildWorkflowRequest()` 的 `inheritance` →
   `script.ts` `inheritanceSection()`）。已改为现状；真正待实现的只剩「报告带来源轮次」。
7. **旧稿 §4 护栏措辞与实现不符。** 原文说验收条件被改就「判该轮失败」；实际是**报告被拒**
   （`assertWorkflowReport()` 逐字段比对 `plan.tasks` 与 `tasks`，含 `acceptanceCriteria`），
   上层落 `failureReport`。措辞已对齐，否则会误导实现去做一个不存在的状态迁移。
8. **行号会烂。** 并行开发下 `src/carryover.ts` 在我写作期间就被改了，旧稿的行号引用当场失效。
   正文改成符号锚点，附录 A 的行号标为采样值。

## 4. 可读性检查（可复现）

检查器把「段落 / 条目 / 表格行」当作判定单元，而不是物理行——中文正文是硬换行的，
物理行以「，」结尾是正常的；只有**整块**以逗号、顿号、冒号、分号、开括号结尾，
或以 ASCII 字母/数字结尾，才算硬缺陷。

```text
$ node docs/knowledge/evidence/wave0-semantics-2026-11-22/check-readability.mjs \
    docs/knowledge/DESIGN-dynamic-steering-semantics.md
{ "lines": 252, "blocks": 83, "headings": 11, "bullets": 48, "paragraphs": 19,
  "tableBlocks": 5, "tableRows": 51, "fences": 0, "findings": 0, "advisoryEnds": 1 }
ADVISORY (block ends lacking sentence-final punctuation — confirm each is metadata):
  - L3: ...- 日期：2026-11-21 起草，2026-11-22 复核修订
OK: no readability findings
```

唯一一条 advisory 是文首的日期行，本来就该这么写。其余 82 个块全部以句号、冒号引导语或
闭括号收尾。

**检查器自己改过三次，每次都记在这里，免得后来人以为是在放宽标准：**

1. 第一版按物理行判，报出 55 条「截断」，全是硬换行造成的假阳性 → 改为按块判定。
2. 按块后剩 9 条，全是「以冒号引导下方列表」的合法写法 → 加「冒号 + 紧随列表/表格 → 引导语」例外。
3. `VERIFY.md` 自己又暴露两个盲点：冒号引导**代码块**未算引导语、`- 键：值` 元数据行被当成句子
   → 补上这两类；同时给元数据行加条件：值必须以数字、ASCII、反引号或闭括号收尾，
   否则仍按截断处理（防止把一个以汉字结尾的截断句冒充元数据）。

**反向夹具**（已随本目录提交，证明检查器不是只会说 OK）：

```text
$ node docs/knowledge/evidence/wave0-semantics-2026-11-22/check-readability.mjs \
    docs/knowledge/evidence/wave0-semantics-2026-11-22/truncated-fixture.md
FINDINGS:
  - L7-L9: table rows have 3/2 pipes
  - L3: block ends mid-sentence ("，")
exit=1
```

**限度要说清**：这个检查器抓得住「截断落在标点或 ASCII 词上」「表格缺列」「括号/反引号不闭合」
「围栏失衡」「占位符残留」，但**抓不住「截断恰好落在普通汉字上」**——那与硬换行的续行在字符层面
无法区分。所以它给出 advisory 列表让人过目，而不是假装自动判定。设计文档是靠通读 + advisory
只有一条元数据行来确认「无截断半句」的，不是靠工具断言。

## 5. 已知限度（未做与做不到的）

- **没跑 `npm run ci`**：本任务是设计文档，按约束不改 `src`/`test`；而且工作树正处于并行
  落地状态，跑全量测试测到的是别人的中间态，不是本任务的证据。`NOT_RUN`。
- **没做浏览器渲染核对**：可读性是结构检查（围栏、表格列数、整块收尾），不等于视觉排版正常。
- **行号会漂移**：附录 A 的行号是采样值，符号名才是锚点。若某天符号被重命名，附录 A 需要重采。
- **PLAN 对照是抽样而非全量**：核了 §4 已定语义、§10.3 Q1–Q9 中与本文相关的条目、A2/A4；
  没有逐条复核 Q6/Q8/Q9 的实施细节，那些不属 Wave 0。
- **`session-31bc` 上下文我拿不到**：任务 JSON 提到要对接该会话，但我这层没有它的内容，
  只能按 PLAN 与代码核对；如该会话另有定案，需要在拍板时补进来。

## 6. 本任务写入的文件

- `docs/knowledge/DESIGN-dynamic-steering-semantics.md`（重写，待用户拍板）
- `docs/knowledge/evidence/wave0-semantics-2026-11-22/VERIFY.md`（本文件）
- `docs/knowledge/evidence/wave0-semantics-2026-11-22/check-readability.mjs`
- `docs/knowledge/evidence/wave0-semantics-2026-11-22/readability.txt`
