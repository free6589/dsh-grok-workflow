# 设置页文案改说实话（`fix/settings-copy`）— 2026-11-25

分支 `fix/settings-copy`（worktree `.worktrees/fix-settings-copy`，基线 `main` 尖端 `50dad03`），产品提交
**`05f9e2b`**。本文件只记两件事：隔离档案里**同一页面前后两版**逐字读到了什么，以及本轮哪些事没做。

背景：0.13.35（M3.3）删掉了入口闸门，之后用户消息前面**没有任何东西**路由/认领/改写它。设置页上那颗开关
（部署默认 `grokDefault`）只决定一件事：**没有 `/grok` 记录的会话报什么**；能不能在本会话里开一个可复核的块，
读的是那个会话自己的记录（`canAcceptBlock()`，`src/user-source.ts`），且要求载入期开关 `blockIntake` 是开的。

## 1. 查了什么（`CONFIRMED`）

设置页第 1 组的标题、状态行、字段标签，以及两个 README 的设置页段落、`/grok on` 的回执，都不再说
「总开关 / 工作流工具可用 / 复杂目标走工作流」。前三点在真浏览器里读到了前后两版（§3 表），`/grok on` 回执
只在测试里钉着（§5 第 1 条）。

## 2. 命令与读数（原样）

**这些读数是谁读的，说准一点**：门禁与 soak（克隆、两次安装、起服、浏览器前后两版）是本块的派发方
（`agent-160`）在本机跑的，日志在 `.tmp/ci-foreman2.log` 与 `.tmp/soak-settings-copy/`；写这份文件的
`copy-hand` 没有重跑它们，但**独立重读了本目录里的两张截图**，§3 的四行字符串与截图上的字逐字一致。

门禁：`TMPDIR=$PWD/.tmp npm run ci` → **EXIT=0**

- oxlint：`Found 15 warnings and 0 errors.`（177 文件）
- `verify:lib`：`lib/ at 05f9e2b is the build of src/ at 05f9e2b (281 files, byte-identical)`
- 构建：`client bundle: 330313 bytes → lib/client.js`。基线 `50dad03` 提交的 `lib/client.js` 是 **329354 字节**，
  本轮 **+959**——涨的正是这些替换后的长句。
- vitest：`Test Files 98 passed (98)` / `Tests 1841 passed (1841)`（87.98 s）

克隆：`node scripts/clone-profile.mjs --src ~/.dsh/profiles/web --home .tmp/soak-settings-copy/dsh-home --name web-clone --force`
→ exit 0，`files 7720 -> 7720 (88421847 bytes)`、`links 5 (relinked 2, already dangling in the source 1)`、
`parity 5/5 equal after redaction`、`dependencies 17 declared, 0 unresolved`、
`credentials redacted: 1 line(s) in 1 file(s)`。

克隆里只删了一行：`grok-workflow` 行下残留的 `mode: triage`（这个键在 M3.3 已删）。别的一行没改。

起服：`dsh --profile web-clone --host 127.0.0.1 --port 3321 --no-open`。端口 **3321**（live 在 3080，全程没有访问它）；
启动日志里 `pending` / `did not activate` **0 行**。

两版安装（同一个克隆、同一个 profile、同一个浏览器）：

1. run 1 装**主检出**（树 = `50dad03`）→ 改前；
2. run 2 装**本 worktree**：`dsh plugin --profile web-clone add "$PWD/.worktrees/fix-settings-copy"`，
   依赖读回 `link:../../../../../.worktrees/fix-settings-copy`，版本 **0.13.36** → 改后。

浏览器：`playwright-cli` 起 headless chromium，打开 `http://127.0.0.1:3321/?token=<ephemeral>`，点侧栏「设置」，
再点左栏 **Workflow**（插件自己注册的 `settings.section`），读 `[data-page=grok-workflow]` 的 innerText，**0 console errors**。
两处环境绕行（不是产品事实）：

- `XDG_CACHE_HOME` 指到可写的 scratch 目录——本沙箱里 `~/.cache` 只读；
- 随包的浏览器是 chromium-1248，而 CLI 要 chromium-1246，所以把目录名做了别名。

## 3. 改前 / 改后（逐字）

| 位置 | 改前（主检出 `50dad03`） | 改后（worktree `05f9e2b`） |
| --- | --- | --- |
| 状态行 | `开着：工作流工具可用` | `开：没打过 /grok 的会话报这个` |
| 状态行副行 | `复杂目标走工作流，小问题直接回答。` | `只是报出来的默认值：要在这个会话里开可复核的块，还得这个会话自己打一句 /grok。` |
| 第 1 组标题 | `总开关` | `会话默认` |
| 字段标签 | `默认下大力气` | `没打 /grok 时的默认` |

开关本身两版都还是「开」（部署默认 `grokDefault: on`，而会话没有 `/grok` 记录）——改的只是它报出来的那句话。

截图（都是 1280×720 真截图，本目录内）：

- `settings-before.png` — `99095` 字节，sha256 `7f81779b1d45e899657bfe9d8dc139d04793c0db3911c16d515be0bfe7b31471`
- `settings-after.png` — `102443` 字节，sha256 `0295a65d3dbd499f958f7891b0dd775784f98b3ef0a9c20817fd41f96d0bbcef`

## 4. 红线（live，本轮前后各读一次）

`~/.dsh` = `2026-11-22 23:40:20`（epoch 1795362020）、`~/.dsh/profiles` = `2026-11-22 16:59:46`（epoch 1795337986），
与本会话开始时同值；写探针 `touch ~/.dsh/.settings-copy-probe` → `Read-only file system`；live 3080 → **401**；
live 档案仍钉 `github:free6589/dsh-grok-workflow`（浮动），**装着的版本本轮 `NOT_RUN`**（没探）。
未 push、未打 tag、未 bump `package.json`、未 publish。

一处要说准：`~/.dsh/profiles/web` 这个**目录**的 mtime 是 `2026-11-25 13:16:10`，早于本会话的第一条命令（13:46），
和上一轮记的「目录条目动过、里面文件没晚于 12:09:50」是同一个观测，不是本轮造成的。

## 5. 没做到的（`NOT_RUN`）

1. **`/grok on` 回执没有在 GUI 里读到。** 克隆档案的落地页是「生图」工作台，新开会话要先选模型输入框才能发，
   这一轮没拿到真回执读数。它的字符串由 `test/command.spec.ts` 的 `ON_TEXT` 逐字钉住（27 tests），
   改后的 `src/command.ts` diff 也证明启用分支仍是纯字符串、没有新增任何 config 读取。
2. **设置页只读了文本**：没有逐个控件点击、没有翻到第 4/5 组、没有试保存。
3. **浏览器 daemon 在两次工具调用之间被沙箱杀掉过**，有几个步骤重跑了几次；表里的读数取成功那一次。

## 6. 环境备注（不是产品事实）

本 worktree 的 `node_modules` 现在是指向主检出 `node_modules` 的符号链接（gitignore 覆盖，不进提交），
`verify:lib` 靠它找到 typescript。第一次跑门禁失败与代码无关：先用 `ln -sfn <main>/node_modules node_modules`
在一个已经存在的空 `node_modules/` 目录上做链接，结果链做进了那个目录里面，`verify:lib` 报
`Cannot find module …/node_modules/typescript/bin/tsc`；改成 `rm -rf node_modules && ln -s <main>/node_modules node_modules`
之后门禁 **EXIT=0**。
