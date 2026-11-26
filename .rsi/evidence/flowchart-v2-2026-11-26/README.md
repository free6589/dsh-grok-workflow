# 泳道矩阵：真机读数与几何（`feat/flowchart-v2`）— 2026-11-26

验收对象：分支 **`feat/flowchart-v2`**，工作树 `.tmp/worktrees/flowchart-v2`。状态词汇按 `AGENTS.md` §2；
每条读数都能回指本目录里的 json / 逐字文本 / 截图 / 一条命令。

**一句话结论**：隔离克隆 + 打包安装 + 真模型，一共跑了**六次真运行**（三态一轮、重试一轮、整轮失败一轮、取消一轮）。
**执行 / 检查 / 复核 三列下面挂着「任务 1..N」的格子，常显、不用点开**；宽屏下**同一 `data-lane` 在三列里落在同一条水平线上
（逐 lane 实测差 **0.00 px**）；**失败重试画进了图**（一格两颗点、`第 2 遍` 角标、1–2 条虚线重看线）；
`≤720 px` 列折行、**不出现横向滚动**；三张终态页（已完成 / 未通过 / 已取消）都拍到了；整轮 `consoleErrors` / `pageErrors` 全空。

**拆版之后的位置（2026-11-26，补记）**：这份证据是在**把泳道矩阵与强制路由放在一起**的那条历史上拍下来的
（尖端 `4def2a4`，现保留为 `backup/flowchart-v2-mixed-2026-11-26`）。后来两条功能被拆成各自可发版的两个分支，
本目录跟着**泳道矩阵**这一半走（`feat/flowchart-v2`）。因此下文里两处**只对混合树成立**的读数要这样读：
① 以 `gate-bc5bc65-*` 命名的转录测的是那棵混合树，它的整仓读数 `105 files / 2041 passed` 含
`test/force-team.spec.ts` 的 28 条；拆版后本分支自己跑的是 **`104 files / 2013 passed`**（`EXIT=0`，87.90 s）。
② §0 里「最终构建那一包也有 `lib/force-team.js`」描述的是那个混合包；拆版后本分支的包**不含**该文件。
真机读数（三态 / 重试 / 失败 / 取消 / 窄屏 / 连线 / 控制台）测的是泳道矩阵，逐条对本分支成立。
其余一切原文照旧，一个数字没改。

**另一条分支（这一半故意不写进 `docs/`）**：强制团队路由那一半在 **`feat/force-team-routing`** 上，
它的文件是 `src/force-team.ts`、`test/force-team.spec.ts`，开关是 `forceTeamRouting`，决策是 `D-167`。
拆版时在**本分支**跑的反证是
`grep -R "forceTeamRouting\|force-team" src test README.md README.zh-CN.md docs` → **无命中（退出 1）**。
这两个名字只写在这里、不写进 `docs/`，是为了让那条反证不被本分支自己的记录命中。

## 0. 三棵树、三个包（先说清哪张图是哪一版拍的）

本块的产品文件被改了两轮，所以有**三个构建**。下表是身份，判身份只用 `sha256(lib/client.js)`——
**版本号在三个包里都读 `0.13.47`，它不能当判别器**。

| 轮次 | 树 | 包（`npm pack`） | `sha256(lib/client.js)` | 字节 |
| --- | --- | --- | --- | --- |
| 第一轮：三态 | 尖端 `3954ad8`（产品 `bd2e1c4`） | `dsh-grok-workflow-0.13.47.tgz` = `e76866f6864a1a67f88d0c919e828db3e513a6161268a6dcf15d7610a0782b30` · 994424 字节 | `4ca240f0e2c3a0534b2ba515a03e2d7e4a015036b8dc8acd9bb948a04cf4ac95` | 365866 |
| 中间那一趟（`soak2-pre-build/`） | 尖端 `cb8c155`（产品 `ced5526`） | `…tgz` = `202936857c73a70aba08b0de6e3de907c7b873b21e01335e7efa9a1fe139a10f` · 995953 字节 | `f29acba4a619051431cbc579faac85c482f224f0f9f10ac992f988d9dd8f750c` | 372210 |
| **第二轮：最终构建**（`soak2/`） | `0412a23` + 构建提交 `bc5bc65` | `…tgz` = `abac72de122466d6816ddc764e6d1d96b4defdfde970974acc6780355138becf` · **1010001 字节** | `f29acba4a619051431cbc579faac85c482f224f0f9f10ac992f988d9dd8f750c` | 372210 |

- 中间那一趟不是白跑：`soak2-pre-build/` 里的重试页与失败页读数与 `soak2/` 的同名读数**逐项一致**
  （重试：1 条重看线 + 1 个 `第 2 遍`；失败：2 条重看线 + 2 个角标 + `还剩 6 步 / 共 10 步`），
  说明「重画」那条线在强制路由落地前后**没有改变页面行为**。
- 三份包的 `lib/client.js` 都与**包内解包副本**、**装进 `web-clone/node_modules` 的副本**逐字同哈希
  （`readlink` 为空 → 真拷贝，不是软链）。安装一律 `dsh plugin --profile web-clone add file:<tgz>`。
- **最终构建那一包**里也有 `lib/force-team.js`（强制路由的服务端文件），它的构建产物由提交 **`bc5bc65`**
  `chore(build): rebuild lib/ for the force-team routing intake` 一并入库（20 个文件 / +805 −28）。

## 0.1 第三趟：方块格子（主验意见）— `ef9b474`

主验说「格子太圆，像药丸」，圆角 `10px → 6px`。第三趟只为拍这一件事，读数在 `soak3-cells/README.md`：

- **身份**：提交 **`ef9b474`**、`sha256(lib/client.js)` **`e51daa66…3cff`** / **372480 字节**、
  包 **`dfc25f24…29bb`** / 997049 字节；另一条分支 `feat/force-team-routing` 没装也没测。
- **三条读数**：computed `border-radius` = **`6px`**、`height` = **`26px`**、4 倍放大图首行 inset = **13 设备像素 = 3.25 css px**
  （占高度 **12.5%**）。**结论：读作方块**，不是药丸（老值 13px 半高会内收约 45 设备像素）。
- **一张图**：`soak3-cells/cell-zoom-4x.png`（4 倍、1420×168，一格含圆角与边框）；
  另有 `cells-done-wide.png`（已完成页宽屏，六格全绿）、`cells-done-narrow-700.png`（700 px 折行、`700 = 700` 无横滚）。
- `consoleErrors` / `pageErrors` 全空。

## 1. 环境与装置（`CONFIRMED`）

Node **v26.8.1** / npm **11.19.0** / DSH **0.2.2-rc.3**；隔离 home `.tmp/soak-lanes/dsh-home`，
profile **`web-clone`**（`node scripts/clone-profile.mjs --src ~/.dsh/profiles/web`）：

```
files 7742 -> 7742 (88584422 bytes)
links 5 (relinked 2, already dangling in the source 1)
parity 5/5 equal after redaction
dependencies 17 declared, 0 unresolved (8/21 bundles from the installation)
credentials redacted: 1 line(s) in 1 file(s); vendored fixtures: 4 file(s)
```

端口 **127.0.0.1:3391**，一次性工作区 `.tmp/soak-lanes/work`。克隆里只动 soak 需要的东西：
删 `mode: triage`、五角色 + `guardianModel` 钉到 `bifrost-responses/opencode-go/muse-spark-1.3-contributor`、
工作区重指、端口（`soak-prep.md` §3 有 diff）。**第二轮额外动了一条腿**：新增一个指向本机小代理的 provider
`judgeprobe`（`http://127.0.0.1:18190/openai/v1`）并把 `roles.verifier` 指过去，用来撞穿检查那道门；
取消那一轮之前把它改回直连（同一个 profile，没重克隆）。密钥只走进程环境，没落进任何产物。

驱动：Playwright（`/home/fish/.npm/_npx/e41f203b7505f1fb/node_modules/playwright` 1.64.1 + `chromium_headless_shell-1248`），
**用户视角**：在输入框里打字、真按 Enter、点 `进度` 标签、读 `data-*`。视口 1500×1600，窄屏改到 700 / 480。
轮询间隔 200–250 ms，状态一出现就**同一个瞬间**截当前视口 + 落盘那一刻的钩子读数。

## 2. 门禁（`CONFIRMED`，以及一条 `BLOCKED`）

| 命令 | 树 | 结果 | 转录 |
| --- | --- | --- | --- |
| `npx tsc -p tsconfig.json --noEmit` | `3954ad8` | `EXIT=0` | `gate-3954ad8-typecheck.out` |
| `npx oxlint src test` | `3954ad8` | `15 warnings / 0 errors`、`185 files`、`EXIT=0` | `gate-3954ad8-lint.out` |
| 七份进度 spec（`progress-lanes` `client` `progress-flow` `progress-connector` `progress-tab` `progress-hint-absent` `progress`） | `3954ad8` | `7 files / 320 passed`、`EXIT=0` | `gate-3954ad8-specs.out` |
| `npx tsc -p tsconfig.json --noEmit` | 最终树 `bc5bc65` | `EXIT=0` | `gate-bc5bc65-typecheck.out` |
| `npx oxlint src test` | 最终树 `bc5bc65` | `15 warnings / 0 errors`、`187 files`、`EXIT=0` | `gate-bc5bc65-lint.out` |
| 八份 spec（七份进度 + `force-team`） | 最终树 `bc5bc65` | `8 files / 365 passed`、`EXIT=0` | `gate-bc5bc65-specs.out` |
| `TMPDIR=$PWD/.tmp npx vitest run`（整仓） | 最终树 `bc5bc65` | **`105 files / 2041 passed`**、`Duration 90.64s`、`EXIT=0` | `gate-bc5bc65-full-suite.out` |
| `node scripts/verify-lib.mjs` | 最终树 `bc5bc65` | **`BLOCKED`**，见下 | `verifylib-BLOCKED.out` |

**`verify:lib` 是 `BLOCKED`，不是通过**（环境限制，不是代码问题）：脚本把树复制到 `/tmp/verify-lib-*` 再在那儿装依赖，
本沙箱装不上，原文是

```
Error: Cannot find module '/tmp/verify-lib-kWkfnx/node_modules/typescript/bin/tsc'
… EXIT=1
```

`lib/` 与 `src/` 是否逐字一致，本轮**没有**用这条脚本证明；能证明的是：`npm run build`（`tsc -p tsconfig.build.json
&& node scripts/build-client.mjs`）在最终树上 `EXIT=0`、`client bundle: 372210 bytes → lib/client.js`，
且 `lib/client.js` 的哈希在构建前后不变（`f29acba4…`）。

`npm run ci`（整份）**`NOT_RUN`**（`AGENTS.md` §12：发版那一次跑）。

## 3. 第一轮：三态（产品 `bd2e1c4`，包 `e76866f6…`）

请求（**必须点出工具名**，否则模型直接拿普通写文件工具做完）：

> 用 grok_workflow 工具跑一个工作流：在这个工作目录里写三个小文件——notes.md 写三行安装步骤，
> test.txt 写一行 hello，steps.txt 写三行 1 2 3。一个小任务一个文件，三件事互不依赖。

规划出 **3 个计划任务**，三个文件真的写进了 `.tmp/soak-lanes/work/`（`notes.md` 90 字节三行、`test.txt` 6 字节、
`steps.txt` 6 字节）——**上一块（steering）那条「子代理沙箱只读」的风险本轮没有重现**。

| 状态 | 文件 | 相对发送 | 页面怎么说 |
| --- | --- | --- | --- |
| 等你点头 | `soak/soak-10-waiting.*` | **15.07 s** | `任务团队 · 3 个任务` / `等你点头` / `起点` `终点` / `还剩 1 步 / 共 2 步` / `开工` |
| 进行中（早期） | `soak/soak-20-running.*` | 15.39 s | `进行中` / 四列 / 执行列 3 格全 `doing` |
| 进行中（中段，另开浏览器接同一会话） | `soak/soak-21-midrun.*` | 运行中段 | 六列：执行/检查/复核已绿、汇总 `doing`、终点 `pending` |
| 已完成 | `soak/soak-30-done.*` | **138.84 s** | `已完成` / `还剩 0 步 / 共 7 步` / `收下这版` / `监控结束` |
| 已完成（4 s 后复读） | `soak/soak-40-final.*` | 143.09 s | 同上一字不差 |

钩子计数（按 `data-*` 数）：

| 时刻 | `-col` | `-subs` | `-sub` | `svg path` | `marker` | toggle | Guardian |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 等你点头 | 2 | 0 | 0 | 2 | 1 | 0 | 1 |
| 进行中 早期 | 3 | 1 | 3 | 3 | 1 | 3 | 1 |
| 进行中 中段 | 6 | 3 | 9 | 12 | 1 | 10 | 1 |
| 已完成 | 7 | 3 | 9 | 13 | 1 | 11 | 1 |

**`svg path` 比连线多 1**：`<marker id="gw-progress-arrow">` 自己含一条三角形 `path`，`querySelectorAll` 会数进去。
**连线数 = 总数 − 1**：完成态 12 = 相邻列对 6 + 同号格对 6；中段 11 = 5 + 6。

**逐 lane 实测 `top`（宽屏 1500，完成态）**：`lane 1 = 176 / 176 / 176`、`lane 2 = 208 / 208 / 208`、
`lane 3 = 240 / 240 / 240`（execute / check / review），**极差 0.00 px**；中段与早期同值。格高 26、间距 6。

**第一轮有一处必须照实说**：第一趟驱动的截图标签是用**上一拍**的快照写的，所以第一次抓到的那个「等你点头」
文件实际内容是 `进行中`。那四个文件已改名 `soak-run1/soak-11-declared.*`，json 里 `state` 改成
`declared-after-waiting` 并写了 `note`；**真正的等待态来自第二轮**（`soak/soak-10-waiting.*`，表头逐字 `等你点头`，
读数与截图同一瞬间拍下）。

## 4. 第二轮：重试 / 整轮失败 / 取消 / 补拍已完成（最终构建，包 `abac72de…`）

### 4.1 失败后重试（`soak2/retry/`）

装置：`roles.verifier` 走本机小代理，**第一次补全回 401，之后原样转发**。于是任务的第一次尝试被检查那道门撞掉，
重试一次后通过。请求：`算出 12 乘 12，再在它的基础上加 1`，两步、第二步依赖第一步。

| 项 | 读数 |
| --- | --- |
| 胶囊 / 页脚 | `已完成` · `还剩 0 步 / 共 12 步` · dock 里有 `收下这版` |
| 列 | **12**：起点 / 规划 / 执行 / 检查 / 复核 / **规划（第 2 次）** / 执行 / 检查 / 复核 / 汇总（2 稿）/ 终点 |
| 格 | **6**（2 个任务 × 3 条腿），逐 lane `176 / 208`，三列同高（**极差 0.00**） |
| 那一格 | `check` 列任务 1 = `data-state="done"`、角标 **`第 2 遍`**、两颗点 `[{1, failed}, {2, done}]` |
| 重看线 | **1 条** `path[data-gw-progress-retry]` = `M323 51 L326 51`，`stroke-dasharray: 3px, 3px`，带箭头 |
| 展开那一格（`r2-40-retried-cell-open.*`） | `9:42 检查 任务 1 · 计算12乘12 没过 打开子会话` / `9:42 检查 任务 1 · 计算12乘12 过了 打开子会话` |
| 控制台 | `{"consoleErrors": [], "pageErrors": []}` |

**这一张就是 lead 点名要看的**：格是绿的（恢复规则），但「失败过一次」仍在**第一颗琥珀点 + `第 2 遍` + 虚线重看线**上。

### 4.2 整轮失败页（`soak2/failed/`）

同一装置，小代理改成**每次补全都 401**。

| 项 | 读数 |
| --- | --- |
| 胶囊 / 页脚 | **`未通过`** · `还剩 6 步 / 共 10 步` |
| 列 | 10：两颗 `check` 都是 `failed`，`end` 是 `failed`，`data-current` 停在第一颗 `check` |
| 格 | 6；两格里各两颗点，**全是 `failed`**，两格都带 `第 2 遍` |
| 重看线 | **2 条** `M384 51 L387 51`、`M749 51 L752 51`，都是 `3px, 3px` |
| 按钮 | **没有**（`收下这版` 不在叶子文本里） |
| 展开那一格 | 两行都是 `没过` |
| 控制台 | 空 |

### 4.3 取消页（`soak2/cancelled/`）

`roles.verifier` 改回直连、实例重启；运行到 60 s 时点输入框旁的 **`aria-label="停止生成"`**。

| 项 | 读数 |
| --- | --- |
| 胶囊 / 页脚 | **`已取消`** · `还剩 0 步 / 共 7 步` |
| 列 | 7；第二颗 `规划` 与 `终点` 是 `cancelled`（`data-state` 用引擎原话，没派生），`data-current` 落在 `终点` |
| 格 | 3（任务 1 走过执行/检查/复核，全 `done`）；没有角标、没有重看线 |
| 按钮 | **没有** |
| 控制台 | 空 |

### 4.4 已完成（最终构建，替换第一轮那张）

`soak2/retry/r2-30-done.*` 就是**最终构建上的已完成页**（12 列 / 6 格 / 1 条重看线 / 对齐 0.00 / `收下这版`），
第一轮那张（`soak/soak-30-done.*`）留在原处只作为「三态那一轮的形状」，最终产物以 `soak2/` 为准。

## 5. 窄屏（第一轮测的几何，三列折行）

| 视口 | 列布局（实测 `top`） | `scrollWidth / clientWidth` |
| --- | --- | --- |
| 1500 | 7 列一行，全部 `top=138` | **1500 / 1500** |
| 700 | 两列一行（138 / 274 / 410 / 450），**6 条 4 顶点肘弯**，例如 `M520 32 L520 84 L173 84 L173 136` | **700 / 700** |
| 480 | 一列纵排（138 → 666），连线变成竖直线段 | **480 / 480** |

跨行后同一 lane 不再同高（700 px 极差 136、480 px 极差 272）——**折行的必然**，两条硬指标（折行 + 不横向滚动）成立。
截图：`soak/soak-50-narrow700.png`、`soak/soak-51-narrow480.png`。

## 6. 样式与文案（`soak/soak-92-styles.json` + 源码静态检查）

- 格：`height 26px`、`border-radius 10px`、`background-color: rgba(0,0,0,0)`、同一 token `12% → 5%` 渐变。
- `pending` 是**唯一虚线且无渐变**（`border-style: dashed`、`background-image: none`）。
- 箭头：`marker id="gw-progress-arrow"`、`markerWidth 8`、`fill: var(--dsw-alias-border-l2, currentColor)`。
- 插件样式表里 `overflow-x: auto` **0**、`#hex` **0**、`rgb()/rgba()` **0**、`--dsw-alias-state-error-primary` **0**；
  `@keyframes` 只有既有的 `gw-progress-breathe` / `gw-progress-pulse`（`e772cd6` 两份都有，本轮没新增）。
- CSS 里出现的 `gw-progress-task` 子串**两处都是 `[data-gw-progress-task-chain]` 属性选择器**（§21 既有钩子），
  class 名单里没有退休子串；`test/progress-connector.spec.ts` 的退役名单本轮全绿。
- 叶子文本（可见单词）在完成态只有 19 条，全是运行名 / 腿词 / 任务标题 / 稿次 / Guardian 四句 / 计数行 / 按钮，
  **没有一句解释性新话**；`progress-hint-absent` 一字未改通过。

## 7. 没做到 / 边界（`NOT_RUN`，不冒充）

1. **琥珀与 `pending` 的「格」没在真机上出现过**：格要有行才存在，有行就说明那一步发生过。
   真机看到的格只有 `doing`（早期）与 `done` / `failed`（终态）。`pending` 格与琥珀格由组件用例覆盖。
2. **无 layout 宿主不画连线**：`NOT_RUN`（真机上没有这种宿主）。
3. **`npm run ci` 整份**：`NOT_RUN`（§12）。**`verify:lib`**：`BLOCKED`（§2 原文）。
4. **跨行后的 lane 对齐**：不成立（§5），属折行必然，不是缺陷。
5. **DSH 侧 MCP 服务器在隔离 home 里全报只读**（serena 写 `~/.serena/logs`、mdcg 写 `~/.mdcg`、phone 写
   `~/.local/share/phone-use`、`/home/fish/agent-memory`）——与本插件无关，本块没修；`grok-workflow` 照常加载，
   `grok_*` 工具可见，六次运行都真的发生了。
6. **「等你点头」窗口很窄**（15.07 s 抓到一次；第一轮 13.55 s 那次窗口约 0.2–2 s）：靠 200–250 ms 轮询，
   抓不到就照实标（`soak-run1/soak-11-declared.*`）。

## 8. 红线读数（`CONFIRMED`）

```
$ stat -c '%y %n' ~/.dsh ~/.dsh/profiles ~/.dsh/profiles/web/cordis.patch.yml
2026-11-25 23:14:14 /home/fish/.dsh
2026-11-22 16:59:46 /home/fish/.dsh/profiles
2026-11-26 08:40:55 /home/fish/.dsh/profiles/web/cordis.patch.yml   ← 本会话开始（08:54）之前
$ curl -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/   → 401（开跑前）
```

未写 `~/.dsh`、未重载/重启 3080、未 push、未打 tag、未 bump 版本、未 publish。
scratch `.tmp/soak-lanes/` 收尾整棵删除（体积见 `HANDOFF.md` 那一条）。

## 9. 文件清单

| 路径 | 是什么 | 支撑 |
| --- | --- | --- |
| `soak/soak-10-waiting.*` | 等你点头（15.07 s） | §3 |
| `soak/soak-20-running.*` | 进行中早期 | §3 |
| `soak/soak-21-midrun.*` | 进行中中段（六列九格） | §3 §5 |
| `soak/soak-30-done.*` / `soak-40-final.*` | 已完成（第一轮）与 4 s 后复读 | §3 |
| `soak/soak-50-narrow700.*` / `soak-51-narrow480.*` | 窄屏两档 | §5 |
| `soak/soak-90-console.json` / `soak-91-timeline.txt` | 整轮控制台与轮询时间线 | §3 |
| `soak/soak-92-styles.json` | computed style / `aria-label` / marker / 叶子文本 | §6 |
| `soak-run1/*` | 第一轮第一趟（含改名说明 `soak-11-declared.*` 与完成态 174.15 s） | §3 |
| `soak2/retry/*` | 失败后重试 → 已完成（最终构建） | §4.1 §4.4 |
| `soak2/failed/*` | 整轮失败页 | §4.2 |
| `soak2/cancelled/*` | 取消页 | §4.3 |
| `soak2-pre-build/*` | 同一套场景在 `cb8c155` 上的读数（对照） | §0 |
| `gate-3954ad8-*.out` / `gate-bc5bc65-*.out` / `verifylib-BLOCKED.out` | 门禁与整仓套件的原样输出 | §2 |
| `soak-prep.md` | 准备阶段：克隆读数、动过什么、工具链三处坑 | §1 |
| `red-*.log` / `green-*.log` | 另两位施工者的红/绿转录（只引用、不改动） | — |
