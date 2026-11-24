# Changelog / 更新日志

Notable user-facing changes are recorded here in English and Simplified Chinese.
用户可见的功能和修复会在这里以英文和简体中文记录。

## [Unreleased]

## [0.13.30] - 2026-11-24

### Fixed / 修复

- **One report's two diagnostics views now say the same thing / 同一份报告的两个诊断视图现在说同一句话** —
  Ops opens two machine views of one report while diagnosing: the diagnostics block the tool surface prints, and the machine ledger a delivery carries when that switch is on. They had drifted apart. The ledger showed no dead routes and no per-call child budget at all, it merged this run's own full lane with another run's busy hint under one heading, and the same error read as two different rows because only one view kept the failure category. The ledger now renders the report's own blocks: a dead-route block naming the route, the transport family and the streak; the child-budget line, so a hung child can be told apart from the run's own deadline; two separate overflow headings, one for this run's cap and one for another live run's approximate hint; and error rows that keep the category and the same message bound in both views. A routing entry that recorded only a wait and named no lane is no longer printed as `no lane named`: the report never showed it, and the ledger no longer invents a row for it. The ledger's own length clamp also stopped eating its tail: the closing lines (why the run stopped, and what the watchdog saw) are reserved before an overlong body is cut, so they survive the truncation instead of being the first thing lost. Both new labels are scrubbed from the human answer like every other ledger label.
  / 诊断一份报告时，运维会同时打开两个机器视图：工具界面打印的诊断块，以及交付里打开开关后带的机器台账。这两个视图跑偏了——台账里根本没有死路由，也没有每次子调用的预算，还把「这一轮自己满载」和「另一个 run 说这条忙」并成一个标题，同一条错误在两边读出来是两行不同的字（只有一边留着失败类别）。现在台账渲染的就是报告自己的块：死路由块（写明哪条路、死于哪类传输故障、连续几次）、子调用预算行（这样「子代理挂住」和「整轮时限到了」才区分得开）、两个分开的溢出标题（一个是这一轮自己的上限，一个是另一个在跑的 run 给的大致提示）、以及两边都保留类别和同样长度上限的错误行。只记了等待时间、没点名任何道的路由条目不再印成 `no lane named`：报告从来不显示它，台账也不再为它编一行。台账自己的长度上限也不再吃掉尾巴：收尾那两行（为什么停的、守卫看到了什么）在切掉超长正文之前就预留好了，所以它们不会被截断吞掉。这两个新标签和人话答案里其它台账标签一样会被清理掉。

### Verification and gate / 验证与门禁

- **The release gate stopped failing on a busy machine / 发版门禁不再因为机器忙就红** —
  Two gate cases failed intermittently under load: both asserted the moment the background round *started*, while the gate keeps that session's message channel open until the report is actually delivered — so a message arriving inside that window joined the running round instead of being answered by the front desk, and the case failed with a receipt a user would read as a product bug. Both now wait for the round to *land* (report in, channel gone) through a helper that holds its own timer and fails by name after 15 seconds, instead of the 1-second default that was the real fault. Measured before: 15 of 15 runs red on a loaded machine, 10 of 10 for the second case; after: 0 of 10 and 0 of 6 at comparable load. No assertion, timeout, skip or configuration changed, and no plugin behaviour changed — this is the gate, not the product.
  / 门禁里有两条用例在机器有负载时是间歇性红的：两条都在后台轮「刚开始」的时候就断言，而闸门为整轮留着这条会话的插话通道、直到报告真的投递之后才关——落在这段窗口里的消息不会走前台，会被并进正在跑的那一轮，于是用例红出来一句用户会读成产品故障的回执。现在两条都等这一轮「落地」（报告已到、通道已消失），用的帮助函数自己持钟、超 15 秒报具名失败，而不是原来那个 1 秒默认值——那个默认值才是病根。修前实测：负载下 15 次跑 15 次红，第二条用例 10 次跑 10 次红；修后在可比负载下 0 红（10 次、6 次）。断言、超时、跳过、配置一律没动，插件行为一点没变——动的是门禁，不是产品。

- **Measured on a real run: a route that hangs costs one call, and later tasks never pay for it again / 真机复核：挂住的路只按次数付钱，后面的事不再为它买单** —
  Before shipping, a five-task run was measured on an isolated home against a route that accepts the request and then never answers, placed ahead of two live routes. The hung route was called three times in the whole run: twice by the first task (its own two attempts), and never again by tasks two through five, which all landed on a live route. Every hung call was settled by the run's own 45-second child budget (44.65–44.93 s at the endpoint, the remainder being the child's own startup) — never left open, never closed by another watchdog. The third call is the transport layer re-sending the first attempt's orphaned request 300 s later, byte-for-byte the same body: that is the provider's client asking again, not this plugin. Two independent rounds produced the same shape. Evidence: `.rsi/evidence/soak-hang-shape-2026-11-24/`.
  / 发版前在一个隔离的家里跑了五个任务的真实轮次，把一条「收下请求就永远不答」的路排在两条活路前面。整轮里那条挂死路只被调用了三次：第一次是任务 1 自己的两次尝试，任务 2 到 5 一次都没打它、全部落在活路；每次挂死的调用都由这一轮自己的 45 秒子调用预算结算（端点侧 44.65–44.93 秒，差额是子代理自己的启动开销），不是永不结算、也不是被别的看门狗收掉。第三次是传输层在 300 秒后把任务 1 那次尝试遗留的孤儿请求原样重发了一次（请求体字节数完全相同）——再问一次的是服务商那边的客户端，不是本插件。两轮独立复现，形状完全一致。证据在 `.rsi/evidence/soak-hang-shape-2026-11-24/`。

## [0.13.29] - 2026-11-24

### Fixed / 修复

- **A plan is asked for again instead of being given up on / 计划不再因为一次格式错或一次 503 就降级** —
  A planning call that came back without a usable plan used to end the run's split immediately: the run degraded to the structural fallback, which can never report the objective as completed, so a child that answered with prose instead of a structured result, or a planning route that refused or hung, cost the whole round its plan. Planning now asks twice more, and neither ask is a retry. A form gap (no structured result, or a plan the shape gate rejects) is re-asked once in the same planning call — the rule the worker and the verifier already followed — with the rejection named in the prompt. A transport death (timeout, dropped connection, a 5xx, a 429 the switch does not keep on its route) re-fires the plan once, on a route this call has not paid for yet: the route that hung is not waited on twice, and with nothing left to try a refusal is repeated once while a hang goes straight to the fallback. The child-call budget now counts those two rescue calls, so a rescued run cannot be aborted at the moment it recovers.
  / 规划调用没有可用计划时，过去整个计划当场作废：整轮退化成结构性兜底，而兜底计划永远不可能报告目标已完成——所以子代理答完只说了话、计划过不了形状闸门、或者规划那条路由拒绝/挂死，代价都是整轮没有计划。现在规划会多问两次，两次都不算重试：格式错（没有结构化结果，或计划过不了形状闸门）在同一次规划调用里重交一次（执行与检查两条腿早就这么做），提示词里写明被拒原因；传输死（超时、连接断开、服务商 5xx、勾选框没留住的 429）换路重打一次，只落在这一腿还没付过的路由上——挂死的那条不会被等第二次，路都试完了遇到拒绝会原路再打一次，遇到挂死才直接落兜底。子调用预算把这两次补救也算进去了，所以被救回的一轮不会在最关键的时刻因为预算上限被掐断。

- **A judge that died of a bad route no longer makes the worker do the job again / 判定那一步死于坏路时，不再让干活的那一步重做一遍** —
  When the verifier (or the supervisor) never answered because the route carrying it timed out, dropped the connection, answered 5xx, or answered a 429 that the switch policy moves off, the attempt used to fail and the retry re-ran the WORKER — the expensive leg — even though the work was still there and only the verdict was missing. The run now asks that same judging leg once more inside the same attempt, with the executor result unchanged, so a verdict that never arrived costs one judge call instead of a full redo: no retry is spent, no extra attempt row appears, and the worker's result stays. The gate is the run's own "this route is dead" evidence; a missing structured result keeps its one free form resubmit and is not treated as a death, a judge that actually said "fail" is an answer and is never re-asked, a setup fault still stops the attempt, and a 429 counts only when the switch policy says a rate-limited route should move on — a 429 the switch keeps on its route means "busy now" and stays a plain retry. The attempt row now records when this rescue happened, and the child-call ceiling pays for the extra walk (a worker at most 2 calls per attempt, each judging leg at most 3), with the load-time backstop raised from 600 to 1000 calls per task so every legal chain combination still loads.
  / 检查者（或监督者）那条路超时、连接被断开、回 5xx，或者回了一个「按勾选框策略该换人」的 429 时，它根本没给出判定；过去这一次尝试就算失败，重试会把**干活的那一步**（最贵的那一步）整个重跑一遍——而活是好的，缺的只是一个判定。现在这一轮会在同一次尝试里，把同一个判定步骤再问一次，执行结果原样不动：一个没到手的判定只花一次判定调用，而不是一次全量重做——不消耗重试次数、不多出一条尝试记录、干活的结果留着。闸门用的是这一轮自己的「这条路死了」证据；「没交结构化结果」仍然保留它那一次免费补交、不算死亡；真的判了「不通过」的那是答案、不会再问；配置/预算类的硬故障仍然直接停；429 只在勾选框说「限流就换人」时才算——勾选框把这条件路留着时，429 的意思是「现在忙」，仍然只是普通重试。尝试记录里会写明发生过这条救援，子代理调用上限也把多出来的一趟算进去了（干活的最多 2 趟、每个判定最多 3 趟），载入期的总闸从 600 抬到 1000，所以任何合法链路组合都仍然装得上。

- **A refused key is reported as a refused key, and no longer pays a pointless resend / 密钥被拒就写成密钥被拒，不再白补交一次** —
  When the gateway refused a child with 401 or 403, the run recorded it as a formatting mistake and the report only corrected that wording after the last call — and before that, the task had already paid one same-attempt resubmit that the same key was going to refuse again. A refusal (401/403, an unknown model) now travels to the running workflow the same way a transport death does, carrying the provider's own words, so the attempt ends where it should: the task moves on with the real cause on the row, and there is no resend. It still never marks the route as down — a refused key needs a key, not a different route, so the dead-route table keeps its four transport families and this class is deliberately not one of them. A cancellation and a real format gap are untouched: they keep their one free resubmit.
  / 网关用 401 或 403 拒绝子代理时，这一轮过去把它写成「格式不对」，而且报告要等最后一次调用之后才把措辞改回来——在那之前，任务已经为它白付了一次同次补交，而同一个密钥照样会被再拒一次。现在这类拒绝（401/403、模型不存在）和传输层死因走同一条路回到正在跑的工作流，并带着服务商自己的原话，于是这次尝试停在该停的地方：任务换路往下走，失败行写的是真因，也不会再补交。它仍然不会把那条路由记成「这条路挂了」——密钥被拒要的是换 key，不是换路，所以死路由表仍然只收四个传输族，这一类是故意不收的。被取消和真正的格式错一点没动：它们仍然保留那一次免费补交。

## [0.13.28] - 2026-11-24


> `v0.13.27` is tagged but published no release: its test gate failed on the runner (a timing-sensitive assertion in the new dead-route case), so the fix is test-only and ships here.
> `v0.13.27` 有标签但没发布：它的门禁在远端跑挂了（新增死路由用例里有一条对时序敏感的断言），所以修的是用例，随这一版一起发。

### Changed / 变更

- **A route that keeps failing is tried last, so a task stops paying for a road that is down / 一直失败的那条路排到最后，不再让每件事都为它付一次钱** —
  When a model route failed the same kind of transport failure twice in a row — timeout, dropped connection, a 5xx from the provider, or a 429 — the run kept placing calls on it for every later task, spending one child call (and, on a route that hangs instead of refusing, one whole child-call stall) before falling through to a route that worked. The run now remembers those two failures and moves that route behind every live route for the rest of the run; it is never removed from the chain, it is still tried when nothing else is left, and the row disappears the moment it answers again. Only transport families count: a refused key (401/403), a child that never submitted a structured result, and an engine that never started a child say nothing about the route, so they are not evidence. A 429 counts only when the 429 switch says a rate-limited route advances to the next model — with the switch off the route is kept and the task retries on it, so a 429 is "busy now", not "down". When every live route is already at its in-flight cap, a dead route with room takes the call instead of the run waiting for a lane to drain. Each call row in the report now also names the task it was placed for, so a failure row can be read without counting attempts, and the diagnostics ledger gains a `Dead routes` block naming the route, the family that killed it and how many failures in a row it took. Two things had to change for this to hold on a real run, and both are part of this entry: a call that *hangs* counts toward the table even though a hang still does not make the task switch models (it retries with new wording, but the route that hung is demoted for the rest of the run), and a provider death — a 5xx, a dropped connection, a 429 — now reaches the run carrying the cause the child's own session recorded instead of arriving as one anonymous format error that no path could count. A refused key, a genuine format gap and a cancelled run keep that format error, because none of them is evidence about the route.
  / 一条模型路由连续两次栽在同一类传输故障上（超时、连接被断开、服务商 5xx、或 429）时，过去这一轮里后面每件事都还会继续往它身上打电话，先付一次子调用（如果它是挂住而不是直接拒绝，还要付一次完整的子调用等待）才落到能用的路上。现在这一轮会记住这两次失败，把它排到所有活着的路后面；它不会被从链里删掉，别的路都试过之后仍然会试它，而且它一旦答上来这行记录就消失。只有传输类的失败算证据：密钥被拒（401/403）、子代理没交结构化结果、引擎根本没把子代理启动起来，这些都不说明这条路有问题，所以不计数。429 只在「429 勾选框说限流就换人」的时候才算——勾选框关掉时这条路会留着、由任务重试它，那时的 429 意思是「现在忙」，不是「挂了」。当所有活着的路都到并发上限、只剩一条死路由有空位时，这一次调用就直接落到死路由上，而不是干等一条道空出来。报告里每条调用现在还会写明它是为哪件事打的，所以一行失败不用数尝试次数也能读；诊断台账多一块 `Dead routes`，写明是哪条路、死于哪类故障、连续失败了几次。要让这条在真机上也成立，还有两件事一起改了，都算在这一条里：**挂死**的那次调用也计数，尽管挂死仍然不会让任务换模型（任务还是改写措辞重试，但那条挂过的路在本轮剩下的时间里被降级）；服务商那边的死因——5xx、连接被断开、429——现在带着子代理自己会话里记下的原因回到这一轮，不再以一个谁也认不出的「格式不对」出现。密钥被拒、真正的格式错、被取消的 run 仍然保留那个格式错，因为它们都不说明这条路有问题。

## [0.13.26] - 2026-11-24

### Fixed / 修复

- **A child that died is no longer reported as a formatting mistake / 子代理死掉不再被写成"格式不对"** —
  When a child agent timed out, hit a refused key or was cancelled, the report used to record it as a format error and say the child "returned no valid structured result", which reads as "send it again" — the workflow engine hands the script the same empty value for a dead child as for a child that answered without submitting. Measured: 530 transport, auth and timeout deaths were filed as format errors against 25 real ones. The plugin now records what each child actually ended as and rewrites only the rows whose evidence is unambiguous: a death is named as a death with the cause the provider gave, in the provider's own words, and a child that genuinely finished without submitting keeps its format error and its one free resubmit, which is the case that rescue path exists for. A run whose children died of different causes keeps each child's own cause — measured on a live run: four workers killed by a refused key were named as such while a planner that really did fail to format its result kept its format error. Where nothing was recorded the report says the child ended abnormally and that the cause is unknown, instead of inventing a missing form. The delivered answer's "still incomplete" lines are rebuilt from the repaired rows, so the sentence a user reads names the same cause as the report. The memory archive names the cause too, instead of only saying the transcript was empty. The cause is read from the child's own session log, which is where it actually lives: the engine's in-process subagent result has no provider diagnostic field at all, and reading the prompt out of the wrong spec shape had left the whole repair inactive on every real run.
  / 子代理超时、密钥被拒、或者被取消时，报告过去一律写成"格式不对"，理由是"子代理没有返回有效的结构化结果"——这句话读起来像"再发一次就好"，而引擎交给脚本的其实对"死掉的子代理"和"答了但没提交的子代理"是同一个空值。实测：530 次传输、鉴权、超时被写成格式错，真正的格式错只有 25 次。现在插件会记下每个子代理真实的结束状态，只改写证据没有歧义的那些行：死掉就写成死掉，并带上服务商给的原因、用它自己的原话；真的"答完了但没提交"的子代理仍然保留格式错，也仍然保留那一次免费补交——那条救援路本来就是为它准备的。一个 run 里子代理死因各不相同的话，每个子代理各按自己的死因写——真机实测过：四个被拒密钥打死的执行子代理如实写成鉴权失败，而一个确实没把结果格式写对的规划子代理仍然保留格式错。什么都没记下来的时候，报告说"子代理异常结束、原因未知"，不再编一个"少交了表格"的理由。交付给你看的那句「仍未完成」也跟着按修好的行重建，所以你读到的句子和报告说的是同一个原因。记忆归档同样会写死因，不再只说"它的对话记录是空的"。死因是从子代理自己的会话记录里读出来的——它本来就只在那里：引擎在本机进程内跑子代理时交回的结果里根本没有服务商的失败原文，而原先又把提示词读错了形状，于是这套修复在真机上一直等于没装。

## [0.13.25] - 2026-11-24

### Fixed / 修复

- **One stray quote in a verdict no longer costs the whole task / 一个跑偏的引号不再让整件事重做** —
  When a verifier or a supervisor wrote an unescaped English double quote inside its structured result, the host could not parse it and handed the workflow an empty value, so a judgement that was really "pass" was discarded and the task was redone from the start — a measured 19.5 minutes burned for one character. Both judging roles now get the same one-shot, same-attempt resubmit the worker already had: the same verdict and the same evidence re-sent in a form that parses, without spending a retry. The prompts and the result schema now ask for quote-safe, short prose (English double quotes written as 「」 or single quotes; every evidence and finding item under 800 characters), an empty structured result names the role that lost it and the channel, and the host's JSON wording (`structured_output`, `Expected ','...`) is classified as a format error instead of an unknown provider fault. The child-call ceiling counts the resubmit, so the rescue can never trip the budget instead of recovering the verdict.
  / 检查者或监督者交回的结论里只要有一个没转义的英文双引号，宿主就解析失败、把空值交给工作流，于是一个本来是"通过"的判定被丢掉，整件事从头再做一遍——实测一个字符烧掉 19.5 分钟。现在这两个判定角色和干活的子代理一样，在同一次尝试内可以补交一次：同样的判定、同样的证据，用能解析的写法重发，不消耗重试次数。提示词和结果结构现在要求短句、安全引号（英文双引号写成「」或单引号，每条证据和发现 800 字内）；空的结构结果会点名是哪个角色、哪个通道丢的；宿主那句 JSON 原话（`structured_output`、`Expected ','` 等）算作格式错误，不再当成来源故障。子代理调用上限把补交算进去了，所以这条救援路不会被预算卡死。

### Changed / 变更

- **The final answer is written for you, not read off the ledger / 结论是写给你看的，不是把台账念一遍** —
  A finished run used to arrive as a 200-character status strip and only its first sentence, with `答案：` / `下一步：` labels and the same paragraph mirrored in Chinese and English. The delivery now carries the run's whole summary, names what was achieved and where the deliverable is (its path is no longer stripped out of the block), and asks the answering model to rewrite that material against the question you actually asked — in your language only. A failed run still hands over its wording verbatim: a paraphrase is free to soften, and a failure that reads like an answer is worse than no answer.
  / 以前跑完收到的是一条 200 字左右的台账摘要，而且只有第一句，外面还套着「答案：」「下一步：」这些标签，同一段话中英各来一遍。现在交出去的原料是整个结论、做成了什么、以及东西放在哪里（交付物路径不再被当成机器细节删掉），并要求作答的模型按你真正问的问题把这份原料重写成一句话说得清的回答——只用你说的一种语言。失败仍然是逐字转达：改写有软化的自由，而一个读起来像答案的失败比没有答案更糟。

- **The synthesizer may write 结果 / 怎么用 / 注意, and it rewrites the caveats itself / 汇总可以写「结果/怎么用/注意」三段，注意事项由它自己写** —
  The narrative was capped at 200 characters with no headings and no lists, and the report's open questions were pasted under it word for word — so the answer read like a status line followed by the machine's own notes. It may now use those three sections (no other headings, no lists, no markdown), the narrative bound follows the answer's size, and the open items are rewritten in its own words under the caveat section. The gate's requirement changed with it: a narrative with open items and no caveat section is rejected, while one that says them in its own words is no longer rejected for not quoting the report. When no draft passes, the deterministic summary still states the caveats plainly.
  / 以前结语被限死在 200 字、不许标题不许列表，而报告里那几条待确认事项又被原样贴在它下面——于是答案读起来像一行状态栏加机器的批注。现在可以用「结果：」「怎么用：」「注意：」这三段（别的标题、列表、Markdown 仍然不行），长度上限跟着答案的大小走，待确认事项由它用自己的话写进注意段。门卫的要求也跟着换了：有待确认事项却少了注意段会被打回，但用自己的话说明白、没有照抄报告原文的，不再被判错。所有草稿都没过时，确定性摘要仍会把注意事项老实写出来。

## [0.13.24] - 2026-11-24

### Fixed / 修复

- **The first message of a session is visible while the team works / 第一句话不用等整轮就能看见** —
  On a fresh session the gate could not publish the message ahead of the run (writing it before the host's first surface node would brick the stored log), and the workflow held the turn open, so the whole round carried no message at all: the composer looked broken and a reload lost what was typed. A first-turn message in the full shape now goes in immediately — the words open the step, the team runs behind them — and the report arrives as its own message, exactly like every other deferred answer. Nothing is written ahead of the host head, so the position-0 rule is unchanged.
  / 新会话的第一句话以前只能等整轮跑完才出现：门卫不能抢在宿主第一行之前把消息写进日志（那样会把存档写坏），而工作流又一直占着这一轮，于是一整轮里一条消息都没有——输入框像坏了，刷新一下刚打的字也没了。现在完整形状下的第一句话会立刻进对话：原话先把这一轮开起来，团队在后面跑，结论作为单独一条消息送到，和其它延后回答完全一致。仍然不抢宿主第一行的位置，防砖规则一字未改。

- **A split confirmation is answered once, and never after it expired / 拆法确认只答一次，过期了不会照跑** —
  Three ways one confirmation could go wrong are closed: an expired question could still dispatch the plan it named, a full per-session queue left a record claiming a background run that never happened, and on the full shape the answer word itself ("确认") could become the objective of a whole run while the plan it answered was dropped. The confirmation is now consumed once, with its ten-minute lifetime, before any path reads it; a message that is not an answer voids it and is routed on its own; and it is queued before it is recorded, so no accounting describes work that did not start.
  / 一个确认以前有三处会走歪：过期的确认照样能把它点的计划派出去；每会话队列满时留下了"已在后台跑"的假账；完整形状下这次回答的字（"确认"）本身可能变成一整轮的目标，而它确认的计划被丢了。现在确认只在任何路径读取之前被取走一次、带十分钟时限；不是回答的消息就作废它并按新消息单独分流；先排队成功再记账，于是没有一笔账在描述没开始的活。

- **An approval runs the split you read, not a new one / 你确认的那套拆法就是真正跑的那套** —
  The confirmation said the split was stated before any work was dispatched, and then the run received only the bare original request, so the planner was free to re-split it: you approved one split and paid for another. The dispatched request now carries the split you read as a bound beside the original words ("plan the tasks it names instead of re-splitting the request"), and a request that changes the split still goes through the amendment path. When the preview call failed there is no split to keep, so the request goes unchanged — nothing was shown, so nothing is claimed as approved. A stack of polite words ("好，可以" / "确认。开干") now answers the question too, while a sentence with content ("行，那你先看看这个文件") is still not an answer.
  / 确认环节说的是"先报拆法、再派活"，可真正派出去的只有原话，规划器仍可随意重拆：你确认了一套，付钱的是另一套。现在派发的请求会把你看过的那套拆法作为约束附在原话后面（"按它点名的任务规划，不要重拆"），而明确要改拆法的消息仍走修改那条路。预览调用失败时没有拆法可留，就原样派发——什么都没报出来，就不能声称你确认过什么。一串客气话（「好，可以」「确认。开干」）现在也算确认，但带内容的话（「行，那你先看看这个文件」）依然不算回答。

## [0.13.23] - 2026-11-23

### Added / 新增

- **The captain asks before it dispatches / 队长先报拆法，确认后才派活** —
  In the front-desk (triage) mode a team message now gets one confirmation round: the captain states the split it intends to use, in a short preview, and the work is dispatched only after you approve. Replying "confirm" runs the plan as stated; saying what to change ("改成先写测试") runs the original request with your change folded in; any other message voids the confirmation and is routed on its own. `/grok` (full shape) and the answer to the front desk's own quick-or-team question skip the round. Mid-run messages still join the live plan through the existing channel.
  / 前台（分流）模式下，团队档消息现在多一轮确认：队长先把准备采用的拆法简要报出来，你确认后才派活。回「确认」就按报的拆法跑；直接说要改什么（例如「改成先写测试」），就在原请求上带着你的改动跑；其它消息则作废这次确认，按新消息单独分流。`/grok`（完整形状）和"前台问完你选团队"那一条不重复问。跑中插话仍然走现有通道并入活计划。

- **The captain remembers three sheets / 队长记忆三叠纸** —
  Beside the durable round ledger the plugin now keeps a long-term user profile (`profile.md`) and one retrospective line per round (`experience.md`), and the captain reads all three (profile, experience, recent progress) before planning. A round's retrospective is written when the round settles, exactly once. The same sheets are readable and the profile writable from the memory CLI (`captain`, `profile`, `profile add <text>`, `experience`). Nothing is written into a live home by the plugin itself beyond that ledger directory, and no credential is ever stored (every line is redacted before it is written).
  / 在原有的轮次台账旁边，插件现在多记两页纸：长期用户画像（`profile.md`）和每轮一条复盘（`experience.md`）。队长规划前会把三叠一起读——画像、经验、最近的进度。每轮结束自动写一条复盘，恰好一条。同一套纸可以用记忆命令行读取，画像还可以追加（`captain`、`profile`、`profile add <text>`、`experience`）。除了这个台账目录，插件不往任何在用家目录里写东西；任何一行落盘前都先脱敏，不存凭据。

### Changed / 变更

- **The model decides the split, the order and whether to keep going / 拆几个、什么顺序、失败后停不停，由模型现场定** —
  The planner prompt no longer prescribes decomposition ("split into at most N", "return exactly one task when you cannot split"); it is a captain charter: the model decides how many tasks the objective honestly needs, their order, and whether continuing after a failed task is worth it. The shape limits (task count, sizes, wave ceiling) stay exactly where they were — they are the gate, not the plan. A plan may now carry `onFailure: "stop"`: the wave after a failed task is not dispatched, and every task that did not run is reported as a stopped row with the reason. Unset or unreadable values keep the old "keep going" behaviour, so no existing plan changes meaning.
  / 规划提示词不再规定怎么拆（"最多拆 N 个""拆不动就返回恰好一个任务"），改成一份队长宪章：拆几个任务、什么顺序、某项没过验收后还值不值得继续，都由模型现场决定。形状上限（任务数、各字段长度、波次上限）原样保留——那是门卫，不是计划。现在计划可以带 `onFailure: "stop"`：某波有任务没过验收，下一波就不发车，没跑的任务会以"队长叫停"的 blocked 行如实上报。不填或填了看不懂的值，仍是旧的"继续跑"，既有计划的含义不变。

- **A reload waits for the child call it was about to kill / 重载不再秒杀正在跑的子代理** —
  Disabling or upgrading the plugin used to cancel every live run on the disposer's first line, so a ten-minute child call died 200 ms before it would have reported. The unload now closes the door, waits while any subagent call is still open (up to 45 s, and it needs 1.5 s of quiet before it believes nothing is left), and only then cancels what is still running. A run that finishes inside that window keeps its own result instead of being stamped cancelled, the session notice says how long it waited and what was still open, and a shutdown signal skips the window entirely.
  / 关掉插件或升级它时，以前在收尾第一行就把所有在跑的活儿取消，于是跑十分钟的子代理在差 200 毫秒就交结果时被杀掉。现在卸载先关门、再有子代理在跑就等（最多 45 秒，且要静默 1.5 秒才认为真没活儿了），最后只取消还活着的。窗口内自己跑完的轮次保留自己的结果，不再被盖成"已取消"；会话里的通知会写等了几秒、还剩几个没交；进程收到关停信号则完全跳过这段等待。

- **A cut run keeps the body of what ran / 被砍断的轮次不再交白卷** —
  A run cut before any report existed (unload, deadline, refused result) wrote no task rows and no subagent rows, so the file said nothing about the children that had plainly run, and the next run was told there was nothing to re-drive. Those calls are now recorded as the engine announced them — child id, the task name the call carried, the role and attempt its own label names — and never as anything stronger than the outcome supports: a call that merely completed is not marked verified, so it stays on the re-drive list instead of being skipped.
  / 任何报告都还没产出就被砍断的轮次（卸载、超时、结果被拒），以前不写任务行也不写子代理行，等于对明明跑过的子代理一言不发，下一轮被告知"没有可接着做的事"。现在这些调用按引擎当时播报的样子记下来——子代理 id、这次调用自带的阶段名、它自己的标签点名的角色与第几次尝试——并且绝不写得比结果更硬：只是"完成"的调用不会被标成已验收，因此留在重跑清单里，而不是被跳过。

- **`/grok status` answers "what happened to my run" / `/grok status` 回答"我那轮到底怎样了"** —
  A new switch word on the existing command: `/grok status` writes nothing and reports the last run — its state and why it stopped, what the guard saw, whether a checkpoint can be resumed (with its path), and which tasks are unfinished. It reads the session's own journal plus the newest readable checkpoint file, so it still answers after the process that ran the work is gone. `/grok [on|off]` behaves exactly as before.
  / 原有命令多了一个词：`/grok status` 什么都不写，只报最近一轮——现在什么状态、为什么停下、守卫看到了什么、有没有能接着跑的恢复点（带路径）、哪些任务没做完。它读的是会话自己的日志加上最新的可读恢复点文件，所以干活的那个进程早没了也答得上来。`/grok [on|off]` 行为一字未变。

- **The guard's verdict is in the answer, not only in the panel / 守卫结论进了答案正文** —
  The liveness guard watches child calls and never cancels the workflow, and until now its findings only reached the progress panel, so a reader could not tell a watched run from an unwatched one. Every delivered block, the machine ledger and the rendered report now end with one fixed line: the findings, that no subagent was terminated, and who ended the round — including "nobody cancelled this round" when it finished on its own.
  / 守卫一直盯着子代理、从不取消工作流，但它的发现只出现在进度面板，于是读者分不清"有人看着"和"没人看着"。现在交付块、机器台账、渲染报告都以一行固定结论收尾：几条发现、没有终止任何子代理、这一轮是谁取消的——自己跑完的就说"本轮无人取消"。

- **A checkpoint names the calls it cut / 恢复点记下被砍断时还在跑的调用** —
  The unload checkpoint only listed settled subagent calls, so "what was running and where had it got to" lived and died with the process. The file now carries an `inFlight` section (call number, child id, the last step the host actually observed), and `/grok status` prints it. Left out entirely when nothing was in flight, so an ordinary run's file is unchanged.
  / 卸载时写的恢复点以前只列已经收尾的子代理，"当时在跑什么、跑到哪一步"跟着进程一起消失。现在文件里多一节 `inFlight`（第几次调用、子代理 id、宿主真实看到的最后一步），`/grok status` 会把它念出来。没有在跑的就不写这一节，普通轮次的文件因此一字未变。

- **The round ledger can be corrected without rewriting it / 轮次台账可以更正，但不必改旧账** —
  A round that dies cancelled stayed on the ledger as the latest verdict on that work even after a later round finished it. Writing a correction used to mean editing the old row, which an append-only ledger must not do. A round that carries earlier unfinished work through now appends one `superseded: A was carried through by B` entry, and both `memory recent` and the digest mark the old round with `superseded by: B`. A failed round supersedes nothing — it repeats it.
  / 一轮以"取消"收场，后来另一轮把活干完了，台账里那条旧的仍然是"最新结论"。想更正就得改旧行，可只增不改的台账不能这么干。现在把旧活接着做完的那一轮会追加一条 `superseded: A 被 B 接过`，`memory recent` 和摘要都会在旧行上标 `superseded by: B`。失败的一轮不算接过——它只是重来一遍。

### Fixed / 修复

- **A stopped run no longer calls "zero tasks" a clean sweep / 停下的一轮不再把"零个任务"说成全部做完** —
  A run cut before the plan produced anything said "已经做完 0 项，没有剩下的。" / "All 0 item(s) were finished, with nothing left over.", which reads as success over no work at all. Found by the isolated soak: the tally now has three cases, and zero is its own — nothing had produced a result yet. The same sentence also ran its English clauses together ("…not a manual stop.All 1 item(s)…"), so the parts are now separated. Both are pinned by tests.
  / 计划还没产出任何东西就被砍断的一轮，会说"已经做完 0 项，没有剩下的。"——读起来像零活儿全过。这是隔离真机 soak 发现的：战果统计现在分三种情况，零个就是零个，说"还没跑出任何一项任务的结果"。同一句英文的三个分句以前连在一起（"…not a manual stop.All 1 item(s)…"），现在分开了。两条都补了用例钉住。

## [0.13.22] - 2026-11-24

### Fixed / 修复

- **The workflow switch opens again in the composer / 工作流总开关又能打开了** —
  Every request from the settings-page switch answered as a server error — the red "the mode service did not answer: cannot get property sessions without inject" line — so the switch could not be turned on at all. The route asks the Host for the live-session store on each request (so a store that mounts later still answers), but it asked by reading a property the composition never injects, and the runtime refuses that read by throwing rather than returning nothing; the refusal escaped before the fallback lookup and was reported as an internal error. The route now falls back to the runtime's own service lookup when the direct read is refused, the same way the settings page and the team engine already do. Covered by a regression test that reproduces the runtime's refusal instead of a plain stand-in.
  / 设置页那个开关每次请求都回一个服务器错误——也就是红字"模式服务没有回应：cannot get property sessions without inject"——结果开关根本打不开。这条路由每次请求都去问宿主"会话仓库"在哪（这样晚一步挂载的仓库也照样能应答），但它用的是"直接读属性"的姿势，而运行时对这种没注入的服务不是返回空、而是直接报错；报错在备用查询之前就抛出，于是被兜底成一个内部错误。现在直读被拒时会退到运行时自己的服务查询，跟设置页、任务引擎早已采用的做法一致。补了一条回归测试，用"会真的报错"的替身复现运行时的拒绝，而不是用普通对象蒙混过去。

## [0.13.21] - 2026-11-23

### Fixed / 修复

- **A fallback run that verified everything names its degraded plan / 降级跑完全部验证会自报降级** —
  A partial run with every task verified used to say "0 not done", which read as a clean run while the status said partial. It now says all items are usable but the plan ran degraded, so the reader knows why the status is not completed.
  / 以前部分完成但全验过会说"0 项没做成"，读着像全过了，可状态却是部分完成。现在明说"全可用、但计划是降级后跑完的"，读者知道为啥不是完成。

- **The plugin source marker lives in one place / 插件来源标记只剩一处定义** —
  Three files hardcoded the same marker string while one constant already owned it, so renaming the marker would have silently split the gate, the history filter and the carry-over filter. All three now reference the constant, which is pinned by a test.
  / 三个文件各写一遍同样的标记字符串，明明已有常量拥有它；改名会悄悄拆散门禁、历史过滤和摘要过滤。现在三处都引用常量，常量被测试钉死。

- **A digest that drops rows inside a round now says so / 摘要轮内丢行会自报** —
  Only wholly dropped rounds were named; lines dropped inside a kept round vanished silently, so a reader mistook a budgeted digest for a complete one. Each kept round now ends with its own `+N more` marker when rows were cut, with the same overflow accounting as the round-level marker.
  / 以前只有整轮被丢才点名，轮内被吞的行悄悄没了，读摘要的人会把"预算内"当"完整"。现在每轮末尾自报吞了几行，记账方式和整轮标记一致。

- **A removed key now says it was removed / 已删的键会自报"删了"** —
  A patch carrying a removed key only heard "unknown", with no hint the key once existed and was deleted. Removed keys now refuse with their name and the fix (delete it from the patch); genuine typos still get the did-you-mean hint.
  / 带着已删键的补丁以前只听到"未知"，不知道这个键曾经存在还被删了。现在已删键自报名并给解法（从补丁里删掉）；真拼错的还是给纠错提示。

- **The READMEs stop listing removed keys as settable / 说明书不再把已删的键写成可配值** —
  Both READMEs listed `switchOn=[]` and the gate switch as fixed values; all five keys were removed and a stored value is now rejected as unknown. The row now names each removed key with its removal noted, so nobody copies a dead value into a patch.
  / 两份说明书都把 `switchOn=[]` 和闸门开关写成固定值，但这五个键早删了，存了会被当未知键拒绝。现在改成点名已删，照抄也不会抄到死值。

- **Two stale comments now tell the truth about the gate / 两处过期注释改说实话** —
  Two comments still described the removed gate switch (`returns false`, `decide whether the gate exists`); the gate always runs since round-54 and a hookless runtime fails the load. Comments corrected; no behavior changes.
  / 两处注释还写着已删除的开关（"返回否"、"决定门在不在"）；门从 round-54 起常开，无钩子就加载报错。注释改对；行为不变。

- **Stopping the steward clears the floor / 管家打烊即清场** —
  Stopping only flipped the switch while reads still served stale rows (plus overlay patches) from the dropped handle. Stop now drops the overlay and the board handle, so reads after stop are empty and a restart reloads persisted truth through resume.
  / 打烊以前只关开关，读数还摆着旧货。打烊现在连货架带贴纸一起撤，停后读数为空，重启走 resume 读持久真相。

- **The steward session now runs on the durable board / 管家会话换上持久板** —
  The session kept its own memory map plus a home-made JSON file; it now holds the durable board and reads it through the adapter, with one unified file format. Truth (`id`/title-on-create/status/owner/detail) lives on the board; the two fields the board has no column for ride along in memory and are documented as such. Nothing is silently dropped.
  / 会话以前自带内存表加自制 JSON 文件，现在换上持久板、经转接头读写，文件格式统一成一种。真相字段落板，板上没列的两字段放内存随行并写明，不悄悄丢字段。

- **The board plugs into the dispatcher through a small read adapter / 板子通过小转接头插进调度** —
  The adapter turns the store's not-found throw into an empty read and translates the two status words the dispatcher never had (`in_progress` → started, `failed` → stuck with its reason); every other store error keeps throwing. The session still owns its own board — swapping it onto the durable store is the next step.
  / 转接头把板子的"查无"抛错翻成空读，并翻译调度原来没有的两个状态（进行中→已开始，失败→卡住且带上原因）；其它板错照样抛。会话暂时还管自己的板，换持久板是下一步。

- **The task board answers presence checks and the docking note tells the truth / 任务板支持存在检查，对接注释不再撒谎** —
  The docking note claimed the store already satisfied the reader (`get`/`has`), but the board had no `has` and its `get` throws instead of returning empty. The board now answers `has` without throwing, and the note states the remaining gap honestly: pointing the session at the store still needs a small adapter that turns the not-found throw into an empty read (next round's work).
  / 对接注释说板子已经满足读数器，但板子连 `has` 都没有，`get` 还是抛错而非返回空。现在板子支持不抛错的存在检查，注释也说实话：把会话指过去还差一个把抛错转成空读的小适配器（下轮做）。

- **A runtime without the pre-step hook fails the load instead of degrading silently / 没有前置钩子的环境加载即报错，不再悄悄降级** —
  The gate claimed to fail closed but a runtime without `agent/pre-step` only warned and let the main model answer directly. The missing hook now fails the load loudly with its reason, so a broken composition surfaces at install time instead of running unguarded.
  / 门上写着"关不住就拦"，但没钩子的环境只警告一句就放行，主模型直接作答。现在缺钩子就加载报错点名原因，坏编排在装机时就暴露，不会裸奔。

- **The guardian route refuses blanks, wrong types and unknown fields / 守护路由拒收空白、错类型与未知字段** —
  A blank model loaded as configured, a non-string field was stringified silently, and an extra field was read past and dropped. Like the role chains, non-string fields are now refused with their shape named, both fields are trimmed, a model that trims to empty means unconfigured, and an unknown field names itself with the accepted keys.
  / 空白模型会被当成已配置、非字符串字段被悄悄转字符串、多余字段读过就丢。现在和角色链一样：非字符串直接拒收并点名类型，两字段都去空格，空格模型视为未配置，未知字段自报名并给出合法键。

- **Flat cookie credentials are redacted too / 扁平 Cookie 凭证也脱敏** —
  Only the `Cookie:` header form was redacted; the JSON key form (`{"cookie":"…"}`) and the bare form (`cookie=…`) leaked verbatim, even though a cookie value is a session credential by itself. The key tables now name `cookie` next to `session`, so all three shapes redact; ordinary prose about cookies is untouched.
  / 以前只有 `Cookie:` 头形会脱敏，JSON 键形和裸 `cookie=` 会原样漏掉——Cookie 值本身就是会话凭证。现在键表里加上 `cookie`，三种形状都脱敏；聊 Cookie 的普通文字不受影响。

- **The stale ten-minute timeout constant is gone / 过期的十分钟超时常量已删除** —
  The 600,000 ms constant no longer bounds anything (every live path uses the 7,200,000 ms default); only its doc link and a test import still named it. The dead export is deleted and the docs point at the live default. No behavior changes.
  / 60 万毫秒那个常量早就不起作用了（所有活路都走 720 万默认值），只剩文档链接和测试 import 还念着它。现在删掉死导出，文档指向活的默认值；行为不变。

- **The single-wave reason uses the same path rule as the scheduler / 单波原因与调度用同一套路径规则** —
  The report side lowercased nothing and never resolved `..`, so `SRC/A` vs `src/a` read as independent and `a/../b` vs `b` read as independent, while the scheduler serialized the first pair and merged the second. The report now normalizes through the scheduler's own rule, so the sentence names the same cause the run acted on.
  / 报告侧原来不分大小写也不消 `..`，`SRC/A` 对 `src/a` 判成独立、`a/../b` 对 `b` 判成独立，而调度侧一个串行一个合并。现在报告走调度同一套归一，写出来的原因和实际跑的一致。

- **One guardian sweep reads each heartbeat once and judges independent of order / 守护单轮扫描只读一次心跳，判定不再随顺序翻转** —
  One sweep read every file heartbeat twice and judged children in insertion order while progressively raising the run-silence baseline, so an early child never saw a later child's fresh beat and the signal flipped with order. The sweep now snapshots every beat and the global baseline first, then judges without calling any reader; each source is read once per child.
  / 以前单轮扫描把每个文件心跳读两遍，还边判边抬基线，先判的孩子看不到后孩子的 fresh 心跳，结论随插入顺序翻转。现在先把所有心跳和全局基线快照好，再统一判定不再调读数器；每种心跳每轮每孩子只读一次。

- **A hung child can no longer wedge the wave when the realm has no timer / 无定时器环境下 hung 子调用不再卡死整波** —
  Without `setTimeout` or `Atomics.waitAsync` the child race awaited bare, so a hung child wedged the wave and every replan boundary after it. The no-timer path now watches settlement on the host clock within the run/child budget and rejects with the same timeout prefix, so the task retries instead of wedging. With no readable clock or no budget the call stays bare rather than hanging on an unreadable deadline.
  / 没有定时器时子调用是裸等的，一个 hung 住的子调用会卡死整波和后面的重规划边界。现在无定时器路径在运行/子预算内盯着宿主时钟看，超时用同一前缀判停走重试；实在没时钟或没预算才保持裸等，不拿读不出的期限去挂死环境。

- **Restored evidence no longer aliases the checkpoint / 恢复的证据不再与检查点串改** —
  The restore plan shallow-copied the evidence array but shared its items, so editing a restored citation rewrote the validated checkpoint behind it. Evidence items are now copied per item; outputs/files stay as they were (plain strings need no deeper copy).
  / 恢复计划只拷了证据数组没拷里面的条目，改恢复后的引用会串改已校验的检查点。现在每条证据单独拷一份；输出和文件本来就是纯文字，保持原样。

## [0.13.20] - 2026-11-23

### Fixed / 修复

- **A ledger that cannot render says so instead of vanishing / 账本画不出时会直说，不再悄悄消失** —
  A report whose routing carries a dirty chain still refuses inside the ledger renderer, but both the direct delivery and the relay path dropped the ledger silently, which read as a healthy run with no routes. The ledger now stays present as an explicit unavailable marker pointing at the canonical structured result; the human answer is untouched and nothing is thrown.
  / 路由里带脏数据的报告在账本渲染器里照旧拒绝，但直接交付和转交两条路都把账本悄悄丢掉，读起来像"本来就没路由的健康轮次"。现在账本会留下一句明确的"不可用"标记并指向结构化正本；人话答案不受影响，也不抛错。

## [0.13.19] - 2026-11-23

### Fixed / 修复

- **An overlong machine ledger ends at a whole line with the shared marker / 超长机器台账在整行处收尾并用统一标记** —
  The ledger tail was a bare UTF-16 slice at exactly 8,000 characters with a one-character marker the canonical report never uses: the cut could land mid-line, and a cut inside an emoji left a replacement box. The ledger now ends at the last line boundary inside the budget, fences the cut through the surrogate-safe cutter, and carries the same truncation marker the canonical report uses.
  / 机器台账超长时原来是裸切 8000 字加一个省略号，正式报告从不用这个标记：切口可落在行中，切进 emoji 会留下乱码框。现在台账在预算内最后一个整行处收尾，切口走防乱码切割，并带上与正式报告同一句截断标记。

- **Truncated report rows say how many more / 报告截断处写明还剩几行** —
  Both report dialects silently dropped every confirmed/incomplete row past the first 12, so a reader mistook a cut list for a complete one. The first 12 rows still render, followed by one `- … +N more` marker line naming the remainder.
  / 两版报告超过 12 条的已确认/未完成行会静默丢失，读者会把砍过的清单当成完整的。现在前 12 条照常显示，后面加一行 `- … +N more` 写明还剩几行。

- **The machine ledger keeps the blocked task's reason / 机器台账不再丢 blocked 任务的原因** —
  `renderReport` printed the `incomplete` reason for both failed and blocked tasks, but the machine ledger only printed it for failed ones, so the durable copy lost "did not run" and the upstream cause for every blocked task. The ledger now prints the same line for blocked tasks, with no invented category.
  / 正式报告对失败和被堵住的任务都会写 `incomplete` 原因行，但机器台账只给失败任务写，被堵住的任务在存档里丢了"没跑成"和上游原因。现在台账对被堵住的任务写同一行，不编造分类。

- **Slack token redaction covers every token family / Slack 令牌脱敏覆盖全系前缀** —
  The `slack-token` rule only matched five prefixes (`xoxb/p/a/r/s`), so newer families such as `xoxc`/`xoxd`/`xoxo` leaked verbatim into reports and prompts. It now matches any single lowercase letter after `xox`. Ordinary prose without a token shape is untouched.
  / `slack-token` 规则原来只认五个前缀（`xoxb/p/a/r/s`），`xoxc`/`xoxd`/`xoxo` 等新前缀会原样漏进报告和提示词。现在 `xox` 后面任何一个小写字母都认，没有令牌形状的普通文字不受影响。

### Fixed / 修复

- **The workflow switch answers over GET, and a store that arrives late no longer blanks it / 总开关改用 GET 也答，晚到的会话服务不再把开关变空白** —
  Two more causes of the reported `HTTP 405` are closed on the plugin side. The route used to require `webServer` + `connection` + `sessions` all at mount time; a composition that reaches the live-session store later (or only through `ctx.get('sessions')`) mounted nothing, so the browser's POST fell through to the Host and came back as an empty-body 405 with no plugin sentence attached. The store is now resolved per request, a composition with no store answers `503 mode/unavailable` instead of a misleading missing-session 404, a read is also accepted over `GET ?action=status&sessionId=…` (a write over GET is refused with 405), and a refused method is logged with the method and URL that produced it. The switch retries one refused read over GET and names the refused method instead of reporting the route as silent, so a proxy that only allows GET costs a round-trip instead of the button's state.
  / 报过的 `HTTP 405` 又在插件侧关掉两个成因。以前路由挂载时必须同时具备 `webServer` + `connection` + `sessions` 三个服务：某些编排里会话服务晚到或只能通过 `ctx.get('sessions')` 拿到，于是路由根本没挂上，浏览器的 POST 落到宿主 fallback，回一个空包体 405、不带任何插件侧说明。现在会话服务改成按请求现取；确实没有会话服务时回 `503 mode/unavailable`，不再误报"没有这个会话"的 404；读取也可以用 `GET ?action=status&sessionId=…`（用 GET 写会被 405 拒绝）；被拒的方法会连方法和 URL 一起写进日志。开关遇到读取被拒会自动改用 GET 重试一次，并在彻底失败时点名"方法被拒"，不再只说"服务没回应"——只放行 GET 的代理从此只多花一次往返，不会让开关一直空着。

### Added / 新增

- **The progress page draws one rail instead of one cross-stage run per stage / 进度页跨阶段的线合并成一根** —
  On the 2026-11-21 request ("too many cross-stage lines, merge them into one"), the band's wires now share a single elbow lane and a single channel: every owner still drops from its own ring and keeps its own card stubs, but the vertical run is drawn once as one rail that reaches the deepest card, instead of one lane plus one channel per owner. The band's top margin follows the one lane, so the cards keep their left edge and the gutter width is unchanged.
  / 按 2026-11-21 的诉求（"跨阶段的线太多，合并成一根"），进度带里的连线现在共用一条弯道和一条竖槽：每个环节照旧从自己的圆点往下接、照旧保留各自的卡片短线，但竖线只画一次、成为一根连到最深那张卡的公共轨，不再每个环节各占一条弯道加一条竖槽。带子的上边距跟着这一条弯道走，卡片的左边距和整条槽宽都没变。

## [0.13.18] - 2026-11-23

### Fixed / 修复

- **Cancel-path progress test no longer races startup IO / 取消路径的进度测试不再跟启动 IO 赛跑** —
  The `closes the node as cancelled` test aborted on a fixed 10 ms sleep, but the resume scan added ~12 ms of startup IO: on a slow runner the abort lands before the engine starts, which takes a no-events path and the assertion reads `undefined.type`. The test now polls for the worker's first child call (up to 10 s) and only then aborts, so the cancel always lands mid-run. No production code changed.
  / "调用方取消即关节点"用例原来睡死 10 毫秒就取消，但续跑扫描给启动加了约 12 毫秒 IO：慢机器上取消落在引擎启动之前，走无事件路径，断言读到 `undefined.type`。现在用例轮询等到第一个子调用出现（至多 10 秒）再取消，取消永远落在运行中。生产代码未动。

## [0.13.17] - 2026-11-23

### Added / 新增

- **Persistent team dispatch layer: taskboard + dispatcher + handoff contract / 常驻团队调度层：任务板 + 大管家 + 交接契约** —
  The plugin grows the first half of a long-running team manager on top of the existing plan → execute → verify → retry → synthesize chain (which keeps working unchanged). `src/taskboard/` persists the scheduling truth (globally unique task ids, CAS claims, status/owner/dependency/version, atomic jsonl store, restart recovery). `src/dispatcher/` is the resident L1 steward: it only records, dispatches and reclaims — four whitelisted ops (create / update-pending / reassign / mark-blocked) and three hard refusals (editing completed or running tasks, writing the verifier's verdict). `src/handoff/` fixes the four-line contract (conclusion / evidence pointers / open questions / next steps), rejects bare-text self-reports, and renders it into the report in both languages.
  / 插件在现有主链（规划→执行→核验→重试→汇总，原样可用）之上长出常驻团队管理的上半身。`src/taskboard/` 落盘调度真相（任务 id 全局唯一、CAS 认领、状态/归属/依赖/版本、原子 jsonl 存储、重启可恢复）。`src/dispatcher/` 是常驻大管家：只记事分派回收——四项白名单（新增/改未开始/重派/标阻塞）+ 三项硬拒绝（改已完成、改正在跑、改核验结论）。`src/handoff/` 固定四行交接契约（结论/证据指针/未决问题/下一步），拒绝裸文字自述，并双语渲染进报告。

## [0.13.16] - 2026-11-23

### Added / 新增

- **A missing workflow-switch route now warns instead of failing silently / 总开关路由没挂上时给出告警不再静默** —
  The 405 root cause: the settings-page switch only sends `POST /grok-workflow/mode`, the plugin only answers POST on that exact route, but when the Host composition lacks the `webServer` service the route is never mounted and the browser hits the Host fallback (empty-body 405) instead. The mount now logs a warning naming the missing service, so the next "the mode route answered HTTP 405" can be told apart from a real method mismatch; the `mode-surface` suite pins the warning alongside the 20 passing handler tests.
  / 405 的根因：设置页开关只发 `POST /grok-workflow/mode`，插件也只在这个精确路由上收 POST，但宿主编排里缺 `webServer` 服务时路由根本没挂上，浏览器打到的是宿主 fallback（空包体 405）。现在挂载失败会打一条点名缺失服务的 warn，下次再看到"the mode route answered HTTP 405"就能分清是路由没挂还是真的方法不对；`mode-surface` 套件在 20 个 handler 测试之外把这条 warn 也钉住了。

- **A crashed run now resumes from its checkpoint / 崩掉的活现在能从存档接上** —
  The plugin wrote a checkpoint file for every run but never asked it whether to re-drive unfinished work (`RESUME_DECISION_WIRING.wired` was `false` with no production caller). On startup `runWorkflow` now scans the run's checkpoint directory for a file that answers `resume` — newest first, torn or foreign files skipped, `completed` / possibly-live `running` files ignored — and only for the same session, so one chat's crash never seeds another chat's run. A hit travels as the new run's carry-over context (the interrupted run's digest plus its unfinished task ids), so the planner sees what was done and which tasks are still open; an explicit caller `carryover` still wins, and a missing or unusable checkpoint simply starts fresh. No engine-level resume is claimed: the engine still journals nothing, the new run re-drives rather than restores.
  / 插件以前每轮都写 checkpoint 文件，却从没问过它"要不要把没干完的活捡起来"（`RESUME_DECISION_WIRING.wired` 是 `false`、没有生产调用方）。现在 `runWorkflow` 启动时会扫一遍 checkpoint 目录找答 `resume` 的文件——按最新优先、坏文件和陌生文件跳过、`completed`/可能还活着的 `running` 不碰——而且只认**同一个会话**的，别人的崩溃不会串进你的新活。命中后把中断那轮的摘要和没干完的任务 id 拼成新轮的 carry-over 上下文，规划器一眼看到哪些已做、哪些还开着；调用方显式传的 `carryover` 照样优先，没文件或文件不可用就照常新开。这不是引擎级恢复：引擎依然什么都不记，新轮是重跑而不是复活。

- **Mid-run replan has a visible settings switch (still off by default) / 跑中并入活计划有了设置页可见开关（默认仍关闭）** —
  `replan` was already an accepted key but had no schema declaration and no settings-page row, so a saved value behaved differently from what the page showed. The key is now a declared volatile boolean with a bilingual description, and the settings page's *Repeat runs* group shows a switch for it (Chinese: 跑中并入活计划), shaped exactly like the repeat-run switch. The default stays `false`: an unset run still answers a mid-run message in its own round, and joining a run at a wave boundary stays opt-in because every boundary spends one planner-route call (at most `min(waves, 4)` per run). A stored `true` travels through the schema and `resolveConfig` unchanged; a non-boolean is refused at load.
  / `replan` 以前是"认但不显示"的键：配置面接受它，但 schema 里没声明、设置页上也没这一行，存了值跟页面显示的不一致。现在它是声明过的 volatile 布尔键（带中英双语说明），设置页"自动接着干"分组里有同形状的可见开关（中文名"跑中并入活计划"）。默认值仍是 `false`：不填时跑中消息照旧另起一轮；下个波边界并入活计划仍是手动 opt-in，因为每个边界要花一次规划调用（每轮至多 `min(波数, 4)` 次）。存过的 `true` 会原样经过 schema 与 `resolveConfig` 生效；非布尔值在加载时拒绝。

### Changed / 变更

- **The progress page drops the permanently empty "Answer" cell / 进度页删掉永远空着的"回答"格** —
  The progress spine listed an `回答` / `Answer` stage that no workflow event can ever fill: the track only folds `tool-workflow/*` child-call events, while the final answer is delivered by the gate (`relayText`) in the turn's own message — the script emits `phase('plan' | 'execute' | 'synthesize')` but never an answer child call. The cell therefore read `pending` on every run, including completed ones, which looked like unfinished work. The spine now ends at `汇总` / `Synthesize`; the six cells are `起点 → 规划 → 执行 → 检查 → 汇总 → 终点`. A `回答`-labelled event arriving from another bundle still renders as its own node instead of being silently dropped.
  / 进度条上一直有个"回答"格，但没有任何工作流事件能填满它：轨道只折叠 `tool-workflow/*` 子调用事件，而最终答案是门禁在回合消息里直接发的（`relayText`）——脚本只发 `phase('规划'|'执行'|'汇总')`，从没有"回答"子调用。所以这个格子每轮都是"待开始"，连跑完的轮次也像没干完。现在脊柱止于"汇总"，六个格是"起点 → 规划 → 执行 → 检查 → 汇总 → 终点"。若别的 bundle 发来带"回答"标签的事件，仍会照常独立成节点，不会吞掉。

- **The run deadline now defaults to unlimited / 运行死线默认改为不限时** —
  `timeoutMs` previously defaulted to `3_600_000` (60 minutes): an unset run armed a one-hour timer and was cancelled at the deadline. The default is now `0` (no timer is armed), so a run has no deadline unless the caller sets one — the settings page shows `0` with "unlimited" wording in both languages, and the `0` = unlimited behaviour everywhere else (waiting, guardian budget, checkpoint omission, report line) is unchanged. Set `timeoutMs` explicitly to restore a bound.
  / `timeoutMs` 过去默认 `3_600_000`（60 分钟）：不填就自带一小时计时、到点取消。现在默认改为 `0`（不设 timer），不填就是不限时——设置页显示 `0` 并用中英两语写明"不限时"，其余各处的 `0` = 不限时语义（等待、守卫预算、checkpoint 省略、报告行）保持不变。需要设限就显式填写 `timeoutMs`.

## [0.13.15] - 2026-11-23

### Fixed / 修复

- **The summarizer no longer dies on a prose-only answer / 汇总不再因一句话没交表就死** —
  The synthesizer child sometimes answered in prose without calling the structured result tool, and the run recorded `format-error: child returned no valid structured result` with no retry: the narrative was written but never submitted. Both Polish prompts now demand the tool call (`{"summary": "<narrative>"}` exactly once), and the script resubmits once on the same attempt when the first call carries no structured value — borrowing the worker's resubmit pattern, so a child that already holds the narrative only pays one short submit call instead of losing the whole polish. A resubmit that still misses keeps the original error.
  / 汇总子代理有时只回正文、没调交稿工具，整轮就记一笔格式错、连重交机会都不给：稿子写好了但没交上来。两套润色提示词现在都写明必须调一次交稿工具（`{"summary": "<稿子>"}`），第一下没交上时脚本在同轮内再叫一次——跟工人的重交一个路数，稿子已经在手里，只补一次交表，不重写、不花重试次数。重交还没交上就保留原错。

## [0.13.14] - 2026-11-22

### Fixed / 修复

- **Sessions no longer corrupt on restart when the plugin is installed / 装了插件的会话重启不再损坏** —
  Any session the plugin touched used to fail to reopen after a DSH restart with `stored session … is corrupt: system/message requires a protected first surface head`. The gate wrote the user's message to the surface before the host's own system head on fresh sessions, so the stored log was poisoned from the first turn and every later reopen threw. The gate now publishes only onto an established surface; on a headless first turn the message rides the normal enter path and lands after the head, exactly once. Cancelled turns follow the same rule, so a cancelled first turn can no longer poison a later turn either. Sessions already corrupted by the old build cannot be repaired by this update; new sessions stay clean.
  / 凡是插件碰过的会话，DSH 重启后都打不开（`stored session … is corrupt: system/message requires a protected first surface head`）。根因是插件在新会话首轮抢在宿主系统头之前先写了用户消息，存档从第一轮就被写坏，之后每次重开必炸。现在插件只在已立稳的 surface 上预发布；无头首轮的消息走正常进场流程、落在系统头之后，且只出现一次。取消走同一规则，首轮取消也不会再污染后续轮次。旧版本已写坏的会话本版修不了；新会话不再写坏。

## [0.13.13] - 2026-11-22

### Fixed / 修复

- **A numbered plan task keeps its own card even when its title mentions a stage word / 带编号的计划任务即使标题含阶段词也独立成卡** —
  A plan task whose title contains a stage word (e.g. `任务 7 · 合并为干净可并发执行计划` carries `执行`) used to be swallowed by the spine's `执行` segment and rendered as a stage row under `规划` instead of its own `任务 7` card. Numbered phases (`任务 N · …` / `Task N · …`) now always win over stage tokens: they render as their own task-band card, and the spine only keeps genuine stage rows.
  / 标题里带阶段词的计划任务（例如 `任务 7 · 合并为干净可并发执行计划` 里带了"执行"）过去会被脊柱的"执行"段收走，在"规划"下面显示成一行阶段行，而不是独立的"任务 7"卡片。现在带编号的 phase（`任务 N · …` / `Task N · …`）永远优先于阶段关键词：它们在任务带里独立成卡，脊柱只保留真正的阶段行。

## [0.13.12] - 2026-11-22

### Added / 新增

- **The main session stays a chat channel while a run works / 跑中主会话仍是可对话的渠道** —
  With `replan` on, a message sent while a run is working is answered at once instead of after the run: the receipt says the demand joined the live plan, that the next wave boundary folds it into the tasks that have not started, that verified work is not redone, and how to stop (`停` / `stop`). Nothing already running is interrupted, and the decision returns before the workflow settles, so the conversation never waits for a run. The demand reaches the planner with a bounded snapshot of the conversation attached, because a short "改成 C" is unanswerable at the boundary on its own. A bare `停` / `stop` / `取消` is the only message that cancels a run; with nothing running it is answered instead of being admitted as a task. A demand still queued when the run settles opens the next round from `previous objective + demand` rather than being dropped.
  / 打开 `replan` 后，跑中发来的消息立刻得到回执，而不是等整轮结束：回执说明这条要求已并入正在跑的计划、下一个波边界把它合进还没开始的任务、已验证的成果不会重做，并给出叫停方式（`停` / `stop`）。已在跑的任务不会被打断，决定在整轮结算前就返回，所以对话不必等工作流跑完。要求会带着一段有边界的对话快照交给规划器——只有一句"改成 C"在边界上是无法解释的。只有裸的 `停` / `stop` / `取消` 才会取消整轮；没有在跑的任务时这句话会被直接回答，而不是被当成任务派工。整轮结束时还没被取用的要求，会用"上一轮目标 + 新要求"开启下一轮，不会丢失。

- **Mid-run demands merge into the live plan at wave boundaries / 跑中需求在波边界并入活计划** —
  With `replan` on, each wave boundary spends at most one planner-route call (at most `min(waves, 4)` per run) to fold queued demands into the tasks that have not started yet: add, update, remove or re-order unstarted tasks and waves. Settled tasks (`verified` / `failed` / `blocked`) are read-only and never re-executed; edits naming a running task are refused and the run keeps its plan. Every merge is recorded in the report (`plan.version` plus a per-boundary ledger row), so a reader sees which version ran and what each merge changed.
  / 打开 `replan` 后，每个波边界最多花一次规划调用（每轮至多 `min(波数, 4)` 次），把排队的要求并进还没开始的任务：新增、修改、删除或重排未启动的任务与波。已结算的任务（`verified` / `failed` / `blocked`）只读、不重跑；点名正在跑的任务的改动会被拒绝，整轮按原计划继续。每次合并都记进报告（`plan.version` + 逐边界台账），读者能看到跑的是第几版计划、每次合并改了什么。

- **The summary passes a draft-check-verify gate, never a single pass / 汇总走起草-检查-复核三步，不过不发** —
  The final narrative is written in at most three drafts (the first plus two rewrites): a deterministic check validates the composed candidate against the report (verdict stated as the report has it, open tasks named, uncertainties kept, command/test ledger carried), then an independent verification re-walks the raw task results with its own walker and recomputed counts. A draft that fails either step goes back to the writer with the finding; only a draft that passes both is delivered. When no draft passes, the deterministic narrative — itself gated — is the answer, and the report says why.
  / 最终结语最多写三稿（首稿 + 两次重写）：确定性检查先按报告验一遍（结论与报告一致、未完成任务点名、不确定性保留、命令/测试台账带上），再由独立复核用自己的走法重走一遍原始任务结果、重算计数。任一步不过就带着原因打回重写；两步都过才发。没有一稿通过时，用同样过审的确定性回退顶上，报告里写明原因。

### Fixed / 修复

- **Red means "still broken now": recovered history clears the aggregate, the failed row keeps its mark, wires stay neutral / 红色只表示"现在还坏着"：恢复后聚合消红、行留痕、线中性** —
  A task that failed one attempt and verified on a retry used to dye its card, its stage, the settle bar and the connecting wire red. Now a failure replaced by a later completed attempt of the same call no longer colours the aggregate (card, segment, settle bar): the badge counts only unrecovered failures, and the connecting wires carry no state colour at all. The failed row itself keeps its red mark, so "it failed once and is fine now" stays visible instead of reading as "the whole round is red".
  / 任务某次失败、重试后通过，过去会把整张卡、整个阶段、结算条和连接线都染红。现在同一调用被后续通过覆盖的失败不再染聚合（卡片、段、结算条）：徽标只数"现在还坏着"的行，连接线彻底不带状态色。失败的那行自己照样留红——"出过一次错、现在全好了"看得见，而不是"整轮都是红的"。

## [0.13.11] - 2026-11-22

### Fixed / 修复

- **Guardian stall budget always follows the per-call budget, default 120 minutes / 守卫判停预算永远跟随单次调用预算，默认 120 分钟** —
  The host Guardian previously fell back to the old 10-minute cap when no guardian route was configured (`guardianModel` empty), so the progress page still showed "600 seconds" even after the per-call budget became 120 minutes. The budget now always follows `childTimeoutMs` (default 120 minutes); a configured route only buys adjudication slices, never changes the budget. The settings hint says so in both languages.
  / 之前没配判停路由（`guardianModel` 为空）时，宿主守卫会退回旧的 10 分钟上限，所以单次调用预算改成 120 分钟后进度页仍显示"600 秒"。现在预算永远跟随 `childTimeoutMs`（默认 120 分钟）；配路由只决定卡住时是否多等两轮裁决，不改变预算。设置页中英提示已写明这一点。

## [0.13.10] - 2026-11-22

### Added / 新增

- **Configurable per-call stall budget, default 120 minutes / 单次调用预算可配置，默认 120 分钟** —
  New `childTimeoutMs` key (settings page shows minutes, 1–120; stored in milliseconds): one `agent()` call runs this long before the run stops waiting on it, while the run deadline still caps the whole run. The old 10-minute default killed healthy slow children; the new 120-minute default always loads, and any stored overrun clamps to it.
  / 新增 `childTimeoutMs` 配置（设置页按分钟编辑 1–120，存毫秒）：一次 `agent()` 调用最多跑这么久，超时只算该次失败走任务重试，整轮仍受运行死线约束。旧的 10 分钟默认会误杀正常慢任务；新的 120 分钟默认直接生效，超限存值钳制到它。

## [0.13.9] - 2026-11-22

### Fixed / 修复

- **An `observe` Guardian finding no longer renders as a run cancellation / `observe` 处置不再显示为整轮取消** —
  The pure fold (`src/progress-tab.ts`) kept the pre-0.13.9 mapping `rescue → rescue, else cancel-run`, so a finding the host records as `observe` (stall seen, workflow deliberately left running) rendered as `已触发整轮取消` / `data-action="cancel-run"`. The fold now follows the bundle's own rule (`rescue → rescue`, `cancel-run → cancel-run`, else `observe`), and the fact type admits all three actions.
  / 纯折叠函数仍沿用 0.13.9 之前的映射（非 `rescue` 一律按 `cancel-run`），宿主记为 `observe`（看到停滞、刻意让工作流继续跑）的处置会被画成"已触发整轮取消"。现已与 bundle 同规则，并补了 `observe` 的回归测试。

- **Guardian recovery no longer interrupts an active child or cancels the parent run / Guardian 自动恢复不再打断正在执行的子代理，也不再取消整个工作流** —
  A liveness timeout now queues one bounded recovery instruction to the affected child session when available, asking it to inspect its current command, checkpoint its progress, and continue the original task. If no rescue channel is available, Guardian records the observation and leaves the workflow running. The configured workflow deadline remains the outer limit.
  / 子代理疑似停滞时，Guardian 会在恢复通道可用的情况下向对应会话排队发送一次有边界的恢复指令，让子代理检查当前命令、保存检查点并继续原任务；恢复通道不可用时只记录异常，不擅自中止工作流。原有工作流总期限仍然是最终边界。

- **Guardian progress monitoring survives incremental view updates / 增量更新时 Guardian 进度监控栏保持正常显示** —
  Preserve the Guardian lifecycle state while the conversation view receives incremental updates.
  / 对话视图增量更新时保留 Guardian 生命周期状态，避免进度页监控栏异常消失。

- **The host watchdog allows the Guardian adjudication window to finish / 宿主看门狗为 Guardian 裁决等待窗口留出时间** —
  Extend the host watchdog budget to cover the script's adjudication and wait window without racing a healthy slow child, while keeping the workflow deadline as the cap.
  / 扩展宿主看门狗预算，使判停裁决和等待窗口能够完成，避免与正常但执行较慢的子代理争抢；预算仍受工作流总期限约束。

## [0.13.8] - 2026-11-22

### Added / 新增

- **A live Guardian lane in the Progress tab / 进度页新增 Guardian 监控侧栏** —
  The tab now records and displays the Guardian's real lifecycle, liveness budget,
  and rescue/cancellation findings. The side lane is separate from task verification:
  a liveness intervention is not a task-quality verdict. The overview and task cards
  use soft mint/sky tints mixed from DSH semantic theme tokens, preserving dark-mode
  and contrast behaviour.
  / 进度页现在会记录并展示 Guardian 的真实生命周期、子任务存活判断预算，以及救援/
  取消处置。监控侧栏与任务核验分开，存活处置不等于任务质量结论。总览和任务卡使用
  DSH 语义主题变量混合出浅薄荷绿与浅青蓝，不固定浅色背景，保留暗色和高对比主题适配。

## [0.13.7] - 2026-11-22

### Fixed / 修复

- **Plan-task cards step in, sort by number, and always show the three gates / 任务卡缩进、按编号排序、三关常显** —
  Cards of the `执行` group step in 16px from the band's edge (the guardian card
  keeps the edge), so the band reads as a hierarchy instead of a flat list. Cards
  sort by the task number their phase header names (`任务 10` after `任务 2`,
  not before it); the guardian card stays after the numbered ones. Every card
  shows the fixed `执行 → 检查 → 复核` chain: a gate no row reached renders as a
  dashed `pending` capsule ("this gate has not run yet") instead of vanishing, so
  "the check never ran" stays visible. Routes, states and behavior are unchanged —
  only order, indent and chain display moved.
  / `执行` 组下的任务卡统一缩进 16px（守卫卡贴边不动），带子有了层级不再是平铺。
  卡片按标题里的任务编号排序（`任务 10` 排在 `任务 2` 后面，不再按事件到达顺序）。
  每张卡固定显示 `执行 → 检查 → 复核` 三关：没跑到的显示为虚线 `pending` 胶囊
  （"这一关还没跑"），而不是直接消失——"检查没跑"这个事实看得见。路由、状态、
  行为都没动，只改了顺序、缩进和链的显示。

## [0.13.6] - 2026-11-22

### Fixed / 修复

- **A stalled child can now be steered instead of killed / 卡住的子任务现在可以被拉回来而不是杀掉** —
  The guardian used to know only one move: cancel the whole run. Now the stall
  adjudicator may answer `rescue` with a guidance line; the script broadcasts it
  on the log channel, and the host interrupts that child and delivers the
  guidance — the child's context is preserved, so it wakes with new instructions
  instead of being retried from scratch. Each rescue is recorded as a `rescue`
  finding, so the spend is auditable. Unlimited by operator decision; a rescue
  that cannot be delivered (unknown child, settled child, missing executor) is
  a contained no-op, never the run.
  / 守卫以前只会一招：整轮取消。现在判停模型可以回答 `rescue` 并附一句引导语；
  脚本在 log 通道广播，宿主打断那个孩子并把引导语递进去——孩子的上下文保留，
  醒来带着新指示继续干而不是从头重试。每次重救记一条 `rescue` finding，
  花了多少有数。按操作员决定不限次数；递不进去的重救（孩子未知/已结算/
  无执行器）是无害空操作，不影响 run。

### Changed / 变更

- **The guardian checks every 10 seconds instead of every second / 守卫从每秒扫一遍改为每 10 秒扫一遍** —
  The sweep only compares in-memory timestamps, so the saving is scheduling, not
  CPU; heartbeats stay event-driven (a phase/log/file/session event refreshes
  liveness immediately), and a stall is discovered at most 10 s later — noise
  against a 10-minute budget.
  / 轮询只比内存时间戳，省的是调度不是 CPU；心跳仍是事件驱动（phase/log/
  文件/会话事件立刻刷新存活），发现卡死最多晚 10 秒——在 10 分钟预算面前是噪音。

- **The guardian asks the child's own session whether it is still talking / 守卫会问孩子自己的会话还在不在说话** —
  Before firing, the guardian reads the child's `subagentTiming` projection
  (`active.through`): a turn that moved within budget means the child is alive,
  no matter what the files say. Only the timestamp travels, never message
  content. Stale or unreadable degrades to the older signals, never to a false
  alive. This also covers planner-built plans, which have no caller plan to map
  write paths back to.
  / 开火前守卫读孩子自己会话的 `subagentTiming` 投影（`active.through`）：预算内
  有动静就是活着，不管文件动没动。只取时间戳不看内容。stale 或读不到退回
  老信号，不做假保活。这也覆盖了 planner 现场编的计划（宿主无 caller plan 可
  反查写路径）。

## [0.13.5] - 2026-11-22

### Fixed / 修复

- **The three composer switches sit left of the model selector / 三个开关搬到模型选择器左边** —
  Auto-continue, self-iterate and the workflow switch lived in the ambient strip
  under the composer (`conversation.composer.dock`), whose render gate hides it in
  a new session's hero composer — so the switches vanished exactly when a user
  most needed them. All three now register in the tool row's own `list` slot
  (`conversation.input.right`), rendered immediately before the model selector; the
  row's gate is the selector's own (`sessionId !== undefined`), so the switches
  appear in new sessions too. Routes, state and behavior are byte-identical —
  only the mount point moved.
  / 自动接着跑、自迭代、workflow 总开关原来挂在对话框下面的环境条
  （`conversation.composer.dock`），新会话时那条不渲染，开关正好在最需要的时候
  看不见。现在三个都改挂工具行自己的 `list` 位（`conversation.input.right`），
  紧贴模型选择器左边；工具行的显示条件就是选择器自己的（有 session 就显示），
  新会话也有。路由、状态、行为逐字节没变，只换了挂载点。

## [0.13.4] - 2026-11-22

### Fixed / 修复

- **A working child is no longer killed as stalled / 正在干活的子任务不再被当成卡死杀掉** —
  The resident guardian judged liveness only from `agent-start`/`agent-end`, so a child doing
  real slow work (a long build, a broad test sweep, writing evidence files) looked identical to
  a wedged one and the whole run was cancelled at the 10-minute budget. Three signals now feed
  the verdict: (1) the run's own `phase`/`log` narration counts as run-level liveness, so a quiet
  child beside a narrating run is its own lone stall, not a silent run; (2) a task's declared
  `writesPaths` are watched for mtime movement — fresh file activity keeps that child alive past
  the budget; (3) the stall-adjudication prompt carries the task's declared paths, so the judge
  knows what files a living child should be touching. Children of planner-built plans (no
  caller plan to map phases back to) keep the old budget-only rule — never a false alive.
  / 宿主守卫原来只看 `agent-start`/`agent-end` 判存活，干慢活的孩子（长构建、大测试扫、写证据文件）
  和真卡死的长得一模一样，到 10 分钟预算整轮被杀。现在三个信号一起判：(1) run 自己的
  `phase`/`log` 叙述算 run 级存活，run 在说话时安静的孩子只是自己的 stall，不是整轮沉默；
  (2) 盯着任务声明的 `writesPaths` 看 mtime，文件在动就保活；(3) 判停 prompt 里带上该任务的
  声明路径，裁决者知道活着的孩子应该在碰哪些文件。planner 现场编的 plan（宿主没有 caller
  plan 可反查）走旧规则——不做假保活。

## [0.13.3] - 2026-11-22

### Fixed / 修复

- **`Authorization` headers are redacted whatever the scheme / 任意 scheme 的 `Authorization` 头都会被脱敏** —
  The rule list knew only `Bearer` and `Basic`, so `Authorization: Token …`, `ApiKey …`, `Digest …`,
  `OAuth …` and a bare opaque value passed verbatim into report bodies, history text, gate answers,
  records and memory archives. One added rule (`authorization-other-scheme`, `src/redact.ts`) covers
  every other scheme and the scheme-less case as a header line and as the JSON key form, keeps the
  header name so the redacted line still says what leaked, and leaves `Authorization: none` /
  `required` / `[REDACTED]` and prose about the header untouched. No existing rule was weakened.
  / 规则表原来只认 `Bearer` 和 `Basic`，`Authorization: Token …`、`ApiKey …`、`Digest …`、`OAuth …`
  以及不带 scheme 的裸值会原样进入报告正文、历史文本、gate 应答、记录和记忆归档。新增一条规则
  （`authorization-other-scheme`，`src/redact.ts`）覆盖其他所有 scheme 与无 scheme 的情况，行内头和
  JSON 键值两种写法都管，并保留头名让脱敏后的行仍说明漏了什么；`Authorization: none` / `required` /
  `[REDACTED]` 与正文里提到该头的句子不受影响。未削弱任何既有规则。

- **A failure row uses the block's own separator / 失败行分隔符跟随该块的语言** —
  `Not done:` rows were built with a hard-coded full-width colon, so an English reader saw
  `- Hotel price：the source refused the request` — two punctuation systems in one sentence. The
  separator now comes from the same `zh` flag the rest of the human block uses (`：` / `: `); the
  Chinese block is byte-for-byte unchanged.
  / `Not done:` 的行原来写死全角冒号，英文读者会看到 `- Hotel price：the source refused…`，
  一句话里两套标点。分隔符现在取自人话块本来就有的 `zh` 标志（`：` / `: `）；中文块逐字节不变。

- **The machine ledger names the synthesis mode under its own label / 机器台账用独立标签写明合成方式** —
  A run whose model narrative failed printed `Synthesis: model narrative unavailable (…)` and then
  `Synthesis: deterministic`: one label, two facts, so a reader or a parser had to guess which line
  said what. The mode line is now `Synthesis mode: <mode>` and joined `LEDGER_LABELS`, so the human
  block scrubs it like every other field label; the failure note keeps `Synthesis:`.
  / 模型叙述失败的一轮会先打 `Synthesis: model narrative unavailable (…)`，再打
  `Synthesis: deterministic`：一个标签两种事实，读的人或解析器得猜每行说的是什么。方式行改为
  `Synthesis mode: <mode>` 并加入 `LEDGER_LABELS`，人话块像其他字段标签一样把它擦掉；失败说明继续用
  `Synthesis:`。

### Tests / 测试

- **Recovered RSI regression coverage / 补回 RSI 回归覆盖** — Four load-time and delivery invariants
  that `main` had implemented but never pinned now have tests: an unknown provider in `roles.supervisor`
  fails the load (and an all-blank supervisor chain notes it), `resolveConfig` refuses an unknown
  `grokDefault` on the direct-construction path, and a checkpoint records a `durationMs` past the
  16-minute mark instead of dropping it.
  / `main` 已实现但一直没有测试钉住四条不变量，现在补上：`roles.supervisor` 里未知 provider 会在加载时
  报错（全空 supervisor 链给提示）、`resolveConfig` 在直接构造路径上拒绝未知 `grokDefault`、
  checkpoint 会记录超过 16 分钟标记的 `durationMs` 而不是丢弃。

## [0.13.2] - 2026-11-22

### Fixed / 修复

- **A stalled child is judged before it is killed / 判停先判后杀：慢子任务不再被误杀** —
  When a guardian route is configured, the host-side watchdog budget now covers the script's
  child budget plus the full Q8 adjudication window (`GUARDIAN_MAX_WAITS × GUARDIAN_WAIT_MS`),
  still capped at 10 minutes and the run deadline. A healthy-but-slow child is no longer cancelled
  as "no progress" while the script is still inside its wait-or-kill adjudication; the script's
  own verdict lands first, and only then does the host cancel the run.
  / 配了守卫路由时，宿主侧看门狗预算现在覆盖脚本子预算 + 完整的 Q8 判停窗口
  （`GUARDIAN_MAX_WAITS × GUARDIAN_WAIT_MS`），仍受 10 分钟上限与运行死线约束。
  干活慢但健康的子任务，不会再在脚本还在走 wait-or-kill 裁决时被当成"无进展"杀掉；
  脚本自己的裁决先落，宿主只在脚本也放弃后才杀整轮。

- **The progress task band no longer shifts with the current stage / 进度任务带不再随当前环节右移** —
  The band's left indent is now a constant 40px gutter instead of a measured value derived from
  the owning stage's ring centre; attribution comes from the elbow wire (ring → lane under the
  spine → gutter channel → card stub with a right-pointing arrow), not from how far a card is
  indented. Cards starting at the same x whatever stage owns them; wires hidden and the band back
  to 12px under 480px; `data-owner` / `data-gw-progress-wire` / arrowheads / the seven-stage spine
  / card contents all unchanged.
  / 任务带的左缩进从"按所属环节圆环中心量出来"改成常量 40px 左栏；归属靠折线表达
  （圆环 → 脊下车道 → 左栏通道 → 卡片 stub 右向箭头），不靠缩进表达。无论哪个环节拥有卡片，
  卡片都从同一个 x 起步；480px 以下连线隐藏、带子回到 12px；`data-owner` /
  `data-gw-progress-wire` / 箭头 / 七段脊 / 卡片内容全部未动。

### Removed / 删除

- **Delete stale `lib/panel.*` build artifacts / 删除陈旧的 `lib/panel.*` 构建产物** —
  `src/panel.ts` was deleted in `56e701d` (RSI round 32) but its four compiled outputs stayed in
  `lib/`. Zero references in `src/` / `lib/` / `scripts/` / `test/`; not in `package.json` exports;
  superseded by `src/progress-tab.ts` + `src/client/index.js`. Verified: rebuild emits no `panel.*`,
  165 files in `lib/`, module resolution clean, full suite green.
  / `src/panel.ts` 已在 `56e701d`（RSI round 32）删除，但 4 个编译产物留在 `lib/` 里。
  `src/` / `lib/` / `scripts/` / `test/` 零引用；不在 `package.json` exports 内；
  已被 `src/progress-tab.ts` + `src/client/index.js` 取代。已验证：重建不再产出 `panel.*`，
  `lib/` 165 文件，模块解析干净，全量测试绿灯。

- **Remove the duplicated t55 workspace-isolation rule / 删除重复的 t55 工作区隔离规则** —
  `docs/knowledge/evidence/t55/workspace-isolation-rule.md` overlaps `docs/knowledge/TESTING.md`
  at 0.82 (6-gram coverage); the canonical rule lives in TESTING.md.
  / `docs/knowledge/evidence/t55/workspace-isolation-rule.md` 与 `docs/knowledge/TESTING.md`
  的 6-gram 覆盖率 0.82；以 TESTING.md 中的正文为准。

## [0.13.1] - 2026-11-22

### Fixed / 修复

- **Timeout tests pass on Node 22 as well as Node 24 / 超时测试在 Node 22 与 Node 24 下都通过** —
  The script's cooperative timeout is unchanged; only the test's hung child got a 30 s backstop so
  sequential `vm` runs no longer drop the Node 22 runner on teardown.
  / 超时机制本身没动，只给测试里的挂起子调用加了 30 秒兜底，连续 `vm` 运行不再把 Node 22 的
  runner 在收尾时带崩。

## [0.13.0] - 2026-11-22

### Added / 新增

- **Plans run as waves, and a single-wave report says why / 计划按波执行，单波报告写明原因** —
  A plan task may declare `dependsOn`; the longest dependency path decides which wave the task
  belongs to, and a plan is rejected as a whole when it declares more than eight waves
  (`WAVE_LIMIT` in `src/waves.ts`), a dependency that points at its own wave or a later one, an
  unknown id, itself, or a cycle. Every report that ran as one wave now carries a `Wave reason:`
  line (`single-task`, `dependency-chain`, `write-overlap` or `planned`), because "1 wave" alone
  cannot tell a one-line job from a plan whose tasks could not run together.
  / 计划任务可以声明 `dependsOn`，最长的依赖链决定该任务落在哪一波；声明超过八波（`src/waves.ts`
  的 `WAVE_LIMIT`）、依赖指向本波或更晚的波、指向未知 id、指向自己、或成环，整份计划被拒。只跑了
  一波的报告现在会带一行 `Wave reason:`（`single-task`/`dependency-chain`/`write-overlap`/
  `planned`）——只说「1 波」看不出是一行活，还是本该并行却挤成了一波。

- **A downstream task receives what its verified upstream produced / 下游任务拿到上游已验证的产出** —
  A task that declares `dependsOn` gets a bounded digest of what each dependency actually produced
  (2000 characters per dependency, with a cap on the whole block), rendered into the child prompt by
  `upstreamDigestSource()` in `src/upstream.ts`. A dependency that verified with only a prose summary
  produced no artifact — a child's self-report is not verification — so its dependents are failed
  instead of being run against nothing.
  / 声明了 `dependsOn` 的任务会收到每个依赖实际产出的摘要块（单个依赖 2000 字符，整块另有上限），由
  `src/upstream.ts` 的 `upstreamDigestSource()` 渲染进子代理提示词。只留下散文总结、没有产出任何
  凭证的依赖不算交付（子代理的自述不是核验），它的下游任务直接判失败，而不是空着手去跑。

- **A hung child call is settled as a timeout instead of running to the deadline / 卡住的子调用按超时结算** —
  Every `agent()` call now races a timer inside the generated script: a call that loses the race is
  settled as a `timeout` failure, which the existing bounded retry already knows how to continue, so
  one stalled child no longer holds the run until the deadline. The tiers are 120 s for a single
  shell command (stated in the child's own prompt), 600000 ms per task call
  (`CHILD_TIMEOUT_MS` in `src/timeout.ts`), and the configured `timeoutMs` for the whole run —
  unchanged, still the only deadline an operator sets.
  / 生成脚本里的每次 `agent()` 调用现在都和一个计时器赛跑：输掉的一方按 `timeout` 失败结算，交给
  已有的有界重试续跑，一个卡住的子代理不再把整次运行拖到死线。三档是：单条 shell 命令 120 秒
  （写在子代理自己的提示词里）、单次任务调用 600000 毫秒（`src/timeout.ts` 的 `CHILD_TIMEOUT_MS`）、
  以及整次运行沿用配置的 `timeoutMs`——这一档没变，仍是操作者唯一要设的死线。

- **`guardianModel`: a stalled child is judged before it is killed / 判停单路由：先取证再判停** —
  New configuration key, a single route (`{provider?, model?}`, not a chain) for the resident
  guardian: when a child call outlives its task timeout, the judge is asked first, and a `wait`
  verdict extends that call by 300000 ms (`GUARDIAN_WAIT_MS`), at most twice, never past the run
  deadline. Left empty the judge is off and a timed-out call goes straight to the task's bounded
  retry. The configuration surface is sixteen keys from this section on.
  / 新配置键，单条路由（`{provider?, model?}`，不是链）交给常驻监护：子调用超过任务超时后先问判官，
  判 `wait` 就把这次调用延长 300000 毫秒（`GUARDIAN_WAIT_MS`），最多两次，且不越过运行死线。留空
  即不判停，超时直接进任务的有界重试。从本节起配置面是十六个键。

- **Reopening a run inherits what the last round verified / 重开一轮继承上轮已验证的产出** —
  A steering round no longer redoes finished work: it reads the previous round's report back out of
  the transcript and carries a bounded inheritance digest (8000 characters, verified rows first,
  details dropped before the list) into the new plan. A task the last round verified is `retain`ed,
  a task it failed or left `blocked` is `redriven`; cancelling a run keeps `blocked` rows as
  `blocked` instead of rewriting them as failures. Inheritance is a prompt-level constraint — a
  planner that ignores it and redoes retained work is a planner defect, not a silent merge.
  / 转向重开不再重做已验证的工作：新一轮从对话记录里读回上一轮的报告，带一份有界的继承摘要（8000
  字符，已验证清单优先、细节先砍）进新计划。上轮已验证的任务 `retain` 不重跑，上轮失败或 `blocked`
  的任务 `redrive` 重跑；取消整轮时 `blocked` 行保持 `blocked`，不改写成失败。继承是提示词级约束——
  planner 无视它重做了保留工作，那是 planner 缺陷，不会静默合并。

### Changed / 变更

- **Display wording: review, deadline in minutes, task titles in full / 显示层：复核改名、分钟制死线、标题全留** —
  `supervisor` renders as `复核` / `Reviewer` everywhere a reader sees it (internal keys unchanged);
  the run deadline is edited in minutes and stored in milliseconds (`0` = unlimited, default 60 min);
  a plan-task group header shows the whole title (no truncation; the run title keeps its bound) and a
  worker prompt opens with `角色 · 任务标题`; the relay ships the human block by default and only
  attaches the machine ledger when `showDiagnostics` is on, cutting at sentence boundaries.
  / `supervisor` 在读者可见处一律写作`复核` / `Reviewer`（内部键不动）；运行死线按分钟编辑、按毫秒
  存储（`0` = 不限时，默认 60 分钟）；计划任务组标题显示全名不再截断（运行标题仍有上限），子代理
  提示词首行统一 `角色 · 任务标题`；转交默认只给人话块，`showDiagnostics` 开才附机器台账，截断按
  句子边界不断词。

## [0.12.19] - 2026-11-21

### Changed / 变更

- **The Progress tab is the mockup's two tracks: a fixed seven-stage spine and a vertical task band / 进度页改成效果图的双带：固定七段脊 + 竖向任务带** —
  The spine is exactly the seven template stages (`起点`/`规划`/`执行`/`检查`/`汇总`/`回答`/`终点`)
  in one horizontal row, whatever the plan declares: a `任务 n · …` row group is a card in the
  band below, never an extra segment squeezing the seven. Each card is joined to the stage line
  that owns it by a measured trunk and one branch per card (a plan task hangs off `执行`; a row
  whose phase names a stage hangs off that stage), so a running task's connector joins the line
  it actually runs under. Every row keeps its own pill and jumps straight to its child session;
  the card itself, the stage marks and the blank card area are inert. Stage meta lines now carry
  the measured row time and a 3 px rail draws it as length (baseline: the slowest stage of the
  run), and a settle bar groups the declared rows by outcome. Removed: the accordion branch
  panel, the `+N` collapse line, the member cards, and the zoom control (with its stored factor,
  its three copy keys and the `--gw-zoom` multiplier). Failure retry stays deferred (Phase 2),
  and nothing here ships a retry affordance.
  / 脊就是模板的七段（`起点`/`规划`/`执行`/`检查`/`汇总`/`回答`/`终点`），无论计划声明多少任务都横排
  一行：`任务 n · …` 这样的行组是下方带里的一张卡，不再多出一个段去挤那七段。每张卡用实测的干线和
  一支支线接在**拥有它的那条段线**上（计划任务挂 `执行`；phase 本身点名某段的行挂那一段），所以
  运行中的任务接的正是它实际跑在下面的那条线。每行仍保留自己的胶囊，点了直达对应子会话；卡片本身、
  阶段、卡片空白处全部 inert。段的 meta 行现在带实测行耗时，下面 3 px 的条把它画成长度（基线是本次
  运行最慢的一段），顶部结算条按结果分布已声明的行。删掉了：手风琴分支面板、`+N` 收起行、成员卡，
  以及缩放控件（连同它存的倍率、三条文案和 `--gw-zoom` 倍率）。失败重试仍推迟（Phase 2），这次
  没有发布任何重试入口。

### Fixed / 修复

- **The real tab matches `flow.html` again / 真机重新对齐效果图** —
  `docs/knowledge/evidence/progress-tab-mockup-2026-11-21/flow.html` is the reference; the tab had
  drifted from it (rows lived inside one opened stage instead of under the spine, and a
  jump-to-first-failure control fronted the track). The mockup is synced in the same commit: the
  zoom pill is gone, and the settle bar is documented as always present once a run exists.
  Geometry evidence — spine row count, trunk x per owner, branch y per card, pill targets, inert
  clicks, and the removed-element sweep at nine scenario/width pairs — is in
  `docs/knowledge/evidence/progress-tab-two-track-2026-11-21/`.
  / `flow.html` 是参照物，而真机已经偏离它（行挤在一个被展开的阶段里，而轨道前面还挂着一个「跳到首个
  失败」）。本次同提交同步了效果图：缩放胶囊删除，结算条注明「只要有一次运行就始终存在」。几何证据
  （每个宽度下的脊行数、每条干线的 x、每张卡支线的 y、胶囊目标、inert 点击、以及被删元素的扫描）在
  `docs/knowledge/evidence/progress-tab-two-track-2026-11-21/`。

## [0.12.18] - 2026-11-21

### Changed / 变更

- **The Progress tab no longer opens a detail card; member pills jump straight to the child session / 进度页不再弹详情卡，成员胶囊直达子会话** —
  Stages are static marks now: clicking a stage does nothing, and clicking a member
  card does nothing. The only action is the pill on an openable row ("打开子会话" /
  "Open child session"), which jumps straight to that child session through the
  existing `openChild` path (same `panelMemberMode` rule as the chat panel: the child
  must belong to this run and have a `continuable`/`one-shot` mode, otherwise the row
  stays pill-less and inert). The detail popover is gone — no seven-field report, no
  copy-coordination button — along with the selection, accordion-toggle and copy
  clipboard state that only served it. Unopenable rows render no pill and never open
  the wrong session.
  / 阶段变成纯展示：点阶段、点任务卡都什么都不发生。唯一的动作是可打开行上的胶囊
  （「打开子会话」），经现有的 `openChild` 通道直达该子会话（和对话面板同一条
  `panelMemberMode` 规则：子会话必须属于这次运行且 mode 为 `continuable`/`one-shot`，
  否则该行没有胶囊、保持 inert，绝不会跳错会话）。详情浮层整个删除——七字段报告、
  复制协调块按钮都不再有；只为它存在的选中、手风琴开关、剪贴板状态一并清理。
  打不开的行没有胶囊，点了也不会有反应。

### Added / 新增

- **Cloning a profile is a checked operation instead of `cp -a` / profile 克隆变成有测试的操作，而不是 `cp -a`** —
  `scripts/clone-profile.mjs` copies a profile into a throw-away `$DSH_HOME`, then repairs what a copy
  breaks and proves it: every relative `link:` symlink is re-derived against the clone's own depth (two
  dependencies in the live `web` profile dangle at any other depth, and DSH does not degrade — `dsh plugin
  --profile <clone> list` aborts with "cannot resolve profile bundle"), credential-shaped values in
  profile-owned files are redacted in place with a location-only report (the live `cordis.patch.yml`
  carries a real `sk-` channel secret), and parity is asserted as `redact(source) == target` byte for byte
  across the five files that define a profile. `test/profile-clone.spec.ts` runs the real script against a
  synthetic profile, so link repair, redaction, the `--force` refusal, the fail-closed `--keep-secrets`
  path, and the "already dangling in the source is inherited, not clone damage" rule are covered without a
  model or a network. `/ 把 profile 复制到一次性 `$DSH_HOME`，并修复「复制」本身弄坏的东西：
  `link:` 依赖的相对符号链接按克隆自己的深度重算（当前 `web` profile 有两条依赖只在其原始深度成立，
  而 DSH 不会降级——`dsh plugin --profile <clone> list` 直接以「cannot resolve profile bundle」失败）；
  profile 自有文件里的凭据形状值就地脱敏，报告只留文件与行号（活 `cordis.patch.yml` 里有一条真实
  `sk-` 渠道密钥）；parity 以「脱敏后的源 == 目标」逐字节断言，覆盖界定一个 profile 的五个文件。
  `test/profile-clone.spec.ts` 跑真实脚本，覆盖链接修复、脱敏、`--force` 拒绝、`--keep-secrets`
  的 fail-closed 路径，以及「源里本来就悬空算继承、不算克隆损伤」，全程不需要模型和网络。

## [0.12.16] - 2026-11-21

### Added / 新增

- **The composer dock gains a workflow master switch next to auto-continue and self-iterate / 对话框底部在「自动接着跑」「自迭代」旁新增 workflow 总开关** —
  The third button is the `/grok on|off` toggle in clickable form: it reads and writes
  the session's own mode record (`plugin:grok-workflow/mode`, the record the gate already
  honors) through `POST /grok-workflow/mode`, so the button and the command can never
  disagree about whether this session runs workflow work. It paints only what the route
  reads back — a click that the Host refuses leaves the last known state on screen with
  the reason beside it instead of flipping optimistically. Off is stated three ways (the
  word, a hollow lamp, the unlit pill) so a grey switch can never read as "still running".
  With no record yet the button shows the deployment default the route reports; the
  default is never hardcoded in the UI, and no second `masterEnabled` store was added.
  / 第三个按钮就是可点的 `/grok on|off`：读写会话自己的模式记录
  （`plugin:grok-workflow/mode`，门控本来就读的那条），经 `POST /grok-workflow/mode`
  落地，所以按钮和斜杠命令不可能对「这个会话要不要跑工作流」各说一套。界面只画路由回读
  出来的状态——宿主拒绝的点击保留最后已知状态并说明原因，不做乐观翻转。关闭有三重提示
  （文案、空心指示灯、熄灭的胶囊），灰色的开关不会被读成「还在跑」。没有记录时显示路由
  报回的部署默认值：默认值绝不在 UI 里写死，也没有新增第二份 `masterEnabled` 存储。

### Changed / 变更

- **`/grok` reads its switch word after trimming and without regard to case / `/grok` 的开关词去空白后不分大小写** —
  The handler compared `rawInput.trim()` against the two literals `on` and `off`, so
  `/grok ON`, `/grok Off ` or `/grok` followed by a tab answered with the usage line and
  left the session alone: the casing of the user's keyboard decided whether the command
  was understood. The word is now lower-cased before it is matched, and `trim` already
  removes every Unicode whitespace code point (spaces, tabs, newlines, U+00A0, U+3000),
  so the word is the only thing that decides. Everything that is not `on`/`off`/empty is
  still a usage error that writes no record, and an invocation whose argument is not a
  string answers with the same usage line instead of falling through to the
  empty-argument branch (bare `/grok` still enables — D-028) or throwing.
  / 处理器此前把 `rawInput.trim()` 与 `on`、`off` 两个字面量直接比较，于是 `/grok ON`、
  `/grok Off `、`/grok` 后面跟一个制表符都只回用法提示并且不动会话：命令能不能被听懂取决
  于用户键盘的大小写。现在先统一小写再比对；`trim` 本来就剥掉所有 Unicode 空白码点
  （空格、制表符、换行、U+00A0、U+3000），所以只有那个词决定结果。`on`/`off`/空 之外的
  一切仍然只是用法错误、不写任何记录；参数不是字符串时同样只回用法提示，既不落到
  「无参数=开」那条分支（裸 `/grok` 仍然开启，见 D-028），也不会抛异常。

### Fixed / 修复

- **The Progress tab's open stage is a panel below the spine, not a column inside it / 进度页展开的阶段改为脊柱下方的面板，不再作为其中一列** —
  The members of the open stage were rendered as one more child of the horizontal
  `.gw-progress-track` flex line, carrying `width: 100%`, so opening a stage competed with the
  stages themselves for width; the "jump to first failure" button was a flex item in that row as
  well. Both are outside the spine now: the panel is one bordered block under the track
  (`data-state` on the panel carries the open stage's state, and the stem's colour follows it) and
  the jump button sits above it. The ring is the state mark again — a hollow 28 px ring for
  `pending` instead of a blank head — the connector between two stages owns the running animation
  (`data-flowing`) while still filling only where the track has passed `done`, the head wraps
  instead of squeezing its label to zero width in a narrow column, and the meta line carries its
  full sentence as a `title` because it is ellipsized. Under 720 px the ring stacks above its
  label; under 480 px the connectors are hidden together with the vertical step list. A stage
  whose rows all render as their own plan-task nodes still opens, and its panel then states why
  it is empty (`Not reported in the events`, or how many rows ran below) instead of drawing a
  hollow box.
  / 展开阶段的成员此前是横向 `.gw-progress-track` 里的又一个 `width: 100%` 子项，于是「展开一个
  阶段」要和阶段本身抢宽度；「跳到首个失败」按钮当时也是那一行里的 flex 项。现在两者都在脊柱
  之外：面板是轨道下方一块带边框与圆角的独立区域（阶段状态挂在面板的 `data-state` 上，竖线颜色
  跟着它走），跳转按钮在轨道上方。状态标记回到圆环本身——`pending` 是空心的 28px 环，不再是一
  块空白头部；两个阶段之间的连接线接管「正在跑」的流动动画（`data-flowing`），并且仍然只在左侧
  阶段 `done` 时填实；头部改为换行，窄列里不再把标签压成零宽；元信息行会被省略号截断，补上
  `title` 以便读全句。720px 以下圆环叠在标签之上，480px 以下连接线随竖向步骤列表一起隐藏。
  某阶段的行全部渲染成下方的计划任务节点时它仍然可以点开，此时面板写明为什么是空的（「事件中
  没有报告」，或有多少行在下方运行），不再画一个空盒子。

## [0.12.15] - 2026-11-21

### Fixed / 修复

- **A bilingual delivery no longer loses the second language's verdict at the 4800-character cap / 双语交付在 4800 字符上限处不再丢掉第二种语言的结论** —
  The pair of blocks was bounded by slicing their concatenation, and one block at the
  single-pass cap (2400) plus one a character short (2399) plus the two-character
  separator is 4801 — one over. The blind cut then ate the last characters of the
  *second* language's verdict (`明细已记入台…`), which is the language the mirror exists
  to serve. The budget is now split between the two blocks, so only middle text can go
  and both verdicts survive; a block over its own cap is cut at a line boundary and the
  junction is marked with `…` instead of being sewn mid-word, and no cut ever splits an
  astral character (which used to leave a lone surrogate that renders as a replacement
  box).
  / 两个块此前是把拼接结果直接截断来限长的：一块正好在单遍上限（2400）、另一块差一个字
  （2399），加上两字符分隔符就是 4801，超出一个字符。这一刀于是吃掉了**第二种**语言结论的
  末尾（`明细已记入台…`），而那份镜像正是为这类读者存在。现在预算在两块之间分配，只有中间
  正文会被舍弃，两种语言的结论都完整保留；单块自身超限时按行边界裁剪并留下 `…` 接缝标记，
  不再切在词中间，也不会切断增补字符（此前会在末尾留下一个孤立代理项，渲染成替换方块）。
- **The ledger's `Model routes:` line refuses a route that is not a `provider/model` label / 台账的 `Model routes:` 一行现在拒绝非 `provider/model` 标签的条目** —
  That line is the one place a delivery restates a *configuration*, and it handed the report's
  chain straight to `Array#join`: a number, a `null` or an object inside a chain was coerced
  into a readable route (`worker=a/m1 → 7 → `), and a chain that was not an array at all threw
  a bare `TypeError` out of the ledger, naming neither the role nor the position. Every entry
  is checked now and the refusal carries its path and the shape found
  (`roles.worker[1] must be a "provider/model" string, got number`). A malformed chain costs
  the ledger line, never the answer; an absent chain still reads `inherit`.
  / 这一行是交付里唯一复述**配置**的地方，它此前把报告的链直接交给 `Array#join`：链里的数字、
  `null` 或对象会被拼成一条看着像真配置的路由（`worker=a/m1 → 7 → `），而根本不是数组的链
  会从台账里抛出裸 `TypeError`，既不报角色也不报位置。现在每个条目都检查，拒绝时写明路径与
  实测形状（`roles.worker[1] must be a "provider/model" string, got number`）。链坏掉只损失
  台账那一行，不会牵连结论；缺省的链照旧读作 `inherit`。

## [0.12.14] - 2026-11-20

### Fixed / 修复

- **`/compact` no longer fails on a session this plugin wrote a receipt into / 插件写过回执的会话里 `/compact` 不再报错** —
  DSH's token meter replays the journal with one hard pairing rule: an `assistant/message`
  is legal only between a `step/start` and its `step/end` for the same `(turn, step)`. The
  team-tier instant receipt runs in `agent/pre-step`, i.e. before the step opens, so the row
  it wrote had no step behind it; the first replay threw `token meter: assistant/message at
  seq N has no matching step/start event` and, because the fold cursor never advances past
  that seq, every later replay threw at the same place. `/compact` measures before it selects
  a range, so it answered with an error on a session that otherwise looked healthy, and
  automatic compaction failed the same way — silently, since `agent/pre-step` only warns and
  continues the turn. Every assistant row this plugin writes (instant receipt, unload notice,
  cancelled terminal) now goes through one gate that refuses to write outside an open step.
  A refused row is not dropped: the receipt and notice text are kept as the plugin's
  `plugin:grok-workflow/terminal` record, so the reason and any verified partial work are
  still readable from the session log. The rendered chat row is what is gone, because DSH has
  no legal shape for one there.
  / DSH 的 token 计量器回放日志时有一条硬配对规则：`assistant/message` 只能落在同一
  `(turn, step)` 的 `step/start` 与 `step/end` 之间。团队档的即时回执写在 `agent/pre-step`，
  也就是 step 尚未打开之时，因此那一行背后没有任何 step；第一次回放即抛
  `token meter: assistant/message at seq N has no matching step/start event`，且折叠游标
  不会越过该 seq，此后每次回放都在同一处抛错。`/compact` 先测量再选范围，于是在一个看起来
  正常的会话上报错，自动压缩同样失效——而且是静默的，`agent/pre-step` 只记一条 warn 就继续。
  现在本插件写的每一条 assistant 行（即时回执、卸载通知、取消终态）都走同一道闸门：没有
  打开的 step 就不写。被拒的行不会丢字：回执与通知的文字改存本插件的
  `plugin:grok-workflow/terminal` 记录，原因与已验证的部分成果仍可从会话日志读出；失去的是
  渲染出来的那一行，因为 DSH 在那里没有合法的形状。

## [0.12.13] - 2026-11-20

### Fixed / 修复

- **A non-string `model`/`provider` is refused with its path and shape instead of a bare `TypeError` / 非字符串的 `model`/`provider` 会报出完整路径与类型，不再是裸 `TypeError`** —
  a route entry like `{ model: 42 }` fell through to `?.trim()`, which threw V8's
  `entry?.model?.trim is not a function` — naming neither the key nor the shape.
  The reader now refuses with the full path (`roles.worker[0].model must be a model id
  string, got number`), like every other shape refusal in this reader.
  / `{ model: 42 }` 这类路由条目会掉进 `?.trim()`，抛 V8 的 `entry?.model?.trim is not a
  function`——键名和形状都没说。现在与读侧其它形状拒绝一致，报出完整路径。

## [0.12.12] - 2026-11-20

### Fixed / 修复

- **An over-budget human block keeps its verdict line instead of cutting it / 超长的中文结论不再把结论行截掉** —
  `composeHuman` cut from the tail, so an over-long block lost the verdict line
  (`statusTail`) — and, in bilingual delivery, the whole second language.
  It now keeps the head (the answer) and the tail (the verdict) and cuts the middle;
  each language block is clamped on its own, so the second language keeps its verdict too.
  / `composeHuman` 从尾部截断，超长时结论行（`statusTail`）被砍掉，双语时整个第二语言也没了。
  现在保留头部（答案）与尾部（结论），从中间截；双语每块独立截断，第二语言也有结论。


### Fixed / 修复

- **A `roles` value of the wrong shape is refused instead of loading five empty chains /
  `roles` 形状不对时直接拒绝，而不是带着五条空链装载** —
  `resolveConfig` reads `config.roles?.planner`, which on a string, an array or `null` is
  `undefined` for every role: the load succeeded with no route configured at all, and the report
  said "inherit the run's route" five times. A `roles` value that is present and is not an object
  is now refused with its shape named (`got a string "worker:m1"`), while an absent `roles` and an
  empty object still load as before. The settings schema already refused these on the host path;
  this closes the direct reader, which is also reached by an embedder or a hand-built config.
  / `resolveConfig` 读的是 `config.roles?.planner`，当 `roles` 是字符串、数组或 `null` 时，五个角色
  全都得到 `undefined`：装载成功、却一条路由都没配，报告里五次写着「继承运行的路由」。现在只要
  `roles` 存在却不是对象就拒绝，并点明实际形状（`got a string "worker:m1"`）；`roles` 缺省与空对象
  仍按原样装载。设置 schema 在宿主路径上本来就拒收这些值，这里补的是直读路径，嵌入方与手工构造的
  配置也走这条路。

- **The narrow-fold rule now has the tests that pin it, and the documented footer rule is the
  measured one / 窄折行规则补上钉住它的用例，页脚规则改为实测口径** —
  `0.12.10` shipped the rule that redacts a base64 key blob folded to seven columns or fewer, but
  the assertions that came with it were withdrawn in `0.12.11` (they failed as committed). They are
  restored in a corrected form: fold widths 1–7 redact on the report and the prompt boundary, a
  final line of seven characters survives as the armor's footer while eight is consumed, two
  consecutive short lines are read as a narrow fold and one is not, and the base64 PGP banner is
  asserted at both boundaries. The architecture doc's stale "16-character threshold / narrower than
  24 columns is not matched at all" prose now states the measured rule.
  / `0.12.10` 已发出「折到七列及以下的 base64 密钥块也会被脱敏」的规则，但随附的断言在
  `0.12.11` 被撤回（提交上去的版本本身是红的）。现在以修正后的形式补回：折行 1–7 列在报告与提示词
  两侧都脱敏，末行七个字符作为页脚保留、八个字符即被吃掉，连续两行短行按窄折行处理、单行不处理，
  base64 的 PGP 横幅在两侧都有断言。架构文档里过期的「16 字符阈值 / 窄于 24 列完全不匹配」已按实测
  规则改写。

## [0.12.11] - 2026-11-20

### Fixed / 修复

- **Release repair: two never-green narrow-fold assertions removed so CI is green again / 发版修复：删掉两个从没绿过的窄折行断言，CI 恢复绿色** —
  `v0.12.10` shipped two `test/redact.spec.ts` cases (`folded below the continuation floor`,
  `exactly one footer line`) that fail against the committed source, so remote CI red and no
  Release was created. The cases never passed at the tagged commit; they are reverted here while
  their complete fix lands separately. No production code changes in this release.
  / `v0.12.10` 带了两个在提交源码上失败的 `test/redact.spec.ts` 用例，远端 CI 变红、Release 没建出来。
  这两个用例在打 tag 的提交上从没绿过，先回退，完整修复另行发版。本版无生产代码改动。

- **A base64 key blob folded to seven columns or fewer is redacted instead of left almost whole /
  折到七列及以下的 base64 密钥块不再整块留在报告里** —
  the continuation rule consumed lines of eight or more characters, which is what a normal wrap
  produces; a blob folded narrower than that had no such line, so only the banner's own encoded
  characters were replaced and the rest of the encoding stayed — 244 of 272 characters at seven
  columns, which decoded back to the banner and the key body.
  A run of two or more consecutive lines that are only base64 characters is now read as one
  narrow fold and consumed with the block, on both the report and the prompt boundary (same rule
  table). A single short line is still left alone, because that is also what one word of prose
  looks like. What a wrapped block may still leave is its footer: a final line shorter than the
  eight-character continuation floor, i.e. at most seven characters, which cannot decode to
  anything on its own. The documented threshold said sixteen characters and the architecture doc
  still said a fold narrower than 24 columns was not matched at all — both were stale and now
  state the measured rule.
  / 续行规则原先只吃八字符以上的行，那正是常规折行的形状；折得比这更窄的块没有这样的行，
  于是只有横幅自身的那几个编码字符被替换，其余编码原样留下——七列折行留下 272 个字符里的
  244 个，解回去就是横幅与密钥本体。现在连续两行及以上
  「只有 base64 字符」的行会被当作一次窄折行整段吃掉，报告与提示词两侧同规则。单独一行短行
  仍然不动，因为那和散文里的一个词长得一样。折行块仍可能留下的是它的页脚：末行短于八字符
  续行下限，也就是最多七个字符，单独无法解出任何内容。原文档写的是十六字符，架构文档还写着
  「窄于 24 列完全不匹配」——两处都已过期，现按实测规则改写。规则本身随 `0.12.10` 发出，
  本次补上钉住它的用例（`test/redact.spec.ts`：折行 1–7 列、页脚 7/8 字符边界、两侧边界）。
  / 该规则随 `0.12.10` 发出，本版补上钉住它的用例（`test/redact.spec.ts`：折行 1–7 列、
  页脚 7/8 字符边界、报告与提示词两侧）。

## [0.12.10] - 2026-11-20

### Fixed / 修复

- **An unknown configuration key one level down is refused instead of dropped / 配置里深一层的未知键不再被静默丢弃** —
  only the top level of the configuration was checked, so a role name this build does not route
  (`roles.reviewer`) and a route field typo (`maxInflight` written for `maxInFlight`) were discarded
  while the stored patch kept them: the patch read as configured and the run ignored it. The reader
  now checks all three levels and refuses with the full path (`roles.worker[0].maxInflight`), naming
  the closest accepted key, exactly as a top-level key always was. A valid patch is unaffected.
  **Migration:** delete the key the error names, there is no replacement for it; the five accepted
  role names are `planner`, `worker`, `verifier`, `synthesizer`, `supervisor`, and the three accepted
  route fields are `provider`, `model`, `maxInFlight`.
  / 配置原先只查最外层，所以本构建不路由的角色名（`roles.reviewer`）和路由字段的手误
  （把 `maxInFlight` 写成 `maxInflight`）会被直接丢掉，而补丁里还留着——看着配好了，运行时当它
  不存在。现在三层都查，拒绝时报出完整路径（`roles.worker[0].maxInflight`）并给出最接近的可用键，
  与最外层一直以来的处理一致；合法补丁不受影响。**迁移：** 把报错点名的键删掉，它没有替代值；
  可用的五个角色名是 `planner`、`worker`、`verifier`、`synthesizer`、`supervisor`，可用的三个
  路由字段是 `provider`、`model`、`maxInFlight`。

## [0.12.9] - 2026-11-20

### Fixed / 修复

- **A double-escaped folded base64 key is redacted instead of leaking verbatim / 双重转义的折行 base64 密钥不再原文落进报告** —
  a log line that already carries literal `\n` breaks, forwarded inside another JSON document,
  doubles every backslash; the break rule only knew the single form, so the whole encoded block
  reached reports verbatim. The break now also matches the doubled form; single, real-newline and
  double-escaped folds are all pinned by `test/redact.spec.ts`.
  / 已带字面 `\n` 断行的日志行再被包进另一层 JSON，反斜杠会加倍；断行规则只认单层形式，
  整块编码原文落进报告。现在连双重转义也认，单层/真换行/双重转义三种折行都有用例钉住。


## [0.12.8] - 2026-11-20

### Fixed / 修复

- **A hand-folded base64 private key is redacted instead of being printed verbatim / 手工折行的 base64 私钥不再原样落进报告** —
  0.12.5 and 0.12.6 matched a contiguous 20-character piece of the *encoded* banner, so a blob
  whose lines are narrower than that piece (a `fold -w 8` key file, a paste wrapped by an editor)
  split the marker itself and matched nothing: every measured width from 8 to 23 columns left 100%
  of the encoded block in the report, and 24 was the first width that redacted. The rule now lets a
  line break — a real newline, or the `\n` escape a JSON string carries — fall between any two
  characters of the banner, and consumes a folded block's continuation lines down to eight
  characters, which is what a `w >= 8` fold puts on each line. A narrower fold is still left alone:
  at that width a continuation line cannot be told apart from a word of prose. Public keys,
  certificates and ordinary base64 blobs are still untouched.
  / 0.12.5 与 0.12.6 匹配的是**编码后**横幅里连续 20 个字符，所以只要一行的宽度窄于这一段
  （`fold -w 8` 的私钥文件、被编辑器折过行的粘贴），标记自身就被拆开，什么也匹配不上：本轮实测
  8 至 23 列的每一种宽度都让整块编码原文留在报告里，24 列才是第一个能脱敏的宽度。规则现在允许
  换行——真实换行，或 JSON 字符串里的 `\n` 转义——出现在横幅任意两个字符之间，并把折行块的续行
  吃到 8 个字符为止（`w >= 8` 的折行每行正好不少于 8 个）。更窄的折行仍不处理：那种宽度下续行
  与散文单词无法区分。公钥、证书与普通 base64 数据保持原样。

## [0.12.7] - 2026-11-20

### Removed / 移除

- **Deleted the unused panel projection module (`src/panel.ts`) / 删除了从未被生产调用的面板投影模块** —
  it had no production importer (no `src/` module imports it, `src/index.ts` does not export it,
  the browser bundle does not use it); the only references were its own spec and a type import in
  the GUI-fold transcription. The live panel renders through `progress-tab.ts` plus the bundle
  renderer pinned by `test/panel-links.spec.ts`, so nothing user-visible changes.
  / 它没有任何生产调用方（没有 `src/` 模块引用它，`src/index.ts` 不导出它，浏览器 bundle 不用它）；
  唯一的引用是它自己的测试和 GUI 折叠转录里的一处类型引用。线上板走 `progress-tab.ts` 加 bundle
  渲染器（`test/panel-links.spec.ts` 钉住），用户可见行为不变。

## [0.12.6] - 2026-11-20

### Fixed / 修复

- **A base64-wrapped GnuPG private key is redacted instead of being printed verbatim / base64 包裹的 GnuPG 私钥不再原样落进报告** —
  0.12.5 closed this hole for PEM armor only, so the encoded form of `-----BEGIN PGP PRIVATE KEY BLOCK-----`
  (a `base64`d keyring export, a key sitting in a JSON field) still reached reports, diagnostics and
  verifier/retry prompts with the whole block intact. The same rule now matches the GnuPG banner's
  encoded form at all three base64 group alignments, for both the `PRIVATE` and the legacy `SECRET`
  spelling, and replaces the blob including a wrapped blob's continuation lines. Public keys are
  deliberately not covered: the match reaches byte 17 of the banner, where `PRI`/`SEC` and `PUB`
  diverge, so base64 `PGP PUBLIC KEY BLOCK` and `CERTIFICATE` blocks survive unchanged.
  / 0.12.5 只堵上了 PEM armor 这一半：`-----BEGIN PGP PRIVATE KEY BLOCK-----` 的编码形态
  （`base64` 过的钥匙串导出、JSON 字段里的密钥）仍会带着完整块进报告、诊断信息和复查/重试提示词。
  同一条规则现在也匹配 GnuPG 横幅的**编码形态**（三种 base64 分组对齐全盖，`PRIVATE` 与遗留的
  `SECRET` 两种写法都算），整块替换，带换行的续行一并吃掉。公钥故意不覆盖：匹配窗口取到横幅第 17
  字节，`PRI`/`SEC` 与 `PUB` 正是在那里分开，所以 base64 的 `PGP PUBLIC KEY BLOCK` 与
  `CERTIFICATE` 块保持原样。

## [0.12.5] - 2026-11-20

### Fixed / 修复

- **A base64-wrapped private key is redacted instead of being printed verbatim / base64 包裹的私钥不再原样落进报告** —
  every armor rule matched the decoded banner, so a key file that had been `base64 -w0`'d, or that
  sat base64-encoded in a JSON field or a larger blob, reached reports, diagnostics and
  verifier/retry prompts with the whole key body intact. It was caught only when a secret-named
  label happened to precede the blob (`PRIVATE_KEY=…`), which is why the gap stayed invisible in
  ordinary logs. The rule table now matches the banner's encoded form at all three base64 group
  alignments and replaces the whole blob, continuation lines of a wrapped blob included. Public
  material is left alone: base64 `CERTIFICATE` blocks and base64-wrapped PGP armor (still a
  documented gap) are untouched.
  / 所有 armor 规则匹配的都是解码后的横幅，所以被 `base64 -w0` 处理过的密钥文件、或藏在 JSON
  字段/更大 blob 里的 base64 私钥，会带着完整密钥体进报告、诊断信息和复查/重试提示词。只有当 blob
  前面恰好有敏感名标签（`PRIVATE_KEY=…`）时才被顺手挡住——这正是它在普通日志里隐身的原因。现在规则
  表匹配横幅的**编码形态**（三种 base64 分组对齐全盖），整块替换，带换行的续行一并吃掉。公开材料
  不动：base64 的 `CERTIFICATE` 块与被 base64 包裹的 PGP armor（仍是已记录的缺口）保持原样。

## [0.12.4] - 2026-11-20

### Fixed / 修复

- **A cancelled turn no longer wears the packaging of a finished run / 被取消的轮次不再套着跑完的包装** —
  the kept partial report went through `relayText`, so a cancelled terminal opened with the
  success preamble, the `REPORT_BEGIN/END` markers and the folded machine ledger
  (`Failures:`, `Confirmed evidence:`, `Model routes:`) — it read as if the workflow had
  finished. It now states the kept report as a human conclusion (`humanConclusion`): what was
  verified, what was not, and that stopping was the operator's act. The ledger stays in the
  progress node, where it was already recorded.
  / 保留的部分报告走的是 `relayText`，于是取消的终结带着成功前言、`REPORT_BEGIN/END` 标记和
  折叠的机器台账（`Failures:`、`Confirmed evidence:`、`Model routes:`）——读起来像流程跑完了。
  现在只说人话结论（`humanConclusion`）：核验过了什么、没做成什么、停下是主动操作。
  台账本来就记在进度节点里，不丢。


## [0.12.3] - 2026-11-20

### Fixed / 修复

- **A checkpoint the writer accepted no longer reads back as `invalid` / 写得进去的检查点不再一读就报 `invalid`** —
  `integrity.bytes` counts the canonical payload, and the writer accepts one up to `maxBytes`
  (1,048,576). The read-side validator bounded the same field with `countCeiling` (1,000,000), a
  *row-count* backstop, so a checkpoint whose payload landed between the two ceilings sealed,
  wrote, and then failed validation on the way back in — a resume that could never happen. Both
  sides now use the writer's bound.
  / `integrity.bytes` 记录的是规范化载荷的字节数，写入侧的上限是 `maxBytes`（1,048,576）。读侧
  却用 `countCeiling`（1,000,000，本来是行数上限）卡同一个字段：载荷落在这两个上限之间的检查点
  能封装、能落盘，读回时却在校验阶段被判 `invalid`——续跑永远起不来。现在读写两侧同用写入侧的
  上限。

## [0.12.2] - 2026-11-20

### Fixed / 修复

- **A direct `resolveConfig` call with a bad `grokDefault` is refused instead of silently disabling the workflow / 直接调 `resolveConfig` 传错 `grokDefault` 会被拒绝，不再静默关掉工作流** —
  the `Config` schema already refused it, but the direct reader loaded any string as itself:
  `grokDefault: 'onn'` printed `grokDefault=onn` in the one-line signature and then behaved
  as off at the gate (`=== 'on'`), a typo that silently disables the workflow. The reader now
  fails closed like `mode` (`grokDefault must be "on" or "off"`).
  / `Config` 校验原本就拒收，但直接读配置的函数原样吞掉任何字符串：`grokDefault: 'onn'`
  会印出 `grokDefault=onn` 然后在门禁按 off 跑——一个拼写错误静默关掉整个工作流。现在读侧
  与 `mode` 一样 fail-closed（`grokDefault must be "on" or "off"`）。

- **A COMPLETED run no longer prints a `Failures:` line for attempts its own retry recovered / 跑通的轮次不再把自己重试救回来的失败也印进 `Failures:`** —
  a verified task carries retry history in its `attempts` (the row says `verified (2 attempts)`),
  but an attempt a later attempt recovered says nothing about the run's outcome: counting it
  printed `COMPLETED` followed by `Failures: 1 infrastructure`, which reads as a failure on a
  run where every task passed. `failureSummary` (`src/report.ts`) and the ledger's `failureCounts`
  (`src/delivery/index.ts`) now count only unrecovered failures; the retry stays visible as the
  attempt count on the task row.
  / 已验证的任务会在 `attempts` 里留着重试历史（行上写 `verified (2 attempts)`），但被后面
  一次救回来的尝试与本轮成败无关：以前照计数，会印出 `COMPLETED` 紧跟 `Failures: 1
  infrastructure`——全过的轮次看起来像失败了。现在报告（`src/report.ts`）与台账
  （`src/delivery/index.ts`）只计没救回来的失败，重试仍以次数留在任务行上。


## [0.12.1] - 2026-11-20

### Changed / 变更

- **The self-iteration heartbeat ships the repository's own round prompt as its default
  template / 自迭代心跳的内置默认模板改为仓库自己的轮次提示词** — the built-in default was a
  twelve-line generic prompt, so a fresh profile armed a heartbeat that knew nothing about
  how a round here is chosen or judged. The default is now the round prompt in
  `docs/iterate-template.md`, delivered verbatim by `DEFAULT_ITERATE_TEMPLATE`
  (`src/config.ts`): two topic sources with `POOL` first, then TODO/failure rows, GitHub
  issues and papers; at least one item landed per round; a small fix needs no research
  while a big change needs a `RESEARCH` entry and the item approved in the pool; `R1`–`R6`
  execution; a triple review (self-review, `npm run ci` plus `npm run verify:lib`, and a
  live check on a copied profile); four brakes and the forbidden zones. It still carries
  no routing marker, whitespace still falls back to it, and the 4000-character cap is
  unchanged. A profile that already stores a template is untouched — only an unset or
  blank one sees the new default. `test/iterate-template.spec.ts` pins the document and
  the constant byte-identical and checks each required section is present, and
  `test/loop-surface.spec.ts` now also drives the iterate route's `status` action.
  / 内置默认原本是一段十二行的通用提示词，新档案武装出来的心跳并不知道这个仓库怎么选题、怎么判
  一轮是否完成。现在默认就是 `docs/iterate-template.md` 里的轮次提示词，由
  `DEFAULT_ITERATE_TEMPLATE`（`src/config.ts`）原样投递：双源选题、`POOL` 优先，其次
  TODO/失败行、GitHub issue 与论文；每轮至少落地一项；小修不做研究，大改必须有 `RESEARCH`
  条目且该条目已在待办池获批；`R1`–`R6` 执行；三重评审（自审、`npm run ci` 加
  `npm run verify:lib`、复制档案上的真机验证）；四道刹车与禁区。它依旧不带路由标记，纯空白
  仍回退到它，4000 字符上限不变。已经存了模板的档案不受影响——只有未设置或纯空白的档案才会
  看到新默认。`test/iterate-template.spec.ts` 把文档与常量钉成逐字节一致并逐项检查必需章节，
  `test/loop-surface.spec.ts` 也补上了自迭代路由 `status` 动作的用例。

## [0.12.0] - 2026-11-20

### Added / 新增

- **A second composer-dock switch arms the self-iteration heartbeat, and its prompt template
  is editable on the settings page / 输入框旁新增「自迭代」开关，其心跳提示词模板可在设置页编辑** —
  a second service instance over the same Host Schedule owns the reserved `RSI heartbeat` slot
  (`/grok-workflow/iterate`), so the auto-continue and self-iterate switches can never create,
  report or delete each other's row (`src/loop.ts` `identity`, `test/iterate.spec.ts`). The
  settings page's *Self-iteration* group holds `iterateIntervalMin` and the `iterateTemplate`
  textarea (whitespace-only falls back to the built-in default; at most 4000 characters); the
  template is persisted per profile through the ordinary settings write path, and the switch's
  open sends no prompt of its own — the stored template governs, so a stray request field can
  never arm a heartbeat that disagrees with the page. An `RSI heartbeat` delivery routes as an
  ordinary schedule message and the row deliberately outlives the plugin (it is the repository's
  own beat); disarm it with the same switch or through DSH's own Automation tasks.
  / 第二个服务实例复用同一个宿主 Schedule，拥有保留的 `RSI heartbeat` 槽位
  （`/grok-workflow/iterate`），因此「自动接着跑」与「自迭代」两个开关永远不会创建、读取或删除
  对方的行（`src/loop.ts` 的 `identity`，`test/iterate.spec.ts`）。设置页新增「自迭代」分组，
  含 `iterateIntervalMin` 与 `iterateTemplate` 文本框（纯空白回退内置默认；最多 4000 字符）；
  模板走普通设置写入路径随档案保存，开关的 `open` 自己不带提示词——存好的模板说了算，杂散的
  请求字段不可能让心跳和页面不一致。`RSI heartbeat` 的投递按普通调度消息放行，且这一行刻意比
  插件活得久（它是仓库自己的节拍）；用同一个开关关掉，或走 DSH 自己的「自动化任务」删除。

### Fixed / 修复

- **One session can no longer end up with two loop heartbeats, and a rewritten prompt no longer
  orphans a live one / 一个会话不会再有两个循环心跳，提示词被改写也不会留下删不掉的活心跳** —
  cycling the composer switch could leave a stale `Loop heartbeat` row beside the live one (an
  `ended` row survived a refresh, and a refused delete was followed by a create anyway), so the
  session received two rounds per interval. `open()` now keeps exactly one row: it deletes the
  other rows of the session's slot on refresh and resume, and when a refused delete leaves a live
  row behind it refreshes that row instead of minting a second one. The same pass fixed the other
  half of the identity: a row whose prompt was edited in Automation tasks (DSH's own
  `schedule_edit` accepts `prompt`) kept delivering but no longer carried the
  `[grok-workflow loop]` marker, so its messages passed the gate as ordinary non-user mail and the
  switch reported "off" over a live row it could not delete. Cleanup now matches the reserved task
  name rather than the marker, and opening the switch rewrites the marker onto the row it reclaims
  (`src/loop.ts`, `isLoopSlot`).
  / 来回拨动输入框旁的开关可能留下一条旧的 `Loop heartbeat` 行（`ended` 行熬过了刷新，删除被拒
  之后也照样新建），于是一个会话每个间隔收到两轮。现在 `open()` 只保留一行：刷新与恢复时删掉该
  会话槽位里的其它行；删除被拒而留下活行时，改写那一行而不是再造一条。同一处还补上了身份的另一
  半：在「自动化任务」里被改写提示词的行（DSH 自己的 `schedule_edit` 接受 `prompt`）仍在投递，
  但不再带 `[grok-workflow loop]` 标记，于是它的消息按普通非用户消息穿过门禁，开关却在一条删不
  掉的活行上显示「关闭」。清理现在按保留的任务名匹配而不是按标记，开关打开时会把标记写回它收回
  的那一行（`src/loop.ts`，`isLoopSlot`）。

- **The two heartbeats' identities are audited and pinned / 两个心跳的身份已审计并固定** —
  `docs/knowledge/HEARTBEATS.md` records the Loop heartbeat (`Loop heartbeat`,
  `[grok-workflow loop]`, `/grok-workflow/loop`, `grok_loop`) against the Iterate heartbeat
  (`RSI heartbeat`, `/grok-workflow/iterate`, the editable `iterateTemplate` prompt, no tool),
  the dispatcher branch each delivery takes, and the one shared switch that stops both
  (`.rsi/STOP`, stop-only). `test/heartbeat-identity.spec.ts` pins it against the real
  `.rsi/HEARTBEAT.md` template: an Iterate delivery is never charged to a loop, never trips a
  brake, and never lets either service delete the other task's row.
  / `docs/knowledge/HEARTBEATS.md` 记录了循环心跳（`Loop heartbeat`、`[grok-workflow loop]`、
  `/grok-workflow/loop`、`grok_loop`）与自迭代心跳（`RSI heartbeat`、`/grok-workflow/iterate`、
  可编辑的 `iterateTemplate` 提示词、无工具）的对照、各自消息走的分支，以及唯一同时停掉两者的
  开关（`.rsi/STOP`，只能停）。`test/heartbeat-identity.spec.ts` 以真实的 `.rsi/HEARTBEAT.md`
  模板为基准固定这些身份：自迭代投递不会被记到循环账上、不会触发刹车、也不会让任一服务删掉
  另一个任务的行。

- **The self-iterate switch no longer deletes the loop's task on archive / 自迭代开关归档时不会再删掉循环的任务** —
  both switches are two instances of one service, and the archive sweep (`forgetSession`) used the
  loop's hard-coded slot for every instance: archiving a session with the RSI heartbeat armed
  deleted the `Loop heartbeat` row and left the `RSI heartbeat` row behind — one heartbeat deleting
  the other's task, plus a stale row surviving the archive. The sweep now takes the calling
  instance's own slot predicate (the brake keeps the loop's, by default), and each switch only ever
  closes its own row. Route isolation is pinned as well: two exact routes, each bound to its own
  service, and the client switch that posts to one never posts to the other.
  / 两个开关是同一个服务的两个实例，而归档清扫（`forgetSession`）对每个实例都用循环那套写死的
  槽位：在自迭代心跳武装的情况下归档会话，会删掉 `Loop heartbeat` 行、留下 `RSI heartbeat` 行
  ——一个心跳删掉另一个的任务，还让一条旧行活过归档。现在清扫收调用方实例自己的槽位谓词
  （刹车默认仍用循环的），每个开关只会关掉自己那一行。路由隔离也一并钉死：两条 exact 路由各自
  绑定自己的服务，页面开关发一条路径就绝不会发到另一条。

- **`/grok on` no longer holds the whole turn hostage / `/grok on` 之后消息不会再卡住** —
  the toggle writes `workflowMode: 'full'`, and `full` was the one shape that skipped the
  interactive admission and awaited the entire workflow inside `agent/pre-step`. The loop
  dispatches the next batch only after the current step settles, so every message typed while
  the team ran stayed invisible until the run ended (default deadline: 60 minutes) — the user's
  report was "with `/grok on` I cannot send messages, with `/grok off` I can". A session that
  carries the `/grok on` record now gets an acceptance receipt and the run continues behind it,
  delivering the report as its own message; `full` as a deployment default keeps the documented
  in-turn contract unchanged. The per-agent queue keeps its bound: past four messages already
  waiting for a run, the next one takes the in-turn path (and waits for its own run) rather than
  queueing without limit — no record claims a background run that was never queued.
  / 开关写入 `workflowMode: 'full'`，而 `full` 正是唯一绕过交互式受理、在 `agent/pre-step`
  里把整个工作流等完的那种形态。循环只在上一步结算后才会派发下一批消息，于是团队跑的整段
  时间里（默认 60 分钟）用户打的每条消息都看不见——正是用户报的「`/grok on` 就打不出字，
  `/grok off` 就行」。现在带 `/grok on` 记录的会话先回执、队伍在后台跑，结论单独发一条；
  作为部署默认值的 `full` 仍保持原有的 in-turn 契约不变。每会话队列的既有上限不变：已有四条
  消息在排队等跑时，下一条走 in-turn 等它自己那趟跑完，而不是无限排队——也不会有记录谎称
  一次从未入队的后台开工。

- **A stored task prompt that opens with `/grok` is no longer swallowed / 以 `/grok` 开头的存档任务提示词不会再被吞掉** —
  the commands parser reads the first line of a message as a slash command and passes everything
  after the name to the handler as its argument, so a team task prompt whose first line is
  `/grok 团队任务：…` never became a message at all. Measured on this machine: the argument was
  2 041 characters / 3 697 bytes in one fresh session and 2 032 / 3 688 in another, and each one
  settled as `Usage: /grok [on|off]` with no `user/message`, no `agent/pre-step` and no workflow
  run — the prompt was refused by size nowhere: 2 041 characters is 6.4 % of the 32000-character
  objective budget, and nothing was truncated. The handler now answers a prompt-shaped argument
  with an explicit bilingual refusal that states how many characters were discarded and how to
  send them (`src/intake.ts`, `src/command.ts`); the gate's oversize and empty refusals use the
  same pass, so both are bilingual and carry the measured count and the number of parts the
  prompt would take. The documented default template lives in `docs/task-prompt-template.md` and
  is assembled by the same rule (`test/intake.spec.ts`). Toggle semantics are unchanged.
  / 命令解析器把消息**第一行**当命令，名字之后的一切原样交给 handler 当参数，于是第一行是
  `/grok 团队任务：…` 的任务提示词根本没变成消息：本机实测参数为 2 041 字符 / 3 697 字节
  （另一会话 2 032 / 3 688），每次都结算成 `Usage: /grok [on|off]`，既无 `user/message`
  也无 `agent/pre-step`、无运行——按大小拦下的地方一处都没有：2 041 字符只占 32000 字符目标预算
  的 6.4%，也没有任何截断。现在提示词形态的参数会得到中英双语、带丢弃字符数与下一步动作的明确
  拒绝（`src/intake.ts`、`src/command.ts`）；门禁的超长与空消息拒绝走同一通道，同样双语，并写出
  实测字符数与需要分成几段。默认模板落在 `docs/task-prompt-template.md`，由同一规则组装校验
  （`test/intake.spec.ts`）。开关语义不变。


## [0.11.21] - 2026-11-19

### Fixed / 修复

- **The composer "auto-continue" switch is clickable again / 输入框旁的「自动接着跑」开关又能点了** —
  the switch's production fallback passed `loopSend` (which already takes the loop body shape)
  where a raw fetch belongs, so every read in a real browser answered `loop/response` with an
  undefined status and the switch sat inert showing
  `续跑服务没有回应：the loop route answered HTTP undefined`. The component now falls back to
  the page's own fetch, and a regression test drives the mount-read-click path with no `loopSend`
  prop at all.
  / 开关在生产环境的默认发送函数误传了 `loopSend`（它要的是循环请求体），而该传浏览器原生的
  fetch：真机上每次读取都只剩 `loop/response` + 缺失的状态码，开关卡死并显示
  「续跑服务没有回应：the loop route answered HTTP undefined」。现在默认走页面自己的
  fetch，并有一条回归测试专门覆盖「不传 `loopSend`」的生产路径。


## [0.11.20] - 2026-11-19

### Fixed / 修复

- **A long run's checkpoint records its own duration instead of dropping it
  / 跑得久的 run，checkpoint 会记下它到底跑了多久** — the checkpoint writer gated
  `time.durationMs` on `countCeiling` (rows, 1e6) while the reader accepts durations
  to `msCeiling`: any run past 16m40s recorded no duration at all — the one field
  that says how long the run took. Both sides now read the same ceiling
  (`msCeiling`), so a two-day run says two days. Omitted-not-clamped stays: an
  unrepresentable duration is still absent, never a smaller number.
  / checkpoint 写侧用 `countCeiling`（行数上限 1e6）卡 `time.durationMs`，读侧却接受到
  `msCeiling` 的时长：超过 16 分 40 秒的 run 就记不住自己跑了多久——而那正是说明
  「跑了多久」的唯一字段。现在两侧读同一个上限（`msCeiling`），跑两天的 run 就写
  两天。「超限则省略、永不截断」不变：写不下的时长仍然缺席，不会写一个更小的数。

### Fixed / 修复

- **A busy supervisor lane is now flagged to the next run instead of going
  unseen / 打满的 supervisor 路由现在会提示给下一次 run，不再被漏掉** —
  `configRouteLabels()` (the cross-run route hint snapshot) flattened four roles
  while the router has five, so a `roles.supervisor` chain never reached the
  snapshot: a supervisor lane another live run had saturated was invisible, and
  the next run placed supervisor calls into it with no head start on the
  alternative. All five routed roles are flattened now, in report order, and a
  unit test pins the full five-role label list so a future role cannot drift out
  of the snapshot again.
  / `configRouteLabels()`（跨 run 路由提示快照）只摊平四个角色，而路由实际有五个，
  于是 `roles.supervisor` 链从未进入快照：另一个活跃 run 已经打满的 supervisor 路由
  不可见，下一次 run 仍会往里面排 supervisor 调用，也不会先避让到备选路由。现在五个
  被路由的角色按报告顺序全部摊平，并有一条单元测试钉住五角色的完整标签列表，以后加
  角色不会再从快照里漂走。

## [0.11.19] - 2026-11-19

### Fixed / 修复

- **The machine ledger names the supervisor chain instead of silently dropping it
  / 机器台账不再悄悄丢掉 supervisor 链** — `machineLedger()` listed four roles
  while `renderReport()` lists five, so a run configured with a
  `roles.supervisor` chain read as "unsupervised" in the durable copy: the
  `Model routes:` line had no supervisor segment at all. All five routed roles
  now render in report order, and a parity test pins the ledger's route line
  equal to the canonical renderer's, so a future role cannot drift silently
  again. The human block strips `supervisor=` assignments like every other
  role, so the fix changes the ledger only, not the visible answer.
  / `machineLedger()` 只列四个角色，而 `renderReport()` 列五个，于是配了
  `roles.supervisor` 链的 run 在 durable copy 里读成「无监督」：`Model routes:`
  那一行根本没有 supervisor 段。现在五个被路由的角色按报告顺序全部渲染，
  parity 测试把台账的路由行与标准渲染器的同行钉成相等，以后加角色也不会再
  悄悄漂移。人话块同样剥离 `supervisor=` 赋值（与其他角色一致），所以本修复
  只改台账，不改可见答案。

## [0.11.18] - 2026-11-19

### Fixed / 修复

- **A broken supervisor route is refused at load, not after a task's work is paid for
  / supervisor 路由写错现在载入即拒，不再等某个任务干完才暴露** — the load-time route
  check named four roles, so `roles.supervisor` was never compared against
  `llm.listProviders()` or the models a provider declares: a misspelled provider
  or an undeclared model loaded cleanly and surfaced only once that task's worker
  and verifier calls had already been paid for. All five routed roles are checked
  now (the same table also drives the empty-`maxInFlight` heads-up), and the
  README/architecture notes state that the supervisor is included. If a profile's
  supervisor chain names a provider this runtime does not have, that row now fails
  to load: point it at a registered provider, or blank that route's `provider` so
  the route inherits the run's provider. Clearing the chain is not that — an empty
  supervisor chain runs no supervision at all.
  / 载入期路由校验只点名四个角色，`roles.supervisor` 既没和 `llm.listProviders()`
  比过，也没和 provider 宣告的模型目录比过：provider 拼错或模型未宣告都能装载成功，
  直到那个任务的 worker 与 verifier 都付过费之后才暴露。现在五个被路由的角色都校验
  （空 `maxInFlight` 提示也读同一张表），README 与架构说明也写明包含 supervisor。
  若某 profile 的 supervisor 链写了本机没有的 provider，该行现在会装载失败：改成已
  注册 provider，或把该路由的 `provider` 留空以继承 run 的 provider。删掉整条链不是
  同一件事——空的 supervisor 链等于完全不做监督。

## [0.11.17] - 2026-11-19

### Added / 新增

- **Supervision is now resident and parallel, not just a serial stage
  / 监督不再只是一个串行环节，而是常驻并行的监护** — every run now starts with a
  `RunGuardian` beside it: it subscribes to `workflow/agent-start` / `agent-end`
  before the engine's first child exists, watches every child for stalls, and when
  one makes no progress within its budget (`min(run deadline, 10 minutes)`,
  disarmed for an explicitly unlimited run) it cancels the run at most once and
  records a bounded `Guardian` error naming the child — so a reader can tell "the
  work stalled" apart from "the work was judged". It never judges quality: the
  serial supervisor after verification (fail-only, D-056) is unchanged, `script`
  is untouched, and it costs zero model calls. Plugin unload disposes every live
  guardian with the runs it watches.
  / 每次运行现在身边都跟着一个常驻监护：引擎第一个孩子出现之前它就已经订阅了
  `workflow/agent-start` / `agent-end`，盯着每个孩子的存活；某一个在预算内毫无
  进展（取运行死线与 10 分钟的较小值，显式不限时的运行则不启用），它最多取消一
  次运行，并记一条点名那个孩子的 `Guardian` 错误——于是读者能分清“活卡住了”和
  “活被判了不合格”。它从不判质量：检查之后的串行监督（只能判失败，D-056）原样
  不动，`script` 零改动，零模型调用。插件卸载时，每个活着的监护随它看的运行一
  起被清理。

### Fixed / 修复

- **A delivered heartbeat is recognised inside DSH's own delivery framing
  / 投递到的心跳在 DSH 自己的投递包装里也能被认出来** — DSH wraps every scheduled
  prompt as `[SCHEDULE REMINDER] … reminder_prompt_json: "<the stored prompt>"`,
  so the `[grok-workflow loop]` marker this plugin writes never leads the text
  the gate sees. `isLoopHeartbeat` only matched a leading marker, which meant a
  real delivery fell through to the generic `non-user-source` pass instead of the
  heartbeat branch — and the loop brakes never ran. Both shapes are now accepted
  (the gate still pairs the marker with `source.kind === 'schedule'`), with live
  delivery evidence in `.rsi/evidence/round-017/heartbeat-live/` and regression
  coverage in `test/loop.spec.ts` + `test/gate.spec.ts`.
  / DSH 会把每条定时投递的提示词包成 `[SCHEDULE REMINDER] … reminder_prompt_json:
  "存下来的提示词"`，所以本插件写进心跳的 `[grok-workflow loop]` 标记永远不在门禁
  看到的文本开头。`isLoopHeartbeat` 以前只认开头的标记，于是真实投递掉进了通用的
  `non-user-source` 直通分支，心跳分支和六道刹车一次都没跑到。现在两种形状都认
  （门禁仍要求标记与 `source.kind === 'schedule'` 配对），真机投递证据在
  `.rsi/evidence/round-017/heartbeat-live/`，回归覆盖在 `test/loop.spec.ts` 与
  `test/gate.spec.ts`。

- **The settings surface says how many keys it really projects
  / 设置面现在说清它到底投影几个键** — the log line, the two code comments and the
  test prose disagreed: 13 accepted keys, 11 volatile keys on the generated page
  (`toolName` and `configVersion` are plain, so the runtime projection drops them).
  `describeSurface` now reports `11 of 13 field(s) on the page`, and the comments
  in `src/config.ts` / `src/settings.ts` / `src/client/index.js` say the same.
  / 日志行、两处代码注释和测试文案各说各的：配置面接受 13 个键，生成的设置页上只有
  11 个可投影键（`toolName` 与 `configVersion` 非 volatile，运行时投影会丢掉它们）。
  `describeSurface` 现在报 `11 of 13 field(s) on the page`，`src/config.ts` /
  `src/settings.ts` / `src/client/index.js` 的注释也统一成同一说法。

### Added / 新增

- **The switch that opens a loop now exists, in the composer dock
  / 打开循环的开关有了，就在输入框下面那条 dock 里** — the repeat-run surface shipped in
  `0.11.14` could only be opened by hand-posting `POST /grok-workflow/loop`, because no
  shipped control called it. The composer dock (slot `conversation.composer.dock`, id
  `grok-workflow-loop`) now carries an `Auto-continue` switch for the current session. It
  reads the loop once on mount with `status` and never polls, stays disabled while that
  read is in flight, and a click sends `open` or `close` with no numbers of its own: the
  rule is built from the stored `loopIntervalMin`, `loopMaxRounds` and `loopFailStreak`.
  A refused click does not flip the switch — the last known state stays on the page and
  the line states why (only the operator may open, no scheduler in this composition, a
  non-JSON answer). The switch is a caller of the existing route, not a second
  implementation: same durable row, same `LoopService` methods, and the model-facing tool
  still cannot open a loop.
  / `0.11.14` 落地的续跑面当时只能靠手打 `POST /grok-workflow/loop` 打开，因为没有任何已发布的控件
  去调它。现在输入框下面那条 dock（槽位 `conversation.composer.dock`，id
  `grok-workflow-loop`）带着当前会话的 `自动接着跑` 开关：挂载时用 `status` 读一次、之后不轮询，
  读取期间点不动；点击只为当前会话发 `open` 或 `close`，自己不另带数字——规则按存下来的
  `loopIntervalMin`、`loopMaxRounds`、`loopFailStreak` 生成。被拒绝的点击不会翻面：上一次知道的
  状态留在页面上，并写明原因（只有操作者能打开、这套组合里没有调度服务、回答不是 JSON）。
  这个开关是既有路由的调用方，不是第二套实现：同一条持久行、同一批 `LoopService` 方法，
  面向模型的工具仍然打不开循环。

- **A heartbeat can now be stopped without waiting for the round cap
  / 心跳现在能被提前停住，不必等轮数跑满** — a delivery used to reach `agent/pre-step` as
  `source.kind: 'schedule'` and pass straight through, so the loop ran for as long as the
  Schedule row existed. `src/loop-brakes.ts` now answers one question per heartbeat —
  continue or stop — from facts that already exist: an operator stop file (`.rsi/STOP`,
  movable with `GROK_WORKFLOW_STOP_FILE`), the plugin having been disposed, consecutive
  rounds that wrote no assistant message, rounds already admitted today (cap 24), a token
  budget charged at a fixed 200 000 tokens per admitted round up to 2 000 000, and elapsed
  time since the day's first round. A stop rejects the step with zero model calls **and**
  deletes the Schedule row, so the loop cannot return on the next occurrence. No timer and
  no queue: every fact is read back from the session's own records, so a restarted Host
  still accounts for what the loop already spent. The token figure is a budget, not a
  meter, and a round counts as failed only when it wrote no assistant message — both
  limits are stated in the module rather than implied.
  / 以前投递会以 `source.kind: 'schedule'` 进 `agent/pre-step` 直接放行，所以只要 Schedule 那行还在，
  循环就一直跑。现在 `src/loop-brakes.ts` 每次心跳只回答一个问题——继续还是停——依据是本来就存在的
  事实：操作者的停止文件（`.rsi/STOP`，可用 `GROK_WORKFLOW_STOP_FILE` 改位置）、插件已被卸载、
  连续多少轮没有写出任何助手消息、当天已经放行过多少轮（上限 24）、按每轮固定 200 000 token
  预留到 2 000 000 的预算、以及当天第一轮以来的耗时。停 = 拒绝这一步（零次模型调用）**并且**删掉
  Schedule 那行，所以下一次到点不会再回来。没有 timer 也没有队列：每一项都从会话自己的记录里读回，
  Host 重启后仍然算得清已经花掉多少。token 那个数是预算而不是计量，一轮只有在没写出助手消息时才
  算失败——两条限制都写在模块里，不靠读者猜。

## [0.11.16] - 2026-11-19

### Fixed / 修复

- **A delivered heartbeat is recognised inside DSH's own delivery framing / 投递到的心跳在 DSH 自己的投递包装里也能被认出来** — DSH wraps every scheduled prompt as `[SCHEDULE REMINDER] … reminder_prompt_json: "<the stored prompt>"`, so the `[grok-workflow loop]` marker this plugin writes never leads the text the gate sees. `isLoopHeartbeat` only matched a leading marker, which meant a real delivery fell through to the generic `non-user-source` pass instead of the heartbeat branch — and the loop brakes never ran. Both shapes are now accepted (the gate still pairs the marker with `source.kind === 'schedule'`), with live delivery evidence in `.rsi/evidence/round-017/heartbeat-live/` and regression coverage in `test/loop.spec.ts` + `test/gate.spec.ts`. / DSH 会把每条定时投递的提示词包成 `[SCHEDULE REMINDER] … reminder_prompt_json: "存下来的提示词"`，所以本插件写进心跳的 `[grok-workflow loop]` 标记永远不在门禁看到的文本开头。`isLoopHeartbeat` 以前只认开头的标记，于是真实投递掉进了通用的 `non-user-source` 直通分支，心跳分支和六道刹车一次都没跑到。现在两种形状都认（门禁仍要求标记与 `source.kind === 'schedule'` 配对），真机投递证据在 `.rsi/evidence/round-017/heartbeat-live/`，回归覆盖在 `test/loop.spec.ts` 与 `test/gate.spec.ts`。

- **The settings surface says how many keys it really projects / 设置面现在说清它到底投影几个键** — the log line, the two code comments and the test prose disagreed: 13 accepted keys, 11 volatile keys on the generated page (`toolName` and `configVersion` are plain, so the runtime projection drops them). `describeSurface` now reports `11 of 13 field(s) on the page`, and the comments in `src/config.ts` / `src/settings.ts` / `src/client/index.js` say the same. / 日志行、两处代码注释和测试文案各说各的：配置面接受 13 个键，生成的设置页上只有 11 个可投影键（`toolName` 与 `configVersion` 非 volatile，运行时投影会丢掉它们）。`describeSurface` 现在报 `11 of 13 field(s) on the page`，`src/config.ts` / `src/settings.ts` / `src/client/index.js` 的注释也统一成同一说法。

## [0.11.15] - 2026-11-19

### Fixed / 修复

- **`v0.11.14` was tagged but never released; `0.11.15` is the release that actually
  carries the repeat-run surface / `v0.11.14` 只打了标签、没有发布；`0.11.15` 才是真正
  带上续跑面的发布** — the commit under the `v0.11.14` tag carried a `lib/` built from an
  earlier `src/loop.ts`. The Release workflow stopped at its `Verify committed build
  artifacts` step before creating the GitHub Release, so that tag has no Release and no
  tarball ever shipped. This patch publishes the same source with that `lib/` rebuilt; pin
  `dsh-grok-workflow#v0.11.15`. The tag itself is left in place: published tags are
  immutable, and a hand-made release for it would ship an artifact that is not the build
  of its own source.
  / `v0.11.14` 标签下的提交带着一份用更早的 `src/loop.ts` 构建的 `lib/`。Release 工作流
  在 `Verify committed build artifacts` 一步就停了，没有创建 GitHub Release，所以那个标签
  既没有 Release，也从未产出过压缩包。这个 patch 版本用同一份源码、把那份 `lib/` 重新构建
  后发布；请固定 `dsh-grok-workflow#v0.11.15`。旧标签保持不动：已发布的标签不可变，而手工
  为它建 Release 会发布一个不是它源码构建的产物。

- **The bundle is now provably the build of the source it ships beside
  / 发布产物现在可以证明就是它旁边那份源码的构建** —
  `lib/loop.js` committed at the v0.11.14 tag was built from an earlier `src/loop.ts`:
  it contained no `callSchedule`, so a Host Schedule refusal could not surface as
  `loop/schedule-refused`. The artifact is rebuilt and committed together with its
  source, and the new `npm run verify:lib` (part of `npm run ci`) exports `HEAD`,
  rebuilds it in a temporary directory and fails when `lib/` is not byte-identical to
  that build. The local gate could not see this before by construction — `npm test`
  rebuilds `lib/` and then tests the rebuilt files — so only the remote
  `git diff --exit-code -- lib/` step caught it, after the tag had been pushed.
  / v0.11.14 标签里的 `lib/loop.js` 是更早的 `src/loop.ts` 构建的：里面没有
  `callSchedule`，Host Schedule 的拒绝因此无法变成 `loop/schedule-refused`。现在产物与源码
  一起重新构建并提交，并新增 `npm run verify:lib`（已并入 `npm run ci`）：它导出 `HEAD`，
  在临时目录里重新构建，只要 `lib/` 与该构建不是逐字节相同就报错。本机门禁此前从原理上就
  看不到这个问题——`npm test` 会先重建 `lib/`，再测试重建后的文件——只有远端的
  `git diff --exit-code -- lib/` 能发现它，而那时标签已经推上去了。

- **README test counts corrected / README 的测试数说法已更正** — both READMEs said
  `1022` tests across `57` files, a number from `v0.11.13`; the suite is `1081` tests
  across `60` files. The claim now matches the CI run this release was cut from.
  / 两份 README 此前写「57 个文件 / 1022 个测试」（`v0.11.13` 的数字），而实际是
  **60 个文件 / 1081 个测试**；现在的说法与本版本的发版 CI 一致。

## [0.11.14] - 2026-11-18

### Added / 新增

- **Repeat runs: a loop heartbeat the Host schedules, not a timer in the plugin
  / 自动接着跑：由 Host 调度的循环心跳，不是插件里的定时器** —
  the four repeat-run keys (`loopEnabled` / `loopMaxRounds` / `loopFailStreak` /
  `loopIntervalMin`) now have a driver. `loopEnabled` itself stays a deployment
  default that no run path reads yet; opening a loop is always the session's own
  explicit action. Opening a loop stores one durable `rrule`
  task in the Host's Schedule service, whose delivery target is the same session,
  so each heartbeat is one ordinary turn and the plugin arms no timer of its own.
  Opening is user-only: it happens through `POST /grok-workflow/loop` (behind the
  composition's Host/Origin plus browser-authentication fence), and the
  model-facing `grok_loop` tool can only read (`status`) or delete (`close`) —
  its `open` is refused with `loop/user-only`. The stored prompt carries the
  ownership marker `[grok-workflow loop]` and asks the round to continue
  unfinished work, not redo completed steps, and to stop and report after the
  configured number of consecutive failures.
  Breaker semantics: the round cap is written into the rule as `COUNT`, so the
  schedule ends itself and the row stays `ended` (a later open replaces it); the
  failure streak is guidance in the heartbeat text, because a delivery receipt
  proves an inbox write and not that the round succeeded; the effective interval
  is the largest of 60 minutes, one worst-case round (`timeoutMs`) and
  `loopIntervalMin`, capped at seven days, so `loopIntervalMin` can only raise the
  floor; and close, unload, session stop and archive all **delete** rows instead of
  pausing them, so no heartbeat outlives its owner. A composition without a
  Schedule service answers `loop/unavailable` (503) and the plugin's other
  features keep working.
  / 四个续跑键（`loopEnabled` / `loopMaxRounds` / `loopFailStreak` /
  `loopIntervalMin`）现在有了驱动。`loopEnabled` 本身仍是部署默认值、当前没有运行路径
  读它；打开循环始终是会话自己的显式动作。打开一个循环会在 Host 的 Schedule 服务里存下一条
  持久 `rrule` 任务，投递目标就是同一个会话，所以每次心跳都是一轮普通回合，插件自己不设
  任何 timer。打开是用户专属动作：走 `POST /grok-workflow/loop`（在宿主 Host/Origin 校验
  与浏览器认证闸门之后），面向模型的 `grok_loop` 工具只能读（`status`）或删（`close`），
  它的 `open` 以 `loop/user-only` 被拒绝。存下的文案带归属标记 `[grok-workflow loop]`，
  要求这一轮接着做没做完的事、不重做已完成步骤、连败到配置轮数就停下报告。停的语义：
  轮数上限写进规则的 `COUNT`，跑满后调度自己结束、行留在 `ended`（下次 open 会替换它）；
  连败轮数只是心跳文案里的提示，因为投递回执只证明收件箱写入、不证明这一轮做成了；
  实际间隔取 60 分钟、一轮最坏耗时（`timeoutMs`）、`loopIntervalMin` 三者最大，封顶七天，
  所以 `loopIntervalMin` 只能抬高下限；关闭、卸载、会话停止与归档一律**删行**而不是暂停，
  没有心跳会活得比主人久。没有 Schedule 服务的组合返回 `loop/unavailable`（503），
  插件其余功能照常工作。

### Changed / 变更

- **Settings page: a fifth group for repeat runs / 设置页：续跑成为第五组** —
  the page now renders the four `loop*` fields as their own group (`Repeat by
  default`, rounds at most, stop after failed rounds, minutes between rounds),
  with the hard bounds of the loader (`100` / `20` / `10080`) and the defaults
  `false` / `10` / `3` / `0`. The configuration surface is thirteen keys.
  / 页面把四个 `loop*` 字段渲染成独立一组（默认自动续跑、最多跑几轮、连败几轮就停、
  两轮之间隔几分钟），边界与载入器一致（`100` / `20` / `10080`），默认值
  `false` / `10` / `3` / `0`。配置面共十三个键。

## [0.11.13] - 2026-11-18

### Fixed / 修复

- **READMEs no longer quote a stale test count / README 不再引用过时的测试数** —
  both READMEs said `366 deterministic tests across 22 files` while the suite was at
  57 files / 1022 tests; the two count sentences now quote the measured numbers.
  / 两份 README 都写着 `366 个确定性测试 / 22 个文件`，而实际已是 57 文件 / 1022 测试；
  两处计数句现已按实测改写。
- **Settings-write history note reconciled with the measured record
  / 设置写入历史注记已按实测对账** —
  a clarification line under the Round 15 GUI table states that the pre-t32 NR-4 /
  OQ-018 wording ("no write was performed" / "NOT_RUN — nested path writes are
  source-confirmed only") is superseded by the t32 + Round 15 measurements (real-GUI
  save persisted to `cordis.patch.yml` via `POST /api/settings/mutate`, revision
  0→1, survives reload, applies to a new session); the measured record prevails.
  / 在 Round 15 真机表下方加一行对账澄清：t32 之前的 NR-4 / OQ-018 旧措辞
  （"no write was performed" / "NOT_RUN —— 嵌套写入仅源码确认"）已被 t32 与
  Round 15 的实测取代（真 GUI 保存经 `POST /api/settings/mutate` 落盘
  `cordis.patch.yml`，revision 0→1、重启后仍在、对新会话生效），以实测为准。

## [0.11.12] - 2026-11-18

### Fixed / 修复

- **Warn-path logs and forwarded history no longer risk leaking credentials
  / 告警日志与转发的历史不再有凭据泄漏风险** —
  the three `records.ts` warn paths (`delivery` / `dispose` / `unload notice`)
  logged the raw `error.message`, and `history.ts` redacted *after* truncating to
  1500 chars, so a spaceless secret (long token, JWT) straddling the cap or a PEM
  block cut off without its `END` line slipped through into logs or the next
  model's prompt. The warn paths now log `redactError(error)` like their sibling
  sites, and history redacts first on a bounded `1500 + 8192` window, then
  truncates; a key block with no matching `END` is dropped fail-closed. Benign
  text passes through byte-identical. / `records.ts` 三条 warn 路径
  （`delivery` / `dispose` / `unload notice`）原来直接记 `error.message` 原文，
  `history.ts` 先截断到 1500 字符再脱敏：跨截断点的无空格长密钥（长 token、JWT）
  与缺 `END` 行的 PEM 块会漏网，进日志或下一个模型的提示词。现在 warn 路径改记
  `redactError(error)`（与同文件另三处拉平），历史改为在 `1500 + 8192` 有界窗口
  上先脱敏后截断；无配对 `END` 的密钥块直接 fail-closed 丢弃。良性文本逐字节不变。

### Tests / 测试

- `test/records-redaction.spec.ts` (4): each of the three warn paths throws a fake
  `sk-` secret through its catch and asserts the log line drops it, plus a benign-error
  readability guard. `test/history.spec.ts` (+3): spaceless secret straddling the cap,
  PEM-without-END fail-close, benign long-text byte-identity. Mutation replay: 4 fail
  without the fix, 20/20 pass with it. / 三条 warn 路径各用假 `sk-` 走 catch 并断言
  日志不含密钥，另有良性错误可读性守卫；历史新增跨 cap 无空格密钥、无 END PEM
  fail-closed、良性长文本逐字节一致。变异回放：无修复时 4 个失败，有修复时 20/20 通过。

## [0.11.11] - 2026-11-18

### Tests / 测试

- **A parity guard for the two dictionaries in the browser bundle / 浏览器 bundle 里两本词典的键齐全性守卫** —
  the bundle keeps two tables: the plugin's own `DICT` (settings page, progress tab) and
  `PANEL_DICT` (registered under its own namespace for the re-registered stock run renderer).
  Nothing compared them with the keys the code asks for, so a key typed into the wrong table —
  or added to one language only — would render as a raw key with no test failing. The audit
  found no defect today (137 keys in each plugin locale, 19 in each panel locale, both
  symmetric; every literal, concatenated and dynamically built key resolves), so the round's
  change is the guard: `test/i18n-parity.spec.ts` (6 its) checks locale symmetry in both
  tables, rejects empty copy, resolves every literal `t('…')` in the source, resolves the keys
  the code builds by concatenation (`unit.*`, `mode.*.title`/`.detail`, `option.mode.*`) and
  every dynamic expansion the bundle can produce (`progress.stage.*`, `progress.field.*`,
  `role.*`, `progress.derived.*`, `progress.source.*` from the plugin table; `status.*` and
  `statusCount.*` from the panel table). A key that is missing from the plugin table must be
  one of the six panel-scope keys, so a key that moves between tables fails loudly instead of
  being excused by a blanket "exists somewhere". / bundle 里有两本词典：插件自己的 `DICT`
  （设置页、进度页）与 `PANEL_DICT`（以独立命名空间注册，供重新注册的 stock run 渲染器使用）。
  此前没有任何检查把这两本词典与代码实际请求的键对起来，所以把键写进错误的表、或只加到一个语言，
  都会渲染成原始键而测试照旧全绿。本轮审计没有发现现成缺陷（插件每个语言 137 个键、面板每个语言
  19 个键，两边都对称；字面、拼接与动态生成的键全部可解析），因此本轮的改动就是这个守卫：
  `test/i18n-parity.spec.ts`（6 条）检查两本词典的语言对称性、拒绝空文案、解析源码里每一个字面
  `t('…')`、解析拼接出来的键（`unit.*`、`mode.*.title`/`.detail`、`option.mode.*`）以及 bundle
  能产生的每一种动态展开。插件表里缺失的键必须正好是那六个面板作用域的键，所以「键换到另一张表」
  会直接把测试搞红，而不是被「某处存在」这种宽松断言放过。

- The assertion can fail: removing one `zh` key (`unit.ms`) from the bundle makes two of the six
  its red (`2 failed | 4 passed`), recorded as a deliberate mutation replay in
  `.rsi/evidence/round-011/red.txt`; the file was restored immediately and the green run is
  `6 passed` (`green.txt`). Suite: 56 files / 1015 tests. / 该断言确实会失败：从 bundle 里删掉
  一个 `zh` 键（`unit.ms`）会让 6 条中的 2 条变红（`2 failed | 4 passed`），以**故意变异重放**
  的形式记录在 `.rsi/evidence/round-011/red.txt`；文件随即还原，绿跑为 `6 passed`（`green.txt`）。
  套件：56 文件 / 1015 测试。

## [0.11.10] - 2026-11-18

### Docs / 文档

- **`docs/ARCHITECTURE.md` states version statuses as `since X.Y.Z` instead of "in this release" / `docs/ARCHITECTURE.md` 的版本状态改为 `since X.Y.Z`，不再写「in this release」** —
  a reader could not tell which release "in this release" meant, so the checkpoint section now
  says the code ships since **0.8.0**, the visibility section is headed `Since **0.8.0**`, and
  the two claims about what has no production caller are dated `as of **0.11.9**`. The
  `resume` boundary line names the DSH version it was measured on (**0.2.1-rc.2**) and now also
  says that round 8's install/activation/settings re-check happened on **0.2.2-rc.3** and did
  **not** re-measure that journaling boundary, instead of letting the newer version look like a
  newer measurement. / 读者无法判断「in this release」指哪个版本，因此 checkpoint 一节改为写明
  代码「since **0.8.0**」，用户可见面一节标题改为 `Since **0.8.0**`，两处「没有生产调用方」的
  断言改为「as of **0.11.9**」。`resume` 边界那一行写明它是在 DSH **0.2.1-rc.2** 上测的，并补充
  round 8 在 **0.2.2-rc.3** 上做的是安装/激活/设置面复查、**没有**重新测那条 journaling 边界，
  免得更新的版本看起来像更新的测量。

### Tests / 测试

- New `test/docs-architecture-version.spec.ts` (3 its): no release-relative phrase may appear,
  every `Status (` claim must carry a `since **X.Y.Z**` that does not lead the package version,
  and the resume boundary paragraph must keep naming both the measured version and the one that
  was only re-checked. Replayed red against the previous document (2 failed / 1 passed); the
  suite is 55 files / 1009 tests. / 新增 `test/docs-architecture-version.spec.ts`（3 条）：不得出现
  发布相对措辞；每条 `Status (` 断言必须带一个不超前于包版本的 `since **X.Y.Z**`；`resume` 边界
  段落必须同时写出「实测版本」与「只做复查的版本」。用上一版文档重放为红（2 failed / 1 passed）；
  套件为 55 文件 / 1009 测试。

## [0.11.9] - 2026-11-18

### Fixed / 修复

- **Progress tab: `执行` and `检查` are no longer reported as "not reported" / 进度页不再把「执行」「检查」显示成「事件中没有报告」** —
  the script records the plan-task group title (`任务 1 · 标题`) as the `phase` of every worker
  and verifier call, and the tab matched rows by `phase` alone. The two stages every run
  performs therefore never claimed a row and rendered empty with
  `Not reported in the events` (`进展`), while the rows sat in plan-task nodes right below
  them. A row whose phase names no stage is now also matched by its **role label**
  (`执行`/`检查`, `Execute`/`Check` from `memberLabel()`), and cross-referenced onto that
  stage's new `evidence` list: state comes from the stage's own rows when it has any and from
  its evidence when it has none. `members` stays the one home per row, so the track and the
  percentage still count the same rows, and a task titled `check the build` does not become
  `检查` because role tokens never match a phase. The stage meta line now reads
  `{count} rows ran inside the plan tasks below` / `{count} 行在下方任务节点中执行` instead of
  the not-reported copy, in both locales. / 脚本把每次 worker / verifier 调用的 `phase`
  写成计划任务组标题（`任务 1 · 标题`），而本 Tab 只按 `phase` 匹配行。于是每次运行都必然发生的
  「执行」「检查」两个阶段从来分不到行，渲染成空白并显示「事件中没有报告」，而真正跑过的行就
  摆在它们下面的任务节点里。现在 phase 命中不了任何阶段的行还会按**角色 label**
  （`执行`/`检查`、`Execute`/`Check`，由 `memberLabel()` 生成）判一次归属，并交叉引用到该阶段新增的
  `evidence` 列表：阶段有自己的行就以自己的行为准，没有才看 evidence。`members` 仍是每行唯一的家，
  所以轨道与百分比统计的仍是同一批行；标题里含 `check` 的任务不会因此变成「检查」（角色 token
  不参与 phase 匹配）。阶段 meta 行在两个语言里都改为
  `{count} 行在下方任务节点中执行` / `{count} rows ran inside the plan tasks below`。

### Tests / 测试

- `test/progress-tab.spec.ts` +6 and `test/client.spec.ts` +2 (54 files / 1006 tests, from 999):
  role-label evidence for Chinese and English labels, the failed/doing derivation, a stage's own
  rows winning over its evidence, no evidence invented for a label that names no stage, the
  browser mirror agreeing with the typed rules, and the rendered meta line in both locales. The
  two substring-decoy tests now use a label that names no stage, so they isolate the phase
  channel instead of passing for the wrong reason. / `test/progress-tab.spec.ts` 新增 6 条、
  `test/client.spec.ts` 新增 2 条（54 文件 / 1006 测试，原为 999）：中英文角色 label 的
  evidence、failed/doing 推导、阶段自有行优先于 evidence、没有阶段可归时**不**编造 evidence、
  浏览器镜像与类型规则一致、两个语言下的渲染 meta 行。两条子串诱饵测试改用不含阶段名的 label，
  使它们只检验 phase 通道，而不是因为错误的原因通过。

## [0.11.8] - 2026-11-18

### Changed / 变更

- **DSH `0.2.2-rc.3` is now verified for install, activation and settings projection / DSH `0.2.2-rc.3` 的安装、激活与设置面已有实测** —
  the docs said the bundle "installs and composes" on `0.2.2-rc.3` while behaviour was only
  verified on `0.2.1-rc.2`. A real isolated profile (`web` template, `dsh plugin add` of this
  checkout as a `link:` dependency, `workflow-ptc` re-enabled) was booted on `0.2.2-rc.3`: the
  only boot output was the URL line (no `pending` row, no `did not activate` warning) and
  `POST /api/settings/describe` projected 23 namespaces, one of them `grok-workflow` with
  `autoGenerate: true`. Both READMEs and `docs/LOCAL-TESTING.md` now say exactly that. The
  model-backed message through `grok_workflow` remains **unverified**: the isolated profile has
  no credential and the run stops with
  `MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"`, which
  is recorded as blocked rather than reported as a pass. / 文档原先只说该 bundle 在
  `0.2.2-rc.3` 上「可安装并进入组合图」，行为却只在 `0.2.1-rc.2` 上验证过。本轮用真实孤立 profile
  （`web` 模板、以 `link:` 依赖方式 `dsh plugin add` 本检出、重新启用 `workflow-ptc`）在
  `0.2.2-rc.3` 上启动：启动输出只有一行 URL（没有 `pending` 行、没有 `did not activate` 警告），
  `POST /api/settings/describe` 投出 23 个命名空间，其中包括 `autoGenerate: true` 的
  `grok-workflow`。两份 README 与 `docs/LOCAL-TESTING.md` 现在如实写清这一点。经
  `grok_workflow` 的真模型消息仍未验证：孤立 profile 没有凭据，运行以
  `MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"`
  停下，记为 blocked 而不是 pass。

### Docs / 文档

- `docs/LOCAL-TESTING.md`: a new trap (a `web`-template profile has no `headless` command —
  `dsh --profile <name> headless "task"` is rejected with `too many arguments` and `--host` is
  an unknown option there) and the `MISSING_CREDENTIAL` line a fresh isolated profile produces,
  with the rule that a key is never copied out of another profile to make the smoke test pass. /
  `docs/LOCAL-TESTING.md` 新增一条坑：`web` 模板创建出的 profile 没有 `headless` 命令
  （`dsh --profile <name> headless "task"` 会被 `too many arguments` 拒绝，`--host` 也属未知选项），
  以及全新孤立 profile 会输出的 `MISSING_CREDENTIAL` 行，并写明不得为了糊弄冒烟测试而从别的
  profile 拷密钥。

## [0.11.7] - 2026-11-18

### Docs / 文档

- **The tag inventory is now audited, and the one non-release tag is named / 标签清单已对账，唯一的非发布标签已写明** —
  all 32 remote tags were compared tag-by-tag with the README published list and with
  `package.json` at each tag's commit: 31 release tags match their version, the lists in both
  languages are ascending, duplicate-free, end at the current release and contain no extra or
  missing entry, every tag object is identical locally and on `origin`, and `HEAD` equals
  `origin/main`. The single exception is the prerelease `v0.2.0-rc.1`, which predates the
  release workflow and sits on a commit whose `package.json` still says `0.1.0`; a published
  tag is never moved, so both READMEs now state that it is not a release, and
  `test/docs-version.spec.ts` fails if that note disappears. / 32 个远端标签逐个与 README
  已发布列表、以及各标签所在提交的 `package.json` 对账：31 个发布标签与版本号一致，中英两份
  列表升序、无重复、末项为当前发布、无多余也无缺失，每个标签对象本地与 `origin` 完全相同，
  `HEAD` 与 `origin/main` 一致。唯一例外是预发布标签 `v0.2.0-rc.1`——它早于发布流程，所在提交的
  `package.json` 仍写着 `0.1.0`；已发布标签永不移动，因此两份 README 都写明它不属于发布版本，
  该说明若消失 `test/docs-version.spec.ts` 会失败。

### Tests / 测试

- `test/docs-version.spec.ts` 7 → 8 `it`s: the documented prerelease exception may not be
  removed silently. No skip, no loosened assertion. / `test/docs-version.spec.ts` 从 7 个 `it`
  增至 8 个：已写明的预发布例外不得被悄悄删掉。无跳过、无放宽断言。

## [0.11.6] - 2026-11-18

### Fixed / 修复

- **The local-testing guide named tarballs this release never produced / 本地测试指南指向本版本从未产出的压缩包** —
  four install examples in `docs/LOCAL-TESTING.md` said `dsh-grok-workflow-0.2.0.tgz` /
  `-0.2.1.tgz` while the release line is `0.11.x`, so a reader following the guide hits a
  missing file. All four now name the current artifact, and `.rsi/tools/bump-version.py`
  rewrites the name on every bump, with `test/docs-config-keys.spec.ts` failing if either
  side drifts. / `docs/LOCAL-TESTING.md` 的四处安装示例写着
  `dsh-grok-workflow-0.2.0.tgz` / `-0.2.1.tgz`，而发布线早已是 `0.11.x`，照文档操作会找不到文件。
  四处已改为当前产物名；`.rsi/tools/bump-version.py` 在每次升版本时同步改写该名字，
  `test/docs-config-keys.spec.ts` 任一侧漂移都会失败。
- **A repaired configuration value was documented as a load-time rejection / 一个被修复的配置值写成了载入期拒绝** —
  the troubleshooting entry quoted `roles.synthesizer is set but synthesis is "deterministic"`,
  a message this build never emits. `apply()` repairs a stored `synthesis: "deterministic"` to
  `layered` (and `synthesis: "model"` with an empty synthesizer chain likewise) *before*
  `resolveConfig` runs, so the guide now quotes the two messages the code actually produces —
  `unknown configuration key "triageModel"; accepted keys: …` and
  `synthesis must be "model" or "layered", got "…"` — and states which values are repaired
  instead of refused. / 排障条目引用了本构建从不输出的
  `roles.synthesizer is set but synthesis is "deterministic"`。`apply()` 会在 `resolveConfig`
  之前把存量 `synthesis: "deterministic"` 修复为 `layered`（`synthesis: "model"` 配空的
  synthesizer 链同理），因此文档现改为引用代码真正会输出的两条消息——
  `unknown configuration key "triageModel"; accepted keys: …` 与
  `synthesis must be "model" or "layered", got "…"`——并说明哪两个取值是被修复而非拒绝。
- **The Chinese README used a different notation for the fixed caps / 中文 README 对固化上限用了不同写法** —
  `maxActiveRuns` 每会话 `2` / `maxActiveRunsTotal` 每进程 `8` now reads
  `maxActiveRuns=2`（每会话） / `maxActiveRunsTotal=8`（每进程）, matching the English
  `key=value` form so one guard binds both READMEs to the constants. No number changed. /
  中文改与英文相同的 `key=value` 写法，一份守卫即可把两份 README 钉到同一批常量；数值未变。

### Tests / 测试

- `test/docs-config-keys.spec.ts` 7 → 12 `it`s: `docs/LOCAL-TESTING.md` must name every
  `CONFIG_KEYS` entry and state the count the code enforces, must quote
  `FIXED_MAX_RETRIES` / `FIXED_MAX_ACTIVE_RUNS` / `FIXED_MAX_ACTIVE_RUNS_TOTAL` /
  `DEFAULT_TIMEOUT_MS`, must name only tarballs equal to `package.json`'s version, and must
  quote only messages `src/config.ts` can produce; both READMEs must state all seven fixed
  caps read from the constants. No skip, no loosened assertion. / 
  `test/docs-config-keys.spec.ts` 从 7 个 `it` 增至 12 个：`docs/LOCAL-TESTING.md` 必须点全
  `CONFIG_KEYS` 每一项并写出与代码一致的键数，必须引用
  `FIXED_MAX_RETRIES` / `FIXED_MAX_ACTIVE_RUNS` / `FIXED_MAX_ACTIVE_RUNS_TOTAL` /
  `DEFAULT_TIMEOUT_MS`，只能写与 `package.json` 版本相同的压缩包名，只能引用
  `src/config.ts` 真会输出的消息；两份 README 必须写出从常量读出的七条固化上限。
  无跳过、无放宽断言。

## [0.11.5] - 2026-11-18

### Fixed / 修复

- **Redaction missed four credential shapes and rewrote non-secret code / 脱敏漏掉四类凭据形状，还会改写非敏感代码** —
  `src/redact.ts` now covers (1) a `Cookie`/`Set-Cookie` header written inside a quoted shell
  argument (`curl -H 'Cookie: PHPSESSID=…'`), where the old pattern only matched at line start,
  (2) presigned-URL signatures `X-Amz-Signature`, `X-Goog-Signature` and the generic `auth`
  query parameter, (3) PGP armored `BEGIN PGP PRIVATE KEY BLOCK` blocks, whose banner the PEM
  rule could not match, and (4) short values of `SECRET_KEY` / `PRIVATE_TOKEN`, which the env
  rule's key alternation lacked. Two false positives are gone: `key-value-env` no longer ends a
  value inside a call, a comparison or a code keyword (`const token = await refreshToken()`,
  `if (password == null)` are left untouched), and its value now terminates at a token boundary
  so `db_pass=hunter2;user=app` keeps `;user=app` instead of swallowing it. An already-redacted
  placeholder (`X-Amz-Credential=[REDACTED AWS ACCESS KEY]`) is no longer re-redacted into
  `[REDACTED] AWS ACCESS KEY]`. / `src/redact.ts` 现在覆盖：（1）写在
  shell 引号参数里的 `Cookie`/`Set-Cookie` 头（`curl -H 'Cookie: PHPSESSID=…'`），旧规则只在行首匹配；
  （2）签名链接参数 `X-Amz-Signature`、`X-Goog-Signature` 与通用 `auth`；（3）PGP armor 的
  `BEGIN PGP PRIVATE KEY BLOCK` 块（PEM 规则匹配不到它的横幅）；（4）`SECRET_KEY` / `PRIVATE_TOKEN`
  的短值（env 规则的键名分支原本没有它们）。同时修掉两个误伤：`key-value-env` 不再把值截断在调用、
  比较或代码关键字中间（`const token = await refreshToken()`、`if (password == null)` 原样保留），
  值现在在 token 边界结束，`db_pass=hunter2;user=app` 会保留 `;user=app` 而不再整段吞掉；
  已脱敏的占位符（`X-Amz-Credential=[REDACTED AWS ACCESS KEY]`）不会再被打成
  `[REDACTED] AWS ACCESS KEY]`。

### Docs / 文档

- Both READMEs and `docs/ARCHITECTURE.md` now name the covered credential families, the
  two deliberate asymmetries (over-redaction preferred to rewriting code; a value ends at a
  token boundary) and the known base64-PEM gap; a docs test fails if a family disappears from
  any of the three documents. / 两份 README 与 `docs/ARCHITECTURE.md` 现在列出覆盖的凭据族、
  两处有意取舍（宁可多脱敏，也不改写代码；值在 token 边界结束）以及已知的 base64-PEM 缺口；
  任一份文档丢掉某个族都会让文档测试失败。

### Tests / 测试

- `test/redact.spec.ts` 24 → 32 `it`s: quoted-header cookies, three signed-URL families, PGP
  armor, env value termination, placeholder stability, the code non-rewrite cases, deep-copy
  header keys (`x-api-key`/`secretKey`), and a documentation guard over
  `README.md`/`README.zh-CN.md`/`docs/ARCHITECTURE.md`; the prompt-parity corpus grew from 22
  to 29 samples so the generated script mirror is checked on the new shapes too. / 
  `test/redact.spec.ts` 从 24 个 `it` 增至 32 个：引号内 Cookie 头、三类签名链接、PGP armor、
  env 值边界、占位符稳定、代码不改写、深拷贝头部键（`x-api-key`/`secretKey`），以及对
  `README.md`/`README.zh-CN.md`/`docs/ARCHITECTURE.md` 的文档守卫；提示词一致性用例的语料
  从 22 条增至 29 条，新形状在生成脚本里同样被核对。

## [0.11.4] - 2026-11-18

### Fixed / 修复

- **Settings-page scalar count said seven, the code enforces eight / 设置页标量数写成七个，代码实际是八个** —
  `CONFIG_KEYS` carries nine keys with only `roles` non-scalar, so the scalar settings are
  `toolName`, `mode`, `grokDefault`, `synthesis`, `maxConcurrency`, `maxTasks`, `timeoutMs`,
  `configVersion` (8); both READMEs said seven and now say eight. `test/types/js-yaml.d.ts`
  adds a local `declare module 'js-yaml'` shim (minimal `load` signature) so
  `npm run typecheck` passes without a new dependency, without moving `js-yaml` to
  `dependencies`, and without `ts-ignore` (TS7016). / `CONFIG_KEYS`
  九项中只有 `roles` 是非标量，标量应为 `toolName`、`mode`、`grokDefault`、`synthesis`、
  `maxConcurrency`、`maxTasks`、`timeoutMs`、`configVersion` 共 8 个；两份 README 都写成七个，
  现已改为八个。`test/types/js-yaml.d.ts` 以本地 `declare module 'js-yaml'`
  垫片（含最小 `load` 签名）修通 `npm run typecheck`（TS7016），未新增依赖、
  未把 `js-yaml` 移入 `dependencies`、未使用 `ts-ignore`。

### Tests / 测试

- `test/docs-config-keys.spec.ts` (+4): the configuration-surface size both READMEs state
  must equal `CONFIG_KEYS.length`, every YAML config example must load via `resolveConfig`,
  and the chain limit / role count must quote the enforced `50 routes` with none of the stale
  `three routes` / `four role chains` wording (plus a hard-limit-table row pinning the
  `50`); the 4 new `it` blocks are untouched by the
  typecheck fix. / 两份 README 声明的配置面大小必须等于 `CONFIG_KEYS.length`、
  每个 YAML 配置示例必须经 `resolveConfig` 载入通过、链上限与角色数必须引用实际执行的
  `50 routes` 且不得残留 `three routes` / `four role chains` 旧表述（另加硬上限表行级钉住
  `50`）；修 typecheck 时
  未改动新增的 4 个 `it` 断言。

## [0.11.3] - 2026-11-18

### Fixed / 修复

- **Two configuration keys the loader rejects were missing from the READMEs' list of
  removed keys / 载入时会拒绝的两个配置键，从未出现在 README 的"已删除键"清单里** —
  `triageModel` and `maxActiveRunsTotal` are both in `REMOVED_CONFIG_KEYS`, so a patch that
  still carries either fails to load with `unknown configuration key`; neither name appeared
  in `README.md` or `README.zh-CN.md`, so the person holding that patch had nothing to read.
  Both are now named (the per-process cap was described only as "`8` per process"), and
  `test/docs-config-keys.spec.ts` makes the code's two lists the contract for what the
  READMEs must document. / `triageModel` 与 `maxActiveRunsTotal` 都在
  `REMOVED_CONFIG_KEYS` 里，补丁还带着它们就会 `unknown configuration key` 载入失败，而两份
  README 都没提这两个名字——拿着旧补丁的人查不到任何说明。现在两个键都点名了（每进程上限
  原来只写作「每进程 `8`」），并由 `test/docs-config-keys.spec.ts` 把代码里的两张清单变成
  README 必须满足的约定。

### Tests / 测试

- `test/docs-config-keys.spec.ts` (3): every accepted key must be tabulated and every removed
  key must be named in both READMEs, and the two lists must stay disjoint
  (`REJECT`-worthy key drift is now a red test); red before this round with
  `README.md never mentions the removed key triageModel`.

## [0.11.2] - 2026-11-18

### Fixed / 修复

- **The v0.9.0 release notes were filed under v0.9.1, so v0.9.0 had no changelog entry
  at all / v0.9.0 的发布说明被挪到 v0.9.1 名下，v0.9.0 从此没有更新日志** —
  the `v0.9.1` release commit renamed the `## [0.9.0]` heading in place instead of adding a
  section, so the eleven bilingual entries that shipped the Progress tab are now labelled
  `0.9.1`, and the actual `0.9.1` note (stored caps clamp at load) was later promoted into
  `0.9.2`. The `0.9.0` section is restored verbatim from the commit that released it
  (`2d2b347:CHANGELOG.md`, byte-identical body), the clamp note is back under `0.9.1`, and
  `test/docs-version.spec.ts` now fails when a published tag has no section of its own or
  when the sections are not newest-first. / `v0.9.1` 的发版提交没有新增小节，而是把
  `## [0.9.0]` 的标题就地改名为 `0.9.1`：随进度 Tab 一起发出去的十一条中英条目现在挂在
  `0.9.1` 名下，真正的 `0.9.1` 说明（存量上限载入即钳制）后来又被并入 `0.9.2`。现在
  `0.9.0` 小节从发布它的那次提交逐字恢复（`2d2b347:CHANGELOG.md`，正文逐字节相同），
  钳制说明回到 `0.9.1`；`test/docs-version.spec.ts` 在「已发布标签没有自己的小节」或
  「小节不是由新到旧」时失败。

### Tests / 测试

- `test/docs-version.spec.ts` (7): every published tag must own a `## [x.y.z]` section and
  the sections must be ordered newest-first; red before this round with
  `no changelog section for v0.9.0`.

## [0.11.1] - 2026-11-18

### Fixed / 修复

- **The READMEs no longer advertise a release from three versions ago /
  README 不再推荐三个版本之前的发布** — both languages still said "the package
  version in this repository is `0.8.0`", pinned `#v0.8.0` in every install
  example, and stopped the published-tag list at `v0.8.0`, while the package was
  at `0.11.0` and nine more tags had been pushed. The declared version, the
  install examples, the tag-naming sentence and the published list now come from
  the real tags and are checked by `test/docs-version.spec.ts`, which fails the
  build when the prose and `package.json` disagree. / 中英两份 README 都还写着"本
  仓库声明的包版本是 `0.8.0`"、安装示例固定 `#v0.8.0`、已发布列表停在 `v0.8.0`，而
  包已经是 `0.11.0`、另有九个标签已推送。声明的版本、安装示例、正文里点名的标签、已发布
  列表现在都来自真实标签，并由 `test/docs-version.spec.ts` 钉住：说明文字与
  `package.json` 不一致时构建失败。

### Tests / 测试

- `test/docs-version.spec.ts` (6): declared version in both languages, every
  `plugin add` pin, bare `#vX.Y.Z` prose, published list ordering + last entry,
  and the newest changelog heading all agree with `package.json`.

## [0.11.0] - 2026-11-18

### Added / 新增

- **The run deadline is a setting now: `timeoutMs` / 运行死线变成配置项：`timeoutMs`** —
  the deadline was a fixed internal 60 minutes: raising it for a long job meant
  editing the plugin, and "which deadline was in force?" was only answerable from
  a report. It is now the ninth configuration key (settings page: **Run deadline
  (ms)**, `field.timeoutMs`), defaulting to `3600000` (60 min, the value t45
  measured), `0` = unlimited (no timer is armed). Any non-negative integer up to
  `Number.MAX_SAFE_INTEGER` is accepted; a negative, fractional, `NaN` or
  non-numeric value fails the load with its own reason instead of being
  rewritten. A value above `2147483647` (the largest `setTimeout` delay, which
  Node would fire immediately) is treated as unlimited internally while the
  report and the checkpoint record the configured number honestly. /
  死线以前是写死的 60 分钟：长活想放宽只能改插件，"实际生效的是哪个死线"也只能从报告里
  找。现在它是第九个配置键（设置页 **运行死线（毫秒）**，`field.timeoutMs`），默认
  `3600000`（60 分钟，t45 实测的值），`0` = 不限时（不设 timer）。接受
  `0 … Number.MAX_SAFE_INTEGER` 的任意整数；负数、小数、`NaN`、非数字一律载入失败并给出
  原因，不会被悄悄改写。大于 `2147483647`（`setTimeout` 上限，Node 会立刻触发）的值内部
  按不限时处理，报告与 checkpoint 仍如实记录配置的数字。

## [0.10.2] - 2026-11-17

### Fixed / 修复

- **Settings page no longer crashes on dirty stored data / 设置页不再被脏存量整页崩掉** —
  a non-object `roles` section (null, string, array from a legacy patch or hand edit)
  no longer throws the whole page; the page shows empty chains instead. A stored enum
  value outside the offered options (e.g. a legacy `mode`) is now a red validation
  error that blocks save instead of a green light that the Host then refuses.
  `validate` / `emptyCapWarn` / `opsFor` / `catalog` / `translate` all tolerate null
  inputs without throwing. / 存量 `roles` 非对象（旧补丁或手改留下的 null、字符串、
  数组）不再整页崩，显示空链即可。存量枚举值不在选项里（如旧 `mode`）现在红错锁保存，
  不再绿灯放行再被 Host 拒载。`validate` / `emptyCapWarn` / `opsFor` / `catalog` /
  `translate` 全加空值防御，不再抛错。

## [0.10.1] - 2026-11-17

### Fixed / 修复

- **Settings page: save-blocking bugs fixed, professional rewrite / 设置页：修好存不上，又重画了一遍** —
  execution order is now 1 break-down / 2 do / 3 check / **4 supervise** / 5 wrap-up,
  and the render order matches the numbers; role names carry their numbers
  (`4 · 监督`) in both languages. Mode is two radio cards (Auto / Full) instead
  of a dropdown that hid the difference; the two numbers are steppers (− / ＋,
  clamped 1–100) and the missing `unit.jobs` / `unit.tasks` keys are filled so the
  suffix no longer renders as `—`. Every route row now has a per-run cap input
  (empty = unlimited): a dirty stored cap finally has somewhere to be fixed —
  before, it failed validation with no editor and locked Save forever. Rows that
  block the save are outlined red inline (`missingModel` from one tap on
  `+ Add a backup`, `badCap`, duplicates). Empty chains say plainly that empty
  means "follows this chat, no backup set". Save / refuse / failure copy is in
  plain words. / 执行顺序现为拆活 1 / 干活 2 / 检查 3 / **监督 4** / 收尾 5，
  渲染顺序与序号一致；角色名自带序号（`4 · 监督`），中英双语。模式改双卡片二选一
  （自动挡 / 全员上），不再是藏起差异的下拉；两数字改步进器（− / ＋，钳制 1–100），
  补上缺的 `unit.jobs` / `unit.tasks` 键，后缀不再显示 `—`。每行加单次上限输入框
  （空 = 不限）：存量脏 cap 终于有地方改 —— 以前它校验不过又没编辑框，保存永远锁死。
  卡住保存的行行内红框标出（点一下 `＋ 加备选` 出空行没填完、`badCap`、重复）。
  空链明说空 = "跟这次对话用同一个，没加备选"。保存 / 拒绝 / 失败文案全换白话。

## [0.10.0] - 2026-11-17

### Added / 新增

- **Fifth role `supervisor`: one supervision call per task attempt / 第五角色`监督`：每任务每尝试一次监督调用** —
  a new `roles.supervisor` chain runs after verification and before synthesis;
  it can only fail a task, never pass one, and the settings page shows it as
  the fifth row （拆活/干活/检查/收尾/**监督**）. The per-task budget backstop
  is now `(50+50+50)×4=600` child calls.
  / 新增 `roles.supervisor` 链，在检查之后、收尾之前运行；只能判失败、不能判通过；
  设置页显示为第五行（拆活/干活/检查/收尾/**监督**）。单任务预算上限更新为
  `(50+50+50)×4=600` 次子调用。

### Changed / 变更

- **Settings slim-down: 8 keys stay, 24 removed with fixed behavior
  / 设置页瘦身：保留 8 键，删除 24 键并固化行为** —
  the configuration surface keeps exactly 8 keys (`toolName`, `mode`,
  `grokDefault`, `roles`, `synthesis`, `maxConcurrency`, `maxTasks`,
  `configVersion`). The other 24 keys are no longer accepted: a profile patch
  that still carries one is rejected as an unknown key (R-06), and the plugin
  runs on fixed internal values instead —
  `maxRetries=1`, `timeoutMs=3600000` (60 min),
  `humanSummary=true`, `showDiagnostics=false`, `answerStrategy=in-turn`,
  `triageModel` unset (inherit the run's route), `triageClassifier=rules`,
  `triageFollowupAsFast=true`, `instantReceipt=true`,
  `historyTurns=20` / `historyChars=20000`, `maxQueuedMessages=4`,
  `recordRuns=true`, `showProgress=true`, `recordLimit=256`,
  `switchOn=[]` (built-in policy), `subagentProvider` unset,
  gate always on (`enforceGate`/`gateRequired`/`gateScope`/`gatePreset`
  removed).
  The settings page shows `mode` as `auto`/`full` (`auto` = `triage`
  semantics); the gate delivers `in-turn` only (`relay`/`append` removed —
  they lose the answer on a one-shot app); output is markdown direct from the
  model (`synthesis` keeps `layered` default / `model` optional, `humanSummary`
  always on).
  Migration: delete the 24 keys from your profile patch; if you relied on a
  removed value (e.g. a longer `timeoutMs`, `showDiagnostics: true`, a
  `triageModel` override), there is no replacement — the fixed value above
  applies.
  / 配置表面只保留 8 个键（`toolName`、`mode`、`grokDefault`、`roles`、
  `synthesis`、`maxConcurrency`、`maxTasks`、`configVersion`）。
  其余 24 个键不再接受：旧补丁里还带着会被当未知键拒载（R-06），插件按
  固定内置值运行 —— `maxRetries=1`、`timeoutMs=3600000`（60 分钟）、
  `humanSummary=true`、`showDiagnostics=false`、`answerStrategy=in-turn`、
  `triageModel` 未设（继承本轮路由）、`triageClassifier=rules`、
  `triageFollowupAsFast=true`、`instantReceipt=true`、
  `historyTurns=20` / `historyChars=20000`、`maxQueuedMessages=4`、
  `recordRuns=true`、`showProgress=true`、`recordLimit=256`、
  `switchOn=[]`（内置策略）、`subagentProvider` 未设、门控恒开
  （`enforceGate`/`gateRequired`/`gateScope`/`gatePreset` 删除）。
  设置页 `mode` 显示为 `auto`/`full`（`auto` 即 `triage` 语义）；门控只走
  `in-turn` 投递（`relay`/`append` 删除 —— one-shot 下答案会丢）；输出为
  模型直出的 markdown（`synthesis` 保留 `layered` 默认 / `model` 可选，
  `humanSummary` 恒开）。
  迁移：从 profile 补丁里删掉这 24 个键；若以前依赖过被删的值（如更长的
  `timeoutMs`、`showDiagnostics: true`、`triageModel` 覆盖），没有替代项 ——
  一律按上面的固定值生效。

## [0.9.4] - 2026-11-16

### Added / 新增

- **A missing structured result gets one same-attempt resubmit before any retry
  / 交卷缺失先补交一次，不花重试次数** —
  when a worker call produces no structured result (the child fetched its data
  but never called the submit tool, returned nothing, or crashed the schema
  call), the same attempt now asks once more with a prompt that forbids redoing
  completed work: fetch only what is still missing, then submit immediately.
  The resubmit spends no retry budget (`attempts` stays one entry, marked
  `resubmitted: true`) and only format gaps qualify — transport/model failures,
  setup faults, and explicit non-format failures keep their original path, and a
  second miss records the attempt as failed under the normal retry policy.
  Verification strictness is unchanged: prose without a structured result still
  verifies nothing.
  / 当某次 worker 调用没有返回结构化结果（子会话取到了数据但没调交卷工具、
  返回空、无结构化值），同一次 attempt 先补问一次：prompt 禁止重做已完成的工作，
  只取还缺的、然后立刻交卷。补交不花重试额度（`attempts` 仍是一条，标
  `resubmitted: true`）；只有格式缺失才补交，传输/模型失败、setup 故障、
  明确的非格式失败走原路径；补交再缺才记 attempt 失败、进正常重试。
  核验严格性不变：没有结构化结果的 prose 依然核验不了任何东西。

## [0.9.3] - 2026-11-16

### Added / 新增

- **The Progress tab is now a seven-segment spine with one expanding branch
  / 进度 Tab 改为七段脊 + 单展开分支** —
  the track takes the full width once (seven equal segments, never sideways scroll);
  members grow downward inside the expanded segment only (accordion, one open at a time;
  failed first, else running, else collapsed to counts). An expanded branch shows three
  member cards and folds the rest into a real `+N` line; a failed segment carries a 2px
  red bar, a red dot and a count badge (never a whole red column); blocked is a dashed
  grey edge; the running connector is a flowing blue dashed line, never green. A
  "jump to first failure" button appears only when there is a failure. Under 480px the
  spine turns into a vertical step list (no sideways scroll); colours stay on
  `var(--dsw-alias-*)` tokens with icon + text fallbacks. Only rendering + CSS changed:
  folding, percentage, blocked derivation and the event contract are untouched.
  / 轨道只占一次满宽（七段等分，永不横滚）；成员只在当前展开段下方纵向生长（手风琴，
  同时只开一段：优先失败段，其次运行段，否则全收成计数）。展开段默认露三个成员卡，
  其余收成实数 `+N` 行；失败段只标一处（2px 左红条 + 列头红点 + 计数 badge，不整列描红）；
  阻塞用灰虚边；运行中连线用蓝色流动虚线，绝不用绿。有失败才出现"跳到首个失败"按钮。
  480px 以下轨道转竖排（无横滚）；颜色全走 `var(--dsw-alias-*)`，图标 + 文字兜底。只改了
  渲染 + CSS：折叠、百分比、blocked 推导、事件契约一律未动。

- **The answer comes first, the process is folded away; the main thread speaks first and works in the background
  / 答案为本、过程折叠，主会话先说话、边聊边干** —
  a Q&A run now opens with the direct answer (`答案：… / Answer: …`), followed by what to do next;
  the process tally (`N 项任务核验通过 / verified of N`) lives only in the two-sentence tail, never at
  the opening, and station IDs, coordinates, model routes, deadlines and shell output never reach the
  visible block (they stay in the ledger for `showDiagnostics`). The synthesizer prompt carries hard
  rules (no status-line opening, no machine tokens, paraphrase evidence instead of quoting it, one
  language per clause), enforced by a host-side style guardrail that falls back to the deterministic
  narrative. On an interactive surface the team no longer blocks the main thread: a live first answer
  (written fresh per message by one light model call over the `triageModel` route — structure is fixed,
  wording never is) enters the turn immediately while the workflow runs in the background with the
  progress board; a failed first-answer call degrades to a plainly-labelled template fallback. Saying
  "stop X / focus on Y" cancels the in-flight round and restarts narrowed (whole-round cancel +
  narrow restart; no subtask-level redirect in V1). Headless one-shot keeps the old blocking behaviour
  (`in-turn` fallback) so the final answer is never lost; `answerStrategy` default (`in-turn`), `full`
  pipeline bytes, all caps, verification, redaction, unload-cancel, and every switch default are unchanged.
  / 问答类任务现在首屏就是直接答案（`答案：… / Answer: …`），其次是下一步；过程计数（`N 项任务核验通过 /
  verified of N`）只出现在末尾两句收束语里，站号、坐标、模型路由、时限、shell 输出一律不进可见块
  （`showDiagnostics` 打开才在台账里看）。synthesizer prompt 加硬约束（禁状态行开头、禁机器 token、
  证据只转述不贴原文、单句单语言），宿主侧风格 guardrail 兜底，不合规就回落确定性叙事。可交互会话里
  团队不再挂死主会话：一次轻量模型调用（走 `triageModel` 快手链路）按固定信息结构现场写首答、当即
  `enter`，工作流后台跑、进度节点照常；首答失败则明说降级为模板兜底。说"停掉 X / 重点查 Y"即取消整轮
  并窄化重起（V1 无子任务级重定向）。headless 单发保持阻塞旧行为（`in-turn` 回落），最终答案不丢；
  `answerStrategy` 默认值（`in-turn`）、`full` 管线字节、全部上限、核验、脱敏、unload 取消与各开关默认
  全部不变。

## [0.9.2] - 2026-11-15

### Added / 新增

- **The answer you read opens with the plain-language block, and the machine ledger is no longer part of it
  / 你读到的答复以人话块开头，机器台账不再算答复的一部分** —
  the message this plugin delivers now carries the plain-language block between the relay markers — what
  was done, what came of it, what to do next, in both languages — and the machine ledger is folded *below*
  the closing marker under an explicit guard line that tells the main model never to quote, mention or
  summarise it. The ledger still travels inside the message, because that is the durable copy the Progress
  node detail and the cross-round carry-over read back out of the transcript, but it is no longer what the
  reader sees. `showDiagnostics` puts the ledger back inside the markers for a reader who asks for it.
  Machine detail that a task result can quote (shell commands with flags, digests and hex dumps, URLs and
  file paths, bare file names, fenced and inline code, relay markers) is stripped from the human lines; a
  line that was nothing but machine detail is dropped rather than handed to the reader, while a failure
  reason keeps its own wording.
  / 插件出站的消息现在把人话块放在标记之间——做了什么、结果怎样、下一步，两种语言各一段；机器台账折到
  结束标记**之后**，由一行显式守卫说明「这是给你的内部上下文，不许引用、提及或概括」。台账仍随消息
  留存，因为 Progress 节点详情与跨轮延续正是从 transcript 把它读回来，但它不再是读者看到的东西；
  `showDiagnostics` 打开时台账回到标记内。任务结果里可能被引用的机器细节（带参数的 shell 命令、
  摘要与十六进制转储、URL 与文件路径、裸文件名、围栏与行内代码、relay 标记）会从人话行里剥掉，
  整行都是机器细节的直接丢弃而不是塞给读者；失败原因保留自己的措辞。

### Fixed / 修复

- **Every numeric hard cap now lives in one clamp table, and a clamped value warns once per load
  / 数值硬上限收敛到一张钳制表，钳制告警每次载入一条（B02、B04）** —
  `LIMIT_CAPS` is the single declaration of which numeric keys clamp at a hard maximum and where that
  maximum is (every bound reads `HARD_LIMITS`), and both the schema side (`clampedLimit`) and the
  load-time repair (`repairLimitOverruns`) take their bound from it: a new cap is one line instead of two
  bounds that drift apart. Both layers only keep books; `announceOverruns()` is the single voice and
  de-duplicates by `field:stored`, so a patch that is still over the cap no longer prints one warning per
  message. Ten fields clamp (concurrency, retries, queue length, history turns and chars, tasks, timeout,
  active runs, record limit); per-route `maxInFlight` and `configVersion` are deliberately outside the
  table.
  / `LIMIT_CAPS` 是「哪些数值键按硬上限钳制、界在哪」的唯一声明（界一律读 `HARD_LIMITS`），schema 侧
  （`clampedLimit`）与载入期修复（`repairLimitOverruns`）都从这张表取界：新增上限改一行，不再两处
  各写一个界而漂移。两层钳制都只记账，`announceOverruns()` 是唯一发声点并按 `field:stored` 去重，
  补丁仍超限时不再每条消息刷一条告警。表内 10 个字段（并发、重试、队列长度、历史轮数与字符、
  任务数、超时、活跃 run、记录上限）；每路由 `maxInFlight` 与 `configVersion` 刻意不在表内。

- **The settings banner names the value you stored, not the one that took effect
  / 设置页横幅说的是你存下的值，不是生效后的值（B01）** —
  a banner that read the projected (already clamped) value would show `6` for a patch that says `8` — it
  would quietly change the user's words. It now reads the stored user layer and shows what was actually
  written.
  / 横幅若读投影（已被钳制的）值，补丁写 `8` 会显示成 `6`，等于替用户改口；现在读用户层，显示真正
  写下的值。

- **The progress tab stops drawing stages nothing ever ran
  / 进度 Tab 不再画出没跑过的阶段** —
  a stage token containing Latin letters must now sit on a word boundary (CJK tokens still match as
  substrings), because loose matching read `ui` out of `build`, `tag` out of `stage`/`target` and `sync`
  out of `async`, and drew three stages nobody ran. The node detail takes its seven fields down a fixed
  source ladder — the `stage-detail` event, then the child session's explicit coordination block, then
  `not reported` — and only parses the three explicit block shapes, so prose is never guessed into
  fields; `Copy coordination block` enables only when the block was really parsed. A connector is filled
  only when the node on its left is `done` (the attribute is absent rather than `"false"`), and
  `failed`/`blocked` leave it empty on purpose: the line is evidence, not decoration. A node's ring
  carries one state glyph, replaced by the row count when the node aggregates several rows.
  / 阶段 token 含拉丁字母的现在必须落在词边界（CJK token 仍按子串匹配），因为松匹配从 `build` 里读出
  `ui`、从 `stage`/`target` 里读出 `tag`、从 `async` 里读出 `sync`，凭空画出三个没人跑过的阶段。
  节点详情七个字段走固定来源阶梯——`stage-detail` 事件、子会话显式协调块、`not reported`——只认三种
  显式块形态，散文永不猜成字段；`Copy coordination block` 只在真的解析到块时才可点。连线只在左侧
  节点自己 `done` 时填充（属性缺席而不是 `"false"`），`failed`/`blocked` 故意留空：线是证据，不是
  装饰。节点环里一个状态字形，聚合多行时换成行数。

### Tests / 测试

- **Two gate tests waited on the wrong condition and are re-synchronized (`test/gate.spec.ts` only)
  / 两条 gate 测试等错了条件，已重新同步（只改 `test/gate.spec.ts`）** —
  no product behaviour changed. The queue-full test waited for one relay follow-up, which the refusal
  notice already satisfies, so it re-dispatched while the admitted batch was still draining, was refused
  by the same full queue, and never started the run it is about; it now waits for both messages. The
  append test waited for two session appends, which the run's own progress events already satisfy, so it
  asserted before the answer was written; it now waits for the `assistant/message`. Both were
  timing-sensitive on this host (red locally, green in CI on Node 22/24 at the same commit); the new
  conditions are ordering-based, not clock-based.
  / 产品行为未变。队列满那条等的是「一条 relay follow-up」，而拒绝通知本身就满足它，于是在被受理的
  批次还在排空时就重发、又被同一个满队列拒绝，它要验证的那次 run 根本没起来；现在等两条消息都到。
  append 那条等「两条 session append」，而 run 自己的进度事件就满足它，于是断言早于答复落盘；现在
  等 `assistant/message`。两条在本机是时序敏感的（同一个提交本机红、CI 的 Node 22/24 绿）；新条件
  依据的是先后顺序，不是时钟。

## [0.9.1] - 2026-11-15

### Fixed / 修复

- **Stored `maxConcurrency` / `maxRetries` over the hard maximum no longer disables the whole plugin
  / 存量 `maxConcurrency` / `maxRetries` 超上限不再让整个插件起不来** —
  a profile patch written before v0.9.0 (e.g. `maxConcurrency: 8`, `maxRetries: 5`) now activates
  at the documented caps (`6` / `3`) with one bilingual warning per field instead of failing the
  whole `grok-workflow` row with `ValidationError`. Values below the minimum, non-numbers, and
  programmatic `resolveConfig` overruns still fail closed (R-06); the caps themselves are unchanged.
  / v0.9.0 之前写的 profile 补丁（如 `maxConcurrency: 8`、`maxRetries: 5`）现在按文档上限
  （`6` / `3`）钳制生效，每项一条中英告警，不再让整行 `grok-workflow` 报 `ValidationError`
  起不来。低于下限、非数字、程序化 `resolveConfig` 越界仍硬拒绝（R-06），上限本身不变。

## [0.9.0] - 2026-11-15

### Added / 新增

- **A third tab shows what the workflow is doing, folded from the events it records
  / 第三个 Tab 展示工作流正在做什么 —— 全部由它自己记录的事件折叠而来** —
  the session now has three tabs, `Chat / Trajectory / Progress` (对话 / 轨迹 / 进度). The progress
  tab is not selected by default and adds no setting, no button and no new registration elsewhere.
  The track is folded from the four `tool-workflow/*` events this plugin already records
  (`run-start`, `agent-start`, `agent-end`, `run-end`): a stage the engine never reported stays
  `pending` with `Not reported in the events` instead of borrowing a neighbour's state, and the
  percentage is `settled/declared` — absent when no row is declared, never a guess. The states are
  `pending`, `doing`, `done`, `cancelled` (the engine's own word), plus two the view derives and
  explains on the node itself: `failed` (wins over an unfinished row) and `blocked` (a run that ended
  over a row it never settled, with the reason). Clicking a node opens a three-part detail popover:
  the header, `Engine facts` (seq / label / phase / child session / outcome / duration, verbatim from
  the events) and `Stage report` (seven fields, each with its own source badge; `—` plus
  `Source: not reported` when nothing was recorded, and `Copy coordination block` disabled rather than
  claiming there is something to copy). `Open child session` really opens the child. At ≤480 px the
  detail becomes a bottom drawer with single-column fields; every ring and dot colour comes from a
  `var(--dsw-alias-…)` design token with the old hex as fallback, so dark mode follows the theme
  without a separate stylesheet.
  / 会话有三个 Tab：`对话 / 轨迹 / 进度`。进度 Tab 不默认选中，也不新增设置项、按钮或别处的注册。
  轨道只从插件已经记录的四个 `tool-workflow/*` 事件折叠：引擎没报的阶段保持 `pending` 并标注
  「事件里没有报告」，不借邻居状态；百分比是「已结算 / 已声明」，没有声明行时整段缺席，不做猜测。
  状态为 `pending`、`doing`、`done`、`cancelled`（引擎原话），另加两个由视图派生并在节点上说明理由的：
  `failed`（压过未完成行）与 `blocked`（运行结束却留下未结算行，并给出原因）。点节点开三段浮层：头部、
  `Engine facts`（seq / 标签 / 阶段 / 子会话 / 结果 / 时长，逐字取自事件）、`Stage report`（七个字段各带
  来源徽标；没有记录就是 `—` 加「事件里没有报告」，`Copy coordination block` 在无协调块时置灰，而不是
  谎报可复制）。`Open child session` 真的能打开子会话。≤480 px 详情变底部抽屉、字段单列；环与点的颜色
  全部来自 `var(--dsw-alias-…)` 设计 token（旧 hex 兜底），深色主题无需另写样式表即可跟随。

### Fixed / 修复

- **The plugin declares a real DSH version range, and declares it in one place
  / 插件声明真实的 DSH 版本区间，且只声明一处 (B01)** —
  `engines.dsh` is now `>=0.2.1-rc.2 <0.3.0` instead of the single fixed version `0.2.1-rc.2`, and the
  hand-written `dsh.compatibility` block (`dsh` / `profiles` / `dshReleases`) is gone: one source of
  truth for "which runtime can install this". Measured on the real runtime `0.2.2-rc.3` the check
  reports no unmet requirement, while a control range (`<0.2.0`) is still refused — so the check is
  not vacuous. The boundary is recorded honestly: DSH evaluates a range with `includePrerelease`, so
  `<0.3.0` also admits `0.3.0-rc.*`.
  / `engines.dsh` 由固定版本 `0.2.1-rc.2` 改为区间 `>=0.2.1-rc.2 <0.3.0`，并删除手写的
  `dsh.compatibility`（`dsh` / `profiles` / `dshReleases`）整块——「哪个运行时能装」只有一处真源。
  在真实运行时 `0.2.2-rc.3` 上判定为无未满足要求，而对照区间 `<0.2.0` 仍被拒绝，说明检查不是空转。
  边界如实记录：DSH 用 `includePrerelease` 判区间，故 `<0.3.0` 也会放行 `0.3.0-rc.*`。

- **The front desk stops misfiling the messages it reads / 前台不再误读它读到的消息 (B02, B09)** —
  two fixes in `src/triage.ts`: the signal scan is bounded (`TRIAGE_LIMITS.signalChars`), so a 32k
  paste no longer costs seconds inside one message's scan; and a three-part list written with 顿号 or
  full-width commas counts as three things instead of one, so it is no longer answered by a single
  quick worker. The front desk's own reply is also read as one answer rather than thrown away.
  / `src/triage.ts` 两处修复：信号扫描有界（`TRIAGE_LIMITS.signalChars`），32k 粘贴不再让单条消息的
  扫描按秒计；用顿号或全角逗号写的三件事算三件事，不再被压成单个 quick worker。前台自己的回复也按
  「一个答复」解析，不再被整段丢弃。

- **A message that answers the pending question and carries new work is one job, not two half-jobs
  / 「先回答、再派新活」是一条工作，不是两个半截 (B05)** —
  the worker receives the answered request and the new work in the same message, and the answer is
  described as what it is instead of being dressed up as the task objective.
  / 工人在同一条消息里拿到被回答的请求和新工作；答复按其本来面目描述，不再被包装成任务目标。

- **The gate keeps what it must remember, and names its own reason
  / 门禁记住该记的，理由出自它自己 (B04, B06, B08, B18)** —
  a second question no longer erases the still-unanswered first one (B04); the resumed request is cut
  to the objective budget instead of refusing the whole run (B08); when this plugin is itself the
  writer of a claimed batch (`relay` / `append`), the history read that follows leaves those ids out,
  so the message the user just typed is not replayed as context (B06); and the opt-in hybrid
  classifier's verdict carries its own sentence instead of borrowing the rules sentence (B18).
  / 第二个问题不再抹掉仍未作答的第一个（B04）；复述的请求裁剪到 objective 预算内，而不是拒绝整轮
  （B08）；当本插件自己就是被 claim 批次的写者（`relay` / `append`）时，随后的历史读排除这些 id，
  用户刚打的字不会被当上下文回放（B06）；可选的混合分类器给出的档位带它自己的理由句，不借用规则句
  （B18）。

- **`/grok` only says "on" about a toggle the session can show
  / `/grok` 只在会话真能出示记录时才说「已开启」 (B03)** —
  the command reads the record back after writing. A session that refuses the append, or accepts it
  without committing it, settles as an error that states the state the session really has
  (`the toggle is still off`), never the success wording; an agent without a session settles as an
  error too.
  / 命令写入后读回记录：会话拒绝写入、或接受了却没落地，都以失败结算并说出真实状态（「开关仍是关闭」），
  绝不使用成功文案；没有会话的 agent 同样按失败结算。

- **A failure reason that merely contains a ledger word is no longer deleted
  / 只是包含台账词的失败原因不再被删掉 (B10)** —
  the guard that keeps machine ledger labels out of the human block was a raw substring scan, so a real
  reason such as `task aborted before any attempt: [infrastructure/timeout] …` was dropped line by line
  and the reader saw a bare title with no reason at all. The guard is anchored / whole-word now, and the
  two fields carrying the run's own failure text (`incomplete[].reason`, `task.error`) are no longer
  scrubbed field-by-field. A line that really is a ledger label is still dropped.
  / 把人话块里台账标签挡掉的守卫原来是裸子串扫描，于是 `task aborted before any attempt:
  [infrastructure/timeout] …` 这种真实原因被逐行丢掉，读者只看到标题、没有原因。现在守卫改成锚定 /
  整词，且承载运行自身失败文本的两个字段（`incomplete[].reason`、`task.error`）不再逐字段清洗；
  真正是台账标签的行仍然被挡掉。

- **Concurrency and retries are back inside the documented envelope, and the per-task call backstop is
  the worst legal case / 并发与重试回到文档契约内，单任务调用上界取最坏合法值 (B07)** —
  hard caps `maxConcurrency` 1,000,000 → 6 and `maxRetries` 10 → 3, defaults 4 / 2 → 3 / 1, declared
  once as `DEFAULT_MAX_CONCURRENCY` / `DEFAULT_MAX_RETRIES`; the generated script's numbers stay in
  parity by test. `maxAttemptsPerTask` 1100 → 400, derived as `(50 + 50) × (3 + 1)` — the worker plus
  verifier chain ceilings at the retry cap — with the guard still `>`, so the worst legal combination
  loads and only "widened a limit and forgot this" trips it. A default run's checkpoint therefore no
  longer reports a contract violation; older files still load, because the read side stays lenient and
  reports an out-of-envelope row instead of migrating it.
  / 硬上限 `maxConcurrency` 1,000,000 → 6、`maxRetries` 10 → 3，默认 4 / 2 → 3 / 1，单一声明
  `DEFAULT_MAX_CONCURRENCY` / `DEFAULT_MAX_RETRIES`；生成脚本里的数字由测试保持同步。
  `maxAttemptsPerTask` 1100 → 400，取值 = `(50 + 50) × (3 + 1)`（worker 与 verifier 的链上限 × 重试
  上限），守卫仍是 `>`，所以最坏合法组合能通过，只有「放宽了某个上限却忘了这里」才会撞到。默认运行的
  checkpoint 因此不再记录越界；旧文件仍能读——读侧保持宽松，只报告越界而不迁移。

- **The checkpoint records the run's real identity, and stops visibly instead of silently
  / 检查点记录运行的真实身份，停止时可见而不是静默 (B12–B15)** —
  the durable task identity comes from the engine's `meta.name` (redacted and bounded) and
  `stages` / `agents` are always present instead of `undefined` (B12); staleness is judged on its own
  1 s–24 h range rather than the write interval, and a stamp in the future is "possibly live", never
  stale (B13); at most one write per run file is in flight, and two ids that sanitize to the same name
  stay separate (B14); an absent `limits` block is recorded as the contract defaults, and the loop that
  gives up says so exactly once, visibly (B15).
  / 持久任务身份取自引擎 `meta.name`（脱敏且有界），`stages` / `agents` 恒存在而非 `undefined`
  （B12）；陈旧判定用自有 1 s–24 h 区间而不是写间隔，未来时间戳算「可能仍活」、绝不算陈旧（B13）；
  同一 run 文件同时只有一个写在飞，两个清洗后同名的 id 仍分开（B14）；缺省 `limits` 按契约默认值
  记录，放弃写入时只说一次且可见（B15）。

- **The browser bundle stops leaking key ids and stops overflowing narrow windows
  / 浏览器端不再泄露 key、不再在窄窗溢出** —
  status dots come from the design tokens (`var(--dsw-alias-…)`, old hex as fallback) so they follow
  the theme; a translation the framework cannot resolve never renders the key id (this bundle's own
  table answers first, then `—`); an engine status the panel does not word renders `状态未知` /
  `Unknown` and still counts in its phase summary; the settings page keeps `loading`, `error` (the
  reason, plus one retry) and `unavailable` (a good answer that does not serve this namespace) apart
  instead of showing "读取中…" forever after a failed read, and advertises the Host's real ranges
  (`maxConcurrency` 1–6, `maxRetries` 0–3, defaults 3 and 1); a field row collapses to one column at
  ≤560 px so the card no longer overflows; and a task row stops printing the engine's own child label
  (`` `${name} child ${callId}` ``) — it shows neutral `Subagent` / `子代理` plus the call state, and
  shows any other label exactly as recorded without guessing a role.
  / 状态点改用设计 token（`var(--dsw-alias-…)`，旧 hex 兜底），跟随主题；框架解析不出的翻译不再把 key
  显示出来（先查本包自己的词表，再退到 `—`）；面板不认识的引擎状态显示「状态未知」并仍计入阶段汇总；
  设置页把「加载中 / 失败（带原因 + 一次重试）/ 不可用（答复正常但不含本命名空间）」三态分开，
  读取失败不再永远显示「读取中…」，且只提供 Host 真实接受的范围（`maxConcurrency` 1–6、
  `maxRetries` 0–3，默认 3 / 1）；字段行在 ≤560 px 收成单列，卡片不再横向溢出；任务行不再直接印
  引擎自己的子标签（`` `${name} child ${callId}` ``），改用中性的「子代理 / Subagent」加调用状态，
  其它标签按记录原样显示、不猜角色。

- **Docs match the code again / 文档与代码重新对齐** —
  `README` / `README.zh-CN` describe the front desk (the tier on the answer's first line) and the
  opt-in per-session toggle instead of "every message runs the full workflow", and the DSH badge reads
  `0.2.x`; `docs/ARCHITECTURE.md` states the real envelope (default 3 / max 6, default 1 / max 3) and
  explains why the checkpoint read side stays lenient; `docs/LOCAL-TESTING.md` corrects the defaults
  (`maxTasks` 12, `timeoutMs` 3600000); `docs/task-progress-panel.md` gains the client-surface
  hardening section and the rule about engine child labels.
  / `README` / `README.zh-CN` 改讲前台（档位写在回答首行）与按会话开启的开关，不再说「每条消息都走
  全流程」，DSH 徽章改为 `0.2.x`；`docs/ARCHITECTURE.md` 写清真实包络（默认 3 / 上限 6、默认 1 /
  上限 3）并解释 checkpoint 读侧为何保持宽松；`docs/LOCAL-TESTING.md` 修正默认值（`maxTasks` 12、
  `timeoutMs` 3600000）；`docs/task-progress-panel.md` 增加客户端加固一节与「不印引擎子标签」的规则。

## [0.8.0] - 2026-11-13

### Added / 新增

- **The human conclusion now has its own delivery layer — the reader contract is unchanged
  / 人话结论有了独立的交付层 —— 读者契约不变** —
  new `src/delivery/` (`humanConclusion` + `machineLedger` + `deliverReport`) composes the
  relay-ready text for every `RunOutcome` in `src/run.ts`: the human block first, the machine
  ledger only when the live `showDiagnostics` switch asks for it (default off). `report.ts`
  stays the canonical machine renderer for the tool surface; the delivery layer is the relay
  handoff for `runWorkflow` exits (validated report, kept cancellation, deadline, engine error).
  It never dresses a failure as success, never drops `uncertainties`, and never lets an internal
  id reach a human. The user-visible contract is unchanged: the same head, the same ledger
  rules, the same switches — only the composer moved, so no path can deliver a bare machine
  report again.
  / 新增 `src/delivery/`（`humanConclusion` ＋ `machineLedger` ＋ `deliverReport`），为 `src/run.ts`
  的每个 `RunOutcome` 拼出可直接转发的文本：人话块在前，机器台账只在 `showDiagnostics` 打开时才跟
  在后面（默认关）。`report.ts` 仍是工具面的机器渲染器；交付层是 `runWorkflow` 各退出的转发装配
  （核验报告、保留的取消、超时、引擎错误）。它永不把失败打扮成成功、永不丢 `uncertainties`、永不
  让内部 id 进人话。读者契约不变：同样的头、同样的台账规则、同样的开关——只是装配点收拢了，所以
  任何路径都不再能交出裸机器报告。

- **Each run now writes one bounded, checksummed checkpoint file — what you see does not change
  / 每轮运行写一份有界、带校验的检查点文件 —— 你看到的内容不变** —
  new `src/checkpoint/` (versioned schema + atomic writer + engine wiring) and `src/resume/`
  (validator + restore policy) record how a workflow run can be captured and later re-driven.
  The installed plugin changes in no user-visible way: no report line, no setting, no button. What a run gains is a JSON
  file — `checkpoint-<runId>.json` under `$DSH_HOME` or `GROK_WORKFLOW_CHECKPOINT_DIR` plus
  `checkpoints/grok-workflow`, else `~/.dsh/checkpoints/grok-workflow` — rewritten every 30 s
  (bounded to 1 s–300 s, timer `unref()`ed so it never keeps the process alive), plus a terminal
  one at the end and a `cancelled` one when the plugin unloads mid-run. Recording can never break
  the run it records: a failed write is a warning and a counter, and after 3 consecutive failures
  that run stops being retried.
  A checkpoint is one JSON file per run. The writer writes a hidden `*.tmp` in the target
  directory, fsyncs it, then renames it into place (atomic on POSIX and Windows), and removes
  the temporary file on any failure — a reader never sees a half-written checkpoint and a
  failed write leaves the previous one intact. The file carries a sha-256 over its canonical
  payload (sorted keys, no `undefined` fields), and `readCheckpoint` refuses a file whose
  bytes no longer match. Hard bounds: 1 MiB per file (the writer refuses before touching the
  disk, the reader `stat`s before parsing), 128 plan/task rows, 512 agent rows, 16 stages,
  1,024 evidence rows, a 4,000-character objective, 600-character titles and acceptance
  criteria, 1,000-character errors and claims, 400-character locators, and a
  12,000-character min-context digest. Oversized free text is truncated with an explicit
  ellipsis; a count above its ceiling and a file above 1 MiB are refused. Every free-text
  field is redacted at build time, so a checkpoint carries no secrets and is safe to attach
  to an Issue.
  Refusals are a closed vocabulary. Writing or reading a run document fails as exactly
  `invalid`, `too-large`, `integrity` or `io`; restoring fails as exactly
  `version-mismatch`, `corruption` or `conflict` — the restore format is version 1 with
  envelope `grok-workflow.resume-checkpoint`, and any other version is refused rather than
  migrated. Restore fails closed: `evaluateResumeCheckpoint` returns a refusal instead of a
  plan whenever validation refuses, so a corrupt, foreign-version or wrong-run checkpoint can
  never trigger an automatic restart. `resume` here never means engine-level resume (the shipped engine journals nothing, stated as a limitation): it means starting a new run that re-drives the unfinished tasks from the recorded context, because the verified rows say which work is already done. Retention keeps exactly five journaled states
  (completed, interrupted, failed, gated, evidence-incomplete) together with their outputs,
  files and evidence, and never retains a bare `success` mark — a self-report is not
  verification, so that task goes back to the planner instead.
  / 新增 `src/checkpoint/`（版本化 schema ＋ 原子写入器 ＋ 引擎接线）与 `src/resume/`（校验器 ＋
  恢复策略），把「一轮工作流怎么记录、怎么重跑未完成部分」落成有界文档。本版装好后没有任何用户可见
  变化：不增加报告行、不增加设置项、不增加按钮。一轮运行
  多的只是一个 JSON 文件——`$DSH_HOME` 或 `GROK_WORKFLOW_CHECKPOINT_DIR` 下的
  `checkpoints/grok-workflow`（否则 `~/.dsh/checkpoints/grok-workflow`）里的
  `checkpoint-<runId>.json`，每 30 秒重写一次（限制在 1 秒–300 秒，定时器 `unref()`，不会吊住
  进程），结束时写一份终态，插件中途卸载则写一份 `cancelled`。记录永远不会破坏被记录的工作：
  写失败只产生一条警告和一个计数器，连续失败 3 次后该轮停止重试。
  一个运行 = 一个 JSON 文件。写入器先在同目录写隐藏 `*.tmp`、fsync，再 rename 到位（POSIX 与
  Windows 都原子），任何失败都会删掉临时文件——读者永远不会看到写了一半的检查点，写失败也不会
  毁掉上一份。文件带 sha-256（覆盖规范化 JSON：键排序、无 `undefined` 字段），`readCheckpoint`
  会让字节对不上的文件直接失败。硬上限：单文件 1 MiB（写入前拒绝、读取先 stat 再解析）、
  128 条计划/任务行、512 条 agent 行、16 个阶段、1,024 条证据、目标 4,000 字符、标题与验收条款
  600 字符、错误与结论 1,000 字符、定位符 400 字符、最小上下文摘要 12,000 字符。自由文本超长按
  显式省略号截断；计数越界与文件超 1 MiB 直接拒绝。所有自由文本在构建期过脱敏，因此检查点不含密钥，
  可以直接贴进 Issue。
  拒绝原因是一套封闭词表：读写运行文档只可能是 `invalid` / `too-large` / `integrity` / `io`；
  恢复只可能是 `version-mismatch` / `corruption` / `conflict`——恢复文档格式版本固定为 1、信封
  `grok-workflow.resume-checkpoint`，其他版本一律拒绝、不做迁移。恢复是失败关闭的：只要校验拒绝，
  `evaluateResumeCheckpoint` 就返回拒绝而不产出计划，所以损坏、版本不符或不属于本轮的检查点永远
  无法触发自动重跑。这里的 `resume` 从不是引擎级恢复（随附引擎无日志、无恢复，已声明为限制）：
  它指带着已记录上下文起一个新轮次，把未完成任务重跑一遍，因为已核验行说明了哪些活已经干完。
  保留策略只保留五种已记账状态（completed / interrupted / failed / gated /
  evidence-incomplete）及其产出、文件、证据，裸 `success` **永不**保留——自我声明不是验证，
  这类任务回到规划器重排。

- **A third value for `synthesis`: `layered` — the answer is in plain language even when no model
  answers / `synthesis` 多了第三个取值 `layered`——模型答不出来，结论照样是人话** —
  `deterministic` (the default, behaviour unchanged) aggregates by rule and ships the report;
  `model` spends one synthesizer call on the narrative. `layered` keeps the verified report as the
  only source of fact and adds a natural-language summary built in the script itself, which *is*
  the answer whenever the model path is unavailable — no synthesizer chain configured, every route
  dead, an empty or invalid summary, or a text the guardrail refuses. One constrained polish call
  is made only when `roles.synthesizer` is non-empty, and it may rewrite nothing but
  `synthesis.summary`. Its text is checked deterministically before use: it cannot claim full
  success while the run is not `completed`, cannot claim passing tests when no checker verified a
  pass, cannot deny the incomplete items or open questions the report lists, and cannot cite a
  backticked path or command the report does not contain. A polished answer also gets the report's
  own notes appended (unfinished items, open questions, and test counts split into
  checker-verified vs executor-reported), so a fluent summary cannot quietly drop them. With
  `humanSummary: false` a `layered` run composes no narrative at all and spends no synthesizer
  call — the machine report is the whole answer, exactly as `deterministic` behaves. With
  `showDiagnostics` on, the narrative carries one provenance line saying whether it is the
  polished text, the model narrative, or the deterministic fallback and why, paid out of the same
  character budget below. Bounds:
  2,000 characters for the summary and 6,000 for the digest the polish may read, mirrored as
  `HARD_LIMITS.synthesisSummaryChars` / `HARD_LIMITS.synthesisDigestChars` and pinned equal on both
  sides of the script boundary by `test/synthesis-guardrails.spec.ts`. The report's
  `synthesis.mode` still carries only `deterministic`/`model` — it says whether a polish call was
  in play, never the policy. A value outside the three is refused at load with a named error
  instead of falling through silently. The `README.md` value table now lists all three values.
  / `deterministic`（默认，行为不变）按规则聚合并给出报告；`model` 花一次合成调用写叙述；
  `layered` 以核验过的报告为唯一事实来源，另在脚本内建一段自然语言结论——只要模型这条路不可用
  （没配 synthesizer 链、所有路由都挂、摘要为空或非法、被事实护栏拒），这段就是最终结论。只有
  `roles.synthesizer` 非空时才额外做一次受约束的润色调用，且只允许改写 `synthesis.summary`。
  润色文本在使用前过一道确定性护栏：运行状态不是 `completed` 时不得声称全部通过；没有检查者核验过的
  通过时不得声称测试通过；不得否认报告里列出的未完成项与待确认项；反引号里引用的路径或命令必须在报告
  里真实存在。润色稿还会附上报告自己的附注（未完成项、待确认项，以及把「检查者核验」与「执行者自报」
  分开统计的测试计数），流利的总结没法把它们悄悄省掉。`humanSummary: false` 时 `layered` 一轮完全
  不写叙述、也不花合成调用——机器报告就是全部答复，与 `deterministic` 完全一致。打开
  `showDiagnostics` 时，叙述尾部会多一行来源说明（润色稿 / 模型直写 / 确定性回退及原因），并从下面
  同一个字符预算里支出。上限：结论 2,000 字符、润色可读的摘要
  6,000 字符，两侧常量分别落在 `HARD_LIMITS.synthesisSummaryChars` /
  `HARD_LIMITS.synthesisDigestChars`，由 `test/synthesis-guardrails.spec.ts` 钉住。报告的
  `synthesis.mode` 仍只有 `deterministic`/`model`——它说明这一轮有没有发生润色调用，不表示策略。
  三个取值之外的值在载入时直接报出具体错误，不会静默落空。这些是**未提交、不在已安装插件里**的工作树
  代码；`README.md` 的设置取值表当时仍写两值。

### Changed / 变更

- **Every final answer now opens in plain language — including the ones that failed — while the
  machine ledger stays hidden until you ask for it / 每种最终结果现在都用一句人话开场，失败的也一样
  ——机器台账仍默认隐藏** —
  the plain-language head used to be composed in two places (the front desk's team branch and
  `/grok on`), so any other path could hand back the raw ledger: a PARTIAL that arrived through the
  front desk opened at `Grok workflow: PARTIAL`, and a failed run got no head at all. One composer,
  `humanHead()`, now serves every path that can deliver a report — the front-desk answer, `/grok on`,
  and the report kept from a cancelled run — and every status. `completed` keeps the `0.7.0` wording
  unchanged. `partial` keeps the same marker, names up to three unfinished items and says what to do
  next. `failed` gets its own marker (`【人话结论·未完成】` / `【Plain summary · not completed】`) that
  never reuses the success sentence, one bounded reason line, and advice matched to the measured
  failure category (infrastructure, configuration, quality, cancelled, unknown). It is deterministic
  on purpose: no model call, so engine call counts and the one-shot budget are untouched. It is
  bounded: two summary lines (400 characters), three named unfinished items, a 200-character reason.
  `humanSummary: false` still means no head at all. Diagnostics stay opt-in: `showDiagnostics` is
  still default **off**, and the switch now actually reaches two paths that used to ignore it — the
  report text delivered to the reader (it had only been wired into the PTC `render` tool, so turning
  it on in the settings changed nothing about the answer received) and the report kept in a
  cancelled answer. `Uncertainties` stay visible with the switch off, in all of these paths.
  / 人话结论以前只在两处拼（前台团队分支与 `/grok on`），其它路径就只能把机器台账原样交出去：经前台
  到达的 PARTIAL 会以 `Grok workflow: PARTIAL` 开头，失败的运行连一句开场都没有。现在由同一个
  `humanHead()` 服务所有可能交付报告的路径——前台答复、`/grok on`、以及被取消时保留的报告——并且覆盖
  每一种状态。`completed` 与 `0.7.0` 的措辞完全一致。`partial` 保留同一标记，点名最多三项没做成的
  事，并给出下一步。`failed` 用自己独占的标记（`【人话结论·未完成】` / `【Plain summary · not
  completed】`），永不复用成功句式，附一行有界的失败原因，并按实测的失败类别
  （infrastructure / configuration / quality / cancelled / unknown）给出可执行的下一步。它刻意是
  确定性的：不调模型，所以引擎调用数与前台上限一分不动。它是有界的：摘要两行（400 字符）、最多点名
  三项未完成、原因 200 字符。`humanSummary: false` 仍然表示完全不加这段。诊断仍是按需：
  `showDiagnostics` 仍默认**关**，而这个开关现在真正到达了两处本来无视它的路径——交付给读者的报告正文
  （过去只接进了 PTC 的 `render` 工具，在设置里打开对实际收到的答复毫无影响），以及被取消答复里保留的
  那份报告。开关关着的时候，`不确定项` 在这些路径上照旧可见。

### Known limitations / 已知限制

- **Checkpoints accumulate and resume means re-driving, not continuing / 检查点会持续累积；恢复指重跑未完成部分，不是继续原轮** —
  this round ships recording plus the re-drive policy. One file per run id is rewritten in place
  while the run lives, a terminal copy is left behind, and **nothing prunes the directory**, so the
  files are the price of retention in disk space. `src/resume/` (validator + retention policy) is
  imported only by tests, and `resumeDecision` — the host-side "should a new run re-drive from
  this file?" helper — has no production caller. `resume` never claims engine-level resume (the
  shipped engine journals nothing, stated as a limitation) and the release never terminates a run:
  recording is best-effort and unload-bounded, and a refused disk costs a warning line, never the
  report. Both halves are deliberate, not bugs.
  / 本轮交付记录＋重跑策略：每个 run id 一个文件，运行期间原地重写，结束留一份终态，**没有任何
  清理逻辑**，所以累积的磁盘占用就是保留期的代价。`src/resume/`（校验器 ＋ 保留策略）只被测试引用，
  `resumeDecision`（host 侧「要不要从这个文件起新的一轮重跑未完成任务」）没有生产调用方。这里的
  `resume` 从不是引擎级恢复（随附引擎无日志、无恢复，已声明为限制），本版也不终止任何运行：记录是
  尽力而为、卸载有界，磁盘写失败只记一条警告，永不吞掉报告。这两点都是有意为之，不是缺陷。

## [0.7.0] - 2026-11-08

### Added / 新增

- **`/grok on` speaks plainly, and the ledger is opt-in / `/grok on` 也说人话，机器台账改为按需显示** —
  `full` mode bypassed the front desk, so a team run answered with the machine ledger only
  (`Grok workflow: … / Model routes: … / Deadline: … / Route switches: …`) and nothing a reader
  could act on. A full-mode run now opens with the same deterministic 【人话结论】 header the triage
  path already wrote (`任务 N/M 项已核验通过` + the first lines of the synthesis), and a failed run
  still opens as a failure — the header is only composed for `completed`/`partial`. New
  `showDiagnostics` setting (default **off**): the ledger lines (`Model routes`, `Deadline`,
  `Route switches`, route overflows, `Errors`) now render only when it is on. `Uncertainties` stay
  visible in both cases: they are truthful caveats, and carry-over parses them back out of an
  earlier round, so hiding them would silently drop follow-up context. The success preamble also
  stopped forbidding all commentary: up to three plain sentences may precede the verbatim report.
  / `full` 模式绕开了前台，团队档只回一串机器台账（`Grok workflow: … / Model routes: … /
  Deadline: … / Route switches: …`），没有一句能直接用的结论。现在 `full` 也会在报告前加同样的
  【人话结论】（`任务 N/M 项已核验通过` ＋ 汇总首句），失败仍是失败样式——只有 `completed`/`partial`
  才拼这段。新增 `showDiagnostics` 开关（默认**关**）：`模型路由`/`时限`/`路由切换`/`溢出`/`错误`
  这些台账行只在打开时输出；`不确定项` 两种情况下都保留——它是诚实的限定语，且跨轮承接要靠它从
  上一轮报告里解析回来，藏掉会静默丢失追问上下文。成功报告的说明文字也不再一律禁止评论：
  允许先给三句以内人话，再原样贴原文。

### Fixed / 修复

- **Saved role/model settings now actually reach the run / 保存的模型设置现在真正生效** —
  a settings save wrote the profile patch, bumped the revision and reported no error, yet every
  child of the next workflow still used the previous chain (`roles.worker` first entry ignored;
  the models observed were the ones from the process's start-up snapshot). Cause: the gate read
  `safe()` (the live holders) for classification, history bounds and queue limits, then handed the
  closure's **load-time** `ResolvedConfig` to `runWorkflow` and to both `runSingleCall` sites
  (triage classifier, quick worker) — so an edit reached admission and never reached a child. The
  three call sites now receive the live snapshot, which is what "an edit applies to the next
  message" was always documented to mean. Regression:
  `test/reliability.spec.ts` → "uses the live roles chain for a gated run, not the load-time
  snapshot" (negative control without the fix fails with
  `expected 'old-model' to be 'wb/cn:deepseek-v4.1-flash'`).
  / 设置页保存后，补丁文件、revision 都对、也没有报错，但下一轮工作流的每个子代理仍在用旧链路
  （`roles.worker` 第一名被忽略，实际用的是进程启动那一刻的快照）。原因：网关用 `safe()`（实时持有值）
  做分类、历史与排队上限，却把闭包里的**开机快照** `ResolvedConfig` 传给了 `runWorkflow` 和两处
  `runSingleCall`（前台分类、快速应答）——于是编辑只作用于准入，永远到不了子代理。三处改为传实时快照，
  这才是"编辑对下一条消息生效"本来的含义。回归测试见上，去掉修复即失败，正是用户看到的现象。

- **Finished subtasks in the chat task list stay clickable / 聊天任务列表中已完成子任务保持可点击** —
  in the chat sidebar task list a *running* subtask row (for example `任务 1 · …`) was a link, but
  every finished row rendered as inert text: the planner row `规划助手已完成`, a task's `执行` /
  `检查` rows — none of them could be opened, so the output of a completed subtask was unreachable.
  The stock task-list renderer gates the row link on the member still running
  (`navigableMembers()` in `@deepseek-ai/dsh-client-ui-workflow-run` requires
  `member.status === 'running'`), which is exactly backwards for a reader who wants to inspect
  what a finished subtask did. This plugin now re-registers the keyed `workflow-run` chat node
  (`conversation.chat.node`, the slot contract's own "reusing a key replaces that node renderer"
  extension point) with the same projection and wording and one deliberate difference: a member
  row is a link whenever its child session can be opened — running, completed, failed, cancelled
  or interrupted — and clicking it opens the child session exactly like a running row does. A row
  whose child session cannot be resolved stays inert text rather than opening the wrong session.
  The registration sits at `priority: -1`, below the stock renderer's default, because the runtime
  shadows a keyed entry by priority and the same key at the same priority fails the *other*
  registrant's whole boot fiber (measured: without the priority the stock
  `dsh-client-ui-workflow-run` client failed web boot with "1 entry did not activate"). The stock
  renderer stays live-but-shadowed and resumes when the plugin unloads.
  在聊天侧栏任务列表里，运行中的子任务行（例如 `任务 1 · …`）是链接，但所有已结束的行都渲染成
  不可点的文字：规划助手行「规划助手已完成」、各任务的「执行」「检查」行都打不开，已完成子任务
  的输出根本看不到。库存任务列表渲染器把行链接限制在"成员仍在运行"（`navigableMembers()` 要求
  `member.status === 'running'`），这对想查看已完成子任务做了什么的读者恰恰相反。本插件现在重新
  注册键控 `workflow-run` 聊天节点（`conversation.chat.node`，槽位契约自带的"复用同键即替换该节点
  渲染器"扩展点），投影与文案保持一致，只有一处刻意差异：只要成员的子会话能打开——运行中、已完成、
  失败、已取消或已中断——该行就是链接，点击后与运行中的行一样打开子会话；子会话无法解析的行仍保持
  不可点文字，而不是打开错误的会话。注册带 `priority: -1`（低于库存渲染器的默认值）：运行时按键控
  优先级做遮蔽，同键同优先级会让**另一个**注册者的整条启动 fiber 失败（实测：不加优先级时库存
  `dsh-client-ui-workflow-run` 客户端报 "1 entry did not activate" 启动失败）。库存渲染器保留为
  被遮蔽的活条目，插件卸载时自动恢复。

- **Task-team children are named after their work / 任务团队子代理按其工作命名** —
  in the Web GUI's subagent panel every workflow child showed up as `任务团队 child N`
  (front-desk calls: `Front desk child 1`) with the child's prompt opener (`You are the
  planning agent`) as the session title. The workflow guest computes the script's label
  but drops it before the host starts the child, and the PTC host hardcodes
  `<run name> child N` as the child's durable descriptor label — exactly the field the
  panel renders (`dsh-client-ui-subagent` shows `entry.label ?? entry.id`). This plugin
  now runs its workflows on a twin of the runtime's own PTC engine whose `subagents`
  view derives each child's durable label from the prompt's first line, and every prompt
  builder opens with that title: the planner is `规划助手`, a worker its task title, the
  verifier `检查 · <task title>`, the synthesizer `汇总助手`, and the front-desk calls
  their tier names (`快速应答` / `前台直答` / `快速执行` / `任务分类`). DSH core is not
  modified: the twin is built from the injected engine's own constructor, `subagents` is
  the only decorated service, and any non-PTC engine is used unchanged.
  在 Web GUI 的子代理面板里，任务团队的每个子代理都显示为 `任务团队 child N`（前台单调用为
  `Front desk child 1`），副标题是子代理提示词的开头（`You are the planning agent`）：
  workflow guest 算出了脚本给的 label，却在宿主启动子代理前把它丢掉，PTC 宿主写死了
  `<run 名> child N` 作为子代理的持久 descriptor 标签——这正是面板渲染的字段
  （`dsh-client-ui-subagent` 显示 `entry.label ?? entry.id`）。本插件现在把工作流跑在
  运行时自己的 PTC 引擎的一个孪生实例上，其 `subagents` 视图从提示词首行推导每个子代理的
  持久标签，且所有提示词构造器都以该标题开头：规划者为 `规划助手`，工人为任务标题，
  检查者为 `检查 · <任务标题>`，汇总者为 `汇总助手`，前台各调用为其档位名
  （`快速应答` / `前台直答` / `快速执行` / `任务分类`）。不修改 DSH core：孪生实例用注入
  引擎自己的构造器构建，`subagents` 是唯一被装饰的服务，非 PTC 引擎原样使用。

## [0.6.0] - 2026-11-07

### Added / 新增

- **Empty-cap heads-up and single-run scope docs for route caps / 空 Cap 提醒与单 run 作用域说明** —
  a role chain with 2+ routes but every `maxInFlight` blank now shows a yellow heads-up on the
  settings page (`warn.emptyCap`, both languages) instead of silently never overflowing: blank =
  unlimited = never yields, and only a capped route yields when full. The cap hint/placeholder
  copy and the load-time `validateRoutes` notes say the same rule in both languages. `docs/ARCHITECTURE.md`
  now states the scope explicitly: the per-route in-flight counters live inside one workflow run
  and `Route overflows …` can only ever describe yielding inside the run that produced it. No routing
  behavior changed; the warning never blocks Save and the notes never fail the load.
  当一条角色链有 2 条以上路由、但 `maxInFlight` 全空时，设置页会显示黄色提醒（`warn.emptyCap`，
  中英双语），不再静默地"永远不溢出"：留空=不限=不让路，只有填了上限的路由才会在打满时让路。
  上限的 hint/placeholder 文案与加载时 `validateRoutes` 的 notes 用中英双语写明同一规则；
  `docs/ARCHITECTURE.md` 明确作用域：每条路由的在飞计数只活在单次 workflow run 内，
  `Route overflows …` 只可能描述产生它的那一次 run 内部的让路。不改任何选路行为；提醒不拦保存，
  notes 不会导致加载失败。

- **Cross-run route hint with local-vs-hint overflow rendering / 跨 run 路由 hint 与本地/跨 run 让路分开渲染** —
  at admission the plugin snapshots an approximate global busy hint (route labels other live
  runs configured, run-level only, never exact sub-call counts) and passes it as `args.busyRoutes`;
  the script only reorders untried routes (busy lanes yield to non-busy ones, never removed) and
  records a deprioritized lane as `<label> (cross-run hint)` in the existing `skippedBusy` evidence,
  reusing the overflow fields. No failure semantics change: `switchOn`/retries/counts are untouched,
  the child-agent budget ignores the hint, and a solitary run omits the key so its report is
  byte-identical to before. `Route overflows (cross-run hint):` renders separately from the local
  `Route overflows (full lane yielded, not failures):` line, and the routing ledger carries the same
  evidence through `recordRouting`.
  准入时插件对近似全局忙闲做一次快照（其它 live run 配置过的路由标签，仅 run 级估计，不含精确子调用
  计数），经 `args.busyRoutes` 下发；脚本只重排未试路由顺序（忙 lane 给非忙让路，不删除），被 hint
  挤到后面的记为 `<label> (cross-run hint)`，复用现有 `skippedBusy` 证据字段。不改失败语义：
  `switchOn`/重试/计数不动，子代理预算忽略 hint；孤立 run 不带该键，报告与之前逐字节一致。
  `Route overflows (cross-run hint):` 与本地 `Route overflows (full lane yielded, not failures):`
  分开渲染，路由台账经 `recordRouting` 同步透传同一证据。

## [0.5.1] - 2026-11-07

### Fixed / 修复

- **The quick worker now gets the context it was already being classified against /
  快手档拿到它本来就在被据以分类的上文** —
  a follow-up such as "用人话告诉我刚才那份研究的结论" was correctly recognised as a follow-up
  from the conversation, but the single worker that answered it received **only the bare
  request**: it was triaged with the conversation in hand and then dispatched blind, so it
  replied "I am a single turn, I cannot see the research above" and asked the user to restate
  what the session already held. The quick-tier prompt now carries a bounded, redacted
  `Context (do not ask for what is already here):` block — the recalled material when the
  recall pass hit (excerpt plus the file/URL locators it came from), otherwise the bounded
  conversation turns plus the cross-round digest, capped at 4 000 characters — and is told not
  to claim it cannot see earlier turns and not to ask for anything already present. A first
  message carries no context at all, so its prompt stays byte-identical to `0.5.0`; nothing is
  invented, no extra model call is made, and no new configuration key is added (PR #41,
  commit `45d721a`).
  像"用人话告诉我刚才那份研究的结论"这样的追问，本来就已经被判定为"有上文的追问"，但真正作答的
  那个快手档工人只收到 **bare request**：分诊时手里有会话、派活时却把上文丢了，于是它回一句
  "我这轮是单次进来的，看不到上面的研究结果"，要求用户把会话里已有的内容再说一遍。快手档提示词
  现在会带上一个有界、脱敏的 `Context (do not ask for what is already here):` 块——回捞命中时是
  回捞到的材料（摘录 + 它的文件/URL 定位符），否则是有界的会话轮次加跨轮 digest，合计上限
  4000 字符——并明确要求"不得声称看不到前文、不得索要已经在这里的内容"。首条消息完全不带上下文，
  提示词与 `0.5.0` 逐字节一致；全程不编造、不增加模型调用、不新增配置键（PR #41，提交 `45d721a`）。

## [0.5.0] - 2026-11-06

### Added / 新增

- **Look it up before asking / 先回捞，后提问** —
  when the front desk was about to ask the user a clarification ("please restate it"), it asked
  without ever checking what the conversation already held: in
  `session-7e079b80-1a57-451b-aca4-795d24a14c4d` the research results were right there in the
  transcript and the follow-up was still met with a request to repeat them. The last step before a
  clarification question now is a **read**: the conversation so far, the validated reports this
  plugin already wrote for earlier rounds, and the memory markdown files already on disk
  (`<cwd>/docs/knowledge/*.md`, override with `GROK_WORKFLOW_KNOWLEDGE_DIRS`). A hit answers from
  that material — one worker, the material in the prompt, and an explicit instruction never to
  claim it cannot see earlier turns and never to ask for work that is already there — and the
  answer states where it came from. A miss in a session that has already said something asks exactly
  once and adds one line saying where it looked and which specific detail is missing, instead of
  asking for the whole task again. Nothing is ever invented, and a session that has not said
  anything yet produces exactly the same question as before, byte for byte — even when memory files
  exist on disk, because there is no earlier wording for the question to point at. This costs
  nothing when it is not needed: the read runs only on messages that would otherwise be a
  clarification question, is bounded (6 turns / 3 000 characters of conversation, 4 earlier rounds /
  4 000 characters of digest, 12 files / 2 400 characters each / 16 000 characters total), is
  redacted, and is read-only — it creates no archive and no new record type.
  前台原本在准备向用户提问（"请重新说明"）时，从不检查会话里已经有什么：在
  `session-7e079b80-1a57-451b-aca4-795d24a14c4d` 里研究结果就在会话中，追问却仍被要求重述。
  现在发出澄清问题之前的最后一步是**先读**：本会话上文、插件自己为前序轮次写入的已验证报告、
  以及磁盘上已有的记忆 markdown 文件（`<cwd>/docs/knowledge/*.md`，可用
  `GROK_WORKFLOW_KNOWLEDGE_DIRS` 更改）。命中即据材料作答——只派一个工人、材料进提示词，并明确
  要求"不得声称看不到前文、不得让用户重复已给出的内容"，回答里还会注明材料出处；未命中才提问**一次**，
  若这个会话里已经说过话，提问下方再补一行"查过哪里、还缺哪一个具体信息"。全程不编造：还没说过话的
  会话，得到的问题与改动前逐字节一致（即使磁盘上有记忆文件——此时没有可指认的上文，原来那句就是最
  诚实的形式）。不需要时不花任何代价：只在"本来要提问"的消息上才检索，
  且有界（会话 6 轮 / 3000 字符，前序 4 轮 / 4000 字符 digest，记忆文件 12 个 / 每个 2400 字符 /
  合计 16000 字符）、脱敏、只读——不新增归档、不新增记录类型。

- **Cross-round context carry-over / 跨轮上下文延续** —
  every round is a fresh set of child agents, and until now the second round of a long
  conversation started from zero: it could answer "I am a single turn, I cannot see the research
  above" and ask the user to repeat what they had already given. Each run now compiles the
  earlier rounds of the same session into one **bounded, structured digest** (round objective,
  verified criteria with their evidence, open questions, uncertainties, final-answer excerpt and
  the file/URL locators the evidence quoted) and injects it into the planner, worker, verifier
  and synthesizer prompts, with explicit instructions never to claim it cannot see earlier turns
  and never to ask for information that is already there. The digest is compiled from the
  validated reports this plugin itself wrote into the transcript (never a model paraphrase), is
  redacted, is capped by the existing `historyTurns` / `historyChars` budget and by a hard ceiling
  of 24 rounds / 12 000 characters, keeps the newest round and names how many it dropped, and
  renders nothing at all when the session has no earlier round — first-round prompts are
  byte-identical to before. A child that needs more detail is told to read the listed prior
  outputs instead of asking the user. No new configuration key, no new storage format, no extra
  model call.
  每一轮的子代理都是全新上下文：此前长会话的第 2 轮会从零开始，甚至自述"我这轮是单次进来的，
  看不到刚才上面的研究结果"，要求用户重述已给出的信息。现在每轮都会把同一会话内的前序轮次编译成
  **有界结构化 digest**（该轮目标、已核验判据及其证据、未决问题、不确定项、结论摘要、证据引用的
  文件/URL 定位符），注入规划、执行、校验、汇总四个角色的提示词，并明确要求"不得声称看不到前文、
  不得让用户重复已给出的信息"。digest 只从插件自己写入会话的已验证报告编译（不经模型转述）、经过
  脱敏，受既有 `historyTurns` / `historyChars` 预算与硬上限（24 轮 / 12000 字符）双重约束，超限时
  保留最新一轮并写明丢弃了多少轮；没有任何前序轮次时完全不渲染——首轮提示词与此前逐字节一致。
  需要更多细节的子代理被要求去读列出的先前产物，而不是回头问用户。不新增配置键、不新增存储格式、
  不增加任何模型调用。

- **Incremental memory archive / 随做随存的增量记忆归档** —
  a round's result now lands in a durable, greppable archive the moment the round settles,
  instead of waiting for someone to hand-edit `STATE.md` / `HANDOFF.md` at session exit. A new
  `src/memory/` module appends one JSON line per settled child agent and one per finished round
  to `$DSH_HOME/memory/grok-workflow/archive.jsonl` (override with `GROK_WORKFLOW_MEMORY_DIR`),
  carrying the objective, the status, the verified criteria with their evidence, the child's own
  declared result — bounded and redacted. The file is append-only (`O_APPEND`, one line per
  entry, existing bytes never rewritten), entry ids are deterministic (`run:<runId>`,
  `run:<runId>:agent:<seq>`), and a repeated write is a no-op, so replaying a round cannot
  duplicate history. Archiving is not a config switch and is not gated on the progress panel: a
  memory gap is not a presentation choice. The front desk archives too — a cheap-tier answer is a
  real round result — and a failed write only costs a warning line, never the run. Any later
  session reads it back without the plugin loaded: `node lib/memory/cli.js recent [--limit N]
  [--json] [--kinds round,agent] [--dir PATH]`.
  一轮的结果现在在**轮次结算时刻**就落进可检索的持久归档，不再等会话收尾时有人手工改
  `STATE.md` / `HANDOFF.md`。新增 `src/memory/`：每个结算的子代理、每个结束的轮次各向
  `$DSH_HOME/memory/grok-workflow/archive.jsonl` 追加一行 JSON（可用 `GROK_WORKFLOW_MEMORY_DIR`
  改位置），带目标、状态、已核验判据及其证据、子代理自己申报的结果，全部有界并脱敏。文件只追加
  （`O_APPEND`、一条一行、已有字节永不改写），条目 id 确定（`run:<runId>`、
  `run:<runId>:agent:<seq>`），重复写入是无操作，同一轮重放也不会重复历史。归档不是配置开关，
  也不受进度面板开关控制：记忆缺口不是展示偏好。前台档同样归档（快手档回答也是真实的轮次结果），
  写入失败只丢一行告警，绝不拖垮运行。任何后续会话无需加载插件即可读回：
  `node lib/memory/cli.js recent [--limit N] [--json] [--kinds round,agent] [--dir PATH]`。

## [0.4.0] - 2026-11-06

### Added / 新增

- **History-aware follow-up triage / 追问可接上文，不再掉进寒暄** —
  a follow-up fragment ("说人话", "继续", "详细点" …) with conversation history now routes
  `fast/followup` instead of the greeting template; without history it asks instead of
  answering from the template. Disable with `triageFollowupAsFast: false`.
  有上文时"说人话/继续/详细点"走快手档（`fast/followup`），不再回寒暄模板；首条无上文时改为追问确认。
  可用 `triageFollowupAsFast: false` 关闭。
- **Hybrid front-desk classifier (opt-in) / 混合分诊（可选）** —
  `triageClassifier: rules` (default) keeps pure string rules byte-for-byte; `hybrid` adds one
  model call only for unclear cases (`ask`/`ambiguous-escalate`, or `chat` with history),
  falling back to the rules verdict on any failure.
  默认 `rules` 纯规则零行为变化；`hybrid` 仅在拿不准时多花一次模型调用，失败回退规则结果。
- **Team-tier instant receipt + plain-language lead-in / 团队档即时回执与人话导读** —
  the team tier posts its tier line immediately (`instantReceipt`, default on) so a long run
  never looks blank, and prepends a deterministic `【人话结论】 verified/total` lead-in before
  the machine report (`humanSummary`, default on). Both are pure additions with zero extra
  model calls. 团队档先回档位行（`instantReceipt` 默认开），运行时不再白屏；报告前加确定性
  `【人话结论】` 导读（`humanSummary` 默认开）。两者零额外模型调用。

## [0.3.0] - 2026-11-03

### Fixed / 修复

- **Synthesis/synthesizer mismatch warns and repairs instead of deactivating / 合成配置不一致改为告警并修复，不再直接停用** —
  only two recoverable shapes are repaired at load: a non-empty `roles.synthesizer` chain with
  `synthesis: deterministic` now takes effect as `model`, and `synthesis: model` with an empty
  chain takes effect as `deterministic`. Each repair logs a warning naming the effective value
  （文案含"已按…生效，请在设置页确认"）, keeps the tool, gate and settings page fully active, and
  marks the one-line signature as `synthesis=<mode> (repaired)`. Unknown keys, unknown providers,
  undeclarated models, out-of-range numbers and malformed chains still fail hard (R-06 unchanged),
  and the settings page blocks Save on the same two mismatches with a red bilingual error.
  仅两种"可恢复不一致"做修复：总结链非空但汇总方式是 `deterministic` 时按 `model` 生效；
  汇总方式是 `model` 但总结链为空时按 `deterministic` 生效。修复会打 warn 日志（文案含"已按…生效，
  请在设置页确认"），工具/门禁/设置面照常启用，有效配置签名带 `synthesis=<mode> (repaired)` 自证标记。
  未知键、未知 provider、不在目录的模型、越界数字、畸形链一律仍抛错（R-06 不动）；设置页对同样两种
  不一致红字拦 Save（中英双语）。

## [0.2.7] - 2026-11-03

### Added / 新增

- **Per-route concurrency cap with overflow to the next route / 每条路由的并发上限，打满就溢出到下一条** —
  each route in a role's chain can carry an optional `maxInFlight` (1–64, blank = unlimited),
  set in the settings page's third box per row or in the profile patch. While a capped route is
  full, a new call overflows to the next route in chain order instead of queueing on the full one;
  only when every route is full does the call wait for a drain. A full lane is never a failure:
  it advances no fallback, costs no retry attempt, and is recorded separately (`skippedBusy` /
  `queuedMs`, rendered as `Route overflows …` rather than `Route switches:`), so "used route B
  because route A was full" never reads as "route A failed".
  角色链里每条路由可配可选的 `maxInFlight`（1–64，留空=不限），在设置页每行第三个框或 profile
  patch 里填写。某条路由打满时，新调用按链顺序溢出到下一条，而不是排队等它；只有所有路由都满
  才等待腾位。打满不是失败：不推进备用链、不消耗重试，在报告里单独呈现（`skippedBusy` /
  `queuedMs`，`Route overflows …` 而非 `Route switches:`），"因为 A 满了所以用了 B"
  永远不会被读成"A 失败了"。

### Fixed / 修复

- **The first message of a session no longer disappears while the team runs / 会话的第一条消息不再"消失"** —
  with the default `in-turn` strategy the gate waited for the whole workflow before handing the
  claimed message back to the loop, and the loop is the only writer of `user/message` events, so
  the transcript held no message at all for the entire run: the GUI showed an empty turn with just
  the running/planning status, and a page reload lost what the user had typed. The claimed message
  is now published to the transcript before the wait (same id, source and `rpcId`, exactly once),
  and the entered step carries only the report; thinking/planning stays a status indicator.
  默认 `in-turn` 策略下，网关要等整个工作流跑完才把已认领的消息交回循环，而循环是 `user/message`
  事件的唯一写入者 —— 于是整段运行期间会话里一条消息都没有：界面只剩「正在分析请求/规划中」状态，
  刷新页面后用户输入的内容彻底消失。现在网关在等待之前就把原消息写进会话（同 id、同 source、
  保留 `rpcId`，且只写一份），进入的步骤只携带报告；思考/规划只作为状态显示。

## [0.2.6] - 2026-11-02

### Changed / 变更

- **Settings page visual polish, three live-screenshot passes / 设置页三轮视觉打磨，均有真机截图** —
  info hierarchy and breathing (title ladder, hint styles, hairline row dividers, unified
  32px/8px controls, unit suffixes like ms/retries/turns, restyled status line, card-ified
  role chains with numbered badges, solid-blur sticky footer), alignment and rhythm
  (two-column baselines, semantic green ON switch, disclosure markers, right-aligned
  revision), and details (dashed empty state, tinted error box, hover/focus/disabled
  states, 340px internal chain scroll, bilingual EN/ZH overflow checks). No config keys,
  bounds, validation or wiring changed — styles, grouping order and copy only.
  信息层级与呼吸感（标题阶梯、hint 样式、行分隔线、统一 32px/8px 控件、ms/次/轮等单位后缀、
  状态行重塑、角色链卡片化+序号徽、实底毛玻璃吸底栏）、对齐与节奏（两列基线、语义绿 ON 开关、
  折叠箭头、修订号右对齐）、细节定稿（虚线空态、红底错误框、hover/focus/disabled 三态、
  链内 340px 滚动、中英双语溢出检查）。未动任何配置键、上限、校验与接线，只改样式、分组顺序与文案。

## [0.2.5] - 2026-11-01

The novice settings page: the Settings → Plugins → `Grok workflow` page now speaks one
language at a time — exactly the language DSH is set to — with plain words instead of
field keys and jargon. On top of that: history, concurrency, retry, task and timeout
bounds are relaxed for long jobs, and every role chain holds up to 50 backup routes.

新手设置页：设置 → 插件 → `Grok workflow` 页面一次只说一种语言——严格跟随 DSH 的语言设置，
用人话代替字段键与黑话。在此之外：历史、并发、重试、任务与超时上限为长任务放宽，每条角色链
最多可放 50 条备用路由。

### Added / 新增

- **Novice-oriented settings page, strictly single-locale / 新手向设置页，严格单语** —
  the page renders only the active system language (no raw field keys, no mixed bilingual
  lines), shows a live one-line status under the intro (`OFF — plain chat` / `ON — smart
  triage` / `ON — full team`, following the current draft and never saved), and groups the
  controls into Mode / Who does it / Limits / More (collapsed) / Advanced — leave alone /
  Status. Role names are plain words (Planner / Executor / Checker / Summarizer); every
  row explains what happens if you leave it alone.
  页面只渲染当前系统语言（不显示 raw 字段键，不中英混排），页头有一句跟随当前草稿的实时状态
  （关着 / 智能分诊 / 全员出动，只展示、不保存），控件按"模式 / 谁来干 / 上限 / 其他（默认折叠）/
  高级（别碰）/ 运行状态"分组。角色名是人话（规划 / 执行 / 检查 / 总结），每行都写了"不动会怎样"。
- **Provider → model dropdowns fed by the runtime / 通道→模型双下拉，目录来自运行时** —
  role chains and the triage model use provider→model dropdowns listing the models the
  runtime declares; when the runtime exposes no catalog both controls fall back to free
  text. Leaving a chain blank still means "use the model you are already talking to".
  角色链与分诊模型用"通道→模型"双下拉，选项是运行时已声明的模型；读不到目录就回退手写框。
  留空仍表示"用跟你对话的模型"。
- **switchOn as seven checkboxes, all checked by default / switchOn 改为七个勾选框，默认全勾** —
  one box per switchable failure class with plain names; all checked is the built-in
  behavior (switch only when the road is broken). Content failures never switch, they
  retry in place.
  每个可切换失败类别一个勾选框，名字是人话；全勾就是内置行为（路不通才换人）。内容没做好
  永远不换人，原地重试。
- **Long-chain + high-retry heads-up / 长链+高重试提醒** — a long backup chain combined
  with high retries shows a warning above the save button; it never blocks saving.
  备用链很长、重试又高时，保存按钮上方会有一句提醒；只提醒，不拦保存。

### Changed / 变更

- **Bounds relaxed for long jobs / 上限为长任务放宽** — `historyTurns` 0–1000000
  (default `12`), `historyChars` 0–1000000 (default `20000`), `maxConcurrency` 1–1000000
  (default `4`), `maxRetries` 0–10 (default `2`), `maxTasks` 1–100 (default `12`),
  `timeoutMs` up to 7 days (`604800000`, default still 60 minutes), each role chain up
  to `50` backup routes (was 3). The generated script's defensive clamps mirror the
  backend limits and a test pins them equal. The per-task call backstop is now an
  extreme 1100-call guard instead of a 6-call budget.
  `historyTurns` 0–1000000（默认 `12`）、`historyChars` 0–1000000（默认 `20000`）、
  `maxConcurrency` 1–1000000（默认 `4`）、`maxRetries` 0–10（默认 `2`）、`maxTasks` 1–100
  （默认 `12`）、`timeoutMs` 最长 7 天（`604800000`，默认仍 60 分钟）、每条角色链最多
  `50` 条备用路由（原来 3 条）。生成脚本里的兜底值与后端上限对齐，并有测试钉死两者一致。
  单任务调用预算从 6 次改为 1100 次的极端兜底。
- **Option and error copy in plain words / 选项与报错改成人话** — answer strategy,
  synthesis, gate scope and switch classes render localized display names (stored values
  stay English); validation errors keep their `{key, params}` data shape but read as
  plain sentences in both languages.
  回答策略、汇总方式、门禁范围、切换类别显示本地化名称（存值保持英文）；校验错误保持
  `{key, params}` 数据形态，但两边都是人话。

## [0.2.4] - 2026-11-01

The opt-in release: the workflow no longer hijacks every message — a session is plain chat until
you turn the workflow on with `/grok`. On top of that: the progress panel groups by task, the
workflow objective limit is 32,000 characters, the planner-failure fallback is sharded, and the
Issue #22 Phase 1 dialogue-reliability fixes (PR #23) ship in this version. Nothing here restates
a `0.2.3` change, and the `0.2.3` / `0.2.2` / `0.2.1` / `0.2.0` / `0.1.0` sections are untouched.

选择加入的版本：工作流不再拦截每条消息——会话默认是普通聊天，用 `/grok`
显式开启后才走工作流。在此之外：进度面板按任务分组、工作流目标上限提到 32,000
字符、规划失败回退改为分片、Issue #22 Phase 1 对话可靠性修复（PR #23）随本版发布。
不重复 `0.2.3` 已发布的内容；`0.2.3` / `0.2.2` / `0.2.1` / `0.2.0` /
`0.1.0` 章节保持不动。

### Added / 新增

- **`/grok` on/off workflow toggle / `/grok` 工作流开关** — the mandatory workflow is now a
  per-session switch you flip with a command instead of something that hijacks every message out of
  the box. `/grok` turns it ON (every user message runs the plan→execute→verify→report workflow);
  `/grok off` turns it OFF (normal chat — the workflow only runs if the model calls the
  `grok_workflow` tool). Default is **off** (`grokDefault: 'off'`): you opt in per session. The
  toggle is durable (survives restart / resume / fork) and lives in the session log, so it is never
  silently lost. `/grok` appears in interactive UIs (Web / CLI); headless and ACP surfaces have no
  command menu and follow `grokDefault`.
  把"每条消息强制走工作流"改成会话级、可用命令随时切的开关，不再一装上就每条都拦：`/grok` 开
  （每条用户消息都走 规划→执行→验证→汇报 的完整流程），`/grok off` 关（回普通聊天，只有模型主动
  调用 `grok_workflow` 工具才跑）。默认**关**（`grokDefault: 'off'`），按会话自行开启。开关状态
  挺过 重启 / 恢复 / 分身，存在会话日志里、不会被静默丢掉。`/grok` 在有命令面的界面（Web / CLI）
  可用；headless / ACP 无命令菜单，跟随 `grokDefault`。

### Changed / 变更

- **The progress panel groups by task, not by role / 进度面板改为按任务分组** — a run used to
  show two long role lists (`Execute`, `Verify`) with machine labels like
  `grok-worker-t1-a2`. It now shows one group per task, headed `任务 1 · <任务标题>` /
  `Task 1 · <task title>`, with rows `执行` / `执行（尝试 2）` / `检查` / `规划助手` /
  `汇总助手`. No `grok-` prefix, attempt marker, fallback marker, internal task id or child run id
  is shown any more; they all remain in the report. Two tasks with the same title never merge, a
  long title is shortened to 24 characters plus `…` in the header only (the report keeps it whole),
  and a retry is visible as “（尝试 2）” rather than as a second task.
  一次运行以前显示两条按角色分的长列表（执行、检查），行名是 `grok-worker-t1-a2` 这类机器名。
  现在每个任务一组，组头是 `任务 1 · <任务标题>`，行名是 `执行` / `执行（尝试 2）` / `检查` /
  `规划助手` / `汇总助手`；不再出现 `grok-` 前缀、尝试标记、回退标记、内部任务 ID 或子运行 ID
  （它们都还在报告里）。同名任务不会合并，过长的标题只在组头截断到 24 字加省略号（报告里保留全文），
  重试写作「尝试 2」而不是第二个任务。
- **Panel copy follows the language setting / 面板措辞跟随语言设置** — `zh` and `en` strings come
  from one table (`src/naming.ts`), selected by the DSH `locale` preference with `zh` as the
  default. No new configuration key: there is nothing to name by hand. A run already on screen keeps
  the words it was written with.
  中英文措辞来自同一张表（`src/naming.ts`），按 DSH 的 `locale` 偏好选择，默认中文；没有新增配置项，
  无需手工命名。已经显示出来的运行保持它写入时的措辞。

- **The workflow objective limit is 32,000 characters / 工作流目标上限为 32,000 字符** — the gate
  and the direct `grok_workflow` tool used to refuse any objective over 4,000 characters. The limit
  is now 32,000 characters (`TASK_LIMITS.objectiveChars`); per-task bounds are unchanged (task
  objective / expectedOutput / context ≤ 4,000 characters each). The 4,001–32,000 range used to be
  the exact window where the planner-failure fallback was re-rejected; it is now covered by the
  sharded fallback in Fixed. Tests: `test/objective-limit.spec.ts`.
  闸门与直接调用 `grok_workflow` 工具以前拒绝任何超过 4,000 字符的目标，现在上限为 32,000 字符
  （`TASK_LIMITS.objectiveChars`）；每任务边界不变（任务目标 / 预期输出 / 上下文各 ≤ 4,000
  字符）。4,001–32,000 正是以前规划失败回退会被二次拒绝的窗口，现在由 Fixed 里的分片回退覆盖。
  测试见 `test/objective-limit.spec.ts`。

### Fixed / 修复

- **A failed planner no longer drops a long objective / 规划失败不再丢掉长目标** — when planning
  failed, the fallback plan carried the whole objective in one task, which the 4,000-character
  per-task bound then rejected: a 4,001–32,000 character objective could pass the front desk and
  still fail with `workflow result fallback plan.tasks[0].objective is N characters, over the
  4000-character per-task limit`. The fallback now splits the objective into contiguous shards of
  at most `taskTextChars` characters; concatenating the shard objectives reproduces the original
  byte for byte, every shard carries the same `origin_goal_id`, and the run reports `partial` with
  `planning.source: "fallback"` instead of failing. The segment count follows the splitter rather
  than `maxTasks`, so the configured task cap cannot reject the fallback a second time. 规划失败时，
  回退计划以前把整个目标塞进一个任务，随后被每任务
  4,000 字符上限拒绝：4,001–32,000 字符的目标能过前置检查，却仍会以
  `workflow result fallback plan.tasks[0].objective is N characters, over the 4000-character
  per-task limit` 失败。现在回退计划把目标切成每片不超过 `taskTextChars` 的连续分片，分片目标顺序
  拼接后与原文逐字节一致，所有分片共享同一个 `origin_goal_id`，运行以 `partial` 收尾并保留
  `planning.source: "fallback"`，不再失败。分段数由切分器本身决定而不是 `maxTasks`，
  配置的任务上限不会二次拒绝回退计划。
- **The fallback now survives objectives that used to knock it out / 极端目标不再把回退计划打回** —
  three review findings on the segmented fallback, each reproduced by a test before it was fixed.
  (1) A boundary that backs off a surrogate pair adds a segment, so a 32,000-character objective can
  split into nine segments while the cap was derived from `ceil(chars / 4000)` = 8; with
  `maxTasks: 6` that fallback was rejected as over the task cap. The cap now comes from the splitter
  itself (`src/shards.ts`), which the generated script and host validation share. (2) An objective
  dense in JSON escapes — 32,000 quote characters — serialized to ~67,000 characters and tripped the
  48,000-character aggregate budget, which bounds task text a planner or caller *authored*; the
  fallback carries the caller's own characters, so the validator now checks the segments directly
  (they must be exactly what the splitter produces) instead of applying that budget. (3) Segments
  were max-sized slices, so a 4,001-character objective produced a 4,000-character task and a
  one-character one, every shard shared one generic criterion, and cuts could land mid-sentence.
  Segments are now balanced, aligned to a nearby paragraph/sentence/word break, and each segment's
  criterion names the segment it covers, so a verifier confirms the piece it was handed and no shard
  stands in for the whole objective. 针对分段回退的三条审查意见，每条都先由测试复现再修：
  ① 分片边界若切开代理对会后退一位，32,000 字符的目标可能切成 9 段，而上限仍按
  `ceil(chars / 4000)` = 8 计算，`maxTasks: 6` 时该回退计划会被判为超出任务上限；现在上限直接取自
  切分器（`src/shards.ts`），脚本与宿主校验共用同一份实现。② 充满 JSON 转义的目标（32,000 个引号）
  序列化后约 67,000 字符，会撞上 48,000 字符的合计预算——那个预算约束的是规划器/调用方*撰写*的
  任务文本，而回退计划只是调用方自己的字符，因此校验改为直接核对分段（必须与切分器产出完全一致），
  不再套用该预算。③ 以前按上限切片，4,001 字符的目标会切出一个 4,000 字符任务和一个单字符任务，
  所有分片共用一条通用验收标准，切点还可能落在句子中间；现在分段均衡、优先对齐附近的段落/句子/
  词语边界，且每段的标准明确写出它覆盖的是哪一段，核查只确认它拿到的那一片，任何一片都不能代表
  整个目标。
- **A rejected run no longer reads as finished / 被否决的运行不再显示成已完成** — the run node used
  to be closed with the engine's stop reason, and a verifier rejection ends the program normally, so
  a team where no task passed still showed `已完成` on the node and on both rows. The node is now
  closed with the task-level result: every task verified → `已完成`; `partial`/`failed` → `失败`;
  no report → `失败`. 运行节点以前用引擎的停止原因收尾，而核查否决是正常结束，所以一个没有任何任务
  通过的运行，节点和两行都显示「已完成」。现在节点按任务级结果收尾：全部任务通过才是「已完成」，
  `partial`/`失败` 显示「失败」，没有报告也显示「失败」。
- **The panel no longer overstates what happened / 面板不再夸大结果** — a completed child call is
  not a passed task: a finished call is worded `执行代理已结束` / `检查调用已结束`, an ended call can
  never produce the words “任务已完成” or “检查通过”, and no percentage, token count, ETA or invented
  activity is rendered anywhere. A task verdict (`任务通过` / `任务未通过`) comes only from the
  report, and a test fails if the panel and the report disagree.
  子调用结束不等于任务通过：结束的调用写作「执行代理已结束」「检查调用已结束」，永远不会变成
  「任务已完成」「检查通过」；不显示百分比、token 数、预计剩余时间或任何编造的活动。任务结论
  （「任务通过」「任务未通过」）只来自报告，面板与报告不一致时测试会失败。

- **A failed job can no longer be reported `COMPLETED` / 失败的活不会再被报成 COMPLETED** — found by a
  real-model E2E run (`wb/cn:deepseek-v4.1-flash`): a write into `/proc` that the worker itself
  reported blocked still came back `Grok workflow: COMPLETED`, because the planner had rewritten the
  objective into "attempt it and report honestly" and the verifier passed those rewritten criteria.
  Verification now requires the executor's own status to be `completed` — a self-reported
  `partial`/`failed` is an admission, not something a verifier can overturn — and the planner is
  forbidden from substituting "attempt and report" for the requested end state. Regression test in
  `test/orchestrator.spec.ts`; re-run now reports `FAILED`.
  真模型 E2E 抓到的缺陷：worker 自己都报"被阻塞"的 `/proc` 写入，最终仍返回 `COMPLETED`——planner 把目标
  改写成"尝试一下并如实报告"，验证员对着改写后的标准判了通过。现在要求执行者自报必须是 `completed`
  才可能通过验证（自报 `partial`/`failed` 是承认，验证员不能翻案），并禁止 planner 用"尝试并报告"
  替换目标要求的终态。`test/orchestrator.spec.ts` 加了回归，复测返回 `FAILED`。

- **`/grok` now means the full workflow, not the front desk / `/grok` 真的走完整流程** — the command
  promised the full plan→execute→verify workflow while a deployment `mode: triage` quietly answered
  simple messages from a template. An explicit `/grok` now records `workflowMode: 'full'` on the
  session and the gate honours it; a config-level `grokDefault: 'on'` still respects `mode`, so a
  deployment can choose triage. Tests: `test/triage.spec.ts`, `test/mode.spec.ts`,
  `test/command.spec.ts`.
  命令文案承诺完整流程，但部署的 `mode: triage` 会把简单消息静默交给模板回答。现在显式 `/grok` 会在
  会话里记 `workflowMode: 'full'`，闸门照此执行；配置级 `grokDefault: 'on'` 仍尊重 `mode`，部署方
  仍可选分诊。测试见 `test/triage.spec.ts` / `test/mode.spec.ts` / `test/command.spec.ts`。


### Fixed — Issue #22 Phase 1 对话可靠性 / dialogue reliability (reviewed, ships in this release)

- **P0-1 用户原话不再丢失 / the user's own message stays in the transcript** — `in-turn` 路径过去只把
  插件生成的 relay/report 消息放进 `enter.messages`，而 `AgentLoop.preStep()` 已经把这一批消息从
  inbox 里 `claim` 走了，于是模型转写里根本没有用户自己那句话。现在本条决策先带上被 claim 的消息
  （同一个对象：id、source、正文、附件结构都不变），报告紧随其后；`relay` / `append` 因为整步被
  `reject`，由插件自己把那句话写进 session，两条路径各自只有一个写入者，因此不会重复。
  过去 `enter.messages` 只放报告、而用户消息被 `inbox.claim` 移除后无人提交——这就是原话丢失的原因。
- **P0-2 确认档不再丢上下文 / a confirmation answer keeps the task** — `pendingAsks` 过去只存时间戳，
  用户回答「简单」后快手档只收到这两个字。现在 pending 保存 `originalRequest` 与 `askedAt`（TTL 仍为
  10 分钟），快手档与团队档收到的都是「原始任务 + 用户选择简单/团队模式（选择词不是任务目标）」；
  过期、插件重载、被别的消息顶掉时都会明说，不猜原始任务；同一 pending 只能被消费一次。
- **P0-3 内部错误一定有用户可见终态 / every internal error ends visibly** — 分类失败过去是静默
  `reject`（用户看到空白回合），现在是带上原因的通知消息且保留原话；失败话术不会出现
  「已完成/已开启」这类成功措辞；有意取消、超时、插件卸载与内部异常各有独立终态。
- **取消时原话与终态都不再消失 / a cancelled turn keeps the message and states its end** — 真机 GUI
  复核发现的 P0-1 × P0-4 缺口：in-turn 路径里用户那句话已经被 `inbox.claim` 取走，若这一回合被取消，
  决策只能 `reject`，于是 session 里既没有 `user/message` 也没有任何停止原因（实测会话事件只有
  `inbox/spliced` → `run-end cancelled` → `turn/end aborted`）。现在取消走 `commitCancelled()`：先按
  原对象提交被 claim 的那批消息（这一步整步已被 reject，插件是唯一写入者，不会重复），再写一条
  助手消息说明 `运行已取消（cancelled）…已完成的部分保留…`。GUI 截图与回归用例见
  `docs/knowledge/evidence/p1-gui/`。
- **P0-4 取消到达终态并保留已完成的工作 / cancellation ends, and keeps finished work** — 已经 aborted
  的 signal 不会再启动引擎（过去会先启动再取消，白跑一次 planner/worker）；运行被停止时，引擎已经
  产出的报告会被保留：已验证任务原样保留，未完成的任务标为 `interrupted`、未开始的任务标为
  `not started`，运行级错误分类为 `cancelled`（不是质量失败），面板随之收尾。

### Notes / 说明

- **This release changes the default behaviour / 本版改变默认行为** — a fresh install no longer
  runs the workflow for every message: sessions start as plain chat (`grokDefault: 'off'`) until
  `/grok` turns the workflow on for that session. Set `grokDefault: 'on'` to keep the previous
  always-on posture (deployments may still choose `mode` for triage).
  新装插件不再对每条消息跑工作流：会话默认是普通聊天（`grokDefault: 'off'`），用 `/grok`
  为该会话显式开启后才走工作流。需要以前常开姿态的部署请设 `grokDefault: 'on'`
  （仍可用 `mode` 选择分诊）。
- **Real-GUI verification, stated honestly / 真机 GUI 验证（诚实口径）** — `/grok` switching and
  the settings-page card were verified on a real Web GUI driven by a real (off-screen headless)
  Chromium against an isolated instance (VALIDATION Round 15): default plain chat → `/grok` full
  run → `/grok off` back to plain chat, plus card render / save / persist / take-effect-on-new-session.
  Two deviations are stated, not hidden: the browser window was off-screen (the machine has no
  X11 display), and every model round ran on `wb/cn:glm-5.3-flash` instead of the originally
  planned model. `relay` / `append` delivery on a long-lived GUI session remains `NOT_RUN`.
  `/grok` 可切与设置页卡片已在真 Web GUI 上验证：真（离屏 headless）Chromium 驱动隔离实例，
  默认普通聊天 → `/grok` 完整运行 → `/grok off` 回普通聊天，以及卡片渲染 / 保存 / 持久化 /
  对新会话生效（VALIDATION Round 15）。两处偏离如实说明、不隐瞒：浏览器窗口是离屏的（本机无 X11
  显示），全部模型轮次用的是 `wb/cn:glm-5.3-flash` 而非原定模型。长驻 GUI 会话里的 `relay` /
  `append` 投递仍为 `NOT_RUN`。

## [0.2.3] - 2026-10-28

The front desk release: every user message now passes a front desk that states its tier in
public. `0.2.2` behaved exactly as before unless `mode` was changed — nothing here restates a
`0.2.2` change, and the `0.2.2` / `0.2.1` / `0.2.0` / `0.1.0` sections are untouched.

**What the tiers actually do, after the t53 review:** the first draft of this feature answered
short questions and short two-step instructions from the greeting template — it looked like it
worked and did no work at all. That is fixed, and the ordering that caused it is now a tested
contract (see Fixed).

### Added / 新增

- **Front desk with four tiers / 前台四档分流** — every user message now passes a front desk that
  states which tier it chose and why, and never silently takes a cheaper path: `直答档` answers
  small talk from a template (no model call), `快手档` answers a single-step request with one
  worker, `团队档` runs the full workflow with a greeting and the progress panel, and `确认档` asks
  `这个要动用团队吗？可回复：简单 / 团队` and remembers the answer. Tier wording, greeting and
  answer follow the language of the message. 每条消息都先过前台：前台公开写明走了哪一档、为什么，
  绝不静默降级——直答档用模板秒回（不花调用）、快手档派一个工人、团队档跑完整工作流（带开工迎宾
  与进度面板）、拿不准就反问一句并记住回答；档位措辞跟随消息语言。
- Three new settings, in the existing settings page and both languages: `mode` (`triage` /
  `full`), `triageAsk`, `triageModel`. Configuration keys 23 → 26.
  设置页新增三项（中英双语）：`mode`（分流 / 全团队）、`triageAsk`、`triageModel`；配置键 23 → 26。

### Compatibility / 兼容

- `mode: 'full'` reproduces the previous behaviour exactly — every message runs the team, no tier
  line, no greeting — and is pinned by a test. `mode: 'full'` 逐字节复现旧行为（每条消息都走团队，
  无档位行、无迎宾语），并有测试钉住。

### Fixed / 修复

- **Short questions and short two-step instructions were answered as small talk** (t53 F1, blocker).
  The "short and inert ⇒ direct tier" shortcut ran before the sequencing and question rules, so
  `为什么天空是蓝的`, `先备份然后升级` and `这个报错 src/triage.ts:42` were answered with a greeting
  template: the tier line was honest, the work never happened. The shortcut now runs after every
  strong signal, a question always costs at least one worker, and a pointer that carries a path, an
  error code or a snippet is dispatched instead of being asked about. Enumerations (`1) … 2) …`,
  `一、… 二、…`) and semicolons count as sequencing. 短问句与短两步指令曾被当成寒暄用模板答掉（档位
  行诚实、活儿没干）：短路规则现在排在全部强信号之后，问句至少一个工人，带路径/错误码/代码片段的
  "这个报错"直接派工而不反问；序号、顿号、分号都算多步。
- A bare `简单` / `团队` with no question waiting no longer guesses (and no longer crashes): it says
  that the pending question expired or the plugin reloaded. 无待答问题时的裸"简单/团队"不再猜、也不
  崩，而是明说上一轮没有待回答的分流问题。

### Notes / 说明

- The pending question and its answer live in plugin memory for ten minutes and are consumed when
  used, so a reload or a longer pause forgets them; the next bare choice word says so. 确认档的问题与
  回答存在插件内存里，10 分钟、用后即弃，重载或超时后会明说。
- The greeting arrives **with** the final answer, not before it: under `in-turn` a turn admits one
  plugin message, so during the run the visible signal is the progress board. 迎宾语随最终回答一起
  到达（`in-turn` 下一轮只允许一条插件消息），运行期间可见的是进度面板。
- The quick tier is "one call in the common case": when the plain call returns nothing, one
  structured retry follows, and the answer text still says one worker. 快手档常态一次调用；第一次
  没有产出时会重试一次结构化调用，措辞仍是"一个工人"。

## [0.2.2] - 2026-10-28

Incremental release on top of the published `0.2.1`: the deadline became a real bound, model
routing became visible in every report, and a verified task stopped being failed for the
verifier's prose. Nothing here restates a `0.2.1` change.

**On "quality":** this release fixes a decision defect, it does not raise the quality of the
models. Measured in the test home before the fix: 12 reports — 1 `COMPLETED`, 8 failed for the
defect described under Fixed, 3 cancelled by deliberate probes (deadline / unload). With the
shipped default chains (one `deepseek-v4.1-flash` route per role, `maxRetries: 0`) a verifier
that reports a *blocking* problem still fails the task, and that is the intended behaviour. If
you want stricter or looser verification, that is a model choice
(`roles.verifier`), not something this release tunes for you.

`0.2.1` 之上的增量版本：截止时间成为真正的上限、模型路由在每份报告里可见、已通过的任务不再
因为 verifier 的一句散文备注被判失败；不重复 `0.2.1` 已经发布过的改动。

**关于"质量"：** 本版修的是**判定缺陷**，不是把模型变强。修复前测试 home 实测：12 份报告 ——
1 份 `COMPLETED`、8 份因 Fixed 里描述的缺陷失败、3 份是被刻意取消的探针（超时 / 卸载）。按默认
链（每角色一条 `deepseek-v4.1-flash`、`maxRetries: 0`），verifier 报告**阻塞性**问题时任务依然
会失败，这是预期行为。想要更严或更松的验证属于模型选择（`roles.verifier`），本版不替你调。

### Added / 新增
- **The Web GUI shows the run while it happens / Web 界面现在能看见工作流在跑。** The plugin
  writes the four session events the stock conversation panel folds into a **workflow-run
  node** (`tool-workflow/run-start`, `agent-start`, `agent-end`, `run-end` — the same family
  and the same payload fields the in-tree workflow tool writes, pinned by a contract test).
  A message now produces a live node ~60 ms after the turn opens — before any subagent
  exists, which is exactly the window that used to be empty — with one member row per
  subagent appearing and settling as the run proceeds (planner → workers → verifiers) and a
  terminal status (`Completed` / `Cancelled` / `Failed`) at the end. Measured on a real
  profile: node at ~0.26 s after Send, members 0 → 1 → 2 → 3, `run-start` written at turn
  level 78 s before the step opened, and a run stopped from the GUI closing as `cancelled`.
  / 插件写入会话面板折叠成 **工作流运行节点** 的四个事件（`tool-workflow/run-start`、
  `agent-start`、`agent-end`、`run-end`，事件族与字段形状与 in-tree 工作流工具完全一致，
  由契约测试钉死）。发一条消息后 **约 60 ms** 主窗口即出现运行节点——**早于任何子代理存在**，
  正是过去那段空白；成员行随子代理出现与结束逐条增长（planner → worker → verifier），
  结束时给出终态（已完成 / 已取消 / 失败）。真机实测：点发送后约 0.26 s 节点可见，成员
  0 → 1 → 2 → 3，`run-start` 写在 turn 级、比 step 出现早 78 s，GUI 上停止的运行以
  `cancelled` 收尾。
- **Settings: `showProgress` switch / 设置页新增 `showProgress` 开关。** One checkbox, on by
  default, in both languages: turn it off and the run writes nothing but its messages, so a
  session log carries no run events at all. That makes 23 configuration keys.
  / 设置页加一个默认开启的双语复选框：关掉后运行只写消息不写任何运行事件，会话日志里完全
  没有运行痕迹。配置面因此变为 23 个键。
- **Run name carries the task count when it is known / 已知任务数时，运行名带任务数。**
  A run started with a caller-supplied plan is titled `grok-workflow · 3 tasks` (the panel's
  title is the run name). A run that plans first keeps the bare name, because the count does
  not exist at the moment the node must appear — the panel's live member count covers it.
  / 调用方给了计划时运行名形如 `grok-workflow · 3 tasks`（面板标题就是运行名）；先规划后
  执行的运行保持裸名——节点出现的那一刻任务数还不存在，此时由面板的实时成员计数代替。

### Fixed / 修复
- **A verified task is no longer failed for the verifier's opinion / 已通过的任务不再因为
  verifier 的一句备注被判失败。** The task decision now belongs to the verifier's structured
  judgement — `verdict` plus one `criteria` entry per acceptance criterion with `met` and
  evidence. Its prose `issues` list used to override that judgement, so a verifier that said
  `pass` with every criterion met still failed the task for writing down a caveat. The cost was
  visible: in the test home **8 of 12 recorded reports failed for this reason** — including all
  five t46 acceptance rounds, whose notes say "non-blocking", "minor observation rather than a
  failure", "does not affect any acceptance criterion". A verified task's notes are now carried
  into the report's `Uncertainties` as `verifier note: …` instead of being turned into a
  failure, and the verifier prompt states that `issues` is for blocking problems only (residual
  doubt belongs in `confidence`). A criterion marked `met: false`, or `verdict: fail`, still
  fails the task — that part is unchanged and pinned by tests.
  / 任务判定回归 verifier 的**结构化判断**：`verdict`，加上每条验收标准一条带 `met` 与证据的
  `criteria`。此前它的散文字段 `issues` 会覆盖该判断——verifier 判定 `pass` 且每条标准都满足，
  只要它顺手写下一句保留意见，任务依然判失败。代价是实测的：测试 home **12 份报告里有 8 份**
  因此失败，包括 t46 的 5 轮验收，而那些备注自己写着"non-blocking"（非阻塞）、"minor
  observation rather than a failure"（只是小观察不是失败）、"不影响任何验收条款"。现在已通过
  任务的备注会以 `verifier note: …` 进入报告 `Uncertainties` 而不是变成失败，verifier 提示词
  也写明 `issues` 只用于**阻塞性问题**（残余疑虑请写 `confidence`）。`met: false` 或
  `verdict: fail` 仍然判失败——这部分没变，且有测试钉住。
- **The deadline is now the plugin's own hard bound, and it says so / 截止时间现在是插件自己
  的硬上限，并说明它的数值。** `timeoutMs` was enforced by aborting a signal and then waiting
  for the engine to settle; a measured run was still working minutes after its 60 s deadline,
  and its cancellation was reported as "cancelled by its caller" — pointing at the wrong actor.
  The run result now races the plugin's own deadline, so the caller always gets the timeout
  report on time, the cancel reason names the deadline it hit, and every report carries a
  `Deadline: <n> ms per run` line. / 过去的 `timeoutMs` 只是中断一个 signal 然后等引擎收尾；
  实测有运行在 60 s 截止后数分钟仍在工作，取消原因还写成"由调用方取消"，把责任指错了人。
  现在运行结果与插件自己的截止时间赛跑：调用方总能按时拿到超时报告，取消原因写明打中的
  截止值，每份报告带一行 `Deadline: <n> ms per run`。
- **`Model routes:` is always printed, and a failure report no longer claims `inherit` /
  报告始终打印 `Model routes:`，失败报告不再谎称 `inherit`。** The line used to be skipped
  whenever every configured chain was empty, so "nothing configured" and "the line is missing"
  looked identical; a timeout or unload report hard-coded an all-empty routing block even when
  the run had been handed a chain. Unset roles now say `inherit`, and failure reports derive
  their chains from the configuration in force. / 该行过去在所有角色链为空时被整行省略，
  "没配置"与"这行没打印"看起来一样；超时/卸载报告还用写死的空路由块，哪怕运行确实拿到了
  链。现在未配置的角色显示 `inherit`，失败报告按生效配置生成链。
- **An unload can finally be explained / 插件被卸载终于能查到原因。** When the plugin is
  unloaded, it now writes a `plugin:grok-workflow/dispose` record into every affected session
  *before* cancelling anything — time, uptime, trigger class (`management` / `shutdown` /
  `test` / `unknown`), the redacted call-site frames,
  how many runs were live, and each run's id and age — plus one diagnostics line. The
  cancelled report is also split by cause: a run killed by an unload now says so
  (`grok_workflow was cancelled because the plugin was unloaded while the run was in flight`),
  distinct from `cancelled by its caller`. Before this, two runs in two workspaces were
  cancelled 573 ms apart and the only trace was "was cancelled before it produced a report".
  The class is decided by a **signal probe**, not by guessing from the stack: the plugin
  subscribes to shutdown signals at load time and records any that arrive before disposal
  (a shutdown signal ⇒ `shutdown`). The redacted call-site frames are a tie-breaker only,
  because on a real instance both a SIGTERM and a settings-page toggle show nothing but
  cordis internals within the frame budget. `unknown` is a legitimate answer — an
  in-process unload on the test instance recorded `signals: []` and `trigger: unknown` —
  and the record always carries the raw material so the class can be re-derived.
  / 插件被卸载时，**先**写入 `plugin:grok-workflow/dispose` 记录再取消运行：时间、存活时长、
  触发类别（`management`/`shutdown`/`test`/`unknown`）、脱敏调用栈帧、
  当时活跃 run 数与每个 run 的 id 与时长，并输出一行诊断日志。取消报告同时按原因拆分：
  被卸载打断的运行明说"插件在运行期间被卸载"，与"被调用方取消"区分开。此前两个 workspace
  的 run 相隔 573 ms 被取消，唯一痕迹只有一句"was cancelled before it produced a report"。
  触发类别由**信号探针**决定而非从调用栈猜：插件加载时订阅关闭信号，并记录在卸载之前是否
  收到过（收到即 `shutdown`）。脱敏调用栈帧只作并列依据——真机上 SIGTERM 与设置页停用两者
  可见帧全是 cordis 内部帧，单靠栈只能答 `unknown`。`unknown` 是合法答案（测试实例上一次
  进程内卸载记录到 `signals: []`、`trigger: unknown`），记录里始终带着原始材料可复核。
- **A cut run tells the user through its report, and an idle disable stays silent /
  被切断的运行通过报告告知用户，空闲停用则完全安静。** If a run was actually interrupted, its
  session gets one notice row (no model call): what was interrupted, that the cause was an
  unload and not a deadline, and that messages until re-enable are answered directly. That row
  is **written to the session log but not rendered** by the stock conversation panel in DSH
  `0.2.1-rc.2` — it sits at a `(turn, step)` that never opens a step, and the panel starts an
  assistant row only on `step/start` — so the row's job is the ledger plus the next turn's
  context, and the **report is the user-visible channel**: the cancelled run's report names the
  unload as the cause. Disabling the plugin on purpose while nothing runs writes **nothing**
  into any session — a direct answer is the expected behaviour there.
  / 只有在**确有运行被切断**时，该会话才会写入一条提示行（不花模型调用）：说清被中断的工作、
  原因是卸载而非超时、以及恢复前的消息将直答。该行在 DSH `0.2.1-rc.2` 的原生会话面板里
  **只写入、不渲染**——它落在一个从未开启 step 的 `(turn, step)` 上，而面板只为 `step/start`
  开启助手行——因此它的作用是台账 + 下一轮上下文，**用户可见的告知通道是报告**：被取消那次
  运行的报告明说原因是插件卸载。**空闲**时停用插件（用户有意为之）不向任何会话写入任何内容
  ——此时直答就是预期行为。
- **One session can no longer starve the others / 一个会话不再能饿死其它会话。** The active-run
  cap is now per session (`maxActiveRuns`, default 2) with a process-wide backstop
  (`maxActiveRunsTotal`, default 8), and a refusal names the holders: `already has 2 active
  run(s) in this session; maxActiveRuns is 2 per session (holding: run 3f5c… (running 14m38s),
  run 9b02… (running 2m01s))`. Measured before the fix: two long runs in one session refused
  three other sessions across three workspaces.
  / 并发槽位改为**按会话**（`maxActiveRuns`，默认 2）+ 进程级兜底（`maxActiveRunsTotal`，默认 8），
  拒绝文案写明占槽者（run id 与已跑时长）。修复前实测：一个会话两个长 run 拒掉了三个 workspace 的
  三个会话。
- **Default deadline raised to 60 minutes / 默认超时提高到 60 分钟。** The 30-minute default was
  measured to be a knife-edge, not a margin: two four-task runs were killed at 30m00s and
  30m01s, while real four-task runs finish in 878 s / 1148 s / 1801 s. Hard ceiling unchanged
  (24 h), settings page range unchanged.
  / 30 分钟默认值是刀口而非余量：两个四任务运行分别在 30m00s 与 30m01s 被杀，而真实四任务运行用时
  878 s / 1148 s / 1801 s。硬上限（24 h）与设置页范围不变。

### Changed / 变更
- **The settings page speaks the language DSH is set to / 设置页跟随 DSH 的语言设置（中英双语）。**
  Every string on the page — card title and one-line summary, group headings, per-field labels,
  numeric ranges, the per-role chain editor (add / remove / placeholder / empty-chain hint),
  read-only rows, Save / Discard / Saving, the save outcome and every validation finding — now
  resolves through the composition's own locale plugin (`@deepseek-ai/dsh-client-locale`) instead
  of being printed as one hardcoded bilingual line. The bundle registers its dictionary
  (`ctx.locale.register('grok-workflow', { zh, en })`) and declares `locale: 'grok-workflow'` on its
  `plugins.item` slot, so Settings → General → Language switches the page, the card title and the
  card summary in place — the same setting that drives `<html lang>`. The browser's `navigator`
  language is never consulted, and a composition with no locale service still mounts the page in
  English rather than not at all.
  / 页面全部文案（卡片标题与一行简介、分组标题、字段标签、数值范围、按角色链编辑器、只读行、
  保存/放弃/保存中、保存结果、以及全部校验错误）改为经由组合自带的 locale 插件
  （`@deepseek-ai/dsh-client-locale`）解析，不再打印硬编码的中英混排一行字；bundle 注册自己的
  字典并给 `plugins.item` 槽声明 `locale`，因此"设置 → 通用 → 语言"切换即让页面、卡片标题与
  简介就地换语言——与驱动 `<html lang>` 的是同一个设置。**不**读取浏览器 `navigator` 语言；
  组合里没有 locale 服务时页面仍以英文挂载，而不是整页缺失。
- **Validation findings are data, not prose / 校验结果是数据而不是成品句子。** `validate()`
  returns `{ key, params }` findings and the page renders them through the active language, so one
  draft reports identically in both languages and a language switch re-renders findings already on
  screen instead of stranding the old wording. / `validate()` 返回 `{ key, params }`，由页面按当前
  语言渲染；同一份草稿在中英文下报同一批问题，切换语言时已在屏幕上的错误会一起换语言。

## [0.2.1] - 2026-10-27

Incremental release on top of the published `0.2.0`: everything below is **new since** that tag —
nothing in this section restates a change that `0.2.0` already shipped.

`0.2.0` 之上的增量版本：本节全部是**自该 tag 以来新增**的内容，不重复 `0.2.0` 已经发布过的改动。

### English

#### Added
- **Settings page in the Web GUI / Web 图形界面的设置页。** The plugin now ships its own
  browser bundle, so the Plugins page shows a **Grok workflow** card with all 21
  configuration keys: the 17 live fields (gate, context and concurrency limits,
  synthesis, failure classes, run records) and the 4 structural keys read-only with
  their reason. Per-role fallback chains are edited in place (add / remove / edit a
  route, up to three per role), invalid input is refused before it reaches the Host,
  and a save applies to the **next** message. The page appears only while the Host
  serves the namespace, so an inactive plugin shows no card instead of a dead form.
  / 插件自带浏览器端 bundle：插件页出现 **Grok workflow** 卡片，渲染全部 21 个配置键
  （17 个可编辑的活动字段 + 4 个只读结构性字段并给出原因），支持按角色链的增删改
  （每角色最多 3 条），非法输入在提交前被拦下并列出原因，保存后对**下一条消息**生效；
  命名空间未提供时整页不出现，而不是显示一个坏掉的表单。
- **Activation prerequisite documented / 记录激活前提。** `@deepseek-ai/dsh-web-app` ships
  `workflow-ptc` disabled, so installing the bundle puts the row in the graph while the
  plugin stays `pending (waiting for service: workflowEngine)`. The install steps now
  include re-enabling a workflow provider, plus the four checks that prove activation
  (clean boot, served namespace, GUI card, `grok_workflow` in a real session's tool
  list). / `dsh-web-app` 层默认禁用 `workflow-ptc`，装包只让行进入组合图而插件停在
  `pending`；安装步骤已补上"启用一个工作流 provider"和四条激活校验。

### 简体中文

#### 新增
- **Web 图形界面的设置页。** 插件自带浏览器端 bundle：插件页出现 **Grok workflow** 卡片，
  渲染全部 21 个配置键（17 个可编辑的活动字段 + 4 个只读结构性字段并给出原因），支持按角色
  链的增删改（每角色最多 3 条），非法输入在提交前被拦下并列出原因，保存后对**下一条消息**
  生效；命名空间未提供时整页不出现，而不是显示一个坏掉的表单。
- **记录激活前提。** `@deepseek-ai/dsh-web-app` 层默认禁用 `workflow-ptc`，装包只让行进入
  组合图而插件停在 `pending (waiting for service: workflowEngine)`；安装步骤已补上"启用一个
  工作流 provider"和四条激活校验。

## [0.2.0] - 2026-10-26

### English

#### Added

- **Mandatory entry (the gate).** The plugin now claims every user message
  through `agent/pre-step`, runs the full plan → execute → verify → synthesise
  workflow, and delivers the result inside the same turn (`answerStrategy:
  in-turn`, the default). Turning a message away is a stated decision: an empty
  or over-long message (over 4000 characters) is refused with its reason
  printed, and nothing is executed. Delivery is de-duplicated per message, so
  re-dispatching a batch cannot start a second run, and the queue per agent is
  bounded (`maxQueuedMessages`).
- **Per-role model routing with ordered fallback chains.** `roles.planner`,
  `roles.worker`, `roles.verifier` and `roles.synthesizer` each take up to three
  routes (`{ provider, model }`, or a bare model id as shorthand). Every child
  call is routed by role, and a route-level failure advances that role's chain.
  The routes actually used are recorded in the report (`routing`) and rendered in
  the answer, so a chain that never took effect cannot look like routing that
  works.
- **Switch policy you can inspect.** `switchOn` lists the failure classes that
  advance a chain (default: the built-in policy). Content failures
  (`task-failed`, `verification-failed`) never advance — a different model would
  be looking at the same evidence — and a typo in `switchOn` is refused at load
  instead of silently never switching.
- **Failure class and category in every report.** Each failure carries what
  happened (`class`, e.g. `rate-limit`, `timeout`, `verification-failed`) and
  who has to fix it (`category`: `infrastructure`, `quality`, `configuration`,
  `cancelled`, `unknown`). The rendered answer adds a `Failures:` line, so a
  provider outage is not read as poorly done work.
- **A settings surface that is the same truth as the runtime.** The exported
  `Config` is projected into the standard DSH settings UI; fields are live
  (an edit reaches the next message, an invalid edit is refused with its reason
  while delivery keeps the last valid snapshot). Unknown configuration keys are
  rejected with the closest accepted key instead of being ignored, and
  `roles`/`synthesis` are validated against the providers the runtime actually
  has. Run records (`recordRuns`, `recordLimit`) can be turned off or capped.
- **Write-path isolation for parallel tasks.** A plan task may declare
  `writesPaths`; tasks whose declared paths overlap run one after another, and
  everything else keeps running in parallel. `[]` means "writes nothing";
  declaring nothing means "unknown" and is treated conservatively. Overlap is
  decided lexically (`.`, `..`, separators, case) with segment-wise prefixes, so
  `src` covers `src/a.ts` while `src/a` does not cover `src/ab`.
- **A real-engine contract test base and a reliability suite.** The tests drive
  the actual `@deepseek-ai/dsh-workflow-ptc` engine (script VM, guest program,
  `agent()` contract, result materialization) with a scripted subagent provider,
  and cover cancellation, deadlines, the concurrency cap, duplicate starts,
  recursion refusal, context bounds, secret redaction, partial results, unload
  and reload. 264 deterministic tests across 18 files; no online model is needed.
  Process confinement, sandbox policy and capability gating remain out of scope.

#### Changed
- **`enforceGate` is `true` by default: every user message now goes through the
  workflow.** This is the point of the release and also the biggest visible
  change from `0.1.0`, where the tool only ran when a model chose to call it.
  Set `enforceGate: false` to get the `0.1.0` behaviour back (the tool stays
  available, the gate does not intercept).
- The answer is delivered inside the turn by default (`answerStrategy:
  in-turn`). `relay` and `append` remain selectable for long-lived surfaces; on a
  one-shot headless run they deliver after the process has begun tearing down.
- Acceptance criteria must stay distinct after normalization (trailing sentence
  punctuation, collapsed whitespace and case are ignored when matching a
  verifier result), so `["Do X.", "do x"]` is now rejected.
- The planner prompt receives the objective as redacted JSON data rather than
  raw interpolated text, matching how worker and verifier prompts are built.
- The report validator now enforces what it documented: deep-checked attempt
  payloads against closed unions, confirmed evidence traceable to the task's
  last attempt, unique task ids, `limits.maxTotalAgents` inside the request
  builder's window, and every failed task present exactly once in `incomplete`.
- The package version is `0.2.0`, the changelog keeps one bilingual section per
  version, and `npm run ci` runs typecheck, lint, build and the full suite.

#### Fixed
- An infrastructure failure no longer escapes as a raw exception. Every
  transport-level failure (429, timeout, connection reset, missing model, a
  crashed child) now produces a structured report with
  `category: infrastructure`; the worst case is one failed row per task.
- Redaction rules have a single source (`REDACTION_RULES`) and the workflow
  script's prompt-side redactor is generated from it. Added Azure SAS
  (`sig`/`signature`) and `Authorization: Basic` coverage.
- Verification no longer compares acceptance-criterion text byte-for-byte, so a
  verifier that copies a criterion with a trailing period, different spacing or
  different case no longer fails every attempt.
- A run-level failure (deadline, cancellation, an unvalidatable report) now
  prints its `Failures:` line from the run-level error categories instead of
  showing none.
- A malformed routing record no longer discards the whole ledger, and the
  delivery fallback keeps the last valid configuration instead of the load-time
  one, so a later invalid edit cannot silently undo an edit that had taken
  effect.

#### Breaking notes (`0.1.0` → `0.2.0`)
- **Mandatory entry is on by default.** If you want the old opt-in behaviour,
  set `enforceGate: false`. A deployment that must never degrade silently should
  also set `gateRequired: true`, which turns "this runtime has no `agent/pre-step`
  hook" into a load error instead of a warning.
- **The report is additive but extended:** task rows gain `writesPaths` (array or
  `null`), failures gain `class` and `category`, and `plan.tasks` must match
  `tasks` field for field. Consumers that reject unknown fields must be updated;
  consumers that ignore them keep working.
- **Configuration keys are validated.** Unknown keys are rejected at load with a
  suggestion, and `roles` chains are refused when empty models, duplicate routes
  or more than three routes are present. A configuration that loaded under
  `0.1.0` because a key was silently ignored may now fail loudly — that is
  intentional.
- **Criteria distinctness** can reject input that `0.1.0` accepted.
- Requires DSH `0.2.1-rc.2` and Node.js 22 or newer; the `0.1.0` peer set is not
  supported.

### 简体中文

#### 新增

- **强制入口（闸门）**：插件现在通过 `agent/pre-step` 认领每一条用户消息，执行完整的
  规划 → 执行 → 验证 → 汇总工作流，并在**同一轮**内交付结果（`answerStrategy:
  in-turn` 为默认）。拒绝一条消息也是明示决定：空消息或超过 4000 字符的消息会被打印
  拒绝原因且不执行任何工作。每个消息的交付做了去重，同一批被重复派发也不会启动第二次
  运行；每个 agent 的等待队列有上限（`maxQueuedMessages`）。
- **按角色模型路由 + 有序备用链**：`roles.planner`、`roles.worker`、`roles.verifier`、
  `roles.synthesizer` 各自最多三条路由（`{ provider, model }`，也接受裸模型 id 简写）。
  每次子代理调用按角色取路由，路由级失败会推进该角色的链。实际用到的路由写进报告
  (`routing`) 并渲染在答案里，因此"配了但没生效"不会被误当成"配好了"。
- **可检视的切换策略**：`switchOn` 列出允许推进备用链的失败类别（默认=内置策略）。
  内容类失败（`task-failed`、`verification-failed`）永不推进——换模型看到的是同样的
  证据；`switchOn` 里写错类别会在载入时被拒绝，不会变成"永不切换"。
- **每份报告都带失败类别与归类**：每个失败同时给出发生了什么（`class`，例如
  `rate-limit`、`timeout`、`verification-failed`）和该谁修（`category`：
  `infrastructure`、`quality`、`configuration`、`cancelled`、`unknown`）。渲染的答案
  增加 `Failures:` 行，provider 故障不会被读成"活干得不好"。
- **设置面与运行时同一真相**：导出的 `Config` 会被投影成 DSH 标准设置页；字段是活值
  （编辑对下一条消息生效，非法编辑以原因被拒绝，投递继续使用上一次合法快照）。未知
  配置键会被拒绝并给出最接近的合法键，而不是被静默忽略；`roles`/`synthesis` 会对照
  运行时实际拥有的 provider 校验。运行记录可用 `recordRuns`/`recordLimit` 关闭或封顶。
- **并行任务的写路径隔离**：计划任务可声明 `writesPaths`，声明路径重叠的任务依次执行，
  其余保持并行。`[]` 表示"不写文件"；什么都不声明表示"未知"，按保守方式处理。重叠判定
  是词法的（`.`、`..`、分隔符、大小写）且按段比较前缀，因此 `src` 覆盖 `src/a.ts`，
  而 `src/a` 不覆盖 `src/ab`。
- **真实引擎契约测试基座与可靠性套件**：测试直接驱动真正的
  `@deepseek-ai/dsh-workflow-ptc` 引擎（脚本 VM、guest 程序、`agent()` 契约、结果
  物化），配合脚本化的子代理 provider，覆盖取消、超时、并发上限、重复启动、递归拒绝、
  上下文边界、密钥脱敏、部分完成、卸载与重载。264 个确定性测试 / 18 个文件，无需在线
  模型。进程隔离、沙箱策略与能力门禁仍不在覆盖范围内。

#### 变更
- **`enforceGate` 默认 `true`：每条用户消息都会走完整工作流。** 这正是本版本的目的，
  也是相对 `0.1.0` 最大的可见变化——`0.1.0` 只有模型主动调用工具时才运行。若想恢复
  `0.1.0` 的行为，设 `enforceGate: false`（工具仍可用，闸门不再拦截）。
- 答案默认在同一轮内交付（`answerStrategy: in-turn`）。`relay`、`append` 仍可选用，
  适用于长驻界面；在一次性 headless 运行中它们在进程开始销毁后才投递。
- 验收标准归一化后必须互不相同（匹配验证结果时忽略结尾句读、多余空白与大小写），
  `["Do X.", "do x"]` 这类输入现在会被拒绝。
- 规划提示词接收经脱敏的 JSON 形式目标，与 worker、verifier 提示词的构造方式一致。
- 报告校验器补齐了声明的约束：逐次尝试载荷按闭合枚举深度校验、confirmed 证据必须可追溯
  到该任务最后一次验证、任务 id 唯一、`limits.maxTotalAgents` 落在请求构造器取值区间、
  每个失败任务在 `incomplete` 中恰好出现一次。
- 版本号改为 `0.2.0`；更新日志每个版本保持中英对照；`npm run ci` 运行 typecheck、
  lint、build 与完整测试。

#### 修复
- 基础设施故障不再以裸异常逃逸。所有传输层故障（429、超时、连接重置、模型不存在、
  子代理崩溃）都会产出结构化报告并标注 `category: infrastructure`；最坏情况是每个任务
  一行失败。
- 脱敏规则改为单一来源（`REDACTION_RULES`），工作流脚本内的提示词脱敏器由它生成；
  新增 Azure SAS（`sig`/`signature`）与 `Authorization: Basic` 覆盖。
- 验证不再逐字比较验收标准文本，验证者抄错结尾句号、空白或大小写不会再导致每次尝试失败。
- 运行级失败（超时、取消、报告无法校验）也会打印 `Failures:` 行（取自运行级错误类别），
  而不是什么都不显示。
- 单条畸形路由记录不再毁掉整份台账；投递回落改取**上一次合法配置**，因此后续非法编辑
  无法静默撤销已经生效的编辑。

#### 破坏性说明（`0.1.0` → `0.2.0`）
- **强制入口默认开启。** 需要旧的可选行为请设 `enforceGate: false`。要求"绝不静默降级"
  的部署还应收紧 `gateRequired: true`：把"运行时没有 `agent/pre-step` 钩子"从警告变成
  载入错误。
- **报告为纯增量但已扩展**：任务行新增 `writesPaths`（数组或 `null`），失败新增 `class`
  与 `category`，且 `plan.tasks` 必须与 `tasks` 逐字段一致。拒绝未知字段的消费方需要
  适配；忽略未知字段的消费方不受影响。
- **配置键会校验**：未知键在载入时被拒绝并给出建议；`roles` 链出现空模型、重复路由或
  超过三条会被拒绝。`0.1.0` 下因键被静默忽略而"能用"的配置，现在可能直接报错——这是
  有意为之。
- **验收标准去重**可能拒绝 `0.1.0` 曾接受的输入。
- 需要 DSH `0.2.1-rc.2` 与 Node.js 22 及以上；`0.1.0` 的 peer 集合不再受支持。

## [0.1.0] - 2026-10-25

### English

#### Added
- Initial version of Grok Workflow for DSH, an external DSH bundle exposing the `grok_workflow` tool.
- Bounded plan, parallel execution, independent verification, limited retries, and a structured final report.
- Configurable limits for concurrency, retries, task count, execution deadline, and active workflow runs.
- English and Simplified Chinese setup documentation, architecture notes, acceptance checks, tests, and an optional GitHub Issue watcher.

#### Fixed and hardened
- Validate workflow reports before presenting them as results, including explicit `completed`, `partial`, and `failed` invariants.
- Bound task input and report payload sizes, and redact common credential formats from model-facing diagnostics.
- Treat GitHub Issue content as untrusted input and restrict credential variables passed to watcher wake processes.
- Test the committed `lib/` build output so a stale compiled package cannot silently pass CI.

### 简体中文

#### 新增
- Grok Workflow for DSH 首个版本：作为 DSH 外部 bundle，提供 `grok_workflow` 工具。
- 支持有限规划、并行执行、独立验证、有限重试和结构化结果汇总。
- 支持配置并发数、重试次数、任务数、执行时限和同时运行的工作流数量。
- 提供英文与简体中文文档、架构说明、验收清单、自动化测试，以及可选的 GitHub Issue 监控脚本。

#### 修复与安全加固
- 在展示结果前校验工作流报告，明确约束 `completed`、`partial` 和 `failed` 状态。
- 限制任务输入和报告大小，并对模型可见的诊断信息中的常见凭据格式进行脱敏。
- 将 GitHub Issue 内容视为不可信输入，并限制监控脚本唤醒进程可继承的凭据环境变量。
- 在 CI 中检查已提交的 `lib/` 构建产物，避免过期编译文件在测试通过后被错误打包。

### Changed / 变更

- **The main session joins a live run by default / 主会话默认就能并入正在跑的这一轮** — *[manual item Sec.2-2]*
  A message typed while a run is working is answered at once and folded into that run's remaining waves instead of waiting for the next round. The switch stays on the settings page, so turning it off gives every message its own round again. The cost is bounded: one planner-route call per wave boundary, at most four per run, and only when a message actually arrives mid-run.
  / 跑中发来的消息现在默认立刻得到回执，并并入这一轮剩下的波次，而不是等到下一轮。设置页仍保留那个开关，关掉就回到"每条消息各起一轮"。代价是有界的：每个波边界一次规划调用，每轮至多四次，而且只在跑中真的来了消息时才花。

- **The settings page says whether an upgrade is needed / 设置页直接说要不要升级** — *[manual item Sec.2-4]*
  The version card used to print two numbers and leave the comparison to the reader. It now states the verdict (on the latest release, or a newer one is available) and says plainly that the page cannot run system commands, so the upgrade is the copyable install line run in a terminal.
  / 版本卡以前只并排显示两个号码，比不比由读者自己看。现在它直接给出结论（已是最新 / 有新版可装），并明说这一页不能替你执行系统命令——升级就是把那行可复制的安装命令贴到终端里跑。

### Added / 新增

- **A 429 checkbox for model failover / 换模型时 429 有了勾选框** — *[manual item Sec.3-2]*
  `switchOnRateLimit` (default on) decides whether a rate-limited route advances to the next model in the chain. On, the built-in policy applies. Off, the six other failure classes still fail over, the 429 keeps its route and the task's bounded retry decides — the right trade when the next model costs much more than waiting.
  / 新增 `switchOnRateLimit`（默认打开）：限流（429）时是否换到链上的下一个模型。打开即内置策略；关掉后其余六个失败类别照旧换人，429 留在原路由交给任务的有界重试——当下一个模型明显更贵时这才是对的取舍。

- **The report states that the summary was checked and reviewed / 报告写明汇总过了检查与复核** — *[manual item Sec.3-3]*
  A model-written summary always passed two gates (a guardrail check, then an independent verification), but nothing said so. The run report now carries a `Summary review:` line naming each stage's verdict and the draft count, so a checked summary is no longer indistinguishable from a single-shot one.
  / 模型写的那段结语一直要过两道门（先护栏检查、再独立复核），但报告里看不到。现在报告多一行 `Summary review:`，写明每一关的判定和用了几稿——"检查过"和"只汇总了一次"从此分得开。

### Fixed / 修复

- **A refused mode-route request names the methods it accepts / 被拒的总开关请求会写明允许的方法** — *[manual item Sec.2-3]*
  A 405 from the switch route now carries an `Allow: GET, POST` header, so a client or a proxy log can tell what the route does accept instead of seeing an unexplained status. The method gate and the header read the same list, so they cannot drift.
  / 总开关路由的 405 现在带 `Allow: GET, POST`，客户端或代理日志不用解析响应体就知道它接受什么方法，不至于只看到一个没头没尾的状态码。方法判断和这个响应头读的是同一张表，不会各说各话。

### Docs / 文档

- The progress-panel design document now states the six-stage spine (the permanently-empty `回答` cell was removed) and, separately, the single-rail connector with the ownership trade-off it costs — both pinned by tests (`test/progress-tab.spec.ts`, `test/progress-connector.spec.ts`). Answer-parity and drawing-task scope gained evidence notes under `docs/knowledge/evidence/`.
  / 进度页设计文档改成六段脊椎（永远空的"回答"格已删除），并另加一节说明"一根公共轨"的连线模型以及它换来的归属代价——两处都有测试钉住（`test/progress-tab.spec.ts`、`test/progress-connector.spec.ts`）。答案长相一致与绘画任务范围各补了一份证据说明，放在 `docs/knowledge/evidence/`。
