# 手工清单 12 项顺序执行 · 第 2 轮（2026-11-23）

- **源文件**：`manual-sessions-unfinished.md`（工作区根，未纳入版本库）
- **口径**：第二节 7 件（1→7）→ 第三节 5 件（1→5），严格顺序；**一项一分支**（自合完的 `main` 尖端开），
  合前 `npm run ci` 必须 exit 0，合完再开下一项；不可修的记账跳过，不停摆。
- **执行位置**：`main` 的干净工作树 `.agents/worktrees/fix-synth-resubmit`
  （主检出 detached `a6103ad` 的既有未提交改动**未被触碰**）。
- **状态词汇**：`CONFIRMED` / `HYPOTHESIS` / `NOT_RUN` / `BLOCKED`（AGENTS.md §2）。

## 1. 十二项逐条

| # | 源文件标题（原文） | 结果 | 分支 → 合并 |
|---|---|---|---|
| Sec.2-1 | 「运行时限默认还是 60 分钟，我要的是不限时」 | **MERGED**（默认 0 早在 `1591665`；本轮补宿主工具死线与双 README 默认值的钉子） | `rsi/sec2-01-timeout-default`（`22ab037`）→ `a3f57c5` |
| Sec.2-2 | 「主会话应该永远能插话，但现在默认关着，设置页也没开关」 | **MERGED**（默认改成开，开关保留） | `rsi/sec2-02-replan-default`（`f996cc8`）→ `28c0dd2` |
| Sec.2-3 | 「workflow 总开关一按就报 405」 | **MERGED**（405 补 `Allow: GET, POST`；GET 读取在 `5dc0512`） | `rsi/sec2-03-mode-allow`（`be6abed`）→ `994f71e` |
| Sec.2-4 | 「设置页没有一键升级按钮」 | **MERGED**（升级卡直接给结论 + 明说页面不能执行系统命令；一键装仍缺宿主能力） | `rsi/sec2-04-upgrade-verdict`（`81f6c5a`）→ `1d5ef41` |
| Sec.2-5 | 「进度页的『回答』格子永远是空的」 | **MERGED**（设计文档改六段脊椎 + 守卫；删格在 `1591665`） | `rsi/sec2-05-answer-cell-doc`（`ae72f7d`）→ `8531ac1` |
| Sec.2-6 | 「断点续跑只做了一半，出事后不会自己接着跑」 | **MERGED**（`resumeCarryover` 抽取 + 三条用例；接线在 `1591665`） | `rsi/sec2-06-resume-carryover`（`2cfe4be`）→ `c7df2ce` |
| Sec.2-7 | 「宿主证据收集那一阶段，根本没开工」 | **SKIPPED / `BLOCKED`**（源文件要求先确认阶段存废；D-112 备好第一刀） | `rsi/sec2-07-host-evidence`（`b1230e1`）→ `70f9307` |
| Sec.3-1 | 「进度页跨阶段的线太多，合并成一根」 | **MERGED**（连线模型文档；实现在 `adc7fb4`） | `rsi/sec3-01-rail-doc`（`0f9f2e3`）→ `96ad5f2` |
| Sec.3-2 | 「模型失败换人时加 429 之类的勾选框」 | **MERGED**（新键 `switchOnRateLimit` + 设置页勾选框 + 脚本级用例） | `rsi/sec3-02-switch-on-rate-limit`（`7305f17`）→ `cd88e4b` |
| Sec.3-3 | 「汇总环节也要『检查 + 复核』，不能只汇总一次」 | **MERGED**（判定进报告：`synthesis.review` + `Summary review:` 行） | `rsi/sec3-03-summary-review`（`b225446`）→ `504bcf3` |
| Sec.3-4 | 「开插件后的答案要和不开插件时长得一样」 | **MERGED**（证据 + 三步并排比对规程；观感判定 `NOT_RUN`） | `rsi/sec3-04-answer-parity`（`d947a92`）→ `23820e2` |
| Sec.3-5 | 「查清那次绘画任务为什么失败」 | **MERGED**（范围结论：本仓库无图像能力；继续查 `BLOCKED`） | `rsi/sec3-05-image-scope`（`943bb86`）→ `a68a372` |

**没有一项"未尝试"**：12 项都读了源码/测试，11 项落在 `main` 上，1 项带 `BLOCKED` 理由记账。

## 2. 分支纪律

- 开每条分支前都查过 `git branch -a`，无同名；每条都从**合完的 `main` 尖端**开，合入后再开下一条，没有叠分支。
- 12 条 `rsi/*` 分支全部保留在本地供复核（未 push），判定删除日期 2026-11-24，记在 `HANDOFF.md`。
- 合入顺序与 `main` 线性关系：`a3f57c5 → 28c0dd2 → 994f71e → 1d5ef41 → 8531ac1 → c7df2ce → 70f9307 →
  96ad5f2 → cd88e4b → 504bcf3 → 23820e2 → a68a372`。

## 3. ci 绿日志

逐次见 `docs/knowledge/VALIDATION.md` 同名小节与 `logs/ci-r2-*.log`（13 次：基线 + 12 项）。
两次红跑都就地修完：Sec.2-2 的 `grok-on-ingress` 队列饱和用例、Sec.3-2 的类型/字段数断言；
另有一次 `test/timeout.spec.ts` 的 `Atomics.waitAsync` 30 s 并发抖动（Sec.2-5），单独重跑即过并重跑整轮 ci 取绿。

## 4. 本轮实质改动（摘要）

1. **Sec.2-2**：`DEFAULT_REPLAN = true`；设置页 `def: true` + 双语提示；README 两版表格行；`grok-on-ingress`
   队列用例改钉 `replan:false`（那条路径才是它测的）。
2. **Sec.3-2**：`switchOnRateLimit`（新键，默认 true）→ `src/script.ts` 在关闭时传六类白名单；
   配置面 18→19 键，README/LOCAL-TESTING/投影计数/文档守卫同步。
3. **Sec.3-3**：脚本记录 `synthesis.review`（成功 `check=pass verify=pass drafts=N`，失败带阶段），
   `src/report.ts` 归一化并渲染 `Summary review:`。
4. **Sec.2-3**：`MODE_ROUTE_METHODS` 单一来源驱动方法闸门与 405 的 `Allow` 头。
5. **Sec.2-4**：升级卡新增"要不要升级"结论行与"本页不能执行系统命令"说明。
6. **Sec.2-1 / 2-5 / 2-6 / 3-1**：钉子（宿主工具死线用例、设计文档守卫、`resumeCarryover` 抽取+用例、连线文档）。

## 5. 分歧日志（供操作员最终复核）

- **D1（Sec.2-1）**：默认值不是本轮改的（`1591665` 已是 0）。本轮不为"再合一次"重写，落地的是
  "宿主工具不能自带死线"和"两版 README 都写默认 0"两条钉子。
- **D2（Sec.2-2）**：上一轮选"给开关、默认关"；本轮按原话"默认打开"改成开。代价：仅在跑中来消息时花
  一次规划调用（每轮至多 4 次）。
- **D3（Sec.2-4）**：一键安装做不到——页面没有执行系统命令的能力，插件也不该代跑 `npm`/`dsh plugin`。
  本轮把"要不要升级"直接回答，并把"去终端跑这一行"说清楚；一键装若要做，需宿主提供受控能力，属新决定。
- **D4（Sec.2-5）**：删格是上一轮的收口，本轮只把设计文档从七段改成六段并加守卫。
- **D5（Sec.2-7）**：`BLOCKED`。源文件的"差什么"是"先确认这一阶段还要不要做"；第一刀（只读主机事实快照，
  走诊断开关）已写进 D-112，一句话即可开工。
- **D6（Sec.3-2）**：只做操作员点名的 429，不复活整套 `switchOn`（T4 已删）。默认打开＝保持既有行为；
  关掉＝其余六类仍换人。
- **D7（Sec.3-3）**：**没有**改成"走 verifier/supervisor 模型角色"——那会花额度并把"假通过"交回模型自评。
  本轮让两道确定性的门可见；要模型复核是新决定。
- **D8（Sec.3-4）**：代码侧 `CONFIRMED` 已有断言，观感判定 `NOT_RUN`（只有人眼能判），规程见
  `docs/knowledge/evidence/answer-parity-2026-11-23.md`。
- **D9（Sec.3-5）**：本插件无图像能力（`CONFIRMED`），失败在上游图像链路；继续查需那轮报错文本 + 渠道/模型配置，
  且在另一个仓库，超出本任务边界。

## 6. 环境与安全

未写密钥、未 force-push、未改写共享历史、未 push、未发版、未打 tag、未 npm publish、未改 DSH 核心、
未重启或触碰运行中实例、未写 live home。所有改动只落在仓库工作树、`docs/`、`.rsi/evidence/`。
