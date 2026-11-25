# 汇总门结论：通过哪一稿 / 全被退回且为什么 — 2026-11-25

验收对象：分支 **`fix/synth-outcome`**（worktree `.worktrees/fix-synth-outcome`），
基点 `main` **`57dcf04`**，产品提交 **`5388f22`**（含重建的 `lib/`）。
状态词按 `AGENTS.md` §2；每条读数都能回指本目录的文件或一条命令。

## 1. 契约（`CONFIRMED`）

| 层 | 事实 |
| --- | --- |
| 标记文法 | 通过：`check=pass verify=pass drafts=N`（**逐字不变**）。全被退回：`check=fail verify=pass drafts=N reason=<一行>` 或 `check=pass verify=fail …`。同一个表达式写两处（layered 约 4502 行、`model` 策略约 4596 行） |
| 理由整形 | `reviewSummaryReason()`：控制字符 → 空格、空白折叠、`clip(...,300)`；理由为空则不写 `reason=`（不假装知道原因） |
| 读回 | `summaryGateOutcome(review)` → `{kind:'shipped',draft}` \| `{kind:'rejected',drafts,stage,reason}` \| `undefined`；`drafts<1`、两段同词、缺理由一律 `undefined` |
| 台账行 | 通过保持 ` · final: draft N`；退回追加 ` · rejected: draft N (<stage>: <reason>)`，理由取自解析值、`oneLine(...,160)` 另限一次 |
| 事件 | `tool-workflow/summary-rejected`，载荷 `{runId,drafts,stage,reason}`；与 `summary-final` 分开，因为一次运行只会有其中一个事实 |
| 故事 | `ProgressStory.final` 变成 `{kind:'shipped',…}` \| `{kind:'rejected',drafts,stage,reason}`；两者都在时通过优先 |
| 卡片 | 通过=今天的绿卡（逐字）；退回=琥珀块，钩子 `data-gw-progress-final-rejected`、`-drafts`、`-reason`；都没有=`progress.final.missing` 原句 |
| 文案 | `progress.final.rejected`：`第 {n} 稿全被退回` / `Every draft was rejected: {n}`；`progress.final.rejectedReason`：`最后不过：{reason}` / `Last failure: {reason}` |

## 2. 门禁（`CONFIRMED`）

`gate-5388f22.out`（原样拷入，未编辑）：

```
EXIT=0
> dsh-grok-workflow@0.13.39 typecheck      (tsc --noEmit，无输出)
> oxlint src test
Found 15 warnings and 0 errors.
client bundle: 352002 bytes → lib/client.js
lib/ at 5388f22 is the build of src/ at 5388f22 (285 files, byte-identical)
Test Files  102 passed (102)
      Tests  1903 passed (1903)
   Duration  86.59s (transform 3.01s, setup 0ms, import 9.21s, tests 65.16s, environment 11ms)
```

`node scripts/verify-lib.mjs` 单独再跑一次：`lib/ at 5388f22 is the build of src/ at 5388f22 (285 files, byte-identical)`，exit 0。

用例数增量，逐文件（基线 101 文件 / 1884 用例，本分支 102 / 1903，差 +1 文件 / +19）：

| 文件 | 变化 | 内容 |
| --- | --- | --- |
| `test/summary-outcome.spec.ts` | **+1 文件，+16 用例** | 标记（layered / model / 无稿）、解析、记录器规则、折叠与故事 |
| `test/client.spec.ts` | +3 | 退回卡三态、无事实时说缺口原句、"退回事实跨 run-end 不丢" |
| `test/report.spec.ts` | 0（改写既有用例） | 退回台账行的两段与理由、长理由不吃截断 |
| `test/progress-tab.spec.ts`、`test/i18n-parity.spec.ts` | 0（改写既有断言 / 表格加两行） | 事件清单、`final` 判别式、两条新文案逐字 |

## 3. 红→绿（`CONFIRMED`）

红：`red-summary-outcome.out`。做法是把 `src/` 暂存回 `57dcf04`、只留新断言再跑
（**说明**：本轮实际的编写顺序是先写实现再写断言，红色记录是用 `git stash push -- src` 把源码退回基点后重跑得到的，不是"先红后写"的原生顺序）。

```
TMPDIR=$PWD/.tmp npx vitest run test/summary-outcome.spec.ts
      Tests  13 failed | 3 passed (16)
```

代表行：

```
TypeError: summaryGateOutcome is not a function
TypeError: recorder.summaryRejected is not a function
AssertionError: expected false to be true          (layered 退回标记以 check=fail…reason= 开头)
AssertionError: expected false to be true          (model 策略退回标记)
```

绿：`TMPDIR=$PWD/.tmp npx vitest run` → `Test Files 102 passed (102)` / `Tests 1903 passed (1903)` / `Duration 87.87s`。

## 4. 真机浸泡（`CONFIRMED`，一处 `NOT_RUN`）

环境：Node v26.8.1 / DSH 0.2.2-rc.3；隔离 home `.tmp/soak-synth/dsh-home`，
profile **`web-clone`**（`node scripts/clone-profile.mjs --src ~/.dsh/profiles/web`）：

```
files 7734 -> 7734 (88511862 bytes)
links 5 (relinked 2, already dangling in the source 1)
parity 5/5 equal after redaction
dependencies 17 declared, 0 unresolved (8/21 bundles from the installation)
credentials redacted: 1 line(s) in 1 file(s); vendored fixtures: 4 file(s)
```

克隆里只动了两件与产品无关的事：删掉残留的 `mode: triage` 一行；五个角色 + `guardianModel`
钉到 `bifrost-responses/opencode-go/muse-spark-1.3-contributor`（密钥只走进程环境
`BIFROST_VIRTUAL_KEY`，没有拷进 scratch，也没有落进任何产物）。端口 **3391**，一次性工作区
`.tmp/soak-synth/work`。live `~/.dsh` 与 3080 上的实例没被本浸泡写入（见 §5）。

| 项 | 读数 |
| --- | --- |
| 包装 | `dsh-grok-workflow-0.13.39.tgz` = `849469e75842a8a1fd9d320097236a4431276b7dcb22f48ed6d271125a77ef60` |
| 安装方式 | `dsh plugin --profile web-clone add file:<tgz>`（真拷贝：`readlink -f` 落在 profile 自己的 `node_modules`） |
| 版本读回 | `0.13.39` |
| `sha256(lib/client.js)` | `f681b1d09facc6629ab58cf0d73f25a495967e468a3ac3495c2c9d394e293bc7`，与仓库 `lib/client.js` 同哈希 |

一次真实运行（同一句话「用 grok_workflow 工具跑一个工作流：写 notes.md 三行安装步骤，再写
test.txt 一行 hello」），本机模型全程真答：

- 会话日志里 13 条 `agent-start` / 13 条 `agent-end` / 1 条 `run-start` / 1 条 `run-end` /
  1 条 `guardian-start` / 1 条 `guardian-end` / **1 条 `summary-final`**，**0 条 `summary-rejected`**
  （`soak-session-extract.txt`）——这一轮的闸门第一稿就过了，退回事件本就不该出现。
- 报告里的标记读回是 `check=pass verify=pass drafts=1`，台账行 `check=pass verify=pass drafts=1 · final: draft 1`。
- 完成页读数（`soak-readings-completed.json`、`soak-completed.png`）：

| 钩子 | 读数 |
| --- | --- |
| `[data-gw-progress-chip]` | `未通过`（`data-state="failed"`：两个任务 0/2 过，页面按报告说真话） |
| `[data-gw-progress-final-section]` / `-final` | 1 / 1 |
| `[data-gw-progress-final-name]` / `-mark` | `汇总·第1稿` / `（定稿）` |
| `[data-gw-progress-final-rejected]` / `-missing` | **0** / **0** |
| 卡片里的开子会话胶囊 | 1 |
| 历史末行 | `22:28 汇总·第1稿 汇总 交卷` |
| `[data-gw-progress-guardian]` | 1 |
| 控制台 | `consoleErrors: []`、`pageErrors: []` |

即：**通过态的卡片与基线逐字一致**（名字 + `（定稿）` + 一个胶囊），新事件没有打断折叠，
`run-end` 之后「定稿」也没丢。

### `NOT_RUN`

1. **真机上的"三稿全被退回"状态**：要在活模型上连续三次撞穿闸门，属高抖动、要烧额度的
   人造场景，本轮不做。该状态由 `test/summary-outcome.spec.ts` 与 `test/client.spec.ts` 的
   组件/引擎用例覆盖，**不在真机上假装**。
2. **退回卡的琥珀色外观**：真机没有退回态页面，所以只由 CSS 与组件用例保证；没截图。

## 5. 红线（`CONFIRMED`）

| 检查 | 浸泡前 | 浸泡后 |
| --- | --- | --- |
| `stat ~/.dsh` | `2026-11-22 23:40:20` | `2026-11-25 22:28:12` |
| `stat ~/.dsh/profiles` | `2026-11-22 16:59:46` | **不变** `2026-11-22 16:59:46` |
| `~/.dsh/profiles/web/cordis.patch.yml` | — | `2026-11-25 19:27:31`（早于本次会话，插件行没被动过） |
| live 3080 | `http=401` | `http=401` |
| 写探测 `: > ~/.dsh/.soak-write-probe` | — | `Read-only file system`，**DENIED**，探测文件不存在 |

要说准的两点：

- `~/.dsh` 目录本身的时间戳在窗口内前进到 `22:28:12`，`~/.dsh/profiles/web/package.json`
  （`22:06:12`）与 `node_modules/dsh-grok-workflow`（`22:06:09`）也动过。**这些不是本浸泡写的**：
  本会话对 `~/.dsh` 的写探测被内核以 `EROFS` 拒绝，说明我这个沙箱根本写不进去；`22:06` 是
  本会话启动时 live 实例/profile 自身的动静，`22:28` 与本会话的 live 侧会话目录同批。
  与插件安装真正相关的 `profiles/web/cordis.patch.yml` 停在 `19:27:31`，一个字没变。
- 浸泡结束后删掉了 `.tmp/soak-synth`（106 MB，含克隆 home、包、截图原始件）；3391 端口随进程结束
  关闭（`curl` 返回 `000`）。留档只在本目录里。
