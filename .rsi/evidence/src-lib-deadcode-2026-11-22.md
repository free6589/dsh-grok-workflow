# src/lib 死代码与旧实现甄别报告

生成方式：脚本枚举 + 静态解析（非人工目测）。生成时间 2026-11-22。

## 0. 插件入口

| 入口 | 契约 |
|---|---|
| `src/index.ts` | package.json main/types → lib/index.js；cordis.patch.yml 行 `grok-workflow` 的 name 解析目标 |
| `src/client/index.js` | package.json exports["./client"] → lib/client.js；scripts/build-client.mjs 逐字节复制（浏览器 __ModuleLoader__ 包） |
| `src/memory/cli.ts` | 文档化 CLI 可执行面（模块头注释：`node lib/memory/cli.js recent --limit 5`）；test/memory-archive.spec.ts 导入 |

主执行路径（本任务不得破坏）：`src/run.ts` → `src/team-engine.ts` 的 `teamWorkflowEngine(ctx, logger).start(...)`，
即 AGENTS.md 所述 `ctx.workflowEngine` + 引擎 `agent()` hook 路径（`src/run.ts:876`、`src/run.ts:1340`）。

## 1. src/ 全量文件清单与引用关系

可达性根 = `src/index.ts`。`入度` 为内部 import/export 边数。

| 文件 | 行数 | 入度 | 入边（来源） | 从 src/index.ts 可达 |
|---|---:|---:|---|---|
| `src/answer.ts` | 282 | 1 | `src/gate.ts` | 是 |
| `src/carryover.ts` | 809 | 4 | `src/gate.ts`, `src/index.ts`, `src/run.ts`, `src/script.ts` | 是 |
| `src/checkpoint/schema.ts` | 919 | 3 | `src/checkpoint/wiring.ts`, `src/checkpoint/wiring.ts`, `src/checkpoint/writer.ts` | 是 |
| `src/checkpoint/wiring.ts` | 1206 | 1 | `src/run.ts` | 是 |
| `src/checkpoint/writer.ts` | 169 | 1 | `src/checkpoint/wiring.ts` | 是 |
| `src/client/index.js` | 4823 | 0 | — | 否（独立入口） |
| `src/command.ts` | 195 | 1 | `src/index.ts` | 是 |
| `src/config.ts` | 1162 | 7 | `src/checkpoint/schema.ts`, `src/gate.ts`, `src/index.ts`, `src/index.ts`, `src/run.ts`, `src/script.ts`, `src/settings.ts` | 是 |
| `src/delivery/index.ts` | 1029 | 5 | `src/answer.ts`, `src/answer.ts`, `src/gate.ts`, `src/run.ts`, `src/run.ts` | 是 |
| `src/gate.ts` | 1724 | 1 | `src/index.ts` | 是 |
| `src/guardian.ts` | 698 | 2 | `src/run.ts`, `src/run.ts` | 是 |
| `src/history.ts` | 229 | 1 | `src/gate.ts` | 是 |
| `src/index.ts` | 363 | 0 | — | 是 |
| `src/input.ts` | 172 | 6 | `src/gate.ts`, `src/index.ts`, `src/index.ts`, `src/intake.ts`, `src/report.ts`, `src/script.ts` | 是 |
| `src/intake.ts` | 201 | 2 | `src/command.ts`, `src/gate.ts` | 是 |
| `src/loop-brakes.ts` | 443 | 2 | `src/gate.ts`, `src/gate.ts` | 是 |
| `src/loop-surface.ts` | 416 | 2 | `src/index.ts`, `src/index.ts` | 是 |
| `src/loop.ts` | 807 | 7 | `src/config.ts`, `src/gate.ts`, `src/index.ts`, `src/loop-brakes.ts`, `src/loop-brakes.ts`, `src/loop-surface.ts`, `src/loop-surface.ts` | 是 |
| `src/memory/archive.ts` | 388 | 4 | `src/memory/cli.ts`, `src/memory/cli.ts`, `src/memory/recorder.ts`, `src/memory/recorder.ts` | 是 |
| `src/memory/cli.ts` | 146 | 0 | — | 否（独立入口） |
| `src/memory/recorder.ts` | 589 | 1 | `src/run.ts` | 是 |
| `src/mode-surface.ts` | 373 | 2 | `src/index.ts`, `src/index.ts` | 是 |
| `src/mode.ts` | 136 | 5 | `src/command.ts`, `src/command.ts`, `src/gate.ts`, `src/mode-surface.ts`, `src/mode-surface.ts` | 是 |
| `src/naming.ts` | 476 | 5 | `src/checkpoint/wiring.ts`, `src/run.ts`, `src/run.ts`, `src/script.ts`, `src/script.ts` | 是 |
| `src/paths.ts` | 142 | 2 | `src/checkpoint/schema.ts`, `src/input.ts` | 是 |
| `src/progress-tab.ts` | 858 | 0 | — | **否** |
| `src/records.ts` | 891 | 5 | `src/gate.ts`, `src/gate.ts`, `src/index.ts`, `src/run.ts`, `src/run.ts` | 是 |
| `src/redact.ts` | 341 | 16 | `src/carryover.ts`, `src/checkpoint/schema.ts`, `src/checkpoint/wiring.ts`, `src/gate.ts`, `src/guardian.ts`, `src/history.ts`, `src/index.ts`, `src/loop-brakes.ts`, `src/loop-surface.ts`, `src/loop.ts`, `src/memory/archive.ts`, `src/memory/recorder.ts`, `src/mode-surface.ts`, `src/records.ts`, `src/run.ts`, `src/script.ts` | 是 |
| `src/report.ts` | 966 | 2 | `src/index.ts`, `src/run.ts` | 是 |
| `src/resume/index.ts` | 12 | 0 | — | **否** |
| `src/resume/policy.ts` | 178 | 1 | `src/resume/index.ts` | **否** |
| `src/resume/validator.ts` | 373 | 3 | `src/resume/index.ts`, `src/resume/policy.ts`, `src/resume/policy.ts` | **否** |
| `src/run.ts` | 1471 | 10 | `src/gate.ts`, `src/gate.ts`, `src/guardian.ts`, `src/index.ts`, `src/index.ts`, `src/loop-brakes.ts`, `src/loop-surface.ts`, `src/loop.ts`, `src/mode-surface.ts`, `src/records.ts` | 是 |
| `src/script.ts` | 3350 | 2 | `src/report.ts`, `src/run.ts` | 是 |
| `src/settings.ts` | 381 | 1 | `src/index.ts` | 是 |
| `src/shards.ts` | 100 | 2 | `src/report.ts`, `src/script.ts` | 是 |
| `src/team-engine.ts` | 246 | 1 | `src/run.ts` | 是 |
| `src/timeout.ts` | 176 | 1 | `src/script.ts` | 是 |
| `src/triage.ts` | 1304 | 2 | `src/gate.ts`, `src/gate.ts` | 是 |
| `src/types.ts` | 459 | 18 | `src/answer.ts`, `src/checkpoint/schema.ts`, `src/checkpoint/wiring.ts`, `src/config.ts`, `src/delivery/index.ts`, `src/gate.ts`, `src/index.ts`, `src/index.ts`, `src/input.ts`, `src/loop-brakes.ts`, `src/memory/recorder.ts`, `src/naming.ts`, `src/records.ts`, `src/report.ts`, `src/report.ts`, `src/run.ts`, `src/script.ts`, `src/settings.ts` | 是 |
| `src/upstream.ts` | 178 | 1 | `src/script.ts` | 是 |
| `src/waves.ts` | 137 | 1 | `src/report.ts` | 是 |

## 2. lib/ 全量文件清单（构建产物映射）

共 165 个文件。tsc 产物由 `tsconfig.build.json`（rootDir=src → outDir=lib）决定，
`lib/client.js` 由 `scripts/build-client.mjs` 从 `src/client/index.js` 逐字节复制。

| lib 文件 | 对应 src |
|---|---|
| `lib/answer.d.ts` | `src/answer.ts` |
| `lib/answer.d.ts.map` | `src/answer.ts` |
| `lib/answer.js` | `src/answer.ts` |
| `lib/answer.js.map` | `src/answer.ts` |
| `lib/carryover.d.ts` | `src/carryover.ts` |
| `lib/carryover.d.ts.map` | `src/carryover.ts` |
| `lib/carryover.js` | `src/carryover.ts` |
| `lib/carryover.js.map` | `src/carryover.ts` |
| `lib/checkpoint/schema.d.ts` | `src/checkpoint/schema.ts` |
| `lib/checkpoint/schema.d.ts.map` | `src/checkpoint/schema.ts` |
| `lib/checkpoint/schema.js` | `src/checkpoint/schema.ts` |
| `lib/checkpoint/schema.js.map` | `src/checkpoint/schema.ts` |
| `lib/checkpoint/wiring.d.ts` | `src/checkpoint/wiring.ts` |
| `lib/checkpoint/wiring.d.ts.map` | `src/checkpoint/wiring.ts` |
| `lib/checkpoint/wiring.js` | `src/checkpoint/wiring.ts` |
| `lib/checkpoint/wiring.js.map` | `src/checkpoint/wiring.ts` |
| `lib/checkpoint/writer.d.ts` | `src/checkpoint/writer.ts` |
| `lib/checkpoint/writer.d.ts.map` | `src/checkpoint/writer.ts` |
| `lib/checkpoint/writer.js` | `src/checkpoint/writer.ts` |
| `lib/checkpoint/writer.js.map` | `src/checkpoint/writer.ts` |
| `lib/client.js` | `src/client/index.js`（build-client 复制） |
| `lib/command.d.ts` | `src/command.ts` |
| `lib/command.d.ts.map` | `src/command.ts` |
| `lib/command.js` | `src/command.ts` |
| `lib/command.js.map` | `src/command.ts` |
| `lib/config.d.ts` | `src/config.ts` |
| `lib/config.d.ts.map` | `src/config.ts` |
| `lib/config.js` | `src/config.ts` |
| `lib/config.js.map` | `src/config.ts` |
| `lib/delivery/index.d.ts` | `src/delivery/index.ts` |
| `lib/delivery/index.d.ts.map` | `src/delivery/index.ts` |
| `lib/delivery/index.js` | `src/delivery/index.ts` |
| `lib/delivery/index.js.map` | `src/delivery/index.ts` |
| `lib/gate.d.ts` | `src/gate.ts` |
| `lib/gate.d.ts.map` | `src/gate.ts` |
| `lib/gate.js` | `src/gate.ts` |
| `lib/gate.js.map` | `src/gate.ts` |
| `lib/guardian.d.ts` | `src/guardian.ts` |
| `lib/guardian.d.ts.map` | `src/guardian.ts` |
| `lib/guardian.js` | `src/guardian.ts` |
| `lib/guardian.js.map` | `src/guardian.ts` |
| `lib/history.d.ts` | `src/history.ts` |
| `lib/history.d.ts.map` | `src/history.ts` |
| `lib/history.js` | `src/history.ts` |
| `lib/history.js.map` | `src/history.ts` |
| `lib/index.d.ts` | `src/index.ts` |
| `lib/index.d.ts.map` | `src/index.ts` |
| `lib/index.js` | `src/index.ts` |
| `lib/index.js.map` | `src/index.ts` |
| `lib/input.d.ts` | `src/input.ts` |
| `lib/input.d.ts.map` | `src/input.ts` |
| `lib/input.js` | `src/input.ts` |
| `lib/input.js.map` | `src/input.ts` |
| `lib/intake.d.ts` | `src/intake.ts` |
| `lib/intake.d.ts.map` | `src/intake.ts` |
| `lib/intake.js` | `src/intake.ts` |
| `lib/intake.js.map` | `src/intake.ts` |
| `lib/loop-brakes.d.ts` | `src/loop-brakes.ts` |
| `lib/loop-brakes.d.ts.map` | `src/loop-brakes.ts` |
| `lib/loop-brakes.js` | `src/loop-brakes.ts` |
| `lib/loop-brakes.js.map` | `src/loop-brakes.ts` |
| `lib/loop-surface.d.ts` | `src/loop-surface.ts` |
| `lib/loop-surface.d.ts.map` | `src/loop-surface.ts` |
| `lib/loop-surface.js` | `src/loop-surface.ts` |
| `lib/loop-surface.js.map` | `src/loop-surface.ts` |
| `lib/loop.d.ts` | `src/loop.ts` |
| `lib/loop.d.ts.map` | `src/loop.ts` |
| `lib/loop.js` | `src/loop.ts` |
| `lib/loop.js.map` | `src/loop.ts` |
| `lib/memory/archive.d.ts` | `src/memory/archive.ts` |
| `lib/memory/archive.d.ts.map` | `src/memory/archive.ts` |
| `lib/memory/archive.js` | `src/memory/archive.ts` |
| `lib/memory/archive.js.map` | `src/memory/archive.ts` |
| `lib/memory/cli.d.ts` | `src/memory/cli.ts` |
| `lib/memory/cli.d.ts.map` | `src/memory/cli.ts` |
| `lib/memory/cli.js` | `src/memory/cli.ts` |
| `lib/memory/cli.js.map` | `src/memory/cli.ts` |
| `lib/memory/recorder.d.ts` | `src/memory/recorder.ts` |
| `lib/memory/recorder.d.ts.map` | `src/memory/recorder.ts` |
| `lib/memory/recorder.js` | `src/memory/recorder.ts` |
| `lib/memory/recorder.js.map` | `src/memory/recorder.ts` |
| `lib/mode-surface.d.ts` | `src/mode-surface.ts` |
| `lib/mode-surface.d.ts.map` | `src/mode-surface.ts` |
| `lib/mode-surface.js` | `src/mode-surface.ts` |
| `lib/mode-surface.js.map` | `src/mode-surface.ts` |
| `lib/mode.d.ts` | `src/mode.ts` |
| `lib/mode.d.ts.map` | `src/mode.ts` |
| `lib/mode.js` | `src/mode.ts` |
| `lib/mode.js.map` | `src/mode.ts` |
| `lib/naming.d.ts` | `src/naming.ts` |
| `lib/naming.d.ts.map` | `src/naming.ts` |
| `lib/naming.js` | `src/naming.ts` |
| `lib/naming.js.map` | `src/naming.ts` |
| `lib/paths.d.ts` | `src/paths.ts` |
| `lib/paths.d.ts.map` | `src/paths.ts` |
| `lib/paths.js` | `src/paths.ts` |
| `lib/paths.js.map` | `src/paths.ts` |
| `lib/progress-tab.d.ts` | `src/progress-tab.ts` |
| `lib/progress-tab.d.ts.map` | `src/progress-tab.ts` |
| `lib/progress-tab.js` | `src/progress-tab.ts` |
| `lib/progress-tab.js.map` | `src/progress-tab.ts` |
| `lib/records.d.ts` | `src/records.ts` |
| `lib/records.d.ts.map` | `src/records.ts` |
| `lib/records.js` | `src/records.ts` |
| `lib/records.js.map` | `src/records.ts` |
| `lib/redact.d.ts` | `src/redact.ts` |
| `lib/redact.d.ts.map` | `src/redact.ts` |
| `lib/redact.js` | `src/redact.ts` |
| `lib/redact.js.map` | `src/redact.ts` |
| `lib/report.d.ts` | `src/report.ts` |
| `lib/report.d.ts.map` | `src/report.ts` |
| `lib/report.js` | `src/report.ts` |
| `lib/report.js.map` | `src/report.ts` |
| `lib/resume/index.d.ts` | `src/resume/index.ts` |
| `lib/resume/index.d.ts.map` | `src/resume/index.ts` |
| `lib/resume/index.js` | `src/resume/index.ts` |
| `lib/resume/index.js.map` | `src/resume/index.ts` |
| `lib/resume/policy.d.ts` | `src/resume/policy.ts` |
| `lib/resume/policy.d.ts.map` | `src/resume/policy.ts` |
| `lib/resume/policy.js` | `src/resume/policy.ts` |
| `lib/resume/policy.js.map` | `src/resume/policy.ts` |
| `lib/resume/validator.d.ts` | `src/resume/validator.ts` |
| `lib/resume/validator.d.ts.map` | `src/resume/validator.ts` |
| `lib/resume/validator.js` | `src/resume/validator.ts` |
| `lib/resume/validator.js.map` | `src/resume/validator.ts` |
| `lib/run.d.ts` | `src/run.ts` |
| `lib/run.d.ts.map` | `src/run.ts` |
| `lib/run.js` | `src/run.ts` |
| `lib/run.js.map` | `src/run.ts` |
| `lib/script.d.ts` | `src/script.ts` |
| `lib/script.d.ts.map` | `src/script.ts` |
| `lib/script.js` | `src/script.ts` |
| `lib/script.js.map` | `src/script.ts` |
| `lib/settings.d.ts` | `src/settings.ts` |
| `lib/settings.d.ts.map` | `src/settings.ts` |
| `lib/settings.js` | `src/settings.ts` |
| `lib/settings.js.map` | `src/settings.ts` |
| `lib/shards.d.ts` | `src/shards.ts` |
| `lib/shards.d.ts.map` | `src/shards.ts` |
| `lib/shards.js` | `src/shards.ts` |
| `lib/shards.js.map` | `src/shards.ts` |
| `lib/team-engine.d.ts` | `src/team-engine.ts` |
| `lib/team-engine.d.ts.map` | `src/team-engine.ts` |
| `lib/team-engine.js` | `src/team-engine.ts` |
| `lib/team-engine.js.map` | `src/team-engine.ts` |
| `lib/timeout.d.ts` | `src/timeout.ts` |
| `lib/timeout.d.ts.map` | `src/timeout.ts` |
| `lib/timeout.js` | `src/timeout.ts` |
| `lib/timeout.js.map` | `src/timeout.ts` |
| `lib/triage.d.ts` | `src/triage.ts` |
| `lib/triage.d.ts.map` | `src/triage.ts` |
| `lib/triage.js` | `src/triage.ts` |
| `lib/triage.js.map` | `src/triage.ts` |
| `lib/types.d.ts` | `src/types.ts` |
| `lib/types.d.ts.map` | `src/types.ts` |
| `lib/types.js` | `src/types.ts` |
| `lib/types.js.map` | `src/types.ts` |
| `lib/upstream.d.ts` | `src/upstream.ts` |
| `lib/upstream.d.ts.map` | `src/upstream.ts` |
| `lib/upstream.js` | `src/upstream.ts` |
| `lib/upstream.js.map` | `src/upstream.ts` |
| `lib/waves.d.ts` | `src/waves.ts` |
| `lib/waves.d.ts.map` | `src/waves.ts` |
| `lib/waves.js` | `src/waves.ts` |
| `lib/waves.js.map` | `src/waves.ts` |

## 3. 死文件判定表

| 对象 | 引用证据 | 判定 | 理由 |
|---|---|---|---|
| `lib/panel.js` | 零引用 | **DELETE** | `git ls-files` 中自 v0.9.0 起存在；`src/panel.ts` 已于 `56e701d` 删除；`src/`、`lib/`、`scripts/`、`test/` 无任何 `panel.js` 引用；不在 `package.json exports` 内；语义被 `src/progress-tab.ts` + `src/client/index.js` 的 run 面板取代 |
| `lib/panel.d.ts` | 零引用 | **DELETE** | 同上；是 `lib/panel.js` 的类型声明，源码已不存在 |
| `lib/panel.js.map` | 零引用 | **DELETE** | 同上；是 `lib/panel.js` 的 sourcemap |
| `lib/panel.d.ts.map` | 零引用 | **DELETE** | 同上；是 `lib/panel.d.ts` 的 declaration map |
| `src/client/index.js` | 非死代码 | **KEEP** | 独立入口：`package.json exports["./client"]` → `lib/client.js`，`build-client.mjs` 逐字节复制；`test/client.spec.ts` 校验字节一致 |
| `src/memory/cli.ts` | 非死代码 | **KEEP** | 文档化 CLI 可执行面（模块头 `node lib/memory/cli.js recent --limit 5`）；`test/memory-archive.spec.ts:40` 导入；产出 `lib/memory/cli.js` |
| `src/progress-tab.ts` | 运行期零入边，但被测试钉住 | **KEEP（标记）** | `test/progress-tab.spec.ts:18` 直接导入；`test/client.spec.ts:1502-1503` 以它为基准钉住浏览器包；`src/client/index.js` 多处注释声明为其镜像实现。删除必须同改 test/，超出本任务范围 |
| `src/resume/validator.ts` | 运行期零入边，但被测试钉住 | **KEEP（标记）** | 仅 `src/resume/*` 内部与测试导入；`test/resume-validator.spec.ts`、`test/recovery-artifacts.spec.ts`、`test/recovery-kill-restart.spec.ts` 依赖。`src/checkpoint/wiring.ts:224` 明确注明 resume 决策无生产调用者（设计上未接线） |
| `src/resume/policy.ts` | 运行期零入边，但被测试钉住 | **KEEP（标记）** | 同上，由 `src/resume/index.ts` 与测试引用 |
| `src/resume/index.ts` | 运行期零入边，但被测试钉住 | **KEEP（标记）** | 同上，`src/resume/*` 的公共出口 |
| `src/naming.ts`、`src/script.ts`、`src/client/index.js` 中的 Q10(a)/Q10(b) 注释 | 非死代码 | **KEEP** | `grep Q10` 仅命中活跃文件内的行内设计注释（`naming.ts:246,257`、`script.ts:1319`、`client/index.js:2944,3036,3209,3422`），不是独立旧实现文件 |
| progress-card-q10b-* 系列 | 仅存在于 `.rsi/evidence/` | **OUT OF SCOPE** | `grep progress-card` 在 `src/`、`lib/` 内零命中；文件位于 `.rsi/evidence/progress-card-q10b-2026-11-22.{md,json,html}`，属证据区，不在本任务范围 |

## 4. 已删除列表

```
lib/panel.d.ts
lib/panel.d.ts.map
lib/panel.js
lib/panel.js.map
```

共 4 个文件，均为 `lib/` 内的陈旧编译产物，零引用、无对应源文件、有新实现替代。
`src/` 本次未删除任何文件（见第 3 节 KEEP 判定）。

## 5. 引用完整性检查结果

全部命令在 `/home/fish/projects_mine/dsh-grok-workflow` 实跑，2026-11-22。

| 检查 | 命令 | 结果 |
|---|---|---|
| 删除后原地重建，产物只应是「少了 4 个删除」 | `npm run build` 后 `git status --short lib/` | `D lib/panel.d.ts`、`D lib/panel.d.ts.map`、`D lib/panel.js`、`D lib/panel.js.map`；**无任何 modified/新增**，`panel.*` 未被重新生成 |
| lib 文件数 | `cd lib && find . -type f \| wc -l` | 165（删除前 169） |
| lib 内部模块解析 | 静态扫描 `lib/**/*.js`、`lib/**/*.d.ts` 的相对 specifier | 83 文件 / 126 个相对 specifier / **UNRESOLVED 0** |
| package.json exports 目标存在 | `main`、`types`、`exports["."]`、`exports["./client"]` | `lib/index.js`、`lib/index.d.ts`、`lib/client.js` 均存在 |
| 类型检查 | `npm run typecheck` | 退出 0 |
| Lint | `npm run lint` | 退出 0，23 个 warning、0 error（均在 `src/`、`test/`，本次未改，属既有） |
| 真实 DSH Loader 装载 `lib/index.js` 并注册 `grok_workflow` | `npx vitest run test/loader.spec.ts` | 3 passed |
| 浏览器包与源字节一致 | `npx vitest run test/client.spec.ts` | 119 passed |
| 定向回归（装载/包一致/生命周期/进度页/记忆归档/resume） | `npx vitest run` 9 个 spec | 241 passed |
| 全量回归 | `npx vitest run` | **78 files / 1449 tests passed** |

### 已知门禁盲区（未修改，超出本任务范围）

`scripts/verify-lib.mjs` 无法发现本类孤儿产物：它先把 HEAD 整棵树（含 HEAD 的 `lib/`）解包到临时目录，再把 `tsc` 输出到同一目录，
于是 HEAD 的 `lib/panel.*` 会残留在输出目录中被当作「已经产出」，双向比对因此通过——删除前 `npm run verify:lib` 报
`lib/ at c2cfbb6 is the build of src/ at c2cfbb6 (169 files, byte-identical)`，即该脚本对孤儿文件恒为绿灯。
真正的判定手段是「空 outDir 构建后与 `lib/` 双向比对」，本报告第 5 节第一行即是它的等价形式。
修 `verify-lib.mjs` 需改 `scripts/`，不在本任务允许范围，故仅记录。
