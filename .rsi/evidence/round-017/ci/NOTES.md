# round-017 · CI 与构建门禁 — 证据汇总

- 运行时间：2026-11-19 08:46–08:48（Asia/Singapore）
- 树：`/home/fish/projects_mine/dsh-grok-workflow`，分支 `main`，HEAD `4db78f41f00416abe55baa1ec9403c4fa1a63379`（`4db78f4`），与 `origin/main` 齐平（ahead 0 / behind 0，未 push、无新 commit）
- 环境：node `v26.8.1`、npm `11.19.0`
- 本目录是本任务唯一写入位置；`src/` `test/` `lib/` `docs/` `package.json` `package-lock.json` 未改（见 §5）

上一份 attempt-1 的产物原样保留在 `attempt-1/`（同一 HEAD、同一结论），本目录顶层是本轮重新实跑的日志。

## 1. 结论表

| 门禁项 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| 总门禁 | `npm run ci` | **PASS**（`CI-EXIT=0`） | `ci.txt` 末行 |
| typecheck | `tsc -p tsconfig.json --noEmit` | **PASS**，0 条 `error TS`，无任何输出 | `ci.txt`（tsc 与 lint 之间仅 2 个空行）、`assertions.txt` §1 |
| lint | `oxlint src test` | **PASS**，**0 errors / 22 warnings**，107 文件，853ms | `ci.txt:236-237` |
| verify:lib（链内） | `node scripts/verify-lib.mjs` | **PASS**，`lib/ at 4db78f4 is the build of src/ at 4db78f4 (145 files, byte-identical)` | `ci.txt:243` |
| verify:lib（链外独立复跑） | `npm run verify:lib` | **PASS**，同一行输出，`VERIFY-LIB-EXIT=0` | `verify-lib.txt` |
| build | `tsc -p tsconfig.build.json && node scripts/build-client.mjs` | **PASS**，`client bundle: 224412 bytes → lib/client.js` | `ci.txt:250-252` |
| vitest | `vitest run` | **PASS**，**Test Files 62 passed (62) / Tests 1139 passed (1139)**，24.35s | `ci.txt:359-362` |
| lib 构建幂等 | ci 前后 sha256 清单 diff | **PASS**，145 文件逐行相同（`DIFF-EXIT=0`） | `lib-before.txt` / `lib-after-ci.txt` / `lib-idempotence-diff.txt` |
| lib 二次构建幂等 | 再跑一次 `npm run build` 后比对 | **PASS**，与 ci 后及 ci 前清单均相同（`DIFF2-EXIT=0`、`DIFF-BEFORE-VS-BUILD2-EXIT=0`） | `build-second.txt` / `lib-after-build2.txt` / `lib-idempotence-diff-build2.txt` |
| test/ 卫生 | `.skip` / `.only` / `.todo` / `xit` / `xdescribe` 扫描 | **PASS**，全部 0 命中 | `assertions.txt` §9 |
| 版本一致性 | `package.json` / `package-lock.json` / lock 根 `packages[""]` | **PASS**，三处均 `0.11.15` | `assertions.txt` §7 |
| CHANGELOG `[Unreleased]` | 统计 `- **` 条目 | **PASS**，恰好 **2 条**（composer dock 开关、心跳刹车） | `assertions.txt` §8 |
| 守卫测试 | 5 个 docs/心跳守卫 + 4 个 loop 面 spec | **PASS**，129 条全绿（8+12+3+6+14 / 30+35+16+5） | `assertions.txt` §11 |
| 跑完无 tracked 漂移 | `git status --porcelain --untracked-files=no` | **PASS**，0 行；`git diff --exit-code -- lib/` = 0；`lib/` 下 0 未跟踪文件 | `git-state-post.txt` |
| **README 测试数口径** | 对照实测计数 | **RED（docs 侧，超出本任务写权）**：`README.md:345` 写 “1081 deterministic tests across 60 files”，`README.zh-CN.md:334` 写 “60 个文件 / 1081 个确定性测试”，实测 62 文件 / 1139 测试 | `assertions.txt` §10 |

`npm run ci` 的链路（`package.json` scripts）：`ci = typecheck && lint && verify:lib && test`，`test = build && vitest run`，所以单次 `npm run ci` 覆盖 typecheck / lint / verify:lib / build / vitest 五项。

## 2. 逐项命令与关键输出

```text
$ npm run ci
> dsh-grok-workflow@0.11.15 ci
> npm run typecheck && npm run lint && npm run verify:lib && npm test
… typecheck: tsc -p tsconfig.json --noEmit（无输出）
… lint:      Found 22 warnings and 0 errors.  Finished in 853ms on 107 files with 96 rules
… verify:lib: lib/ at 4db78f4 is the build of src/ at 4db78f4 (145 files, byte-identical)
… build:     client bundle: 224412 bytes → lib/client.js
… vitest:    Test Files 62 passed (62) / Tests 1139 passed (1139)   24.35s
CI-EXIT=0
```

22 条 lint warning 全部是 oxlint 的 `no-unused-vars` 类提示（示例 `test/timeout-config.spec.ts:245` 的局部接口 `TaskRow` 未使用），**0 error**，与本任务“lint 0 error”的要求相符；warning 数按实测记录，不做清零承诺。

vitest 62 个 spec 全部通过，磁盘上 `test/**/*.spec.ts` 也是 62 个，`comm -3` 比对无差异（`assertions.txt` §12）——即报告的文件数不是估算值。

## 3. lib 幂等性（v0.11.14 事故的直接对照）

三次快照均为 `find lib -type f | sort | xargs sha256sum`，共 145 个文件：

1. `lib-before.txt` — 跑门禁前
2. `lib-after-ci.txt` — `npm run ci`（内含 build）之后
3. `lib-after-build2.txt` — 再跑一次 `npm run build` 之后

比对时剥离首行 `#` 注释头，`diff` 结果：

```text
### diff lib-before.txt lib-after-ci.txt (content lines only)
DIFF-EXIT=0
### diff AFTER-ci vs AFTER-second-build
DIFF2-EXIT=0
### diff BEFORE-ci vs AFTER-second-build
DIFF-BEFORE-VS-BUILD2-EXIT=0
```

另外把现场 `lib/` 重新哈希与 `lib-after-build2.txt` 比对，`LIVE-LIB-VS-BUILD2-MANIFEST-EXIT=0`（`git-state-post.txt` 末段）。即：重建 lib/ 不产生任何字节差异，`npm test` 里的 build 不会把提交物改脏，这与 v0.11.14 那次“本地绿但提交物不一致”的失效模式相反。

`verify:lib` 独立复跑（`scripts/verify-lib.mjs` 在临时目录构建 HEAD，不写工作区 `lib/`）同样报 `145 files, byte-identical`，说明 `src/` 与已提交 `lib/` 在 HEAD `4db78f4` 上是同一份产物。

## 4. 版本、CHANGELOG、README 口径

- 版本：`0.11.15` ×3（`package.json`、`package-lock.json` 顶层、lock 根 `packages[""]`）；`engines.dsh = ">=0.2.1-rc.2 <0.3.0"`，`engines.node = ">=22"`。本轮未 bump 版本。
- `CHANGELOG.md` 的 `## [Unreleased]` 段（唯一一处）恰好 2 条 Added：composer dock 的 `Auto-continue` 开关、`src/loop-brakes.ts` 心跳刹车。
- **README 口径过期（红，未修）**：两份 README 都还写 60 文件 / 1081 测试，实测 62 文件 / 1139 测试，差 +2 文件 / +58 测试 —— 正是 round-16 新增的 `test/loop-brakes.spec.ts`、`test/loop-runtime-wiring.spec.ts`。`docs/knowledge/STATE.md:11` 与 `:1309` 已记为 62/1139，所以过期的只有 README。
- 附带口径缺口：两份 README 描述 `npm run ci` 时只写 typecheck/lint/build/测试，漏了链中的 `verify:lib`（`grep -c verify:lib README.md README.zh-CN.md` = 0 / 0）。
- 未修原因：本任务约束“只写 `.rsi/evidence/round-017/ci/`，不改 src/test/lib/docs/版本文件”，README 属 docs。修复动作留给 round owner：把 `README.md:345` 改成 “1139 deterministic tests across 62 files”，`README.zh-CN.md:334` 改成 “62 个文件 / 1139 个确定性测试”，并在这两句的门禁描述里补上 `verify:lib`。

## 5. 无 tracked 漂移

```text
--- tracked porcelain (--untracked-files=no) lines ---
0
--- git diff --stat ---
（空）
GIT-DIFF-LIB-EXIT=0
untracked files under lib/: 0
```

跑前（`git-state-pre.txt`）与跑后（`git-state-post.txt`）的 `git status --short --branch` 都是同一组 4 个未跟踪项：`.rsi/evidence/round-017/`（本轮证据）、`.rsi/evidence/segment-5/final-check-agent57.{md,txt}`（另一任务）、`settings-simple-mock.html`。这些在跑门禁前就存在，我没有触碰也没有纳入本轮证据。

## 6. 与远端 CI 的关系（未执行远端，如实标注）

`.github/workflows/ci.yml:22-32` 的矩阵是 Node `22` / `24`，步骤为 `npm ci → typecheck → lint → build → git diff --exit-code -- lib/ → npm test → npm pack --dry-run`；`.github/workflows/release.yml:56-62` 额外要求 `lib/` 下无未跟踪产物。远端用 `git diff --exit-code -- lib/` 达到与本机 `verify:lib` 等价的产物校验。

本机门禁跑在 Node `v26.8.1`（不是矩阵里的 22/24），且本轮没有 commit/push，因此**没有新的远端 CI run 可引用**；本机全绿只证明当前 Node 上的结果。

## 7. 判定

构建/测试门禁 **PASS**（`npm run ci` exit 0，产物 byte-identical，无 tracked 漂移）。phase-2 的“门禁红则不发版”这一条不触发。

唯一未闭合项是 docs 侧的 README 测试数口径（62/1139 与 `verify:lib` 缺失），属本任务写权之外，已记录未修；若 round owner 要求 phase-2 时文档数字与实测一致，需在发版前补改那两行。

部分完成（partial）的唯一原因即此：门禁本身全绿，但 objective 里点名要核对的 README 口径实测为红，而修它越界。
