# 强制团队路由（forced team routing）真机 soak — 2026-11-26

被测对象：`release/0.13.49` 合并提交 `3ec12d5ec4da7371fe66290c0de32bfa2dcef39a`（父 `a5dfc75` + `e9a48b9`）。
环境：`~/.dsh/profiles/web` 的克隆（`DSH_HOME=.tmp/soak-force-team/dsh-home`，profile `web-clone`），
端口 3392，真实模型 `bifrost-responses / opencode-go/muse-spark-1.3-contributor`。
状态词汇按 `AGENTS.md` §2。**每条读数都能回指一个命令、一段原文或一个证据文件。**

## 0. 结论先看

| 断言 | 判定 | 一句话 |
| --- | --- | --- |
| **1 注入 · 模型侧** | `CONFIRMED` | 请求体里逐字带块，用户原话是同一段文本的**字节相同前缀**，余下部分与 `TEAM_INSTRUCTION_ZH` **字节全等** |
| **1 注入 · 不写会话事件** | `CONFIRMED`（窄义） | 注入自身**不多写一行**：带注入的回合与不带注入的回合，`user/message` 行数一样（5） |
| **1 注入 · 不进 UI** | **`FALSIFIED`** | 块写进了那条 `user/message` 的 `content` 第二块，UI 把它**原样渲染在用户气泡里**。D-167 写的是「不进 UI——这句只给模型看」 |
| **2 回合闸门** | `CONFIRMED` | 四条例全中：恰好 1 条 `grok-workflow-force-team` 行、四行双语正文逐字、被拒的那一步 0 次模型调用、同回合无第二次拒绝 |
| **2 拒绝可见性** | **`FALSIFIED`**（会话行之外的预期） | 拒绝行只在会话日志里；UI 不渲染它，回合显示「已完成」。用户看不到自己被拒的原因 |
| **3 团队真跑起来** | `CONFIRMED`（不带关键词那一轮） | `grok_workflow` 真调起，33 条 `tool-workflow/*`，14 个子代理，`run-end: completed`，答案与夹具真值一致（3 / 6 行） |
| **3 带「开团」跑到团队** | **`NOT_RUN`** | 五轮带关键词的请求**全部**到不了 run：模型开单台（`grok_open_block`），闸门随即拒绝下一步。见 §5 F3 |

一句话：**注入与闸门都按代码工作了，但两者合起来在这台机器上是一条死路——「开团」要求模型用团队工具，模型一用接单台，闸门就把下一回合拒掉；而接单台本身不写 `tool-workflow/*`。**

## 1. 装进去的是哪一版（`CONFIRMED`）

提交取自本地分支，**没有**碰合并者的工作树（`.tmp/wt-release-0.13.49` 一字未写）：

```
$ git archive 3ec12d5 | tar -x -C .tmp/soak-force-team/src          # EXIT=0
$ git rev-parse 3ec12d5^{commit} → 3ec12d5ec4da7371fe66290c0de32bfa2dcef39a
$ (cd .tmp/soak-force-team/src && npm ci --prefer-offline)          # CI_EXIT=0, 86 packages
$ npm run build                                                     # BUILD_EXIT=0
  client bundle: 372480 bytes → lib/client.js
$ npm pack  → dsh-grok-workflow-0.13.48.tgz  1012301 bytes  shasum 7dc36a0ebe3a6b75ac6a83b0cd078143ba6411f8
```

`npm pack` 第一次失败（`EROFS: read-only file system, open '/home/fish/.npm/_cacache/tmp/…'`），
改用工作区内的缓存后成功：`npm_config_cache=<scratch>/npm-cache npm pack --pack-destination .`。
这是本机沙箱的又一处坑（`~/.npm` 不可写），记在 §7。

**三重哈希一致**（提交里的 / 我重编的 / 装进克隆的）：

| 文件 | 提交 `3ec12d5` | 重编后 | 装进 web-clone |
| --- | --- | --- | --- |
| `lib/force-team.js` | `23a4ab3e4f6955c67cb0bd027088d1f636cdbfb1091706cb366732aca089040b` (21096) | 同左 | 同左 |
| `lib/client.js` | `055bbadf7b93a0ac6f50cbee0ecdda4aea46ad029f67ef8c35fecc87a7923b00` (372480) | 同左 | 同左 |

`lib/client.js` 与基线 `a5dfc75` 的 blob 哈希**也相同**（`git show a5dfc75:lib/client.js | sha256sum` → 同值），
与派单给的读数一致。`package.json` 仍是 `0.13.48`——**版本号不是判别器**，判据是上表第一行。

安装：`dsh plugin --profile web-clone add file:<…>.tgz` → `ADD_EXIT=0`，
profile 依赖行变成 `"dsh-grok-workflow": "file:…/dsh-grok-workflow-0.13.48.tgz"`。

## 2. 观测装置（`CONFIRMED`）

注入发生在 `agent/pre-step`、**不写会话事件**，所以会话音只能看到「结果」，看不到模型被告知了什么。
唯一能看见它的地方是**发给模型提供方的请求体**：

- `rig/capture.mjs`：`127.0.0.1:18190` → 真实网关 `127.0.0.1:18088` 的**纯透传**，把每个请求体原样落盘
  （`capture/index.txt` 一行一次请求；`capture/req-NNN.json` 是原始请求体）。请求头照转但**从不记录**（带凭据）。
- 克隆里只把 `bifrost-responses` 的 `baseURL` 指到 `18190`（角色与默认模型都走这条），其余 provider 未动。
- 浏览器侧：`rig/drive.mjs`（发一句，等页面稳定，存截图 + 页面 `innerText` + 消息行）、
  `rig/inspect.mjs`（重开会话再看一眼）。用 `@playwright/cli` 的 playwright（1.64.1），不走坏掉的全局 CLI。

** soak-prep §4 的启动行是错的**（它自己标了 `H3` 没复核）：`dsh web --profile web-clone …` 直接报
`error: option '--profile <name>' argument 'web-clone' is invalid. select a profile only once`——
因为 `dsh web` 本身就是 `dsh --profile web`（`src/args.ts`：第一个位置参数会被展开成 `--profile`）。
实测可用的启动行是：

```
DSH_HOME=<scratch>/dsh-home dsh --profile web-clone --port 3392 --host 127.0.0.1 --no-open
→ dsh web: http://127.0.0.1:3392/?token=<已脱敏>
```

## 3. 断言 1：注入（模型侧 `CONFIRMED`，UI 侧 `FALSIFIED`）

第一轮「开团：1+1 等于几」，捕获到的请求体 `capture/req-001.json`（135198 字节）里，
最后一条用户输入是 `input[1].content[0]`，`text` 长 **502 字节**。逐字：

```
开团：1+1 等于几【强制：这一轮走团队模式】
这一轮不许单条作答。按顺序做完这三步：
1. 先拆活——把要做的事拆成可以并行的任务，每个任务写清产出和验收标准；
2. 再并发执行——用工作流/团队工具把这些任务并发派给子代理，不要自己一个个做完；
3. 最后汇总——所有任务回来后按验收标准逐条核对，再给结论，没通过的必须写明没过。
第一步是拆活，现在就做。
```

机器判定（拿**装进去的** `lib/force-team.js` 里导出的常量做基准，不是手抄）：

```
expected block bytes: 480
captured text bytes:   502
user words are a byte-identical prefix: true
remainder === TEAM_INSTRUCTION_ZH byte-for-byte: true
last line is the ZH closer: true
EN block present (must be false in a zh turn): false
```

即：用户原话（10 字）是这一段**字节相同的前缀**，剩下的 480 字节与 `TEAM_INSTRUCTION_ZH` **完全相等**，
结尾就是 `第一步是拆活，现在就做。`，中文回合里没有混进英文块。**断言 1（模型侧）成立。**

### 3.1 但「不写会话事件 / 不进 UI」是假的（`FALSIFIED`）

会话里那条用户消息（`seq=9`）的 `content` 变成**两个 text 块**——第二块就是上面那段：

```json
{"type":"user/message","seq":9,"data":{"content":[
  {"type":"text","text":"开团：1+1 等于几"},
  {"type":"text","text":"【强制：这一轮走团队模式】\n…第一步是拆活，现在就做。"}],
 "source":{"kind":"user",…},"role":"user","id":"b6613462-…"},"surfaceOp":"append"}
```

- **窄义上「不写会话事件」成立**：注入本身不多写一行。带注入的回合 `user/message` 行数 = 5，
  不带注入的那一轮（`session-d127bbb6`）也是 5，注入没有增加行。
- **但块确实进了会话记录，也进了 UI。** 页面 `innerText`（`turns/turnA-inject.txt`）里，
  用户气泡原样显示整段块；侧边栏标题截成「开团：1+1 等于几 【强制：这」。截图 `turns/turnA-inject.png`、
  `turns/turnB-reopened.png` 都是同一形态。客户端 bundle 里既没有 `【强制：这一轮走团队模式】`
  也没有 `grok-workflow-force-team`（`grep -c` 都是 0），所以它**不是被刻意隐藏的**，是照常渲染。

与 `docs/knowledge/DECISIONS.md` D-167 第 1 条原文冲突：

> **不改原文**、不写会话事件、不进 UI——这句只给模型看。

「不改原文」成立（真的只追加，前缀不变）；「不写会话事件」在窄义成立；**「不进 UI」不成立**。

## 4. 断言 2：回合闸门（`CONFIRMED`，四条例全中）

第二轮：「开团：先读一下 README.md 第一行，再告诉我这行一共几个字」（33 字）。
模型第一步调了 `grok_open_block`（拿到工具结果），第二步的 `agent/pre-step` 被拒。
证据：`sessions/session-2be61f93-….jsonl`。

```
turn/start {"turn":1}
step/start {"turn":1,"step":1}
user/message kind='user'          ← 带注入的那条
… 
tool/call grok_open_block
tool/result
step/end {"turn":1,"step":1}
user/message kind='grok-workflow-force-team'   ← 拒绝行（唯一一条）
turn/end {"turn":1,"reason":{"kind":"blocked"}}
```

四条例逐条：

1. **恰好一条** `source.kind == 'grok-workflow-force-team'` 的 `user` 角色行：`user/message rows with source.kind == grok-workflow-force-team : 1`，`role='user'`。
2. **正文是 intake 的四行双语拒绝**，逐字（4 行）：

```
this turn asked for a team but started no team: no workflow ran inside it, so one model was about to answer alone (the message that asked was 33 characters long)
这一轮要的是团队，但没有任何团队起来：回合内没有工作流运行，等于一个模型准备单独作答（提出要求的那条消息 33 字符）
send it again so it runs as a team: split the work, run the tasks concurrently, then summarise
重新发一次，让它按团队方式执行：先拆活、再并发执行、最后汇总
```

其中 `33` 恰好等于我实际敲进去的字符数（脚本实测 `len(...) = 33`），说明 `chars` 走的是真实测量。

3. **被拒的那一步 0 次模型调用**：该回合只有 `step/start 1 / step/end 1`，没有第 2 个 `step/start`；
   代理索引里该回合只有一次正文调用（`seq=003`，135253 字节）和一次标题调用（`seq=004`，400），
   拒绝行写在 `03:39:07.869Z`，**晚于**这两次请求（`03:38:51.49x`），之后没有任何请求。
4. **同回合没有第二次拒绝**：拒绝行计数为 1，`turn/end` 紧跟其后。

### 4.1 但用户看不见这条拒绝（`FALSIFIED`）

拒绝行只存在于会话日志里。页面 `innerText`（`turns/turnB-gate.txt`）里 `这一轮要的是团队` 出现 **0 次**，
`no workflow ran inside it` 也是 **0 次**；重开会话再看（`turns/turnB-reopened.txt`）仍是 0 次，
截图 `turns/turnB-reopened.png` 显示的是「已完成，用时 16 秒」加模型那句「收到——这一轮走团队模式，现在只做第一步拆活。」。
**回合被判 `blocked`，UI 说「已完成」，拒绝理由一个字都没有。**

代码里 `writeRefusal` 的注释说「Write the refusal where a reader can see it」——读者其实看不到。

## 5. 断言 3：团队真跑起来（`CONFIRMED`，但代价是丢掉关键词）

### 5.1 带「开团」的五轮：全部到不了 run（`NOT_RUN`）

| 轮 | 请求（前缀） | 步数 | 模型调的工具 | 拒绝行 | `tool-workflow/*` | 回合结局 |
| --- | --- | --- | --- | --- | --- | --- |
| A | 开团：1+1 等于几 | 1 | `grok_open_block` | 1 | 0 | blocked |
| B | 开团：先读一下 README.md 第一行… | 1 | `grok_open_block` | 1 | 0 | blocked |
| C | 开团：用 grok_workflow 工具统计… | 1 | `grok_open_block` | 1 | 0 | blocked |
| D | 同上，先 `/grok on` | 1 | `grok_open_block` | 1 | 0 | blocked |
| E | 开团：请直接调用 grok_workflow 工具本身… | 1 | **无** | 0 | 0 | completed |

D 轮证明这不是「模式没开」的问题：`/grok on` 之后会话记录里有
`plugin:grok-workflow/mode {"enabled":true,"setBy":"command:/grok"}`，UI 的「工作流开关」也变成「开」，
`grok_open_block` 这次**成功**返回了接单预览（两块并行任务，`preview_id`/`split_hash` 齐全）——
但 `grok_open_block` **一条 `tool-workflow/*` 事件都不写**，闸门照样拒。

E 轮是另一种漏法：模型把活拆完就停住（「待你说一声就进第二步」），只走了 1 步，
闸门根本没机会触发（要第 2 个 `pre-step` 才判），回合以 `completed` 收场——**用户同样拿到一个非团队回合**。

### 5.2 不带关键词的那一轮：团队真跑起来了（`CONFIRMED`）

`session-d127bbb6`（prompt：「用 grok_workflow 工具跑一个小活：objective 是「统计 README.md 和 CHANGELOG.md 各多少行」…」，
先 `/grok on`）：

```
tool-workflow/run-start       {"runId":"065a7148-…","name":"任务团队"}
tool-workflow/guardian-start  {"armed":true,"budgetMs":7200000}
tool-workflow/agent-start ×14 / agent-end ×14     ← 14 个子代理
tool-workflow/summary-final   {"draft":3}
tool-workflow/guardian-end
tool-workflow/run-end         {"stopReason":"completed"}
turn/end                      {"kind":"completed"}
```

共 **33 条** `tool-workflow/*` 事件，工具调用是 `grok_workflow` 本身。子代理是真干活
（子会话里 `bash` / `read` / `working_directory` / `structured_output` 都有，还有一个 `grok_replan_intents` 重规划波）。
结果与夹具真值**独立吻合**：我造的 `work/README.md` 是 3 行、`work/CHANGELOG.md` 是 6 行，
运行回报 `count_readme: wc -l 输出 3`、`count_changelog: wc -l 输出 6`，UI 最终答案「README.md：3 行 / CHANGELOG.md：6 行 / 合计 9 行」。
耗时 4 分 57 秒。

**这一轮没有「开团」二字，所以闸门全程没有介入。** 换句话说：团队机制本身是好的，
坏的是「强制路由」把它逼进的那个形状。

## 6. 三处与设计不符（给 lead 的清单）

- **F1（断言 1）** 注入块进了会话记录、也进了 UI，与 D-167「不进 UI——这句只给模型看」相反。
  用户会看到自己没写过的一整段命令，侧边栏标题也被它污染（「开团：1+1 等于几 【强制：这」）。
- **F2（断言 2）** 拒绝行写了，UI 不渲染；回合显示「已完成」。刹车踩了，但没告诉用户。
- **F3（断言 3）** `grok_open_block` 不写 `tool-workflow/*` 事件，而闸门只认这类事件；
  于是「模型乖乖开单台」恰恰是被拒的那条路。D-167 的括注「只有真的调了 `grok_workflow`（**或 `grok_open_block`**）才会有」
  与实测不符：`grok_open_block` 一次都没写过（A–D 四轮，`tool-workflow/*` 计数全是 0）。
- **F4（模式口径不一致）** 克隆里 `grokDefault: on`，force-team 据此认定「模式开」并注入；
  但接单台用的是「本会话有没有显式记录」的口径，于是第一轮工具直接回
  `Error: mode-off: 这个会话的 grok 模式没打开，接单台不接单`。**同一个开关，两处读法不同**，
  用户第一次「开团」必然撞这个错。
- **F5（一步停住可绕过）** 模型只走一步就停（E 轮），闸门没有第二个 `pre-step` 可判，回合 `completed`、无拒绝。

## 7. 读数与红线（`CONFIRMED`）

工具链：`dsh --version` = `0.2.2-rc.3`；`node -v` = `v26.8.1`；`npm -v` = `11.19.0`；
UI 自报 `0.2.2-rc.3-6b729fe`。端口 **3392**（`ss -ltn` 只此一处监听）。

live 侧全程只读。开跑前读数：

```
2026-11-25 23:14:14.025606767 +0800 /home/fish/.dsh
2026-11-22 16:59:46.687805286 +0800 /home/fish/.dsh/profiles
2026-11-26 08:40:55.240515003 +0800 /home/fish/.dsh/profiles/web
2026-11-26 08:40:55.161514610 +0800 /home/fish/.dsh/profiles/web/cordis.patch.yml
~/.dsh not writable
curl 127.0.0.1:3080/ → 401
```

收尾时前两条与 `cordis.patch.yml` **一字未变**，`~/.dsh/profiles/web` 的 mtime 变成 `11:22:40`——
那是**别的施工者**在同一时段装插件造成的，见 §9，不是本会话写的。

未写 `~/.dsh`；未重启 / 重载 / kill 3080；未改核心 DSH；未动合并者工作树 `.tmp/wt-release-0.13.49`；
未 push / 打 tag / bump 版本（`package.json` 在拷贝里仍是 `0.13.48`）；未 `npm publish`。

本机新增的坑（阶段 2 实测）：**`~/.npm` 不可写**，`npm pack` 会以 `EROFS … _cacache` 失败，
把 `npm_config_cache` 指到工作区内即可。

## 8. 证据清单

| 文件 | 内容 |
| --- | --- |
| `prep.md` | 阶段 1：克隆、钉配置、端口、红线读数 |
| `capture/index.txt` | 每一次转发给模型的请求：序号、时间、路径、模型、字节数、状态 |
| `capture/req-001.json` | 断言 1 的原始请求体（第一轮，含注入块） |
| `capture/req-003.json` | 断言 2 那一轮的原始请求体 |
| `sessions/*.jsonl` | 解压后的会话记录：**6 个父会话全留**，14 个子代理会话留 3 个代表（执行 / 检查 / 重规划） |
| `sessions/trials.json` | 全部 20 个会话的机器生成摘要（含被裁掉的 11 个子会话：步数、工具调用、结局） |
| `turns/*.txt` / `*.png` | 每轮页面 `innerText` 逐字 + 截图（A/B/C/D/E/F，含重开验证） |
| `rig/capture.mjs` | 透传抓包代理（不记请求头） |
| `rig/drive.mjs` | 发一句话、等稳定、存页面与截图 |
| `rig/inspect.mjs` | 重开会话再读页面 |

`capture/` 里其余 `req-*.json` 已裁剪（每个约 140 KB），保留 `index.txt` 全量索引与上述三份正文。

## 9. 一条不属于本会话的 live 变动（`CONFIRMED`，供 lead 对账）

收尾读数里 `~/.dsh/profiles/web` 的 mtime 从 `08:40:55` 变成了 **`11:22:40`**。
查清了：那一分钟里有**别人**在 live 档案里装了插件，不是本会话。

```
-rw------- 1950  2026-11-26 11:22:38  ~/.dsh/profiles/web/package.json
-rw------- 24055 2026-11-26 11:22:31  ~/.dsh/profiles/web/pnpm-lock.yaml
drwxr-xr-x  826  2026-11-26 11:22:31  ~/.dsh/profiles/web/node_modules
drwx------       11:22:19             ~/.dsh/profiles/web/.plugin-manager/logs
cordis.patch.yml  → 2026-11-26 08:40:55（没动，仍是准备时那份）
cordis.yml        → 2026-11-22 22:40:31（没动）
```

- live 里 `dsh-grok-workflow` 现在是 **`0.13.48`**（我准备时读的是 `0.13.47`），
  **而且 live 那份里没有 `lib/force-team.js`**（`ls` 直接不存在）——
  也就是说 live 拿到的是 0.13.48 那个 release 构建，**不含**本例的强制路由。
- live 的 `client.js` 仍是 `055bbadf…` / 372480 字节，与本次 soak 装的完全一致。
- 时间上不可能是本会话：本会话阶段 1 在 11:19 结束、阶段 2 在 11:30 才开始，11:22 我什么都没跑；
  且本会话每一条 `dsh` 命令都带 `DSH_HOME=<scratch>`，唯一一条裸 `dsh` 是 `dsh --version`（不写档案）。
  另外两个证据目录（`force-team-routing-2026-11-26/`、`release-0.13.49-2026-11-26/`）也在同一时段出现，是并行的别的施工者。

这一条不改任何判定，但 lead 要知道：**live 已经不是准备时那个 0.13.47 了**，对账时别拿我的准备读数当现状。
