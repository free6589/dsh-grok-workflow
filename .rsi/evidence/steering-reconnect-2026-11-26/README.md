# 跑中插话接线（`fix/steering-reconnect`）证据 — 2026-11-26

分支 `fix/steering-reconnect` 从 `main` 尖端 **`237cf2d`** 开出；产品提交 **`a4753fe`**
`fix(steering): a run opens its own live channel again`（5 个 `src/` 文件 + `test/replan.spec.ts` + 重建的 `lib/` + `CHANGELOG`）。
这一轮要回答的问题只有一个：**M3.3 删掉前台时一起删掉的 `openSteering()` 接线，接回去以后在真机上是不是真的活了。**

结论先说：**接回去了，而且真机上真的跑了边界** —— 一次真模型运行里，3 个波的计划在两道边界上各叫了一次边界规划子代理，
两个子代理都用这一轮新铸的令牌 `steer-mwwe62zr-1` 调了 `grok_replan_intents`（见 `soak/boundary-calls.txt`）。
**但"跑中把话排进活计划"这一步在今天的形状里仍然没有活的调用方**：`grok_workflow` 是同步工具调用，调用它的那一轮被占着，
中途发出的消息被 GUI 排队、这一轮结束后才被处理（`soak/s4-steer-midrun.*`）。这条边界写进了 `D-161` 的 Consequences，
不是这一轮能靠改接线解决的。

## 1. 门禁（block 内只跑轻的，全量留给发版）

| 命令 | 结果 | 转录 |
| --- | --- | --- |
| `npx tsc -p tsconfig.json --noEmit` | `EXIT=0`（无输出） | `gate-typecheck.out` |
| `npx oxlint src test` | `Found 15 warnings and 0 errors.` / `182 files` / `EXIT=0`（与基线同数） | `gate-lint.out` |
| `TMPDIR=$PWD/.tmp npx vitest run test/replan.spec.ts test/block-tools.spec.ts test/lifecycle-disposal.spec.ts test/progress.spec.ts test/checkpoint-engine-wire.spec.ts test/plugin-lifecycle.spec.ts` | `Test Files 6 passed (6)` / `Tests 98 passed (98)` / `EXIT=0` | `gate-specs.out` |
| `TMPDIR=$PWD/.tmp npm run build` | `client bundle: 348559 bytes → lib/client.js`、`EXIT=0` | `gate-build-verifylib.out` |
| `node scripts/verify-lib.mjs` | `lib/ at a4753fe is the build of src/ at a4753fe (285 files, byte-identical)`、`EXIT=0` | 同上 |
| 全量 `npm run ci` | **`NOT_RUN`**（`AGENTS.md` §12：块内不跑全量，发版提交上跑） | — |
| 文档守卫（`CHANGELOG` 被改） | `TMPDIR=$PWD/.tmp npx vitest run test/docs-config-keys.spec.ts test/docs-version.spec.ts test/i18n-parity.spec.ts test/docs-architecture-version.spec.ts test/update-entry.spec.ts test/update-surface.spec.ts` | `Test Files 6 passed (6)` / `Tests 82 passed (82)` / `EXIT=0`，`gate-docs-guards.out` |

单文件读数：`test/replan.spec.ts` **17 → 21** 条（+4：三条接线 + 一条「只关自己那格」）；spec 文件数 **102 → 102**。
全量用例数按 `237cf2d` 的 **1923** 推 **1927**，**`HYPOTHESIS`**（这一遍没跑全量）。

## 2. 红（先看它能红）

`red-before-fix.out`：把 `src/` 单独 stash 回 `main` 的样子、只留新 spec，跑 `test/replan.spec.ts` →
**`2 failed | 19 passed`**，红在第一条接线用例的 `replan` 字段（`Expected: {enabled:true, token:Any<String>, tool:"grok_replan_intents"}` / `Received: undefined`）。
第三条「开关关掉就没有通道」两边都是绿的——它断言的是"没有"，这正是它应该的样子。

## 3. 真机（隔离档案、真模型、只跑改到的那一态）

- **档案**：从 live web 档案 **复制**（`~/.dsh/profiles/web` → `<scratch>/home/profiles/steer`，97 MB），
  `DSH_HOME=<scratch>`、端口 **3399**、`--host 127.0.0.1`；live 的 3080 全程没碰（见 §6 红线）。
- **装的是这一轮的包**：`npm pack` 出的 `dsh-grok-workflow-0.13.40.tgz`（976512 字节），`dsh plugin --profile steer add`；
  装完 `lib/steering.js` 的 `sha256` 与工作树**逐字节相同**（`a6c10bbc…0179`），版本读回 `0.13.40`，
  `lib/steering.js` 里 `closeSteering` 命中 1 次；档案原本的 21 个 bundle 一个没丢。
- **激活**：boot 只多出 MCP 侧因"家目录只读"起的报错（serena / mdcg / phone，与本插件无关），
  `dsh web: http://127.0.0.1:3399/?token=…` 正常；会话里 `grok_*` 工具在工具清单里可见（`soak/session-progress.txt` 同源的 session 日志里
  有 `grok_replan_intents` 的完整定义）。
- **那一次运行**（`soak/session-progress.txt` 是它的进度行原样抽取）：
  `run-start` → `规划（第1次）` → `执行/检查/复核`（任务 1，两次尝试）→ **`规划（第2次）` `phase: 规划 · 波 1 边界`**
  → **`规划（第3次）` `phase: 规划 · 波 2 边界`** → `汇总·第1稿`。runId `3c513728-7c0a-4027-ae18-d5a30f1aae63`。
  **两条边界腿是这一轮新行为的直接读数**：修之前 `args` 里没有 `replan`，脚本的 `replanChannel` 是 null，边界根本不会发生。
- **边界子真的调了拉取工具**：`soak/boundary-calls.txt` —— 两个边界子（各自是一个独立 session）分别记到
  `"name":"grok_replan_intents","arguments":"{\"token\":\"steer-mwwe62zr-1\"}"`，标签分别是 `规划（第2次）` / `规划（第3次）`。
  令牌形如 `steer-<base36>-<n>`，正是 `mintSteeringToken()` 铸的形状。
- **`grok_steer` 的两句话**（`soak/s5-steer-after.txt`、`soak/s4-steer-midrun.txt`）：
  运行结束后再排要求 → 「这一块现在没有在跑的 workflow，没有可投递的边界；等它跑起来再发，或者直接改要求。」
  ——这就是 `queue === undefined` 的那条分支，说明队列**随 run 关掉了**，没有被下一次运行接手。
- **中途插话实测**：运行中发出那条消息时，GUI 不发送、而是提示 `Cmd/Ctrl+Enter 插话发送全部排队消息`（`soak/s4-steer-midrun.png`、
  `soak/s4-steer-midrun.delta.txt`），模型是在这一轮**结束之后**才看到它的。这就是 `D-161` 记下的那条边界。
- **这次运行本身 FAILED，原因是环境不是接线**：子代理的沙箱里 `/home` 是只读挂载（`btrfs ro`），
  `printf > .tmp/soak-steer-note.md` 直接 `Read-only file system`，两次尝试都用尽，路线而 `s2/s3` 未启动。
  计划、波次、依赖链、边界、汇总都按设计跑完了；没落地的是文件写入。这一条与本轮改动无关，但**照实记**：
  这一轮的真机读数里没有一次 `completed` 的 run。

## 4. 这一轮没证明的（`NOT_RUN` / 边界）

- **一次成功的跑中并入（`plan.replans` 里出现 `applied`）**：`NOT_RUN`，而且是**形状上做不到**——见 §3 最后一条与 `D-161`。
  边界拉取这条路本身已在真机上验证（两个边界子都调了工具，拿到的是空队列 → `none`）。
- **接口层的 `grok_steer` 在跑中成功排队**：`NOT_RUN`（同上，需要一个"不与运行同轮"的调用方）。
- 全量 `npm run ci`：`NOT_RUN`（§12）。
- 发版 / 打 tag / 合 `main` / push：**没做**（派单没要求）。

## 5. 文件清单

| 文件 | 是什么 |
| --- | --- |
| `gate-typecheck.out` / `gate-lint.out` / `gate-specs.out` / `gate-build-verifylib.out` / `gate-docs-guards.out` | §1 那几条命令的逐字转录（含 `EXIT=`） |
| `red-before-fix.out` | §2 的红：只留新 spec、把 `src/` 退回 `main` 后的 `2 failed / 19 passed` |
| `soak/plan.json` | 驱动脚本的 12 步计划（含中途插话那一步，标 `optional` 以免把它当成前置条件） |
| `soak/drive.mjs` / `soak/chrome.sh` | 复用的 CDP 取证装置（在上一轮 `full-escape-2026-11-24` 的装置上加了 `settle` / `clicktext` / `optional send` 三个步骤类型） |
| `soak/*.txt` / `soak/*.png` | 每一步的逐字转录与截图（`s0` 开 grok 模式、`s1` 预览、`s2` 起块、`s3` 跑、`s4` 跑中插话、`s5` 跑后排要求、`s6` 收尾） |
| `soak/session-progress.txt` | 那次运行的 `tool-workflow/*` 进度行，原样从 session 日志（zstd jsonl）抽出 |
| `soak/boundary-calls.txt` | 两个边界子各自的 `grok_replan_intents` 调用记录与标签 |

## 6. 红线（实测，不是声明）

- `~/.dsh` mtime **`2026-11-25 23:14:14`**、`~/.dsh/profiles` **`2026-11-22 16:59:46`**、
  `~/.dsh/profiles/web` 与它里面的 `cordis.patch.yml` **`2026-11-25 23:04:40`**、`.credentials.yaml` **`2026-11-14 22:47`**
  —— 全都在本会话（01:00 起）之前，本轮只读它们。
- 写探测 `: > ~/.dsh/.soak-probe` → **`Read-only file system`**（没有落盘）。
- live 实例（`100.111.111.88:3080`）前后都是 **401**，没有重启、没有重载、没有 kill。
- scratch 档案（`<scratch>/.tmp/soak-steer`，105 MB + 一份 97 MB 档案副本）用完删除，不在树里留证据以外的产物。
