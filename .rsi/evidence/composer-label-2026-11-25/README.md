# 开关文案改动 + 「命令写入后不刷新」定性证据（2026-11-25）

验收对象：分支 **`fix/composer-label`**（worktree `.tmp/wt-composer-label`），基线 `main` 尖端 **`424ed99`**，功能提交 **`2f218d0`**
（`fix(client): say the workflow switch plainly, without the deleted full-crew mode`，3 文件 / +31 −17）。
环境：Node **v26.8.1** / DSH **`0.2.2-rc.3-6b729fe`**；真机 scratch home `.tmp/soak-label/dsh-home`（`DSH_HOME`，profile **`web-clone`**），
端口 **3321**；headless Chromium（Playwright，`/usr/bin/chromium`，viewport 1500×1000）。
口径：`AGENTS.md` §2 的四个状态词。每条结论都能回指下面的一个读数或一个文件路径。

## 清单

| 文件（原始位置） | 是什么 | 支撑哪条结论 |
| --- | --- | --- |
| `.tmp/soak-label/clone-report.json` | `node scripts/clone-profile.mjs` 的报告：源 `~/.dsh/profiles/web`、目标 `.tmp/soak-label/dsh-home/profiles/web-clone`、**7699 文件** / 5 个软链、parity **5/5** 全等、**1 行凭据按设计脱敏**（`cordis.patch.yml:379`，pattern `openai-style-key`） | 真机环境（`CONFIRMED`）；live 档案只被读、未被写 |
| `.tmp/soak-label/probe1.json` | 旧构建下：挂载读、打字 `/grok off`、**41 次**开关文本快照、`/grok-workflow/mode` 全部请求与响应 | ① 命令写了记录但已挂载的开关不刷新；② `/grok-workflow/mode` 全程只有挂载时那 1 次请求 |
| `.tmp/soak-label/probe2.json` | 旧构建下 reload：**3 次**请求 + 13 次快照 + 整页文本 tail | 「回开」是**另一个空会话**，不是同一个开关来回跳 |
| `.tmp/soak-label/probe3.json` | 新构建下同一隔离实例重启：**3 次**请求 + 5 次快照 + `checks` | 新文案真机核对（`工作流开关 \| 开` / `关`）；`no-full-crew: true` |
| `.tmp/soak-label/dsh-home/sessions/*/session-*/session.v4.jsonl.zstd` | 会话日志（`zstdcat` 可读）：`plugin:grok-workflow/mode` 记录、`user/message` 计数、`turn/end` 错误 | 记录权威在 route 一侧；模型回合 `MISSING_CREDENTIAL` 所以模型回答 `NOT_RUN` |
| `.tmp/soak-label/boot.log` / `boot2.log` / `url.txt` / `url2.txt` | 两次启动日志与页面 URL（端口 3321） | 端口；两次起的是同一个隔离实例 |
| `.tmp/wt-composer-label/.tmp/ci.out` | 门禁原文，末行 `EXIT=0` | 门禁与构建读数（`CONFIRMED`）；`lib/ at 2f218d0 …` 那行 |

**scratch 的处置：`.tmp/soak-label/`（含 `dsh-home`、三次 probe 的 json/png/py、`boot*.log`、`url*.txt`、`home/`、`npm-cache`、`pnpm-store`）
全部在 `.tmp/`（gitignored）下，收尾时由包工头删除。** 本文件是逐字摘录，删掉 scratch 不会让下面的读数失去出处。

## 一、改了什么（四条文案，`git show 2f218d0 -- src/client/index.js`）

```diff
-      'mode.switch.label': 'Workflow',
+      'mode.switch.label': 'Workflow switch',
       'mode.switch.aria': 'Turn the grok workflow on or off for this session',
       'mode.switch.off': 'Off',
-      'mode.switch.on': 'On · full crew',
+      'mode.switch.on': 'On',
@@
-      'mode.switch.label': 'workflow总开关',
+      'mode.switch.label': '工作流开关',
       'mode.switch.aria': '为这个会话打开或关闭 grok 工作流',
       'mode.switch.off': '关',
-      'mode.switch.on': '开 · 全员模式',
+      'mode.switch.on': '开',
```

其余六个键（`aria` / `off` / `reading` / `busy` / `noSession` / `failed`）在两个语言里**一字未动**。

## 二、门禁与构建（`.tmp/wt-composer-label/.tmp/ci.out`，`2f218d0` 的树）

`TMPDIR=$PWD/.tmp npm run ci`：

```
Found 15 warnings and 0 errors.
Finished in 87ms on 177 files with 96 rules using 6 threads.

> dsh-grok-workflow@0.13.35 verify:lib
> node scripts/verify-lib.mjs

client bundle: 321607 bytes → lib/client.js
lib/ at 2f218d0 is the build of src/ at 2f218d0 (281 files, byte-identical)
```

```
 Test Files  98 passed (98)
      Tests  1832 passed (1832)
   Start at  11:13:44
   Duration  93.03s (transform 2.45s, setup 0ms, import 7.88s, tests 74.22s, environment 10ms)

EXIT=0
```

体积差额（收口轮自己量的）：

```
$ git show 424ed99:lib/client.js | wc -c
321631
$ git show 2f218d0:lib/client.js | wc -c
321607
```

**差 24 字节**，就是四条文案变短。用例总数 **1832** 与基线同数——本轮没增删用例，只收紧 7 处断言、加 2 条守卫。

定向测试（收口轮自己重跑，同一条命令）：

```
$ TMPDIR=$PWD/.tmp npx vitest run test/client.spec.ts test/i18n-parity.spec.ts
 ✓ test/client.spec.ts (132 tests) 310ms
 ✓ test/i18n-parity.spec.ts (6 tests) 9ms

 Test Files  2 passed (2)
      Tests  138 passed (138)
   Duration  939ms (transform 283ms, setup 0ms, import 394ms, tests 319ms, environment 0ms)
```

旧文案在代码里已清零：

```
$ grep -rn "full crew\|全员模式\|workflow总开关" src/ test/
（无输出，exit 1）
```

六个文档守卫（收口轮自己跑，**改完 `CHANGELOG.md` 之后**）——`docs-version` 读 `CHANGELOG.md`：

```
$ TMPDIR=$PWD/.tmp npx vitest run test/docs-version.spec.ts test/update-entry.spec.ts \
    test/update-surface.spec.ts test/docs-config-keys.spec.ts test/i18n-parity.spec.ts \
    test/docs-architecture-version.spec.ts
 ✓ test/update-entry.spec.ts (20 tests) 168ms
 ✓ test/update-surface.spec.ts (29 tests) 69ms
 ✓ test/docs-config-keys.spec.ts (13 tests) 16ms
 ✓ test/docs-version.spec.ts (8 tests) 12ms
 ✓ test/i18n-parity.spec.ts (6 tests) 9ms
 ✓ test/docs-architecture-version.spec.ts (3 tests) 6ms

 Test Files  6 passed (6)
      Tests  79 passed (79)
   Duration  1.42s (transform 195ms, setup 0ms, import 298ms, tests 280ms, environment 1ms)
```

### 用户文档里的旧叫法，本轮一并改掉（`README.zh-CN.md`）

`README.zh-CN.md:248` 的段落开头原本写着「**再接一个「workflow总开关」。**」，与屏幕上新的「工作流开关」不一致，本轮一并改掉：

```diff
-**再接一个「workflow总开关」。** 第三个 dock 开关，id `grok-workflow-mode`，就是可点的 `/grok on|off`：…
+**再接一个「工作流开关」。** 第三个 dock 开关，id `grok-workflow-mode`，就是可点的 `/grok on|off`：…
```

`git diff --numstat README.zh-CN.md` → `1	1	README.zh-CN.md`（**+1 −1**，只动这一处措辞）。同段后面
「挂载时读一次，界面只画路由回读出来的状态…」「会话还没有记录时显示部署默认值 `grokDefault`…」「关闭有三重提示——文案、空心指示灯、
熄灭的胶囊」**一字未改**（那些仍然是真话）；英文 `README.md:262` 本来就叫 **`The workflow switch, after them.`**，未动。

改后再跑同一批守卫（`docs-config-keys` 读两个 README）：

```
 Test Files  6 passed (6)
      Tests  79 passed (79)
   Start at  11:21:57
   Duration  1.22s (transform 192ms, setup 0ms, import 296ms, tests 271ms, environment 1ms)
```

改后 `grep -rn "full crew\|全员模式\|workflow总开关" --include='*.md' .`（排除 `node_modules`、`.tmp`）在**两个 README 里 0 命中**；
剩下的命中都在**引述旧值**的地方：`CHANGELOG.md` 的变更说明、本文件里的前后对照、`docs/knowledge/*` 的历史记录
（后者按「写下时为真」保留）。

## 三、复现读数

### ① 旧构建：开关只在挂载时读一次，命令写入后不刷新（`probe1.json`）

挂载时读到默认值，界面画成「开」：

```json
{"phase":"req","t":1.6,"method":"POST","url":"http://127.0.0.1:3321/grok-workflow/mode",
 "post":"{\"action\":\"status\",\"sessionId\":\"session-2abe70e6-e103-463a-aa03-9005f9341b4f\"}"}
{"phase":"resp","t":2.3,"status":200,
 "body":"{\"ok\":true,\"action\":\"status\",\"mode\":{\"enabled\":true,\"source\":\"default\",\"setBy\":null,\"turn\":null,\"workflowMode\":null,\"fallback\":true}}"}
```

打完 `/grok off` 回车后，会话里出现 `grok / Grok workflow OFF — normal chat.`，会话日志里**只有一条** mode 记录
（`zstdcat session-2abe70e6…/session.v4.jsonl.zstd | grep plugin:grok-workflow/mode`）：

```json
{"type":"plugin:grok-workflow/mode","seq":5,"time":1795576061946,
 "data":{"v":1,"enabled":false,"turn":0,"setBy":"command:/grok off"},"ignorable":true}
```

但开关**没有重新读**。`/grok-workflow/mode` 全部请求与响应（`modeCalls` 长度 **2** = 1 请求 + 1 响应），
也就是整个窗口只有挂载那一次；41 次快照的**代表行**（每条都相同，`calls` 恒为 2）：

```
7.2   initial              | workflow总开关 | 开 · 全员模式
9.4   after-off+2s         | workflow总开关 | 开 · 全员模式
47.6  after-off+40s        | workflow总开关 | 开 · 全员模式
52.0  after-next-turn+2s   | workflow总开关 | 开 · 全员模式
90.2  after-next-turn+40s  | workflow总开关 | 开 · 全员模式
```

（完整 41 行在 `probe1.json` 的 `switch[]`：initial 1 条 + `after-off+2…+40s` 20 条 + `after-next-turn+2…+40s` 20 条，**没有一行变化**。）

### ② 旧构建 reload：「回开」是另一个会话（`probe2.json`）

reload 后前端打开的是**另一个新建空会话**（那时 `user/message` 计数为 0），它没有记录，宿主答默认值：

```json
{"t":2.4,"post":"{\"action\":\"status\",\"sessionId\":\"session-f259f6a0-f75a-4d12-89cc-14fbccccc777\"}",
 "body":"{\"ok\":true,\"action\":\"status\",\"mode\":{\"enabled\":true,\"source\":\"default\",…\"fallback\":true}}"}
```

点回上一条对话（`session-2abe70e6…`）后，开关重挂载读一次，读到的是**记录**：

```json
{"t":17.1,"post":"{\"action\":\"status\",\"sessionId\":\"session-2abe70e6-e103-463a-aa03-9005f9341b4f\"}",
 "body":"{\"ok\":true,\"action\":\"status\",\"mode\":{\"enabled\":false,\"source\":\"record\",\"setBy\":\"command:/grok off\",\"turn\":0,\"workflowMode\":null,\"fallback\":true}}"}
```

快照（代表行，13 条全部如下两态之一）：

```
7.8   reload-mounted      | workflow总开关 | 开 · 全员模式   checked=true
16.9  after-reload        | workflow总开关 | 开 · 全员模式   checked=true
21.0  after-open-session  | workflow总开关 | 关              checked=false
41.2  after-turn+20s      | workflow总开关 | 关              checked=false
```

**三次对「有记录的会话」的读取（reload 前、reload 后、下一回合）都是 `source:"record", enabled:false`，与账本逐字一致；
没有一次读回 `source:"default"`。**

### ③ 新构建：文案真机核对（`probe3.json`，同一隔离实例重新装本 worktree 构建后重启）

```json
{"t":2.9,"action":"status"} → {"enabled":true,"source":"default","setBy":null,"turn":null,"workflowMode":null,"fallback":true}
{"t":7.9,"post":"{\"action\":\"set\",\"sessionId\":\"session-f259f6a0-f75a-4d12-89cc-14fbccccc777\",\"enabled\":false}",
 "body":"{\"ok\":true,\"action\":\"set\",\"mode\":{\"enabled\":false,\"source\":\"record\",\"setBy\":\"switch:mode\",\"turn\":0,\"workflowMode\":null,\"fallback\":true}}"}
{"t":15.5,"action":"status"} → {"enabled":false,"source":"record","setBy":"switch:mode",…}
```

快照（5 条全部摘录）：

```
7.9   fresh-session          | 工作流开关 | 开   checked=true
10.4  after-click-off        | 工作流开关 | 关   checked=false
14.5  after-turn             | 工作流开关 | 关   checked=false
22.6  after-reload-new-session | 工作流开关 | 关  checked=false
26.7  after-open-old-session | 工作流开关 | 关   checked=false
```

`checks`：

```json
{"no-full-crew":true,"label-and-state":"工作流开关 | 关","sidebar":""}
```

### ④ 两次装的不是同一份构建

```
$ sha256sum lib/client.js                      # 本 worktree（= 本轮构建）
4ce107e1901a44e6ef327245de28680c5d9305d436f289c2dd30c47fb3b98d09
$ sha256sum .tmp/soak-label/dsh-home/profiles/web-clone/node_modules/dsh-grok-workflow/lib/client.js
4ce107e1901a44e6ef327245de28680c5d9305d436f289c2dd30c47fb3b98d09   # 与上面逐字节相同，且不是软链（拷贝）
$ sha256sum /home/fish/projects_mine/dsh-grok-workflow/lib/client.js     # 主检出 main @ 424ed99，0.13.35
1455d91e832be8cbced740275078e70747d5d320a2485406e9582f750e102808
```

主检出那份含 `workflow总开关`（1 处）、不含 `工作流开关`（0 处），与 probe1/probe2 快照里的旧文案一致；probe3 重装后克隆里是
`4ce107e1…`，与本 worktree 的构建逐字节相同。

### ⑤ 模型回合 `NOT_RUN`

隔离克隆按设计脱敏掉了 `AGENT2API_API_KEY`，每次发消息都以 `turn/end {kind:error}` 结束，页面显示「本轮运行失败」，原文：

```
本轮运行失败llm-pi-ai: no credential for provider route "agent2api"; its profile resolves AGENT2API_API_KEY,
which is not set — store AGENT2API_API_KEY through the credentials service (the web Models page writes it) or
export it, and remove apiKeyEnv only if this provider should authenticate from pi-ai's own environment discovery
MISSING_CREDENTIAL
```

读数覆盖的是「发出一条消息、开一回合」这一层；**模型回答本身 `NOT_RUN`**。

## 四、定性结论

1. **不是回落 bug。** 没有观察到一次「对有记录的会话读回默认值」；`source:"record", enabled:false` 三次一致。记录权威在 route 一侧是对的。
2. **看到的「回开」有两个成因**：开关挂在**另一个没有记录的新会话**上（那里 `grokDefault: on` 是诚实答案）+ reload / 切会话会重新挂载并重读。
3. **真正存在的客户端缺陷方向相反**：**挂载时读一次，命令写入后不刷新**（没有轮询、没有事件订阅）。**点击会刷新**（写响应回填状态），
   **打字 `/grok off` 不会**。本轮只记录，不修（判据见 `DECISIONS.md` 的 `D-149`）。
4. **本轮未复现旧记忆里「打字 `/grok off` 之后开关显示关」那半句**：按读数，观察到的「关」只来自点击，或 reload / 切会话后的重新挂载。
5. **旧疑点结案**：`VALIDATION.md:410` 那条 `HYPOTHESIS`（写下时为真的记录，原文不回改）由 `VALIDATION.md` 同日新节订正——
   「疑似回落到 profile 默认值」不成立。

## 五、这份证据里没有什么

不含任何 API key、token、完整会话正文或完整页面文本。页面 tail 只摘了与开关行为有关的那几行（`probe2.json` 的 `tail`
还含一条 `MISSING_CREDENTIAL` 错误原文，属于环境事实、不含凭据）。克隆报告里那 1 行脱敏只记了文件与行号（`cordis.patch.yml:379`），
**没有记录它的内容**。
