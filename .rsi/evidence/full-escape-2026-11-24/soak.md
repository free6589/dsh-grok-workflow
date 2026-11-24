# 真机 soak — `/grok on` 的「直答 vs 先问 vs 队轮」两相验证

任务：共享任务板 `task-4`。执行手 `agent-133/soak-driver`。
日期：2026-11-24 20:25–21:10（Asia/Singapore）。本次证据文件前缀 `soak-`，本目录其他 agent 的文件未改动。

## 0. 一句话结论

- **相 A（基线 `main` `1f70103`）：旧行为复现，CONFIRMED。** 问「今天天气怎么样？」拿到的只有禁言模板
  「已接单：这条消息正在按整套流程（拆解 → 执行 → 核验）运行。…」，同时后台真起了一整套队轮
  （`tool-workflow/run-start` ×1、`agent-start` ×3、规划/执行/核验三个子会话）。
- **相 B（`feat/full-escape` 构建）：三场景全部 PASS。** 天气与闲聊直接回人话、零队轮；
  真任务先报拆法要点头、点头后才起队轮，且回执三层意思齐全（先答／后台核验／稍后单独送达）。

| 场景 | 构建 | 结论 | 判据 |
|---|---|---|---|
| A 天气 | `main` `1f70103` | **PASS（红复现）** | 只有禁言模板；`run-start=1 agent-start=3` |
| B1 天气 | `feat/full-escape` | **PASS** | 直接答；`run-start=0` |
| B2 真任务 | `feat/full-escape` | **PASS** | 先问拆法且 `run-start=0`；回「确认」后 `run-start=1`，回执含三层意思 |
| B3 闲聊 | `feat/full-escape` | **PASS** | 直接答；无子会话、`run-start=0` |

## 1. rig（可重复，全部随证据存放在本目录）

同一套 rig、同一个 fork profile、同一个 provider 与模型，两相只换被装载的构建。

| 文件 | 作用 |
|---|---|
| `soak-rig-gen-overlay.mjs` | 写 overlay：禁 `llm-deepseek*`、`llm-pi-ai` 加 `soak-live` provider、`agent-default-model`、`workflow-ptc: spawn`、覆盖 `grok-workflow` 行；记录被测构建路径 |
| `soak-rig-install-build.sh` | 把被测构建装进 fork profile 的 `node_modules/dsh-grok-workflow/lib` |
| `soak-rig-boot.sh` | 源 `bifrost.env`（只进进程环境）、独立 `DSH_HOME`/`HOME`、自选空闲端口、前台跑 `dsh` 供后台作业托管 |
| `soak-rig-wait-ready.sh` | 轮询 HTTP 200 |
| `soak-rig-chrome.sh` | headless Chromium + 原生 CDP（无 playwright/puppeteer） |
| `soak-rig-drive.mjs` | 原生 CDP 驱动：点 composer（Lexical 需要真鼠标事件）→ `Input.insertText` → 回车 → 等稳定 → 截图 + `innerText` dump + diff |
| `soak-rig-scenario.sh` / `soak-rig-session-report.sh` | 场景执行 + 用会话头 `createdAt` 建台账，独立统计 `tool-workflow/run-start` |
| `soak-rig-plan-*.json` | 四个场景的步骤脚本 |
| `soak-rig-overlay-baseline.yml` / `soak-rig-overlay-phaseB.yml` | 两相实际使用的 overlay |

隔离与凭据：

- `DSH_HOME=.tmp/soak-full-escape/dsh-home`（`scripts/clone-profile.mjs` 只读克隆在用 web profile →
  `web-soak`，`parity 5/5`、7699 文件、1 行凭据按设计脱敏），`HOME=.tmp/soak-full-escape/home`。
- 端口只用 `3199`（CDP `9223`）。`boot.sh` 硬拒 3080/3081。
- 密钥只经 `set -a; . ~/.dsh/bifrost.env; set +a` 进进程环境；overlay 里只写 `apiKeyEnv` 名。
  本轮所有日志/证据只有 `keyPresent=true`（布尔），没有任何 key 值；`boot.sh` 把 GUI 的 trust token 写进 0600 文件，
  不打印、不落证据。
- 网关：`http://127.0.0.1:18088/openai/v1`，header `x-bf-vk`。
- Chromium `Chrome/155.0.8059.84`；Node `v26.8.1`。

## 2. 两个构建的指纹（重要更正）

`lib/index.js` 在两个构建里 **sha256 完全相同**（`bebf2a06…5090`），因为它只是再导出的桶文件；
真正的行为在 `lib/gate.js` / `lib/answer.js` / `lib/triage.js`。所以 `index.js` 的 sha256 **不能**用来区分两相，
下面用整棵 `lib/` 树的摘要 + 三个行为文件的摘要作为指纹：

| 项目 | 基线 `main` `1f70103` | `feat/full-escape` |
|---|---|---|
| `lib/index.js` sha256 | `bebf2a06323887d110600fdea39ebd0943448773ab1adabbc4be1544c16d2590` | 同左（桶文件，不区分） |
| `lib/` 整树摘要（`*.js`/`*.d.ts`/`*.map` 排序后聚合） | `a067f487122660d26f21f9da37c495a8ea1341144f9467a3588d537a23921239` | `f47baf6788b5097510feb91152f6fbbc83bdfd2e320d3a6bc4292e443ceccbe6` |
| `lib/gate.js` | `ccdb2bd8…060f` | `9a6b54c3…79ba` |
| `lib/answer.js` | `3afddce6…537b6` | `2fd946bd…293e` |
| `lib/triage.js` | `ed774c24…dda38cf` | `1cc4addf…f1ae2` |
| 逃生口标记 `fullFrontDeskEscape`/`full-escape-ask` 在 `lib/gate.js` | **0 处** | **4 处** |
| `package.json` version | 0.13.32 | 0.13.32 |

装载方式：构建产物装进 fork profile 的 `node_modules/dsh-grok-workflow/lib`，profile 行 id/name 仍是
`grok-workflow` / `dsh-grok-workflow`。**不能用构建绝对路径当行 `name`** —— `cordis-plugin-include` 会因
`name mismatch` 直接跳过该 patch（实测警告：`patch: name mismatch for "grok-workflow" …, skipping`），
那样测的就是 profile 里原本装的那个包。

## 3. 相 A — 基线 `1f70103`，旧行为复现（红）

- 端口 `3199`；模型 `agent2api/deepseek-v4.1-flash`（见 §6 缺口 1）；overlay `soak-rig-overlay-baseline.yml`。
- 会话：`session-1b949320-3def-4d11-b5df-656a1e8a59f5`（新会话，先 `/grok on`）。

**逐字（GUI 正文 dump，`soak-A-A1-weather-after.txt`）**

```text
grok
Grok workflow ON — every message now runs the full plan→execute→verify workflow.
今天天气怎么样？
20:50
已完成
已完成，用时 1分6秒

已接单：这条消息正在按整套流程（拆解 → 执行 → 核验）运行。跑完会单独发一条结论给你；期间可以继续发消息，新消息会排在这次之后各自开工。

用量 33.9K tok
```

- 截图：`soak-A-A1-weather-after.png`（1440×817）。
- 耗时：`/grok on` 121 s（未产生可见增长，属 GUI 延迟渲染）、天气回合 93 s。
- **后台真起了队轮**（不依赖 GUI 文本的独立证据，`soak-A-sessions.txt` / `soak-A-workflow-evidence.txt`）：

```text
session-1b949320-… | run-start=1 agent-start=3 tool-calls=0 grok-mode=1 | parent=- | 今天天气怎么样？
28a92617-…        | run-start=0 agent-start=0 tool-calls=1 | parent=session-1b949320-… | 规划助手 You are the captain
4fc75e20-…        | run-start=0 agent-start=0 tool-calls=6 | parent=session-1b949320-… | 执行 · 独立核验天气答复：复…
bc8badc0-…        | run-start=0 agent-start=0 tool-calls=7 | parent=session-1b949320-… | 执行 · 回答用户「今天天气怎…
```

  主会话事件计数：`tool-workflow/run-start` ×1、`tool-workflow/guardian-start` ×1、`tool-workflow/agent-start` ×3。
  worker 子会话里能看到它为这个问题真跑了 `curl api.open-meteo.com`、`curl wttr.in`、`web_search`。
  一个天气问题被拆成「规划 → 执行 → 独立核验」三层。

- 顺手记录的旧行为（同实例，`soak-A-A2-hello-after.txt`）：

```text
你好呀
20:51
已完成
已完成，用时 39秒

你好！前面那条问天气的还在按流程跑，我也把你这句问候记下了，不影响它。等结果出来，我一条消息回你。
```

  （这句本身是人话，但它在**排队**：前言明说答案要等后台队轮回来，且状态栏 `2 轮 2 步`、`3 个子智能体`。）

## 4. 相 B — `feat/full-escape`，三场景

端口 `3199`；同一 fork profile；同一 overlay 只换了被测构建；模型同上。

### B1 `/grok on` →「今天天气怎么样？」 — **PASS**

逐字（`soak-B1-B1-1-weather.delta.txt`，截图 `soak-B1-B1-2-after.png`）：

```text
今天天气怎么样？
20:57
已完成
已完成，用时 1分6秒

我查不到天气：我这边没有接入实时天气数据，也不知道你所在的城市，所以没法判断今天天气如何。

想看准确天气有两条路：

直接看手机自带的天气应用，最准确而且是实时的。
告诉我城市名，我也可以帮你去网上搜一下当地的天气情况。 （这条只派了一个工人，没有开完整团队。）
```

- 没有「已接单：…」，没有「队长先报拆法」，直接就是回答。耗时 94 s。
- 独立判据：`run-start=0`、`agent-start=0`，随后没有单独送达的核验结论。
- 台账（`soak-B1-sessions.txt`）：

```text
session-7b0d1b78-… | run-start=0 agent-start=0 tool-calls=0 grok-mode=1 | parent=- | 今天天气怎么样？
243c6762-…        | run-start=0 agent-start=0 tool-calls=0 | parent=session-7b0d1b78-… | 快速执行 You are the single…
```

- 说明（不修饰）：这一轮**确实派了一个轻量工人**（子会话「快速执行」，零工具调用），
  回答里自己也写了「只派了一个工人，没有开完整团队」。这不是队轮，但它也不是主模型单口直答 —— 见 §6 缺口 4。

### B2 `/grok on` → 真任务 → 先问拆法 → 「确认」 → **PASS**

第一回合（`soak-B2-B2-1-task.delta.txt`，截图 `soak-B2-B2-2-ask.png`）：

```text
把这个仓库的 README 全面重写一遍，然后跑测试，再整理一份变更清单
21:02
已完成
已完成，用时 44秒

队长先报拆法，确认后才派活：

交付一份重写后的 README 全文。
交付测试执行结果：跑了哪些测试、通过还是失败。
交付一份变更清单：本次改了哪些地方、为什么改。
任一项验证不通过就停下汇报，不带着问题往下做。

确认就回「确认」或「开干」；要改拆法直接说（例如「改成两个任务」「先做验证部分」）。
```

- 先问、给出四行拆法预览、要用户点头。此时**没有**起队轮：主会话里 `tool-workflow/run-start` 出现在
  第几次事件上可以精确对上（下），第一回合只派了「CAPTAIN SPLIT PREVIEW」和「首答」两个辅助会话，二者 `run-start=0`。

发「确认」之后（`soak-B2-B2-3-confirm.delta.txt`，截图 `soak-B2-B2-4-confirmed.png`）：

```text
确认
21:03
已完成，用时 59秒

队长确认：按上面报的拆法派活。

听懂了：重写 README、跑测试、再交一份变更清单。文档和代码是否一致、测试能不能跑通，都得核实后才敢下结论。后台分组去查：仓库结构、文档和实现是否对得上、测试入口与真实结果、改动记录从哪来。想改方向就说"停掉X、重点查Y"，进度板在旁边。

已接单：上面这一两句是先答，团队正在后台按拆解 → 执行 → 核验核实它。核验结论稍后单独发一条给你，可能纠正上面的说法；期间可以继续发消息，新消息会排在这次之后各自开工。
```

三层意思都在：**先答**（「上面这一两句是先答」）、**后台核验**（「团队正在后台按拆解 → 执行 → 核验核实它」）、
**稍后单独送达**（「核验结论稍后单独发一条给你」）。首答不是禁言模板。

**顺序证明**（同一主会话 `session-ddb26fe2-…` 的 seq，`soak-B2-sessions.txt` + 下列抽取）：

```text
seq  5  plugin:grok-workflow/mode            ← /grok on
seq  8  turn/start  turn=1                   ← 真任务
seq 25  assistant/message  "队长先报拆法，确认后才派活：…"
seq 29  turn/start  turn=2                   ← 「确认」
seq 37  tool-workflow/run-start  {"name":"任务团队"}   ← 队轮在点头之后才起
seq 38  tool-workflow/guardian-start
seq 40  tool-workflow/agent-start
seq 41  assistant/message  "队长确认：按上面报的拆法派活。…"
```

台账：主会话 `run-start=1 agent-start=1 grok-mode=1`；子会话
`CAPTAIN SPLIT PREVIEW: no work`、`首答 You are the front…`、`规划助手 You are the captain`（8 次工具调用）全部 `run-start=0`。
耗时：问拆法 72 s，确认回合 92 s（含把队轮拉起来）。

### B3 `/grok on` →「你好呀」 — **PASS**

逐字（`soak-B3-B3-1-hello.delta.txt`，截图 `soak-B3-B3-2-after.png`）：

```text
你好呀
20:59
已完成
已完成，用时 24秒

你好！我在。要做事就直接说：简单的我派一个工人，复杂的我开团队，拿不准我会先问你一句。 （这条没有动用团队，前台直答。）
```

- 台账只有一条会话：`session-4735077f-… | run-start=0 agent-start=0 tool-calls=0 grok-mode=1 | 问候`。
  **零子会话、零工具调用、零队轮。** 耗时 47 s。

## 5. 收尾实测

| 检查 | 命令 | 结果 |
|---|---|---|
| 线上 3080 还活着、不是我起的 | `curl -s -o /dev/null -w '%{http_code}' http://100.111.111.88:3080/` | `401`（要 trust token 的活实例，未被我触碰） |
| 我只绑过哪些端口 | `ss -ltnH \| grep -E ':3199\|:9223'` | 只有 `127.0.0.1:3199`（dsh）与 `127.0.0.1:9223`（CDP） |
| live profile 有没有被我写 | `find ~/.dsh/profiles -newermt '2026-11-24 20:25' -type f` | **空**（`~/.dsh/profiles/web` 目录 mtime 仍是 19:49:23） |
| live 家目录里 20:25 之后有变化的 | `find ~/.dsh -maxdepth 2 -newermt …` | 只有 `sessions/`、`system-prompt/`、`checkpoints/grok-workflow` —— 线上实例在服务**本次对话**时自己写的，不是 soak 写的 |
| 浏览器与 soak 实例已停 | `job_kill` + 端口复查 | `3199`、`9223` 均已释放 |
| scratch 已删 | `rm -rf .tmp/soak-full-escape` | 已删（证据先拷到本目录） |
| 仓库无残留 | `git status --short` | 无 `soak-`/`.tmp` 残留（本目录 `.rsi/evidence/` 属既定证据目录） |

## 6. 缺口（如实）

1. **模型被迫换了一个。** 任务指定的 `wb/cn:deepseek-v4.1-flash` 在 20:38–20:46 之间连续 6 次
   `503 {"code":"no_healthy_account","message":"all accounts are temporarily unavailable"}`，
   一次也拿不到回答（第一次相 A 只跑出 `处理失败 503`，作废重跑）。改用同一网关、同一 `/models` 目录里
   实测 200 的 `agent2api/deepseek-v4.1-flash`（连测 3 次全 200）。**两相都用这一个模型**，
   对照仍然干净，但严格说不是任务里点名的那个 id。
2. **`lib/index.js` 的 sha256 不区分两相**（见 §2）。任务里给的
   `sha256 = bebf2a06…5090 / 21144 bytes` 与我用 `git archive 1f70103` 重建出来的基线**逐字节相同**——
   一开始差点被当成「新构建其实就是基线」。真正的区别在 `gate.js`/`answer.js`/`triage.js`，
   建议以后验收用整树摘要或行为文件摘要。
3. **相 A 的后台报告没等到落地。** 截图时状态栏是 `2 轮 2 步`/`3 个子智能体`，那条「跑完会单独发一条结论给你」
   的报告在我切构建（restart 实例）之前还没送达。所以相 A 的「后台真起了一套 workflow」我用的证据是会话日志里的
   `run-start/guardian-start/agent-start` 与三个子会话的实际工具调用，不是最终报告文本。
4. **B1 的「零队轮」有一个细节要看清。** 天气回合后台起了一个「快速执行」子会话（零工具调用），
   回答自己也括注「只派了一个工人，没有开完整团队」。按判据它是 PASS（没有 `run-start`、没有进度节点级的队轮、
   没有随后单独送达的核验结论），但「直答」严格说是「一个轻量工人代答」，不是主模型单口。
   周报里如果要写「零子智能体」，B1 不成立；B3 成立。
5. **判据靠读文本的部分**：B2「先问」与「三层意思」是按 GUI 正文逐字判的，没有做语义断言；
   我同时用会话事件序号把「队轮在点头之后才起」做成了硬证据。
6. **3080 的「没重启」只是间接证据。** 沙箱 `--unshare-pid`，`ss -ltnp` 拿不到 3080 的 pid，
   所以只能给「端口仍在听 + 仍返回 401 + `~/.dsh/profiles` 零写入」这三条，给不出进程启动时间未变的直接读数。

## 7. 归档与构建归属（收尾轮补记，2026-11-24 21:13–21:19，`CONFIRMED`，收尾手实测）

本节只补事实，上面各节的结论一字未改。

- **证据搬家。** 本目录的 85 个 `soak-` 前缀文件原先写在**主检出**的
  `/home/fish/projects_mine/dsh-grok-workflow/.rsi/evidence/full-escape-2026-11-24/`（未跟踪）。收尾时原样拷进本
  worktree 的同一目录——那里已有 12 个非 `soak-` 前缀的执行手证据（`red-*.txt`、`green-*.txt`、`full-suite-*.txt`、
  `collateral-*.txt`、`shared-tree-*.txt`、`channel-spec-front-desk-call.patch`），**没有覆盖、没有删除**；拷完逐文件
  `cmp` **85/85 一致**、`diff -r`（把那 12 个排除在外）**无差异**，之后才删掉主检出那一份目录。删前核对过解析出的
  绝对路径就是上面这一个、内含 85 个文件；删后主检出 `git status --short` 回到空。本目录现在 **97 个文件 = 85 + 12**。
- **相 B 的构建归属。** B1/B2/B3 的试跑时间是 20:56–21:0x，当时 worktree 的 `HEAD` 是 **`62f540f`**（20:51:38）。
  其后 `62f540f`、`24f2f35` 两条提交都只改 `test/grok-on-ingress.spec.ts`，
  `git diff --stat 8f40be1..HEAD -- lib/` **输出为空** ⇒ 被测的 `lib/` 就是 `8f40be1` 那次重建的产物，
  也就是收尾时 `HEAD` 上的产物；§2 的整树摘要 `f47baf67…ccbe6` 因此可以一直对到 `HEAD`。
  旁证：`soak-rig-overlay-phaseB.yml` 首行记的构建路径指的就是本 worktree 的 `lib/index.js`。
- **三个 `drive.log` 没有入库，信息不丢。** `soak-B1-drive.log`、`soak-B2-drive.log`、`soak-B3-drive.log` 落在
  `.gitignore` 的 `*.log` 规则下（本仓库从来没跟踪过任何 `.log`），收尾**没有**用 `git add -f` 硬塞进去：它们只是每一步
  「`settled` / 用了多久 / 涨了多少字」的驱动日志，同样的数字已经逐条落在已入库的 `soak-B?_run.json` 的
  `results[].elapsedMs` 里（B1 `6664` / `93528`、B2 `8190` / `72352` / `92462`、B3 `8299` / `46777` ms）。所以入库的是
  **94 个文件**（97 减去这 3 个 `.log`），`git status --short` 里不会出现它们（被忽略）。要它们也进库，需要仓库先改
  `.gitignore`，那是另一条决定，不在收尾权限内。

- **门禁读数属于执行轮，不在本文件。** 本文件没有记录门禁运行；`TMPDIR=$PWD/.tmp npm run ci` 在 `24f2f35` 上
  **exit 0**、vitest **103 files / 1922 tests PASS**（172.72 s）、`verify:lib` **245 files byte-identical**、
  lint **36 warnings / 0 errors**（173 files）——这几行由执行轮实测，逐字记在
  `docs/knowledge/VALIDATION.md` 同日条目里；收尾轮只搬证据、写记忆，没有重跑门禁。
