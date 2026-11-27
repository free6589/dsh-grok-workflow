# patch-verify — 最小补派逻辑验证（红→绿，仅逻辑）

- 工作目录（worktree）：`/home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-gap-12`
- 分支：`fix/gap-repro-12`（`git branch --show-current` 实测）
- 基线 SHA：`9977211f71db8c6afec8d137b1dd6a5ea33967d1`（`git rev-parse HEAD` 实测，EXIT=0）
- 采集时间：2026-11-28T02:50+08:00（Asia/Singapore）
- 草稿脚本：本目录 `patch-draft.js`
- 运行时：node `v26.8.1`

## 0. 前提：耗尽路径是我自己读源码确认的

逻辑小工的结论**没有传到我这里**（我只收到任务书，未收到其报告）。因此我按任务书授权
**自己独立读源码**判定，不转述任何人的结论：

**路径一 · 任务行** `src/script.ts:4018-4346`（`runTaskUnsafe`）：

- 尝试循环 `for (let attempt = 1; attempt <= maxAttempts; attempt++)`，`maxAttempts = maxRetries + 1`（L4014）。
- 通过：`return { status: 'verified', ... }`（L4332-4334）。
- 设置类故障：`break` 提前离开循环（L4338-4343），注释写明「A setup fault repeats by definition」。
- 循环自然耗尽：`return { task: task, status: 'failed', attempts: attempts, error: lastError, failure: lastFailure }`（L4346）。

**路径二 · 汇总腿**（复现里真正失败的那条）`src/script.ts:4668-4730`（layered）与 `L4755-4800`（plain）：

- 草稿上限 `SUMMARY_MAX_ATTEMPTS = 3`（L38）。
- 耗尽：`if (drafts >= SUMMARY_MAX_ATTEMPTS) break;` —— layered 在 **L4682**，plain 在 **L4768**。
- layered 耗尽后仍有确定性叙述兜底；plain 耗尽且全稿被拒则 `synthesisError = 'polish rejected by the summary gate after N draft(s) ...'`（L4791-4795），**没有任何东西被交付**。

**结论（CONFIRMED，源码直读）**：这两处的 `return` / `break` 就是耗尽后的全部去向。
没有第二派，没有备用队列，没有「需人工」标记。任务行只以 `failed` 进报告，在 `incomplete`
摘要里留一条原因（L2602-2605）。**耗尽即终结，无补派** —— 这就是 gap-12 的洞。

### 与同目录复现证据的交叉核对

本证据目录里另一位小工已留下复现件（`repro-seqs.md`、`window-lines-3045-3072.txt`），
我**读取但未复跑**，如实转录其读数，不代编：

- run `686af548` / task 30「汇总助手」：`agent-start`（seq 3043，phase 汇总）→ `agent-end outcome=failed`（seq 3044）
  → `run-end stopReason=error`（seq 3046）→ `delivery outcome=partial`（seq 3047），**中间 20 行内无任何重派**。
- 即真实缺口发生在**汇总腿**，不是普通任务行。因此我的规则必须同时覆盖两条路径，
  用例 C6 就是照这条真实事件构造的输入。

## 1. 补派规则描述（5 行内）

1. 只有**终结为 failed** 的有界单元是补派候选；`verified` / `delivered-fallback` / `blocked` / `stopped` 已终结，不动。
2. 失败类别为 setup/配置类（`budget-exhausted`、`category === 'configuration'`）不补派，直接标需人工。
3. 已补派满 1 次（`redispatchCount >= 1`）不再补派，改标需人工 —— 补派有界，不成环。
4. 其余耗尽单元：把**同一条腿**（task / synthesize）补派**一次**到备用队列。
5. 补派记录随单元落 `redispatchCount`，无记录视作 0；判据只看单元自身，不依赖循环外状态。

## 2. 红→绿证据（逐字命令 + 结果）

### 2.1 绿：候选规则跑 7 个用例 + 有界性

逐字命令（worktree 根目录）：

```sh
node .rsi/evidence/gap-repro-12-2026-11-28/patch-draft.js
```

EXIT=0，RESULT: PASS。逐字输出：

```text
MODE: CANDIDATE (the proposed rule)

CASE C1-task-row-should-redispatch — task leg: bounded retry exhausted, infrastructure failure, never re-dispatched
  input      : leg=task status=failed failure=timeout/infrastructure redispatchCount=0
  BASELINE   : action=none  (current source: the bounded loop ends and the unit is finished, never re-sent)
  CANDIDATE : action=redispatch  (task leg exhausted with a retryable failure (timeout/infrastructure); one re-dispatch to the spare queue)
  expected   : redispatch  => PASS

CASE C2-no-action-success — task leg: verified on attempt 1 (success row)
  input      : leg=task status=verified failure=none redispatchCount=0
  BASELINE   : action=none  (current source: the bounded loop ends and the unit is finished, never re-sent)
  CANDIDATE : action=none  (unit is verified: already settled, no bounded budget was exhausted)
  expected   : none  => PASS

CASE C3-no-second-redispatch — task leg: exhausted again AFTER the one re-dispatch was already spent
  input      : leg=task status=failed failure=server-error/infrastructure redispatchCount=1
  BASELINE   : action=none  (current source: the bounded loop ends and the unit is finished, never re-sent)
  CANDIDATE : action=mark-manual  (already re-dispatched 1 time(s); bounded, hand to a human)
  expected   : mark-manual  => PASS

CASE C4-no-redispatch-on-setup — task leg: exhausted by a configuration fault (budget cap), never re-dispatched
  input      : leg=task status=failed failure=budget-exhausted/configuration redispatchCount=0
  BASELINE   : action=none  (current source: the bounded loop ends and the unit is finished, never re-sent)
  CANDIDATE : action=mark-manual  (setup/configuration fault (budget-exhausted): a re-dispatch would burn budget on a broken setup)
  expected   : mark-manual  => PASS

CASE C5-no-action-blocked — task leg: upstream did not verify, so this task never ran (no retry spent)
  input      : leg=task status=blocked failure=none redispatchCount=0
  BASELINE   : action=none  (current source: the bounded loop ends and the unit is finished, never re-sent)
  CANDIDATE : action=none  (unit is blocked: already settled, no bounded budget was exhausted)
  expected   : none  => PASS

CASE C6-OBSERVED-synth-leg-should-redispatch — synthesize leg, exactly the shape run 686af548 seq 3044 recorded: 3/3 drafts spent, outcome failed, then run-end error + delivery partial
  input      : leg=synthesize status=failed failure=task-failed/quality redispatchCount=0
  BASELINE   : action=none  (current source: the bounded loop ends and the unit is finished, never re-sent)
  CANDIDATE : action=redispatch  (synthesize leg exhausted with a retryable failure (task-failed/quality); one re-dispatch to the spare queue)
  expected   : redispatch  => PASS

CASE C7-no-action-layered-fallback — synthesize leg, layered policy: every draft was rejected but the deterministic narrative shipped — the unit did deliver
  input      : leg=synthesize status=delivered-fallback failure=none redispatchCount=0
  BASELINE   : action=none  (current source: the bounded loop ends and the unit is finished, never re-sent)
  CANDIDATE : action=none  (unit is delivered-fallback: already settled, no bounded budget was exhausted)
  expected   : none  => PASS

BOUNDEDNESS: round 1 -> redispatch | round 2 -> mark-manual  => PASS (terminal after exactly one re-dispatch)

SUMMARY: 7/7 cases PASS
RESULT: PASS
```

红输入 → 绿输出：

- **C1**（任务行耗尽、infra 失败、从未补派）：基线 `none` → 候选 `redispatch`。
- **C6**（真实观测的汇总腿形状，3/3 稿耗尽、outcome failed、随后 run-end error + delivery partial）：基线 `none` → 候选 `redispatch`。

### 2.2 红：把候选换成基线，同一 harness 必须变红

若 harness 测什么都绿，上面那条绿就不算证据。逐字命令：

```sh
node .rsi/evidence/gap-repro-12-2026-11-28/patch-draft.js --falsify
```

EXIT=1（预期失败，不是脚本故障）。逐字输出（每例 BASELINE 行与 2.1 相同，下面保留判定行）：

```text
MODE: FALSIFY (baseline only — must go RED on C1 and C6)

CASE C1-task-row-should-redispatch ...
  UNDER TEST : action=none  (baseline has no rule, so nothing is decided)
  expected   : redispatch  => FAIL

CASE C2-no-action-success ...
  UNDER TEST : action=none  (baseline has no rule, so nothing is decided)
  expected   : none  => PASS

CASE C3-no-second-redispatch ...
  UNDER TEST : action=none  (baseline has no rule, so nothing is decided)
  expected   : mark-manual  => FAIL

CASE C4-no-redispatch-on-setup ...
  UNDER TEST : action=none  (baseline has no rule, so nothing is decided)
  expected   : mark-manual  => FAIL

CASE C5-no-action-blocked ...
  UNDER TEST : action=none  (baseline has no rule, so nothing is decided)
  expected   : none  => PASS

CASE C6-OBSERVED-synth-leg-should-redispatch ...
  UNDER TEST : action=none  (baseline has no rule, so nothing is decided)
  expected   : redispatch  => FAIL

CASE C7-no-action-layered-fallback ...
  UNDER TEST : action=none  (baseline has no rule, so nothing is decided)
  expected   : none  => PASS

BOUNDEDNESS: round 1 -> none  => RED (never re-dispatches at all — this is the gap)

SUMMARY: 3/7 cases PASS, boundedness FAIL
RESULT: FAIL
```

读数：基线在 4 个「应补派 / 应标人工」的用例上全红（C1、C3、C4、C6），
而在 3 个「不该动手」的用例上保持绿（C2 成功、C5 blocked、C7 已交付兜底）。
说明绿的判定是真判出来的，不是构造出来的。

### 2.3 用例覆盖

| 用例 | 输入 | 基线 | 候选 | 期望 |
| --- | --- | --- | --- | --- |
| C1 应补派（任务行） | task / failed / timeout·infra / 0 次 | none（洞） | redispatch | redispatch |
| C2 不应补派（成功） | task / verified | none | none | none |
| C3 不应二次补派 | task / failed / 已补派 1 次 | none | mark-manual | mark-manual |
| C4 不应补派（配置类） | task / failed / budget-exhausted·configuration | none | mark-manual | mark-manual |
| C5 不应动作（未跑过） | task / blocked（上游未过，未花重试） | none | none | none |
| **C6 应补派（真实形状）** | synthesize / failed / task-failed·quality / 0 次 | none（洞） | redispatch | redispatch |
| C7 不应动作（已交付） | synthesize / delivered-fallback | none | none | none |

## 3. 明确声明

- 本补丁**未合入源码**：`src/`、`lib/`、`test/` 零改动（`git diff --stat -- src/ lib/ test/` 无输出）。
- 未 merge、未切分支、未碰 live 实例、未重启任何服务、未写任何产品代码到 `src/`。
- 全部落盘只有本证据目录（`git status --short --branch` 只显示 `?? .rsi/evidence/gap-repro-12-2026-11-28/`）。
- 验证方式是内存/草稿脚本：纯函数裁决 + 状态机推演，不加载插件、不跑 workflow 引擎、不调模型。
- 结论等级：候选规则的**判定正确性与有界性 = CONFIRMED（草稿级）**；
  「接进 `runTaskUnsafe` L4346 与汇总腿 L4682/L4768 之后的真实行为」= **NOT_RUN**（超出本小工授权）。

## 4. 未做（NOT_RUN）

- 未把规则接到 L4346、L4682、L4768 任何一处（不许写产品代码）。
- 未验证「备用队列 / 补派入口」在插件里是否已存在：规则只规定判定，入口由调用方提供，
  该入口是否存在 **未查**（不在逻辑验证范围）。
- 未跑 `npm run typecheck` 或测试套件：没有源码改动，跑了也不证明任何事。
