# CI 实测结果核验 — 2026-11-22

实测对象 `/home/fish/projects_mine/dsh-grok-workflow`，HEAD `bd32506e127fbf585de95a0b05925610594a0ec2`
（`stop(rsi): operator stop switch for the self-iteration loop`），分支 `main`，与 `origin/main`
左/右计数 `0 0`。测量时刻 2026-11-22 07:52–07:57 +08:00，工作树带未提交改动（并行 agent 正在改
dynamic-steering，见 §5）。

**结论**：`npm run ci` 在工作树上 **exit 0**，vitest 报 **78 文件 / 1449 用例全部通过**
（汇总行 `78 passed (78)`、`1449 passed (1449)`，没有 skipped / todo 计数）。同一份提交的干净树
（`git archive HEAD`）复跑是 **73 文件 / 1349 用例**，两次结果一致。历史记录里的 54/984 与
76/1402 都不是当前的数，本次测量不向任何一个历史数字对齐。

## 1. 环境

| 项 | 值 | 来源 |
| --- | --- | --- |
| 主机 | Linux 7.2.11-arch1-1 x86_64，6 核 | `uname -srm`、`nproc` |
| Node / npm | `v26.8.1` / `11.19.0` | `node -v`、`npm -v` |
| vitest / oxlint / tsc | `4.1.12` / `1.81.0` / `6.0.3` | `npx vitest --version`、`npx tsc --version`、各自 `package.json` |
| package 版本 | `dsh-grok-workflow@0.12.19` | `package.json` |
| 测试配置 | `fileParallelism: false`、`testTimeout/hookTimeout 30_000`，`GROK_WORKFLOW_MEMORY_DIR` 与 `GROK_WORKFLOW_CHECKPOINT_DIR` 落到 `os.tmpdir()` | `vitest.config.ts` |
| GitHub Actions 矩阵 | Node **22** / **24**，`ubuntu-latest` | `.github/workflows/ci.yml:19`（`node: ['22', '24']`） |
| 本地 Node | **26**，在矩阵之外 | 同上 |

## 2. 逐门结果

`ci` 脚本定义在 `package.json:64`：`typecheck && lint && verify:lib && npm test`（`npm test` 自身是
`npm run build && vitest run`）。整条链在一个 shell 里跑完，`&&` 短路，`CI_EXIT=0` 即四门全过。

| 门 | 命令 | 退出码 | 输出要点 | 状态 |
| --- | --- | --- | --- | --- |
| typecheck | `tsc -p tsconfig.json --noEmit` | 0 | 无诊断输出 | PASS |
| lint | `oxlint src test` | 0 | `Found 23 warnings and 0 errors.` / `613ms on 128 files with 96 rules using 6 threads` | PASS |
| verify:lib | `node scripts/verify-lib.mjs` | 0 | `lib/ at bd32506 is the build of src/ at bd32506 (157 files, byte-identical)`；`client bundle: 253678 bytes → lib/client.js` | PASS |
| build（`npm test` 内） | `tsc -p tsconfig.build.json && node scripts/build-client.mjs` | 0 | `client bundle: 262124 bytes → lib/client.js` | PASS |
| vitest（工作树） | `vitest run` | 0 | `Test Files 78 passed (78)` / `Tests 1449 passed (1449)` / `Duration 44.20s`，start `07:53:24` | PASS |
| vitest（干净 HEAD 复跑） | `git archive HEAD`→`.tmp/`，再 `npx vitest run` | 0 | `73 passed (73)` / `1349 passed (1349)` / `35.01s` | PASS |

单独复验 typecheck（`npx tsc -p tsconfig.json --noEmit; echo TYPECHECK_EXIT=$?`）也是 `0`，不是被
`&&` 链隐藏的假绿。

`npm test:e2e`（`scripts/e2e-headless-in-turn.sh`）**NOT_RUN**：需要真实 DSH profile 加一条会应答的
模型路由，且它不在 `npm run ci` 里。

`ci-run.log` 里有若干 `[smoke] status=failed …` 与 `stderr | test/client.spec.ts …` 行，它们是**通过**
用例自己打印的日志（`test/client.spec.ts` 的「读取失败」场景、`recovery-kill-restart` 的 smoke 钩子），
不是失败记录；判定以汇总行为准。

## 3. 文件数与测试数，以及口径

| 口径 | 树 | 文件 | 用例 | 证据 |
| --- | --- | --- | --- | --- |
| 历史记录（2026-11-18） | HEAD `17e3a12` 干净树 | 54 | 984 | `docs/knowledge/evidence/test-baseline-2026-11-18/REPORT.md` |
| 本轮，提交层面 | HEAD `bd32506` 干净树 | **73** | **1349** | 本目录 `vitest-at-head-bd32506.log`（两次跑结果相同：`07:54:53` 与 `07:56:03`，均 73/1349） |
| 本轮，工作树 | `bd32506` + 未提交改动 | **78** | **1449** | 本目录 `ci-run.log` |
| 会话上下文所述 | 未指明 | 76 | 1402 | 仓库内无任何文件记录该数字 |

54/984 与当前 78 不是同一棵树，差在提交本身：`git ls-tree -r --name-only 17e3a12 test/ | grep -c '\.spec\.ts$'`
= **54**，与该报告的 54 文件吻合；同一命令在 `283577a` 与 `bd32506` 上都是 **73**。

工作树比 HEAD 多的 **+5 文件 / +100 用例**可以拆净，两处独立计数对得上：

- 5 个未跟踪的 spec 文件，本轮日志里的用例数：`timeout` 19、`waves` 27、`wave4-acceptance` 8、
  `inheritance` 19、`upstream` 8，合计 **81**。
- 6 个已跟踪但被改过的 spec 增了用例，按 `it(`/`test(` 行数比对 HEAD 与工作树：`client` 109→119、
  `delivery-human-block` 39→43、`delivery` 14→16、`config` 40→41、`gate` 49→50、`naming` 15→16，
  合计 **19**。
- 81 + 19 = 100 = 1449 − 1349。

**76/1402 的处理**：它在仓库里找不到出处，只在会话上下文里出现，本轮无法复现，因此不当作可与
78/1449 并列的第二种「口径」，也不去凑。它与今天的数关系上落在 73/1349（提交）与 78/1449（工作树）
之间，最自然的解释是某个中间时刻的工作树快照——那时 5 个新 spec 只落地了 3 个（73+3=76），
其余用例数与今天略有差异。这条是 **HYPOTHESIS**，没有证据文件支撑，未经证实。

## 4. 本地 `npm run ci` 与 GitHub Actions 的差别

`.github/workflows/ci.yml` 的 job 比 `npm run ci` 多四步（`npm ci`、`npm run build`、
`git diff --exit-code -- lib/`、`npm pack --dry-run`），少一门（`verify:lib`），逐条对照：

| GitHub Actions 步骤 | 本轮本地 | 说明 |
| --- | --- | --- |
| `npm ci` | **NOT_RUN** | 本地复用既有 `node_modules`，没有装依赖；不构成通过证据，也不掩盖任何东西 |
| `npm run typecheck` / `lint` / `npm test` | PASS | 见 §2 |
| `npm run build` + `git diff --exit-code -- lib/` | **FAIL（exit 1）** | 本地实测 `42 files changed, 1977 insertions(+), 180 deletions(-)`。原因是工作树 `src/` 有 13 个已改文件加 3 个未跟踪文件（`test/` 另有 13 改、5 未跟踪），重新 `build` 后 `lib/` 自然不同于 HEAD 提交的 `lib/`。这是脏树的表现，不是仓库缺陷；提交对的一致性由 `verify:lib` 证明（byte-identical, 157 files） |
| `npm pack --dry-run` | **NOT_RUN** | 沙箱下 `~/.npm` 只读，历史上需 `--cache="$PWD/.tmp/npm-cache"` 才能跑；且不属 `npm run ci` |
| Node 22 / 24 矩阵 | **NOT_RUN** | 本地只有 Node 26；矩阵兼容性属 GitHub 侧证据，不能由本地结果代替 |

## 5. 副作用与边界

- 本轮没有改 `src/`、`test/`、`vitest.config.ts` 或任何测试期望。写入只有本目录的三个文件
  （`ci-run.log`、`vitest-at-head-bd32506.log`、本报告）。
- `npm test` 内含 `npm run build`，它在 `07:53:23` 重写了 `lib/` 下由 `src/` 生成的产物
  （如 `lib/client.js` 262124 B）。`lib/` 在运行之前就已经是 `M` 状态，脏不是本轮引入的；
  但本轮确实覆盖过这批生成物一次，这一点写明不隐。
- 干净树复跑用的是 `.tmp/ci-head-verify`（`.gitignore:29` 已忽略该目录），跑完已 `rm -rf` 删除；
  第一次同口径复跑放在 `/tmp`，两次结果一致（73/1349）。
- 工作树被并行 agent 同时改写，`git status --short` 条数在 07:52–07:57 之间从 116 漂到 117
  （采样时 76 `M` + 41–42 `??`）。文件数的 78 是 `07:53:24` 那次运行时刻的快照，不是全天的常数。
- 未发布版本、未打 tag、未提交、未 push。

## 6. 证据文件

| 文件 | 内容 |
| --- | --- |
| `ci-run.log` | `npm run ci` 完整输出（390 行），含 lint 23 条警告原文、`verify:lib` 回执、build 产物大小、vitest 逐文件结果与汇总，末行 `CI_EXIT=0` |
| `vitest-at-head-bd32506.log` | HEAD 干净树 `npx vitest run` 完整输出，汇总 `73 passed (73)` / `1349 passed (1349)` |
| `REPORT.md` | 本文件 |

设备=agent-108，时间 2026-11-22
