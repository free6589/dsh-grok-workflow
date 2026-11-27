# 证据目录 · C2 计数口径（method-c2-23-2026-11-28）

- **基线 commit**：`850887c`（`850887c376370252eb78c4bad726d812a365e9fd`，`docs(memory): record round22 wrap`，2026-11-28 05:04:04 +0800）——`CONFIRMED`，本树 `git rev-parse --short HEAD` + `git log -1` 实读。
- **分支**：`fix/method-c2-23`（`...origin/main`，开工时工作树干净：`git status --porcelain | wc -l` = 0）——`CONFIRMED`。
- **worktree**：`/home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-mc2-23`（唯一工作区，未离开）。
- **包工头**：`dispatcher-method-fix`；本目录小工：`dispatcher-method-fix/evid-c2-23`（证据小工，只写本目录）。
- **环境**：node `v26.8.1` / npm `11.19.0`。

## 1. C2 口径问题（派单口径，本小工未独立复算 → `NOT_RUN`）

同一批会话日志，两种口径给出的「错误」数量差 6 倍：

| 口径 | 判据 | 数 |
| --- | --- | --- |
| 旧口径 | 文本里出现报错关键词即计入 | **3219** |
| 结构化口径 | tool result / 事件上的 `isError === true` | **505** |

判据差异不是取舍问题，是**旧口径把正常的文本命中（示例、日志引用、被引用的失败原文）算成了失败**，
于是「错误率」这类比值被系统性抬高一档。**建议改读结构字段**：`isError`（工具结果真假错）、
job/run 的 `settled` 状态（终态是否真正落定）、`turn end`（轮次是否正常收束），不再用关键词匹配当错误判据。

- 数字来源：派单原文。本小工**没有**复算这两个数（`NOT_RUN`），也不把它写成自己的实测结论。
- 已知限定：3219/505 对应的是哪一批日志、哪个时间窗，派单未附；补算需另行派活。

## 2. 钉子改动（`nail-c2-23` 产出，本小工只读复核）

改动**不碰 `src/`**：一条纪律进 `docs/knowledge/TESTING.md` 的规则表，一条 spec 钉住它。以下行号为本树
`grep -n` / `awk` 实读（`CONFIRMED`，读取时点 2026-11-28 05:15 +08:00）：

| 文件 | 行 | 内容 |
| --- | --- | --- |
| `docs/knowledge/TESTING.md` | **47–54**（新增第 12 条，`+8` 行） | 「计数口径：错误数只读权威信号，不认关键词命中」：读 `isError` 为真、job 已落定、`turn/end` 的 `error` 结局；grep `error` 的命中数不是错误数，报命中数必须写成「关键词命中」 |
| `test/count-criterion-23.spec.ts` | **1–33**（新文件，3 条 `it`：19 / 23 / 29） | 断言 TESTING.md 有编号的计数口径纪律、点名三项权威信号、并写明关键词命中**不得写成**「错误」 |

- 同一处给出的两组读数（钉子正文自述，本小工**未复算** → `NOT_RUN`）：C2 八轮会话日志 `error` 命中
  **3219** / `isError: true` **505**；`.rsi/evidence` 44 份日志复核命中 **4523** / `isError: true` **13**
  （1048 条 tool/result）。
- 钉子小工 `dispatcher-method-fix/nail-c2-23` 的最终自述可能补红/绿细节；本目录不替它写自述。

## 3. 门禁（`gate-c2-23` 产出，本小工转述）

两命令 `npx tsc -p tsconfig.json --noEmit`（= `npm run typecheck`）与 `npx oxlint src test`（= `npm run lint`）。
两轮都跑过：先用基线树做对照，再在钉子落盘的最终树上重跑。

| 树 | 命令 | EXIT | 原文要点 |
| --- | --- | --- | --- |
| 基线 `850887c`（钉子前，树干净、`git log origin/main..HEAD` 空） | `npx tsc -p tsconfig.json --noEmit` | **0** | 输出为空（零错误零诊断） |
| 基线 `850887c` | `npx oxlint src test` | **0** | `Found 17 warnings and 0 errors.` / `Finished in 47ms on 205 files with 96 rules using 6 threads.` |
| **最终树**（含 `TESTING.md` 第 12 条 + `test/count-criterion-23.spec.ts`，未提交，HEAD 仍 `850887c`） | `npx tsc -p tsconfig.json --noEmit` | **0** | 无输出（零错误零诊断；新 33 行 spec 严格检查干净） |
| **最终树** | `npx oxlint src test` | **0** | `Found 17 warnings and 0 errors.` / `Finished in 50ms on 206 files with 96 rules using 6 threads.` |

- **告警逐条对得上**：17 条与基线完全相同，构成 13×`eslint(no-unused-vars)`、2×`eslint(no-unassigned-vars)`、
  1×`unicorn(no-useless-spread)`、1×`eslint(no-useless-escape)`，分布 `test/` 16 条（`delivery.spec.ts` 3 条最多）
  + `src/redact.ts` 1 条。文件数 205 → **206**（+1 正是新 spec），**新文件 0 新增告警**。
- **判据**：tsc 0 错、oxlint 0 error；两轮同判据，最终树不因钉子而退步。
- **来源**：两轮 EXIT 均为包工头 `dispatcher-method-fix` 转述 `gate-c2-23` 原文（05:2x / 05:3x 两次同步）。
  **两条命令未由我执行**——派单把门禁给了门禁小工，上表是转述，不是我的实测。

## 4. 红线遵守声明

1. 只在 worktree `.tmp/wt-mc2-23`（分支 `fix/method-c2-23`）内动作，未离开。
2. **本小工未改产品代码、未改行为逻辑**：我对 `src/` `lib/` `test/` `docs/` 零改动（树上那一份
   `docs/knowledge/TESTING.md` 改动与 `test/count-criterion-23.spec.ts` 新文件是钉子小工的，不是我的）；
   我的唯一写路径是 `.rsi/evidence/method-c2-23-2026-11-28/`（只建这一份目录，未多建）。
3. 未 merge、未 rebase、未 commit、未 push、未 force-push、未打/动 tag。
4. 未碰 live 实例（未重启、未 reload、未改 `~/.dsh`）、未跑全量 `npm run ci`。
5. 未代写记忆文档（STATE / HANDOFF / VALIDATION / DECISIONS 由包工头统一收）。
6. 未编造他人结果：钉子与门禁两节在其结论落地前一律留 `NOT_RUN`；落地后只按原文转述并逐处注明来源。

## 5. 状态小结

- 钉子改动文件行：**已入档**（§2，两个文件、行区间实读）。
- 门禁两命令 EXIT：**已入档**（§3，基线 + 最终树各一轮，均 `EXIT 0`，转述自门禁小工）。
- 仍未做（`NOT_RUN`，不属本小工）：钉子的红/绿自述、3219/505 两数的独立复算、真机/隔离 soak。
- `commands.log` 逐条记本小工实跑命令原文与 EXIT；他人命令按来源标注为转述，未混写成一等证据。
