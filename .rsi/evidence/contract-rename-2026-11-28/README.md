# 证据：contract 改名（wave-contract-2026-11-27 → plugin:grok-workflow/progress）

采集者：`dispatcher-rename-07/evidence-worker-03`（证据小工，只读产品代码，不写产品代码）
采集时间：2026-11-28 00:53–01:05 +08:00
采集地点：worktree `/home/fish/projects_mine/dsh-grok-workflow/.tmp/wt-contract`，分支 `fix/wave-contract-freeze`
结论：改名已落地 `4d5ecfc`，三项门禁全绿（`17 passed`），旧串**没有**清零——残留是刻意保留的旧会话兼容层与按契约保留的 `stage-detail`。

## 1. SHA

| 角色 | SHA | 说明 |
| --- | --- | --- |
| base（`main` 尖端 = `origin/main`） | `86d9ddd136e3c2722e5a9afc5e657eb186560292` | `git rev-parse main` 与 `git rev-parse origin/main` 同值；改名提交的祖父 |
| 分支原尖端（rebase 前） | `f975120c24af30f5dfc6e92c473d1fea368d21e8` | 父 `c049388`（0.13.61 记忆提交），内容=`test(contract): freeze wave contract with evidence pack and spec`；rebase 后成为孤立对象，仍在（`git cat-file -t f975120` → `commit`） |
| rebase 后 | `10418bda2d5b3699afda1fc37149f51651b2c850` | 父 `86d9ddd`，同一颗 freeze 提交搬到新基线 |
| 改名后（当前 HEAD） | `4d5ecfc60b11217b2fe2fc6e3f78da54212dfc97` | 父 `10418bd`；`test(contract): rename tool-workflow to plugin:grok-workflow/progress, sync CONTRACT doc` |

链：`86d9ddd` → `10418bd` → `4d5ecfc`（`git log --graph --oneline 86d9ddd..HEAD`，两颗提交）。
`git status --short --branch` 采集时为 `## fix/wave-contract-freeze`（干净，除本证据目录未跟踪）。

## 2. 9 项改名清单

改名对象：9 项 lifecycle 事件名的前缀，`tool-workflow/<name>` → `plugin:grok-workflow/progress/<name>`。
行号均为改后文件（`4d5ecfc`）的实际行号，逐条取自 `git show 4d5ecfc`。

| # | 事件 | 旧串 | 新串 | 位置（文件:行） |
| --- | --- | --- | --- | --- |
| 1 | run-start | `tool-workflow/run-start` | `plugin:grok-workflow/progress/run-start` | `test/contract-freeze.spec.ts:66`、`:158` |
| 2 | agent-start | `tool-workflow/agent-start` | `plugin:grok-workflow/progress/agent-start` | `test/contract-freeze.spec.ts:67`、`:159` |
| 3 | agent-end | `tool-workflow/agent-end` | `plugin:grok-workflow/progress/agent-end` | `test/contract-freeze.spec.ts:68`、`:160` |
| 4 | summary-final | `tool-workflow/summary-final` | `plugin:grok-workflow/progress/summary-final` | `test/contract-freeze.spec.ts:69`、`:117` |
| 5 | summary-rejected | `tool-workflow/summary-rejected` | `plugin:grok-workflow/progress/summary-rejected` | `test/contract-freeze.spec.ts:70`、`:118` |
| 6 | guardian-start | `tool-workflow/guardian-start` | `plugin:grok-workflow/progress/guardian-start` | `test/contract-freeze.spec.ts:71` |
| 7 | guardian-finding | `tool-workflow/guardian-finding` | `plugin:grok-workflow/progress/guardian-finding` | `test/contract-freeze.spec.ts:72` |
| 8 | guardian-end | `tool-workflow/guardian-end` | `plugin:grok-workflow/progress/guardian-end` | `test/contract-freeze.spec.ts:73` |
| 9 | run-end | `tool-workflow/run-end` | `plugin:grok-workflow/progress/run-end` | `test/contract-freeze.spec.ts:74`、`:161` |

同提交里同步的契约文档前缀（2 行，不是新的事件名）：

| 文件:行 | 旧 | 新 |
| --- | --- | --- |
| `docs/knowledge/CONTRACT-wave-2026-11-27.md:8` | 「冻结 9 项 lifecycle（顺序固定，`tool-workflow/` 前缀）」 | 「…`plugin:grok-workflow/progress/` 前缀」 |
| `docs/knowledge/CONTRACT-wave-2026-11-27.md:31` | 三常量都写「`tool-workflow/` 前缀」 | 拆开：`stage-detail`「仍是 `tool-workflow/` 前缀，未改名」，另两个写新前缀 |

合计改动：2 文件 / 17 行增 / 17 行删（`test/contract-freeze.spec.ts` 15+15，`CONTRACT-wave-2026-11-27.md` 2+2）。逐行明细见 `diff.stat.txt` 与 `falsify.txt`。

## 3. 门禁三项（本节数字为本小工在 `4d5ecfc` 上亲手重跑，非转述）

工作目录 `.tmp/wt-contract`，Node 版本取 worktree 自带 `node_modules`，执行时刻 `01:02:38`–`01:02:59`。

| # | 逐字命令 | EXIT | 通过数 |
| --- | --- | --- | --- |
| 1 | `npm run typecheck` | `TSC_EXIT=0` | 无可执行用例，`tsc -p tsconfig.json --noEmit` 无输出（编译通过） |
| 2 | `npm run lint` | `LINT_EXIT=0` | `Found 17 warnings and 0 errors.` / `200 files` / `96 rules`（17 条 warning 全是既有项，如 `src/client/index.js:3926 PANEL_STACK_WIDTH` 未使用） |
| 3 | `npx vitest run test/contract-freeze.spec.ts` | `CONTRACT_EXIT=0` | `Test Files 1 passed (1)` / `Tests 17 passed (17)` |

原始尾部转录见 `gate.log.txt`（逐字粘贴，未改一字；当时落盘的 scratch 已删）。
旁证（转述，本小工未复跑）：派单包工头报门禁小工独立跑出 `tsc 0 / lint 0 / contract 17-17`，与上表同值。

`npm run ci`（全量）与真机 soak：**NOT_RUN**（AGENTS.md §12 规定块内只跑 tsc + lint + 定向 spec，全量留给发版提交）。

## 4. 证伪（三条，原始输出见 `falsify.txt`）

1. **「改完旧串在 `src`/`test` 里清零了」→ 假。** `grep -rn "tool-workflow" src test --include="*.ts" --include="*.js" | wc -l` 在 `4d5ecfc` 上是 **74**（`src` 41 / `test` 33）。逐条看下去，残留全部属于两类刻意保留：`src/records.ts:472-480` 与 `src/client/index.js:2846-2854` 的旧名→新名折叠表（老会话仍以旧名写盘，删了面板就读不出历史），以及 `progress-tab.ts:89` 的 `PROGRESS_DETAIL_EVENT_TYPE`（`stage-detail` 按契约冻结在旧名）。所以这份证据只主张「9 项 lifecycle 的 pin 与文档前缀已同步」，**不**主张「仓库里没有旧串」。
2. **「门禁 17/17 是空转的」→ 假。** 同一条 spec 在改名前的 `10418bd` 上跑是 `Tests 3 failed | 14 passed`、`EXIT=1`，失败读作 `expected 'plugin:grok-workflow/progress/run-start' to be 'tool-workflow/run-start'`。改名后 17/17，说明这 17 条确实钉在字符串上。
3. **「9 项之外被顺手改宽了」→ 假。** `grep -n "tool-workflow/" test/contract-freeze.spec.ts` 在 `4d5ecfc` 上只剩 1 行：`:116 expect(PROGRESS_DETAIL_EVENT_TYPE).toBe('tool-workflow/stage-detail')`，与契约 §2「`stage-detail` 不在 9 项白名单内」一致。

## 5. 边界（没做的事）

- 未改产品代码（`src/**`、`test/**`、`lib/**` 一字未动）；本目录 4 个文件是本小工唯一写入。
- 未动 `docs/knowledge/**`（改名小工在 `4d5ecfc` 里改的 2 行属该块自身工作，不是本小工写的）。
- 未 merge、未 push、未打 tag、未动其他分支/worktree、未碰 live `~/.dsh`、未重启实例。
- 未跑全量 `npm run ci`、未跑 soak（`NOT_RUN`，见 §3）。

## 6. 本目录文件

| 文件 | 内容 |
| --- | --- |
| `README.md` | 本文件：SHA、9 项清单、门禁数字、证伪、边界 |
| `diff.stat.txt` | `git diff --stat 10418bd..4d5ecfc`（改名 diff）+ `git diff --stat 86d9ddd..4d5ecfc`（整支 vs base）+ `--numstat` |
| `gate.log.txt` | 三项门禁的逐字尾部转录与 EXIT |
| `falsify.txt` | 三条证伪的命题、逐字命令、实际输出 |
