# 没有记录的会话不再显示「开」：门禁 + 隔离真机（用户视角）读数（2026-11-25）

验收对象：分支 **`fix/switch-default-state`**（worktree `.tmp/wt-switch-default`），基线 `main` 尖端 **`d34214b`**，
产品提交 **`57b5723`**（`fix(client): a session with no mode record no longer shows the switch as on`，6 文件 / +243 −23），
其后再一条只写文档与证据的提交。驱动缺陷的原始读数在 `.rsi/evidence/user-regression-2026-11-25/README.md` §5「红二」，产品决定是
`docs/knowledge/DECISIONS.md` 的 **`D-154`**（选甲：开关没有记录时不显示「开」；路由与接单台准入一个字未改）。

环境：Node **v26.8.1** / npm **11.19.0**；DSH **0.2.2-rc.3**；隔离 scratch home `.tmp/soak-switch-default/dsh-home`
（profile **`web-clone`**，由 `node scripts/clone-profile.mjs` 从 live `~/.dsh/profiles/web` 克隆），端口 **127.0.0.1:3331**；
headless Chromium（`/usr/bin/chromium` + 本机 playwright python，viewport 1500×1000）。
**live `~/.dsh` 与 3080 上的实例全程未写、未重载、未重启。**
口径：`AGENTS.md` §2 的四个状态词。每条结论都能回指下面的一个读数或一个命令。

## 清单

| 文件 | 是什么 | 支撑哪条结论 |
| --- | --- | --- |
| `probe-final.json` | 一份干净会话的四段读数 + **全部** `/grok-workflow/mode` 请求与答复 + `console_errors`/`page_errors` | ① 新会话显示未开而路由答 `source:"default"`；② 从「未开」点一下写的是 `enabled:true`；③ `/grok off` 变关、`/grok on` 变开 |
| 本文件 | 逐字读数与边界 | 门禁、安装身份、真机表、故意的不一致、残留、红线 |

`url.txt`（含页面 token）、`boot*.log`、`token.txt`、克隆报告正文与会话正文**刻意没有拷进来**，本文件里也不出现 token、密钥或会话正文。
scratch `.tmp/soak-switch-default/`（105 MB，含克隆 home、tgz、probe 脚本、boot 日志）收尾整棵删除；删掉 scratch 不会让下面的读数失去出处。

## 一、改了什么（一句话）

`src/client/index.js` 里那颗开关的**显示与点击**只认会话自己的记录：`source: 'default'`（没有记录）时文案是新的
`mode.switch.notOn`（`未开 · 还没设过` / `Not on · not set yet`）、`aria-checked=false`、lamp off，点一下写的是
`{"action":"set","enabled":true}`；路由答案、`src/gate.ts`、`src/block/**`、`src/mode-surface.ts` 一个字未改。

## 二、门禁（`TMPDIR=$PWD/.tmp npm run ci`）

改前（基线 `d34214b` 的干净树）：

```
Found 15 warnings and 0 errors.
client bundle: 331626 bytes → lib/client.js
lib/ at d34214b is the build of src/ at d34214b (281 files, byte-identical)
 Test Files  98 passed (98)
      Tests  1845 passed (1845)
EXIT=0
```

改后（**提交之后**跑的那一份，权威读数；`TMPDIR=$PWD/.tmp npm run ci`，跑在交付 HEAD **`58aabe6`** 上，
这一遍由**包工头独立复核**用另一套命令执行环境跑的，与实现者那边的读数一致）：

```
Found 15 warnings and 0 errors.
client bundle: 333611 bytes → lib/client.js
lib/ at 58aabe6 is the build of src/ at 58aabe6 (281 files, byte-identical)
 client bundle: 333611 bytes → lib/client.js
 Test Files  98 passed (98)
      Tests  1849 passed (1849)
EXIT=0
```

**口径**：`lib/ at <sha>` 里的 sha **是跑那一刻的 HEAD**，不是内容指纹——本分支此后每加一条纯文档提交都只会换掉那个 sha，
`(281 files, byte-identical)` 与 `client bundle: 333611 bytes` 不变，所以它不是一枚钉子。本节**只引用仍在分支历史里的 sha**：
改后这一格是 `58aabe6`；提交**之前**实现者在同一棵未提交的树上预跑过一次（当时 HEAD 是基线 `d34214b`），读数一致
（同样 `98 files / 1849 tests`、`15 warnings / 0 errors`、`333611` 字节），差别只在那一行的 sha。一份被 `--amend` 掉、
已不在历史里的中间 sha 不作为任何读数的出处。

用例 **1845 → 1849**（+4：`test/client.spec.ts` 三条 + `test/mode-surface.spec.ts` 一条），文件数 **98 → 98** 未变，
oxlint **15 warnings / 0 errors** 未变，`lib/client.js` **331626 → 333611 字节（+1985）**。

定向先红后绿（`npx vitest run test/client.spec.ts test/mode-surface.spec.ts`）：先 **4 failed | 168 passed (172)**（失败原文见 §五），
实现后 **2 files / 172 passed (172)**。

## 三、真机读数（隔离克隆 + 打包安装，`CONFIRMED`）

### 3.1 隔离与安装身份

```
$ node scripts/clone-profile.mjs --src ~/.dsh/profiles/web --home .tmp/soak-switch-default/dsh-home --name web-clone --force
clone-profile: ok — …/profiles/web-clone
  files 7720 -> 7720 (88421847 bytes)
  links 5 (relinked 2, already dangling in the source 1)
  parity 5/5 equal after redaction
  dependencies 17 declared, 0 unresolved (8/21 bundles from the installation)
  credentials redacted: 1 line(s) in 1 file(s); vendored fixtures: 4 file(s)

$ grep -n "^\s*mode:\|legacyGate" <clone>/cordis.patch.yml     # 删之前
563:    mode: triage
$ sed -i '563{/^    mode: triage$/d}' <clone>/cordis.patch.yml  # 只删这一行
$ grep -n "^\s*mode:\|legacyGate" <clone>/cordis.patch.yml      # 删之后：0 行
```

安装走**打包**（不是 `link:`——软链会让插件里的 `@deepseek-ai/dsh-session` 与宿主不是同一个模块实例，
`/grok on` 会答 `Receiver must be an instance of class Session`，那是安装形态的问题，不是本轮改动）：

```
$ npm pack --pack-destination <scratch>            # → dsh-grok-workflow-0.13.36.tgz
$ DSH_HOME=<scratch>/dsh-home dsh plugin --profile web-clone add file:<scratch>/dsh-grok-workflow-0.13.36.tgz
Done in 2.3s using pnpm v12.4.2
$ node -p "require('<clone>/node_modules/dsh-grok-workflow/package.json').version"
0.13.36
$ readlink -f <clone>/node_modules/dsh-grok-workflow     # 落在 profile 内 ⇒ 真拷贝，不是软链
$ sha256sum <clone>/node_modules/dsh-grok-workflow/lib/client.js  lib/client.js
edcd69838c62c7b3d0a9ad8ff6755e30d0fd11b018b75090aab89d4c045cb0bb  <clone>/…/lib/client.js
edcd69838c62c7b3d0a9ad8ff6755e30d0fd11b018b75090aab89d4c045cb0bb  lib/client.js
```

起服：`DSH_HOME=<scratch>/dsh-home dsh --profile web-clone --no-open --host 127.0.0.1 --port 3331`——启动日志里
`dsh web: http://127.0.0.1:3331/?token=<redacted>` 一行，`pending` / `did not activate` **0 行**。

规则 1（工作区隔离）：克隆档案里那个工作区指向的是 `~/Documents/deepseek-harness/default-workspace`（live 用户的真实目录），
所以本轮把**克隆里**那条工作区路径改成一次性目录 `/tmp/wtsw-work` 再起服；真实目录前后 mtime 都是 **2026-11-15 13:42:07**，
`find … -newermt '2026-11-25 15:54'` **0 命中**。本轮样本只有 `/grok on|off` 两条命令与一次点击，没有模型回合、没有落盘活。

### 3.2 三条读数（同一会话 `session-1a3a3094-2a28-46b3-8d78-ca7013de6ca7`，`probe-final.json`）

| # | 用户动作 | 开关的 `data-*` 与文案 | 旁路读到的路由答复原文 |
| --- | --- | --- | --- |
| ① | 新开会话，从没打过 `/grok` | `data-mode-state="ready"`、`data-mode-note` 文本 **`未开 · 还没设过`**、`aria-checked=false`、`data-mode-lamp="off"`、整行 `工作流开关 \| 未开 · 还没设过` | `{"ok":true,"action":"status","mode":{"enabled":true,"source":"default","setBy":null,"turn":null,"workflowMode":null,"fallback":true}}` |
| ② | 从「未开」**点一下**开关 | 2 秒内变 `未开 · 还没设过 → 开`、`aria-checked=true`、`lamp=on`；请求体是 **`{"action":"set","sessionId":"…","enabled":true}`**（不是 `false`） | 写答复 `{"enabled":true,"source":"record","setBy":"switch:mode","turn":0,"workflowMode":"full"}` |
| ③ | 同一输入框打 `/grok off` 回车 | 2 秒内 `关`、`aria-checked=false`、`lamp=off` | `{"enabled":false,"source":"record","setBy":"command:/grok off","turn":0,"workflowMode":null}` |
| ④ | 同一输入框打 `/grok on` 回车 | 2 秒内 `开`、`aria-checked=true`、`lamp=on` | `{"enabled":true,"source":"record","setBy":"command:/grok","turn":0,"workflowMode":"full"}` |

全程 `console_errors: []`、`page_errors: []`。①→② 这一对是这次改动的要点：**路由说 `enabled:true`（部署默认），屏幕说未开**、
点一下才写出一条真记录；改动之前同一个 `enabled:true` 会被画成「开 + 绿灯 + 绿胶囊」，而接单台在同一会话里拒单。

另有一轮独立读数（同一构建、另一个 scratch 会话 `session-ed1bbecc-…`，已在收尾时随 scratch 删除）：从**记录态「关」**点一下，
请求体是 `{"action":"set","enabled":true}`、答复 `setBy:"switch:mode"`，开关变「开」——记录态的读、写与旧版逐字相同。

## 四、显示与答案故意不一致（`D-154`，别去「对齐」）

同一个会话、同一时刻，两个面给出**不同的字**，这是修好的样子，不是遗留缺陷：

- `POST /grok-workflow/mode {"action":"status"}` 答**有效值 + 来源**：`{"enabled":true,"source":"default",…,"fallback":true}`。
  `/grok status` 和设置页读的就是它，答案侧本轮一个字没改。
- 那颗开关答**这个会话自己定了什么**：`source: 'default'` ⇒ `未开 · 还没设过`，绿灯不亮，胶囊是灰的。

为什么必须不一样：接单台的准入（`canAcceptBlock`）只认会话记录，**不认部署默认**——`user-regression-2026-11-25` §5 红二记的
就是「界面说开着、工具说关着」。让两边「对齐」只有两条路，都被否决过：要么路由不再答有效值（`/grok status` 与设置页跟着假），
要么开关认领一条没人写过的记录（界面继续说谎）。单测里这条不一致被两处钉住：
`test/mode-surface.spec.ts` 的「the switch and the route disagree on purpose … (D-154)」与
`test/client.spec.ts` 的「never calls a session with no record on, in either language」。

## 五、先红后绿（失败原文与通过原文）

改前先把用例写好跑一遍（`npx vitest run test/client.spec.ts test/mode-surface.spec.ts`）：

```
 FAIL  test/client.spec.ts > … the workflow switch (`/grok on|off` as a button) > never calls a session with no record on, in either language
AssertionError: zh: default on: expected '开' to be undefined // Object.is equality
 ❯ test/client.spec.ts:3799:90

 FAIL  test/client.spec.ts > … > paints the no-record state as not on, and one click turns the session on
AssertionError: expected true to be false // Object.is equality
 ❯ test/client.spec.ts:3838:50     expect(toggleIn(tree).props['aria-checked']).toBe(false)

 FAIL  test/client.spec.ts > … the workflow switch against the real Host route > writes the session record a click asks for, and paints only what the route read back
AssertionError: expected '关' to be undefined // Object.is equality
 ❯ test/client.spec.ts:3908:30     expect(noteText(tree)).toBe(zhDict['mode.switch.notOn'])

 FAIL  test/mode-surface.spec.ts > the switch and the route disagree on purpose … (D-154) > answers {enabled:true, source:"default"} and displays "not set yet" for one unrecorded session
AssertionError: zh: unrecorded session shows the no-record word: expected '开' to be 'mode.switch.notOn'
 ❯ test/mode-surface.spec.ts:233:78

 Test Files  2 failed (2)
      Tests  4 failed | 168 passed (172)
```

实现之后同一条命令：**`Test Files 2 passed (2)` / `Tests 172 passed (172)`**。全量门禁的数字见 §二。

## 六、独立复核（包工头 `agent-164`，另一套 scratch、另一个端口）——**他的读数，不是我的**

他的环境与我这边无关：另一份隔离克隆、端口 **3345**（改前）/ **3347**（改后）、他自己的 headless chromium。

**6.1 改前复现（旧构建 = `main` `d34214b`）**：新会话 `session-67be5bcb-5bb3-42e9-8be5-88f5d1c5ef9a`（从没打过 `/grok`），
路由答复原文 `{"ok":true,"action":"status","mode":{"enabled":true,"source":"default","setBy":null,"turn":null,"workflowMode":null,"fallback":true}}`；
开关渲染 `工作流开关 | 开`、`aria-checked=true`、`data-mode-lamp="on"`、note 文本 **`开`**。同一台机、同一份克隆、只换构建，
这就是红二的现场。（他用 `link:` 装法跑这一侧，显示侧照样复现；`link:` 坏的是命令**写记录**那一步，见 §七 第 3 条。）

**6.2 改后三条（打包安装）**：`PLUGIN_SPEC=file:<scratch>/dsh-grok-workflow-0.13.36.tgz`、`VERSION=0.13.36`、
`INSTALLED_client=edcd69838c62c7b3d0a9ad8ff6755e30d0fd11b018b75090aab89d4c045cb0bb` = worktree 同值、启动 `did not activate` **0** 行。

| # | 他的动作 | 开关读数 | 路由答复 / 会话日志 |
| --- | --- | --- | --- |
| 1 | 新会话 `session-fd2b29c4-4c36-4cb9-9bb3-3d731531d6a2`，没打过 `/grok` | note **`未开 · 还没设过`**、`aria-checked=false`、`data-mode-lamp="off"` | 旁路 `{"ok":true,"action":"status","mode":{"enabled":true,"source":"default","setBy":null,"turn":null,"workflowMode":null,"fallback":true}}` |
| 2 | 同一输入框打 `/grok on` + 点「发送消息」 | 2 秒内变 **`开`**、`aria-checked=true`、`lamp="on"` | 重读 `{"enabled":true,"source":"record","setBy":"command:/grok","turn":0,"workflowMode":"full","fallback":true}`；日志 seq 4 `command/run {"name":"grok","args":" on"}` → seq 5 `plugin:grok-workflow/mode {"v":1,"enabled":true,"turn":0,"setBy":"command:/grok","workflowMode":"full"}` → seq 6 `command/done {"kind":"success","text":"Grok workflow ON — …"}` |
| 3 | 再打 `/grok off` | 变 **`关`**、`aria-checked=false`、`lamp="off"` | `{"enabled":false,"source":"record","setBy":"command:/grok off",…}`；日志 seq 7/8/9 同形（记录 `enabled:false`，`command/done` 是 `Grok workflow OFF — normal chat.`） |

全程 `console_errors: []`。这一组补的是**打字路径**（新会话显示未开 → 打 `/grok on` 后变开）；
我这边 ② 是「从『未开』点一下」，③ 是记录态打字（`/grok off` → 关、`/grok on` → 开）——三条分开写，不合并。

## 七、残留与没做的

1. **`/grok on` 的回执文字**仍是英文（`Grok workflow ON — the model may commission reviewed blocks of work in this session. …`），
   而界面是中文——中英混排是既有事实（红一那一轮只改真假，没改语言），本轮不在范围内。
2. **点卡片、跑模型回合、真任务、监工判决** 这四项本轮 `NOT_RUN`：本轮样本只需要两条命令与一次点击，跑模型回合要多一倍时间且与本改动无关。
3. **另一个 scratch 会话（`session-ed1bbecc-…`）的读数随 scratch 一起删掉了**，只有 §三 那两行摘录留在本文件；它支撑的结论
   （记录态点击写 `enabled:true`）与 `probe-final.json` ③④ 一致。
4. **克隆档案只改了 soak 用的东西**：删掉 `mode: triage` 一行、把工作区路径指到 `/tmp/wtsw-work`、把插件依赖换成打包产物。
   产品代码、默认值、schema 一个字没动。
5. **`~/.dsh/profiles/web` 这个目录的 mtime 是 `2026-11-25 13:16:10`**，早于本会话第一条命令（15:39），不是本轮造成的（与上一轮同一个观测）。

## 八、红线读数（live 未碰）

```
$ stat -c '%y %n' ~/.dsh ~/.dsh/profiles ~/.dsh/profiles/web
2026-11-22 23:40:20  ~/.dsh                 ← 本会话前后同值
2026-11-22 16:59:46  ~/.dsh/profiles        ← 同值
2026-11-25 13:16:10  ~/.dsh/profiles/web    ← 同值（早于本会话）
$ touch ~/.dsh/.switch-default-write-probe
touch: cannot touch '…': Read-only file system
$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/     → 401（前后都是 401）
$ node -p "require('~/.dsh/profiles/web/node_modules/dsh-grok-workflow/package.json').version"  → 0.13.35（未升级）
$ stat -c '%y' ~/Documents/deepseek-harness/default-workspace       → 2026-11-15 13:42:07（前后同值）
```

本轮对 live **一行未写**、未重载、未重启 3080；未 push、未打 tag、未发版、未合流，`package.json` 仍 `0.13.36`。

## 九、这份证据里没有什么

不含任何 API key、页面访问 token、凭据或会话正文。`probe-final.json` 里只有 `/grok-workflow/mode` 的请求体/答复、
开关自己的 `data-*` 读数与 `console_errors`（空）。会话 id 是隔离 scratch home 里一个一次性会话的 uuid。
