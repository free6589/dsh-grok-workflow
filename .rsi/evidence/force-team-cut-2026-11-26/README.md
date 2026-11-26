# 强制团队路由「闸门删除」真机 soak（`e7ecfab`）— 2026-11-26

被测对象：`e7ecfaba3dca8e6b2b10864aa14a6d1ff47e7ca7`
（`fix(force-team): the turn gate is gone — a keyword buys the instruction and nothing else`）。
被删的是「关键词回合跑到第二步还没有团队 → `reject` 一次」那一半；剩下的只有注入。
状态词汇按 `AGENTS.md` §2，每条读数都能回指一个命令、一段原文或本目录里的一个文件。

环境：live 档案 `~/.dsh/profiles/web` 的克隆（`DSH_HOME=.tmp/soak-cut/dsh-home`，profile `web-clone`），
实例 `127.0.0.1:3392`，真实模型 `bifrost-responses / opencode-go/muse-spark-1.3-contributor`，
抓包代理 `127.0.0.1:18190` → 真实网关 `127.0.0.1:18088`。
live `~/.dsh` 只读未写，3080 未碰未重启。

## 0. 五条要求的判定（先看这段）

| 要求 | 判定 | 事实 |
| --- | --- | --- |
| **1 服从路径仍工作**（要团队 → 真起团队 → 有答案） | **`FALSIFIED`（部分）** | 5 个「开团」回合全部调了团队工具 `grok_open_block`（其中 2 次真拿到接单预览），但 **`tool-workflow/*` 事件 0 条**、`grok_workflow` 调用 0 次、没有任何块被认领：**没有一次真团队跑起来**，也就没有任何「开团」回合给出那两个数字。模型每次都在「拆活」之后停住等确认。 |
| **2 忽略路径无害** | **`CONFIRMED`** | 关键词回合调团队工具失败也好、成功也罢，回合都 `completed`、都有答案文本、**0 条拒绝行**（全 soak 0/7 会话） |
| **3 旧的死法没了** | **`CONFIRMED`** | 旧 build 会在「关键词 + 第二步还没有团队」处拒；本轮同一形状跑了 5 次：A1 走到**第 5 步**（第 2–4 步全是非团队工具）、B/C 走到第 2 步，全部 `completed` 并给出答案，**没有一次 `blocked`** |
| **4 哪儿都不拒** | **`CONFIRMED`** | 7 个会话（含一个空会话）逐字解压后 grep：`grok-workflow-force-team` **0** 次；`turn/end` 的 reason 只有 `completed`（没有任何 `blocked`） |
| **5 注入仍可观测** | **`CONFIRMED`** | 请求体里用户原话是**字节相同前缀**，余下 **480 字节**与装进去那份的 `TEAM_INSTRUCTION_ZH` **字节全等**；页面上原样显示在用户气泡里，短提示词那轮的**侧边栏标题也带上了块的开头** |

一句话：**闸门确实没了，什么也不拒了；同时「开团」并没有变成「真团队」——模型在拆活后就停下等确认，这一轮机器上没有一个关键词回合跑到团队 run。**

## 1. 装进去的是哪一版（`CONFIRMED`）

```
$ git archive --format=tar e7ecfab -o .tmp/soak-cut/cut.tar      # 75745280 bytes
$ tar -xf .tmp/soak-cut/cut.tar -C .tmp/soak-cut/src             # EXTRACT_EXIT=0
$ export npm_config_cache=$PWD/.tmp/soak-cut/npm-cache
$ (cd .tmp/soak-cut/src && npm pack --pack-destination ..)       # PACK_EXIT=0
  dsh-grok-workflow-0.13.49.tgz  1009997 bytes  164 files
  npm shasum c546d9dceffb8df5ac18fca74b0d4343b770e606
$ sha256sum .tmp/soak-cut/dsh-grok-workflow-0.13.49.tgz
  5d95ee7ed9575a02e7b752250ad445bdc53f6a3f554bccac837ceeb566f5e7f7
```

三处 `lib/force-team.js` 同哈希（提交里 / 打包里 / 装进克隆后）：

| 位置 | sha256 | 字节 |
| --- | --- | --- |
| `git show e7ecfab:lib/force-team.js \| sha256sum` | `8bcce19505cff1f5b03bafd5dfc0aeff91f61ab522884ac6b79508f58b5d5fbe` | 15358 |
| `tar -xzOf …tgz package/lib/force-team.js \| sha256sum` | 同上 | 15358 |
| `<clone>/node_modules/dsh-grok-workflow/lib/force-team.js` | 同上 | 15358 |

安装与版本读回：

```
$ DSH_HOME=$PWD/.tmp/soak-cut/dsh-home dsh plugin --profile web-clone add \
    file:$PWD/.tmp/soak-cut/dsh-grok-workflow-0.13.49.tgz          # ADD_EXIT=0
$ DSH_HOME=… dsh plugin --profile web-clone list                   # LIST_EXIT=0
  ├── dsh-grok-workflow@0.13.49
  17 packages
```

闸门确实不在装进去的那份里（在**装进去的**文件上量的，不是在工作树上量的）：

```
$ grep -c "started no team" <installed>/lib/force-team.js        → 0
$ grep -c "【强制：这一轮走团队模式】" <installed>/lib/force-team.js → 1
```

## 2. 装置与启动（`CONFIRMED`）

`rig/` 里 `capture.mjs` / `drive.mjs` / `inspect.mjs` 是**上一轮那三份的逐字节拷贝**（本轮直接跑原件，
装进本目录的拷贝与原件同哈希，见下表），另外两份 `*-scratch.mjs` 是本轮临时写的量取脚本，一起留档以便复算。

| 文件 | sha256 | 用途 |
| --- | --- | --- |
| `rig/capture.mjs` | `6a355c88…a8d3b9` | 18190 → 18088 纯透传，落盘请求体，**不记请求头** |
| `rig/drive.mjs` | `fa0769ad…727e8c5` | 发一句 → 等页面稳定 → 截图 + `innerText` + 消息行 |
| `rig/inspect.mjs` | `8f4fc671…8d8e556` | 重开会话再看一眼页面 |
| `rig/analyze-scratch.mjs` | — | 解压会话 `jsonl.zstd` 并统计每会话：步数 / 工具 / `turn/end` / 拒绝行 |
| `rig/measure-scratch.mjs` | — | 用**装进去的** `lib/force-team.js` 导出的常量量注入字节 |

启动行（与上一轮实测校正过的形态一致）：

```
$ PORT=18190 UPSTREAM_PORT=18088 OUT=$PWD/.tmp/soak-cut/capture \
    node .rsi/evidence/force-team-soak-2026-11-26/rig/capture.mjs
$ DSH_HOME=$PWD/.tmp/soak-cut/dsh-home dsh --profile web-clone \
    --port 3392 --host 127.0.0.1 --no-open >> .tmp/soak-cut/boot.log 2>&1
  boot.log: `dsh web: http://127.0.0.1:3392/?token=<已脱敏>`（第 134 行）
  干净启动：`grep -c 'pending (waiting' boot.log` = 0；裸 `GET /` 回 401
```

克隆里只改了三处（`cordis.patch.yml` 635 → 632 行，与上一轮准备阶段同法）：
去掉本 build 已移除的 `mode: triage`；`grok-workflow` 五个角色 + `guardianModel` 从 `agent2api`
（本机无该 provider 的密钥）钉到 `bifrost-responses / opencode-go/muse-spark-1.3-contributor`；
`bifrost-responses` 的 `baseURL` 指向抓包代理 18190。
`grokDefault: on` 未改 → 关键词回合不需要先 `/grok on` 也会注入。
工作区指向 `.tmp/soak-cut/work`（里面放 `README.md` / `CHANGELOG.md` 的副本，取自 `git archive e7ecfab`，见下条备注）。

一处环境备注（`CONFIRMED`）：我开工时 HEAD 是 `e7ecfab`，跑到一半另一个施工者提交了
`0bc617f docs(README): the routing table stops promising a refusal`，仓库根的 `README.md` 因此变了内容
（`sha256` 与 `e7ecfab` 的那份不同）。我用的是 `git archive e7ecfab` 里的副本，两边的**行数完全相同**
（`wc -l`：`README.md` 397、`CHANGELOG.md` 4476，仓树与副本逐字相同），第一行也都是 `# Grok Workflow for DSH`，
所以 A 轮要数的两个数字不受影响。

## 3. 四轮 + 一轮额外（逐轮读数）

四轮提示词按派单原文、同一 profile、同一实例、按 A→B→C→D 顺序发送；每轮由 `drive.mjs` 点「新会话」，
所以**一轮一个会话**。判定数字全部来自会话 `jsonl`（`session-logs/`）与页面 `innerText`（`turns/`）。

| 轮 | 会话 | 步数 | 工具调用（按步） | `tool-workflow/*` | `turn/end` | 拒绝行 | 注入 | 页面上有答案 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **A1 服从** | `session-17dd9961-97d2-4c20-805c-cbfe666a3812` | **5** | 1.1 `grok_open_block`（`mode-off` 失败）· 1.2 `todo_write` · 1.3 `working_directory`+`glob` · 1.4 `todo_write` | 0 | `completed` | 0 | 有 | 有（拆活方案，**无数字**） |
| **A2 服从（补跑一次）** | `session-b6a3f106-ea97-470d-8f68-a1c7df00f889` | **2** | 1.1 `grok_open_block`（**成功**：`preview_id bp-6bd71c12-…`、`split_hash 733f0e33…`） | 0 | `completed` | 0 | 有 | 有（拆活方案，**无数字**） |
| **B 忽略** | `session-7f7117f5-4d38-40b7-b510-f94dc7d6dfdc` | **2** | 1.1 `grok_open_block`（`mode-off` 失败） | 0 | `completed` | 0 | 有 | 有（三段任务拆解，**没有「2」**） |
| **C 旧死法** | `session-9df264e6-6d99-47e0-a6c7-484aacfcc2ff` | **2** | 1.1 `grok_open_block`（`mode-off` 失败） | 0 | **`completed`（不是 `blocked`）** | 0 | 有 | 有（拆活方案，**没读文件**） |
| **D 对照** | `session-87e22b2e-4538-4384-812e-badca52b0941` | **10** | 1.1–1.9 共 10 次 `read` | 0 | `completed` | 0 | **无** | 有（**两行原文都对**） |
| E 额外（不在派单四轮内） | `session-6e6bb1ac-6626-4b18-8a2f-ebb3b9d20225` | **2** | 1.1 `grok_open_block`（**成功**：`preview_id bp-a7edd454-…`） | 0 | `completed` | 0 | 有 | 有（拆活方案，**无数字**） |
| （空会话） | `session-f7d570ea-4515-40a3-a75b-55a141b82269` | 0 | — | 0 | 无 | 0 | 无 | 装置点「新会话」留下的空壳，未使用 |

### 3.1 A 服从轮：团队工具调了，团队没跑（`FALSIFIED`，部分）

- **A1**（派单原文那一轮，没有先 `/grok on`）：第 1 步就调 `grok_open_block`，四种块全带上 `acceptance`，
  结果 `Error: mode-off: 这个会话的 grok 模式没打开，接单台不接单。`——因为块闸门要求**会话自己**的
  grok 记录（`BLOCK_ADMISSION_ENFORCED`），部署默认 `on` 不算（上一轮 `F4` 的口径分歧仍在，与本轮改动无关）。
  之后它改用 `todo_write` / `working_directory` / `glob` 继续，**第 5 步**收尾，`completed`。
- **A2**（先发 `/grok on` 再发同一句，同一个装置、新会话）：第 1 步 `grok_open_block` **成功**，
  返回接单预览（`preview_id` / `split_hash` / `render` 齐全），第 2 步就收尾，`completed`。
  **没有任何块被认领**（无 `grok_claim_block`），所以 `tool-workflow/*` 仍为 0。
- 两次的答案都是「拆成 2 个任务 + 等你说开始」，**两个数字一次都没给出**；
  用 `wc -l` 量的真值：`README.md` = **397** 行、`CHANGELOG.md` = **4476** 行（两份副本与仓库文件行数相同）。
- 按派单允许的「每轮最多补一次」，A 只补了这一次，没有继续循环。

### 3.2 B 忽略轮：不拒、有答案，但不是「一句话答 2」

提示词原文 `开团：1+1 等于几？`（11 字符 / 25 字节）。模型第 1 步也调了 `grok_open_block`（`mode-off` 失败），
第 2 步给出**三段任务拆解**（十进制验算 / 多进制交叉 / 语义边界），末尾「确认一下：按这个拆活开干吗？」。
回合 `completed`、**0 条拒绝行**、页面显示「已完成，用时 31秒」。
即：**「忽略」这一侧的底线成立（不拒、有答案、不阻塞），但答案不是「2」**。

### 3.3 C 旧死法：同形状，现在跑完（`CONFIRMED`）

提示词原文 `开团：先读一下 README.md 的第一行，再读一下 CHANGELOG.md 的最后一行，然后直接告诉我这两行分别是什么。`
第 1 步 `grok_open_block`（`mode-off`），**第 2 步是非团队步**——这正是旧 build 上被 `reject` 的位置
（上一轮 `soak.md` §4 记录的现场）。本轮：2 步、`completed`、答案文本完整（拆活方案 + 「你说一声继续」），
**`turn/end` 不是 `blocked`**。

比 C 更强的同形状现场是 **A1**：关键词回合走到第 5 步，第 2、3、4 步全是非团队工具
（`todo_write`、`working_directory`、`glob`），旧 build 若在，第 2 步就会被拒；本轮 5 步走完、`completed`、有答案。
**「旧的死法」在最容易被触发的形状上都没再出现。**

### 3.4 D 对照：不注入，行为与关键词轮明显不同

同一句去掉 `开团：`（60 字符 / 130 字节，`drive.mjs` 自报 `sent, 60 chars`）：**不注入**（请求体里块出现 0 次，页面 0 次）。
模型**不拆活**，直接 `read` 了 10 步，给出两行原文，且**都对**：

```
README.md 第一行：# Grok Workflow for DSH
CHANGELOG.md 最后一行：   / 进度页设计文档改成六段脊椎（永远空的"回答"格已删除），并另加一节说明…
（模型自己在答案里标了 [CHANGELOG.md](CHANGELOG.md#L4476)，与 wc -l 的 4476 一致）
```

**C 与 D 的差别（只报读数，不作评价）**：D 10 步做完并给出两行；C 2 步停住，一行没读。

### 3.5 E（额外一轮，不在派单四轮内）

为了让「服从路径」有一个模型真的照做的样本，补发了一句**点名工具**的关键词提示词
（`开团：直接用 grok_workflow 工具跑这个活——objective 是统计 README.md 有多少行、CHANGELOG.md 有多少行…`），
同样先 `/grok on`。结果与 A2 同形：第 1 步 `grok_open_block` 成功（`bp-a7edd454-…`），第 2 步拆活收尾等确认，
`grok_workflow` **仍未调用**。读数事实：本轮 5 个带注入的回合（A1/A2/B/C/E）全部「先拆活、再停下等确认」，
唯一不带注入的 D 轮没有拆活、直接把活做完——6 次观察里这个差别与注入同进同出，本轮不做因果判断。

## 4. 注入测量（`CONFIRMED`）

量法：`node rig/measure-scratch.mjs capture <installed>/lib/force-team.js`。
基准常量是**装进去的** `lib/force-team.js` 导出的 `TEAM_INSTRUCTION_ZH`（不是手抄），**480 字节**。
取每个回合第一条带该提示词的模型请求体（`capture/req-NNN.json`）：

| 轮 | 请求体 | 模型侧整段 | 用户原话 | 追加 | 余下部分 == `TEAM_INSTRUCTION_ZH` |
| --- | --- | --- | --- | --- | --- |
| A | `req-001.json`（135249 B） | 567 B | 87 B | **480 B** | **true** |
| B | `req-010.json`（135187 B） | 505 B | 25 B | **480 B** | **true** |
| C | `req-013.json`（135301 B） | 619 B | 139 B | **480 B** | **true** |
| D | `req-016.json`（134807 B） | 130 B | 130 B | **0 B** | 无块（对照，正确） |
| E | `req-027.json`（135328 B） | 646 B | 166 B | **480 B** | **true** |

- **用户原话是字节相同前缀**：脚本用 `startsWith` 判定，5 轮全 true；
- 余下部分与中文块**字节全等**，英文块 `TEAM_INSTRUCTION_EN` 在任何一轮都没出现（`remainderEqualsEn` 全 false）；
- 请求体里它和第二块系统提醒并列在 `input[1]` 的同一个 `input_text` 里（`contentBlocks=5`），
  也就是**模型读到的就是「用户原话 + 480 字节指令」**，没有别的改写；
- 29 次请求里 **18 次带块、11 次不带**：不带的是 D 的 10 次正文请求 + D 的标题请求（对照轮，正确）；
  另外 5 次标题请求（A1/A2/B/C/E 各一次）也带块——标题提示词直接引用首条消息原文，
  所以块也进了标题请求；这 6 次标题请求**全部 400**，页面上那个标题不是模型写的，是首条消息文本的截断回落。

## 5. 页面读数（`CONFIRMED`，只记事实）

| 读数 | 结果 |
| --- | --- |
| 块在用户气泡里 | 关键词 5 轮各 **1 次**；对照轮 **0 次**（`grep -c '【强制：这一轮走团队模式】'`） |
| 重开会话后还在不在 | 在：`turns/cutB-reopened.txt` 仍 **1 次**（`inspect.mjs` 自己报 `block=true refusal=false`） |
| 旧拒绝文案 | 7 个页面文件里 `这一轮要的是团队` **0 次** |
| 侧边栏标题 | B 那轮是 **`开团：1+1 等于几？ 【强制：`**——块的开头进了会话标题；A1/A2 是 `开团：统计 README.md 有多少行`（在块之前截断） |
| 标题为什么这样 | 6 次标题请求（每次新会话一次，约 1.0–1.5 KB 的小请求）**全部 400**（`capture/index.txt` 里 seq 002/008/011/014/017/028），模型没给出标题，页面用的是首条消息文本按侧边栏宽度截断的结果；实测两种形态：短提示词那轮 **16 字**就已进到块里（`开团：1+1 等于几？ 【强制：`，这是侧边栏项；打开该会话时页头给的是完整的 `开团：1+1 等于几？【强制：这一轮走团队模式】` 24 字），长的两轮 **20 字**、在块之前就断（`开团：统计 README.md 有多少行`） |
| 答案可见 | 6 个有回合的会话，页面都渲染出助手答案（截图见 `turns/*.png`）；D 的两行原文在页面上逐字可见 |

## 6. 拒绝行与 `turn/end` 全量计数（`CONFIRMED`）

```
# 解压后的 7 个 jsonl（session-logs/）逐字 grep
$ grep -o 'grok-workflow-force-team' session-logs/*.jsonl | wc -l            → 0
$ grep -o '"reason": *{[^}]*}' session-logs/*.jsonl | grep -c blocked        → 0
# 原始压缩档再验一次（zstd -dc | grep -c）→ 7 个文件全部 0
```

- `source.kind == 'grok-workflow-force-team'` 的行：**0**（`analyze-scratch.mjs` 逐会话 `forceTeamRows` 也全 0）；
- `turn/end` 的 reason：`completed` × 6（第 7 个是空会话，无 `turn/end`）；
- 每个会话的 `user/message` 行的 `source.kind` 只有 `user` / `agent-instructions` / `runtime-context` /
  `skill-catalog` / `time-context`，**没有插件写的拒绝行**。

## 7. 红线（开工前 / 收工后各一次）

```
开工前 2026-11-26 12:37
  /home/fish/.dsh                 2026-11-25 23:14:14.025606767 +0800
  /home/fish/.dsh/profiles        2026-11-22 16:59:46.687805286 +0800
  /home/fish/.dsh/profiles/web    2026-11-26 11:22:40.166632045 +0800
  curl 127.0.0.1:3080/ → 401
收工后 2026-11-26 12:57（停实例、关代理、删 scratch 之后）
  /home/fish/.dsh                 2026-11-25 23:14:14.025606767 +0800   ← 与开工前逐字相同
  /home/fish/.dsh/profiles        2026-11-22 16:59:46.687805286 +0800   ← 同上
  /home/fish/.dsh/profiles/web    2026-11-26 11:22:40.166632045 +0800   ← 同上
  /home/fish/.dsh/profiles/web/cordis.patch.yml  2026-11-26 08:40:55.161514610 +0800
  curl 127.0.0.1:3080/ → 401
  写探测：`touch ~/.dsh/.probe-write` → "~/.dsh not writable"
```

未写 `~/.dsh`、未读密钥值、未碰 / 未重启 3080、未改核心 DSH、未改仓库里任何被跟踪的源码/测试/文档、
未 push / 未打 tag / 未 bump 版本。抓包只落请求体，请求头（带凭据）既不落盘也不打印；
`boot.log` 含实例 token，只存在于 `.tmp/` 且权限 0600，**没有**进本目录。

## 8. `NOT_RUN`

- `NOT_RUN` — 全量 `npm run ci`：`AGENTS.md` §12 规定块内不跑，且本轮只做真机取证、未改任何源码。
- `NOT_RUN` — 在 A2/E 的会话里回一句「确认」把团队真跑起来：`drive.mjs` 每轮都点「新会话」，
  续轮不在这个装置的能力内；要续轮需要另写脚本，本轮未做（因此「开团 → 真团队 → 给出数字」这条链**没有被证到**）。
- `NOT_RUN` — 其余轮次的重开复核：`inspect.mjs` 只重开了 B 那一轮（一次即可回答「重开还看不看得见」）。
- `NOT_RUN` — 标题 400 的上游原因：抓包只记状态码不记响应体，未取上游错误正文。

## 9. 证据清单（本目录）

| 路径 | 内容 |
| --- | --- |
| `capture/index.txt` | 29 次模型请求：序号、时间、路径、模型、字节、状态（23×200、6×400 标题请求） |
| `capture/injection-measurements.json` | 上面的注入字节测量（机器产出） |
| `capture/req-001.json` … `req-027.json` | 五轮各一条原始请求体（A/B/C/E 带块，D 为对照不带块） |
| `session-logs/*.jsonl` | 7 个会话解压后的完整事件流 |
| `session-logs/summaries/*.summary.json` | 每会话的机器摘要（步数 / 工具 / `turn/end` / 拒绝行） |
| `turns/cutA-obey.*` | A1：页面逐字 + 消息行 + 截图 |
| `turns/cutA2-obey-grokon.*` | A2（`/grok on` 后重发） |
| `turns/cutB-ignore.*` / `turns/cutB-reopened.*` | B，以及重开会话后的页面 |
| `turns/cutC-olddeath.*` | C（旧死法） |
| `turns/cutD-control.*` | D（对照，无注入） |
| `turns/cutE-extra-team.*` | E（额外一轮） |
| `rig/*.mjs` | 三个装置脚本的逐字节拷贝 + 两个量取脚本 |

清理（`CONFIRMED`）：跑完停掉 3392 与 18190（`ss -ltn` 两个端口均已释放、无残留进程），删除 `.tmp/soak-cut/`（**266M**，删除前用 `realpath` 核过绝对路径），只留本目录（61 个文件 / 4.6M）。
---

# 补记 F（后追加，上面的第一轮读数一字未改）— 2026-11-26 13:0x

派单追加：用一句「确认」把 A2 那一轮（模型已 obey、`grok_open_block` 成功返回 `preview_id bp-6bd71c12-…`）
送进真 run。**只试一次。**

## F.1 最小重建（scratch 上一轮已删，按同一配方重来）

- `git archive --format=tar e7ecfab` → 解出 → `npm pack`（缓存指在工作区内）：
  `dsh-grok-workflow-0.13.49.tgz` **1009997 B**，sha256
  **`5d95ee7ed9575a02e7b752250ad445bdc53f6a3f554bccac837ceeb566f5e7f7`** ——与第一轮**逐字相同**；
  tgz 内 `package/lib/force-team.js` sha256 **`8bcce19505cff1f5b03bafd5dfc0aeff91f61ab522884ac6b79508f58b5d5fbe`**（15358 B），也相同。
- 克隆 live profile：`files 7745 -> 7745 (88611936 bytes)`，与第一轮同读数；三处配置改动同样（`cordis.patch.yml` 635 → 632 行、
  `mode: triage` 0 条、`provider: agent2api` 3 条、`bifrost-responses` baseURL → 18190）。
- 安装与读回：`dsh plugin --profile web-clone add file:<tgz>` → `dsh-grok-workflow@0.13.49`（17 packages）；
  装进去的 `lib/force-team.js` = `8bcce195…`（15358 B），`grep -c "started no team"` = **0**（闸门仍不在）。
- 会话恢复：把第一轮存下的 A2 会话 JSONL **重新压成** `session.v4.jsonl.zstd` 放回同一路径
  （`dsh-home/sessions/--home-…-work--/session-b6a3f106-…/`），`storages/workspace.json` 里把它的 id 写进 `sessionIds`。
  压缩往返校验：解压后 sha256 = `a602e74d1df358cf0ff96116a4a09ccd48f3beb554723ad4a0c113c274da0d03`，
  与 `session-logs/…b6a3f106….jsonl` **逐字相同**。

## F.2 结果：重开已存会话这条路线不成立（`CONFIRMED`）

- 启动干净：`dsh web: http://127.0.0.1:3392/?token=<已脱敏>`、`grep -c 'pending (waiting'` = **0**、裸 `GET /` = **401**。
- 页面加载后**侧边栏里没有那个会话**，工作区是空落地页（`turns/followF-confirm-workspace.txt`、`…-before.txt`）。
  脚本按 `inspect.mjs` 的路线点了 composer，于是「确认」落进了一个**新建会话**
  `session-a7d42f5d-3a2a-4af0-b325-aa8b0c7bf8f4`。
- 机制读数：实例在 `2026-11-26T04:57:06.928Z` 把 `storages/workspace.json` 改写成
  `sessionIds: ["session-a7d42f5d-…"]`——恢复进去的 `session-b6a3f106-…` 被丢掉；磁盘上的压缩档仍在、
  且**没有被改动**（解压 sha256 仍是 `a602e74d…`）。即：会话列表由运行时自己的登记表决定，
  光把压缩档放回去不足以让它出现在侧边栏。
- 按派单「只试一次」，到此停止，没有第二次尝试。

## F.3 这一轮实际跑出来的东西（记录，不冒充 A2 的确认）

| 读数 | 值 |
| --- | --- |
| 会话 | `session-a7d42f5d-3a2a-4af0-b325-aa8b0c7bf8f4`（新建，上下文只有「确认」两个字） |
| 步数 | **2**（1.1 / 1.2） |
| 工具调用 | 1.1 `list_agents` + `get_goal` + `working_directory`；1.2 `ask_user_question` |
| `tool-workflow/*` | **0**（`run-start` / `run-end` / `agent-start` / `agent-end` 都是 0） |
| 块有没有被认领 | 没有（`grok_claim_block` / `grok_open_block` 都没调） |
| `turn/end` | **没有这一行**：回合停在等用户回答（`ask_user_question`），页面「深度求索中，用时 19分59秒」 |
| `grok-workflow-force-team` 行 | **0** |
| 注入 | 无（「确认」不含关键词；两次正文请求 req-001 / req-003 里块出现 **0** 次） |
| 请求 | 3 次：seq-001（134683 B → 200）、seq-002（887 B 标题 → 400）、seq-003（141733 B → 200） |
| 页面上看到的 | 用户气泡「确认」；助手「收到——我先看一下当前的状态，再请你确认具体事项。」+ 提问卡「您刚才说了“确认”，请问您想确认的是哪一件事呢？」（`turns/followF-confirm.txt` / `.png`） |
| 页面消息行 | `turns/followF-confirm-transcript.json` 是空数组 `[]`：等待态的页面没有 `[data-message-role]` 一类节点可抓，页证据以 `innerText` 为准 |

## F.4 判定

- **`NOT_RUN`** —— 「一句『确认』把 A2 的拆活送进真 run」这一条**没有被证到**。
  原因是重新打开已存会话的路线在隔离 profile 上不成立（运行时改写登记表、丢掉恢复进去的会话 id），
  一次尝试已用完。**没有伪造，也没有拿新会话里那句反问冒充确认的答案。**
- 顺带一条同向读数：这个新会话回合**同样没有被拒**（0 条 `grok-workflow-force-team` 行、没有 `blocked`），与第一轮一致。

## F.5 补记的红线与清理

```
追加轮开工前 2026-11-26 12:55
  /home/fish/.dsh                 2026-11-25 23:14:14.025606767 +0800
  /home/fish/.dsh/profiles        2026-11-22 16:59:46.687805286 +0800
  /home/fish/.dsh/profiles/web    2026-11-26 11:22:40.166632045 +0800
  curl 127.0.0.1:3080/ → 401        ss: 3392 / 18190 均无监听
追加轮收工后 2026-11-26 13:19（停实例、关代理、删 scratch 之后）
  /home/fish/.dsh                 2026-11-25 23:14:14.025606767 +0800   ← 与开工前逐字相同
  /home/fish/.dsh/profiles        2026-11-22 16:59:46.687805286 +0800   ← 同上
  /home/fish/.dsh/profiles/web    2026-11-26 11:22:40.166632045 +0800   ← 同上
  /home/fish/.dsh/profiles/web/cordis.patch.yml  2026-11-26 08:40:55.161514610 +0800
  curl 127.0.0.1:3080/ → 401
  3392 / 18190：`ss -ltn` 均无监听，无残留进程
```

追加轮的 scratch 已删（**256M**，删前 `realpath` 核过绝对路径）；证据目录现在 **73 个文件 / 5.2M**。
扫过一遍：没有 token 值、没有 api key 值；实例 token 仍只出现在 `.tmp/` 的 `boot.log`（0600，已随 scratch 删除）。

追加的证据文件：`turns/followF-confirm.*`（页面 + 截图 + 前后快照）、
`session-logs/…__session-a7d42f5d-….jsonl`（+ `summaries/`）、`capture/follow-up/{index.txt,req-001.json,req-003.json}`、
`rig/confirm-scratch.mjs`（本轮用的「重开并续发」脚本，从 `inspect.mjs` 的打开路线 + `drive.mjs` 的等待循环改出来的）。

---

# 补记 G（最后一轮，后追加；上面所有读数一字未改）— 2026-11-26 13:20

派单要求：**一个页面、一个 profile、一个实例、同一个会话**里做四步——
① `/grok on` → ② 关键词提示词 → ③ 等它给出确认时机后发 `确认` → ④ 等 run 落定（≤15 分钟），
中途不重启、不搬档案。**只试一次。**

## G.1 做法

脚本 `rig/confirm2-scratch.mjs`（从 `rig/drive.mjs` 抄的登录/打开/等待循环，差别只有一处：
第一句之后**不再点「新会话」**，四步都落在第一句创建的那个会话里）。
真机读数：`/grok on` 4 秒落定 → 关键词提示词 22 秒落定「已完成，用时 22秒」→ 发 `确认` → 等待环节在 **160 秒**后稳定，
页面显示「已完成，用时 2分29秒」。同一实例 3392、同一抓包代理 18190，全程没有重启。

## G.2 这一轮的读数（`CONFIRMED`）

主会话 **`session-518372ad-665d-4abf-b025-c891fc46adf1`**：**2 个回合 / 15 步 / 14 次工具调用**。

| 回合 | 步 | 工具 | 结果 |
| --- | --- | --- | --- |
| 1（关键词提示词） | 1.1 | `grok_open_block`（`mode: preview`） | **接单预览**：`preview_id bp-062389ed-2897-43a8-8eb5-60c045325303`、`split_hash 3f4ca240…`、`render` 两块 |
| 1 | 1.2 | 无 | 助手把两块拆法写在答案里，末尾「回复确认我就进第二步」 |
| 2（`确认`） | 2.1 | `grok_open_block`（`mode: "start"`、`approval {kind:user, quote:"确认"}`） | **块被认领**：`block_id 456899bb-5509-4c1e-a18d-b32c1e1864b1`、`status open`、`dispatch_envelope「派单 2 块…」` |
| 2 | 2.2 | `grok_block_status` | 块内两块都在 `open` |
| 2 | 2.3 / 2.4 | `grok_accept_block` ×2 | `plan-30d80f25`（README）/ `plan-1840af41`（CHANGELOG） |
| 2 | 2.5 | `subagent` ×2 | `started subagent agent-1`（统计README行数）、`agent-2`（统计CHANGELOG行数） |
| 2 | 2.6 | `wait_agent` | `{"timedOut":false}` |
| 2 | 2.7 | `list_agents` | `agent-1 [inactive]`、`agent-2 [inactive]` |
| 2 | 2.8 | `grok_block_status` | 两块进度刷新 |
| 2 | 2.9 → 2.12 | `grok_close_block` ×4 | README 两次 **`veto`**（监工指出验收 3 没证据）后 **`pass`**；CHANGELOG 一次 **`pass`** |
| 2 | 2.13 | 无 | 汇总答案（第三步验收逐条对照） |

**子会话 5 个**（页面页头写「5 个子智能体」）：`53d0176b` / `92d42514`（`glob` + `bash`，真去数行）、
`5462b4e3` / `b87dd7bb` / `de4667e1`（`structured_output`，验收/监工），每个各 1 个回合。

| 派单要的计数 | 读数 |
| --- | --- |
| 块是否被认领 | **是**：`grok_open_block mode:start` + `approval quote:"确认"` → `block_id 456899bb-…` |
| 子代理是否真派出 | **是**：`subagent` ×2（`started subagent agent-1/agent-2`），另有 3 个验收子会话 |
| `tool-workflow/*` 计数 | **0**（`run-start` **0**、`run-end` **0**、`agent-start` **0**、`agent-end` **0**）——团队走的是**块 + 子代理**这条路，不是 workflow 引擎那条路；这与第一轮 `soak.md` §5.1 的旧读数一致 |
| `turn/end`（主会话） | 回合 1 `completed`、回合 2 `completed`；**没有 `blocked`** |
| `turn/end`（5 个子会话） | 各 1 条 `completed`；**没有 `blocked`** |
| `grok-workflow-force-team` 行 | 本轮 6 个会话全 **0**；连同上两轮，**14 个会话合计 0** |
| 重启 / 搬档案 | 没有（同一实例、同一页面、同一会话） |

**答案与真值**：页面最后的答案逐条给了

```
任务 1：数 README.md——通过    验收 1 要整数行数：给了 397 … 
任务 2：数 CHANGELOG.md——通过  验收 1 要整数行数：给了 4476 …
结论：README.md：397 行 / CHANGELOG.md：4476 行 / 没挂的任务：没有，两个全过
```

真值 `wc -l README.md` = **397**、`wc -l CHANGELOG.md` = **4476** —— 两个数字都对（子代理是在仓库路径上跑的
`wc -l`，读数与工作区副本一致）。页面页脚：`2 轮 15 步`。

**注入测量**（关键词那一轮，`capture/final-round/req-001.json`）：模型侧整段 **567 B**
= 用户原话 **87 B**（字节相同前缀）+ **480 B**，余下部分与装进去那份的 `TEAM_INSTRUCTION_ZH` **字节全等**，
英文块 `remainderEqualsEn=false`。本轮共 25 次请求：24 × 200、1 × 400（标题请求，情况同前几轮）。

## G.3 判定

**`CONFIRMED` —— 服从路径走通到真团队。** 一句「确认」之后：块被认领（`block_id` 在手）、
两块被接单（两个 `plan_id`）、两个子代理并行派出并真的跑完、监工验收（含一次 `veto` 打回重做）通过、最后汇总出答案，
两个数字与 `wc -l` 一致；全程 **0 条拒绝行、没有任何 `blocked`**、没有重启也没有搬档案。
这也补上了补记 F 那条 `NOT_RUN` 的缺口——**确认必须发生在同一个活着的会话里**，而不是搬档案复活会话。

## G.4 本轮的身份复核、红线与清理

```
身份（重建后逐字相同）
  tarball dsh-grok-workflow-0.13.49.tgz  1009997 B
          sha256 5d95ee7ed9575a02e7b752250ad445bdc53f6a3f554bccac837ceeb566f5e7f7
  tgz 内 lib/force-team.js  8bcce19505cff1f5b03bafd5dfc0aeff91f61ab522884ac6b79508f58b5d5fbe  15358 B
  装进 web-clone 后        同上；dsh plugin list → dsh-grok-workflow@0.13.49（17 packages）
  grep -c "started no team" = 0

红线（开工前 / 收工后）
  /home/fish/.dsh                 2026-11-25 23:14:14.025606767 +0800   两侧逐字相同
  /home/fish/.dsh/profiles        2026-11-22 16:59:46.687805286 +0800   同上
  /home/fish/.dsh/profiles/web    2026-11-26 11:22:40.166632045 +0800   同上
  curl 127.0.0.1:3080/ → 401（两次，收工后 13:27 复测）

清理（`CONFIRMED`）：3392 与 18190 已停（`ss -ltn` 无监听、无残留进程）；scratch 已删
（**262M**，删前 `realpath` 核过绝对路径）；证据目录 **97 个文件 / 7.0M**
（补记 F 时是 73 / 5.2M）；扫过：无 token 值、无 api key 值。
```

本轮证据：`turns/finalG.*`（最终页面 + 截图 + 前两步快照 + console）、
`session-logs/…__session-518372ad-*.jsonl` 与 5 个子会话的 jsonl（+ `summaries/`）、
`capture/final-round/{index.txt,req-001.json,injection-measurements.json}`、`rig/confirm2-scratch.mjs`。
