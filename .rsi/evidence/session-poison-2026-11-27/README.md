# 门禁 + soak 证据 — session poison (D-180) — 2026-11-27

基线 SHA: `9d63c0b7aed8d76a8bc41056c7f076087acda46f`
（分支 `fix-session-poison-events`；派单时基线 `c049388`，主代理 23:26 已合入本块成为新 HEAD `9d63c0b`；门禁三件均在新 HEAD 重跑。）
工作目录（逐字）: `/home/fish/projects_mine/dsh-grok-workflow/.agents/worktrees/fix-session-poison-events`

## 1. 三件门禁（真实执行，EXIT 均为 0）

| # | 命令（逐字，工作目录同上） | EXIT | 关键行 |
|---|---|---|---|
| tsc | `npm run typecheck` | 0 | `> tsc -p tsconfig.json --noEmit`（无错误输出），见 `typecheck.log` 尾 `TSC_EXIT:0` |
| lint | `npm run lint` | 0 | `Found 17 warnings and 0 errors. Finished in 102ms on 199 files`，见 `lint.log` 尾 `LINT_EXIT:0` |
| spec | `npx vitest run test/progress.spec.ts test/progress-tab.spec.ts test/records-redaction.spec.ts test/client.spec.ts test/command.spec.ts test/summary-outcome.spec.ts test/experience-pack.spec.ts test/guardian.spec.ts test/reliability.spec.ts test/lifecycle-disposal.spec.ts test/route-concurrency.spec.ts test/unload-drain.spec.ts test/routing.spec.ts test/checkpoint-wiring.spec.ts test/loop.spec.ts` | 0 | `Test Files 15 passed (15)` / `Tests 509 passed (509)`，见 `specs.log` 尾 `SPEC_EXIT:0` |

注：`npm run ci` 按硬约束未跑（NOT_RUN）。

## 2. 隔离 soak（结论：PASS）

- scratch home（复用同一个三态共用）: `<worktree>/.tmp/soak-poison/dsh-home`（`.gitignore:29:.tmp`，收尾删除）。
- 画像：`node scripts/clone-profile.mjs --src ~/.dsh/profiles/web --home .tmp/soak-poison/dsh-home --name web-clone --force` → `EXIT:0`（7764 files / parity 5/5 / credentials redacted 1 line）。
- 克隆内只动 soak 必需两处：删残留 `mode: triage`；`worker/verifier/guardianModel` 的 `agent2api` 路由钉到本机唯一可服务路由 `bifrost-responses / opencode-go/muse-spark-1.3-contributor`（`BIFROST_VIRTUAL_KEY` 长度 42，值不落盘）；`grok-workflow` 行 `name:` 指向本 worktree `lib/index.js`（file:// 挂载）。
- 驱动（真会话 + 真 recorder + 真 journal，无模型调用 —— 沙箱内 serve 起后被回收，见 §4 BLOCKED；三态断言走 `node .tmp/soak-drive2.mjs`，`EXIT:0`）：
  - `waiting`: `run-start count=1 ignorable=true`
  - `running`: `agent-start count=1`
  - `done`: `agent-end=1 run-end=1`
  - `poison tool-workflow/* written: 0`
  - 兼容（读侧）：9 个旧名全部 `-> plugin:grok-workflow/progress/*`（run/agent-start/agent-end/run-end/guardian-start/guardian-finding/guardian-end/summary-final/summary-rejected）
  - `journal progress events: 4, all ignorable: true, warnings: 0`
  - `SOAK PASS: waiting/running/done all on plugin channel, journal clean`
- 触及三态：waiting / running / done（三者全部覆盖；failed/cancelled 非本变更触及，不跑）。
- 模型名（脱敏后）：`bifrost-responses / opencode-go/muse-spark-1.3-contributor`；`DSH_HOME=<worktree>/.tmp/soak-poison/dsh-home`。密钥只有长度布尔值（42），无回显。

## 3. 证伪（至少一条）

- 旧通道若仍被写入即失败：`poison tool-workflow/* written: 0`（若 >0 则 FAIL）——已证伪“仍在写旧通道”。
- 若任一 progress 事件 `ignorable != true`，harness 会拒收旧会话：`all ignorable: true` ——已证伪“journal 拒收风险”。

## 4. 文件清单

- `README.md`（本文件）
- `typecheck.log`（tsc 全输出 + `TSC_EXIT:0`）
- `lint.log`（lint 全输出 + `LINT_EXIT:0`）
- `specs.log`（15 个 spec 全输出 + `SPEC_EXIT:0`）
- `soak-run.log`（三态 soak 全输出，`SOAK PASS`，EXIT 0）

## 5. NOT_RUN / BLOCKED（照实记）

- `npm run ci`：NOT_RUN（硬约束禁止）。
- 真模型端到端（headless/web 一整轮 workflow）：BLOCKED——scratch `web-clone` serve 在沙箱内启动后进程被回收（`dsh web:` 行出现一次后端口无监听，`ss` 无 3396；serve.log 仅剩 serena/mdcg 沙箱只读报错，无 dsh 侧 fatal）；改用真会话+真 recorder 的三态 soak（同 scratch home），无模型调用。live `~/.dsh` 与线上实例全程只读，未触碰。
- safari/webkit 三态截图：NOT_RUN（本块不触及浏览器三态，与 `browser-tri-states.spec.ts` 无关）。

## 6. 补记（23:34）

- 同 worktree 内发现别块产出 `test/session-poison-events.spec.ts`（untracked，非本块所写，不碰不删）：`npx vitest run test/session-poison-events.spec.ts` → `Test Files 1 passed (1)` / `Tests 3 passed (3)`，EXIT 0。该文件与本块同源（records 通道），结果一致，备查。
