# 进度页手机排版：矩阵变分支树（`fix/flowchart-mobile-tree`）— 2026-11-26

验收对象：分支 **`fix/flowchart-mobile-tree`**，worktree `.tmp/wt-mobile-tree`，基点提交 **`33c170b`**
（= 当前 `main` 的尖端，也是 `git merge-base HEAD main`；这条分支**自己一颗提交都没有**，全部改动还在工作树里）。
>720px 一个字没动：泳道矩阵（行 = 任务号、列 = 腿）原样。**≤720px 换成树**——一条腿一整行，腿走的那几个任务挂在它下面
两条轨上（偶数位左轨、奇数位右轨，一条腿只有一格时跨两轨），任务卡折行而不再以省略号收尾；连线层认几何、把拓扑画成树
而不是一条链：腿头叉出去、每张卡各自收回下一张腿头，没有卡的腿留一根直线。`lib/client.js` 由 `npm run build` 在**同一块**
里重建（不是单独的构建提交）。

状态词汇按 `AGENTS.md` §2；每条读数要么能回指本目录里的截图 / JSON / 一条命令，要么标了 `NOT_RUN` / `BLOCKED`。
门禁四份转录就在本目录（`gate-tsc.out` / `gate-lint.out` / `gate-specs.out` / `gate-full.out`，§2 逐份列了末行读数）。

## 1. 环境与安装身份（`CONFIRMED`，本节每个数本轮自己读过）

Node **v26.8.1** / npm **11.19.0** / DSH **0.2.2-rc.3** / `Linux 7.2.11-arch1-1 x86_64`。
隔离克隆：

```bash
node scripts/clone-profile.mjs --src ~/.dsh/profiles/web --home .tmp/soak/dsh-home --name web-clone
```

`clone-report.txt` 逐字：`files 7745 -> 7745 (88611936 bytes)`、`links 5`（relinked **2**、源里本来就已经悬空
**1**——就是 `node_modules/git` 那条 `github.com:free6589/dsh-grok-workflow.git`）、`parity 5/5 equal after redaction`、
`dependencies 17 declared, 0 unresolved (8/21 bundles from the installation)`、
`credentials redacted: 1 line(s) in 1 file(s)`（`cordis.patch.yml` 第 379 行，命中 `openai-style-key`；
另有 **4** 个 vendored 夹具文件命中，是 `node_modules/dsh-infinite-gen-5/adapters/` 里测试自带的假钥匙，没动）。
实例：`dsh --profile web-clone --host 127.0.0.1 --port 3402 --no-open`，工作区指向可写的一次性目录 `.tmp/soak/work`。
收尾时该端口已关（`curl 127.0.0.1:3402` 读 `000`，连接不上）。

| 侧 | 包 | `sha256` | 字节 | 版本读回 |
| --- | --- | --- | --- | --- |
| 打出来的包 | `dsh-grok-workflow-0.13.49.tgz` | `0747fb569714b7bc73d988e5c10e603846c3456598bab0cb000e7bb6012b6b2c` | **1013839** | — |
| 装进克隆的那份 | `node_modules/dsh-grok-workflow` | `lib/client.js` = `586c24c2d958b0cf51015300dc9276cb9259cf51115da7a5539d15f178dab223` | 386534 | **`0.13.49`** |

装进去的是**真拷贝**（`readlink -f` 落回 profile 自己，不指回工作树），而且那一份 `lib/client.js` 与
`src/client/index.js` **同哈希、同字节数**（本轮 `sha256sum` / `wc -c` 各读一次）——包里带的就是这棵树构建出来的浏览器包。

**模型只动了一处，照实记**：全部角色与 Guardian 钉到 `bifrost-responses / opencode-go/muse-spark-1.3-contributor`
（本机 shell 有 bifrost 钥匙、没有 agent2api 那把），而 live 档案的 worker 链把这条路由**写了两遍**，
插件自己的配置校验因此拒载（`roles.worker repeats the same route twice`）——克隆里把那条链折成一条。
产品代码、默认值、schema 一个字没动；密钥只走进程环境，没有进 scratch 的任何产物。

## 2. 门禁（`CONFIRMED`，四份转录在本目录：`gate-tsc.out` / `gate-lint.out` / `gate-specs.out` / `gate-full.out`）

| 命令 | 读数 |
| --- | --- |
| `npx tsc -p tsconfig.json --noEmit` | **`TSC_EXIT=0`**（转录 `gate-tsc.out`，只有这一行） |
| `npx oxlint src test` | `Found 15 warnings and 0 errors.`（187 文件 / 96 条规则） |
| `npx vitest run test/progress-connector.spec.ts test/progress.spec.ts test/progress-flow.spec.ts test/progress-lanes.spec.ts test/progress-tab.spec.ts test/client.spec.ts`（**重建之前**） | `1 failed \| 340 passed (341)`——唯一的红是 `ships lib/client.js byte-identical to the source`，也就是「包还没重建」那一句 |
| `npm run build` → `client bundle: 386534 bytes` 之后 `npx vitest run test/client.spec.ts` | **`153 passed`** |
| `TMPDIR=$PWD/.tmp npx vitest run` | **`105 files / 2045 passed`**、`EXIT=0`、`85.95s`（这一格是派单那一次；转录 `gate-full.out` 是同树另一次、用例数相同、`89.53s`、`FULL_EXIT=0`） |
| `npm run build` 之后的 `git status --short` | 只有本块该动的 7 个文件（下表 §9），无 `*.log` / `*.tgz` / `*.bak` 遗留 |
| `npm pack` | `dsh-grok-workflow-0.13.49.tgz` = **1013839** 字节、`sha256` 前 16 位 `0747fb569714b7bc` |
| `npm run ci` | **`NOT_RUN`**（`AGENTS.md` §12：整份门禁在发布提交上跑一次） |
| `npm run verify:lib` | **`NOT_RUN`** |

四份转录（**同一棵工作树、同一块里重跑落盘**，不是从别处搬来的），每份的**末行就是它的退出码**：

| 转录 | 行数 / 字节 | 末行与前一行读数 |
| --- | --- | --- |
| `gate-tsc.out` | 1 / **11** | `TSC_EXIT=0`（**只有这一行**，没有诊断输出） |
| `gate-lint.out` | 152 / **7785** | `Found 15 warnings and 0 errors.` · `Finished in 73ms on 187 files with 96 rules using 6 threads.` · **`LINT_EXIT=0`** |
| `gate-specs.out` | 24 / **1432** | `Test Files 6 passed (6)` · `Tests 341 passed (341)` · `Duration 3.03s` · **`SPECS_EXIT=0`** |
| `gate-full.out` | 208 / **14658** | `Test Files 105 passed (105)` · `Tests 2045 passed (2045)` · `Duration 89.53s` · **`FULL_EXIT=0`** |

**两处口径要说准**：
① 上表第三行「定向六份 spec **重建之前** `1 failed | 340 passed (341)`」那一次**没有转录**——它是包还没重建时的读数；
`gate-specs.out` 是**重建之后**的同一组六份 spec，`341 passed (341)`，那一条红（`ships lib/client.js byte-identical to the source`）
正是被重建消掉的，别把两份读数当成互相矛盾。
② `gate-full.out` 的 `Duration 89.53s` 与更早一次派单读数的 `85.95s` 是同树两次跑的差别，**用例数一样是 2045**；
要引用就引转录里的 `89.53s`。`grep -c FAIL gate-full.out` = **0**，三处 `failed` 字样都不是失败
（一处是 checkpoint 夹具故意造的 `[smoke] status=failed`、两处是用例标题）。

**本轮自己动手读过、也能当场复核的三件事**（都是读，不是重跑门禁）：
① `sha256(lib/client.js) == sha256(src/client/index.js)` = **`586c24c2…dab223`**、各 **386534** 字节；
② `.tmp/soak/dsh-grok-workflow-0.13.49.tgz` 的 `sha256` = **`0747fb569714b7bc73d988e5c10e603846c3456598bab0cb000e7bb6012b6b2c`**、**1013839** 字节；
③ 装进克隆的那一份读回 **`0.13.49`**、`lib/client.js` 同哈希。

## 3. 三张手机屏（390 CSS px，同一会话、同一构建、一次真实运行）

视口 `390×844`、`deviceScaleFactor 3`（PNG 是 `1170×2532`）。请求与上一块同一句三并行任务的提示词（**必须点出工具名**，
否则模型会拿普通写文件工具把活干完、一条 `tool-workflow/*` 都不产生）。

| 屏 | 文件 | 相对发送 | 页面自己怎么说 | 结构读数 |
| --- | --- | --- | --- | --- |
| ① 等你点头 | `soak/10-waiting.png`（+`-full`） / `10-waiting.json` | **11.13 s** | `等你点头` / `还剩 1 步 / 共 2 步` | `nodes 2` · `cols 2` · `subs 0`（**0 张任务卡**）· `wires 0`（`wirePaths` **1** 条：`M192 34 L192 58`，就是起点直接进终点那一根）· `headCuts 0` · `cardsCut 0` · `crossings []` |
| ② 进行中 | `soak/20-running.png` / `20-running.json` | **11.65 s** | `进行中` / `还剩 1 步 / 共 3 步` | `nodes 3` · `subs 3` · **`wires 6`（`wirePaths` 7 条 = 起点进腿 1 根 + **3 叉 + 3 收**）** · 两轨 `183.5px 183.5px` · 流程宽 **383** · `390 / 390` |
| ③ 已完成 | `soak/30-done.png` / `30-done.json` | **151.93 s** | `已完成` / `还剩 0 步 / 共 7 步` | **7 条腿 / 9 张任务卡 / `wires 20`（`wirePaths` 21 条）** · 每张卡 `state: done` · `headCuts 0` · `cardsCut 0` · `crossings []` · 两轨 `183.5px 183.5px` |

**`wires` 这一列的口径（`CONFIRMED`，`capture.mjs` 里写着）**：`wires: paths.length - 1`，而 `paths` 取的是
`svg.gw-progress-wires > path`（**不含** `<marker>` 里的三角形）。所以三张屏真正画在页面上的条数是 **1 / 7 / 21**，
报告里那列 `0 / 6 / 20` 少算的正好是**第一根**（起点进第一条腿）。读这一页的连线数量请用 `wirePaths` 的长度。

三张屏的连线形状（`20-running.json` 的 `wirePaths` 逐字，连线层坐标）：

```
M192 34  L192 58                                       起点 → 执行
M192 92  L192 104 L96  104 L96  116                    执行 → 任务 1（左轨）
M192 92  L192 104 L287 104 L287 116                    执行 → 任务 2（右轨）
M192 92  L192 181 L96  181 L96  193                    执行 → 任务 3（左轨第二行，横杆落在它自己那段空档的中点）
M96  169 L96  181 L190 181 L190 258 L192 258 L192 270   任务 1 → 终点（走两轨之间的自由竖带）
M287 169 L287 258 L192 258 L192 270                    任务 2 → 终点
M96  246 L96  258 L192 258 L192 270                    任务 3 → 终点
```

「叉一次、收一次」在这里是字面意思：**三根叉线都从腿头底边的同一点（`x=192`）出发**，三根收线都落进终点顶边的同一点；
三条并行分支在图上从头到尾都是三条，没有被压成一条链。

## 4. 两个宽度（`CONFIRMED`）

| 宽度 | 文件 | 读数 |
| --- | --- | --- |
| **360** CSS px（已完成那一页） | `soak/40-narrow-360.png`（+`-full`） / `40-narrow-360.json` | `scrollWidth 360 === clientWidth 360`（**没有横向滚动**）、`flowWidth 353`、两轨 `168.5px 168.5px`、**被截断的卡片 0 张**（`cardsCut 0`）、**被截断的腿词 0 个**（`headCuts 0`）、**穿过卡片内部的线 0 条**（`crossings []`）、`wires 20`（`wirePaths` 21） |
| **1400** CSS px（同一次已完成的运行） | `soak/50-desktop-1400.png` | `flex-direction: row`、`flex-wrap: wrap`、泳道 `26px 26px 26px`、节点高 `32`、格高 `26`、三条工作腿的逐 lane `top` 极差 **0 px**（`176/176/176`、`208/208/208`、`240/240/240`）、**11 条连线**、无横向溢出 |

**1400 那一格的口径**：它是派单给的读数，本目录里**只留了那一张 PNG、没有 JSON**，所以它不能像前三张屏那样
逐字段复核；三条工作腿的逐 lane `top` 与 `0.13.48` 发版时那份读数（§23.3 的 `176/176/176`）逐字相同，桌面那一半确实没动。
360 那一格与 390 那三格都有 JSON，可逐字段读。

`console.json`：`consoleErrors: []`、`pageErrors: []`——整轮三个状态加两次改宽**没有一个控制台错误**。

## 5. 效果图先行（`mock/`，改代码之前先定形状）

先画图再写实现：`mock/mobile-tree.html` 是一张自包含的效果图，用真 token 名、真 DOM 结构画手机上应该长什么样，
分支线与收回线是**量矩形**量出来的，不是手画坐标。`mock/README.md` 是它自己的说明（怎么开、三张屏各看什么、
哪张图看得见分叉点与收回点、三档宽度实测表）。本目录留下三张：

| 文件 | 是什么 |
| --- | --- |
| `mock/zoom-390-running.png` | 进行中那一屏**放大**：分叉点（腿 → 三张卡）与收回点（三张卡 → 下一张腿）在同一张图里都看得见 |
| `mock/shot-390.png` | 三屏并排的效果图整张（等你点头 / 进行中 / 已完成） |
| `mock/verify-390.png` | **换成真 CSS + 真 DOM** 那一版的 390px 帧：它按宿主的方式加载浏览器包、用真组件渲染一次运行、把 stub 树序列化成 HTML 套进线上样式表，iframe 的视口就是 390，所以 media query 与量到的宽度不可能对不上 |

`mock/README.md` 记的两组数要分清：`mobile-tree.html`（效果图自己的 CSS）390px 下任务名可用 **160px**，
`verify.html`（真 CSS + 真 DOM）390px 下 **153px**——同一档宽度两个数，因为前者是我写的排版、后者是产物里的排版；
**评审该看后面那组**。

## 6. 两条不影响正确性的观感事实（`CONFIRMED`，照实记）

1. **一条收回路径带 2px 的横错位**：`M96 169 L96 181 L190 181 L190 258 L192 258 L192 270` ——从 `x=190` 挪到 `x=192`。
   原因是它走的自由竖带（两轨之间那条 8px 缝，量出来 `187.5–195.5`）取的是**缝内侧 2px**（`189.5 → 190`），
   而主干是腿头自己的中心（`192`）。100% 缩放下看不见，也不影响任何判读；360px 那一屏同样一处，`175 → 177`。
2. **线仍是 `--dsw-alias-border-l2`**：浅色主题下是一根安静的灰线，和矩阵一直用的同一个 token。
   **没有任何状态由线承载**——状态在点上、在卡片自己的颜色上、在说出口的状态词上。

## 7. 没做到的（`NOT_RUN` / `BLOCKED`）

1. **真机（真手机）`NOT_RUN`——操作者拍的，不是没跑成**：原话是「永远不用真手机，电脑模拟手机屏（360/390 CSS px
   真浏览器渲染）即可」。`100.111.111.120:5555` 那台手机 adb 上是连得上的，但它停在安全锁屏（先弹防误触遮罩、
   再是 PIN 输入页），截图只能拿到锁屏，所以它的读数标 **`BLOCKED`**；本轮所有手机读数都来自模拟屏（390 / 360 真浏览器渲染）。
   **这里没有任何一句是真机读数**，别有读成「真机也验过」。
2. **390px 下点不到「进度」这个页签（`CONFIRMED`，本块唯一一处诚实的缺口）**：宿主机在 390px 会把会话页签
   （`对话 / 轨迹 / 进度`）收进 `···` 溢出菜单，所以装置是在 **1100px** 打开 `进度` 页签、再把窗口缩到 390 的。
   缩完之后页面**就是手机页**（断点是纯 CSS，连线层在 resize 上重测），但「在 390px 用手指点到这个页签」这一动作
   本轮没有走通——它属于宿主那一层的溢出菜单，不在本块范围。
3. **`npm run ci` / `npm run verify:lib` 都是 `NOT_RUN`**（§12：整份门禁在发布提交上跑一次）。
4. **`npm run ci`（整份发版门禁）与 `npm run verify:lib` 没有跑**：本目录那四份是块内门禁（typecheck / lint / 定向 spec / 整仓 vitest），
   不是发版门禁——`AGENTS.md` §12 说整份门禁在发布提交上跑一次，本块没到那一步。
5. **1400px 只留了一张 PNG、没有 JSON**（§4 末尾已说明）。
6. **失败 / 取消两态的窄屏截图没有**：本轮跑的是 `completed` 的三种状态，`未通过` 与 `已取消` 两页在手机上长什么样没拍；
   它们与 `已完成` 共用同一张图（`D-158` / §23.6），所以形状上的风险低，但**没有读数就不冒充**。

## 8. 红线读数（`CONFIRMED`，本轮只读）

```
$ stat -c '%y %n' ~/.dsh ~/.dsh/profiles
2026-11-25 23:14:14.025606767 +0800 /home/fish/.dsh
2026-11-22 16:59:46.687805286 +0800 /home/fish/.dsh/profiles
$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/   → 401
$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3402/   → 000（隔离实例已关）
```

两个 mtime 都落在本块开工（14:02 起）**之前**。全程：

- **没碰 live 档案**：`~/.dsh` 与 `~/.dsh/profiles` 只有上面的 `stat`，没有读里面的配置、没有写、没有重载、没有重启；
  3080 上那个实例前后只读了一次根路径（`401`）。soak 用的是克隆出来的 `.tmp/soak/dsh-home`，与 live 无关。
- **没提交、没推送、没打标签、没发版、没抬版本**：工作树里的改动一个都没 `git add`；`package.json` 仍是 `0.13.49`。

**已知会留在盘上的东西（一次性，可整棵删）**：`.tmp/soak/`（**109M**：克隆 home、那个 tgz、驱动脚本、两份 server 日志、
`work/` 工作区）与 `.tmp/mock/`（效果图与它的三张截图）。两者都在 `.tmp/` 下、都被 `.gitignore` 挡住；
`soak/*.png` 与 `soak/*.json` 已复制进本目录，**删掉 scratch 不会让上面的读数失去出处**。

## 9. 命令与清单

关键命令（按执行顺序）：

```bash
node scripts/clone-profile.mjs --src ~/.dsh/profiles/web --home .tmp/soak/dsh-home --name web-clone
npm pack --pack-destination .tmp/soak                       # dsh-grok-workflow-0.13.49.tgz
DSH_HOME=.tmp/soak/dsh-home dsh plugin --profile web-clone add file:…/dsh-grok-workflow-0.13.49.tgz
DSH_HOME=.tmp/soak/dsh-home dsh --profile web-clone --host 127.0.0.1 --port 3402 --no-open
node .tmp/soak/capture.mjs                                  # 三态 + 360 改宽（Playwright，390×844 @3x）
node .tmp/soak/desktop.mjs                                  # 同一页的 1400px 读数（只打到 stdout）
```

| 文件 | 是什么 | 支撑哪条结论 |
| --- | --- | --- |
| `gate-tsc.out` | 类型检查转录（1 行、11 字节）：`TSC_EXIT=0` | §2 |
| `gate-lint.out` | lint 转录（152 行 / 7785 字节）：`15 warnings / 0 errors`、187 文件 / 96 规则、`LINT_EXIT=0` | §2 |
| `gate-specs.out` | 定向六份 spec 转录（24 行 / 1432 字节）：`6 passed (6)` / `341 passed (341)`、`SPECS_EXIT=0` | §2 |
| `gate-full.out` | 整仓 vitest 转录（208 行 / 14658 字节）：`105 passed (105)` / `2045 passed (2045)`、`FULL_EXIT=0` | §2 |
| `soak/10-waiting.png` / `-full` / `.json` | 等你点头（11.13 s）：2 节点、0 张卡、1 根直线 | §3 |
| `soak/20-running.png` / `-full` / `.json` | 进行中（11.65 s）：3 卡、7 条路径（3 叉 + 3 收 + 1） | §3、§6.1 |
| `soak/30-done.png` / `-full` / `.json` | 已完成（151.93 s）：7 腿 / 9 卡 / 21 条路径 | §3 |
| `soak/40-narrow-360.png` / `-full` / `.json` | 同一页缩到 360：不滚动、无截断、无线穿卡 | §4 |
| `soak/50-desktop-1400.png` | 同一运行在 1400px：矩阵原样、逐 lane 极差 0 | §4 |
| `soak/console.json` | `consoleErrors: []`、`pageErrors: []` | §4 |
| `soak/shots.json` | 三屏的一行摘要（chip / subs / wires / 截断 / 穿卡 / 滚动） | §3 |
| `mock/README.md` | 效果图自己的说明（三档宽度表、哪张图看什么） | §5 |
| `mock/zoom-390-running.png` | 分叉点与收回点的放大图 | §5 |
| `mock/shot-390.png` | 效果图整张（三屏） | §5 |
| `mock/verify-390.png` | 真 CSS + 真 DOM 的 390px 帧 | §5 |
| `clone-report.txt`（在 scratch 里） | 克隆的 parity / links / dependencies / redactions 逐项 | §1 |
| 本文件 | 环境与安装身份、门禁、三屏、两个宽度、效果图、观感事实、留白、红线、清单 | 全部 |

**本块动过的七个文件**（`git diff --numstat`，本轮自己读）：`src/client/index.js` +258 −20、`lib/client.js` +258 −20（重建产物，与源码同哈希）、`test/progress-connector.spec.ts` **+135**（一个新 `describe`、5 条新用例）、
`test/progress-lanes.spec.ts` **+73**（一个 `describe`「a stacked leg is a tree」、2 条）、
`test/progress-flow.spec.ts` +157 −45（7 条新、3 条换成树几何）、`test/client.spec.ts` +20 −5（换掉过期的断点钉子）、
`docs/knowledge/DESIGN-progress-tab.md` +49（§24）。

**收口之后 `git diff --numstat` 会多出几行**，那是本目录的收口本身：`CHANGELOG.md`（`[Unreleased]` 里中英各一条）与
`docs/knowledge/` 的四份记忆（`STATE.md` / `VALIDATION.md` / `HANDOFF.md` / `DECISIONS.md` 的 `D-170`），
一次写在同一份工作树里。**上面那七个文件是本块的产品改动**，记忆与日志不算在内。
