# 进度页重画：一页三态（`feat/progress-redesign`）— 2026-11-25

验收对象：分支 **`feat/progress-redesign`**（worktree `.agents/worktrees/feat/progress-redesign`），基线 `main` 尖端
**`ff5c5ec`**（= `origin/main`），交付 HEAD **`87f14e1`**（产品提交 `e85c35f`，其后是记忆与证据提交）。产品提交 12 条：`a3ed628`（取数 + 文案表）、`bea900f`（红测试）、
`9634115`（重画）、`b01a117`/`0eef679`/`4611546`（守卫与注释收口）、`286ba59`（summary-final 真机缺口）、
`9aad0b8`（两份同名常量逐条一致）、`56796f0`（工作腿 fallback）、`64b69af`（日志行回到一行），
外加两条 `chore(build)` 与两条文档/记忆提交。决定记录见 `docs/knowledge/DECISIONS.md` 的 **`D-156`**，
施工契约见 `docs/knowledge/DESIGN-progress-tab.md` **§19**（含 §19.9 的真机回填）。

状态词汇按 `AGENTS.md` §2；每条结论都能回指下面的一个命令、一张截图或一份原始文本。

## 1. 三张真机截图（同一会话、同一构建、一次真实运行）

| 文件 | 状态 | 一句话 |
| --- | --- | --- |
| `waiting.png` | 等你点头 | run 已开跑、还没有任何声明行；「正在拆活」+「开工」按钮（`progress.dock.start`） |
| `running.png` | 进行中 | 3 个计划任务并行；「执行 正在看 · 第 1 步，共 3 步」+ 三段蓝条 + 步骤清单 + 经过 |
| `done.png` | 已完成 | 「做好了 · 3 步全过」+ 三段绿条 + 交卷卡（`汇总·第2稿（定稿）`）+「收下这版」 |

逐字文本在 `10-waiting.txt` / `20-running.txt` / `30-done.txt`（同一目录，从 `[data-gw-progress]` 的 `innerText` 取出），
`console.json` = `{"consoleErrors": []}`（整轮 0 条 console error、0 条 page error）。

**环境**：Node **v26.8.1** / npm **11.19.0**；DSH **0.2.2-rc.3**；隔离 scratch home
`.tmp/soak-progress/dsh-home`（profile **`web-clone`**，由 `node scripts/clone-profile.mjs` 从 live
`~/.dsh/profiles/web` 克隆：`files 7720 -> 7720 (88421847 bytes)` / `parity 5/5` / `credentials redacted: 1 line(s) in 1 file(s)`），
端口 **127.0.0.1:3361**，headless Chromium（`~/.cache/ms-playwright/chromium-1248`）。

**安装身份**（`CONFIRMED`）：`npm pack` → `dsh plugin --profile web-clone add file:…/grok-final-4292bdf7.tgz`，
版本读回 **`0.13.38`**，`sha256(lib/client.js)` = **`4292bdf705dc2f72ce8c1940ce2b5d5dbb83e78aa831aa091e281868152ab3d6`**，
与工作树的 `lib/client.js` 逐字相同（真拷贝，不是软链）。

**隔离档案上只动了 soak 用的四类东西**：删掉残留的 `mode: triage` 一行；五个角色 + `guardianModel` + 默认 agent 模型钉到
`bifrost-responses/opencode-go/muse-spark-1.3-contributor`（本机 shell 没有 `AGENT2API_API_KEY`，不钉就一次子调用都起不来）；
工作区指向一次性 `.tmp/soak-progress/work`（自建的 `storages/workspace.json` 单条目）；端口 3361。产品代码、默认值、schema 一个字没动。

## 2. 门禁（`TMPDIR=$PWD/.tmp npm run ci`，两遍都 EXIT=0）

| 树 | 读数 |
| --- | --- |
| 基线 `ff5c5ec`（`main` 干净树，包工头独立跑） | **EXIT=0**；`Test Files 100 passed (100)` / `Tests 1870 passed (1870)`；`Found 15 warnings and 0 errors.`；`client bundle: 340426 bytes → lib/client.js`；`lib/ at ff5c5ec … (285 files, byte-identical)` |
| 交付 `87f14e1`（产品 `e85c35f`） | **EXIT=0**；`Test Files 100 passed (100)` / `Tests 1855 passed (1855)`；`Found 15 warnings and 0 errors.`；`client bundle: 334321 bytes → lib/client.js`；`lib/ at 87f14e1 … (285 files, byte-identical)` |

**算术**：测试文件数 **100 → 100**（未变），用例 **1870 → 1855（−15）**，`lib/client.js` **340426 → 334321 字节（−6105）**，
oxlint 告警 **15 → 15**。用例净减是重画的形状：旧脊椎 / 环 / 连接线 / 实测 SVG 干线 / 结算条 / 详情弹层的用例整族删掉
（`test/client.spec.ts` +1869/−… 与 `test/progress-connector.spec.ts` 的净删），换成三态故事、五态词、退场缺席、
只填框不代发、`summary-final` 走视图路径、两份同名常量逐条一致、工作腿 fallback、日志行一行这些新用例。
**方向性**：删的是**被删功能**的断言，没有一个「还能跑但没人测」的入口——`test/progress-hint-absent.spec.ts`
（零说明）、`test/i18n-parity.spec.ts`（中英同键）、`test/progress-tab.spec.ts`（六段口径 + 新故事）三条守卫都在，且都比基线更严。

## 3. 先红后绿（每一处都留了原始失败）

| 谁 | 红的原文（节选） | 绿 |
| --- | --- | --- |
| 取数 + 文案 | `Tests 13 failed \| 56 passed (69)`：`deriveProgressStory is not a function`、`expected [ '7 段固定脊' ] to deeply equal []`、`zh progress.chip.waiting: expected undefined to be '等你点头'`、`zh progress.title: expected true to be false`、`expected [ …(8) ] to deeply equal []`（旧解释句族） | `Test Files 3 passed (3)` / `Tests 69 passed (69)` |
| 重画 | `Test Files 2 failed (2)` / `Tests 24 failed \| 111 passed (135)` | `Test Files 2 passed (2)` / `Tests 135 passed (135)` |
| summary-final（真机缺口） | 三条走**视图定义**的用例先红：`expected [ 'start', 'update', … ] to not include 'dropped'`、`tool-workflow/summary-final: expected […] to include …`、`expected [ 'runId', … ] to deeply equal ArrayContaining{…}`；补完 eventTypes 后仍红了第二次（`run-end must not forget the shipped draft: expected undefined to be 1`），于是把这条声明也重放进 `update` 的 records | `Tests 137 passed`（+lib 过期 1 条） |
| 两份同名常量 | `expected [ 'tool-workflow/run-start', …(7) ] to deeply equal [ …(6) ]`（`summary-final` 只在客户端那份里） | `Tests 56 passed (56)` |
| 工作腿 fallback | `expected [ [ 'seq:1', undefined, '规划助手', 'done' ], … ] to deeply equal […]`、`expected [ { key: 'seq:1', … } ] to deeply equal []` | `Tests 57 passed (57)` |
| 日志行一行 | `expected [ 'time', 'stray', 'stray', 'word' ] to deeply equal [ 'time', 'line', 'word' ]`、`expected [ { type: 'span', … } ] to have a length of +0 but got 1` | `Tests 142 passed`（+lib 过期 1 条） |

## 4. 真机读数改掉的一处契约（`CONFIRMED`）

第一次真机运行（19:37）里，没有计划任务的窗口把「规划」这条腿算成一步，屏幕写着
**「第 1 步，共 1 步 / 要干的 1 件事：规划 在做」**。规划与汇总是 run 自己的两头，不是要做的事。
`DESIGN` §19.2 因此改成「没有计划任务时只把**工作腿**（执行 / 检查 / 复核）算作步骤，规划与汇总只出现在经过里；
没有步时主标题一律写 `progress.now.planning`」，取数与镜像各改一处，配两条新守卫。§19.9 记了这条回填。

## 5. 一条上游缺口（`CONFIRMED`，本分支不修）

同一轮真机会话里 `tool-workflow/*` 共 24 条：`run-start` 1、`agent-start` 10、`agent-end` 10、`guardian-start` 1、
`guardian-end` 1、`run-end` 1、**`summary-final` 0**。运行产出了 `汇总·第1稿/第2稿/第3稿`，却没有一条「哪一稿是定稿」。
根因在 `src/report.ts:1170` 的 `shippedSummaryDraft()`：它只认 review 里逐字出现的 `check=pass verify=pass drafts=N`。
本页因此**如实**显示 `progress.final.missing`（不猜哪一稿是定稿），代价是交卷卡在某些运行里是空的。
第二轮真机运行（19:54）的 review 恰好是这个形状，交卷卡正常渲染 `汇总·第2稿（定稿）` + 打开胶囊——所以这条链路
两端都验过了，坏的是上游那个 review 形状。**修它要改报告格式，超出本轮范围**，记在这里给下一手。

## 6. 三态之外没做到的（`NOT_RUN`）

1. **未通过 / 已取消两态的真机截图没拍**：本轮两次运行的报告都是 `completed`。这两态由 `test/client.spec.ts` 的
   fixture 覆盖（同一批事件 + `run-end error`），没有冒充真机读数。
2. **点按钮之后输入框里真的出现「确认」**：真机上只验到按钮存在与文案（`开工` / `收下这版`），没有点下去看输入框内容；
   「只填框不代发」由手写替身门面的调用序列断言钉住（`['for:scope-ctx', 'setDraft:确认']`，且不含 `send`）。
3. **窄屏（≤480px）没有真机截图**：竖排规则由样式断言钉住（`@media` 存在、无横向滚动），没有截图。
4. **live 档案升级 / 重载 / 重启**：`NOT_RUN`（红线）。

## 7. 红线读数

```
$ stat -c '%y %n' ~/.dsh ~/.dsh/profiles ~/.dsh/profiles/web
2026-11-22 23:40:20  ~/.dsh                     ← 本会话前后同值
2026-11-22 16:59:46  ~/.dsh/profiles            ← 本会话前后同值
2026-11-25 19:41:54  ~/.dsh/profiles/web        ← 目录 mtime 在 19:39–19:41 动过（见下）
$ touch ~/.dsh/.progress-redesign-probe
touch: cannot touch '…': Read-only file system
$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/    → 401（前后都是 401）
$ node -p require('~/.dsh/profiles/web/node_modules/dsh-grok-workflow/package.json').version → 0.13.38
```

一处要说准：`~/.dsh/profiles/web` 这个**目录**的 mtime 是 `2026-11-25 19:41:54`，且它下面有 **135 个文件**晚于 19:30
（`package.json` 19:41、`pnpm-lock.yaml` 19:39、`.plugin-manager/logs/operation-i7EYGq/pnpm.log`）。
本会话对它只有读权限（写探针 `Read-only file system`），也没有任何一条命令写到那里，所以这是**别的进程在同一时段做的一次插件操作**，
成因 `HYPOTHESIS`（另一个会话或实例），本分支没有追。live 装的版本读回仍 `0.13.38`。

未 push、未打 tag、未 bump `package.json`、未 publish；`package.json` 仍是 `0.13.38`。

## 8. 清单

| 文件 | 是什么 | 支撑哪条结论 |
| --- | --- | --- |
| `waiting.png` / `running.png` / `done.png` | 1280×1600 真截图（1500×1600 视口） | §1 三态 |
| `10-waiting.txt` / `20-running.txt` / `30-done.txt` | 三态的 `[data-gw-progress]` 逐字文本 | §1、§4 |
| `console.json` | 整轮 console / page error | §1 |
| 本文件 | 门禁、先红后绿、真机表、上游缺口、残留、红线 | 全部 |

scratch `.tmp/soak-progress/`（含克隆 home、tgz、驱动脚本、两轮截图与日志）收尾整棵删除；删掉 scratch 不会让上面的读数失去出处
（截图与逐字文本已拷进本目录）。
