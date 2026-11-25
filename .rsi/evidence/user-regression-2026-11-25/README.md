# 用户视角回归（隔离 fork 的 live web 档案，真模型）— 2026-11-25

结论先说：**六项里五项能用，两项红。** 开关、真任务、跑中插话、预览→开工、监工判决都真跑通了；
卡片点头也通了，但**只有在把宿主的提问工具改成 timed 模式之后**才通。红的两条是：
① `/grok on` 的确认话还在承诺一件 0.13.36 已经不做的事；② 同一个会话里，底部开关说「开」，
接单台的工具却拒成「grok 模式没打开」。第一条已另开分支修（见 §7），第二条是产品决定，本轮只报。

被测对象是**已发布的 `v0.13.36` 固定标签**，不是工作树构建。跑的是一个从 live `web` 档案复制出来的
隔离 `DSH_HOME`，端口 3311，真模型 `bifrost-responses/opencode-go/muse-spark-1.3-contributor`。
`~/.dsh` 全程只读：写探针 `Read-only file system`，线上 3080 前后都是 401，live 仍装 `0.13.35`。

本轮**没有改产品代码**：`fix/user-regression` 只放证据与记忆。

---

## 1. 被测对象与构建身份

    分支        fix/user-regression（从 main 尖端 6e9bc56 开，worktree .agents/worktrees/fix/user-regression）
    被测版本    0.13.36（GitHub 发布标签 v0.13.36 解析出来的那棵树，不是本地构建）

安装（固定标签，不浮动）：

    $ DSH_HOME=<scratch> dsh plugin --profile web-clone add \
        'github:free6589/dsh-grok-workflow#v0.13.36' --save-exact
    Done in 10.5s using pnpm v12.4.2
    $ node -p "require('./<scratch>/profiles/web-clone/package.json').dependencies['dsh-grok-workflow']"
    github:free6589/dsh-grok-workflow#v0.13.36
    $ node -p "require('./<scratch>/profiles/web-clone/node_modules/dsh-grok-workflow/package.json').version"
    0.13.36
    pnpm-lock.yaml: version: https://codeload.github.com/free6589/dsh-grok-workflow/tar.gz/26dc370e270150ddb3facf8653677a645038f87a

`26dc370` 就是 `main` 上那条 `chore(release): prepare v0.13.36`（发版提交）。也就是说：装上去的是那个标签的树，
不是「今天解析到什么算什么」。

## 2. 隔离怎么做的

    DSH_HOME   <worktree>/.tmp/user-regression/dsh-home
    profile    web-clone（scripts/clone-profile.mjs 从 ~/.dsh/profiles/web 克隆）
    端口       127.0.0.1:3311（live 在 3080/3065/3086/3109，全程未被访问过一次）

    $ node scripts/clone-profile.mjs --src ~/.dsh/profiles/web \
        --home .tmp/user-regression/dsh-home --name web-clone --force
    clone-profile: ok — …/profiles/web-clone
      files 7720 -> 7720 (88421847 bytes)
      links 5 (relinked 2, already dangling in the source 1)
      parity 5/5 equal after redaction
      dependencies 17 declared, 0 unresolved (8/21 bundles from the installation)
      credentials redacted: 1 line(s) in 1 file(s); vendored fixtures: 4 file(s)

被抹掉的那一行是 `cordis.patch.yml:379` 的 `openai-style-key`（生图渠道的串，本轮不需要）。两份路径凭据
（`BIFROST_VIRTUAL_KEY`、`AGENT2API_API_KEY`）都是 `apiKeyEnv` 形态，档案里没有字面密钥。

克隆档案上动了**四类**东西，全部是 soak 档案的配置，不是产品改动：

1. **删掉 `mode: triage` 那一行**（HANDOFF 要求：升级到 0.13.36 前必须删，否则那一行拒绝激活、工作流从界面消失）。
   克隆里本来就没有 `legacyGate:`，所以只删了一行：
   `grep -n "^\s*mode:\|legacyGate" <clone>/cordis.patch.yml` → 0 行。
2. **把五个角色和 guardianModel 钉到一个真能答的路由**：`bifrost-responses` /
   `opencode-go/muse-spark-1.3-contributor`。原因是这台机器的 shell **没有** `AGENT2API_API_KEY`
   （`AGENT2API_API_KEY: MISSING`），而 live 档案里 worker/verifier/supervisor/guardian 全指着 `agent2api`。
   不钉的话，本轮连一次子调用都起不来——那是环境事实，不是产品缺陷，所以被换掉并如实记录。
   路由可用性是先证后钉的：`POST /openai/v1/responses` → **200**（6.4s 出话）；顺手证了一条死路由，
   `tokenrhythm/glm-5.3-flash` → **403 IDENTITY_VERIFICATION_REQUIRED**（被丢掉，没写进档案）。
3. **把宿主提问工具改成 timed 模式**（`preset-standard` 整份 `plugins` 覆盖，只改 `tool-ask-user`
   一项：`config: {mode: timed, timeout: 20}`）。不这样改，卡片答案永远不会变成「用户消息」，
   这条路径测不到（上一轮 `card-approval-soak-2026-11-25` 的 F2 已经写清楚，本轮复核见 §3.4）。
4. 端口换成 3311。

激活读数（三项都对）：

- 启动输出**没有任何抱怨**：222 行日志里 `pending` / `did not activate` **0 行**，唯一一条产品行是
  `dsh web: http://127.0.0.1:3311/?token=<redacted>`。
- `POST /api/settings/describe` → **24 个命名空间**，`grok-workflow` 在；`value` **16 个字段**
  （`mode` 这个键已经不在里面了）；`blockIntake` 故意不投影（`blockIntake projected: false`）。
  钉住的路由读回来是对的：`supervisor: [{"provider":"bifrost-responses","model":"opencode-go/muse-spark-1.3-contributor"}]`。
- 真会话的 `request/header`：**96 个工具**，接单台六个全在
  （`grok_open_block`、`grok_accept_block`、`grok_close_block`、`grok_block_status`、`grok_steer`、`grok_stop`），
  证明 `blockIntake` 默认开（0.13.36 起默认 `true`，0.13.34 是 `false`）。

### live 到底碰没碰（说准一点）

    $ stat -c '%y %n' ~/.dsh ~/.dsh/profiles ~/.dsh/profiles/web
    2026-11-22 23:40:20  ~/.dsh                        ← 本轮前后同值
    2026-11-22 16:59:46  ~/.dsh/profiles               ← 本轮前后同值
    2026-11-25 12:09:52 → 2026-11-25 13:16:10  ~/.dsh/profiles/web   ← **目录** mtime 动了一次
    $ touch ~/.dsh/.user-regression-write-probe
    touch: cannot touch '…': Read-only file system
    $ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/   → 401（前后都是 401）
    $ node -p require('~/.dsh/profiles/web/node_modules/dsh-grok-workflow/package.json').version → 0.13.35

`~/.dsh/profiles/web` 这个**目录**的 mtime 在本轮中段动过一次，这一点照实写：但把里面的文件逐条按时间查了一遍
（`find ~/.dsh/profiles/web -newermt '-90 minutes' -not -path '*/node_modules/*'`），**没有一个文件的内容晚于 12:09:50**
（`package.json` 12:09:50、`pnpm-lock.yaml` 12:09:33、`.plugin-manager/logs` 12:09:24）。也就是说目录条目出现过又没了，
不是内容被改。谁造成的**没有查到底**（`HYPOTHESIS`：能写那个目录的进程——运行中的 live 实例或别的会话——的临时件；
本次 soak 的每一步都在 `DSH_HOME=<scratch>` 下，且本进程对 live 只有读权限）。live 的依赖仍是浮动
`github:free6589/dsh-grok-workflow`、锁解析到 `84efda0`（= 0.13.35 那棵树），没有被动过。

## 3. 六项逐一

### 3.1 开关 — 通（`CONFIRMED`）

走的是按钮自己用的那条路由和 `/grok` 命令处理器（`commands/execute`），同一个会话里读回来：

    fresh            GET /grok-workflow/mode?action=status
                     → {"enabled":true,"source":"default","setBy":null,"fallback":true}
    /grok off        → {"kind":"success","text":"Grok workflow OFF — normal chat."}
    after /grok off  → {"enabled":false,"source":"record","setBy":"command:/grok off",...}
    /grok on         → {"kind":"success","text":"Grok workflow ON — every message now runs the full plan→execute→verify workflow."}
    after /grok on   → {"enabled":true,"source":"record","setBy":"command:/grok","workflowMode":"full",...}
    /grok status     → "Grok workflow status:\n- Toggle: on\n- Last run: none recorded in this session"

一个普通人能看懂的部分：开关的文案是「工作流开关 / 开 / 关」（`mode.switch.*`），点下去或打一条命令，
状态就落在会话自己的记录里（`plugin:grok-workflow/mode`），刷新页面也还在。按钮侧的 `POST` 写与
`GET` 读用的是同一份记录，所以「记录说开、按钮说关」这种分裂在代码上不存在。

**这一项没覆盖到的**：真正用鼠标点那颗按钮（`NOT_RUN`）。fork 的 web 界面进去落在「生图」面板，
侧边栏的会话树在这个隔离 home 里是空的（我用接口建的会话不进 UI 的分组），headless 浏览器里没把聊天面板点出来。
所以按钮的**渲染与点击**本轮没有像素证据；`+0.5 秒自己刷新`那条是 2026-11-25 那一轮真 Chrome 验过的，
不是本轮读数。写在这里，不当成本轮成果。

### 3.2 真任务 — 通（`CONFIRMED`），但工作流引擎没被叫起来

    prompt  帮我看一下这个仓库的本地测试是怎么跑的：给我三条最关键的要求，每条都注明出自哪份文档的哪一节。
    结果    turn 1 用了 4 步：working_directory → glob docs/**/*.md → 三次 read → 出答案（带文档与节名）
            工具调用 8 次，全部真实落盘读取；模型自己组织答案，没有模板腔。

同一轮里另起一个会话，直接把活交给引擎（这一条是本轮唯一一次真跑工作流引擎）：

    会话 session-706442e2…（`/grok on` 之后）
    prompt  请用 grok_workflow 工具把这件事真跑一遍：统计 src/ 目录下每个 .ts 文件的行数，
            给我行数最多的前五名（文件名+行数）。要真读文件，不要猜。

（读数见 §3.7。）

### 3.3 跑中插话 — 通（`CONFIRMED`，同一轮里真的插进去了）

第一个会话的 turn 1 跑了 145 个事件；第 **24** 个事件就是插话被接住的位置——**turn 还在跑**：

    6   turn/start          {"turn":1}
    24  agent/inbox/spliced {"target":"next-turn","inserted":[{"content":[{"type":"text",
                            "text":"顺便：最后再告诉我这两份文件里有没有互相矛盾的地方。"}],
                            "source":{"kind":"user","rpcId":"req-at12000-…"}}]}
    …   （turn 1 继续跑到 seq 145）
    145 turn/end            {"kind":"completed"}
    146 turn/start          {"turn":2}
    149 user/message        source={"kind":"user","rpcId":"req-at12000-…"}  ← 插话在这一轮被真的读进去

也就是说：人在它干活的时候插一句话，不会被丢掉、不会把正在干的那一轮搞坏、也不会被插件拦下来念模板——
它排队，等这一轮收尾，然后原话进下一轮。这就是「能不管它」那条要求的样子。

### 3.4 卡片点头 — 通，但**只在 timed 模式下**（`CONFIRMED` + 一条硬边界）

模型先出预览（`grok_open_block` 的 `preview`），再开一张问题卡片：

    seq 41  tool/call ask_user_question
            questions[0] = {id:"confirm_block", header:"接单预览",
                            question:"接单台把这一单切成了 1 块：【写三条验证要点】… 这个切分可以吗？",
                            options:[{"label":"确认（开工）"},{"label":"再看看（要改）"}]}, timeout:120
    seq 42  tool/result → {"pending":true,"callId":"call_01a2111859bc…","message":
            "No answer batch arrived before the timeout. This is pending, not a skipped answer. …"}
    （我以用户身份答）POST /api/userQuestions/answer {agentId, callId, answer:{answers:[{id:"confirm_block",
            selected:["确认（开工）"]}]}} → {"ok":true,"value":true}
    seq 52  user/message  source={"kind":"user-question-reply","callId":"call_01a2111859bc…","outcome":"answered"}
                          content= [{"text":"{\"kind\":\"answer_to_pending_question\",\"tool\":\"ask_user_question\",…"}]

**边界（必须写清楚）**：宿主的提问工具在档案里是 `legacy` 时（出厂默认），卡片答案只是**同一回合里的一个
工具结果**，永远不会变成 `user-question-reply` 的「用户消息」，所以它不可能被记成批准。本轮把
`tool-ask-user` 改成 `mode: timed, timeout: 20` 之后才有上面这条链。这不是本轮修出来的，是 0.13.34 修的
（D-137），本轮只是第一次在**已发布的 0.13.36** 上复核它确实还在。**一个普通人在默认配置下点卡片，
点不出一个「开工」来**——他会看到模型让他再打一句「确认」。这条属于宿主配置面的边界，记在这里，不算红。

### 3.5 预览→开工 — 通（`CONFIRMED`）

    seq 36  grok_open_block {"mode":"preview", blocks:[写三条验证要点 … writesPaths:[".tmp/user-regression/notes.md"]]}
    seq 37  → preview_id bp-211d7434-7ec2-40ef-9e3f-89c260c7954a，split_hash 3e9170ee…
    seq 54  grok_open_block {"mode":"start","preview_id":"bp-211d7434…","split_hash":"3e9170ee…",
                             "approval":{"kind":"user","quote":"确认（开工）"}}
    seq 55  → block_id 50761193-4885-4a19-b83c-5a3078139d4b
    seq 59  grok_accept_block → 接单成功
    seq 66  → started subagent agent-1（块里的活真的派出去了）
    落盘    notes.md 真的写出来了（三条要点，写明这是接单台的一次真机验证）
    账本    blocks.jsonl 两行（预览批准一版、接单一版），approval 原文：
            "approval":{"kind":"user","quote":"确认（开工）","at":"2026-11-25T05:09:46.752Z"}

「预览→点头→开工」这条链是完整的：预览不写盘，点头之后才落一行，派活也是点头之后的事。

### 3.6 监工判决 — 通，**这次是模型真的判的**（`CONFIRMED`）

    seq 83  grok_close_block handoff（四行写全：做了什么/证据/没做/下一步）
    seq 85  → {"block_id":"50761193…","outcome":"pass","judged":true,"warnings":[],"reasons":[]}
    verdicts.jsonl 一行：
            {"verdictId":"ae2c4668…","blockId":"50761193…","attempt":1,"kind":"supervisor",
             "by":"plugin:block-supervisor",
             "route":"bifrost-responses/opencode-go/muse-spark-1.3-contributor",
             "outcome":"pass","criteria":[三条，每条 met:true 且各带 1-2 条 evidence],"reasons":[]}

要点：`judged:true` 是这一轮最重要的一个字。上一轮（0.13.34 的隔离 soak）在这一步只能拿到
`judged:false` 和一条「监工调用失败」的 `veto`，因为隔离 home 里没有模型钥匙；**独立模型监工在真机上一次都没验过**
是那边挂着的缺口。本轮把监工钉到一条真能答的路由之后，**这个缺口补上了**：判决是模型给的，逐条验收项都带了证据，
路由名字也写进了判决行。

第二条证据（同一个铺面）：把同一块再交一次，`evidenceUnchanged` 生效——返回账上已有的那条判决、**不写第二行**，
`verdicts.jsonl` 仍然只有一行。

### 3.7 工作流引擎本身（`/grok on` 之后叫 `grok_workflow`）

见 §8「补跑」——这一条是在上面六项都记完之后补的，读数单独列，不和六项混。

## 4. 三个问题，直接回答

**普通人能用？** 能用，但有一下会卡住。开关是一条中文文案的按钮加一条 `/grok` 命令，预览和确认都是人话；
但**在默认配置下点卡片不算点头**（§3.4），而且**一个没有自己记录的新会话，开关显示「开」、接单台却拒单**
（见 §5 红二）。第一件让人多打一句「确认」；第二件会让人以为坏了。

**能不管它？** 能。插话不会打断正在干的那一轮；接单会把活派出去、写盘、落账本；交卷时六项确定性检查 + 独立监工
都给结论，人不点头也能往下走（本轮 `pass` 就是模型判的，不是我判的）。

**像人吗？** 大部分像：它先给预览再动手、说话短、失败时说下一步怎么办。两处不像人：`/grok on` 的确认话在
承诺一件已经不存在的流水线（红一）；命令的回复是英文，而界面和拒单话都是中文，中英混着来。

## 5. 红单

### 红一（已另开分支修）：`/grok on` 的确认话在承诺一件不存在的事（`CONFIRMED`）

`src/command.ts:325`：`'Grok workflow ON — every message now runs the full plan→execute→verify workflow.'`

0.13.36 里没有任何东西按这条记录把消息导进工作流。会话记录的读者只有三处：命令自己的 `/grok status` 文案、
开关的 HTTP 路由、以及 `src/user-source.ts` 的准入判断（接单台六个工具在入口处调它，关着就拒成
`mode-off`）。本轮真机读数也对得上：`/grok on` 之后发一条普通任务，模型是**直接干活**的，没有流水线、
没有派单消息。所以这句话是假的，而且它是那个按钮/命令唯一的反馈——用户会以为从此每条消息都进流水线。

修法：把 ON 的话改成真的（这个会话可以接单块了），红先绿后、带上 `[Unreleased]` 中英条目、`npm run ci` exit 0。
**另开分支 `fix/grok-command-text`，不混进本分支**（进程见 §7）。

### 红二（产品决定，本轮只报）：开关说「开」，接单台说「没打开」（`CONFIRMED`）

同一个会话、同一个时刻，两个面给出的答案相反：

    GET /grok-workflow/mode?action=status&sessionId=<同一个会话>
      → {"ok":true,"action":"status","mode":{"enabled":true,"source":"default","setBy":null,"fallback":true}}
    grok_open_block（同一会话，没打过 /grok）
      → Error: mode-off: 这个会话的 grok 模式没打开，接单台不接单。下一步：这个会话没有打开 grok 模式；
        先让用户打开模式，再调接单台的工具

开关的文案在 `enabled === true` 时就显示「开」，而 `enabled` 在没有记录时等于部署默认
（这台机器 `grokDefault: on`）。接单台这一侧却只认**会话自己的记录**（`canAcceptBlock` → 记录必须
`enabled === true`），部署默认不算数——代码注释说这是故意的（「部署级默认不是这个会话自己决定接活」）。

两边各自都讲得通，合起来就是一个普通人遇到的矛盾：**界面说开着，工具说关着。** 打一条 `/grok on` 就消失，
但没人会想到要打。两条可能的修法（本轮**没有**动，因为这是产品决定）：

- **甲**：让开关不要在没有记录时显示「开」（`source: default` 时显示「关」/「未开」），谁想接单就点一下；
  代价是 `grokDefault: on` 这个部署默认在界面上就没意义了。
- **乙**：让准入承认部署默认（没有记录时按 `grokDefault` 走），显式 `off` 仍然拒；代价是「每会话自选」这条
  产品意图被削弱，M3.2 那条决定要重开。

建议走甲：界面不说谎，且不动接单台的准入语义；但它要改设置页/开关的默认显示，属于用户可见变化，得有决定号。

## 6. 没跑的（如实列）

1. **真浏览器点那颗开关按钮**（`NOT_RUN`）：headless 浏览器进得去首页（0 console errors），但这个隔离 home 的
   会话树在 UI 里是空的（我用接口建的会话不进分组），没把聊天面板点出来；`+0.5 秒刷新`这条只有 2026-11-25
   那一轮的真 Chrome 读数，本轮没复现。
2. **默认（legacy）配置下点卡片的真机路径**（`NOT_RUN`）：按 F2 它不可能成为批准，本轮直接改用 timed 测批准那条；
   「点了之后模型让用户再打一句确认」这件事是从源码读出来的，不是本轮看到的。
3. **设置页面的渲染**（`NOT_RUN`）：本轮只用 `settings/describe` 的接口读数，没开页面看。
4. **升级动作本身**（`NOT_RUN`）：本轮是「在隔离档案上装固定标签」，没有在 live 档案上升级——那是操作者的手
   （HANDOFF 写着顺序：先删 `mode:`/`legacyGate:` 两行，再装 `v0.13.36`，再读回版本）。
5. **多块切分、会写多文件的块**（`NOT_RUN`）：本轮一单一块、只写一个文件。
6. **心跳/自迭代那条线**（`NOT_RUN`）：`loopEnabled: true` 是档案里带着的，本轮没有投递过心跳。

## 7. 红一已修，另开分支（`fix/grok-command-text`，未合流、未推送）

分支 `fix/grok-command-text`（worktree `.agents/worktrees/fix/command-text`，基线 `main` 尖端 `6e9bc56`），
两个提交：**`5c120b1`**「fix(command): say what `/grok on` really does」（9 文件 / +24 −15，含 `lib/command.js` 重建）与
**`78c9091`**（只加证据文件）。**不是本分支的提交**，本分支只留证据与记忆。

新话（用户 `/grok on` 之后看到的两句）：

    Grok workflow ON — the model may commission reviewed blocks of work in this session.
    Messages themselves are not turned into a workflow.

`/grok off` 的答案没动（`Grok workflow OFF — normal chat.`），记录形状、路由、接单台准入规则都没有改。

**验收（我自己复核过的，不是听它自报）**：

- 红先绿后：`test/command.spec.ts` 先 7 例红（期望仍是旧话），改后 `27 passed (27)`；我自己在这个 worktree 里重跑
  `npx vitest run test/command.spec.ts` → **`Test Files 1 passed (1)` / `Tests 27 passed (27)`**（13:28:32，2.55 s）。
- 产物一致：`node scripts/verify-lib.mjs` 我自己跑 → **`lib/ at 78c9091 is the build of src/ at 78c9091
  (281 files, byte-identical)`**、`client bundle: 329354 bytes → lib/client.js`。
- 全量门禁（它跑的，我没有重跑）：`TMPDIR=$PWD/.tmp npm run ci` 在 `5c120b1` 与 `78c9091` 上都是 **EXIT=0**——
  `98 files / 1839 tests`、`Found 15 warnings and 0 errors.`（15 条全是既有的、不在这次改的两个文件里）。
- 它顺手把两个 README 里那句「`grokDefault: on` 认领每条用户消息」改成了实话（「`on` 只是一个没有记录的会话报出来的值，
  是回退值，不是记录，本身不让接单台接活」）——**这句话正好把红二的矛盾写实了**，而准入规则一个字没动。
- 它标了三条边界：没有真机/真模型 soak（一个字符串不值当，改用测试逐字钉住）；设置页与输入框开关上另有一句旧话
  （「Send /grok for one serious run」）**故意没改**——那句话要先回答红二那个产品问题才能改得诚实；
  两个 README 里「1850 tests across 98 files」是既有漂移（实际 1839），不在这次范围内。

## 7.1 红二没有修，因为它要一个决定

红二不是笔误也不是漏判，是两处各自讲得通的设计撞在一起（开关认部署默认、接单台只认会话记录）。
修它要选甲或乙（§5），选哪个都改用户可见行为，得有决定号。本轮把它连同两条修法一起交上去，不替产品拍板。

## 8. 补跑：工作流引擎本身（真跑 `grok_workflow`，`CONFIRMED`）

这一条是六项都记完之后补的，**单独列，不和六项混**：六项里的「真任务」是模型直接干活，这一条才是引擎。

    会话   session-706442e2-8e4e-41c6-b8c1-580015d22f01（先打过 `/grok on`）
    prompt 请用 grok_workflow 工具把这件事真跑一遍：统计 src/ 目录下每个 .ts 文件的行数，
           给我行数最多的前五名（文件名+行数）。要真读文件，不要猜。

跑出来的链条（会话事件逐条）：

    seq 23  tool/call grok_workflow（objective 写全：覆盖 src/ 全部 .ts、行数含空行、不许猜）
    seq 34  tool-workflow/agent-end   seq=3 outcome=completed
    seq 36  tool-workflow/agent-start seq=4 label=复核  phase=任务 1 · 统计src下TS文件行数Top5
    seq 39  tool-workflow/agent-start seq=5 label=汇总·第1稿
    seq 42  tool-workflow/agent-start seq=6 label=汇总·第2稿
    seq 45  tool-workflow/agent-start seq=7 label=汇总·第3稿
    seq 47  tool-workflow/summary-final draft=3
    seq 48  tool-workflow/guardian-end cancelled=false findingCount=0
    seq 49  tool-workflow/run-end stopReason="completed"

交卷内容（工具结果原文节选，1669 字）：

    Grok workflow: COMPLETED
    Plan: planner; 1 task(s); 1 verified
    Wave reason: Single wave because the objective is one indivisible unit: splitting it would only add a hand-off.
    Confirmed evidence:
    - … 独立执行 find 枚举得 69 个，sort -u 后仍 69，uniq -d 无输出；执行者给出总数 69 一致
    - … 用 wc -l 与 awk END NR 双口径复核；… delivery/index.ts 末字节 7d，awk 得 1331
    - … 复核排序为 script.ts 5025、checkpoint/wiring.ts 1803、run.ts 1692、report.ts 1369、delivery/index.ts 1331
    Summary review: check=pass verify=pass drafts=3 · final: draft 3
    Guard: 0 finding(s), no subagent was terminated; nobody cancelled this round (it finished on its own).

答案（用户最后看到的）：`src/` 下共 **69 个 .ts 文件**，前五名 `script.ts 5025`、`checkpoint/wiring.ts 1803`、
`run.ts 1692`、`report.ts 1369`、`delivery/index.ts 1331`，并且**自己说明了一处口径差异**（`delivery/index.ts` 末尾缺换行符，
`wc -l` 报 1330、按真实行数算 1331）。

这一条为什么重要：**验收是独立跑出来的，不是执行者自报。** 复核那条子代理自己重跑了一遍 `find` + 双口径 `wc`/`awk`，
发现并写下了「末尾缺换行符」这个真实边界，`drafts=3`（汇总改了三稿），`guardian 0 findings`，`stopReason=completed`。
也就是说：「能不管它」这条要求，在这一条上是有读数的——没人盯着，它自己跑完、自己核、自己改、自己收。

**边界**：这跑用的角色路由是 `bifrost-responses`（见 §2 第 2 条，本机没有 `agent2api` 的钥匙），
所以它证明的是「引擎主链在这条路由上真跑通」，不证明 live 档案那一套 `agent2api` 路由在本机能跑。

## 9. 产物

    .rsi/evidence/user-regression-2026-11-25/README.md                     本文件（全部读数与边界）
    .rsi/evidence/user-regression-2026-11-25/ledger/blocks.jsonl           块账本原样 4 行（预览批准 / 接单 / 交卷 …）
    .rsi/evidence/user-regression-2026-11-25/ledger/verdicts.jsonl         监工判决原样 1 行（judged 的那一条）
    .rsi/evidence/user-regression-2026-11-25/block-deliverable-notes.md    块交付物（监工判 pass 的那个文件）

`.tmp/user-regression/` 下的东西（隔离 home、克隆档案、会话转录、脚本、浏览器缓存）是 gitignored 的临时件，
跑完即删；仓库里只留上面这三件 + 本文件。
