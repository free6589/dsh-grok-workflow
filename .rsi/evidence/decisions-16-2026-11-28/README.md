# decisions-16 证据包（基线快照）

- 采集时间：2026-11-28T03:31+08:00，采集者：证据小工（子代理 dec-evidence）
- worktree：`.tmp/wt-dec-16`，分支 `fix/decisions-16`
- 基线提交：`4849bdfcd9abe178a95fc1983d6a034430521468`（`docs(memory): record round15 wrap`）
- 采集时 `git status --short --branch` = `## fix/decisions-16`（干净，无改动、无未跟踪文件）
- 状态：**修复前基线快照**。第 1、2 节的行号全部取自干净的 `4849bdf`；门禁 EXIT 尚未产出，留位待填。

## 0. 行号漂移提示（重要）

采集过程中工作树被并行改动：再次 `git status` 时出现 `M docs/knowledge/DECISIONS.md`（`+3` 行，三处 `[Round16证伪]` 行）。因此直接在当前工作树上 `grep` 会得到偏移后的行号（D-017 由 `206` 变 `207`，D-033 由 `477` 变 `481` 前后）。复核一律用第 4 节的 `git show 4849bdf:…` 版本，或先确认没有未提交改动。

## 1. 三条条目（`docs/knowledge/DECISIONS.md`，基线 `4849bdf` 时共 5529 行）

| 条目 | 标题行 | 需核对的原文行 | 原文主张（摘要） |
| --- | --- | --- | --- |
| D-003 Bound concurrency and retries | `40` | `44-46` | `maxConcurrency` 默认 3、schema 上限 6；`maxRetries` 默认 1、上限 3；`maxTasks` 默认 6、上限 12；越限「必须校验失败」 |
| D-017 deadline 30 → 60 分钟 | `206` | `210` | `timeoutMs` 默认 `3_600_000`，硬上限 `86_400_000`，工具注册取 `min(timeoutMs + 60_000, 86_400_000)`，不引入自适应 |
| D-033 混合分诊默认关（本条即「triage」条） | `477` | `481-482` | 新增 `triageClassifier: rules\|hybrid`（默认 rules）+ 复用 `triageModel`，hybrid 走一次模型分诊 |

同族但仍未标注的陈旧条目（本次三条**不含**，仅登记，避免改写时漏看）：

- D-021 `251`（决策 `255` 写 `mode: 'triage' \| 'full'` 四档；`257` 判据指 `src/triage.ts`；`260` 记 `test/triage.spec.ts` 26 例）。
- D-022 `264`、D-023 `274`、D-024 `284`、D-025 `295`、D-026 `306`、D-027 `334`、D-032 `465`、D-037 `536`：全部围绕已删除的旧前台与 `src/triage.ts` / `test/triage.spec.ts`。
- D-058 `1060`：`timeoutMs` 默认 `3600000`、`0` = 不限时（D-017 之后的口径，同样已过时）。

## 2. 源码现状（基线 `4849bdf` 实测行号）

并发 / 重试 / 任务数：

- `src/config.ts:24` `maxConcurrency: 100,`（硬上限，不再是 6）
- `src/config.ts:25` `maxRetries: 3,`（仅为硬上限残留；retries 已从配置面删除）
- `src/config.ts:26` `maxTasks: 100,`（硬上限，不再是 12）
- `src/config.ts:357` `export const DEFAULT_MAX_CONCURRENCY = 10`（默认并发 10，不再是 3）
- `src/config.ts:156` `export const DEFAULT_MAX_TASKS = 10`（默认任务 10，不再是 6）
- `src/config.ts:153` `export const FIXED_MAX_RETRIES = 1`（固定 1，不可配）
- `src/config.ts:487` `'maxRetries',` 位于 `REMOVED_CONFIG_KEYS` 内（`maxRetries` 已不再接受配置）
- schema 接线：`src/config.ts:660` `maxConcurrency: clampedLimit('maxConcurrency', 1).default(DEFAULT_MAX_CONCURRENCY)…`；`src/config.ts:661` `maxTasks: clampedLimit('maxTasks', 1).default(DEFAULT_MAX_TASKS)…`；`src/config.ts:1253`/`1255` 解析相等式
- 生成脚本按值镜像：`src/script.ts:83` `Math.min(100, …, 10)`；`src/script.ts:84` `Math.min(3, …, 1)`；镜像说明注释在 `src/script.ts:73`

死线（timeout）：

- `src/config.ts:124` `export const DEFAULT_TIMEOUT_MS = 0`（默认不限时，不再是 3 600 000）
- `src/config.ts:141` `export const FIXED_TIMEOUT_MS = DEFAULT_TIMEOUT_MS`
- `src/config.ts:662` `timeoutMs: z.natural().min(0).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_TIMEOUT_MS)…`（上限是 `MAX_SAFE_INTEGER`，不再是 `86_400_000`）

triage / 旧前台：

- `src/triage.ts` **不存在**；`test/triage.spec.ts` **不存在**（`ls` 两者均 `No such file or directory`，EXIT=2）
- `grep -rn 'classifyTriage' src` 零命中（EXIT=1，无匹配）
- `src/config.ts:477-480` `'triageAsk'` / `'triageModel'` / `'triageClassifier'` / `'triageFollowupAsFast'` 与 `src/config.ts:495` `'mode'` 均在 `REMOVED_CONFIG_KEYS`；表头注释 `src/config.ts:460-470` 说明 `mode`/`legacyGate` 随 M3.3 删旧前台一起移除
- `src/mode.ts:33-38` `workflowMode?: 'full' | 'triage'`，注释写明 `triage` 是 M3.3 已删除的旧前台形状，仅为让旧记录仍通过校验而保留该取值

## 3. 门禁（两条命令；修复提交后填 EXIT，当前未跑）

```
npm run typecheck
npm run lint
```

- `npm run typecheck`（= `tsc -p tsconfig.json --noEmit`）— EXIT：待填（NOT_RUN）
- `npm run lint`（= `oxlint src test`）— EXIT：待填（NOT_RUN）
- 全量 `npm run ci` 按约束**未跑**；任何人不得据此声明 CI 通过。

## 4. 复核命令（逐字可跑，均在 worktree 根执行）

漂移安全版（钉在基线提交上，不受工作树改动影响）：

```
git rev-parse HEAD
git show 4849bdf:docs/knowledge/DECISIONS.md | grep -n '^## D-003\|^## D-017\|^## D-033'
git show 4849bdf:docs/knowledge/DECISIONS.md | grep -n 'schema-capped at 6\|capped at 12'
git show 4849bdf:docs/knowledge/DECISIONS.md | grep -n '默认值改为'
git show 4849bdf:docs/knowledge/DECISIONS.md | grep -n '新增 `triageClassifier: rules|hybrid`'
```

源码现状（与提交无关，直接读工作树）：

```
grep -n 'maxConcurrency: 100,\|maxRetries: 3,\|maxTasks: 100,' src/config.ts
grep -n 'DEFAULT_TIMEOUT_MS = 0\|FIXED_TIMEOUT_MS = DEFAULT_TIMEOUT_MS\|FIXED_MAX_RETRIES = 1\|DEFAULT_MAX_CONCURRENCY = 10\|DEFAULT_MAX_TASKS = 10' src/config.ts
grep -n 'maxRetries' src/config.ts | head -5
grep -n 'maxConcurrency = Math.max\|maxRetries = Math.max' src/script.ts
grep -n "'mode'\|'triageClassifier'" src/config.ts
grep -rn 'classifyTriage' src
ls src/triage.ts test/triage.spec.ts
```

预期：第一条给出 `4849bdf…`；基线条目行号 `40` / `206` / `477`，`44` / `46` / `210`，D-033 决策在 `481`；配置读出 `100/3/100`、`124` 的 `0`、`141`、`153`、`156`、`357`；`maxRetries` 命中 `487`（在 `REMOVED_CONFIG_KEYS` 内）；脚本镜像 `83/84`；`'mode'` 命中 `495`、`'triageClassifier'` 命中 `479`；`classifyTriage` 零命中（EXIT=1）；最后一条 `ls` 两次 `No such file or directory`（EXIT=2）。

## 5. 边界与未做

- 本目录是本次唯一写入点；未修改 `DECISIONS.md`、源码、测试或任何记忆文件。
- 未执行 merge / push / rebase / 全量 CI，未触碰主检出、其他分支与 live profile。
- 未做（NOT_RUN）：门禁两条命令、任何真机 soak。
- 采集时 HEAD 仍等于基线 `4849bdf`，第 2 节描述的是**待改前的实际代码**，不是修复后的预期；本 README 不对修复结果作任何断言。
- 第 0 节所述的 `M docs/knowledge/DECISIONS.md` 是并行代理的在途改动，本证据包不采信其内容，只记录它造成的行号漂移。