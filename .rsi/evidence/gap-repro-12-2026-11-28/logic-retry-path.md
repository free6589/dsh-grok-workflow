# 逻辑对照：bounded-retry 耗尽路径 ↔ run 686af548 seq30 failed

- 角色：逻辑小工（只读对照；未写产品代码、未 merge、未碰 live）
- 工作目录：`/home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-gap-12`
- 分支 / 基线：`fix/gap-repro-12` / `9977211f71db8c6afec8d137b1dd6a5ea33967d1`（`git rev-parse HEAD` 实测）
- 工作树：`git status --short --branch` 仅 `## fix/gap-repro-12`（干净）
- 采集时间：2026-11-28T02:45+08:00（Asia/Singapore）

## 0. 行号对账（先说清楚，避免错位引用）

任务给的锚点「src/script.ts:782 起」在当前基线上**不是** retry 代码：

- `782` 实际是 `classifyFailureText()` 的一条分支（provider 文本分类表），`776` 起才是该函数。
- bounded-retry 主体在 **`runTaskUnsafe()`：4013/4014/4018 起，耗尽返回在 4338–4346**。
- 另外代码里有**两个不同的 "exhausted"**，容易混：
  1. **路由链耗尽**（一次调用内把角色链走完）：`callRole()` 在 1266–1273 返回 `label: 'exhausted'`；
  2. **尝试预算耗尽**（一个任务把 `maxRetries+1` 次走完）：4345–4346 返回 `status: 'failed'`。
  本次任务是第 2 种；第 1 种的"耗尽"只是把该调用判为该 attempt 的失败，交给第 2 种处理。

（下文所有行号均为基线 9977211 实测，摘录逐字。）

## 1. 关键代码行号 + 逐字摘录

### 1.1 尝试预算本身（默认 1 次重试 = 2 次尝试）

```
84: const maxRetries = Math.max(0, Math.min(3, argNumber(args ? args.maxRetries : undefined, 1)));
```

```
4013:   const attempts = [];
4014:   const maxAttempts = maxRetries + 1;
4015:   let lastError = '';
4016:   let lastFailure = null;
4017:   let previous = null;
4018:   for (let attempt = 1; attempt <= maxAttempts; attempt++) {
```

### 1.2 每次尝试内部：worker → verifier → supervisor，只有"同一 attempt 内重发"，不产生新任务

```
4026:       const worker = await callRole('worker', workerPrompt(task, attempt, previous, upstreamText), {
```
```
4061:     if (!execution && attemptFailure && attemptFailure.class === 'format-error' && !attemptFailure.setup) {
```
```
4130:       if (!verification && judgeLegTransportDeath(attemptFailure, 'verifier')) {
```
```
4332:     if (passed) {
4333:       log('task ' + task.id + ' verified on attempt ' + attempt);
4334:       return { task: task, status: 'verified', attempts: attempts, error: '' };
4335:     }
```

### 1.3 耗尽/早退：两条出口都**不再派子任务**

```
4336:     lastError = redactPromptText(executionError || verifyError || 'verification failed');
4337:     previous = { execution: execution, verification: verification, error: lastError };
4338:     if (attemptFailure && attemptFailure.setup) {
4339:       // A setup fault repeats by definition (a cap, a bad option, a bad schema):
4340:       // spending the remaining attempts would only burn budget.
4341:       log('task ' + task.id + ' stopped after a setup fault: ' + attemptFailure.class);
4342:       break;
4343:     }
4344:     if (attempt < maxAttempts) log('task ' + task.id + ' attempt ' + attempt + ' failed; retrying');
4345:   }
4346:   return { task: task, status: 'failed', attempts: attempts, error: lastError, failure: lastFailure };
```

要点：循环体内**没有任何**"再派一个替补/替代子任务"的分支；唯一的再派是 `for` 的下一轮（第 2..n 次尝试），退出后函数只返回一行终态结果。

### 1.4 失败之后：依赖者改判 blocked（0 次尝试，不派子任务）

```
3337: function blockedResult(task, upstreamIds) {
3338:   const reason = 'blocked: upstream task ' + upstreamIds.join(', ') + ' did not verify, so this task did not run (no attempt taken, no retry spent)';
3339:   return {
3340:     task: task,
3341:     status: 'blocked',
3342:     attempts: [{ attempt: 1, execution: null, verification: null, passed: false, error: reason }],
3343:     error: reason
3344:   };
3345: }
```

```
3901:       const deps = task.dependsOn || [];
3902:       const unverified = [];
3903:       for (let d = 0; d < deps.length; d++) {
3904:         const upstream = settled[deps[d]];
3905:         if (!upstream || upstream.status !== 'verified') unverified.push(deps[d]);
3906:       }
3907:       if (unverified.length > 0) {
3908:         settled[task.id] = blockedResult(task, unverified);
3909:         log('task ' + task.id + ' blocked by ' + unverified.join(', '));
3910:         continue;
3911:       }
```

### 1.5 其余能产生新子任务的通道，都被"已验证/未开始"卡住

```
3936:     if (stopOnFailure) {
...
3942:       if (failedIds.length > 0 && w + 1 < current.length) {
3943:         for (let r = w + 1; r < current.length; r++) {
3944:           for (let t = 0; t < current[r].length; t++) {
3945:             settled[current[r][t].id] = captainStopResult(current[r][t], failedIds);
3946:           }
3947:         }
3948:         log('captain stop after wave ' + (w + 1) + ': ' + failedIds.join(', ') + ' did not verify; ' + (current.length - w - 1) + ' wave(s) not dispatched');
3949:         break;
```

边界重规划只能改"还没开始的波"，已结算任务禁止重跑：

```
3955:     if (w + 1 < current.length && replanChannel !== null) {
3956:       const remaining = current.slice(w + 1);
```

`src/replan.ts`：

```
177:     if (Object.prototype.hasOwnProperty.call(settled, id)) {
178:       return refuse('cannot ' + action + ' task ' + id + ': it already settled as ' + String(settled[id]) + ' (settled work is preserved, never re-run)');
```

### 1.6 汇总助手（seq30）走的是另一条规则：**没有 maxRetries**

```
730: const polishAttempted = humanSummary && (synthesisPolicy === 'model' || synthesisPolicy === 'layered') && roleRoutes.synthesizer.length > 0;
731: const synthesisMode = polishAttempted ? 'model' : 'deterministic';
```

```
3164:     const call = await callRole('synthesizer', prompt, {
3165:       schema: SUMMARY_SCHEMA,
3166:       label: label,
3167:       phase: phaseLabel('synthesize'),
3168:       attempt: attempt
3169:     });
3170:     if (!call.ok) {
3171:       if (call.failure && call.failure.class === 'format-error' && !call.failure.setup) {
3172:         const resubmit = await callRole('synthesizer', summaryResubmitPrompt(prompt, attempt + 1), {
...
3185:       }
3186:       return { text: '', error: 'synthesizer failed on every route: [' + call.failure.class + '] ' + call.failure.reason };
```

即：汇总只"同一次 attempt 里因格式问题再问一次"；子进程直接死掉（非 `format-error`）就**一次都不重发**，返回空文本。

空文本之后由交付层兜底，不再派模型：

```
4711:   if (synthesisSummary === '') {
4712:     const fallbackReview = reviewSummaryDraft(fallback, '', facts, corpus, fallbackCoverage, results, planningFallback);
4713:     if (fallbackReview.ok) {
4714:       synthesisSummary = fallback;
4715:       synthesisSource = 'fallback';
```

### 1.7 child-outcomes 收集点：只修报告文字，**不改派发**

收集（host 侧观察 seam）：

```
team-engine.ts
263:     const record = (outcome: ChildTerminal): void => {
264:       try {
265:         outcomes.add({ ...base, ...outcome })
266:       } catch {
267:         // The log is a diagnostic; a refused write must not reject this handler,
268:         // which would surface as an unhandled rejection of the engine's own run.
269:       }
270:     }
271:     void (result as Promise<unknown>).then(
272:       settled => { record(terminalFacts(settled, session, position)) },
273:       (error: unknown) => {
276:         record({ stopReason: 'rejected', diagnostic: error instanceof Error ? error.message : String(error) })
277:       },
278:     );
```

取本次 run 的切片 + 事后修报告：

```
run.ts
1182:   const childOutcomes = childOutcomeLog(ctx)
1183:   const childOutcomeMark = childOutcomes.mark()
```
```
1588:         const repaired = reclassifyNullCollapses(validated, childOutcomes.since(childOutcomeMark))
1589:         if (repaired > 0) logger.warn(`null-collapse repair: ${repaired} report row(s) rewritten with the child's real failure cause`)
```

模块自己声明"只报不改"：

```
child-outcomes.ts
25:  * - The repair is *reporting only*. The script's own routing decision was already
26:  *   taken on a null it could not explain, so this module never claims to have
27:  *   changed which route answered, how many attempts ran or whether a resubmit
28:  *   fired. Telling the script the cause needs a channel it does not have yet
29:  *   (`docs/knowledge/DECISIONS.md`, T1 step 2).
```

日志自身的"丢弃"只针对证据条数，不针对任务：

```
child-outcomes.ts
43: export const CHILD_OUTCOME_LIMIT = 512
...
152:     add(outcome) {
153:       seq += 1
154:       entries.push({ ...outcome, seq })
155:       if (entries.length > CHILD_OUTCOME_LIMIT) {
156:         const drop = entries.length - CHILD_OUTCOME_LIMIT
157:         entries.splice(0, drop)
158:         base += drop
159:       }
160:     },
```

汇总规则是"只有证据一致才改一行"，不产生任何动作：

```
child-outcomes.ts
392: function resolveGroup(role: RoleName, entries: readonly ChildOutcome[]): AttemptFailure | undefined {
393:   if (entries.length === 0) return undefined
394:   // A child that finished without submitting is a real format gap: the resubmit
395:   // path exists for exactly that case, so the group keeps its original wording.
396:   if (entries.some(entry => entry.stopReason === 'completed')) return undefined
397:   const classes = new Set(entries.map(entry => childFailureClass(entry)))
398:   if (classes.size !== 1) return undefined
```

结论（对问题"有无'耗尽即丢弃、无补派'分支"）：**没有"丢弃任务"的分支，也没有"补派"分支**。child-outcomes 全程是 report-only；真正让"后无派发"成立的，是 `runTaskUnsafe` 的耗尽返回 + `runWaves` 的 blocked/captainStop 传染。

## 2. 耗尽路径流程图（5 行）

1. `runTaskUnsafe`：attempt 1 → `maxAttempts`（默认 2），每轮 worker → verifier → supervisor。
2. 通过 → `status: 'verified'`（下游才可派）；失败 → 记一行 attempt。
3. `setup` 类故障 → 立即 `break`；否则 `attempt < maxAttempts` 才再派**同一个任务**的下一次。
4. 循环走完 → `status: 'failed'`，函数返回；**无替补通道**；下游依赖改判 `blocked`（`no attempt taken, no retry spent`），captain 停止则剩余波次直接写 `stopped`。
5. 之后仍能产生子任务的只剩：别家已核验上游的后续波、边界重规划（已结算禁止重跑）、汇总助手（无 maxRetries，只有同次格式重发）。

## 3. 一句话结论

**是（对被耗尽的那项任务而言必然无补派）**：代码里唯一的"再派"就是同一任务循环内的第 2..n 次尝试，循环耗尽即把任务钉成终态 `failed`，下游一律变成零尝试的 `blocked`/`stopped` 行，全仓不存在"失败后再派一个替补子任务"的分支；但 `seq30`（汇总助手）那次失败**不属于**耗尽路径——汇总阶段只有一次调用 + 同次格式重发，子进程直接死掉就返回空文本并由交付层兜底，所以"seq30 之后无派发"是汇总收尾的必然结果，与 retry 预算无关。

## 4. run 686af548 seq30 failed 对照（CONFIRMED 观察）

证据来源：`.rsi/evidence/gap-repro-12-2026-11-28/session-3a683cb6-before.jsonl.zstd`（4 234 274 B，2026-11-20 22:39），本小工解压只读，未改动。

命令（逐字）：

```
zstd -dc .rsi/evidence/gap-repro-12-2026-11-28/session-3a683cb6-before.jsonl.zstd | python3 -c '…按 data.runId 含 686af548 过滤并逐条打印…'
```

读数：

- 该 run 事件 62 条；`run-start` 在会话 seq 2946，`run-end` 在 3046，`stopReason: "error"`。
- 最后一个 `agent-start` 是 `seq 30`，`label: 汇总助手`，`phase: 汇总`，`childId: b156a65e…`；随后 `agent-end seq 30 outcome: failed`（3044）。
- **seq 30 之后没有任何 `agent-start`**（3044 → 3046 直接 run-end）。62 条事件里"汇总助手"只出现 1 次。
- 同 run 内仍有正常重试记录（同一任务第二次尝试会新派子任务），例如 `执行（尝试 2）` seq 17/19/21，`检查（尝试 2）` seq 22/24/26 —— 说明"重试=再派"确实发生过，只发生在 attempt 循环内。
- 交付给用户的门控回复（会话 seq 3049）状态为 **PARTIAL，4/5 已核验**；唯一失败任务是 `live-env-evidence: failed (2 attempts)`，类别 `quality: verifier verdict was fail`。2 attempts = `maxRetries(1)+1`，正是 1.3 的耗尽出口。
- 该回复的正文（`答案：…` / `Answer: …`）由交付层模板生成（`src/delivery/index.ts:801` `答案：${lead}`），**不是**汇总助手的产出——即使 seq30 死了，答案也照样成文，这也是"看起来什么都没少"的原因。
- 报告尾部（交付文本第 36–57 行，即最后约 20 行）内容是 `Failures / Incomplete / Uncertainties` 三块，逐字为：
  - `- live-env-evidence: failed (2 attempts) — Collect read-only live reproduction evidence`
  - `  incomplete (quality): verifier verdict was fail`
  - `Incomplete:` / `- live-env-evidence (quality): verifier verdict was fail` / `Uncertainties:` + 4 条 uncertainties

判断：

- **"后 20 行无补派"在报告侧是渲染事实，不是缺失证据**：这段文本是 host 侧 ledger 渲染（失败行 + 未完成 + 不确定项），本来就不含"派发"行，所以它既不能证明也不能否证补派。
- **在事件侧，确实没有补派**，且分两段原因：
  1. 失败的 `live-env-evidence` 是尝试预算耗尽（2 attempts，quality 判定）→ 1.3/1.4 的必然终态，无补派；
  2. `seq30` 汇总助手是收尾腿，失败即返回空文本 + 交付层兜底 → 1.6 的必然终态，无重发。
- 附带观察（HYPOTHESIS，非本任务范围）：同会话里多条 run 的 `run-end stopReason` 是 `error` 却仍交付了 report（本次即如此），而当前基线 `run.ts` 对非 `completed`/`cancelled` 的收尾走 `failure('Engine error', …)`。这说明该 run 运行时的代码与基线 9977211 不完全一致（该会话记录时间为 2026-11-20，基线为 2026-11-28）。**因此本条结论针对基线代码；对 686af548 的算术一致性（2 attempts、seq30 单次汇总）已用事件核实，但"run-end error 却交付"这一点不能用基线代码解释，需另案。**

## 5. 未做 / 限制

- 只读对照：未运行任何测试，未改产品代码，未 merge，未碰 live（NOT_RUN）。
- 未逐行比对 2026-11-20 当时的 `lib/` 产物与基线源码差异；仅核实了"耗尽返回 `status: 'failed'`"自首个提交 `beb55c6`（2026-10-25）即存在（`git log -S"status: 'failed', attempts: attempts" -- src/script.ts`，EXIT=0）。
- 报告尾部 20 行按交付文本行号（36–57）计；未对"20"这个阈值另作定义，若指事件流末 20 条，结论相同（末 20 条事件中无 `agent-start`）。