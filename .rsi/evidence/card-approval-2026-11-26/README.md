# 问题卡片的真实事件形状 —— 2026-11-26

本目录是 `fix/card-approval` 这一块的测量证据。**只有一个目的**：把「点了问题卡片之后，
宿主到底往会话里写了什么」这件事，从真机的一次运行里逐字抄下来，再记下今天（改动前）账本写的是
什么。代码改动本身与它的用例不在这个目录里，在提交里。

| 文件 | 是什么 |
| --- | --- |
| `event.txt` | 真机捕到的 `user/message`：完整文本段（无省略、无截断）、`source` 对象、事件序号与时间、回答的那次提问、它放行的那次开工 |
| `ledger-before.jsonl` | 同一次运行写下的账本行，逐字一份（只有一行）；`approval.kind` 此时仍是 `"user"` —— 这是「改之前」的读数 |
| `event-after.txt` | 修好之后同一脚本再跑一轮的答案事件，逐字；开工放行 |
| `ledger-after.jsonl` | 三轮真机运行的账本，三行（改动前 / 又一次改动前 / 改动后），逐字 |
| `cardanswertext-before.txt` | 今天的 `cardAnswerText()` 对三种答案形状各给出什么，以及怎么量出来的 |

## 这次是怎么跑出来的

隔离实例，全程没有碰线上：

    worktree   .agents/worktrees/fix-card-approval（分支 fix/card-approval，基线 main 226d673）
    DSH_HOME   <worktree>/.tmp/soak/dsh-home   （scripts/clone-profile.mjs 从 ~/.dsh/profiles/web 克隆）
    HOME       <worktree>/.tmp/soak/home
    profile    web-clone      端口 127.0.0.1:3411（不是 3080）
    插件       本 worktree `npm run build` 后 `npm pack` 装进克隆的 node_modules/dsh-grok-workflow
               （版本读回 0.13.51，`lib/block/tools.js` sha256 2cc0f771…95d0d，无符号链接）
    模型       克隆里本来就有的 agent-default-model：bifrost-responses / opencode-go/muse-spark-1.3-contributor
    密钥       只进 soak 进程的环境变量（. /home/fish/.config/environment.d/grok-api-keys.conf），
               没有复制进克隆、没有写进任何文件、没有打印；本文件不写任何密钥或令牌

克隆 profile 被改的三处（都是 soak 档案的配置，不是产品改动）：

1. `grokDefault: off` —— 不要工作流接管这一轮，模型自己按顺序做。
2. `blockIntake: true` —— 挂上六个块工具。
3. 追加一整份 `- id: preset-standard`（内容是该 DSH 安装里 `standard.patch.yml` 的 plugins 列表原样），
   **只有** `tool-ask-user` 一项不同：`config: { mode: timed, timeout: 20 }`。
   原因上一个 soak 的 F2 已经写过：默认 legacy 下卡片答案只是同回合的工具结果，永远不会变成
   `user-question-reply` 的 `user/message`，那条路径测不到本次修复。

驱动方式（宿主自己的 HTTP API，带浏览器会话 cookie）：

    GET  /?token=…                      -> 303 + HttpOnly cookie
    POST /api/session/create            args {"request":{"cwd":…}}
    POST /grok-workflow/mode            {"action":"set","sessionId":…,"enabled":true}   ← 等价于 /grok on
    POST /api/session/prompt            args {"request":{"requestId","sessionId","mode":"queue","content":[…]}}
    POST /api/userQuestions/answer      args {"agentId":sessionId,"callId":…,
                                          "answer":{"answers":[{"id":"q1","selected":["确认"],"custom":"就按这个来"}]}}

信封形状：`POST /api/<namespace>/<method>`，body 是
`{"type":"client-request","rpcId":"…","method":"<ns>/<method>","payload":{"args":{…}}}`；
`args` 的字段名必须与描述符一致（`session/create` 要的是 `request`，不是裸 `cwd`，否则
`gateway/arguments-invalid`）。

## 走了一遍什么（`CONFIRMED`，都在本次会话里亲眼看到）

会话 `session-9f00ae2a-fab1-4a97-91b9-bda24865c6d4`，逐条来自会话档案（zstd 分帧解出来的）：

| seq | 事件 | 内容 |
| --- | --- | --- |
| 20 | `tool/call grok_open_block` | 模型第一次预览，`execution` 填了非法值，被拒 |
| 25 | `tool/call grok_open_block` | 改成合法值，拿到 `bp-f20b636a…` / `990d9937…` |
| 30 | `tool/call ask_user_question` | 「这一单可以开工吗？」，选项「确认」/「再看看」 |
| 31 | `tool/result` | `{"pending":true,"callId":…}` —— timed 窗口 20 s 到期 |
| 41 | `turn/end` | 回合结束，问题进入 `continued` |
| — | `userQuestions/answer` | 返回 `true`，答案里既选了「确认」也写了 `custom` |
| 46 | `user/message` | `source.kind = 'user-question-reply'`，**这就是 `event.txt` 里那一条** |
| 48 | `tool/call grok_open_block` | `mode:"start"`、`approval:{kind:"user",quote:"确认"}`，**开工放行** |
| 49 | `tool/result` | `block_id 703bfda4…`、`status open`、账本路径 |

`ledger-before.jsonl` 就是 seq 49 写下的那一行：`"approval":{"kind":"user","quote":"确认","at":…}`。
也就是说：**卡片答案确实被当成了用户的点头（D-137 的那一半成立），但账本把它记成了一次「打字确认」**——
这正是本块要修的那一格。

## 改完之后，同一条路再走一遍（`CONFIRMED`）

同一个克隆、同一个脚本、同一个模型路由，只把克隆里的插件换成修好之后构建的那份
（`lib/block/tools.js` sha256 `b84a48c2…a49371`，装之前/之后都读过这个 sha）：

    session　session-50bd4d8f-5ed4-494c-bbb7-6d034eae72d7
    seq 36   user/message，source.kind = 'user-question-reply'（答案里既选了「确认」也写了 custom）
    seq 38   tool/call grok_open_block，mode:"start"、approval:{kind:"user",quote:"确认"}
    账本     "approval":{"kind":"question-reply","quote":"确认","at":"2026-11-26T08:58:04.936Z"}

`event-after.txt` 是这一轮的答案事件逐字（同样没有省略、没有截断），`ledger-after.jsonl` 是三行的
完整账本，**三行都是真机写的**：

| 行 | 会话 | 写它的构建 | `approval.kind` |
| --- | --- | --- | --- |
| 1 | `session-9f00ae2a…` | 改动前 | `user` ← 「改之前」 |
| 2 | `session-155d62af…` | **也是改动前**：这一轮本想跑改后的构建，但安装那一步的相对路径算错，文件落到了一个多余目录，克隆里仍是旧包（跑完才发现）。这一行因此意外成了第二次「改动前」的对照 | `user` |
| 3 | `session-50bd4d8f…` | 改动后 | **`question-reply`** |

第 2 行不是失败重跑，是一次真实的安装失误留下的读数，原样留着——它反而把「同一脚本、同一档案、
只换构建，账本从 `user` 变 `question-reply`」这件事测成了对照组。


## 红线

`~/.dsh`、`~/.dsh/profiles`、`~/.dsh/profiles/web` 的 mtime 分别是 2026-11-25 23:14、2026-11-22 16:59、
2026-11-26 11:22，全部早于本次会话（16:35 开始），写后复查仍是这三个值；线上 3080 前后都是 `401`；
未 push、未打 tag、未 bump、未 publish。soak 的临时目录在收尾时删除。
