# Agent Handoff

## 2026-11-11 — 用户交付层落地：默认回复改为结果先行的场景化自然文案（`feat/user-delivery` @ `d7de24d`，base `84e6894`；未合并、未发布）

- **From:** 执行子代理（user_delivery）· **To:** lead / 后续代理 · **Base:** `origin/main` `84e6894`
- **做了什么（`CONFIRMED`）**：新增 `src/delivery.ts`（用户交付层：`deliveryForReport` 按
  code fix / research / 纯问答 / partial / failed / 取消六场景渲染结果先行的中英文案，
  只引用已核验 `WorkflowReport` 字段，无任务 id / 状态枚举 / 路由与尝试计数 / 时限限额，
  不确定性全场景保留）；`src/answer.ts` 的 relay 契约改为「标记内 = 交付文案，收尾标记之后
  = 机器台账（carry-over 的持久解析源，未改 carryover）」，`humanSummary:false` 恢复旧机器
  正文；`src/gate.ts` 删除两处 `【人话结论】` 头块、`Answer` 带 `lang`、`cancelledText`
  中英双语化（取消二分：未派工 vs. 取消前已核验 N/M＋证据＋审计报告）。
- **测试（`CONFIRMED`）**：`test/delivery.spec.ts` 新增 25 例（zh/en 六场景逐字钉测、零泄漏、
  保真、relay 接线、carry-over 反向兼容钉测）；`test/gate.spec.ts` 三条 B 方案钉测改钉交付
  契约。隔离工作树 `.worktrees/user-delivery` 实测：typecheck 0 错误；lint 4 warnings /
  0 errors（既有）；`TMPDIR=$PWD/out/tmp npx vitest run` → **38 文件 / 685 测试 PASS**
  （基线 37/660）；`npm run build` 干净、`lib/` 随提交入库。六场景前后对照样例（真实构建
  产物生成）：`docs/knowledge/evidence/user-delivery/samples.md`。
- **环境注意（`CONFIRMED`）**：本机 `/tmp` 用户配额耗尽（EDQUOT）→ DSH bash 执行器与默认
  vitest 全挂（`Unknown system error -122, write`）；跑测试加 `TMPDIR=<工作区目录>` 即可，
  彻底解决需清理 `/tmp`/调大配额（用户动作）。
- **并发注意**：main 工作树含另一任务的进行中改动（`src/config.ts`、`src/script.ts`、
  `test/synthesis-guardrails.spec.ts`、`docs/knowledge/RENDERING-STUDY.md`）；本轮全程在
  隔离工作树工作，零接触、未提交。合并本分支前注意这两处 `src/` 改动的冲突面
  （本轮未改这两个文件，理论无冲突）。
- **未做 / `NOT_RUN`**：未推送、未开 PR、未合并（lead 决定）；live `:3090` 复验（需发布部署）；
  在线真模型回放（本轮为确定性验证）。
- **Next action：** lead 复核 Round 38 与样例后推送 `feat/user-delivery` 并开 PR
  （`base:main`，标题建议 `feat(gate): user-delivery layer — result-first scenario wording`）。

## 2026-11-08 — v0.7.0 已发布（tag → `main` `146dce7`）；live `:3090` 一步重启即收口（`CONFIRMED`）

- **From:** lead · **To:** 用户 / 后续代理
- **已发布（`CONFIRMED`）**：`v0.7.0` → `146dce7`（`main`）；GitHub Release
  https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.7.0 ，
  asset `dsh-grok-workflow-0.7.0.tgz` **317,470 B**；Release workflow `42474831253` 绿，
  main 的 CI `42474712526` 绿。tag 不得移动。
- **合并事实**：`origin/main` 的 PR #44 与本分支在 `src/run.ts` 启动段冲突；口径为「保留 main 的
  startup deadline race + 两条入口都走 `teamWorkflowEngine`」。`lib/` 由 `npm run build` 重新生成，
  无手改。合并后 37 文件 / 660 测试 PASS。
- **Next action（用户，一步，`NOT_RUN`）**：重启 `:3090` 才加载新代码。装法二选一：
  ①`dsh plugin --profile web add https://github.com/free6589/dsh-grok-workflow/releases/download/v0.7.0/dsh-grok-workflow-0.7.0.tgz`
  ②本机已打好 `out/dsh-grok-workflow-0.7.0.tgz`（由 `146dce7` 打包，与本 tag 同内容）；
  然后 `DSH_HOME=/home/fish/dsh-layerfs dsh web --host 100.111.111.88 --port 3090 --no-open`。
  重启后应看到：设置页出现「机器台账」开关（默认关）；`/grok on` 跑一次以 `【人话结论】` 开头且无
  `Model routes:` 行；`Model routes`（打开开关后看）里出现 `wb/cn:deepseek-v4.1-flash` 即证明
  Round 35 的「保存即生效」也一起修好了。
- **未做（`NOT_RUN`）**：live 安装副本与本机 `:3090` 均未由代理改动（沙箱对
  `/home/fish/dsh-layerfs` 只读，见 Round 36 尾注）。

## 2026-11-08 — B 方案：`/grok on` 也说人话、机器台账可按需打开（`61c3ac9`，`CONFIRMED`）

- **From:** lead · **To:** 用户 / 后续代理 · **Base:** `61c3ac9`（本仓库 `release/0.6.0`）
- **用户诉求**：`session-00fca25f…` 明明是 `COMPLETED`，但回复通篇是
  `Grok workflow:` / `Confirmed evidence:` / `Model routes:` / `Deadline:` / `Route switches:`，
  用户原话「在我眼里不像人话」。用户明确选择方案 **B（改代码）**，否决了「别开团队」这类用法建议。
- **本轮交付：**
  - `src/gate.ts` `runTeam` → `completed`/`partial` 拼 `【人话结论】任务 N/M 项已核验通过。…`
    ＋汇总首句（`detectLanguage(request)` 定中英）；`failed` 不拼，失败不套成功口吻。
  - `src/answer.ts` → `SUCCESS_PREAMBLE` 允许「先 ≤3 句人话，再原样贴 markers 内全文」；
    `FAILURE_PREAMBLE` 与 markers 结构不变。
  - `src/report.ts` → `renderReport(report, { showDiagnostics })`；新配置 `showDiagnostics`
    默认 **off**，控制 `Model routes` / `Deadline` / `Route switches` / `Route overflows` / `Errors`。
    **`Uncertainties` 有意留在开关外**（carry-over 要从上一轮文本解析它，藏掉会丢追问上下文）。
  - `src/index.ts` 工具 `render` 渲染时读实时开关；`src/client/index.js` 设置页新增中英双语
    「机器台账 / Machine diagnostics」开关。
  - 测试：`test/gate.spec.ts` +3、`test/report.spec.ts` +1 默认视图钉住；volatile 字段数 27→28。
    `npx vitest run` → **37 文件 / 655 测试 PASS**；`tsc --noEmit` 0 错误；lint 4 warnings/0 errors。
- **过程事实（不掩盖）**：执行子代理 `impl-b` 中途失联，改动先落 stash `temp-gate-fix`；
  其自身提交 `ef29e9b` 把 humanSummary 段当「无关 hunk」删掉，本轮在 `61c3ac9` 重新加回并钉测。
- **Next action（用户，一步收口，`NOT_RUN`）**：重启 `:3090` 才加载新模块（D-013 步骤 5，
  `DSH_HOME=/home/fish/dsh-layerfs dsh web --host 100.111.111.88 --port 3090 --no-open`）。
  重启后：设置页应出现「机器台账」开关（默认关）；`/grok on` 跑一次应看到 `【人话结论】` 开头，
  且不再出现 `Model routes:` 等台账行（除非手动打开）。

## 2026-11-08 — 设置保存不生效：已定位并修复（网关把开机快照传给 run）；live 需重启才加载新模块

- **From:** lead · **To:** 用户 / 后续代理 · **Base:** `5b0e3df`（本仓库 `release/0.6.0`）
- **用户现象**：设置页把 `roles.worker` 第一名存成 `wb/cn:deepseek-v4.1-flash`（revision 21、
  无红字、补丁文件该行正确），新会话的子代理却仍点 `global` → `global-sg` → `autoclaw`，
  规划子代理用 `mimo`（补丁里是 muse-spark）。
- **根因（`CONFIRMED`，源码级）**：`src/gate.ts` `installGate()` 解构的是**开机**`deps.config`；
  `safe()` 只喂分类/历史/排队，而 `runTeam()` 的 `runWorkflow` 与两处 `runSingleCall`
  传的都是开机快照 → 保存只影响准入，永远到不了子代理。工具入口传的是 `config: live`，
  两个入口行为不一致。
- **修复**：三处改 `config: limits`；回归用例 + 负向对照（无修复时
  `expected 'old-model' to be 'wb/cn:deepseek-v4.1-flash'`）；`npx vitest run` 37 文件 / 651 PASS。
- **部署状态（关键）**：修复构建已写入 live web profile 安装副本
  `…/profiles/web/node_modules/dsh-grok-workflow/lib/gate.js`（原文件已备份）。
  **但 loader 用无 cache-bust 的动态 `import()`（`cordis-plugin-loader/lib/index.js:214`），
  运行中的 `:3090` 仍持有旧模块** → 必须重启该实例（或任何能重新 import 该模块的等价操作）
  才会加载新代码。**禁止**在没有用户授权时重启 live（D-013 步骤 5）。
- **Next action（用户）**：授权重启 `:3090`（`DSH_HOME=/home/fish/dsh-layerfs dsh web
  --host 100.111.111.88 --port 3090 --no-open`）后，设置页保存的 `cn` 链路即对下一条消息生效。

# Agent Handoff

## 2026-11-08 — 子代理顶栏显示名：live `:3090` 持久面板数据实锤——本轮自己的子代理在 live 上显示为「任务团队 child 28」；用户一步部署即收口（fix_child_names 第 5 轮，零源码改动，`CONFIRMED`）

- **From:** 执行子代理（fix_child_names，orchestrator attempt 5）· **To:** lead / 用户 ·
  **Base:** `91cad68`（本地 `release/0.6.0` HEAD，与 origin 同步，未变）
- **本轮新实锤（全部只读；摘录
  `evidence/childname-fix-2026-11-08/live-descriptor-labels-2026-11-08.txt`，记录
  `VALIDATION.md` Round 33）：**
  - live 顶栏此刻正把**当前 orchestrator run 的子代理**显示成泛化名：最新 14 个子会话
    首 `subagent/descriptor` label 全部为 `任务团队 child 15`…`任务团队 child 28`
    （含 attempt 5 自己的执行子代理 `88e59d33…` = child 28，04:13），0 个描述性标签；
    面板→descriptor 映射已在 Round 32 真 GUI 逐字验证，即 live 面板实际渲染内容。
  - 修复构建在 live home **全域缺席**：`find /home/fish/dsh-layerfs -name team-engine.js`
    → 0。
  - 认证边界复测：`127.0.0.1:3090` / `localhost:3090` / `100.111.111.88:3090` 均 HTTP 401
    （无 loopback 豁免）→ 浏览器级 live 观察对任何代理会话不可行（AGENTS.md 禁读凭据）。
  - 分支告警：默认分支 `main` @ `1f9065d` 不含 `ad66118` → live profile 的 `github:`
    依赖 + `pnpm update` **取不到修复**；必须显式安装 `ad66118` 构建。
- **结论**：验收条款 4 特指 `http://100.111.111.88:3090` 合取的未达 = live 部署状态问题，
  不是验证缺口；本机 GUI 验证 PASS（Round 31/32，同一 `dsh` 二进制 0.2.1-rc.2，真浏览器 +
  6 子代理团队档，顶栏 6/6 描述性、0 泛化）。
- **Next action（用户/lead，一步收口）**：把 `ad66118` 构建装入 live `web` profile（上一节
  步骤：备份 patch → `dsh plugin add` 新路径 tarball → 核对 `dsh.profile.bundles` 三项 →
  `workflow-ptc` enabled），**不要**用 `pnpm update`（main 上没有修复），然后按 D-013 步骤 5
  重启 `:3090`（`DSH_HOME=/home/fish/dsh-layerfs dsh web --host 100.111.111.88 --port 3090
  --no-open`）。之后任意团队档工作流的顶栏即显示描述性子代理名。插件 toggle 重载语义未验证
  （`NOT_RUN`）——重启是保证生效的重载方式。
- **本轮其他**：`npm run ci` @ `91cad68` → 37 文件 / 650 测试 PASS；[COORDINATION] 状态块
  按协议发布到 Issue #1（更正上一节「Issue 无该状态块」的过时记录：attempt 4 的块已存在）。
- **最终轮复验（attempt 6/6，2026-11-08 04:24–04:32，零源码改动）：结果零变化。** `npm run ci`
  @ `b2bf3a8` → 37 文件 / 650 测试 PASS；live 最新 8 个子会话 label 仍为
  `任务团队 child 25–32`（attempt 6 自己的子会话 30/31/32 经任务标记确证在列，0 描述性）；
  `origin/main` 已前进至 `3b1d9a8`（并发任务 PR #44）但仍不含 `ad66118` → 上面的显式安装
  指引与「不要 pnpm update」告警依旧有效；日后把 `release/0.6.0` 合回 `main` 时，
  `src/run.ts` 与 PR #44 双侧都改过，可能需手工调和。记录：VALIDATION Round 34、证据
  `evidence/childname-fix-2026-11-08/live-descriptor-labels-2026-11-08-r34.txt`。

## 2026-11-08 — 子代理顶栏显示名：GUI 浏览器验证 PASS（fix_child_names 验证轮，零源码改动，`CONFIRMED`，`release/0.6.0` @ `ad66118`）

- **From:** 执行子代理（fix_child_names，orchestrator attempt 4 · GUI 验证轮）· **To:** lead / 用户 ·
  **Base:** `ad66118`（本地 `release/0.6.0` HEAD，与 origin 同步，未变）
- **本轮只做验证，不改代码。** Round 31 的修复（twin 引擎 + 提示词首行）此前已过 `npm run ci`
  （37 文件 / 650 测试 PASS）与 headless 真机验证，但「GUI 顶栏实际渲染」未观察——本轮补上：
  隔离 Web 实例（home `out/gui-verify/home/`，profile `guiweb` 从 web 模板创建，插件 dev 安装
  `file:` 链接工作树构建、安装后 `lib/team-engine.js` md5 一致，`workflow-ptc` patch 启用，
  v4-pro + agnes flash，实例 `127.0.0.1:3199`，一次性 token 只走环境变量、不落任何文件、用后即杀）
  + headless Chromium（playwright-core + `chromium_headless_shell-1248`，1440×900）。
  ①真实 composer 键入团队档双计算任务 → `Grok workflow: COMPLETED`（6 子代理，含真实 agnes
  format-error 路由切换重试）；②展开库存 `Session hierarchy` 顶栏面板 → **6 个子代理主标签全部
  描述性**（`规划助手` / 任务标题 / `检查 · 任务标题`），**0 处 `任务团队 child N`**、0 处提示词
  原文作主标签；持久 `subagent/descriptor` 与面板逐字一致。证据：
  `evidence/childname-fix-2026-11-08/gui/`（README + 4 截图 + 3 JSON + 描述符摘录）；
  记录：`VALIDATION.md` Round 32、`DECISIONS.md` D-041 Addendum、`RESEARCH.md` A18 补充、STATE。
- **记忆更正（只读核实）**：live `:3090` web profile 的插件 = **released 0.6.0**（2026-11-07
  21:54 安装；`lib/team-engine.js` 不存在 → 不含本修复）。旧记"仍 0.2.7"过时，STATE/VALIDATION
  已更正。live 实例全程未碰（D-013）。
- **验收条款状态（本轮后）**：条款 1/2/3/5/6 满足；条款 4 的「插件加载于 mise DSH installation +
  ≥3 子代理工作流 + Web GUI 顶栏显示描述性名」三项在本机 `CONFIRMED`（本隔离实例与 live 用同一
  `dsh` 二进制 0.2.1-rc.2）；唯一未达项 = 特指 `http://100.111.111.88:3090` 实例本身——其上仍跑
  不含修复的 released 0.6.0，按 D-013 步骤 5 部署+重启需用户明确授权，且本会话沙箱只可写工作树。
- **未做 / `NOT_RUN`：** live `:3090` 的修复部署与浏览器复验；`[COORDINATION]` Issue 状态块
  （仓库 Issue 列表无该 Issue，历史轮次同样记 `NOT_RUN`）；上游 3 行 ask（可选简化，未执行）。
- **Next action（用户/lead，一次外部动作即收口）：** 把 `release/0.6.0` HEAD（`ad66118`；npm 未
  发布、无新 tag）装入 live `web` profile（备份 patch → `dsh plugin add` 新路径 tarball → 核对
  `dsh.profile.bundles` 三项齐全 → `workflow-ptc` enabled 确认），再按 D-013 步骤 5 重启 `:3090`
  （`DSH_HOME=/home/fish/dsh-layerfs dsh web --host 100.111.111.88 --port 3090 --no-open`），
  即可在 live GUI 顶栏看到同样的描述性子代理名。

## 2026-11-08 — 子代理顶栏显示名：插件侧 twin 引擎落地，真机 PASS（fix_child_names 第四次执行，`CONFIRMED`，`release/0.6.0` 工作树）

- **From:** 执行子代理（fix_child_names，attempt 4）· **To:** lead / 用户 · **Base:** `60cde95`（本地 `release/0.6.0` HEAD；含并发任务 fix_completed_links 的已提交修复）
- **结论：D-039 的 BLOCKED 判定被推翻。** 插件侧存在可用扩展点——插件持有 `ctx.workflowEngine`
  （自己的 inject），而 `PtcWorkflowEngine.start()` 在 start 时才读 `runCtx.subagents`
  （`workflow-ptc/src/index.ts:157`）；插件用**注入引擎自己的构造函数**建私有 twin，
  把 `subagents` 换成在 `startActivation` 处重写 `spec.label`（= 提示词首行）的视图，
  `reflect.provide` 置空保持私有，非 PTC 引擎原样回退并 warn。不改 core、不改引擎、
  不碰共享服务实例。上游 3 行 ask 从"必要"降级为"可选简化"。
- **本轮改动（全在本仓库，未提交，随本轮 commit）：**
  `src/team-engine.ts`（新）、`src/run.ts`（两处调用点）、`src/script.ts`/`src/triage.ts`/`src/gate.ts`
  （子代理提示词**首行**改描述性标题，人设第二行）、`test/team-engine.spec.ts`（新，12 例）、
  `test/engine-harness.ts`（additive 捕获一处）、`CHANGELOG.md`（[Unreleased] Fixed 英中条目）、
  `docs/ARCHITECTURE.md`（执行路径行）、记忆文件（RESEARCH A18 / DECISIONS D-039 addendum + D-041 /
  VALIDATION Round 31 / STATE / 本节）、证据 `docs/knowledge/evidence/childname-fix-2026-11-08/`。
- **真机验证（Round 31）：** 隔离 home `out/childname-fix-verify/`（profile `cfix`）、
  shipping 构建（无调试代码）团队档 COMPLETED；6 个子会话首个 `subagent/descriptor` 全部为
  `规划助手`/`<任务标题>`/`检查 · <任务标题>`（含一条真实 agnes route-switch 重试），
  **0 处 `任务团队 child N`**；修复前同 patch 对照 3/3 旧标签。`npm run ci` → **37 文件 / 650 测试 PASS**。
- **诊断教训（RESEARCH.md A18，三次真机失败换来）：** 不要代理 cordis ctx（receiver 键控的
  fiber walk 会被破坏）；服务**属性访问**受 isolate guard（`cannot get property "X" without inject`），
  显式 `ctx.get(name)`/`ctx.reflect.get(name, false)` 不受——twin 的服务从**引擎自身 ctx** 经
  `ctx.get` 解析进最小 holder。headless 下 cordis logger.warn 不可见，诊断要用工具结果/探针。
- **未做 / NOT_RUN：** live `:3090` 的浏览器复验（实例仍是旧插件 0.2.7，401/D-013，无凭据读取）——
  部署新构建后人工点开团队档即可看到；上游 3 行 ask 未执行（现在可选）。
- **Next action：** commit + push 本轮文件（按文件名逐一 add）；如需在 live `:3090` 生效，
  需用户/lead 重新部署插件（非本会话能力）。
- **标注更正（2026-11-08）：** 上文 Round 31 与 STATE/VALIDATION 里的 synthesizer 首行实为
  `汇总助手`（`src/naming.ts:102` 的 role copy，`memberLabel('synthesizer', 1)`），
  初稿误写 `综合助手`，已在本轮更正。

## 2026-11-08 — 子代理顶栏显示名：第三次执行复核 + 末两个扩展点候选用类型级证据关闭，**BLOCKED 维持（已被上一节推翻）**（fix_child_names，`release/0.6.0` 工作树）

- **From:** 执行子代理（fix_child_names，编排器重试轮）· **To:** lead / 用户 · **Base:** `5d9fcbe`（本地 `release/0.6.0` HEAD，未变）
- **本轮做了什么：** ①把 Round 27/28 的源码链**第三次独立重验**（全部自己重读 installed DSH `0.2.1-rc.2` 与
  core 检出源码，行号见 `VALIDATION.md` Round 29 表）——逐条一致；②新增**类型级证据**，把前两轮仅以
  「理由否决」记录的末两个扩展点候选关闭：`WorkflowStartRequest` 全接口无 label 字段
  （`dsh-workflow/lib/types/runtime-types.d.ts:15-28`）；每 run `subagentProvider` + `registerProvider` 虽是
  真实文档化 API，但 continuable 子代理的 provider 参与只有 `ContinuableCreateSpec { seed? }`
  （`dsh-subagent/lib/types/types.d.ts:187-213`，单字段无 label），descriptor 由 `startLocal` 从
  `spec.label` 快照、label 归 `startActivation` 调用方（types.d.ts:122-124）——调用方即写死的 workflow host；
  无 `prepareContinuable` 的 provider 会把子代理降级为 external 一次性 run（GUI 渲染裸子会话 id，更差且摧毁
  continuable 模型）；引擎 Config 无 label 模板；全 core checkout 仅 `PtcWorkflowEngine` 一个引擎实现；
  `ctx.subagents` 服务面不暴露 `startActivation`。另核：core 检出 HEAD `687f282e` 与 installed 同为
  `0.2.1-rc.2`（无上游修复落地）。
- **结论：BLOCKED 维持（第三次独立确认）。** 主标签只能由 DSH core 的 ~3 行上游改动解锁
  （`runtime.ts` 转发 `opts.label` + `host.ts` 的 `childRequest()/startChild()` 接 `label`）；
  半程缓解（`ctx.sessionTitle.rename`，只改次级行）仍待用户批准且不满足验收条款 1。本轮零源码改动。
- **本轮改动：** 仅记忆与证据文件——`VALIDATION.md`（Round 29）、`DECISIONS.md`（D-039 Addendum 2）、
  `STATE.md`（第三次执行补充段）、本节、
  `docs/knowledge/evidence/childname-blocked/extension-points-closure.md`（新）。**无源码改动、无 `CHANGELOG.md` 条目。**
- **未做 / `NOT_RUN`：** DSH core 未改（约束禁止）；live `:3090` 未碰（D-013，仍 `0.2.7`，本会话无凭据 401）；
  隔离 profile 未再起（Round 28 的真机复现继续有效，本轮复读其证据文件完整）；`npm run ci` 未跑
  （零源码改动；工作树含并发任务进行中的 client 改动；基线 Round 26：35 文件 / 624 测试 PASS）。
- **并发注意：** 工作树仍有**另一任务**的改动（`.gitignore`、`lib/client.js`、`package.json`、
  `src/client/index.js`、`test/client.spec.ts`、未跟踪 `test/panel-links.spec.ts`）。本轮**未触碰**，
  提交时按文件名逐一 `git add`，只含本任务 5 个记忆/证据文件。
- **Next action（需要用户/lead 决策，同前两轮，二选一）：**
  ①**上游修复（推荐，能彻底解决）**：DSH `packages/workflow/workflow-ptc/src/` 约 3 行 label 转发；
  改完插件零改动即生效。
  ②**半程缓解（不满足本任务验收条款 1）**：插件在 `workflow/agent-start` 后调
  `ctx.sessionTitle.rename(childId, <任务名>)`，次级行提示词原文换成任务名；主标签 `任务团队 child N` 仍在。

## 2026-11-07 — 子代理顶栏显示名：第二次尝试复核 + 真机复现，**BLOCKED 维持**（fix_child_names，`release/0.6.0` 工作树）

- **From:** 执行子代理（fix_child_names，attempt 2）· **To:** lead / 用户 · **Base:** `524097f`（本地 `release/0.6.0` HEAD，未变）
- **本轮做了什么（attempt 2）：** ①把 attempt 1（Round 27 / D-039）的源码结论**逐条独立重验**——全部自己重新读源码，
  关键行号见 `VALIDATION.md` Round 28 表（引擎 `dsh-workflow-ptc/lib/index.js:332` 写死
  `` `${meta.name} child ${callId}` ``、guest 不转发 `label`、描述符 `foldSubagentDescriptor` 取第一条锁死、
  GUI `dsh-client-ui-subagent/lib/client.js:201` 直接渲染、`dsh-session-title` `SessionTitleService.rename`
  存在且只作用于次级行）。②把 attempt 1 的「隔离 profile 真机 `NOT_RUN`」升级为**真机复现 PASS**：
  `out/childname-verify/`（隔离 home + profile `cnamer`，headless，模型 v4-pro + agnes-3.0-flash，
  复用 `out/v060-verify/*.patch.yml`，密钥仅布尔存在检查）跑一轮团队档 COMPLETED（2 任务 verified，
  6 子代理），父会话 `tool-workflow/agent-start` 证明插件标签（`规划助手`/`执行`/`检查`）确实在传，
  而 6 个子会话首个 `subagent/descriptor` **全部**是 `"label":"任务团队 child N"`（N=1..6）——
  与用户截图逐字一致。证据：`docs/knowledge/evidence/childname-blocked/`（README + 3 摘录文件）。
- **结论：BLOCKED 维持。** 主标签由 DSH core 写死并被描述符契约锁成不可改写，插件侧无文档化扩展点；
  按任务约束（"If no extension point exists … report BLOCKED with the specific limitation instead of
  modifying DSH core"）不做绕行改动。验收条款逐条状态：条款 1/3/4/6 的"修复已实现"部分不可达
  （无修复可交付）；条款 2（DSH core 未改）满足；条款 5（CHANGELOG 条目）不适用（无用户可见变更，D-039 既定）。
- **本轮改动：** 仅记忆与证据文件——`VALIDATION.md`（Round 28）、`DECISIONS.md`（D-039 Addendum）、
  `STATE.md`（2026-11-07 段补充）、本节、`docs/knowledge/evidence/childname-blocked/`（4 文件）。
  **无源码改动、无 `CHANGELOG.md` 条目。**
- **未做 / `NOT_RUN`：** DSH core 未改（约束禁止）；live `:3090` 未碰（D-013，仍 `0.2.7`，本会话无凭据 401）；
  浏览器渲染 `NOT_RUN`（描述符标签已是渲染输入的唯一主标签来源）；`npm run ci` 未跑
  （零源码改动；工作树含并发任务进行中的 client 改动，跑 CI 只会测到别人的中间态；基线 Round 26
  35 文件 / 624 测试 PASS）；半程缓解（`sessionTitle.rename`）未实施（D-039：待用户批准）。
- **现场异常（已绕过，如实记录）：** `out/childname-verify/` 内两个中间摘录文件曾在相邻两次调用之间
  消失（疑似与并发任务的 out/ 操作相撞）；改用「同一命令内生成+校验」把摘录直接落盘到证据目录后
  跨调用复核仍在，证据完整性不受影响。
- **并发注意：** 工作树仍有**另一任务**的改动（`src/client/index.js`、`lib/client.js`、
  `test/client.spec.ts`、未跟踪 `test/panel-links.spec.ts`，另有 `.gitignore`/`package.json`/`.v070-home/`
  等进行中痕迹）。本轮**未触碰、未提交**，因此**未做 git commit**（避免把别人的工作树改动扫进提交）。
- **Next action（需要用户/lead 决策，二选一，同 attempt 1）：**
  ①**上游修复（推荐，能彻底解决）**：DSH `packages/workflow/workflow-ptc/src/` 改约 3 行——
  `runtime.ts` 把 `opts.label` 放进 `startAgent(...)`，`host.ts` 的 `childRequest()` 接收 `label`、
  `startChild()` 用 `` label: request.label ?? `${this.meta.name} child ${callId}` ``；改完插件零改动即生效。
  ②**半程缓解（不满足本任务验收条款 1）**：插件在 `workflow/agent-start`（事件带 `childId`）后调
  `ctx.sessionTitle.rename(session, <任务名>)`，把顶栏**次级行**的提示词原文换成任务名；主标签 `任务团队 child N` 仍在。

## 2026-11-07 — 子代理顶栏显示名：诊断完成，判定 **BLOCKED**（fix_child_names 任务，`release/0.6.0` 工作树，attempt 1）

- **From:** 执行子代理（fix_child_names）· **To:** lead / 用户 · **Base:** `524097f`（本地 `release/0.6.0` HEAD）
- **结论（`CONFIRMED`，源码逐行取证）：** 顶栏主标签 `任务团队 child N` 由 **DSH core** 在创建子代理时写死，
  插件侧无任何文档化扩展点可改。证据链（8 处行号）见 `VALIDATION.md` Round 27，决策见 `DECISIONS.md` D-039。
  一句话：插件已经在传 `label`（`src/script.ts:1188/1213/1324/1438`），丢标签发生在引擎内部
  （`workflow-ptc/src/runtime.ts:183-188` 不转发 → `host.ts:205` 写死 → 描述符被锁成不可改写
  → `dsh-client-ui-subagent/lib/client.js:201` 直接渲染）。
- **本轮改动：** 仅记忆文件——`docs/knowledge/VALIDATION.md`（Round 27）、`DECISIONS.md`（D-039）、
  `STATE.md`（2026-11-07 段）、本节。**无源码改动、无 `CHANGELOG.md` 条目**（没有用户可见变更可记）。
- **未做 / `NOT_RUN`：** DSH core 未改（约束禁止）；隔离 profile 真机 `NOT_RUN`（无修复可验）；
  live `:3090` 版本与浏览器渲染 `NOT_RUN`（`GET /` → `401`，本会话无凭据）；`npm run ci` 本轮未跑
  （零源码改动；基线仍是 Round 26 的 35 文件 / 624 测试 PASS）。
- **并发注意：** 开工时工作树已有**另一任务**的改动（`src/client/index.js`、`lib/client.js`、
  `test/client.spec.ts` 已改，`test/panel-links.spec.ts` 未跟踪）。本轮**未触碰、未提交**，
  因此**未做 git commit**（避免把别人的工作树改动扫进提交）。
- **Next action（需要用户/lead 决策，二选一）：**
  ①**上游修复（推荐，能彻底解决）**：DSH `packages/workflow/workflow-ptc/src/` 改约 3 行——
  `runtime.ts` 把 `opts.label` 放进 `startAgent(...)`，`host.ts` 的 `childRequest()` 接收 `label`、
  `startChild()` 用 `` label: request.label ?? `${this.meta.name} child ${callId}` ``；改完插件零改动即生效。
  ②**半程缓解（不满足本任务验收条款 1）**：插件在 `workflow/agent-start`（事件带 `childId`）后调
  `ctx.sessionTitle.rename(session, <任务名>)`，把顶栏**次级行**的提示词原文换成任务名；主标签 `任务团队 child N` 仍在。

## 2026-11-07 — v0.6.0 发布 + 隔离验证收尾（release-runner，`release/0.6.0` 分支）

- **From:** release-runner · **To:** lead · **Base:** `ca040e4`（`release/0.6.0` release-prep；`main` 已合入为 `1f9065d`，PR #43）
- **发布（CONFIRMED）：** PR #43 CI Node 22 + 24 pass（run `42362505851`）→ merge `1f9065d` →
  tag `v0.6.0` → 同 sha（`git ls-remote --tags origin` CONFIRMED）→ Release workflow run
  `42362674837` success → GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.6.0`
  published **2026-11-07T10:09:17Z**，asset `dsh-grok-workflow-0.6.0.tgz` **299,146 B**。
  minor 理由：C1 向后兼容（hint 只重排未试路由，孤立 run 逐字节一致），按 RELEASING.md 走 minor。
- **本地检查（CONFIRMED）：** `npm ci` / typecheck 0 errors / lint **4 warnings / 0 errors**
  （3 既有 + 1 新增 `src/run.ts:29` 未使用 `RoleName`，本版未修）/ build（client 84123 B）/
  `git diff --exit-code -- lib/` = 0 / vitest **35 files / 624 PASS** /
  `npm pack --dry-run` 64 files / 299.1 kB（npm 缓存只读，改用 workspace-local cache 重跑）。
- **隔离验证 Round 26（CONFIRMED）：** 新鲜 profile `v060r` + 隔离 `DSH_HOME=out/v060-verify/home`，
  模型 v4-pro + agnes flash（v4.1-flash 当天 cooldown，如实记录）；单轮团队档双任务双路由
  （各 cap 1）→ COMPLETED，2 verified，报告含本地 `Route overflows` 行 + 双 worker 路由；
  工作区仅 sum.txt/prod.txt（611），无外写。跨 run hint 行本轮未产出（单 run），由单测覆盖。
  证据：`docs/knowledge/evidence/v060-route-cap/`（README + report-full + session 52 事件）。
- **诚实边界：** 未动 DSH core；未重启/未碰 live `:3090`（仍 `0.2.7`，D-013）；未动已发布 tag；
  operator `DSH_HOME` 未写；`warn.emptyCap` 浏览器渲染 `NOT_RUN`（单测覆盖）。
- **本轮归档（release 分支，不进 main）：** `docs/knowledge/evidence/v060-route-cap/`（4 文件，
  已删冗余 excerpt 只留 report-full + session-events + README）+ STATE（`0.6.0` released）+
  VALIDATION.md Round 26 + 本节；随本轮 commit push 到 `origin release/0.6.0`。
- **Next action：** lead 确认后可关闭本轮；`:3090` 升级到 `v0.6.0` 待用户批准（D-013），不自行执行。

## 2026-11-07 — 路由 Cap B组+C1 收尾归档（route-cap-closer，`release/0.5.1` 工作分支）

- **From:** route-cap-closer · **To:** lead · **Base:** `df34ac0`（本地 `release/0.5.1` HEAD，本轮 commit 前）
- **变更文件（`git add -A` 入库，未 bump 版本、未打 tag、未发布 npm）：**
  实现（既有工作树改动，本轮只重建 `lib/` 确认同步）：`src/settings.ts`（`validateRoutes` 空 Cap notes）、
  `src/client/index.js`（`warn.emptyCap` 中英 + 黄字横幅，不拦 Save）、`docs/ARCHITECTURE.md`（单 run 作用域）、
  `src/script.ts`（`busyRoutes` 快照 + 重排未试顺序 + `'(cross-run hint)'` 标记）、`src/run.ts`（run 级路由标签快照）、
  `src/report.ts` + `src/records.ts`（`Route overflows (cross-run hint)` 分开渲染 + 透传）、
  `docs/knowledge/RESEARCH.md`（A16，C2-spike 已写入）、`CHANGELOG.md`（条目已由实现任务写入）、
  `test/route-concurrency.spec.ts` + `test/client.spec.ts`、`lib/` 编译产物（`build-client` 84123 B，二次重建 md5 幂等）；
  归档（本轮新增）：`docs/knowledge/DECISIONS.md` D-038、`docs/knowledge/VALIDATION.md` Round 25、
  `docs/knowledge/STATE.md`（Last updated 行 + Next priority 段）、本节。
- **ci 结果（CONFIRMED）：** `npm run build` PASS；`npx vitest run test/route-concurrency.spec.ts test/client.spec.ts`
  **47/47 PASS**（route-concurrency 13/13，client 34/34）；`npm run ci` **624/624 PASS**（35 文件，typecheck 0 errors，
  lint 3 warnings / 0 errors 既有基线）；DSH core 未改；live `:3090` 未重启（D-013）；真机 live `NOT_RUN`。
- **诚实边界：** B组+C1 已合入工作树、随本轮 commit 进 `origin release/0.5.1`；未发布、未打 tag；
  `task-3` 只读确认 completed（未 claim）。push 结果见本轮回复。
- **Next action：** lead 复核 D-038 / Round 25 后决定是否合入 `main`、走发布流程、升级 `:3090`（需用户批准）。

## 2026-11-07 — v0.5.0/v0.5.1 收尾 + Round 24 诊断交接（release-closer，`release/0.5.1` 工作分支）

- **From:** release-closer · **To:** lead / next agent · **Base:** local `release/0.5.1` HEAD `720eeb6`
  (merge second-parent); `origin/main` = `5cc66be` (Merge PR #42); tag `v0.5.1` → `5cc66be`
  (far-end sha matches `origin/main`, `git ls-remote --tags origin` CONFIRMED); GitHub Release
  `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.5.1` published
  **2026-11-07T02:08:32Z**, asset `dsh-grok-workflow-0.5.1.tgz` **294,363 B**.
- **现状（CONFIRMED）：** `package.json` + `package-lock.json` = `0.5.1`；`CHANGELOG.md` 有双语
  `## [0.5.1] - 2026-11-07`（PR #41 / `45d721a`）；`npm run ci` PASS（typecheck 0 errors /
  lint 3 warnings 0 errors / vitest **35 files / 617 tests**；`git diff --exit-code -- lib/` 无 diff）。
- **本轮归档（CONFIRMED）：** `docs/knowledge/VALIDATION.md` +39 行 Round 24 只读诊断；
  `docs/knowledge/evidence/diag-ctx-compaction-2026-11-07.md`（已 chmod 644）+
  `docs/knowledge/evidence/diag-ctx-compaction-verify-metric.mjs`（已 chmod 644）入库；
  `docs/knowledge/evidence/v051-fast-context/`（13 文件）入库；`.gitignore` 追加
  `.v050-home/` `.v051-home/` `.v051-verify/` `out/`（本地隔离目录不入库）。
- **Round 24 结论（CONFIRMED，只读诊断，未改代码）：** session-3361cd6e 团队档即时回执
  （seq 2339，step 之外的 `assistant/message`）使 `tokenMeter.measure()` 每次在同处抛错，
  turn 4 之后自动压缩永久停摆，GUI 百分比照常 92–95%；`/compact` 实测 NOT_RUN（会写会话），
  Web GUI API 取数 BLOCKED（401，不读凭据）。修复方案留给用户决策，未执行。
- **诚实边界：** 未动 `main`、未打 tag、未重启 `:3090`（D-013；`:3090` 仍跑 `0.2.7`，
  reload/upgrade 待用户批准）；未删本地目录。CHANGELOG/package.json 版本号本轮未改。
- **Next action：** lead 确认本 commit 内容后由 release-closer `git push origin release/0.5.1`；
  用户决策 Round 24 修复方案（receipt 写时点 / token-meter 容忍孤儿 / 新会话 `instantReceipt: false`）。

## 2026-11-06 — 先回捞后提问（`history_first_no_reask`，v0.5 未发布，工作树内）

- **From:** workflow execution agent · **To:** next agent / verifier · **Base commit:** `ac28a41`
- **做了什么（`CONFIRMED`）：** `src/triage.ts` 新增 `recallFromPrior()`（去停用词的双字/词锚点 ≥2，
  或指针式引用「刚才那份/上面说的/the above」+ 有实质材料 ≥120 字符）、`RECALL_LIMITS`、
  `TriageInput.prior`、`DETAIL.recalled`、`recallPrompt()`、`recalledNote()`、`missingNote()`；
  `classifyTriage()` 里 4 处 ask 判定统一改为 `ambiguousVerdict()`——`prior` 为命中则返回
  `fast/recalled`，否则返回与改动前完全相同的 `ask`/`ambiguous-escalate`。
  `src/gate.ts` 新增 `memoryDocRoots()`（默认 `<cwd>/docs/knowledge`，`GROK_WORKFLOW_KNOWLEDGE_DIRS`
  可改）、`readMemoryDocs()`（只读、有界、过 `redactSecrets`、永不抛）、`collectRecallSources()`
  （会话上文 + 前序轮次 digest + 记忆文件，**剔除本轮消息**），并在 `produceAnswer()` 的 ask 档前接线：
  命中→快手档据材料作答；未命中且查过→提问后追加「先查后问，还缺 X」；无任何来源→提问逐字节不变。
- **测试（`CONFIRMED`）：** `npm run ci` **35 文件 / 617 测试 PASS**、`Found 3 warnings and 0 errors`
  （3 个既有 warning）；本轮新增 `test/triage-recall.spec.ts` **28 例**（命中/未命中/指针式/确定性/
  上限/脱敏/默认根/逐字节回归/`session-7e079b80` 形态回放成对用例）。证据：
  `docs/knowledge/evidence/history-first/{ci-summary,recall-spec,regression-suite}.txt`。
- **决策：** D-037（提问前先读；只读、有界、无新配置键；`ask:false` 时命中仍走快手档）。
- **现场发现（`CONFIRMED`，已修）：** 首版把本轮消息也算作"历史"（`relay` 在 `produceAnswer()` 前
  就 `commitClaimed()`），导致任何追问都"命中自己"——现在 `collectRecallSources(…, exclude)` 按
  `textOf(message) === request` 剔除，`before the fix` 用例守着它。
- **诚实边界：** 真机在线模型回放 `NOT_RUN`（本轮未起隔离 profile）；语义同义改写不会命中，
  会退化为提问；只读 `docs/knowledge/*.md`，不读 `archive.jsonl`。
- **Next action：** ①等 verifier 复核判据 1/2/4；②若要真机收敛，按 VALIDATION Round 21/22 的隔离
  home + `wb/cn:deepseek-v4.1-flash` 跑一次「先研究、后追问」两轮，确认追问不再要求重述；
  ③`:3090` 未热加载（D-013），不要自行重启。

## 2026-11-06 — PR #37 merged + v0.4.0 released (GitHub Release only, no npm)

- **From:** release operator (local) · **To:** next agent / operator
- **Base commit:** `e89daf9` (PR #37 feature on `feat/triage-history-hybrid`); **merge commit** `9438b3d` (PR #37 merge);
  **release commit** `708c315` (PR #38 merge); **tag** `v0.4.0` → `708c315`.
  `package.json` and `package-lock.json` both read `0.4.0`;
  `CHANGELOG.md` carries the bilingual `## [0.4.0] - 2026-11-06` section with a fresh empty
  `## [Unreleased]` above it; `docs/releases/RELEASE-NOTES-0.4.0.md` exists.
- **Feature (CONFIRMED):** history-aware follow-up (`FOLLOW_UP` + `historyNonEmpty`, `fast/followup`,
  never `chat`; `triageFollowupAsFast` opt-out) + hybrid classifier opt-in (`triageClassifier`
  `rules|hybrid`, default `rules`, one `runSingleCall` only for `ask`/ambiguous or `chat`+history,
  fallback to rules) + team-tier instant receipt (`appendInstantReceipt`) + deterministic
  `【人话结论】 verified/total` lead-in (`humanSummary`, zero extra calls).
  `npm run ci` 32 files / 545 tests PASS (incl. new `test/triage-followup.spec.ts` 5 cases);
  `npm run typecheck` clean; `npm run lint` 3 warnings / 0 errors (pre-existing);
  `npm run build` clean; `git diff --exit-code -- lib/` exit 0; `npm pack --dry-run` 56 files / 250.7 kB.
- **Merge of the feature (CONFIRMED):** `gh pr merge 37 --merge` after `gh pr checks 37` showed
  Node 22 `pass` / Node 24 `pass` (run `42074144133`); merge commit `9438b3d`;
  `origin/main:src/gate.ts` contains `triageClassifier === 'hybrid'` branch and `humanSummary` block.
- **Release (CONFIRMED):** branch `release/0.4.0` → PR #38 green on Node 22/24 (run `42075028625`)
  → merge `708c315`. `git tag v0.4.0 708c315` + `git push origin v0.4.0`. Release workflow run
  [42075318386](https://github.com/free6589/dsh-grok-workflow/actions/runs/42075318386) green end
  to end. GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.4.0` with
  `dsh-grok-workflow-0.4.0.tgz` (250,693 B, sha256 `e10802ca…`).
- **Tags:** `git ls-remote --tags origin` taken before and after; `diff` over the pre-existing
  tags = no changes. `v0.1.0`–`v0.3.0` untouched; only `refs/tags/v0.4.0` is new.
- **Decisions:** D-032 (history-aware follow-up) + D-033 (hybrid opt-in) + D-034 (receipt +
  deterministic summary, model-rewrite variant rejected after breaking 4 engine-count assertions).
- **Honest boundary:** `humanSummary` model-rewrite variant was built then reverted (extra engine
  call broke P0-2 ×3 + triage count ×1); shipped version is deterministic. Live multi-turn
  follow-up (`说人话` with history in one session) is covered by deterministic unit tests, not by
  one-shot headless (each headless turn is a fresh session). Isolated-profile live verification
  (Round 20): greeting `chat` + fast `30` PASS on `wb/cn:deepseek-v4.1-flash`; team tier ran and
  reported honestly (FAILED on an unresolvable `run.ts` path in an empty `/tmp` workspace — the
  gate/report path itself PASS, not a model-quality claim).
- **Next action (needs the operator, not an agent):** the live DSH service on `:3090` still runs
  `dsh-grok-workflow@0.2.7`; upgrading the `web` profile to `v0.4.0` (and any profile reload)
  still awaits explicit user approval (D-013). Do not restart the service on your own.

## 2026-11-03 — PR #35 merged + v0.3.0 released (GitHub Release only, no npm)

- **From:** release operator (local) · **To:** next agent / operator
- **Base commit:** `af0394a` (PR #35 merge on `main`); **release commit** `3f5ad0a` (PR #36 merge);
  **tag** `v0.3.0` → `3f5ad0a`. `package.json` and `package-lock.json` both read `0.3.0`;
  `CHANGELOG.md` carries the bilingual `## [0.3.0] - 2026-11-03` section with a fresh empty
  `## [Unreleased]` above it; `docs/releases/RELEASE-NOTES-0.3.0.md` exists.
- **Merge of the feature (CONFIRMED):** `gh pr merge 35 --merge` after `gh pr checks 35` showed
  Node 22 `pass` / Node 24 `pass` (run
  `https://github.com/free6589/dsh-grok-workflow/actions/runs/41659656218`); merge commit
  `af0394a`; `origin/main:src/config.ts` contains `repairSynthesisInconsistency`.
- **Release (CONFIRMED):** branch `release/0.3.0` → PR #36 (`https://github.com/free6589/dsh-grok-workflow/pull/36`)
  green on Node 22/24 (run `41664791714`) → merge `3f5ad0a`. `git tag v0.3.0 3f5ad0a` +
  `git push origin v0.3.0`. Release workflow run
  [41665410667](https://github.com/free6589/dsh-grok-workflow/actions/runs/41665410667) green end
  to end (tag↔`package.json` validation, typecheck, lint, build, `lib/` consistency, tests, package
  checks, bilingual changelog extraction, release creation). GitHub Release
  `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.3.0` with
  `dsh-grok-workflow-0.3.0.tgz` (246,493 B, sha256 `3a8bf81b…`).
- **Local checks on the release commit** (`f8cb09e`, identical tree to the merge `3f5ad0a`):
  `npm ci` PASS; `npm run typecheck` PASS; `npm run lint` 3 warnings / 0 errors (pre-existing
  baseline); `npm run build` PASS; `git diff --exit-code -- lib/` exit 0; `npm test` 31 files /
  540 tests PASS; `npm pack --dry-run` 56 files / 246.5 kB / `dsh-grok-workflow-0.3.0.tgz`.
- **Tags:** `git ls-remote --tags origin` taken before and after; `diff` over the pre-existing
  tags = no changes. `v0.1.0`–`v0.2.7` untouched; only `refs/tags/v0.3.0` is new.
- **Honest boundary:** real-machine coverage of the shipped change is **partial** (isolated
  instance alive with a bad config; boot warn line not captured; `/api/settings/describe` + page
  `401`, same as VALIDATION Round 16 item 8; settings-page render/save-back `NOT_RUN`).
- **Next action (needs the operator, not an agent):** the live DSH service on `:3090` still runs
  `dsh-grok-workflow@0.2.7`; the `web/cordis.patch.yml` `synthesis: model` line and the `0.3.0`
  upgrade both take effect only after a profile reload/`plugin add …#v0.3.0`, and **that reload
  still awaits explicit user approval (D-013)**. Do not restart the service on your own.

## 2026-11-03 — P0 web fix + PR #35 synthesis fallback (lead-reviewed, not merged)

- **From:** lead · **To:** next agent / operator
- **Base commit:** `1024b1c` (`origin/main`); work commit `7c4a05e` on `feat/synthesis-fallback`
  (local `main` reset back to `1024b1c` after review; work lives on the feature branch + PR).
- **P0 (CONFIRMED, operator machine):** `web/cordis.patch.yml` `grok-workflow.config` +1 line
  `synthesis: model` (line 1029, 4-space indent, same level as `grokDefault: on`).
  Backup: `~/dsh-profile-backups/cordis.patch.yml.20261103-222020-pre-synthesis-model`.
  `diff -u` = +1 line only; `grep -n -A16 "id: grok-workflow"` shows the line; `plugin list`
  still `dsh-grok-workflow@0.2.7`. No service restarted (D-013 rule 1); live `:3090`
  reload still needs operator approval.
- **P1–P3 (lead-verified, PR #35):** `https://github.com/free6589/dsh-grok-workflow/pull/35`
  closes #34. `repairSynthesisInconsistency(raw)` in `src/config.ts` (pure, only shapes
  (a)/(b)); `apply()` in `src/index.ts` load-time catch → `logger.warn`（含"已按…生效，
  请在设置页确认"）→ `resolveConfig(repaired)` must pass → activate with
  `synthesisRepaired: true` (`describeResolvedConfig` renders `synthesis=<mode> (repaired)`).
  Settings page (`src/client/index.js` `validate()`) red-blocks Save on the same two
  mismatches (`error.synthesisChainUnused`/`Missing`, bilingual). R-06 unchanged.
- **Tests run (lead, on `7c4a05e` before reset):** `npm run typecheck` PASS; `npm run lint`
  3 warnings 0 errors (pre-existing — base `1024b1c` also 3, `GROUPS_WITH_FIELDS`/`field`/
  `redact.ts:155` escape); `npx vitest run test/config-synthesis-fallback.spec.ts
  test/client.spec.ts test/config.spec.ts test/routing.spec.ts` 4 files / 93 PASS;
  `npm run ci` **31 files / 540 tests PASS**; `git diff --exit-code -- lib/` = 0.
  Secret grep over changed src/test = only benign `task-failed`/`id:` matches.
- **Local runtime (partial, honest boundary):** `DSH_HOME=/tmp/p1-verify-home`, profile `p1web`,
  `127.0.0.1:3297`, bad-config instances stayed alive, but boot stdout had only URL lines
  (warn/signature not captured); `/api/settings/describe` + page fetch = 401 (same known
  dead-end as Round 16 item 8). Settings-page render + save-back `NOT_RUN`.
- **Next action:** review/merge PR #35 (lead-verified, 1 commit ahead of `origin/main`);
  then plan release per `docs/RELEASING.md`; live `:3090` reload only with approval.

## 2026-11-03 — web profile upgraded 0.2.6 → 0.2.7 (operator machine)

- **From:** lead · **To:** next agent / operator
- **Base commit:** `16a11b7` (`origin/main`, `v0.2.7` tag; `package.json` `0.2.7`)
- **Action (CONFIRMED):** `dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.2.7`
  (pnpm Done in 8.8s); `dsh plugin --profile web list | grep grok` →
  `dsh-grok-workflow@0.2.7`; `why` → single copy under `dsh-profile-web (dependencies)`.
- **Note:** D-013 respected — running `:3090` service was not restarted/reconfigured by this
  task; new bundle code applies on next profile (re)load per DSH plugin semantics.
- **Next action:** none required for the upgrade itself; restart/reload of `:3090` only with
  operator approval if live verification is wanted.

## 2026-11-03 — v0.2.7 released (per-route concurrency + P0-5 first-message fix)

- **From:** lead · **To:** next agent / operator
- **Base commit:** `16a11b7` (`origin/main`, PR #33 merge = the v0.2.7 release commit; tag `v0.2.7`
  已打，Release 已建：`https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.2.7`，
  资产 `dsh-grok-workflow-0.2.7.tgz`)
- **What landed since v0.2.6:** P0-5 首条消息先发布再跑 (`d8cc6cc`)；按路由并发上限
  `maxInFlight` + 打满让路 (`1b5ad75`, PR #32, D-030)；发版准备 (`0e8a7e7`, PR #33)。
- **Install:** `dsh plugin --profile <p> add github:free6589/dsh-grok-workflow#v0.2.7`，装完重启该 profile。

## 2026-11-01 — v0.2.4 install matrix recorded: 8 PASS + 2 NOT_RUN (memory only)

- **From:** matrix-memory · **To:** lead
- **Base commit:** `7357e5e` (`origin/main`, PR #28 merge = the v0.2.4 release commit; tag `v0.2.4`
  已打，Release 已建：`https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.2.4`，
  资产 `dsh-grok-workflow-0.2.4.tgz`)
- **Work commit:** the docs-only commit carrying this section on `docs/matrix-024-memory`. No
  `src/`, `lib/` or `test/` file changed (`git diff --stat 7357e5e HEAD -- src lib test` is empty);
  this branch exists only to record the result.
- **Matrix result (read-only evidence, not committed):**
  `.workflow-artifacts/matrix-024/EVIDENCE.md` + `logs/` (item1~item8). Items 1–7 **PASS**,
  item 8 部分通过（composition + boot 确认；`settings`/`describe` 经 query-token + Bearer 均
  `401 unauthorized`，namespace 未确认），items 9–10 **NOT_RUN**（本环境无浏览器自动化；
  Round 15 已在真 GUI 上覆盖设置页与 web 聊天）。
- **Anomaly on record:** item 7 run3 首轮 EXIT 0 直接答 `apple, banana, cherry` 无报告
  (`logs/item7-run3.jsonl`，563 bytes)；同 prompt 重跑 `COMPLETED` verified
  (`logs/item7-run3-rerun.jsonl`，3667 bytes)；异常之后连续 3 个 EXIT 0 + 报告。样本保留，
  未掩盖。原文引用见 `VALIDATION.md` Round 16 §2。
- **Details:** `VALIDATION.md` Round 16（逐项 1–10 + 异常原文引用 + `EVIDENCE.md` 路径）；
  `STATE.md` 已对齐（Current phase = v0.2.4 已发布，Next priority = 下一版规划，
  NR-1/7/8 与 Round 15/16 对齐）。
- **Tests run this round:** no source test suite was executed (docs-only change). Read-only checks:
  `git status`, `git diff --stat`, secret grep over the three files (0 hits). `npm run ci` on
  `main` `7357e5e` is still `NOT_RUN` — the last full run (27 files / 487 tests) was on the
  PR #26 branch, see Round 13.
- **Next action:** merge `docs/matrix-024-memory` into `main`, then plan the next version scope
  (`relay`/`append` 投递、item 8 的 API 认证、质量矩阵、U-6 chain editor 候选）.

## 2026-11-01 — real Web GUI verified: `/grok` switch + settings card (memory only)

- **From:** local (gui-verify-memory) · **To:** lead / captain / next local agent
- **Base commit:** `6806426` (`origin/main`, PR #27 merge — the tree this verification ran against)
- **Work commit:** the docs-only commit carrying this section on `docs/gui-verify-memory`. No
  `src/`, `lib/` or `test/` file changed (`git diff --stat 6806426 HEAD -- src lib test` is empty);
  this branch exists only to record the result.
- **What is now `CONFIRMED`** (previously `NOT_RUN` since Round 14 §5): on an isolated instance
  (`DSH_HOME=.workflow-artifacts/gui-verify/dsh-home`, profile `gw-gui` from the stock `web`
  template, `127.0.0.1:3199`, real Chromium, live `:3090` untouched):
  1. **`/grok` is switchable in the real GUI** — default `off` gives a plain answer with no report;
     `/grok` gives the command row, the `3 subagents` badge and a full `GROK-WORKFLOW-REPORT`
     (`COMPLETED`, 1 verified, model routes, 3600000 ms deadline) in 1m41s; `/grok off` in the same
     session returns to plain chat in 11s. Command events, `plugin:grok-workflow/mode` events and
     the report text were each re-read from `session.v4.jsonl.zstd` this round.
  2. **The settings card renders and saves** — Plugins → `Grok workflow` card → generated page with
     `Grok mode default` / `grokDefault` `off | on`; edit → `Save (1)` → save takes `revision 0` to
     `revision 1`; a full page reload keeps `revision 1` / `on`; the write lands in the profile's
     `cordis.patch.yml` (md5 `d7830129…` → `1f628a0c…`) as `grokDefault: on`; and a **new** session
     with no `/grok` runs the workflow (fast lane, 1 subagent, 30s), so the value is functional.
- **Boundaries to repeat whenever this result is quoted:** the browser was **offscreen (headless)
  Chromium** (no X11 display on this host) and the model was **`wb/cn:glm-5.3-flash`** because the
  suggested `wb/cn:deepseek-v4.1-flash` returned `400 model_unavailable` (per-model cooldown) on
  2026-11-01. Delivery verified is the default **`in-turn`**; `relay`/`append` in a long-lived GUI
  session remain `NOT_RUN`. No quality/per-model claim follows. Five environment deviations are
  listed in `VALIDATION.md` Round 15 §4.
- **Evidence:** `.workflow-artifacts/gui-verify/README.md`, `shots/` (20 PNGs), `logs/`
  (`stepB2.log`, `stepC.log`, `stepD.log`, `stepE.log`, `dumpconfig-step*.txt`,
  `patch-before-settings.md5`), `scripts/` (the Playwright scripts). **These artifacts are not
  committed** — `.workflow-artifacts/` is untracked; only the paths and the quoted text are in the
  memory files.
- **Tests run this round:** no source test suite was executed (docs-only change); the verification
  evidence is the GUI run above. `npm run ci` on `main` `6806426` is still `NOT_RUN` — the last full
  run (27 files / 487 tests) was on the PR #26 branch, see Round 13.
- **Repository state:** `main` = `6806426` with PR **#23** (`2e9c26a`, Phase 1 dialogue reliability),
  **#24** (`334daf6`, task-grouped progress panel), **#25** (`54083ea`, 32,000-char objective
  limit), **#26** (`a000983`, segmented fallback) and **#27** (`6806426`, `/grok` switch) merged.
  `v0.2.3` is released (tag `538d1ab`); `package.json` still reads `0.2.3`.
- **Next action:** merge this docs branch, then prepare the **`0.2.4`** release from `main`
  (`npm run ci` + `git diff --exit-code -- lib/` on `main`, move `[Unreleased]` under
  `## [0.2.4]`, bump `package.json`/`package-lock.json` together). Do not tag, publish or restart
  the running service without the captain.

## 2026-11-01 — PR #26 review close-out (three fallback findings)

- **From:** local (pr26-closer) · **To:** lead / next local agent
- **Base commit:** `2e9c26a` (`origin/main` after PR #23; the branch was rebased onto it, originally
  cut from `334daf6`)
- **Work commit:** `68f3d15` on `fix/fallback-shards` (rebased: `6e902e0` → `bba5dc9`, `5cbccf2` → `68f3d15`)
- **Changed:** `src/shards.ts` (new: one splitter, rendered into the script and reused by host
  validation), `src/script.ts`, `src/report.ts`, `test/fallback-shards.spec.ts` (16 cases),
  `test/helpers.ts` (`taskFromPrompt`), `test/objective-limit.spec.ts`, `test/report.spec.ts`,
  `docs/ARCHITECTURE.md`, `CHANGELOG.md`, `lib/**`.
- **Tests:** `npm run ci` = exit 0, **27 files / 487 tests** (post-rebase, includes the PR #23 specs);
  `npm run build && git diff --exit-code -- lib/` = exit 0.
- **Not found:** the "1 medium test gap + 1 low boundary issue" an earlier review round was said to
  have recorded is **not** in `.workflow-artifacts/` (that directory holds the objective-limit round
  only: `baseline/`, `limit-core*`, `test-report.md`, `github-recon.md`, `pr-fallback-shards.md`), nor
  in `docs/knowledge/`, `.agent-teams/`, or `.session-stage/`. Closest but unconfirmed:
  `test-report.md` §9 items 1–3 (fallback sharding not yet implemented; the generated script has no
  `objectiveChars` enforcement point; upstream boundary tests incomplete).
- **Open, not fixed here:** the generated script still does not enforce `TASK_LIMITS.objectiveChars`
  itself (`src/script.ts` declares it, nothing reads it); the host enforces it at gate/tool/input, so
  bypassing the host a 32,001-character objective still yields a `partial` fallback.
- **Next action:** review `68f3d15` on `origin/fix/fallback-shards`, then decide on merging PR #26
  (merge is the lead's call). PR #26 is rebased on `2e9c26a` and no longer conflicts.

## 2026-10-27 — v0.2.0 released and installed on the operator machine

- **Released:** `v0.2.0` tag + GitHub Release (tgz 42 files / 108,428 B, sha256 recorded by GitHub). CI and Release workflows green. `v0.1.0` untouched.
- **Installed:** real profiles `headless` and `web` (layerfs root), locked to `#v0.2.0`. Web GUI service restarted with the plugin composed.
- **Test matrix:** 8/10 PASS on real installs with real models (VALIDATION.md "0.2.0 real-profile install matrix"); 2 NOT_RUN are GUI-interactive checks for the operator (settings page rendering in browser, web chat behavior).
- **Rollback:** `dsh plugin --profile <p> remove dsh-grok-workflow`; backups under `~/dsh-profile-backups/`.
- **Operator checklist (morning):** send a chat message in the GUI and confirm a workflow report (not a direct answer); open Settings and confirm the auto-generated `grok-workflow` page renders; judge in-turn latency comfort (adjust timeoutMs/maxTasks or request progress hints per U-9).
- **Next action:** fix loop per D-011 on any failure (patch bump, new tag, reinstall, retest); backlog: chain-editor UI (Phase 9), streaming progress, relay/append GUI evidence (NR-1 half).
- **Then (0.2.1):** the Web GUI settings page (plugin-owned browser bundle) and the documented
  activation prerequisite are prepared on `main`; `v0.2.1` is created by the captain after the
  acceptance pass. `v0.2.0` stays where it is.


## 2026-10-26 — Security observation (captain integration note)

- During t15's writesPaths experiment a workflow subagent inherited session tools including git and committed `docs/plan-a.md` as `e38ac8e` (`dsh-agent@localhost`) without authorization. Artifacts removed in the v0.2.0 release batch; history kept intact deliberately (audit trail).
- Risk: subagents of the workflow inherit the parent session's toolset — including VCS write access. Operators running the workflow in profiles with git-capable tools should treat this as a documented limitation (see WORKFLOW-DESIGN limits). Mitigation options for future versions: tool pre-execute deny list for subagents, or documented operator guidance.
- The plugin's own recursion guard blocks workflow re-entry in subagents, but it cannot (and does not) restrict which unrelated tools a workflow subagent may call.


## 2026-10-26 — Round 2 (phases 1–7): mandatory entry, routing, settings, reliability, release prep

- **From:** local team (AgentTeams dshgw-workflow-planning), implementer + independent reviewers
- **To:** captain / next local agent / independent reviewer
- **Base commit:** `bd1f261` (U-4 write-path isolation; phase 6 landed in `32a7f4a`)
- **Package version:** `0.2.0` — **released** as `v0.2.0` on 2026-10-26 (tag on `f7a244c`,
  GitHub Release 2026-10-26T17:10:16Z, 42 files / 108,428 B). This section was written before that
  tag existed; the version in the tree today is `0.2.1` (its tag is still pending).
- **Release-readiness artefacts:**
  - `docs/releases/RELEASE-NOTES-0.2.0.md` — the announcement as published, artifact table
    (`0.1.0`: 33 files / 61,281 B → `0.2.0`: 42 files / 108,428 B as released) and operator steps
    pointing at [RELEASING](../RELEASING.md). (`0.2.1` has its own notes file next to it.)
  - `scripts/smoke-settings-identity.mjs` — feeds the **built** plugin the descriptor produced by
    the DSH installation's own `dsh-settings` projection and prints the diagnostics line; the
    end-to-end check for the t31/F1 identity fix.
  - `test/settings-fixture.ts` + `test/settings-projection.spec.ts` — the settings descriptor is
    no longer hand-shaped: the runtime's projection rules are applied, the measured facts are
    pinned, and the transcription is cross-checked against the real module when discoverable.
- **What is now true:**
  - The gate claims every user message through `agent/pre-step` and answers it
    from a validated report in the same turn (`in-turn`, the default;
    `enforceGate: true` is the default, `gateRequired` turns a missing hook into a
    load error).
  - Per-role ordered fallback chains (`roles.{planner,worker,verifier,synthesizer}`,
    ≤3 routes), a `switchOn` whitelist, and routing recorded in the report.
  - Failure `class` + `category` (`infrastructure`/`quality`/`configuration`/
    `cancelled`/`unknown`) end to end, including a rendered `Failures:` line.
  - A live settings surface derived from the exported `Config`: unknown keys
    rejected with a suggestion, chains validated against the runtime's providers,
    edits apply to the next message with a last-good fallback.
  - Write-path isolation (U-4): `writesPaths` per task, conflict-aware pool,
    normalized lexical overlap, echoed in the report.
  - Documentation set synchronized: README (EN + zh), CHANGELOG (bilingual
    `0.2.0`), DESIGN (DD-1..DD-9b + NR ledger), ROADMAP (phases marked), STATE,
    DECISIONS (D-009..D-012), ARCHITECTURE, VALIDATION.
- **Tests run:** `npm run ci` — PASS: typecheck, lint 0/0, build, **264 tests / 18
  files**. `lib/` reproducible (identical md5 before/after rebuild). Clean-copy
  `npm ci` + `npm run ci` PASS. `npm pack` contents verified. Isolated-profile
  install of the packed tarball PASS.
- **Local runtime verified:** real headless one-shot run with a live model passes
  the delivery assertion (`scripts/e2e-headless-in-turn.sh`: PASS, `Grok workflow:
  COMPLETED`), and the explicit-refusal path was measured twice in t14.
- **Honest gaps (do not read these as done):** NR-1 (GUI/long-lived delivery
  half), NR-5 (real provider failure texts), NR-6 (real-provider route switching
  end to end), NR-7 (stock form rendering of `roles`), NR-8 (in-place settings
  `update()` against a live holder), NR-9 (planner fill-rate for `writesPaths`).
- **Blockers:** none technical. The remaining release steps need the captain:
  create `v0.2.0`, publish the GitHub Release, and never move `v0.1.0`.
- **Next action:** t16 final acceptance on the packed artifact, then tag + Release
  per `docs/RELEASING.md`.

## 2026-10-25 — Workflow planning round 1 (audits → synthesis → review → revision)

- **From:** local team lead (AgentTeams dshgw-workflow-planning)
- **To:** cloud reviewer / next local agent
- **Base commit:** b231660 → **work commit:** 2403a10 (see git log for the round's commits: 023887d criterion fix, d82c245 synthesis, 0672de6 revision, 2403a10 QA-2 batch)
- **Changes:** Four independent read-only audits (architecture / DSH 0.2.1-rc.2 API / model routing / security+testing) with source-line evidence; two live experiments (t18 B-1 delivery routes, t19 H-1..H-5 API capability probes); synthesis + independent review (21 findings) + revision of WORKFLOW-ROADMAP.md and WORKFLOW-DESIGN.md; QA batch: criterion normalization fix (t20, 023887d) and report validation/redaction/engine-contract batch (t21, 2403a10).
- **Tests run:** `npm run ci` PASS — 106 tests / 9 files (was 56); clean-copy `npm ci` + `npm run ci` PASS; t20 independently re-verified with isolated-snapshot mutation testing (t22, PASS on t20 portion).
- **Local runtime verified:** t18/t19 experiments ran against real installed DSH 0.2.1-rc.2 in isolated DSH_HOME profiles (enter/reject/relay/source.kind/plugin-record behaviors). NOT_RUN: web long-lived keep-alive, relay multi-sample, (a') write ordering, settings nested write to disk (NR-1..NR-4 in WORKFLOW-DESIGN).
- **Key verdict:** mandatory entry is **partially feasible** as an external plugin (4 guarantees runtime-verified, 4 only conditional). See WORKFLOW-ROADMAP §5.3 and DESIGN A-14 for the exact split and the minimal upstream changes if unconditional guarantees are required.
- **Blockers:** none technical. U-1..U-7 product tradeoffs await user decision (answer route, retry ownership, synthesizer, shared-dir policy, strict-mode cost, YAML-first, enforcement scope).
- **Next action:** user decides U-1..U-7; then implement in the agreed phase order (gate+delivery unit first if the user keeps entry-first priority). QA-2 independent re-review (t22b) runs in parallel.


## 2026-10-25 — First release v0.1.0

- **From:** local release operator
- **To:** cloud reviewer / next local agent
- **Base commit:** `7904e23` (PR #18 merge)
- **Work commit:** `a7d5a62` (`fix: correct changelog section regex in release workflow`)
- **Tag:** `v0.1.0` (tag object `f175ada8a7533a5f61c06a75e5a457e32b37579b`) → `a7d5a6267c471a6ed73e44ac02092f59942c508a`
- **Changes:**
  - Created and pushed the annotated `v0.1.0` tag after PR #18 merged and main CI passed.
  - First release run `40182588171` failed because the changelog-boundary regex had an extra backslash from YAML/heredoc escaping; fixed `a7d5a62`, then recreated the tag before any release existed.
  - Final release run `40182751006` created the GitHub Release and attached `dsh-grok-workflow-0.1.0.tgz`.
- **Tests run:** release workflow `40182751006` — PASS on Node 22 only, including typecheck, lint, build, `lib/` consistency, tests, package checks, and attachment. Main CI `40182707932` covered Node 22/24.
- **Test results:** PASS.
- **Local runtime verified:** yes for tag-pinned installation/config composition in an isolated `DSH_HOME`; a real `grok_workflow` model call was **NOT_RUN**. Release publication is confirmed by GitHub.
- **Blockers:** none.
- **Next action:** optionally smoke-test `dsh plugin ... add github:free6589/dsh-grok-workflow#v0.1.0` in an isolated profile; do not move the published tag.

## 2026-10-25 — Issue #17 fallback partial validation

- **From:** local agent (watcher wake for issue #17)
- **To:** cloud reviewer / next local agent
- **Base commit:** `a2b2f9f`
- **Work commit:** `9c2cc29` (`fix: accept verified fallback reports as partial`)
- **Changes:**
  - Host validation now permits a fallback plan whose single task is verified
    to remain `partial`, provided the planning error is present.
  - Non-fallback `partial` still requires both verified and failed tasks;
    fallback plans can never be `completed`; `partial` still requires at least
    one verified task.
  - Added a host-validation regression test using the real generated fallback
    report, plus the existing orchestrator coverage.
- **Tests run:**
  - `npx vitest run test/orchestrator.spec.ts` — PASS, 17 tests.
  - `npm run ci` — PASS, 6 files / 56 tests.
  - `git diff --exit-code -- lib/` — PASS after build.
- **Test results:** PASS.
- **Local runtime verified:** no; this is deterministic report validation
  logic, not a DSH lifecycle change.
- **Blockers:** none.
- **Next action:** cloud review `9c2cc29`; issue #17 remains open until review.

## 2026-10-25 — Issue #15 watcher credential-env allowlist

- **From:** local agent
- **To:** cloud reviewer / next local agent
- **Base commit:** `0476fa7` (`docs: record issue 14 redaction fix`)
- **Work commit:** `61d63b4` (`fix: restrict watcher credential env keys`)
- **Changes:**
  - Replaced the watcher's permissive env-file denylist with an explicit
    allowlist for provider credentials/configuration (`BIFROST_*`, `*_API_KEY`,
    `*_TOKEN`, `*_BASE_URL`, `*_API_VERSION`, and selected cloud settings).
  - Runtime/code-loading names such as `NODE_OPTIONS`, `NODE_PATH`,
    `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_*`, `PYTHONPATH`, `PYTHONHOME`,
    `PERL5OPT`, `RUBYOPT`, `BASH_ENV`, and `ENV` are denied even if a future
    pattern becomes broader.
  - Updated `--help` and `docs/ISSUE-WATCHER.md` to state that the file is
    parsed as `KEY=VALUE`, never sourced.
- **Tests run:**
  - `bash -n scripts/watch-issues.sh` — PASS.
  - `npx vitest run test/issue-watch.spec.ts` — PASS, 2 tests.
  - `npm run ci` — PASS, 6 files / 55 tests.
- **Test results:** PASS.
- **Local runtime verified:** yes after restart at `08:54:06Z` (PID `568469`);
  the previous live wake (`WATCH_WAKE_OK`, status 0) was on the prior script.
- **Blockers:** none.
- **Next action:** cloud review `e26e297`; PR #16 needs separate README review.

## 2026-10-25 — Issue #14 credential redaction fix

- **From:** local agent
- **To:** cloud reviewer / next local agent
- **Base commit:** `99454d1a830ca42ed051d232de4104161357b581`
- **Work commit:** `24b6619` (`fix: redact non-HTTP URL userinfo and scoped tokens`); docs follow-up commit after it
- **Changes:**
  - Extended `src/redact.ts` URL userinfo matching from `http(s)` to any
    `scheme://` URI (covers `postgres`, `postgresql`, `mongodb+srv`, `redis`,
    etc., including empty-username `redis://:password@host`).
  - Added `glpat-` (GitLab) and `npm_` token patterns.
  - Mirrored the same patterns in the `redactPromptText` copy inside
    `src/script.ts`.
  - Added `redactSecrets`, `redactDeep`, and verifier/retry prompt regression
    tests with fake values.
- **Tests run:**
  - `npm run typecheck` — PASS.
  - `npm run lint` — PASS, 0 warnings/0 errors.
  - `npx vitest run test/redact.spec.ts test/orchestrator.spec.ts` — PASS,
    26 tests.
  - `npm run ci` — PASS, 6 files / 55 tests.
- **Test results:** PASS.
- **Local runtime verified:** no for this change; it is redaction logic covered
  by deterministic unit and prompt-rendering tests, not a DSH lifecycle change.
- **Blockers:** none.
- **Next action:** cloud review of `24b6619`; do not use real credentials in
  future regression vectors.

## 2026-10-25 — Implementation and local runtime verification

- **From:** local lead agent
- **To:** next local/cloud agent
- **Base commit:** none (empty repo; first push `beb55c6`)
- **Work commit:** remote `main` at final handoff (use `git rev-parse origin/main`)
- **Changes:**
  - Added the full external DSH bundle (`src/`, `lib/`, `cordis.patch.yml`,
    package manifest, README, docs).
  - Added deterministic and real-Loader tests.
  - Updated `STATE.md`, `VALIDATION.md`, `ACCEPTANCE.md`, `RESEARCH.md`.
- **Tests run:**
  - `npm run ci` — typecheck, lint, 51 tests pass.
  - `npm run test:loader` — 2 real Loader tests pass.
  - `npm pack --dry-run` — package contents verified.
  - Real DSH install from local checkout and from GitHub; `--dump-config`
    shows the bundle row in both profiles.
  - Real headless model smoke and real `grok_workflow` runs (see
    `VALIDATION.md`).
- **Test results:** PASS; GitHub Actions run `40176627051` passed Node 22/24, including watcher security tests, build-artifact consistency, and pack checks (51 tests).
- **Local runtime verified:** yes for plugin load, model route, completed
  caller-plan workflow, completed parallel timing workflow, completed
  planner-only workflow, fresh GitHub-installed workflow, a partial
  strict-failure workflow, and a live deadline cancellation.
- **Blockers:** none.
- **Next action:** independent re-review of the current head; optionally add a
  clean-profile install check to CI. Do not modify the active
  `/home/fish/dsh-layerfs` home; the verified install is isolated under the
  workspace `.dsh-home`.


## 2026-10-25 — Cloud homepage redesign

- **From:** cloud
- **To:** local
- **Task:** Beginner-friendly bilingual repository homepage.
- **Base commit:** `99454d1a830ca42ed051d232de4104161357b581`.
- **Branch:** `docs/beginner-friendly-bilingual-homepage`.
- **Changes:** Replaced root `README.md` with a shorter English quick-start homepage; added `README.zh-CN.md`; added separate English and Chinese SVG workflow illustrations; updated `package.json` files allowlist to include the Chinese README; installation command and DSH/Node requirements are derived from current project files.
- **Tests:** GitHub Actions run `40178081351` PASS on Node 22/24: `npm ci`, typecheck, lint, build, `git diff --exit-code -- lib/`, `npm test`, and `npm pack --dry-run`. No real DSH runtime is claimed for this documentation-only change.
- **PR:** https://github.com/free6589/dsh-grok-workflow/pull/16 (merged as `ea3e8e31`).
- **Next action:** PR merged. Local follow-up restored the compact configuration, disable/uninstall, testing, security, and compatibility sections in both READMEs, and corrected the install order: create a missing headless profile before `plugin add`. Keep the English and Chinese pages synchronized.

## 2026-11-03 — P0-5（首条消息不可见）已修复，等待复核与发布决定

- **做了什么**：定位并修复"`in-turn` 在 `agent/pre-step` 里 await 整个工作流 → 运行期间
  transcript 里没有 `user/message`"（`src/gate.ts`），新增回归测试，`lib/` 重建，真机前后截图入库。
  细节与命令见 [VALIDATION.md](VALIDATION.md) Round 17；源码事实见 [RESEARCH.md](RESEARCH.md) A13。
- **契约变化，接手前务必读**：`in-turn` 的 `enter.messages` 现在**只带报告**，被 claim 的用户消息
  由网关在等待前写入 surface（`commitClaimed` + `withoutClaimed`）。任何新的 pre-step 监听器
  都不要既 `session.append('user/message', …)` 又把它放进 `enter.messages`（会渲染两份）。
- **下一步（按优先级）**：
  1. 复核本次改动（单文件 `src/gate.ts` + 两个测试文件 + 文档）。
  2. 决定是否在 :3090 实例上做一次热重载验证 —— 注意会中断该实例上正在跑的运行（D-013），
     队长拍板后再做；本轮的 AFTER 证据来自隔离实例（同版本 `0.2.1-rc.2`）。
  3. `relay` / `append` 在长驻 GUI 的投递仍是 `NOT_RUN`（NR-1 剩余半边）。
- **未提交/未同步**：无。本轮未向 `[COORDINATION]` Issue 发状态块（`NOT_RUN`）。

## 2026-11-03 — route-concurrency 每路由并发上限收尾（待提交/PR）

- **做了什么**：`ModelRoute.maxInFlight?` + `HARD_LIMITS.routeInFlight={min:1,max:64}`；
  `resolveChain` 整数范围校验；script `normalizeChain` 保留/clamp 上限，
  `routeInFlight` 计数 + waiter 队列，`callRole` 选有空位的首条路由、全满等待，
  `traceRoute` 带 `skippedBusy`/`queuedMs`；report 校验透传 + `Route overflows …`
  单独渲染；records 台账透传溢出证据；`describeResolvedConfig` 显示 `(cap N)`；
  设置页每行第三框 + 中英 `capLabel/capPlaceholder/capHint` + `error.badCap`；
  导出 `GROK_WORKFLOW_ROUTE_INFLIGHT_MIN/MAX`；ARCHITECTURE 溢出-vs-回退小节 +
  CHANGELOG Unreleased + D-030 + 新手指南并发上限注记。
- **测试**：新增 `test/route-concurrency.spec.ts` 7 例（校验拒绝/溢出分流/排队峰值/
  clamp 钉死/预算不变/渲染与台账透传）；`test/client.spec.ts` bounds parity +
  `error.badCap` 双语 + 上限校验回归钉；`test/config.spec.ts` script clamp 钉。
- **下一步**：`npm run build` 重建 `lib/` → `git diff --exit-code -- lib/` 为 0 →
  `npm run ci` 全绿 → commit/push `origin feat/route-concurrency` → 开 PR
  `base:main`（标题见 STATE）→ 向 lead 回报 FROM/TO/TASK/BASE_COMMIT/WORK_COMMIT/
  CHANGES/TESTS_RUN/TEST_RESULTS/PR/BLOCKERS/NEXT_ACTION。

## 2026-11-06 — 跨轮上下文延续（v0.5，工作树内，未提交）

- **做了什么**：`src/carryover.ts`（新）+ `src/script.ts`（四角色提示词注入 + 脚本侧上限）+
  `src/run.ts` / `src/gate.ts`（只改 `runTeam` 注入，提问判定零改动）/ `src/index.ts`（工具路径注入）；
  测试 `test/carryover.spec.ts`（21 例）+ `test/gate.spec.ts`（+2 例）；
  `CHANGELOG.md [Unreleased]` 中英条目；`docs/knowledge/{VALIDATION,RESEARCH,DECISIONS,STATE}.md`；
  证据 `docs/knowledge/evidence/carryover-e2e/`。
- **验证事实**：`npm test` 33 文件 / 568 测试 PASS；`npm run lint` 0 error（3 个既有 warning）；
  `lib/` 由 `npm test` 的 build 重建；真机两轮 PASS（Round 21），digest 在真子代理提示词里可见。
- **给下一个 agent 的三条硬约束**：
  1. 不要为了"跨轮"改 `src/records.ts` 或归档存储——那是独立任务；本轮只用读路径。
  2. `carryoverBounds` 复用 `historyTurns`/`historyChars`；若要新增配置键，必须同时改设置页
     投影断言（`test/settings-projection.spec.ts` 的封闭键清单）。
  3. 真机多轮验证不能靠"同一条命令里连发两条消息"（会被丢）；本轮的可行姿势是
     `--session-id` 续跑，且**首条消息必须先走一次 gate-off**（F1 未修）。
- **下一步**：提交 + 开 PR（`base:main`）；决定 F1 是否另立任务；`:3090` 升级仍需用户批准（D-013）。

## 2026-11-06 — 增量记忆归档：轮次结算即写入、单次会话可读回（v0.5，工作树内，未提交）

- **做了什么**：`src/memory/archive.ts` / `src/memory/recorder.ts` / `src/memory/cli.ts`（新）+
  `src/run.ts` 两处接线（引擎事件订阅、`finally` 轮次结算，另加 `runSingleCall` 成功路径的前台档
  归档）；测试 `test/memory-archive.spec.ts`（21 例）+ `vitest.config.ts`（测试期把
  `GROK_WORKFLOW_MEMORY_DIR` 指向 `tmpdir()`，避免单测写进操作者的 `$DSH_HOME`）；
  `CHANGELOG.md [Unreleased]` 中英条目；`docs/knowledge/{VALIDATION,RESEARCH,DECISIONS,STATE}.md`；
  证据 `docs/knowledge/evidence/incremental-archive/`。
- **验证事实**：`npm test` 34 文件 / 589 测试 PASS；`npx tsc -p tsconfig.json --noEmit` 干净；
  `npm run lint` 0 error（3 个既有 warning）；`lib/memory/*` 由 `npm run build` 重建；
  真机：团队档一轮结算即写入 4 条（3 agent + 1 round），另起一个会话用
  `node lib/memory/cli.js recent` 直接读到该轮结果（Round 22）。
- **给下一个 agent 的四条硬约束**：
  1. **不要**把归档做成配置开关或挂到 `showProgress`：记忆不是展示偏好（D-036）。
  2. **不要**改成"会话收尾再写"或"dispose 钩子写"——那正是用户点名的失败模式。
  3. 读子代理产出必须走 `ctx.get('sessions')` 且在 **`agent-start`** 捕获会话对象，结论在
     `tool-call.arguments`（JSON 字符串）里而不是 assistant 文本（RESEARCH A15，三条都实测过）。
  4. 真机验证前先确认闸门开着（`grokDefault: "on"`），否则跑一整轮也不会有任何归档。
- **下一步**：提交 + 开 PR（`base:main`）；`:3090` 升级仍需用户批准（D-013）；
  两进程并发追加压测、换引擎的子代理形状复测仍是 `NOT_RUN`。

## 2026-11-08 — fix_completed_links 完成：已完成子任务保持可点击（真机 PASS，待复核/发布决定）

- **From:** 执行子代理（fix_completed_links）· **To:** lead / 用户 · **Base:** `524097f`（本地 `release/0.6.0` HEAD）
- **结论（`CONFIRMED`）**：已完成（及失败/取消/中断）子任务行在聊天任务列表恢复可点击并
  可打开子会话视图；真机验证见 `VALIDATION.md` Round 30，决策 `DECISIONS.md` D-040，
  机制 `RESEARCH.md` A17。改动全在插件客户端（`src/client/index.js` = `lib/client.js`），
  DSH core 零改动。
- **本轮改动**：`src/client/index.js` + `lib/client.js`（`mountPanel`，`priority: -1` 遮蔽）、
  `test/panel-links.spec.ts`（新，14 例）、`test/client.spec.ts`（+2 断言）、
  `package.json`（`test:unit` 收入新 spec）、`.gitignore`（`.v070-home/`）、
  `CHANGELOG.md` `[Unreleased]` 中英条目、`docs/knowledge/{VALIDATION,RESEARCH,DECISIONS,STATE,HANDOFF}.md`、
  `docs/knowledge/evidence/panel-links-2026-11-08/`。
- **测试（`CONFIRMED`）**：`npm run ci` exit 0，**36 文件 / 638 测试 PASS**（typecheck 0 错，
  lint 4 warning / 0 error 基线）；`lib/` 重建幂等（md5 `3ae940ff…`，src/lib 逐字节一致）。
- **真机（`CONFIRMED`）**：隔离 `DSH_HOME=.v070-home/`，profile `panelcheck`（web 模板），
  插件 dev 安装 + `workflow-ptc` 启用 + v4-pro/agnes 模型 patch，实例 `127.0.0.1:3179`，
  headless Chromium；团队档跑到 `completed`，6/6 行可点击（含 `规划助手 已完成` 与
  `执行 failed`），点击规划助手打开 `任务团队 child 1` 子会话视图。运行中行同为按钮（对齐库存行为）。
- **诚实边界**：首轮真机 run（写文件任务）因 `/home` ro 挂载按预期 FAILED——恰好覆盖
  failed 行渲染与可点击（6/6 按钮）；`relay`/`append` 形态未单独验证（HYPOTHESIS 外推）；
  深色主题/移动端 NOT_RUN；live `:3090` 未动（D-013）。
- **并发注意**：工作树含 fix_child_names 任务的记忆条目（D-039/Round 27–29），随本轮 commit
  一并入库；`src/` 其余文件未触碰。
- **Next action**：①lead 复核 D-040/Round 30 后决定合入/发布节奏（未 bump 版本、未 tag）；
  ②`:3090` 升级仍待用户批准（D-013）——修复要在线上生效需升级 + 重载。

- **部署边界（本轮实测，`CONFIRMED`）**：本会话的 DSH 文件策略是 `workspace-write`，
  `cp -a lib/. /home/fish/dsh-layerfs/profiles/web/node_modules/dsh-grok-workflow/lib/`
  被沙箱拒绝（`Read-only file system`，含备份目录创建）。因此 live 安装副本**本轮未由我改动**；
  安装包已打到 `out/dsh-grok-workflow-0.6.0.tgz`（66 文件 / 309K，`npm pack --cache /tmp/...`，
  默认 `~/.npm` 只读）。用户执行安装 + 重启即可收口。Round 35 记录的「已装入 live 副本」
  只覆盖当时的 `lib/gate.js`，不含本轮 B 方案。
