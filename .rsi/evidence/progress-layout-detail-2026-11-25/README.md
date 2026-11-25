# 进度页布局详情：两列、Guardian 分块、可开行、可折历史（`feat-progress-layout-detail`）— 2026-11-25

验收对象：分支 **`feat-progress-layout-detail`**（worktree `.agents/worktrees/feat-progress-layout-detail`），
尖端 **`8f9e51d`**（记忆提交），产品提交从 **`d0c924a`** 起产品文件逐字相同。
基线对照是 `main` 尖端 **`b0fbd20`**（= 已发布的 `0.13.39`）。同一台机器、同一套隔离办法、
同一种请求、同一份克隆档案，各跑一次真实运行，前后两页并排看。

状态词汇按 `AGENTS.md` §2；每条读数都能回指本目录里的截图、逐字文本或一个命令。

## 1. 环境与安装身份（`CONFIRMED`）

Node **v26.8.1** / npm **11.19.0** / DSH **0.2.2-rc.3**。隔离 home `.tmp/soak-layout/dsh-home`，
profile **`web-clone`**（`node scripts/clone-profile.mjs --src ~/.dsh/profiles/web`）：

```
files 7731 -> 7731 (88493399 bytes)
links 5 (relinked 2, already dangling in the source 1)
parity 5/5 equal after redaction
dependencies 17 declared, 0 unresolved (8/21 bundles from the installation)
credentials redacted: 1 line(s) in 1 file(s); vendored fixtures: 4 file(s)
```

端口 **127.0.0.1:3371**，一次性的工作区 `.tmp/soak-layout/work`。live `~/.dsh` 与 3080 上的实例全程没碰。

**克隆档案里只动了 soak 用的四类东西**（产品代码、默认值、schema 一个字没动）：删掉残留的
`mode: triage` 一行；五个角色 + `guardianModel` + 默认 agent 模型钉到
`bifrost-responses/opencode-go/muse-spark-1.3-contributor`（本机 shell 有 `BIFROST_VIRTUAL_KEY`，
没有 `AGENT2API_API_KEY`，不钉就一次子调用都起不来；密钥只走进程环境，没有拷进 scratch，也没有落到任何产物里）；
工作区指向一次性目录；端口 3371。

| 侧 | 包装 | 版本读回 | `sha256(lib/client.js)` | 字节 |
| --- | --- | --- | --- | --- |
| 基线（`main` `b0fbd20`） | `dsh-grok-workflow-0.13.39.tgz` = `28c5d8b4c7f7f0258be6205a3747bc28bfab04cf25eb327c914211d274bff88b` | `0.13.39` | `38702aa1e50bb483ecdddeba0050632dc627b874eee05958c57f17071063fa6c` | 334321 |
| 本分支（`8f9e51d`/`d0c924a`） | `dsh-grok-workflow-0.13.39-feat-progress-layout-detail.tgz` = `acf2476d08b6677ec8427a717c7e05526ca3306f8f0789f85005de7d680840d9` | `0.13.39` | `5745b15c379d28e99d1536cefce90154d3ebcc5d9d5c7d2a9c7b991ab6fced3a` | **347526** |

两侧都是 `dsh plugin --profile web-clone add file:…tgz` 装进去的**真拷贝**：装好的
`node_modules/dsh-grok-workflow` 用 `readlink -f` 落回 profile 自己，`lib/client.js` 与包里那个逐字同哈希。
基线的包先被同名的新包覆盖过一次，基线**解包副本**（`packs/unpacked/package/lib/client.js`）与上面那对哈希仍可复核；
重打基线包随时可以从 `main` 的干净树重做。

## 2. 门禁（本分支，`d0c924a`）

`gate-d0c924a.out`（22 429 字节，原样拷入，未编辑）：`EXIT=0`、
`Test Files 101 passed (101)` / `Tests 1884 passed (1884)`、`client bundle: 347526 bytes → lib/client.js`、
`lib/ at d0c924a … byte-identical`。基线 `Test Files 100 / Tests 1870`、bundle 334321 字节。

## 3. 三态（同一会话、同一构建、一次真实运行）

请求都是「写 notes.md 三行安装步骤，再写 test.txt 一行 hello」这一件事。**一处必须说准**：
这句话**原样**发出去不会起工作流——两次真机都验过，模型直接拿普通写文件工具把两个文件写完，
会话日志里一条 `tool-workflow/*` 都没有；两侧因此都把工具名点了出来
（`用 grok_workflow 工具跑一个工作流：…`），前后可比。

| 侧 | 状态 | 文件 | 相对发送 | 页面自己怎么说 |
| --- | --- | --- | --- | --- |
| 基线 | 等你点头 | `before-waiting.png` / `before-10-waiting.txt` | 9.19 s | `任务团队 · 2 个任务` / `等你点头` / `正在拆活` + `开工` |
| 基线 | 进行中 | `before-running.png` / `before-20-running.txt` | 9.79 s | `任务 1 · 写 notes.md 安装步骤` / `执行 正在看 · 第 1 步，共 2 步` |
| 基线 | 已完成 | `before-done.png` / `before-30-done.txt` | 197.83 s | `做好了` / `2 步全过` / 9 条经过，末条 `汇总·第3稿（定稿）` |
| 本分支 | 等你点头 | `after-waiting.png` / `after-10-waiting.txt` | 15.84 s | 同上，**还没有 Guardian 块**（`guardian 0`、`columns 0`） |
| 本分支 | 进行中 | `after-running.png` / `after-20-running.txt` | 16.22 s | 两列已经画出来（`957px 240px`），右侧 Guardian 四块 |
| 本分支 | 已完成 | `after-done.png` / `after-30-done.txt` | 170.00 s | `做好了` / `2 步全过` / 8 条经过 + `展开全部` |

一次运行的墙钟：基线 **197.83 s**（宣布于 9.19 s），本分支 **170.00 s**（宣布于 15.84 s）。

## 4. 详情行、折叠、窄屏

**开一行**（`after-detail-open.png` / `after-40-detail-open.txt`，整页截图）：点第一行
`[data-gw-progress-plan-toggle]`，`aria-expanded` `false → true`，`aria-controls="gw-progress-task-detail-0"`，
`[data-gw-progress-task-detail]` 由 0 变 1，行内三行逐字是

```
21:38  执行  做完  打开子会话
21:38  检查  过了  打开子会话
21:38  复核  通过  打开子会话
```

也就是 `时刻 门词 结果词 [入口]`，每个门词只出现一次。

**折历史**（`after-fold-open.png` / `after-50-fold-open.txt`）：`[data-gw-progress-log-toggle]` 的标签
`展开全部 → 收起`，`aria-expanded` `false → true`，`[data-gw-progress-log]`（`id="gw-progress-log-list"`）
的 `data-expanded` 由 `false` 变 `true`，`max-height: 264px / overflow-y: auto` 变成
`max-height: none / overflow-y: visible`。

**窄屏 700 px**（`after-narrow-720.png`，行与折叠都开着）：`grid-template-columns` 由 `957px 240px`
收成单轨 **`693px`**，Guardian 从右栏落到历史下面（main `y=233…937`，side `y=953`），
`document.documentElement.scrollWidth` **700** = `clientWidth` **700**：没有横向滚动。

## 5. 前后钩子对照（真机，逐个 `querySelectorAll(...).length`）

| 钩子 | 基线（完成态） | 本分支（完成态） | 说明 |
| --- | --- | --- | --- |
| `[data-gw-progress-columns]` | **0** | **1** | 两列外壳；基线整页一条竖排 |
| `[data-gw-progress-main]` / `[data-gw-progress-side]` | 0 / 0 | 1 / 1 | 主栏放步骤、经过、交卷；侧栏放 Guardian |
| `[data-gw-progress-guardian]` | 1 | 1 | 两侧都有 |
| `[data-gw-progress-guardian-blocks]` | 0 | 1 | 分块外壳 |
| `[data-gw-progress-guardian-block]` | **0** | **4** | `status` / `budget` / `count` / `findings` |
| `[data-gw-progress-plan-toggle]` | **0** | **2** | 每个任务行一个，`aria-expanded="false"` |
| `[data-gw-progress-task-detail]` | **0** | **0 → 1** | 关着是 0；点开第一行是 1 |
| `[data-gw-progress-log-toggle]` | **0** | **1** | `展开全部 / 收起` |
| `[data-gw-progress-log-row]` | 9 | 8（开一行后 11） | 条数是这一轮 run 自己的性质，不是页面的 |
| `[data-gw-progress-plan-row]` | 2 | 2 | 两个计划任务 |

四条主断言全部成立：**columns 0 → 1**、**plan-toggle 0 → 2**、**log-toggle 0 → 1**、
**guardian block 0 → 4**。另有一条要说准：**「等你点头」那一瞬还没有 Guardian**，
所以那时 `columns` 仍是 0——「有 Guardian 才有两列」这条规则在真机上正好对上
（waiting：guardian 0 / columns 0；running 与 done：guardian 1 / columns 1）。

## 6. 控制台

两侧整轮 `console.json` 都是 `{"consoleErrors": [], "pageErrors": []}`
（`after-console.json`；基线那份同样为空，见 `before-console.json`）。

## 7. 没做到的（`NOT_RUN`）

1. **开工前的基线页面快照**（旧计划的 `00-pre-run.png/txt`）没有留下：空会话里进度 Tab 要等第一条
   消息才挂载，所以「发送前的进度页」在两侧都不存在；早期尝试留下的那两张在读图脚本定稿时被清掉，
   这里不补拍、也不冒充。
2. **失败 / 取消两态的真机截图**：两侧这一轮都是 `completed`，没有截。（组件用例覆盖，本轮不重跑。）
3. **点「开工 / 收下这版」之后输入框里真的出现批准词**：只验到按钮存在与文案，没有点下去看框内容。
4. **live 档案升级 / 重载 / 重启**：`NOT_RUN`（红线）。

## 8. 红线读数

```
$ stat -c '%y %n' ~/.dsh ~/.dsh/profiles
2026-11-22 23:40:20.274932030 +0800 /home/fish/.dsh        ← 全程未变
2026-11-22 16:59:46.687805286 +0800 /home/fish/.dsh/profiles ← 全程未变
$ touch ~/.dsh/.soak-probe       → Read-only file system   （本会话对 live home 只有读权限）
$ curl … http://127.0.0.1:3080/  → 401（开跑前、收尾后都是 401）
$ curl … http://127.0.0.1:3371/  → 401（隔离实例，收尾时关掉）
```

未 push、未打 tag、未 bump `package.json`、未 publish。

## 9. 清单

| 文件 | 是什么 | 支撑哪条结论 |
| --- | --- | --- |
| `before-waiting.png` / `before-10-waiting.txt` 等三对 | 基线三态（1500×1600 视口） | §3、§5 |
| `after-waiting.png` / `after-10-waiting.txt` 等三对 | 本分支三态 | §3、§5 |
| `after-detail-open.png` / `after-40-detail-open.txt` | 第一行打开后的整页 | §4 |
| `after-fold-open.png` / `after-50-fold-open.txt` | 历史展开后的整页 | §4 |
| `after-narrow-720.png` | 700 px、行与折叠都开 | §4 |
| `after-dom-notes.md` / `before-dom-notes.md` | 两侧钩子计数、网格与折叠的实测数值 | §5 |
| `after-console.json` / `after-timeline.txt` | 整轮 console 与逐次轮询记录 | §6、§3 |
| `before-console.json` / `before-timeline.txt` | 基线那一轮同样两份 | §6、§3 |
| `gate-d0c924a.out` | 本分支门禁原始输出（未编辑） | §2 |
| 本文件 | 环境、安装身份、三态、详情/折叠/窄屏、对照表、残留、红线 | 全部 |

scratch `.tmp/soak-layout/`（克隆 home、两个 tgz、驱动脚本、截图与日志）收尾整棵删除；
删掉 scratch 不会让上面的读数失去出处（截图与逐字文本已拷进本目录）。
