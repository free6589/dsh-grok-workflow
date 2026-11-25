# 打字 `/grok on|off` 之后已挂载的开关自己刷新：门禁 + 真机前后对照（2026-11-25）

验收对象：分支 **`fix/switch-refresh`**（worktree `.tmp/wt-switch-refresh`），基线 `main` 尖端 **`84efda0`**，两个代码/测试提交
**`8b32e5e`**（`fix(client): refresh the mounted workflow switch after a command writes the record`，3 文件：`lib/client.js` 143/0、
`src/client/index.js` 143/0、`test/client.spec.ts` 230/1）与 **`ded1df6`**（`test(client): keep the listener snapshot without tripping the
spread lint`，1 文件：`test/client.spec.ts` 3/1），其后再一条**只写文档与证据**的提交。
环境：Node **v26.8.1**；真机 scratch home `.tmp/soak-switch/dsh-home`（`DSH_HOME`，profile **`web-clone`**，由
`node scripts/clone-profile.mjs` 从 live `web` profile 克隆），端口 **3321**；headless Chromium（`/usr/bin/chromium`，Playwright/Python，
viewport 1500×1000）。**live `~/.dsh` 与 3080 上的实例全程未写、未重载、未重启。**
口径：`AGENTS.md` §2 的四个状态词。每条结论都能回指下面的一个读数或一个文件路径。

## 清单

| 文件（原始位置） | 是什么 | 支撑哪条结论 |
| --- | --- | --- |
| `probe-baseline.json`（原 `.tmp/soak-switch/probe-baseline.json`） | **改前**（克隆里原本装的 0.13.32 构建）：挂载读、打字 `/grok off`、**20 次**（20 秒）开关状态快照 + `/grok-workflow/mode` 全部请求与响应 + 整页文本 tail | ① 命令确实写了记录；② 已挂载的开关**不刷新**，20 秒内一次都没变；③ 全程只有挂载时那 **1** 次请求 |
| `probe-fixed-flip.json`（原 `.tmp/soak-switch/probe-fixed-flip.json`） | **改后**（本轮构建）：加载读回的记录、打字 `/grok on`、打字 `/grok off`、每次写入后按 0.5 秒采样，最后 **+15 秒静默窗**；全部请求与响应 | ① 两次打字都在 **+0.5 秒**内自动变；② 全程 `/grok-workflow/mode` **4** 次（加载 2 + 两次写入各 1）；③ 静默窗 **0** 次新请求 |
| `probe-load.json`（原 `.tmp/soak-switch/probe-load.json`） | **改后**：一次冷加载的请求/帧时间轴（三条：挂载读、wire 里的 mode 记录、第二次读） | 残留：每次加载**多读一次** `status`；以及它的成因（历史 follow 帧晚于订阅到达） |
| `probe-wire.json`（原 `.tmp/soak-switch/probe-wire.json`） | **改后**：`/api/remote.mux` websocket 帧里命中的三条 `plugin:grok-workflow/mode` 记录（seq **5** / **27** / **30**） | 客户端**真的收得到**这条记录——订阅路径的前提在真机上成立，不再是 `HYPOTHESIS` |
| `.tmp/wt-switch-refresh/.tmp/ci-code.out`（未拷，留在 `.tmp/`） | 门禁原文，末行 `EXIT=0` | 门禁与构建读数（`CONFIRMED`），`lib/ at ded1df6 …` 那行 |

**scratch 的处置**：`.tmp/soak-switch/`（含 `dsh-home`、probe 脚本、`boot*.log`、`url.txt`、`clone-report.json`）全部在 `.tmp/`（gitignored）下，
收尾时由包工头删除。**本目录只保留上面四个 probe 的 JSON**；`url.txt`（含页面访问 token）、`boot*.log`、`clone-report.json` 的正文
**刻意没有拷进来**，`README` 里也不出现 token、会话正文或凭据。本文件是逐字摘录，删掉 scratch 不会让下面的读数失去出处。

## 一、改了什么（一句话）

`/grok off` 打字写入后，**已挂载**的开关会自己读一次并重画（读到新的 mode 记录 seq 才读，同一 seq 只读一次，无定时器、无轮询）；
`src/client/index.js` 侧复用已有的 `['uiConversation','sessions']` 注入拿 `sessions.binding(id).eventSource`，**没有新增必需依赖**，
路由、host 动作列表与答案形状零改动。判据与候选对比见 `docs/knowledge/DECISIONS.md` 的 **`D-150`**。

## 二、门禁与构建（`.tmp/wt-switch-refresh/.tmp/ci-code.out`，`ded1df6` 的树）

`TMPDIR=$PWD/.tmp npm run ci`：

```
Found 15 warnings and 0 errors.
Finished in 203ms on 177 files with 96 rules using 6 threads.

client bundle: 329354 bytes → lib/client.js
lib/ at ded1df6 is the build of src/ at ded1df6 (281 files, byte-identical)
```

```
 Test Files  98 passed (98)
      Tests  1838 passed (1838)
   Duration 97.52s (transform 2.75s, setup 0ms, import 8.18s, tests 78.36s, environment 11ms)

EXIT=0
```

用例总数 **1838** = 基线 **1832** + 本轮新增 **6**（`test/client.spec.ts` 132 → **138**）。`Found 15 warnings` 与基线同数：
`ded1df6` 就是为消掉本轮新增的第 16 条警告（`unicorn(no-useless-spread)`，`[...listeners]` → `Array.from(listeners)`）而做的。

构建体积：

```
$ git show 84efda0:lib/client.js | wc -c
321607
$ wc -c lib/client.js
329354 lib/client.js
```

**+7747 字节**，就是订阅那一段（三个辅助函数 + 一个 `useEffect` + 注入投递）。

## 三、真机读数

### ① 改前：命令写了记录，已挂载的开关不刷新（`probe-baseline.json`）

挂载读一次，宿主答默认值，界面 `workflow总开关 | 开 · 全员模式`：

```json
{"t":1.8,"status":200,"method":"POST",
 "post":"{\"action\":\"status\",\"sessionId\":\"session-b282ef61-3c60-4a61-a025-9fa1b4e8887c\"}",
 "body":"{\"ok\":true,\"action\":\"status\",\"mode\":{\"enabled\":true,\"source\":\"default\",\"setBy\":null,\"turn\":null,\"workflowMode\":null,\"fallback\":true}}"}
```

打字 `/grok off` 回车后，**20 秒 × 20 次快照全部停在「开」**，`calls` 恒为 **1**（代表行）：

```
t= 4.8  initial        | workflow总开关 | 开 · 全员模式 | checked=true lamp=on calls=1
t= 7.6  after-off+1s   | workflow总开关 | 开 · 全员模式 | checked=true lamp=on calls=1
t=26.6  after-off+20s  | workflow总开关 | 开 · 全员模式 | checked=true lamp=on calls=1
```

`"mode_line_seen": false`：整页文本 tail 里也看不到任何状态变化。**`/grok-workflow/mode` 整个窗口只有挂载那 1 次请求。**

### ② 改后：打字两次，两次都在 +0.5 秒内自动变（`probe-fixed-flip.json`）

加载时读到的是**记录**，界面 `工作流开关 | 关`：

```json
{"t":2.0,"status":200,"method":"POST",
 "post":"{\"action\":\"status\",\"sessionId\":\"session-b282ef61-3c60-4a61-a025-9fa1b4e8887c\"}",
 "body":"{\"ok\":true,\"action\":\"status\",\"mode\":{\"enabled\":false,\"source\":\"record\",\"setBy\":\"command:/grok off\",\"turn\":0,\"workflowMode\":null,\"fallback\":true}}"}
```

打字 `/grok on` → 宿主写出记录后，开关**自己**发了一次 `status`（t=7.47），答复：

```json
{"ok":true,"action":"status","mode":{"enabled":true,"source":"record","setBy":"command:/grok","turn":0,"workflowMode":"full","fallback":true}}
```

采样（代表行，`calls` 就是 `/grok-workflow/mode` 的累计请求数）：

```
t= 5.89  initial           | 工作流开关 | 关 | checked=false lamp=off calls=2
t= 7.95  /grok on  +0.5s   | 工作流开关 | 开 | checked=true  lamp=on  calls=3
t=15.49  /grok on  +8.0s   | 工作流开关 | 开 | checked=true  lamp=on  calls=3
t=17.56  /grok off +0.5s   | 工作流开关 | 关 | checked=false lamp=off calls=4
t=40.11  quiet +15s        | 工作流开关 | 关 | checked=false lamp=off calls=4
```

打字 `/grok off` 那次的答复回到 `enabled:false`（t=17.08），界面同样在 **+0.5 秒**变「关」。
**全程没有点击开关、没有 reload**；之后 **15 秒静默窗 0 次新请求**（`calls` 停在 4）——**没有任何定时器**。

### ③ 客户端真的收得到那条记录（`probe-wire.json`）

`ws://127.0.0.1:3321/api/remote.mux` 的帧里直接命中（三条，摘录 seq 5）：

```
{"type":"event","event":{"type":"plugin:grok-workflow/mode","seq":5,"time":1795578135682,
 "data":{"v":1,"enabled":false,"turn":0,"setBy":"command:/grok off"},"ignorable":true}}
```

另两条是 seq **27**（`enabled:true`、`setBy:"command:/grok"`、`workflowMode:"full"`）与 seq **30**（`enabled:false`、`setBy:"command:/grok off"`）。
`ignorable: true` 只挡模型那一侧，不挡浏览器——这条读数就是「订阅会话事件窗口」这条路的前提。

### ④ 残留（如实记）：每次页面加载多读一次（`probe-load.json`）

一次冷加载的三条时间轴：

```
t=1.67  req POST /grok-workflow/mode  {"action":"status","sessionId":"session-b282ef61-…"}
t=1.69  wire-record  {"type":"plugin:grok-workflow/mode","seq":5,…,"setBy":"command:/grok off","ignorable":true}
t=1.69  req POST /grok-workflow/mode  {"action":"status","sessionId":"session-b282ef61-…"}
```

**相隔约 20 ms 的两次 `status`。** 成因：挂载那次读在 **t=1.67s** 发出，而会话历史的 follow 帧 **t=1.69s** 才到——订阅建立时窗口还是空的
（基线 `seen` 为 `undefined`），于是那条「本来就在历史里」的记录被当成新记录又读了一次。后果只是每次加载多一个几十字节的 POST，
状态收敛正确，**不是轮询**。所以本目录与 `VALIDATION.md` 的措辞是「同一 seq 只读一次；**例外**是冷加载时历史记录晚于订阅到达，会多读一次」，
**不写成「同一 seq 永远只读一次」**。

## 四、定性结论

1. **缺陷修好了（真机，`CONFIRMED`）**：打字 `/grok on` / `/grok off` 之后，已挂载的开关在 **+0.5 秒**内自己变，不打字不点不刷新；
   两次写入各只多 **1** 次请求，静默 15 秒 **0** 次——**不是轮询**。
2. **机制前提成立（真机，`CONFIRMED`）**：那条 `plugin:grok-workflow/mode` 记录真的出现在客户端的 `/api/remote.mux` 帧里，
   所以「订阅会话事件窗口」不是纸面方案。
3. **改前读数仍然是同一台机器、同一个隔离实例、同一个会话 id**，只是装的是克隆里原本的 0.13.32 构建；两次装的不是同一份 `lib/client.js`：
   本轮构建 `sha256 = 52cdace8586a174adc463c6e3d18fafc82dd4d48b330095d383141074c497790`，与 worktree 的 `lib/client.js` **逐字节相同**
   （拷进 profile，不是软链）。
4. **残留一条**：冷加载多读一次（见 ④），已写进 `D-150` 的 Consequences 与 `VALIDATION.md`，不掩盖。

## 五、这份证据里没有什么

不含任何 API key、页面访问 token、凭据或完整会话正文。页面文本只摘了与开关行为有关的那几行；`url.txt` 因为带页面 token **没有拷进来**，
`boot*.log` 与 `clone-report.json` 的正文也没有拷（克隆报告的计数写在 `VALIDATION.md` 里）。四个 probe JSON 里只有 `/grok-workflow/mode`
的请求体/答复、`plugin:grok-workflow/mode` 记录片段与开关自己的 `data-*` 读数。
