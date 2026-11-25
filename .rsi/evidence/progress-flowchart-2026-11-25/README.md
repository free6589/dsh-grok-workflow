# 进度页流程图：真机三态、开节点、四个宽度（`feat/progress-flowchart`）— 2026-11-25/26

验收对象：分支 **`feat/progress-flowchart`**，worktree `.tmp/wt-progress-flowchart`，
产品提交 **`e998a00`**（门禁 `EXIT=0`：`101 files / 1897 tests`、`client bundle: 340995 bytes`）。
真机这一轮**在 `e998a00` 上量出一个连线缺陷**，改了 `src/client/index.js` 的两处判定（浏览器侧镜像的测量函数），
新增两条几何用例；修复**未提交**，下面的读数因此分成两份：`e998a00`（旧）与「修复后工作树」（新）。

同一台机器、同一套隔离办法、同一句请求、同一份克隆档案，两个包装进同一个一次性 home 各跑一遍页面。

状态词汇按 `AGENTS.md` §2；每条读数都能回指本目录里的截图、逐字文本或一个命令。

## 1. 环境与安装身份（`CONFIRMED`）

Node **v26.8.1** / npm **11.19.0** / DSH **0.2.2-rc.3**。隔离 home `.tmp/soak-flow/dsh-home`，
profile **`flow-clone`**（`node scripts/clone-profile.mjs --src ~/.dsh/profiles/web --home .tmp/soak-flow/dsh-home --name flow-clone`）：

```
files 7734 -> 7734 (88511836 bytes)
links 5 (relinked 2, already dangling in the source 1)
parity 5/5 equal after redaction
dependencies 17 declared, 0 unresolved (8/21 bundles from the installation)
credentials redacted: 1 line(s) in 1 file(s); vendored fixtures: 4 file(s)
```

端口 **127.0.0.1:3373**，一次性工作区 `.tmp/soak-flow/work`。live `~/.dsh` 与 3080 上的实例全程没碰（§8）。

**克隆档案里只动了 soak 用的四类东西**（产品代码、默认值、schema 一个字没动）：

1. 删掉残留的 `mode: triage` 一行；
2. `roles` 五个角色全部钉到 `bifrost-responses / opencode-go/muse-spark-1.3-contributor`
   （本机 shell 有 `BIFROST_VIRTUAL_KEY`，没有 `AGENT2API_API_KEY`，不钉就一次子调用都起不来）；
3. `guardianModel` 同上；
4. `agent-default-model` 同上（默认 agent 模型），外加工作区指向一次性目录、端口 3373。

密钥只走进程环境，没有拷进 scratch，也没有落到任何产物里。

| 侧 | 包 | `sha256(tgz)` | `sha256(lib/client.js)` | 字节 | 版本读回 |
| --- | --- | --- | --- | --- | --- |
| `e998a00`（验收对象） | `dsh-grok-workflow-0.13.39.tgz` | `d53c262e78247d2405931216b32d1a3ead430e84276e4dd028df5488fe346f6e` | `d954f6c2e68d8db780cae8aef88089f350e7f745c78be3aaacca7ec0e3059863` | 340995 | `0.13.39` |
| 修复后工作树（未提交） | `dsh-grok-workflow-0.13.39-flowfix.tgz` | `edcc4354b4fe0fc999f9f80872f8ca3c2dd28536457624a6a2c7a1e9ca4512e7` | `5300934ee57109fbf24cb5ccd2c2ee7f5ad1657b257c8c9a981d5c356f4087c2` | 341814 | `0.13.39` |

两个包都是 `dsh plugin --profile flow-clone add file:…tgz` 装进去的**真拷贝**：装好的
`node_modules/dsh-grok-workflow` 用 `readlink -f` 落回 profile 自己，`lib/client.js` 与包里那个逐字同哈希（命令与回读见 §9 的命令块）。
`e998a00` 的包可以从 `git archive e998a00` 重新打出同一个哈希（本轮复核过：重打得到 `d53c262e…`）。

修复后工作树的本地门禁（只跑了这个块碰到的东西）：`npx vitest run` 六份 spec `258 passed`、
`npm run typecheck` 退出 0、`npx oxlint src test` `15 warnings / 0 errors`、`client bundle: 341814 bytes`。

## 2. 三态（同一会话、同一构建、一次真实运行）

请求（**必须点出工具名**，上一轮验过：不点名模型会直接拿普通写文件工具把两个文件写完，一条 `tool-workflow/*` 都不产生）：

> 用 grok_workflow 工具跑一个工作流：写 notes.md 三行安装步骤，再写 test.txt 一行 hello

运行真的做完了这件事：`work/notes.md` 三行安装步骤、`work/test.txt` 一行 `hello`，两个子任务各自 `completed`。

| 状态 | 文件（截图 / 逐字文本） | 相对发送 | 页面自己怎么说 | 钩子计数 |
| --- | --- | --- | --- | --- |
| 等你点头 | `soak-60-waiting.png` / `soak-60-waiting.txt` | **11.66 s** | `任务团队 · 2 个任务` / `等你点头` / `起点` `终点` / `还剩 1 步 / 共 2 步` / `开工` | node 2 · doing 0 · ord 0 · toggle 0 · calls 0 · left 1 · wires 1 · guardian 1 |
| 进行中 | `soak-61-running.png` / `soak-61-running.txt` | **12.18 s** | `进行中` / `起点` `执行` `终点` / `还剩 1 步 / 共 3 步` | node 3 · doing 1 · ord 0 · toggle 1 · calls 0 · left 1 · wires 2 · guardian 1 |
| 已完成 | `soak-62-done.png` / `soak-62-done.txt` | **131.65 s** | `已完成` / `起点` `执行` `检查` `复核` `汇总` `第 1 稿` `终点` / `还剩 0 步 / 共 6 步` / `收下这版` / `监控结束` | node 6 · doing 0 · ord 1 · toggle 4 · calls 0 · left 1 · wires 5 · guardian 1 |

一条要说准：**「等你点头」这一瞬页面上只有两个节点**（`起点`、`终点`），角标一个都没有，
dock 上那颗按钮是 `开工`；一旦有调用声明了任务，节点就变成三颗、按钮消失、计数行从 `共 2 步` 变 `共 3 步`。
回归点：`soak-20-running.png` 是同一轮较早那次运行（`e998a00`）的进行中态，两次读数一致（node 3 / doing 1 / wires 2）。

逐字文本见 `soak-6x-states.json`（三态的完整 `progressText` 与页面全文、时刻、钩子）。

## 3. 开一颗节点（`CONFIRMED`）

`soak-63-node-open.png` / `soak-63-node-open.json`。点第一个带任务的节点（`执行` 腿，`flow:0:execute:1`）：

| 读数 | 前 | 后 |
| --- | --- | --- |
| `[data-gw-progress-node-toggle][aria-expanded]` | `false`（四颗都是 false） | **`true`**（被点那颗） |
| `[data-gw-progress-node-calls]` | 0 | **1** |

行内逐字（`时刻 门词 任务名 结果词 [入口]`，节点上方只写腿词，任务名只在这里出现）：

```
0:01  执行  任务 1 · 写 notes.md 安装步骤  做完  打开子会话
0:01  执行  任务 2 · 写 test.txt hello     做完  打开子会话
```

两条都 `data-state="done"`，胶囊各一个（`打开子会话`）。

## 4. 四个宽度（`CONFIRMED`，节点开着量）

`soak-64-geometry.json` + `soak-64-w1500/900/700/480.png`。视口高度 1600，一颗节点开着
（`执行` 高 120 px，其余 31 px），因此「同一行高低不齐」这件事真的被量到了。

| 宽度 | `scrollWidth` / `clientWidth` | 每行节点数 | `flex-direction` | 连线 `path` 条数 | 折行处有没有假线 |
| --- | --- | --- | --- | --- | --- |
| 1500 | 1500 / 1500 | `[6]` | row | **5** | 无折行（6 节点一行，5 个间隙 5 条线） |
| 900 | 900 / 900 | `[4,2]` | row | **4** | 有折行：第 1 行 3 条 + 第 2 行 1 条，**跨行那一对没有线** |
| 700 | 700 / 700 | `[1,1,1,1,1,1]` | **column** | **5** | 逐行竖排，5 条竖线 |
| 480 | 480 / 480 | `[1,1,1,1,1,1]` | **column** | **5** | 同 700 |

四个宽度都 `scrollWidth === clientWidth`：**没有横向滚动**（`overflow-x` 在样式表里 0 次出现，单测钉死）。

## 5. 真机量出来的缺陷（本轮唯一的代码改动，`CONFIRMED`）

`e998a00` 上同一页、同一颗节点开着，量到的是（`soak-50-geometry.json` + `soak-50-w*.png`）：

| 宽度 | 每行节点数 | 连线条数 | 应有 |
| --- | --- | --- | --- |
| 1500 | `[7]` | **4** | 6 |
| 900 | `[4,3]` | **3** | 5 |

原因：判「同一行」用的是两框**中线距离**小于两者较矮者的一半。`执行` 节点一开，它比邻居高四倍，
中线就偏了 44.5 px（闸门 15.5 px），于是它左右两个间隙的线被判成「不同行」而不画——
可页面上它明明还在那一行，读者顺着从左往右看，两段路由是断的。

修法：把「同一行」改成两框**垂直方向有重叠**（竖排那一对用水平方向重叠），线的纵坐标取重叠段的中点。
改动只在浏览器侧镜像的测量函数里，样式、DOM、钩子一个没动；新增两条用例
（高低不齐的同一行必须画满、折行那一对必须不画、竖排一对必须画一条）钉住。

修复后的读数就是 §4 那张表（1500 从 4 条变 **5** 条、900 从 3 条变 **4** 条），
两种布局的「折行处没有假线」都仍然成立。

**这条改动还没提交**：`git status` 里 `src/client/index.js` 与 `test/progress-flow.spec.ts` 是脏的，
等包工头决定是否随本轮一起落地。落地后 §1 的第二个包哈希才是这一轮的最终身份。

## 6. 控制台

两轮（`e998a00` 与修复后）整页 `consoleErrors: []` / `pageErrors: []`，见
`soak-50-geometry.json` 与 `soak-64-geometry.json` 末尾两个数组。

## 7. 没做到的（`NOT_RUN`）

1. **`e998a00` 上的「等你点头」态**：第一次真机运行点开进度 Tab 后 0.52 s，但页面到 9.79 s 才第一次画出节点，
   那时已经是进行中（`soak-states.json` 里那次 9.79 s 的 `waiting` 实际是进行中，文件名保留但读数按进行中记）。
   修好这一版重跑时用 200 ms 轮询，11.66 s 抓到了真正的等你点头（`soak-60-*`）。
2. **失败 / 取消两态的真机截图**：这一轮两包各自的运行都是 `completed`，没有截（组件用例覆盖）。
3. **重启实例后再打开旧会话**：把包换成修复版后重启（同端口、同 home），页面对那次中断的会话报
   `模式服务没有回应：no live session session-998e831f…`，进度 Tab 显示「这次会话还没有工作流进度」。
   **没有冒充成读数**：§2–§4 的三态与几何全部来自重启后**新跑的那一次**运行。
4. **点 `开工` / `收下这版` 后输入框里真的出现批准词**：只验到按钮存在与文案，没点下去看框内容（上一轮同样留白）。
5. **与基线（`main` / 上一版布局）的逐屏对照**：这一轮改的是渲染，不涉及路由与准入，按 `AGENTS.md` §12 不重跑基线。

## 8. 红线读数

```
$ stat -c '%y %n' ~/.dsh ~/.dsh/profiles        # 开跑前
2026-11-25 23:14:14.025606767 +0800 /home/fish/.dsh
2026-11-22 16:59:46.687805286 +0800 /home/fish/.dsh/profiles
$ stat -c '%y %n' ~/.dsh ~/.dsh/profiles        # 收尾后，逐字相同
2026-11-25 23:14:14.025606767 +0800 /home/fish/.dsh
2026-11-22 16:59:46.687805286 +0800 /home/fish/.dsh/profiles
$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/    → 401（开跑前、收尾后都是 401）
$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3373/    → 401（隔离实例，收尾时关掉）
```

另一条旁证：本轮第一次执行 `dsh web --help`（忘了带 `DSH_HOME`）直接被写保护拦住——
`EROFS: read-only file system, open '/home/fish/.dsh/profiles/web/cordis.yml'`，说明这个会话对 live home 只有读权限。

未 `git add`、未 commit、未 push、未打 tag、未 bump 版本、未 publish。

## 9. 命令与清单

关键命令（按执行顺序）：

```bash
node scripts/clone-profile.mjs --src ~/.dsh/profiles/web --home .tmp/soak-flow/dsh-home --name flow-clone
git archive e998a00 | tar -x -C .tmp/soak-flow/pack-tree && (cd .tmp/soak-flow/pack-tree && npm pack --pack-destination ../)
DSH_HOME=… dsh plugin --profile flow-clone add file:…/dsh-grok-workflow-0.13.39.tgz
DSH_HOME=… dsh --profile flow-clone --port 3373 --host 127.0.0.1 --no-open
node …/soak-flow/final.mjs          # 三态 + 开节点 + 四宽度（headless Chromium 1248）
```

| 文件 | 是什么 | 支撑哪条结论 |
| --- | --- | --- |
| `soak-60-waiting.png` / `.txt` | 等你点头（11.66 s） | §2 |
| `soak-61-running.png` / `.txt` | 进行中（12.18 s） | §2 |
| `soak-62-done.png` / `.txt` | 已完成（131.65 s） | §2 |
| `soak-6x-states.json` | 三态的钩子、逐字 `innerText`、时刻、控制台 | §2、§6 |
| `soak-63-node-open.png` / `.json` | 开一颗节点前后的 `aria-expanded`、`calls` 与行内容 | §3 |
| `soak-64-geometry.json` + `soak-64-w{1500,900,700,480}.png` | 四个宽度的溢出、排布、连线 | §4 |
| `soak-50-geometry.json` + `soak-50-w{1500,900,700,480}.png` | `e998a00` 同四项（缺陷证据） | §5 |
| `soak-40-node-open.png` / `.json` | `e998a00` 的开节点读数 | §3 对照 |
| `soak-20-running.png` / `.txt` | `e998a00` 的进行中态 | §2 对照 |
| `soak-states.json` | 第一次运行（`e998a00`）的钩子轨迹，含那次没赶上窗口的 `waiting` | §7.1 |
| `soak-timeline.txt` | 每次发送、每个状态的时刻与钩子，逐行 | 全部 |
| 本文件 | 环境与包身份、三态、开节点、宽度、缺陷、控制台、留白、红线 | 全部 |

scratch `.tmp/soak-flow/`（克隆 home、两个 tgz、驱动脚本、截图与日志、work 目录）收尾**整棵删除**；
删掉 scratch 不会让上面的读数失去出处（截图、逐字文本、几何 JSON 都在本目录里）。
