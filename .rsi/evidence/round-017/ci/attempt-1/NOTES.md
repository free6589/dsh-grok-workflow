# CI 与构建门禁 — round 17 证据（`CONFIRMED`）

运行时间：2026-11-19 08:38–08:41 +08:00 · 树：共享主工作树 `/home/fish/projects_mine/dsh-grok-workflow`
HEAD `4db78f41f00416abe55baa1ec9403c4fa1a63379`（`main`，与 `origin/main` 同步）
本机工具链：node v26.8.1 / npm 11.19.0 / vitest 4.1.12

## 结果一览

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| `npm run ci` | **exit 0** | `ci.txt` 末行 `CI-EXIT=0` |
| `npm run typecheck`（`tsc -p tsconfig.json --noEmit`） | exit 0，0 诊断 | `ci.txt:7`，之后直接进入 lint 步骤 |
| `npm run lint`（`oxlint src test`） | **22 warnings / 0 errors**，107 文件，587ms | `ci.txt`（`Found 22 warnings and 0 errors.`） |
| `npm run verify:lib`（ci 链内） | `lib/ at 4db78f4 is the build of src/ at 4db78f4 (145 files, byte-identical)` | `ci.txt:235-239`（`Test Files` 354、`Tests` 355、`CI-EXIT=0` 359） |
| `npm run verify:lib`（独立复跑） | 同上，`VERIFY-LIB-EXIT=0` | `verify-lib.txt` |
| `npm run build` + `vitest run`（ci 链内） | **Test Files 62 passed (62) · Tests 1139 passed (1139)**，25.06s | `ci.txt`（`Test Files`/`Tests`/`Duration`） |
| lib 幂等（ci 前 vs ci 后清单） | 145 文件，`diff` 空，`DIFF-EXIT=0` | `lib-before.txt`、`lib-after-ci.txt`、`lib-idempotence-diff.txt` |
| lib 幂等（再跑一次 build） | 145 文件，`diff` 空，`DIFF2-EXIT=0`，`BUILD2-EXIT=0` | `build-second.txt`、`lib-after-build2.txt`、`lib-idempotence-diff-build2.txt` |
| 跑完 tracked 漂移 | **0 行** `git status --untracked-files=no --porcelain` | `git-state-post.txt` |
| `test/` 里 `.skip/.only/.todo` | **0 命中** | `assertions.txt` §8 |
| `package.json` / `package-lock.json` 版本 | 三处一致 `0.11.15` | `assertions.txt` §5 |
| `CHANGELOG.md` `[Unreleased]` | 恰好 **2 条** `- **…` | `assertions.txt` §6 |
| 守卫测试 | 全绿（见下） | `ci.txt` |

命令/计数全部汇总在 `assertions.txt`。快照前的 `git status`：`git-state-pre.txt`。

## 守卫与 loop 相关用例（逐文件，均 PASS）

文档守卫：`test/docs-version.spec.ts` (8)、`test/docs-config-keys.spec.ts` (12)、
`test/docs-architecture-version.spec.ts` (3)、`test/i18n-parity.spec.ts` (6)、
`test/heartbeat-guard.spec.ts` (14) = **43 条**。
round-16 的 loop 面：`test/loop.spec.ts` (30)、`test/loop-brakes.spec.ts` (35)、
`test/loop-surface.spec.ts` (16)、`test/loop-runtime-wiring.spec.ts` (5) = **86 条**。

## 与远端门禁的口径对照（不构成本轮判定，仅记录）

- `.github/workflows/ci.yml:31` 跑 `npm test`，并在 build 后加 `git diff --exit-code -- lib/`；
  本机等价检查在 `assertions` 之外的补充命令里我也跑了：`git diff --exit-code -- lib/` → `GIT-DIFF-LIB-EXIT=0`，
  且 `git status --porcelain --untracked-files=all -- lib/` 为空（与 `release.yml` 的
  “Verify no untracked build artifacts” 步骤同构）。
- 差异：远端矩阵是 Node 22 / 24，本机是 **Node 26.8.1**。本机绿说明门禁在当前 Node 上也过，
  但不替代远端 22/24 的结果。

## 发现的文档口径不一致（本轮无权修改，按约束只记录）

1. **README 测试数过期**：`README.md:345` 写 “**1081 deterministic tests across 60 files**”，
   `README.zh-CN.md:334` 写 “**60 个文件 / 1081 个确定性测试**”，而本轮实测
   **62 文件 / 1139 测试**（`assertions.txt` §7）。差 **+2 文件 / +58 测试**，正好对应 round 16
   新增的 `test/loop-brakes.spec.ts` 与 `test/loop-runtime-wiring.spec.ts`。
   `docs/knowledge/STATE.md:1309` 已记录 62/1139，所以过期的是两份 README 的这一句，不是记忆文件。
   `test/` 下现有 62 个 `*.spec.ts`，与 `vitest.config.ts` 的 `include: ['test/**/*.spec.ts']` 相符。
2. **README 对 `npm run ci` 的描述漏了 `verify:lib`**：两份 README 的那句只列
   “typecheck、lint、build 与测试”，而 `package.json`（`"ci": "npm run typecheck && npm run lint && npm run verify:lib && npm test"`）
   在 lint 与 test 之间跑了产物校验。v0.11.14 的教训正是“submit 物与源码不一致本地看不出来”，
   安装者读 README 时看不到这条闸门。

两条都属于 docs 侧文字，按任务约束（只写 `.rsi/evidence/round-017/ci/`，不改 docs）本轮未改。

## 判定

门禁本身 **PASS**：`npm run ci` exit 0、typecheck 0 诊断、lint 0 error、`lib/` 145 文件构建幂等且
`verify:lib` 报 byte-identical、62 文件 / 1139 测试全绿、无 skip/only/todo、跑完 tracked 文件 0 改动。
唯一的“红”是文档口径（两份 README 的测试数落后 2 文件 / 58 测试），不影响构建与发布产物。
