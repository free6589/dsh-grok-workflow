# 边界子的已沉淀行（`fix/settled-rows`）证据 — 2026-11-26

分支 **`fix/settled-rows`**，从 `main` 尖端 **`d6c338e`** 开出（worktree `.tmp/wt-settled-rows`）。
本轮修的是上一轮 `fix/replan-shape` 在真机上照实记下的那条观察：边界子提示词里 `SETTLED TASKS` 每一行读作
`- count-agents [undefined] `——脚本把「编号 → 状态」的纯字符串表交给 `requestReplan`，而 `replanPrompt`
按 `row.status` / `row.task.title` 读。

## 1. 改了什么（`CONFIRMED`）

| 文件 | 改动 |
| --- | --- |
| `src/script.ts` | 调用点改成交**结算行本身**（`requestReplan(w, remaining, settled, version)`，那一份 `statuses` 投影删掉）；`requestReplan` 形参改名 `settledRows` 并注明形状，原样传给 `replanPrompt`；给 `mergeReplan` 的状态改在同处**从同一批行派生**（`settledStatuses`）。`replanPrompt` 的渲染一行没改，`src/replan.ts` 一个字没动。 |
| `test/replan.spec.ts` | 新增 1 例（`runReal`，真引擎 + 孪生 + 生成的脚本，模型脚本化）：边界子提示词那一行读作 `- a [verified] Task a`，整份提示词不含 `undefined`。 |
| `lib/` | `npm run build` 重建：`script.js`、`script.js.map`、`script.d.ts.map`。`lib/script.js` **265049 字节**、`sha256 233d327e…2e22`。`client bundle: 348559 bytes`（浏览器包没动）。 |
| `CHANGELOG.md` | `[Unreleased]` 一条（英/中 + 升级须知）。 |

## 2. 红 → 绿（`CONFIRMED`）

- **红（先写用例、后修；不是事后 stash 造出来的）**：写到一半先跑新用例，`git stash push -- src` 把源码退回
  `d6c338e` 的那一版再跑 → **`1 failed | 24 skipped`**，读作 `expected '- a [undefined] ' to be '- a [verified] Task a'`
  （`red-before-fix.out`，`RED_EXIT=1`）。这就是真机上的原样症状，一个字符不差。
- **绿**：恢复后整份 `test/replan.spec.ts` **25 passed**；`naming-sequence` + `steering-inbox` 一起
  **`3 files / 45 tests` passed**（`gate-specs.out`）。

## 3. 块内门禁（`AGENTS.md` §12：全量留给发版）

| 命令 | 结果 | 转录 |
| --- | --- | --- |
| `npx tsc -p tsconfig.json --noEmit` | `TSC_EXIT=0`（无输出） | `gate-typecheck.out` |
| `npx oxlint src test` | `Found 15 warnings and 0 errors.` / `Finished in 122ms on 184 files with 96 rules` / `LINT_EXIT=0` | `gate-lint.out` |
| `TMPDIR=$PWD/.tmp npx vitest run test/replan.spec.ts test/naming-sequence.spec.ts test/steering-inbox.spec.ts` | `Test Files 3 passed (3)` / `Tests 45 passed (45)` / `SPECS_EXIT=0` | `gate-specs.out` |
| `TMPDIR=$PWD/.tmp npm run build` | `client bundle: 348559 bytes → lib/client.js` / `BUILD_EXIT=0` | `gate-build.out` |
| `TMPDIR=$PWD/.tmp npx vitest run test/update-entry.spec.ts test/update-surface.spec.ts test/docs-config-keys.spec.ts test/docs-version.spec.ts test/i18n-parity.spec.ts test/docs-architecture-version.spec.ts` | 写完 `CHANGELOG` 之后跑六份文档守卫 | `Test Files 6 passed (6)` / `Tests 82 passed (82)` / `GUARDS_EXIT=0` | `gate-docs-guards.out` |
| `npm run ci`（全量） | **`NOT_RUN`**（§12：发版提交上跑一遍） | — |

`verify:lib` 比对的是 `HEAD` 的 `src/`↔`lib/`，未提交时跑它只证明基线那一对没动，所以**在本轮这里 `NOT_RUN`**，
按要求由产品提交之后的那一遍覆盖（本文件写的是提交里的 `lib/` 就是提交里的 `src/` 的构建：`lib/script.js`
与 `src/script.ts` 的对应关系由 `npm run build` 生成、`git status` 只显示这两个构建产物 + 两个源文件）。

## 4. 真机（`CONFIRMED`，隔离档案、真模型、只跑改到的那一态）

- **档案**：`node scripts/clone-profile.mjs --src ~/.dsh/profiles/web --home .tmp/soak/dsh-home --name settled-clone`
  （`soak/clone-report.txt`：`parity 5/5 equal after redaction`、`dependencies 17 declared, 0 unresolved`、
  `credentials redacted: 1 line(s) in 1 file(s)`）。**只改了 soak 需要的东西**：删掉残留的 `mode: triage`，
  `agent-default-model` 与五个角色 + `guardianModel` 全部钉到
  `bifrost-responses / opencode-go/muse-spark-1.3-contributor`（本机 shell 有 `BIFROST_VIRTUAL_KEY`、没有
  `AGENT2API_API_KEY`；密钥只走进程环境，没有拷进 scratch、没有落盘）。
- **装的是本轮的包**：`npm pack` 出 `dsh-grok-workflow-0.13.44.tgz`，`dsh plugin --profile settled-clone add file:…`；
  `dsh plugin --profile settled-clone list` 读回 **`dsh-grok-workflow@0.13.44`**，装好的 `lib/script.js`
  与工作树**逐字节同哈希**（两边都是 **`233d327e510490234b08e916cd5e57af8ae80d01a4fbf48517bd6599accc2e22`**、
  **265049 字节**，`soak/installed-lib-sha256.txt`）。
- **实例**：`DSH_HOME=… dsh --profile settled-clone --port 3487 --host 127.0.0.1 --no-open`（live 3080 全程没碰）。
- **装置**：headless Chromium（`/usr/bin/chromium --remote-debugging-port=9223`）+ 上一轮那份 CDP 驱动
  （`drive.mjs`，本轮原样复用；步骤表 `fresh → 点「默认工作区」→ 发一句话 → settle → snapshot`）。
  发的那句话让模型**不传 `tasks`**、直接调 `grok_workflow` 跑三波（第二步依赖第一步、第三步依赖第二步）。
- **这一次的读数**：

| 读数 | 值 | 出处 |
| --- | --- | --- |
| 运行结果 | `tool/call` seq 19 `grok_workflow`；`run-end stopReason completed`；`tool/result` 读作 `Plan: planner; 3 task(s); 3 verified`、`3/3` 三波全 verified | `soak/root-tool-and-result.txt` |
| 边界 1（`规划（第2次）`） | `BOUNDARY: wave 1 has settled; 2 wave(s) have not started.` / `- count_readme [verified] 统计 README.md 行数` | `soak/boundary-settled-lines.txt` |
| 边界 2（`规划（第3次）`） | `BOUNDARY: wave 2 has settled; 1 wave(s) have not started.` / `- count_readme [verified] 统计 README.md 行数` / `- count_changelog [verified] 统计 CHANGELOG.md 行数` | 同上 |
| `undefined` | 两份边界提示词里 **都不出现**（`undefined anywhere in this prompt: False`） | 同上 |
| 界面 | 完成态读作「已完成，用时 5分40秒」+ `Wave 1/3 … verified / Wave 2/3 … verified / Wave 3/3 … verified` | `soak/done-transcript.txt` |

判据对上了：**每行都是 `[verified]` + 计划给它的标题**，而不是 `[undefined] `。这两道边界都是 `none`（没有新要求并入），
所以本轮真机只证明**提示词**这一态；合并路径由单测覆盖。

## 5. 这一轮没做的（`NOT_RUN` / 边界）

- 全量 `npm run ci`：**`NOT_RUN`**（§12，留给发版提交）。
- 真机上的「合并被拒 / 补丁式编辑」两态：**没跑**——本轮只跑「两波边界、都 `none`」这一态；
  合并器契约一个字没改，`test/replan.spec.ts` 的合并 API 与脚本级用例覆盖。
- `SETTLED TASKS` 的 `- none` 分支：**没在真机上出现**（要有边界而一个任务都没沉淀才看得到）。
- 合 `main`、push、打 tag、发版、live 档案升级：**都没做**（派单没要求；live 档案在本会话里是只读的）。

## 6. 红线（实测，不是声明）

- `~/.dsh` **`2026-11-25 23:14:14`**、`~/.dsh/profiles` **`2026-11-22 16:59:46`**、`~/.dsh/profiles/web` 与
  `cordis.patch.yml` **`2026-11-25 23:04:40`**、`.credentials.yaml` **`2026-11-14 22:47`** —— 全都在本会话（04:37 起）之前，
  前后同值（`soak/red-lines.txt`）。
- 写探测 `: > ~/.dsh/.settled-rows-probe` → **`Read-only file system`**（没有落盘）。
- live 实例（`100.111.111.88:3080`）soak 前后都是 **401**；没有重启、没有重载、没有 kill。
- scratch（`.tmp/soak`，**275 MB**：档案克隆 + tgz + chromium 用户目录 + 解压后的会话日志 + npm cache）用完整棵删除；
  scratch 实例的 3487 与 chromium 的 9223 都已关闭（`PORTS_CLOSED`）。

## 7. 文件指纹

```
a54fc87d8da551e32a917fdd70035112e9d2ff4f8e3d886182950adecf164efd  gate-build.out
ef32913e9f85f277969e72ab7ccf9ce3f8ddabb0b6462e887786217f3dc77c89  gate-lint.out
5a31afd640dc539c41717f7536060e27394a821157ad5a23f41b34730ed15b71  gate-specs.out
bcb1a61798abda8d8a3a775a1373725c955f1de0a18ef7e131bc06475bdc0f16  gate-typecheck.out
0b5b3aa252a9d57616b29b65c53bc0fa231a69480aaa0bcf98671466f26ee8d7  red-before-fix.out
08b4161b4d1f0565526f875dfcf26ed3dcd65179971704377b7b4adc7a595817  gate-docs-guards.out
b05a1b6c049c4ba53a732ff35878096cee2e4d77957e86afbc264a90ec155fd4  soak/boundary-settled-lines.txt
2602f91e30adcf570c8924ba4c58aea482adeabc8e970ff1bcffb8d9ac24686a  soak/clone-report.txt
3394d7e8ae0de8b00debca2c48ba2ea5e0e92a14aff327a7d9eea4d10d66658b  soak/done-transcript.txt
7381823c6bb6e465f885a41bccf31aab7ca0be3ff1e1308e41d0a54a49a02fbc  soak/installed-lib-sha256.txt
d75ae58ac92c3cd94ca74635dd81f7fe6c339b267d23005672c54728dceef282  soak/red-lines.txt
8de018a61c77976b3f1a8a6b083b44d7fc344e6fe9ef939235fe651ce1759dd9  soak/root-tool-and-result.txt
```
