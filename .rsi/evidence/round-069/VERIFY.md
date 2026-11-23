# round-069 · 保命3（重启自愈 / resume 自愈）— 验证记录

日期：2026-11-23 22:05 +08:00
宿主：worktree `.agents/worktrees/lifeline3-resume-scan`，分支 `fix/lifeline3-resume-scan`，
基线 = main `cda5d4e`（0.13.22，见 `.agents/worktrees/fix-synth-resubmit/docs/knowledge/STATE.md` 首条）。
未提交、未推送；主工作树（`/home/fish/projects_mine/dsh-grok-workflow`，detached `a6103ad`）未被触碰。

## 0. 前提核对（先查后答，`CONFIRMED`）

任务单假设「`RESUME_DECISION_WIRING.wired=false`、`runWorkflow` 不扫 checkpointDir、`/grok` 只有 on/off」。
在 main `cda5d4e` 上实测该前提**已不成立**：

- `src/checkpoint/wiring.ts`：`wired: true`、`entry: 'src/run.ts:runWorkflow'`、
  `note: 'runWorkflow scans the checkpoint directory at startup and carries a resume seed as carry-over context'`。
- `src/run.ts:718-731`：启动处真的调 `findResumableCheckpoint({ logger, sessionId })`，
  并把结果交给 `resumeCarryover(options.carryover, resumed)` 组成 carry-over。
- `test/checkpoint-wiring.spec.ts:418-424`：断言已经是 `wired === true`、`entry === 'src/run.ts:runWorkflow'`、
  `note` 不含 `no production caller`——即任务单要求的「同步断言」在 main 上已完成。
- 历史：`1591665`（resume wiring 落地）→ `2cfe4be`（把 carry-over 规则提成被测函数）。
- 原样输出见 `01-premise.txt`（`git show main:...`，非工作树读取）。

因此本条目剩余的**真实缺陷不是功能缺失，而是「wired」只被常量断言，没被行为证明**：
把 `src/run.ts` 的启动扫描整段删掉，旧套件 40/40 全绿（`02b-red-old-suite-stays-green.txt`）——
也就是说这条「重启自愈」在回归层面是裸奔的。

## 1. 改动（1 处，仅测试）

`test/checkpoint-engine-wire.spec.ts`（+186 行，新增 `describe('startup resume scan (restart self-heal)')`，4 例）：

1. 本会话 `cancelled` 断点 → 新一轮的**子代理 prompt 里出现该断点的 `unfinished` 与 seed**，
   且日志出现 `grok-workflow resume: continuing run-crashed-1`；旧断点文件 **checksum 不变**、
   目录里多出的是**新一轮自己的**文件 ⇒ 是「按记录重跑」，不是假装恢复引擎状态。
2. 本会话 `running` 且未过期（`wait` 答案）→ 不注入 seed。
3. 别的会话的 `cancelled` 断点 → 不注入 seed（不继承他人崩溃）。
4. 调用方显式 `carryover` → 压过断点 seed。

边界：真引擎（`test/engine-harness.ts`，真 `PtcWorkflowEngine` + 真脚本 VM）、真 writer、真文件；
子代理 provider 为脚本替身，**不调模型**；每例独立 `mktemp` 目录，跑完删除。
未改 `src/`、未改 `lib/`、未动 `test/checkpoint-wiring.spec.ts`（其断言在 main 上已为真）。
补丁全文：`05-change.diff`。

## 2. 红绿对照（同一条命令）

命令：`npx vitest run test/checkpoint-engine-wire.spec.ts`

- **红**：临时把 `src/run.ts` 的启动扫描改成 `const resumed = true ? undefined : await findResumableCheckpoint({...})`
  → `1 failed | 5 passed`，失败点正是 `expect(prompts).toContain(SEED_DIGEST)`（`02-red-new-test-fails.txt`）。
  同一红状态下 `npx vitest run test/checkpoint-wiring.spec.ts` = **40 passed**
  （`02b-red-old-suite-stays-green.txt`）——正好证明旧断言抓不住这个缺陷。
- **绿**：`git checkout -- src/run.ts` 复原后 → `6 passed`（`03-green.txt`）。

## 3. 门禁（`CONFIRMED`）

- `npm run typecheck` → exit 0（`tsc --noEmit`）。
- `npm run lint` → exit 0（0 errors；32 条既有 warning，来自未改动的文件）。
- `npm run build` → exit 0；`lib/` 无改动（`git status` 仅测试文件 + 本证据目录）。
- `npm run ci` → **exit 0**：87 文件 / **1660** 测试全 PASS（基线 1656，+4 为本条目新增），
  `verify:lib` byte-identical（`04-ci-full.log`，末行 `CI_EXIT=0`）。

## 4. 真机 soak

`NOT_RUN`，理由：本轮只加测试、不改任何运行时代码或产物（`src/`、`lib/` 均未变），
真机 soak 覆盖的是运行时路径，对「少一个回归」这一改动没有增量信息。
若主代理要在合并前补 soak，按 AGENTS.md 用隔离 `DSH_HOME` 副本即可，与本改动无关。

## 5. 结论

- 功能（启动扫描 + `unfinished`/seed 组成的 carry-over + `wired/entry` 置真）在 main 上已具备，本轮未重写。
- 本轮补齐的是该入口的**行为证据**：删掉启动扫描会红，且只有新加的 4 例会红。
- 未提交、未推送；改动脉络见 `05-change.diff`，分支 `fix/lifeline3-resume-scan` 指向 main `cda5d4e`。
