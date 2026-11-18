# nr_reconcile — 对证 NR 声明与 STATE Round 15 实测记录矛盾

- 日期：2026-11-18（Asia/Singapore）
- 基线：工作树 = `main` @ `be64d56`，`package.json` version = **0.11.12**（`node -e "console.log(require('./package.json').version)"` → `0.11.12`），与任务声明的 v0.11.12 基线一致
- 只读范围：`docs/knowledge/` 下的声明与实测记录（任务约束）；`git diff --stat -- docs/knowledge/` 为空，所引行号均为已提交状态
- 方法：逐条取 NR（`NOT_RUN` ledger，见 STATE.md:404 "NOT_RUN ledger NR"）原声明与 STATE/VALIDATION Round 15 实测原文，按 AGENTS.md 真值规则（"Memory never overrides observed reality"）对证

## 结论（先行）

**矛盾部分成立。**

1. 若"NR 声明"指 NR-7 / NR-8（设置页/真设置编辑两条）——**矛盾不成立，是误读**：NR 账本这两行的状态列早已写明 "closed in t32 (measured)"，与 STATE Round 15 的实测记录一致。
2. 若指 NR-4 / OQ-018（设置写入落盘两条）——**矛盾成立**：这两行仍保留 t32 之前的旧措辞（"no write was performed" / "NOT_RUN — nested path writes are source-confirmed only"），而实测记录（Round 3/t32 与 Round 15/t57）已经真 GUI 保存把设置写入 `cordis.patch.yml` 落盘并进入 Loader entry 的 `user` 层（含嵌套 `roles.planner` 路由写入）。
3. 以哪条为准：**以实测记录为准**（AGENTS.md："Memory never overrides observed reality"）。修正位置：`docs/knowledge/WORKFLOW-DESIGN.md:1042`（NR-4 行"level achieved"列）与 `:999`（OQ-018 行）——两处均在本任务允许写入范围之外，本任务不改，留待后续文档同步任务。
4. 误读原因（对 NR-7/NR-8 而言）：NR 账本行由三列组成，"item"列按设计用疑问句保留原始问题（"whether a **real settings edit against a live Loader** reaches the next message"），状态在"level achieved"列；只引用 item 措辞而不读状态列，就会得出"NR 说没实测过"的假象。另一误读来源是把 `docs/knowledge/VALIDATION.md:618-619` 的历史句子（Round 2，2026-10-26，t32 之前）当成 live 声明——它已被 Round 3（t32）与 Round 15 实测取代。

## 一、NR 声明原文（`docs/knowledge/WORKFLOW-DESIGN.md`）

账本定义（:1032-1035）：

> `## NOT_RUN ledger (never a premise)`
> `Source-confirmed is **not** runtime-verified. These items were not measured and must not be cited as working:`

- **:1039（NR-1）**
  `| NR-1 | web long-lived profile, delivery while the parent is idle | **partly closed by t25**: the one-shot half is measured both ways (E-38 works with in-turn, E-39 produces nothing with relay); the long-lived GUI half is still unmeasured | decides whether relay/append remain usable in the GUI at all — in-turn does not depend on it |`
- **:1042（NR-4，矛盾行 ①）**
  `| NR-4 | settings update/replace/mutate writing to disk through a real Loader entry | host-side contract source-read in dsh-settings (descriptor shape, autoGenerate default, path ops, SETTINGS_CONFLICT, prepareDocument); no write was performed | whether stage 2 can edit chains at all |`
- **:1045（NR-7）**
  `| NR-7 | this plugin's settings page in the **stock Web GUI** | **closed in t32 (measured)**: … | the answer is "a generated page alone is unusable in the GUI"; U-6 is no longer a maybe — the custom editor shipped in 0.2.0 |`
- **:1046（NR-8）**
  `| NR-8 | whether a **real settings edit against a live Loader** reaches the next message | **closed in t32 (measured, GUI)**: Playwright opened the plugin page on a separate profile, set maxConcurrency 3→5 and appended a planner route, pressed Save; POST /api/settings/mutate answered a new revision, the value showed up in the profile's cordis.patch.yml, survived a restart, and settings/describe reported it in the entry's user layer. … | a settings edit applies to the next message; a hand-edited patch file still needs a reload |`
- **:999（OQ-018，矛盾行 ②）**
  `| OQ-018 | settings write-to-disk through a real Loader entry | **NOT_RUN** — nested path writes are source-confirmed only |`

历史来源（`docs/knowledge/VALIDATION.md:618-619`，属 Round 2 段（2026-10-26），t32 之前的旧记录）：

> `The same reason keeps NR-7/NR-8 open: no GUI has ever rendered this page.`

## 二、STATE Round 15 实测记录原文

`docs/knowledge/STATE.md`：

- **:299**
  `| Settings surface (live values, validation) | implemented; the generated page is identified by the runtime; **a live GUI edit is measured — t32 for the 21-key page, and Round 15 re-measured it on 6806426** (card renders, grokDefault off→on, revision 0→1, survives reload, applies to a new session) — NR-7/NR-8 |`
- **:296**
  `| Mandatory entry (gate on agent/pre-step) | …; **long-lived GUI half measured in Round 15 for in-turn** (real Web GUI, gate claims the message, report rendered in the same turn) — relay/append in a long-lived GUI remain NOT_RUN (NR-1) |`
- **:324-333**
  `- **NR-1, NR-7 and NR-8 are no longer open GUI questions** — Round 15 measured all three on a real Web GUI against 6806426 (isolated instance 127.0.0.1:3199, real Chromium) … So the GUI halves are verified for in-turn delivery and for the plugin settings card; **relay / append delivery in a long-lived GUI session is still NOT_RUN** (NR-1's remaining half) …`

原始实测记录 `docs/knowledge/VALIDATION.md` Round 15 (t57)：

- **:1272-1277**：`## Round 15 (t57) — 真 Web GUI：/grok 可切 + 设置页卡片渲染（隔离实例，PASS）`；`CONFIRMED` — 在 `origin/main` `6806426` 上新建的一次性隔离实例里，用真 Chromium 驱动真 Web GUI …；本轮**未改任何源码**。
- **:1327-1339（§2 卡片渲染与编辑）**：Plugins 页 → `Grok workflow` 卡片存在；`grokDefault` 是活的 `off | on` 选择器；revision `0`→保存→**`1`**→整页刷新仍 `1`（`D2`–`D5` 截图）。
- **:1341-1350（落盘证据）**：保存向 profile 的 `cordis.patch.yml` 写入新行，md5 `d7830129b011b732dfa9bec4059f9ff4` → `1f628a0c984daa951aca818879f43a4e`；写入内容 `- id: grok-workflow … config: grokDefault: on`。
- **:1352-1355（功能性生效）**：保存后**新开**一个会话，不发 `/grok`，工作流自己跑起来（`1 subagent`、快手档报告），即 `grokDefault: on` 对新会话生效。
- **:1357-1362（§3 NOT_RUN → CONFIRMED）**：`设置页卡片在浏览器中的渲染 | **CONFIRMED**：§2 卡片渲染、编辑、保存（revision 0→1）、刷新后保持、新会话生效`。
- **:1386-1387（§5 诚实边界）**：`relay / append 在长驻 GUI 里的投递仍 NOT_RUN（NR-1 的剩下半边）：本轮走的是默认 in-turn 投递`。
- 旁证 **:1426（Round 16 item 9）**：`设置页渲染已在 Round 15 的真 GUI 上 CONFIRMED（基点 6806426；与 7357e5e 之间 src/lib/test 无 diff…）`。

t32 的原始实测（`docs/knowledge/VALIDATION.md` Round 3，:432 `## Round 3 / GUI, activation and the settings page — 2026-10-27 (t32 + t33)`）：

- **:472（B3 edit → save → effective）**：`Playwright set maxConcurrency 3 → 5 and appended a planner route, pressed Save: page shows 已保存 and revision 1; POST /api/settings/mutate carried {ns, ops, expectedRevision}; the value is in the profile's cordis.patch.yml; after a **restart** the page and settings/describe still report maxConcurrency: 5 and the planner route in the entry's user layer`
- **:578-579**：`opsFor()` … `roles.<role>` path for a chain —— 即嵌套路径写入走的就是这条实测路径。
- 设计决策 **WORKFLOW-DESIGN.md:702**：`### DD-9c — The settings page must be a browser bundle of this plugin (t32, measured)`。

## 三、逐条对证

| NR 条目 | NR 声明（状态列） | STATE Round 15 实测 | 判定 |
|---|---|---|---|
| NR-7 (:1045) | `closed in t32 (measured)` | 设置页卡片在真 GUI 上 CONFIRMED，Round 15 复测（STATE.md:299/:324；VALIDATION.md:1327-1362） | **一致**。矛盾不成立；误读=只读 item 疑问句、不读状态列，或引用了 VALIDATION.md:618 的 Round 2 历史句 |
| NR-8 (:1046) | `closed in t32 (measured, GUI)`（原文即含真设置编辑落盘、entry `user` 层、重启后仍在） | 同上；Round 15 复测 grokDefault 落盘与新会话生效 | **一致**。同上误读来源 |
| NR-1 (:1039) | `the long-lived GUI half is still unmeasured`（item = delivery **while the parent is idle**，即 relay/append） | Round 15 只实测了 `in-turn` 半边；STATE.md:296/:332-333、VALIDATION.md:1386-1387 明示 relay/append 仍 NOT_RUN（NR-1 剩余半边） | **一致**。表面冲突是"long-lived GUI half"措辞撞车：两方说的不是同一半边 |
| NR-4 (:1042) | `…; no write was performed` | 实测记录里有真设置写入：t32（VALIDATION.md:472，mutate→cordis.patch.yml→entry `user` 层→重启仍在）与 Round 15（VALIDATION.md:1341-1355，真 GUI 保存落盘+revision 0→1+新会话生效） | **矛盾成立**。该行措辞停留在 t32 之前，与实测记录直接冲突 |
| OQ-018 (:999) | `NOT_RUN — nested path writes are source-confirmed only` | 嵌套写入也已实测：t32 append planner route = `roles.planner` 嵌套路径 op，落盘并进 entry `user` 层（VALIDATION.md:472/:578-579） | **矛盾成立**。同上，措辞过时 |

## 四、裁定与修正位置

- **矛盾是否成立**：就"设置 GUI 是否实测过"这一 flagged 声明而言，对 NR-7/NR-8 **不成立**（账本与 STATE 一致，误读）；对 NR-4/OQ-018 **成立**（账本"未写入/NOT_RUN"措辞被 t32 与 Round 15 的落盘实测直接否定）。
- **以哪条为准**：实测记录（STATE.md Round 15 摘要 + VALIDATION.md Round 3/15 原始记录）为准；依据 AGENTS.md "Memory never overrides observed reality" 与 NR 账本自身前言（WORKFLOW-DESIGN.md:1034 "must not be cited as working" 的条目一旦被实测推翻即应更新）。
- **修正位置**（本任务写权限之外，未改，留待后续文档同步任务）：
  1. `docs/knowledge/WORKFLOW-DESIGN.md:1042` — NR-4 行"level achieved"列应改记为 closed in t32/Round 15（实测落盘 + entry `user` 层 + 嵌套 `roles.planner` 写入）。
  2. `docs/knowledge/WORKFLOW-DESIGN.md:999` — OQ-018 行应由 `NOT_RUN` 改记为 ANSWERED/CLOSED（指向 VALIDATION.md:472 与 :1341-1355）。

## 五、已做的最小澄清（VALIDATION.md 单行）

按验收条款 3，仅在 `docs/knowledge/VALIDATION.md` Round 15 §3 表格之后追加**一行**对账澄清（中英文同义）：

```diff
@@ docs/knowledge/VALIDATION.md（Round 15 §3 之后）
+> 对账澄清（2026-11-18，nr_reconcile）：WORKFLOW-DESIGN.md 的 NR-4（"…; no write was performed"）与 OQ-018（"settings write-to-disk … NOT_RUN — nested path writes are source-confirmed only"）是 t32 之前的过时措辞，已被本节 §2/§3 与 Round 3（t32）的实测取代——真 GUI 保存经 POST /api/settings/mutate 落盘 cordis.patch.yml（含 t32 嵌套 roles.planner 路由写入），revision 0→1、刷新/重启后仍在、对新会话生效，以实测为准。Reconciliation note (2026-11-18, nr_reconcile): WORKFLOW-DESIGN.md NR-4 ("…; no write was performed") and OQ-018 ("settings write-to-disk … NOT_RUN — nested path writes are source-confirmed only") carry stale pre-t32 wording, superseded by the measurements in §2/§3 here and Round 3 (t32) — a real-GUI save persisted to cordis.patch.yml via POST /api/settings/mutate (including t32's nested roles.planner route write), revision 0→1, survives reload/restart, applies to a new session; the measured record prevails.
```

无其他任何改写。

## 六、约束遵守

- 读取仅限 `docs/knowledge/`（STATE/VALIDATION/WORKFLOW-DESIGN/HANDOFF/DECISIONS 摘引），未读/未依赖 `.rsi/` 循环记录作为证据源。
- 写入仅两处：本报告（`.rsi/evidence/round-013/nr-reconcile/report.md`）与 `docs/knowledge/VALIDATION.md` 单行澄清。
- 未改 README.md、src/、lib/、test/、版本号、CHANGELOG；未提交、未推送、未打 tag；未写入任何密钥/凭据；所有引文保留原文件行号与原文。
