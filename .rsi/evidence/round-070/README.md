# round-070 — 体验档 5 条（一次落地）· 证据

Branch: `feat/exp-pack-070`（worktree `.agents/worktrees/exp-pack-070`，from main `cda5d4e`）
Base: main `cda5d4e`（STATE.md 首条 0.13.22 确认的 HEAD）
Status: **CONFIRMED** — 代码、红绿对照、`npm run ci` exit 0 均已实测。未提交、未推送。

## 逐条：改了什么 + 红绿

| # | 需求 | 改动位置 | 红（旧码 `cda5d4e`） | 绿（本分支） |
|---|---|---|---|---|
| 1 | 失败文案说人话（unloaded 原因 + 战果 + "重发即接着跑"） | `src/types.ts`（`StopCause`/`WorkflowReport.stop`）、`src/report.ts`（`stopNarration`/`stopTally`）、`src/delivery/index.ts`（取消/失败呈现分支）、`src/run.ts`（`settle`/`stopCauseOf` + 取消文案） | 旧码 `下一步：这次是被主动停下的，不算失败；要接着做得重新发一次。`（把"卸载"说成"你停的"，且不说战果） | `下一步：这次是插件在运行中被卸载（或升级）才停的，不是超时，也不是你手动停的。已经做完 1 项，还剩 1 项没做完。原样再发一次就接着跑，已经做好的不会重做。` |
| 2 | 守卫结论进正文（固定一行：N 条发现 / 未终止子代理 / 由 X 取消） | `src/report.ts`（`GuardConclusion`/`guardLine`/`guardOf` + 渲染尾部）、`src/delivery/index.ts`（人话块与台账尾部，进保留尾行）、`src/run.ts`（`settle` 记录 `guard`） | 报告尾部无守卫行（最后一行是 `以上是结论（2 项里 1 项可用，1 项没做 成）…`） | `守卫：2 条发现，未终止任何子代理；本轮由插件卸载取消。`（完成轮：`本轮无人取消（正常跑完）`） |
| 3 | 收编在飞子代理（childId + 最后一步进 checkpoint，报告给续问指引） | `src/checkpoint/schema.ts`（`CheckpointInFlight`/`inFlight` build+assert）、`src/checkpoint/wiring.ts`（`live` 行跟踪、`stats.inFlight`、`readLatestCheckpointSync`）、`src/run.ts`、`src/report.ts`（续跑子句） | 旧码 `buildCheckpoint({inFlight})` 落盘后 `inFlight === undefined`；卸载写的 checkpoint 没有在飞行 | `[{"seq":1,"childId":"child-42","lastStep":"执行"}]`；人话块补 `停下时还有 N 个子代理在跑，它们也记进了恢复点` |
| 4 | `/grok status`（run 状态/死因/守卫/可续 checkpoint/未完成清单） | `src/command.ts`（`readRunStatusFacts`/`grokStatusText`、语法加 `status`、`GROK_USAGE_TEXT` 旁）、`src/checkpoint/wiring.ts`（同步读 checkpoint） | 旧码 `error: Usage: /grok [on|off]. This text was not sent as a prompt, so nothing ran.` | `success: Grok workflow status:` —— Toggle / Last run / State / Why it stopped / Guard / 在飞子代理 / Resumable checkpoint / Checkpointed in-flight calls / Unfinished / To continue |
| 5 | 台账可更正（旧 cancelled/failed round 打 superseded by 链接） | `src/memory/archive.ts`（`supersedes`/`supersededBy`、`appendSupersedeEntry`、`supersessionMap`、`formatArchiveEntry`、`recentArchiveDigest`）、`src/memory/recorder.ts`（`round()` 后 `supersedeEarlierRound`） | 旧码无该导出（`no export`），且 `round()` 不写任何更正 | `corrections=1`，摘要里旧轮带 `superseded by: run:run-new` |

## 红绿命令与结果

**行为探针**（分别打到旧/新 `lib/`，同一脚本，无模型无网络）：

```bash
# 旧码：git worktree add .tmp/wt-red70 cda5d4e
node .rsi/evidence/round-070/probe.mjs /home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-red70
# → summary: 0/5 present (red)         证据 red-probe.txt

node .rsi/evidence/round-070/probe.mjs .
# → summary: 5/5 present (green)       证据 green-probe.txt
```

**回归用例**（`test/experience-pack.spec.ts`，24 例）：

```bash
# 旧码 worktree 里跑同一份 spec
npx vitest run test/experience-pack.spec.ts
# → Tests 17 failed | 7 passed (24)    证据 red-vitest.txt

# 本分支
npx vitest run test/experience-pack.spec.ts
# → Tests 24 passed (24)
```

旧码上每条需求都有失败用例（5 条全部命中）：

- 1：`names the unload in everyday words…`、`does the same in English…`、`renders the same account in the machine ledger`、`returns nothing at all for a report that recorded no stop`
- 2：`closes the human block with findings…`、`says nobody cancelled a run that finished on its own…`、`renders off the report itself…`、`closes the delivered block and records the settlement on the report`（真跑一遍 `runWorkflow`，验 `report.guard` 与交付块尾行）
- 3：`keeps child id and last observed step in the checkpoint`、`writes the in-flight child into the checkpoint on unload…`、`tells the reader how many child calls were still running`
- 4：`reports an empty session honestly…`、`reports the run state, the guard conclusion and the in-flight child`、`points at the resumable checkpoint and lists what is unfinished`
- 5：`appends a correction and reads it back as one`、`renders the link on the correction and on the round it corrects`、`writes the link automatically when a later round carries the work through`

旧码上通过的 7 例是"不变的一半"（fixture 合法、无 settlement 时不凭空造守卫行、无在飞时不写 `inFlight` 段、失败轮不 supersede、status 不写 toggle），新旧都该绿，故保留。

## 门禁

```bash
npm run build     # tsc -p tsconfig.build.json + scripts/build-client.mjs → OK
npm run ci        # typecheck + lint(oxlint) + verify:lib + npm test
# → Test Files 88 passed (88) / Tests 1680 passed (1680) / exit=0
```

完整日志：`ci.log`（末尾 `exit=0`）。`lib/` 已随源码重建（未提交）。

## 边界与已知取舍

- 文案/守卫两行的语言：人话块按 `lang` 出中/英；机器台账（`renderReport`、`machineLedger`）保持英文，与既有台账一致。
- 只有 `unloaded`/`caller` 会用新文案替换"下一步"建议；`deadline`/`engine` 保留原分类建议（那段已经说"不是你的问题、再发一次"，替换反而丢信息），但台账里所有原因都有 `Stop:` 行。
- 需求 2 的"progress-tab 进展页可选"未做（原文标注可选），进展页已有 guardian 事实行，避免与保命档改动交叉。
- `test/command.spec.ts` 里命令 `description`/`hint` 的断言同步改为 `[on|off|status]`：语法接受了 `status` 而帮助文本不说，是更坏的谎。
- `README.md` / `README.zh-CN.md` 的开关行同步补上 `/grok status`（语法、用法行、它不写任何东西）；`docs/task-prompt-template.md` 里那句 `Usage: /grok [on|off]` 是历史实测引文，按"引语原样保留"不动。
- 未改 `docs/knowledge/*`：本轮按要求不提交、不推送，留给合并方统一写 STATE/VALIDATION，避免与队长/保命档产生文本冲突。
- 临时红码 worktree：`.tmp/wt-red70`（gitignored），出证据后已删除。
