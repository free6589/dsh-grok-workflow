# 进度页任务面板：一次真机 soak（2026-11-26）

被测的是 `feat/task-panel` 上的提交 **`45909bb`**（`feat(progress): the tab is a task panel — one
sentence, a Mermaid-shaped tree, and where it is stuck`）。这个提交上没有标签
（`git describe` = `v0.13.52-2-g45909bb`，`git tag --contains HEAD` 为空），包版本 **`0.13.52`**。

做的事只有一件：把这一版真的装进一台隔离的实例里，跑真的工作流，把进度页在真的屏幕上拍下来，
把每个读数留在 `soak/readings.json`。产品代码、测试、`docs/`、`package*.json`、`CHANGELOG.md`
一个字没改，没有提交、没有推送、没有打标签。

## 1. 这一轮跑了什么

一次工作流不够用，实际跑了三次。原因写在下面，不藏：

| # | 驱动方式 | 结果 | 产出的证据 |
| --- | --- | --- | --- |
| A | 1500×1600 桌面 | 完成（129.8 s） | `desktop-1500-running` / `desktop-1500-done` / 两个点击态 |
| B | 390×844 手机 | **中途关掉浏览器**：这个宽度下会话标签条只有「对话 / 轨迹」，进度页不在这条栏上，采样器 40 s 后放弃 | 没有用作证据（工作流本身仍在服务端跑完，三个文件 18:39 又写了一遍） |
| C | 390×844 手机 | 完成（149.3 s） | `phone-390-running` / `phone-390-done` / `phone-390-trace` |

后来发现并且用探针钉死的一件事：**进度页在 ≥500 px 的宽度才自己出现在标签条上；420/360/390 px
时标签条只剩「对话 / 轨迹」，整份 DOM 里连「进度」两个字都没有**，它退到了标签条右侧的
**「更多会话视图」**菜单里。第三次（C）就是从这里进去的，所有手机/平板截图都走这条路。

三次发出去的都是同一句话，逐字未改（压成一行）：

```text
用 grok_workflow 工具跑一个工作流，拆成三个互相独立、可以并行的任务，每个任务都要真的写一个文件：任务一：写 notes.md，内容是三行安装步骤；任务二：写 test.txt，内容是一行 hello；任务三：写 third.txt，内容是一行 bye。三个任务并行跑，不要串行；跑完把每个任务写了什么汇总一下。
```

三个任务真的并行跑了，三个文件也真的写出来了（`notes.md` 90 B、`test.txt` 6 B、`third.txt` 4 B，
内容与要求一致：三行安装步骤 / 一行 hello / 一行 bye）。

## 2. 环境与身份（每条都能回指一个命令，见 `install.txt`）

| 项 | 读数 |
| --- | --- |
| 提交 | `45909bb`（无标签） |
| 包 | `dsh-grok-workflow-0.13.52.tgz`，1 025 655 B，`sha256 1554571b6ce414c0a3f2fe670118ac1786f7bf6aa981b5669c58c3387c0eac3d` |
| 客户端包 | 399 448 B，`sha256 4f873072…f0eeb1`；与 `src/client/index.js` 逐字节相同；重跑 `npm run build` 后 `git status` 仍为空（构建可复现） |
| 装好的副本 | 版本读回 `0.13.52`；`lib/client.js` 与 `lib/index.js` 的 sha256 都与工作树相同；插件目录内软链 **0** 个；`readlink -f` 落回 clone 自己 |
| 安装方式 | `dsh plugin --profile web-clone add file:<tgz>`；profile 依赖里写死的就是这个 tgz 的 `file:` 绝对路径，不是范围、不是链接 |
| 隔离 home | `.tmp/soak-panel/dsh-home`（从 `~/.dsh/profiles/web` 克隆：7745 个文件、5 个链接、5/5 在抹除凭据后逐字节相等） |
| 工作区 | `.tmp/soak-panel/work`（一次性） |
| 端口 | **3411**（开跑前实测空闲，没有退到 3412） |
| 运行时 | Node v26.8.1 / npm 11.19.0 / dsh 0.2.2-rc.3 |

**克隆里只动了 soak 自己的东西**（全部记录在 `timeline.json.environment.modelPins`）：

- 删掉 `grok-workflow` 配置里已经不再被读取的 `mode: triage` 一行（`src/config.ts` 把 `mode` 列为已移除的键）；
- 四个角色（worker / verifier / supervisor）与 `guardianModel` 从 `agent2api/…` 改钉到
  `bifrost-responses/opencode-go/muse-spark-1.3-contributor`——本机没有 `AGENT2API_API_KEY`，
  不钉就一次子调用都起不来；planner / synthesizer / 默认 agent 本来就是这一条；
- 工作区指向一次性目录，端口 3411。

密钥只走进程环境（`~/.dsh/bifrost.env` 读进那个进程），没有落进任何写出的文件。

## 3. 截图：每一张是什么

| 文件 | 状态 | 视口 / 像素 | 这张图里能看见什么 |
| --- | --- | --- | --- |
| `soak/desktop-1500-running.png` | 进行中 | 1500×1600 / 1500×1600 | 顶部「任务团队 · 3 个任务」+ 蓝色「进行中」圆牌 + 一行「第 6 步，共 7 步 · 还剩约 25 秒」；树里 16 个节点 21 条线，当前那一步（汇总 第 2 稿）描边高亮；Guardian 卡「监控中」；底部没有按钮 |
| `soak/desktop-1500-done.png` | 已完成 | 1500×1600 | 绿色「已完成」+「第 7 步，共 7 步」；起点→执行→检查→复核→汇总(第1稿)→汇总(第2稿)→终点，每个工作环节下面挂着三条任务分支；Guardian「监控结束 / 0 条处置记录」；整幅「收下这版」 |
| `soak/desktop-1500-node-open.png` | 已完成 + 点第一颗任务节点一次 | 1500×1600 | `任务 1 · 写 notes.md` 下面弹出它的调用行（`18:36 执行 任务 1 · 写 notes.md 做完 打开子会话`），同时它两头那几条线被点亮、其余线退到 30% |
| `soak/desktop-1500-trace.png` | 已完成 + 同一颗节点再点一次 | 1500×1600 | 列表收起、线也灭了——**和说明书不一样，见 §7.4**；这张图就是那一刻的真相 |
| `soak/desktop-1500-trace-open.png` | 已完成 + 第三次点同一颗节点 | 1500×1600 | 列表与线一起回来（5 条亮 / 19 条暗），证明这是一个开关而不是两个 |
| `soak/phone-390-running.png` | 进行中 | 390×844 / 780×1688 | 手机上一列排布：牌 + 「第 2 步，共 3 步」，起点/执行/任务三支，还没有横向滚动 |
| `soak/phone-390-done.png` | 已完成 | 390×844 / 780×1688 | 同一页收窄后的完成态：16 节点 21 线全部竖排，「收下这版」在底部输入框上方 |
| `soak/phone-390-trace.png` | 已完成 + 手指点一次分支 | 390×844 / 780×1688 | 分支列表展开、相关的线点亮、其余变暗；读数里 `calls 1 / trace 5 / dim 19` |
| `soak/phone-360-done.png` | 已完成 | 360×800 / 720×1600 | 最窄一档：仍然 `scrollWidth = clientWidth = 360`，没有横向溢出。**画面停在树的中段**（复核 → 汇总），顶部那行字不在框里，那两行读数仍是同一刻读的 |
| `soak/tablet-700-done.png` | 已完成 | 700×900 / 1400×1800 | 断点那一档：标签条直接把「进度」放在明面上（不用菜单），树宽出来但仍是一列；**同样停在树的中段**，顶部那句不在框里 |

## 4. 读数（`soak/readings.json`，每条和它旁边那张图同一刻读的）

`scrollWidth = clientWidth` 这一列是宽度的硬指标：相等就表示没有横向滚动条。

| 读数 | 宽度 | 状态 | 节点 | 线 | 滚动宽 = 客户宽 | 调用列表 | 亮线/暗线 | 牌子 | 那一行字 | 卡住那句 | 底部按钮 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `desktop-1500-running` | 1500 | 进行中 | 16 | 21 | 1500 = 1500 | 0 | 0 / 0 | 进行中 | 第 6 步，共 7 步 · 还剩约 25 秒 | 无 | （空） |
| `desktop-1500-done` | 1500 | 已完成 | 16 | 21 | 1500 = 1500 | 0 | 0 / 0 | 已完成 | 第 7 步，共 7 步 | 无 | 收下这版 |
| `desktop-1500-before-click` | 1500 | 已完成 | 16 | 21 | 1500 = 1500 | 0 | 0 / 0 | 已完成 | 第 7 步，共 7 步 | 无 | 收下这版 |
| `desktop-1500-node-open` | 1500 | 已完成 | 16 | 21 | 1500 = 1500 | **1** | **5 / 19** | 已完成 | 第 7 步，共 7 步 | 无 | 收下这版 |
| `desktop-1500-trace` | 1500 | 已完成 | 16 | 21 | 1500 = 1500 | **0** | **0 / 0** | 已完成 | 第 7 步，共 7 步 | 无 | 收下这版 |
| `desktop-1500-node-open-again` | 1500 | 已完成 | 16 | 21 | 1500 = 1500 | **1** | **5 / 19** | 已完成 | 第 7 步，共 7 步 | 无 | 收下这版 |
| `phone-390-running` | 390 | 进行中 | 6 | 7 | 390 = 390 | 0 | 0 / 0 | 进行中 | 第 2 步，共 3 步 | 无 | （空） |
| `phone-390-done` | 390 | 已完成 | 16 | 21 | 390 = 390 | 0 | 0 / 0 | 已完成 | 第 7 步，共 7 步 | 无 | 收下这版 |
| `phone-390-before-tap` | 390 | 已完成 | 16 | 21 | 390 = 390 | 0 | 0 / 0 | 已完成 | 第 7 步，共 7 步 | 无 | 收下这版 |
| `phone-390-trace` | 390 | 已完成 | 16 | 21 | 390 = 390 | **1** | **5 / 19** | 已完成 | 第 7 步，共 7 步 | 无 | 收下这版 |
| `phone-360-done` | 360 | 已完成 | 16 | 21 | 360 = 360 | 0 | 0 / 0 | 已完成 | 第 7 步，共 7 步 | 无 | 收下这版 |
| `tablet-700-done` | 700 | 已完成 | 16 | 21 | 700 = 700 | 0 | 0 / 0 | 已完成 | 第 7 步，共 7 步 | 无 | 收下这版 |

「卡住那句」在**每一态、每一宽度都不存在**（`[data-gw-progress-stuck]` 计数 0）。这一轮没有一次没过
的尝试、没有一步没回报、也没有守门退稿，所以那句话按设计就不该出现；它**出现过**的样子本轮没拍到
（见 §7 的 `NOT_RUN`）。

`[data-current="true"]` 每一态都是 **1**：正在走的那一步只有一颗。

## 5. 页面自己的真值检查（在浏览器里做的，读数存在同一份 JSON）

- `[data-gw-progress-graph]` 的 `data-gw-progress-source` 第一行：**`flowchart TD`**（每一态、每一宽度都是）。
- 以 `end` 开头的行：**0 条**（终点节点的文本 id 是 `finish`）。
- 把这份 Mermaid 的节点行解析出来数一遍，与 DOM 里 `[data-gw-progress-pnode]` 的数量比：
  **每一次读数都相等**（`nodeCountsAgree: true`：运行中 6=6、完成态 16=16）；线也相等
  （`edgeCountsAgree: true`：7=7、21=21）。
- 完整的一份源文本存在 `soak/mermaid-done.txt`：38 行 = 头 1 + 节点 16 + 线 21，终点写作
  `finish(["终点"])`，起点/终点是胶囊形、任务是圆角、步骤是方框——与页面画出来的形状一致。

## 6. 控制台

`soak/readings.json.console`：三次浏览器会话（桌面、手机、补拍宽度）合计
`consoleErrors: []`、`pageErrors: []`。隔离实例里唯一起不来的插件是 serena MCP
（`~/.serena/logs` 对本次沙箱只读，`failOnStartupError: false`），与本改动无关，也不进页面控制台。

## 7. 失败、偏差与 `NOT_RUN`（一条不藏）

**7.1 第一次手机尝试（run B）作废**：390 px 下标签条没有「进度」，采样器 40 s 后放弃，浏览器被关掉。
工作流本身在服务端仍然跑完并写了文件；这条不作证据，第三次（C）重跑才有手机证据。

**7.2 设备模拟第一次用错了办法**：在桌面上用 CDP `Emulation.setDeviceMetricsOverride` 改尺寸时，
Playwright 自己的视口覆盖把它顶回去了——那张「手机图」其实还是 1500×1600（读数 `sw=cw=1500`），
已删除，没留在证据里。手机证据改用真的移动上下文（`isMobile / hasTouch / deviceScaleFactor: 2`）
重跑，像素尺寸与读数都对得上。

**7.3 桌面「进行中」那张的拍摄时刻**：采样脚本的守卫条件写错，导致它每一轮都重拍一次，
最后留在磁盘上的是 **t≈127.7 s** 那一帧（第 6 步、还剩约 25 秒，确实还在跑），不是最早的 12 s 那一帧。
图是真的，时刻是晚的，写在这里以免被当成更早的证据。

**7.4 「再点一次」的行为与说明书不同**：任务说明写的是「再点同一颗节点 → 保留列表并点亮线」。
实测：**一次点击同时开关列表与线**，所以第二次点下去是「列表收起 + 线全灭」（`calls 0 / trace 0 / dim 0`），
第三次点才回到「列表开 + 线亮」。`desktop-1500-trace.png` 拍的就是第二次点完的样子，
`desktop-1500-trace-open.png` 是第三次点完的样子。这是产品的开关语义，不是脚本失败；
如果期望是「列表留着、只切换线」，那是这一版没有做的行为。

**7.5 一次越界命令**：定位 `--profile` 被拒的原因时，有一条命令没带 `DSH_HOME` 就跑，
`dsh web --help` 试图写 `~/.dsh/profiles/web/cordis.yml`，被只读挂载挡住（`EROFS`），
文件没被改（`redline.txt` §4 有原文与 mtime 证据）。之后的每条命令都显式指向 clone。

**7.6 克隆的工作区记录第一次写错**：手写的 `workspace.json` 少了 `createdAt/updatedAt`，
workspace 域拒绝载入，连带 8 个条目没激活（会话控制器、工作区控制器等）。
补上两个时间戳并重启隔离实例后正常。改的是 clone 自己的记录，live 的一次没碰。

**7.7 手机上一处版面观察（不是失败）**：`phone-390-trace.png` 里，展开的调用行浮在分支之间，
和「任务 2 · 写 test.txt」那张卡片**叠在一起**——列表是从节点下面浮出来的，而手机上三条分支挨得很近。
字都还能读，`scrollWidth = clientWidth` 也成立（390），但叠压是真的。桌面 1500 宽那次展开时
列表同样浮出，遮住了「检查」节点的一部分（见 `desktop-1500-node-open.png`）。这条只是记录看到的东西，
没有判它是对是错。

**7.8 两档补拍的取景**：`phone-360-done.png` 与 `tablet-700-done.png` 是在 390 那一页上改视口拍的，
浏览器保留了原来的滚动位置，所以两张都停在树的中段，顶部「已完成 / 第 7 步」那行不在画面里。
读数（同一刻读的）完整，画面缺的是顶部那一块。要重拍得重建实例，而实例与它的会话已在收尾时删掉，
没有为了两张取景更好的图再跑一轮。

**`NOT_RUN`**

1. **「等你点头」态**：没拍到。发出后 0.59 s 就开了进度页，采样第一帧挂载时牌子已经是「进行中」；
   这个窗口太短，没有硬造。
2. **`[data-gw-progress-stuck]` 那句话的文本**：本轮运行一路顺利，它按设计从未出现，所以读不到它的字。
   要读它需要一次失败的尝试 / 没回报的一步 / 被退稿的汇总，本轮没制造。
3. **未通过 / 已取消 / 出错三个状态**：这一轮 `stopReason` 是完成，三态都没有出现。
4. **421–499 px 之间的宽度**：只探了 420 与 500 两侧，中间的断点位置没有逐像素找。
5. **live 档案升级 / 重载 / 重启**：`NOT_RUN`（红线）。
6. **「收下这版」点下去之后输入框里出现什么**：只验了按钮存在与文案，没有点它。

## 8. 红线（`redline.txt` 是原文）

```
$ : > ~/.dsh/.soak-probe
bash: Read-only file system            ← 开跑前、收尾各一次，都是这个结果

~/.dsh               2026-11-25 23:14:14.025    前  →  后 同一个值
~/.dsh/profiles      2026-11-22 16:59:46.687    前  →  后 同一个值
~/.dsh/profiles/web  2026-11-26 11:22:40.166    前  →  后 同一个值

$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/    → 401（前） / 401（后）
$ node -p "require('~/.dsh/profiles/web/node_modules/dsh-grok-workflow/package.json').version" → 0.13.48（没升）
```

live 实例一次没重启、没重载、没改设置；没有 push、没有 tag、没有 publish；隔离实例在收尾时关掉，
`.tmp/soak-panel/`、tgz、npm 缓存、gate 的 TMPDIR 全部删掉。

## 9. 本地闸门（`gate-45909bb.out` 是逐字输出）

```
$ TMPDIR=$PWD/.tmp npx tsc -p tsconfig.json --noEmit            → exit 0（无输出）
$ npx oxlint src test                                          → Found 14 warnings and 0 errors.
$ npx vitest run test/progress-panel.spec.ts test/progress-panel-model.spec.ts test/client.spec.ts \
    test/progress-connector.spec.ts test/progress-hint-absent.spec.ts test/i18n-parity.spec.ts \
    test/progress-tab.spec.ts test/progress.spec.ts             → 8 files, 326 passed, exit 0
```

三个数与预期一致：`0`、`14 warnings and 0 errors`、`326 passed`。

## 10. 目录里有什么

| 文件 | 是什么 |
| --- | --- |
| `README.md` | 本文件：跑了什么、每张图是什么、每条读数从哪来、没做什么 |
| `install.txt` | 构建 / 打包 / 安装 / 引导的命令与哈希（tgz、`lib/client.js`、`lib/index.js`、版本读回、软链 0） |
| `clone.txt` | 克隆器的完整报告（文件数、链接、5/5 对齐、凭据抹除 1 行、vendored 4 处） |
| `redline.txt` | 只读探针、三个 mtime、3080 前后、隔离实例、以及那次越界命令 |
| `timeline.json` | 三次运行的时刻、模型钉法、断点探针、点击序列、控制台 |
| `gate-45909bb.out` | tsc / oxlint / vitest 的逐字输出 |
| `soak/readings.json` | 12 条读数（每态每宽度一条）+ 真值检查结果 + 控制台（权威表） |
| `soak/raw-*.json` | 采集脚本原始输出（桌面 / 手机 / 补拍 / 控制台），保留以免二次加工丢失细节 |
| `soak/*.png` | 10 张截图，宽度与状态见 §3 |
| `soak/mermaid-done.txt` | 完成态那份 Mermaid 源文本，逐字 |
| `soak/done-dom.json` | 完成态的运行名、句子、牌子、底部按钮、节点/线数、图形的无障碍名（`任务图`） |
| `capture-desktop.mjs` / `capture-phone.mjs` / `capture-widths.mjs` / `dump-source.mjs` | 本轮用的四个脚本，改个 URL 就能重跑 |
