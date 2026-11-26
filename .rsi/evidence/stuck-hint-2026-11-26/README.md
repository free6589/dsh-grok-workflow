# 卡住那句话：三种形状里拍到了两种（2026-11-26）

结论先说：进度页底部那句「卡在……」我从真机上拍到了两种形状——**没过的尝试**和**稿子全被退回**，
桌面宽屏和窄屏各一张，句子都在画面里、都读得清。第三种「这一步没有回报」**没拍到**：两次真实尝试都没有
出现那句话，原因在下面写清楚了。五张图全部来自真实运行——真模型、真插件、真页面，没有合成事件流，
没有手写数据，也没有把别的东西打扮成运行。

被测的是本工作树（`fix/readings-refresh`）上的 `fe6d631`，包版本 `0.13.53`。产品代码、测试、
`lib/`、`docs/`、`package.json`、`CHANGELOG.md` 一个字没改，没有提交、没有推送、没有打标签。

## 1. 三个形状，各自的结论

| 形状 | 结果 | 哪两张图 | 从页面上逐字读到的句子 |
| --- | --- | --- | --- |
| 没过的尝试（`failed`） | **拍到** | `failed-desktop-1500.png`、`failed-narrow-390.png` | `卡在 2：执行 第 1 遍没过` |
| 稿子全被退回（`rejected`） | **拍到** | `rejected-desktop-1500.png`、`rejected-narrow-390.png` | `卡在 7：3 稿全被退回` |
| 这一步没有回报（`blocked`） | **没拍到**（`NOT_REACHED`） | 无 | 无——两次尝试里那句话一次都没出现，证据在 §5 |

另有一张多余的 `failed-desktop-1500-midrun.png`：同一个运行还在进行中时（第 12 秒）那句话就已经在屏上了，
顺手留下，不作为要求的那张。

## 2. 每张图是什么，以及它有多“真”

| 文件 | 状态 | 画面宽度 / 图像像素 | 那句话在不在画面里、清不清楚 |
| --- | --- | --- | --- |
| `failed-desktop-1500.png` | 未通过，运行已结束 | 1500 × 1600 / 3000 × 3200 | 在。在图的下方、Guardian 卡片上方，字号小但 2 倍像素，放大即读，**没有被任何面板压住或裁掉** |
| `failed-narrow-390.png` | 未通过，同一个运行 | 390 × 844 / 780 × 1688 | 在。`卡在 2：执行 第 1 遍没过` 一行横排完整，字清楚 |
| `failed-desktop-1500-midrun.png` | 进行中（第 12 秒） | 1500 × 1600 / 3000 × 3200 | 在，同样清楚 |
| `rejected-desktop-1500.png` | 已完成（守门退稿） | 1500 × 1600 / 3000 × 3200 | 在。`卡在 7：3 稿全被退回`，在图下方、Guardian 上方，清楚 |
| `rejected-narrow-390.png` | 已完成（守门退稿） | 390 × 844 / 780 × 1688 | 在。一行完整，字清楚 |

**这五张都是真实运行。** 没有一张是用假事件流画出来的，也没有一张是手工拼的页面。要说明的只有配置：
为了把某一种状态逼出来，我在隔离实例里改了模型钉法和两个预算，每一条改动、每一条理由都写在
`timeline.json` 的 `modelPins` 里。运行本身是真的：真的模型在跑、真的子会话在开、真的文件被写、真的
报告被判。三种状态下页面上没有任何一条控制台报错或页面异常。

窄屏那两张不是手机设备，是把同一个页面缩到 390 宽之后再拍的（同一份 DOM、同一个运行）。这个宽度下标签条上
没有「进度」，我是从标签条右边的「更多会话视图」菜单点进去的——就是读者在这个宽度下真正要走的那条路。

## 3. 读数（每一条和它旁边那张图同一刻读的）

| 读数 | 宽度（滚动宽 = 客户宽） | 牌子 | 那句话 | 节点 / 线 | Mermaid 与 DOM 一致 | 底部按钮 | 那句话的框（上下） | 在视口内 / 未被遮挡 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `failed-desktop-1500` | 1500 = 1500 | 未通过 | `卡在 2：执行 第 1 遍没过` | 9 / 10 | 是 / 是 | （空） | 663 → 680 | 是 / 是 |
| `failed-narrow-390` | 390 = 390 | 未通过 | 同上 | 9 / 10 | 是 / 是 | （空） | 477 → 494 | 是 / 是 |
| `failed-desktop-1500-midrun` | 1500 = 1500 | 进行中 | 同上 | 8 / 9 | 是 / 是 | （空） | 587 → 604 | 是 / 是 |
| `rejected-desktop-1500` | 1500 = 1500 | 已完成 | `卡在 7：3 稿全被退回` | 14 / 16 | 是 / 是 | 收下这版 | 969 → 986 | 是 / 是 |
| `rejected-narrow-390` | 390 = 390 | 已完成 | 同上 | 14 / 16 | 是 / 是 | 收下这版 | 451 → 468 | 是 / 是 |

「在视口内」是把那句话自己的矩形和视口比出来的；「未被遮挡」是在它正中间那一点做命中测试，命中的就是
它自己。两条都是当场读的，不是估的。原始读数在 `readings-failed.json`、`readings-rejected.json`，
每个字段（`stuckText`、`line`、`chip`、`dock`、`pnodes`、`edges`、`current`、`scrollWidth`、
`clientWidth`、`stuckBox`、控制台错误）都在里面。

## 4. 会话流里的原话（逐字，来自那个会话的记录，不是我转述的）

**没过的尝试**（`failed-session-stream.txt`）：四次子调用，两条任务各两次尝试，全部 `failed`。

```
tool-workflow/agent-start {"seq": 1, "label": "执行", "phase": "任务 1 · 写 notes.md 安装步骤", ...}
tool-workflow/agent-end   {"seq": 1, "outcome": "failed"}
tool-workflow/agent-end   {"seq": 2, "outcome": "failed"}
tool-workflow/agent-start {"seq": 5, "label": "执行（尝试 2）", ...}
tool-workflow/agent-end   {"seq": 5, "outcome": "failed"}
tool-workflow/agent-start {"seq": 9, "label": "汇总·第1稿", "phase": "汇总", ...}
tool-workflow/agent-end   {"seq": 9, "outcome": "completed"}
tool-workflow/run-end     {"stopReason": "error"}
```

报告里那条原因（工具原样返回给对话的那段）：

```
- task-notes: failed (2 attempts) — 写 notes.md 安装步骤
  incomplete (infrastructure): worker failed on every route: [model-unavailable] worker call
  produced no result: the child run ended abnormally (llm-pi-ai: no credential for provider
  route "agent2api"; its profile resolves AGENT2API_API_KEY, which is not set — ...
```

**稿子全被退回**（`rejected-session-stream.txt`）：三个任务步骤全部干净通过，只有最后一稿过不了守门。

```
tool-workflow/summary-rejected {"drafts": 3, "stage": "verify",
  "reason": "the answer does not state the recomputed run verdict (completed)"}
tool-workflow/run-end {"stopReason": "completed"}
```

报告里那句判定：`review: check=pass verify=fail drafts=3 reason=the answer does not state the
recomputed run verdict (completed) · rejected: draft 3 (verify: ...)`。

## 5. 没拍到的那一种：这一步没有回报

形状定义在 `src/progress-tab.ts`（`nodeState`）：运行结束（记到了 `run-end`）的时候，某一步还挂着一条
没有结局的调用行，那一步就是 `blocked`；`progressPanelStuck` 再把它变成 `卡在 …：这一步没有回报`。
所以要么让一条调用永远不结束，要么让运行在没有结局的行上面收尾。

两次有边界的尝试，都用了真模型：

| 尝试 | 怎么做的 | 看到什么 |
| --- | --- | --- |
| 一（20:28） | 每个子调用只给 1 秒预算（`childTimeoutMs` 1000）、整个运行不设时限（`timeoutMs` 0），指望脚本丢下一个还在干活的子任务 | 牌子「已完成」，没有那句话（21 节点 / 22 线）。被丢下的子任务在自己跑完之后才回报，行都结了 |
| 二（20:32） | 同上但把预算放宽到 30 秒，并让每个任务先 `sleep 600`，逼运行在两个子调用还开着的时候收尾 | 牌子「未通过」，仍然没有那句话（9 节点 / 10 线）。流里能看清原因（`blocked-attempt2-session-stream.txt`）：运行收尾前，宿主先给还开着的三条行补了结局——`agent-end {seq 1, outcome: cancelled}`、`{seq 2, cancelled}`、`{seq 6, cancelled}`，**然后**才写 `run-end {stopReason: "error"}`。行都结了，而「已取消」不是「没回报」 |

结论：在这一版引擎上，收尾时会先把还开着的子任务取消掉、再写 `run-end`，所以「运行结束了而某一行还没结局」
这个形状到不了页面。想让它出现，得有一条行既不被结算也不被取消，靠改钉法和预算做不到。这是 `NOT_REACHED`，
不是「我拍了一个差不多的东西」。两份读数（`readings-blocked-attempt1.json`、`readings-blocked-attempt2.json`）
和两份会话流都留在目录里，`stuckPresent` 全是 `false`。

这一种措辞本身有单元测试覆盖：`test/progress-panel.spec.ts` 里那条用例构造的正是这个形状，断言读出来是
`卡在 3：这一步没有回报`。那是有覆盖、但不是像素证据，我把它写在这里，不当成截图。

## 6. 顺带看到的三件事（只是看到，没有判对错）

- **未通过的时候，上面那行进度还在给时间**：`failed-desktop-1500` 的 `line` 读数是
  「第 2 步，共 5 步 · 还剩约 1 分 0 秒」——运行已经收尾了，估计时间还挂在屏上。
- **「已完成」和「全被退回」可以同时出现**：`rejected` 那两张的牌子是绿的「已完成」，底下一句说三稿全被退回。
  运行确实走完了，只是没交出稿子；这两件事在页面上各说各的。
- **全被退回的那页仍然有「收下这版」**：`dock` 读数是「收下这版」。按钮在不在是页面的事，我只记录读到的东西。

## 7. 花的时间（按状态，都是钟表时间）

| 阶段 | 用时 | 说明 |
| --- | --- | --- |
| 环境（克隆、打包、安装、起服务、工作区记录） | 约 7 分钟 | 一次克隆、一次安装，之后一共起过六次服务，都是同一个隔离实例 |
| 没过的尝试 | 约 6 分钟（20:18:53 → 20:24:40） | 里面有一次白跑：把 worker 钉成一个不存在的模型，插件直接拒绝加载（配置校验会对着 provider 的模型清单核对），那次对话于是用了内置的 `workflow` 工具，页面上出现的是那个引擎的运行，不是本插件的 |
| 这一步没有回报 | 约 8 分钟（20:28:13 → 20:36:27） | 两次尝试，各一次运行（105 秒、231 秒），外加两次重启 |
| 稿子全被退回 | 约 8 分钟（20:38:16 → 20:45:42） | 一次白跑（worker 还在失败，页面先报了「没过」——`failed` 排在 `rejected` 前面），一次成功；中间花 1 分钟探了三个备选合成模型，全部不可用（403 / 403 / 504） |
| 写文档与收尾 | 约 9 分钟（20:46 → 20:55） | 本文件、`timeline.json`、`redline.txt`、删场景 |

## 8. 目录里有什么

| 文件 | 是什么 |
| --- | --- |
| `README.md` | 本文件 |
| `failed-desktop-1500.png` / `failed-narrow-390.png` | 没过的尝试：桌面 1500 宽、窄屏 390 宽，那句话都在画面里 |
| `failed-desktop-1500-midrun.png` | 同一次运行还在跑时的那一帧（多余的一张） |
| `rejected-desktop-1500.png` / `rejected-narrow-390.png` | 稿子全被退回：桌面与窄屏 |
| `readings-failed.json` / `readings-rejected.json` | 每张图的读数（同一刻读出），含那句话的矩形、视口判定、遮挡判定、控制台 |
| `readings-blocked-attempt1.json` / `readings-blocked-attempt2.json` | 两次没做到的尝试的读数，`stuckPresent` 都是 `false` |
| `failed-session-stream.txt` | 没过那次的会话记录：每条 `tool-workflow/*` 事件、报告原文、助手的原话 |
| `rejected-session-stream.txt` | 退回那次的会话记录，含 `summary-rejected` 的完整内容 |
| `blocked-attempt1-session-stream.txt` / `blocked-attempt2-session-stream.txt` | 两次尝试的会话记录，第二条能直接看到「先取消、后收尾」的顺序 |
| `timeline.json` | 六次起服务、五次运行的时刻、端口、模型钉法与理由、发出去的提示词逐字、哪次运行出了哪张图 |
| `install.txt` | 构建、打包、安装、版本读回的逐条命令与哈希 |
| `redline.txt` | 只读探针、几个 mtime、3080 前后、端口、删了什么 |
| `capture-stuck.mjs` / `extract-stream.mjs` / `serve.sh` | 这一轮用的三个脚本，改一个地址就能重跑 |

## 9. 红线

`~/.dsh` 是只读的：写探针在这一轮开头和收尾各失败一次（`Read-only file system`），`~/.dsh`、
`~/.dsh/profiles`、`~/.dsh/profiles/web` 的 mtime 前后一字节没变，且都早于本轮开始的时间。3080 上的实例
一次没重启、没重载、没改设置；没有提交、没有推送、没有打标签、没有发布、没有改版本号；隔离实例在 3421 端口上，收尾时关掉，克隆出来的 home 与工作区一起删了，只留下这个目录。逐条读数见 `redline.txt`。
