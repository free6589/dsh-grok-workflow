Last updated: 2026-11-21 08:10 +08:00（**对话框底部第三个开关：workflow 总开关（`/grok on|off` 的按钮形态），未发版** —
`src/client/index.js` 新增 `MODE_ROUTE_PATH='/grok-workflow/mode'`、`MODE_ACTIONS=['status','set']`、
`MODE_SWITCH_ORDER=92`、`makeModeSwitch` 形态的 `ModeSwitch` 组件与 `GROK_WORKFLOW_MODE` 导出；
dock 三挂载（`startBothSwitches` 改名 `startDockSwitches`，loop 90 / iterate 91 / mode 92）。
传输层抽成共享 `routeUrl`/`postRoute`，loop/iterate 的 `send` 改用它（行为与错误码不变）。
按钮读写的是 `src/mode-surface.ts`（agent-36）已落地的 `POST /grok-workflow/mode`：body
`{action,sessionId,enabled?}`，回 `{ok,action,mode:{enabled,...}}`，真相源 = 会话记录
`plugin:grok-workflow/mode`；UI **不硬编码默认值**（无记录时显示路由报回的 `grokDefault`），
也不新增 `masterEnabled` 存储。关闭态三重提示：文案「关」、空心指示灯、熄灭胶囊。
`npm run ci` exit 0 = **72 文件 / 1341 测试 PASS**、typecheck 0 错、oxlint 23 warnings / 0 errors、
`verify:lib` 通过；`lib/client.js` 随 `src/` 重建。红证据：改错路由常量 → 2 failed；
把关闭态画成开启 → 4 failed（`docs/knowledge/evidence/workflow-switch-button-20261121/`）。
**未发版**：只加 UI 与测试，版本号未动。NOT_RUN：真实浏览器 GUI 手点（需在真机 profile 里
装载后点一次，prod 路径证据止于「真 client bundle → 真 `node:http` → 真 `handleModeRoute` →
真 `Session` 记录回读」）。**工作树其余改动属并发轮**：`src/index.ts`、`src/mode-surface.ts`、
`lib/index.*`、`lib/mode-surface.*`、`test/mode-surface.spec.ts` 是 core 兄弟（agent-36）的，
本轮未提交它们。）

Last updated: 2026-11-21 08:05 +08:00 (**`/grok` 开关词改为「去空白 + 不分大小写」** —
任务「实现 /grok on|off 斜杠命令」派到我名下；实测该命令**早已存在**（`src/command.ts` +
`src/mode.ts` + `src/gate.ts:521`，D-028/D-029/D-078 已定），本轮只补真实缺口：`rawInput` 解析。
改法：`trim()` 后 `toLowerCase()` 再比 `on`/`off`（`trim` 覆盖空格/制表符/换行/U+00A0/U+3000），
非字符串参数直接回用法提示（旧代码在那里抛 `TypeError`），`on`/`off`/空之外仍不写任何记录。
**裸 `/grok` 仍然=开**：委派 AC 里「无参数也要用法提示」与本仓库已发布契约（D-028、README 双语、
客户端 `status.off.detail`、4 条既有测试）相反，未按 AC 回退，冲突写进 `D-095` 与交接待裁决。
状态字段澄清：不存在 `masterEnabled`；唯一总开关是会话记录 `plugin:grok-workflow/mode.enabled`
（兜底配置默认值 `grokDefault`），命令与 Agent-37 的 dock 开关（`POST /grok-workflow/mode`，
`status|set`）读同一条记录。
**测试**：`test/command.spec.ts` 19→26 例（+7），改前 4 红 / 改后 26 绿（证据
`docs/knowledge/evidence/grok-command-grammar-20261121/`）；`npx vitest run --exclude
'test/client.spec.ts'` = **70 文件 / 1212 例 PASS**；`npm run typecheck` exit 0；`npm run lint`
0 error / 23 warning。`test/client.spec.ts` 当前 **15 红**，来自并发轮未提交的
`src/client/index.js`（+91 行，dock 总开关），不由本轮引入、也未提交其文件。
**未发版、未改版本号、无 force-push；未改 DSH core、未写密钥。**

Last updated: 2026-11-20 23:15 +08:00 (**已发版 `0.12.14`，web profile 已更新** —
`v0.12.14`（annotated tag → `c0eabef`）已推，远端 CI `44760621921` success、
Release `44760644587` success（asset `dsh-grok-workflow-0.12.14.tgz`）。
内容即 `[Unreleased]` 里那条 `/compact` 修复；发版提交只含版本号+CHANGELOG+README
版本联动（`package.json`/`package-lock.json` 0.12.14，README 双语版号/示例/tag 列表
同步到 v0.12.14，`v0.12.13` 保留在已发布列表里）。
`~/.dsh/profiles/web` 的 `dsh-grok-workflow` 已从 `github:` 未固定版升到
`github:free6589/dsh-grok-workflow#v0.12.14`（`plugin ls` = 0.12.14，`lib/` 的
`.js`/`.d.ts` 与仓库逐字节一致，闸门三件套在装好的包里确认存在）。
**工作树仍有并发轮未提交改动**（CHANGELOG 双语条目第二条、`src/delivery`、
`src/checkpoint/schema`、`test/delivery-human-block`、`test/checkpoint-bound`、
`test/config-chain-types`），发版时已 stash 隔离、发完原样恢复；`test/checkpoint-bound`
依赖被 stash 的 schema 注释改动，发版校验时曾临时移开、已放回。
未改版本号之外的东西，无 force-push，旧标签未动。

Last updated: 2026-11-20 22:45 +08:00 (**存量会话离线修复 + 新 profile 实测** —
用户报的 `session-3a683cb6` 的 `/compact` 报错已修好：该会话两行旧版卸载通知
（seq 3553、seq 5424，无 `step/start` 的 `assistant/message`）已在离线改为同 seq/同时间的
`plugin:grok-workflow/terminal` 记录，文字逐字保留，seq 0–7476 连续；真实 DSH 0.2.2-rc.3
`Session.create` + `TokenMeter.measure` 全量回放从"seq 3553 抛错"变为
"7507 事件、`totalTokens=508565` 通过"（`REPAIR EFFECTIVE: true`）。
`test/compact-step-pairing.spec.ts` +1 用例（7 绿）钉住"terminal 形状过 meter"。
新 profile `verify-compact`（`sdk` 模板、插件 `link:` 安装）上 `drive.mjs --team`：
真实团队档 turn + 真实 `/compact` 一次通过
（`Compacted 7 history items`，0 孤儿行，`ok: true`）。
`npm run ci` 在含并发轮改动的全树上 72 文件 / 1306 测试 PASS。
备份 `.rsi/evidence/compact-repair-20261120/`（before 日志 + 测量输出）。
工作树仍有并发轮未提交改动（CHANGELOG/`src/delivery` 等），本轮只动了测试文件，未发版。

Last updated: 2026-11-20 15:50 +08:00 (**compact 修复已并入 main** —
用户报 `/compact` 报错，根因是回执/通知/取消终态三处都在没有打开 step 时写 assistant 行，DSH 的
token 计量器回放第一次就抛 `token meter: assistant/message at seq N has no matching step/start
event`，游标不前进 → 此后每次测量都抛，`compactNow()` 先测量 → `/compact` 报错、自动压缩静默失效。
修复：新增 `openStepOf()` 闸门（`src/records.ts`），三个写点统一走 `appendAssistantInStep()`；被拒的
回执/通知文字改存 `plugin:grok-workflow/terminal` 记录（`D-094`）。
**并入方式**：分支 `fix-compact-orphan-receipt`（`5fb5da0`，base `39eda66`）由**并发的发版轮**以 merge
提交 `e80ed6d`（父 `490edce` + `5fb5da0`）并入 `main`；其 `CHANGELOG` 解法与本轮独立解出的一致——
修复留在 `[Unreleased]`、`0.12.13` 已发版段原样保留。**未改版本号、未打新 tag、无 force-push。**
`lib/` 由合并后的 `src/` 重建，`git status -- lib/` 为空（分支提交的 `lib/` 就是合并后源码的构建产物，
`verify:lib` 在合并树上 exit 0：153 files byte-identical）。`@deepseek-ai/dsh-token-meter` 是本轮新增 devDependency，主 checkout 原先没装
（`tsc` 报 TS2307，`npm install` 后 exit 0）。
**合并树上实测**：`npx vitest run` = **70 文件 / 1269 测试 PASS**（`39eda66` 上 1262 + 本修复 6 +
R38 1）；`npm run typecheck` / `lint`（0 error、24 warning）/ `build` / `verify:lib` 均 exit 0。
**之前 / 之后同一条命令**：`scripts/repro-compact.mjs` 在合并前的 mainline `490edce` 自己的 `lib/` 上
exit 1（计量器错误直达 `/compact` handler），在合并后的 `main` 上 exit 0 并答
`No compactable history yet.`；`test/compact-step-pairing.spec.ts` 在 `490edce` 树上 4 红 / 2 绿，
在合并后 6 绿、连跑两次同结果。证据 `.rsi/evidence/compact-fix/{main-before,main-after,main-before-test}.txt`。
GUI 手点 `/compact` 仍属 NOT_RUN（会真的压缩一个活动会话）。

Last updated: 2026-11-20 13:38 +08:00 (**round-036：base64 折行低于续行下限时整块留下；checkpoint 上界文档复核** —
折到 7 列及以下的 base64 私钥块，窗口能匹配但没有任何一行够长当续行，于是 272 字符里留 244 个，
解回去就是横幅与密钥本体（round 33/34 的断言只解码 ≥4 字符碎片，看不见）。新增
`BASE64_CONTINUATION`：≥8 行逐行吃 + 连续 ≥2 行短行整段吃（可选，否则宽折行整体失配，第一版踩过）。
页脚规则按实测改写（末行 <8 留、≥8 吃），`ARCHITECTURE` 的「16 字符 / 窄于 24 列不匹配」两处过期文字
删除；`test/redact.spec.ts` +3 用例（折行 1–7 两侧、页脚 7/8 两侧、base64 PGP 两侧边界）。
checkpoint 上界 1,048,447 的注释与用例属 round 31（`a97d099`），本轮复核通过、未改动（`A41`、`D-091`）。
代码提交 `e3be559`；干净 worktree 上 `npm run ci` exit 0 = **68 文件 / 1236 测试 PASS**、
`verify:lib` 153 files byte-identical；HEAD `aabed51`（含并发 harness 轮）上 `npm run ci` exit 0 =
**69 文件 / 1251 测试 PASS**。**未发版**（`0.12.10`/`0.12.11` 由并发进程发出，规则随 `0.12.10` 已在线上）。

Last updated: 2026-11-20 12:05 +08:00 (**round-033：手工折行的 base64 私钥整块落进报告；顺带修好账本滞后** —
`base64-private-key` 的窗口原是连续 20 字符字面量，任何窄于它的折行都把标记自身拆开，实测
8/12/16/19/20/21/22/23 列全部整块留存、24 列才第一次生效。窗口改为生成式、字符间可容忍一个断行
（真实换行或 JSON `\n` 转义），续行下限 16→8 并按行边界锚定（`D-088`、`A37`）；折行 ≤7 列仍留，
并入池。同轮修掉记录层缺陷：`.rsi/ledger.jsonl` 停在 25、`ROUND.md` 已到 32，门禁读到
`round-without-ledger`（三轮 SKIP 会升级成 STOP），补 27–32 六行并新增 `test/rsi-ledger.spec.ts`。
`npm run ci` exit 0 = **68 文件 / 1231 测试 PASS**。**已发版 `0.12.8`**：commit `9f91684`、annotated
tag `v0.12.8` 已推；远端 CI `44670766356` success、Release `44670771402` success
（asset `dsh-grok-workflow-0.12.8.tgz`，602,301 B）。）

Last updated: 2026-11-20 11:10 +08:00 (**round-032：删零调用的面板投影模块，未发版** —
`src/panel.ts`（286 行）零生产导入者（`src/` 零引用、`src/index.ts` 不导出、bundle 不用），
活面板走 `progress-tab.ts` + bundle 渲染器。删模块 + 自有测试（557 行）；
`test/gui-fold.ts` 自带 `PanelEvent` 类型供 `test/progress.spec.ts`。
`npm run ci` exit 0 = **67 文件 / 1223 测试 PASS**（-13 例皆所删模块自有测试）；
`npm run verify:lib` 153 files byte-identical。**已发版 `0.12.7`**：commit `56e701d`、annotated tag `v0.12.7` 已推，远端 CI `44666191493` success、Release `44666195466` success（asset `dsh-grok-workflow-0.12.7.tgz`）。）

Last updated: 2026-11-20 12:10 +08:00 (**round-034：双重转义的折行 base64 块，未发版** —
HEAD 上真换行折行 1–24 列已全盖（round 33），活缺口是已带字面 `\n` 的日志行再包一层 JSON
（反斜杠加倍，单反斜杠断行分支对不上）。`BASE64_BREAK` 加双反斜杠分支 +1 用例；
报告/提示词两边界同走 `REDACTION_RULES`，无分叉。
`npm run ci` exit 0 = **68 文件 / 1232 测试 PASS**（基线 68/1231，+1）；
`lib/redact.*` 随 `src/` 重建。**已发版 `0.12.9`**：R3 提交 `5d3bcea`（并发轮落地）+ R5/R6 提交 `4b751b3`、annotated tag `v0.12.9` 已推，远端 CI `44673443254` success、Release `44673449471` success（asset `dsh-grok-workflow-0.12.9.tgz`）。）

Last updated: 2026-11-20 15:40 +08:00 (**round-038 收口：非字符串 model/provider，未发版** —
`entry?.model?.trim()` 对非字符串抛 bare TypeError。现在拒绝带完整路径 + got-type；
`{model: null}` 从"空字符串"分支改走"类型错"分支。`npm run ci` exit 0 =
**69 文件 / 1263 测试 PASS**（+1 用例）；`lib/` 随 `src/` 重建。
**已发版 `0.12.13`**：R38 提交 `7825ca7`（+证据 `490edce`）、annotated tag `v0.12.13` 已推，远端 CI `44697135387` success、Release `44697140006` success（asset `dsh-grok-workflow-0.12.13.tgz`）。）

Last updated: 2026-11-20 14:10 +08:00 (**round-036 收口：2400 截断保头尾，未发版** —
超长人话块从尾砍，结论行被砍、双语时第二语言全没。现在保头（答案）+保尾（结论），
从中间砍；双语每块独立截。`test/delivery-human-block.spec.ts` +3 用例（旧码 1 failed）。
`npm run ci` exit 0（69/1262，含并发轮测试）。**已发版 `0.12.12`**：R36 提交 `aa5e79c`、发版提交 `61c7cb8`、annotated tag `v0.12.12`（→`61c7cb8`）已推，Release `44686655900` success（asset `dsh-grok-workflow-0.12.12.tgz`）。）

Last updated: 2026-11-20 13:05 +08:00 (**round-035 收口：嵌套未知键，未发版** —
`roles.reviewer` 与路由字段手误 `maxInflight` 曾被静默丢弃（补丁留着、运行忽略）。
`assertKnownKeys` 走三层（顶层/角色名/路由字段），拒绝报完整路径 + 最接近可用键；
合法补丁不受影响（迁移：删掉点名的键，无替代值）。
`npm run ci` exit 0 = **68 文件 / 1233 测试 PASS**；`lib/` 随 `src/` 重建。
**已发版 `0.12.10`**：R3 提交 `0ef5bb7` + 构建 `0d91e45`、annotated tag `v0.12.10` 已推（远端 CI 红：并发轮塞入的 2 个窄折行测试与源码不一致，见 Round 89）；**已发版 `0.12.11`**：回退提交 `5749a08` + 发版提交 `d181812`、annotated tag `v0.12.11`（→`d181812`）已推，远端 CI `44681025399` success、Release `44681029703` success（asset `dsh-grok-workflow-0.12.11.tgz`）。）

Last updated: 2026-11-20 10:20 +08:00 (**round-031：检查点「拒绝带」上限的注释多算了 129 字节** —
行为自 round 27 起就是对的（写入侧双向按 `maxBytes` 收敛），错的是注释：完整性记录不是固定 129 字节，
而是 **122 字节 + `bytes` 的十进制位数**（4,000 字节载荷配 126 字节、1,048,447 配 129 字节），所以
`writeCheckpoint` 从 **1,048,448** 就拒绝，真上限是 **1,048,447**。注释改正并点名守卫；
`test/checkpoint-schema.spec.ts` 新增 1 条：从真实封存文件量出开销→解出上限→在 1,048,447 处写入成功
（文件正好 1,048,576 字节、读回完整）→1,048,448 处 `too-large`→把 `src/checkpoint/schema.ts` 读回来
要求注释写出该上限。`npm run ci` exit 0 = **68 文件 / 1236 测试 PASS**（基线 1235，+1）；typecheck 0 错、
oxlint 24w/0e。红绿：旧码 worktree 里该用例 **1 failed**（注释守卫），新码 **38 passed**。
文档：`DECISIONS.md` D-087、`RESEARCH.md` A36、`VALIDATION.md` Round 83。证据 `.rsi/evidence/round-031/`。
**不发版**：只改注释与测试，无用户可见变化，按 `docs/RELEASING.md` 不 bump、不打 tag、`[Unreleased]` 保持空。
上一版仍是 `0.12.6`（commit `e7150ab`、tag `v0.12.6`、CI `44659057507`、Release `44659061505`）。）

Last updated: 2026-11-20 10:13 +08:00 (**round-030：base64 包裹的 GnuPG 私钥不再原样进报告** —
round 29 只堵了 PEM 这一半，`base64` 过的 GnuPG 钥匙串导出/JSON 字段里的密钥整块进报告、诊断和
复查/重试提示词，因为编码形态里根本不存在解码后的横幅。`base64-private-key` 从 3 条标记扩到 9 条
（`PRIVATE` 与遗留 `SECRET` × 三种分组对齐），窗口取到横幅第 17 字节——`PRI`/`SEC` 与 `PUB` 正是在
那里分开，实测「共享前缀 `-----BEGIN PGP ` 的标记」会连 base64 公钥一起脱敏，故不采用。
`npm run ci` exit 0 = **68 文件 / 1235 测试 PASS**（基线 1233，+2）；typecheck 0 错、oxlint 24w/0e；
`verify:lib` 在提交后复核 `e7150ab` 153 files byte-identical。红绿：旧码 worktree 里
`-t "GnuPG"` → 2 failed | 35 skipped，失败输出就是整串编码后的块；新码 37 passed。
文档：`DECISIONS.md` D-086、`RESEARCH.md` A35、`VALIDATION.md` Round 81/82、`ARCHITECTURE.md`
覆盖清单与已知缺口、`CHANGELOG.md` 双语条目。证据 `.rsi/evidence/round-030/`。
**已发版 `0.12.6`**：commit `e7150ab`、annotated tag `v0.12.6`（对象 `167b475`）已推，
远端 CI `44659057507` success、Release `44659061505` success（asset
`dsh-grok-workflow-0.12.6.tgz`，600,316 B）；旧标签对象未动，无 force-push。
顺带量出并**未修**的边界：**<24 列折行**的 base64 块会把 20 字符标记拆到两行，整块完全不匹配
（8/12/16/19/20/21/22/23 列留 180–184/184 字符；24 列起才脱敏）——PEM 自 round 29 起既有，已入池。
NOT_RUN：真机 GUI 手点；2026-11-20T10:01:50Z 之后的真实定时投递（子代理被拒 `schedule_*`，
心跳行 `COUNT=10` 仍撑不到 12-01，需主会话续订）。）

Last updated: 2026-11-20 09:45 +08:00 (**round-029：base64 包裹的私钥不再原样进报告** —
每条 armor 规则匹配的都是解码后的横幅，所以 `base64 -w0` 的密钥文件、或藏在 JSON 字段/blob 里的
base64 私钥整块进报告；旧代码只在前面恰好有敏感名标签（`PRIVATE_KEY=`）时才被 `key-value` 顺手
挡住。新规则 `base64-private-key` 匹配横幅的编码形态，三种分组对齐全盖，整块替换含换行续行；
base64 `CERTIFICATE` 与被 base64 包裹的 PGP armor 有意不动（后者仍是池里的缺口）。
`npm run ci` exit 0 = **68 文件 / 1233 测试 PASS**（基线 1230，+3）；typecheck 0 错、oxlint 24w/0e、
`verify:lib` 153 files byte-identical。红绿：旧码 worktree 里新用例 2 failed / 1 passed，失败输出
就是整串 base64 私钥体。文档：`DECISIONS.md` D-085、`RESEARCH.md` A34、`VALIDATION.md` Round 79、
`ARCHITECTURE.md` 覆盖清单与已知缺口、两份 README 安全条目。证据 `.rsi/evidence/round-029/`。
**已发版 `0.12.5`**：commit `5b7cae1`、annotated tag `v0.12.5`（对象 `47fcb52`）已推，
远端 CI `44656151053` success、Release `44656153854` success（asset
`dsh-grok-workflow-0.12.5.tgz`，599,562 B）。
NOT_RUN：真机 GUI 手点、真实定时投递（子代理被拒 `schedule_*`；现有心跳行 `COUNT=10` 只到
2026-11-20T10:01:50Z，撑不到 12-01，需主会话续订）。）

Last updated: 2026-11-20 09:10 +08:00 (**round-028 收口：R11，CI 全绿，未发版** —
取消终结不再走 `relayText`（成功前言+markers+折叠台账），改说人话结论；
`phase1-dialogue` 3 个旧断言随行为同步更新（行为断言未动）。
`npm run ci` exit 0 = **68 文件 / 1230 测试 PASS**；`lib/` 随 `src/` 重建。
**已发版 `0.12.4`**：commit `5cd2b1c`、annotated tag `v0.12.4` 已推，远端 CI `44652383452` success、Release `44652387975` success（asset `dsh-grok-workflow-0.12.4.tgz`）。）

# Project State

Last updated: 2026-11-20 08:55 +08:00 (**round-027：读侧字节上限跟着写入侧走，载荷越界不再「写得进读不出」** —
`assertCheckpoint` 把 `integrity.bytes` 卡在 `countCeiling`（1,000,000，行数上限），而
`sealCheckpoint` 接受载荷到 `maxBytes`（1,048,576）：落在这两者之间的检查点封装、落盘都成功，
读回即 `invalid`，续跑永远起不来。一行上限改为 `maxBytes` + 注释；新用例把载荷顶过边界再落盘读回
（一条最大宽度证据行 2,055 字节，481 行 = 1,001,015 字节；503 行仍在上限内，故带内至少 22 行宽）。
`npm run ci` exit 0 = **68 文件 / 1230 测试 PASS**（基线 1229，只增不减），typecheck 0 错、
oxlint 24w/0e、`verify:lib` 提交后复核 153 files byte-identical。**选题前先把 `POOL.md` 与树对表**：
六条已陈旧（`records.ts` 全 `redactError`、`history.ts` 先脱敏后截断、`answerLead` 三段候选、
R6/R9 随 0.12.2、R10 随 0.11.20），R11 仍成立（`gate.ts:611-644` 仍组合 `relayText`）。
文档：`DECISIONS.md` D-084、`RESEARCH.md` A33、`VALIDATION.md` Round 76、`ARCHITECTURE.md`
的字节上限句。证据 `.rsi/evidence/round-027/`。NOT_RUN：真实定时投递（D-066）、GUI 手动点击拍照。
发版见 `docs/RELEASING.md`。**已发版 `0.12.3`**：commit `fd6a5ee`、annotated tag
`v0.12.3`（对象 `0c66263`）已推，远端 CI `44647313571` success、Release `44647317251`
success（asset `dsh-grok-workflow-0.12.3.tgz`，597,237 B）。档案 `~/.dsh/profiles/web`
升到 `#v0.12.3`（`lib/` 与标签 `diff -r` = 0），宿主 pid `154637` 未重启；装好的产物自身
跑通 1,001,051 B 载荷落盘→读回。独立复查 `reviewer-027` = `ACCEPT`（worktree 里改回旧上限
复现 1 failed / 36 passed）。NOT_RUN：运行中进程内存里的代码身份、复制档案实例的 GUI 交互。


Last updated: 2026-11-20 08:20 +08:00 (**`web` profile 已到最新发布 `v0.12.2`，仓库无需变动，DSH 未重启** —
远端最新 tag/Release 仍是 `v0.12.2`（`40228c5`），本地 `main` = `origin/main` = `5bd5bfe`
（`git describe` = `v0.12.2-4-g5bd5bfe`）：标签是祖先，其后只有四条 docs 提交
（`074e2c3`/`07666fb`/`09c2bc9`/`5bd5bfe`），`git diff --name-only v0.12.2..HEAD -- src lib test
package.json` = 0 个文件，发布代码与标签逐字节相同——故无提交可 fast-forward、也没有回退到标签
提交（回退会丢已推记录并让本地落后远端）。档案侧 `~/.dsh/profiles/web` 的 `dsh-grok-workflow`
由 `#v0.12.1` 升到 `#v0.12.2`（`dsh plugin --profile web add`，锁文件解析到 `40228c5` tarball，
`dsh plugin ls` = `0.12.2`，`node_modules` 内 77 个 `lib/**/*.js|*.d.ts` 与仓库 `lib/` sha256
全同）。DSH 主进程 pid `154637` 的 `lstart`/boot_id 未变、`etimes` 206082→206772+、GUI 仍应答
——**未重启**；核心无档案 watcher，运行中的进程仍是 `0.12.1` 代码，两条修复要等下次 profile
启动。**验收口径冲突（`CONFIRMED`）**：「HEAD 等于最新发布标签提交」在「不回退、不 force-push、
本地远端同步、不擅自新发版」四条约束下无解，取舍与被否方案见 `DECISIONS.md` D-083。
NOT_RUN（遵约束）：重启/重载、force-push、移动标签、npm 发布、改 DSH 核心。证据
`.rsi/evidence/profile-update-0.12.2/`。）

Last updated: 2026-11-20 (**round-026 收口：R6 + R9，CI 全绿，未发版** —
`resolveConfig` 传错 `grokDefault` 现在直接拒绝（不再静默按 off 跑）；
COMPLETED 轮次不再把重试救回来的失败印进 `Failures:`（两处渲染器同规则，
PARTIAL 的行不受影响）。`npm run ci` exit 0 = **68 文件 / 1229 测试 PASS**，
typecheck 0 错、lint 24w/0e；`lib/` 10 文件随 `src/` 重建。**已发版 `0.12.2`**：commit `c1be0c7`（+hygiene `40228c5`）、annotated tag `v0.12.2` 已推，远端 CI `44641153858` success、Release `44641158387` success（asset `dsh-grok-workflow-0.12.2.tgz`）。NOT_RUN：真实定时投递、GUI 手动点击拍照。）


Last updated: 2026-11-20 (**0.12.1 已发版：自迭代默认模板 = 仓库自己的轮次提示词** —
`DEFAULT_ITERATE_TEMPLATE` 从 12 行通用提示词换成 `docs/iterate-template.md` 的轮次提示词
（POOL 优先选题→TODO/失败行/GitHub/论文、每轮至少一项、小修不研究 vs 大改需 RESEARCH 且
池内获批且不编造来源、R1–R6、三重评审含复制档案真机、四道刹车、禁区），`src/client/index.js`
的 bundle 副本同步；`test/iterate-template.spec.ts` 钉住「文档 ↔ 常量」逐字节一致并逐项检查
必需章节，`test/loop-surface.spec.ts` 补自迭代路由 `status` 用例。`npm run ci` exit 0 =
**68 文件 / 1227 测试 PASS**，typecheck 0 错、lint 24w/0e；`verify:lib` = `lib/ at 23d3369 is
the build of src/ at 23d3369`（153 files byte-identical）。真机（复制档案 `loopfix-verify`
`:3451`，实例已停）：真实 bundle 的自迭代开关开→Schedule 行写入 3239 字符、与默认模板逐字节
相同；关→只删自己那行，会话无 Schedule 残留、未误删他人行；二次开关同样干净。证据
`.rsi/evidence/round-025/`（`boot.redacted.txt` 已脱敏，无 token/cookie）。**已发版
`0.12.1`**：commit `23d3369`、annotated tag `v0.12.1` 已推；远端 CI `44595376323` success
（Node 22/24），Release `44595391505` success（asset `dsh-grok-workflow-0.12.1.tgz`）。旧标签
未动、无 force-push。NOT_RUN：真实定时投递、GUI 手动点击拍照。

Last updated: 2026-11-20 (**round-024 收口：三线合一，真机复核过** —
`/grok on` 后台受理（`answerFullBehind`，5 例）+ intake 提示词入口加固（14 例）
+ 双开关/模板（9+97 例）三条并发线合在同一工作树；`npm run ci` exit 0 =
**67 文件 / 1219 测试 PASS**，typecheck 0 错、lint 24w/0e、`verify:lib` 通过。
真机（`loopfix-verify` `:3451`）：loop/iterate 双路由各走各的全 200、taskId 不同；
真实 bundle 双开关生产路径 mount/开/关全通、各建各删各；实例已停、证据无密钥。
**已发版 `0.12.0`**：commit `9839025`、annotated tag `v0.12.0` 已推，远端 CI `44587743089` success、Release `44587748822` success（asset `dsh-grok-workflow-0.12.0.tgz`）。NOT_RUN：真实定时投递、GUI 手动点击拍照。）


Last updated: 2026-11-20 (**settings-toggle-ui 收口：双开关 + 模板 textarea 全链路真机过** —
上一轮落地的自迭代实例/路由之上，本轮补齐了任务的全部验收面：设置页新增「自迭代」分组
（`iterateIntervalMin` 数字 + `iterateTemplate` textarea，`error.badTemplate` 4000 上限校验，
中英字典 +20 键），`iterateTemplate`/`iterateIntervalMin` 进 schema/CONFIG_KEYS（13→15 键），
`src/index.ts` 的 iterate 实例 `defaultPrompt` 读 live 模板、空白回退内置默认；客户端开关
重构为 `makeHeartbeatSwitch` 工厂，`GROK_WORKFLOW_ITERATE` 导出、`startBothSwitches` 双挂载。
生产路径测试走真实 page fetch → 真 `node:http` → 真 `handleLoopRoute` → 真
`createLoopService`（不传任何 send 覆盖，v0.11.21 教训不复现），并新增 textarea
draft→ops→save 持久化用例。真机验证（隔离 profile `loopfix-verify` `:3451`，lib 重建后重启
实例，结束后已停）：两开关独立开/关、互不碰对方的行；模板经**真实设置写路径**
（describe→mutate 带 expectedRevision→重 describe 逐字节读回→cordis.patch.yml 落盘）持久
且刷新后开关仍能刷新活行；循环 close 不带走自迭代行，收尾 schedule 存储无残留行、
patch 里的测试模板已恢复。`npm run ci` exit 0 = **67 文件 / 1218 测试 PASS**、
`verify:lib` 通过；证据 `.rsi/evidence/round-024/`（`ci-settings-run.log`、
`switches-and-template.mjs/.txt`）。**未发版、未提交**：树里另有 intake/`/grok on`
两个并发任务的未提交修复。**NOT_RUN**：真实定时投递（D-066）、浏览器 GUI 手动点击拍照。)

Previous update: 2026-11-20 (**心跳隔离第二轮：自迭代心跳成为插件第二个实例后的真实串线已修** —
`src/index.ts:313` 的第二个 `createLoopService`（`RSI heartbeat`）+ `src/loop-surface.ts:148`
的 `/grok-workflow/iterate` 路由落地后，第一轮「自迭代心跳无插件路由」的记录过期，本轮按当前树
重审并修正文档。真实缺陷：`forgetSession` 走写死的 `isLoopSlot`，**自迭代实例的归档清扫会删掉
循环的行、留下自己的行**（先复现后修；当前接线只挂循环实例，故今天从组合层不可达，
但它是归档清扫的接口、两实例都暴露）；`deleteSessionHeartbeats`（`src/loop.ts:752`）改为接受
调用实例的 `slot` 谓词（默认 `isLoopSlot`，刹车语义不变），`forgetSession` 传 `slotOf`。
新增测试：反方向所有权 5 例、门禁「用户粘贴标记仍 admit」1 例、路由层「两开关两路由」4 例、
页面层路由隔离 1 例。负对照：去掉 `slotOf` 参数 → **1 failed / 14 passed**；iterate 路由绑到
循环服务 → **2 failed / 18 passed**（两文件按 sha256 逐字节还原）。`npm run ci` **exit 0 =
67 文件 / 1219 测试 PASS**（`lib/loop.js:552` 已带新参数，`verify:lib` 通过）。live
`~/.dsh/storages/schedule.json` 只读 = 一条无关任务、两心跳未武装、本会话零写入。
**未验证（`NOT_RUN`）**：真实定时投递（D-066）、真机 GUI 归档后任务列表。**残留**：
F3 `.rsi/STOP` 双停（D-080）、F5 保留名、卸载只清循环行（自迭代行按设计留存）。
改动未提交：`M src/loop.ts`、`M test/heartbeat-identity.spec.ts`、`M test/loop-surface.spec.ts`、
`M test/client.spec.ts`、`M lib/*`、`docs/knowledge/HEARTBEATS.md`（重写）+ 记忆六件；
工作树里 intake/command/answer 与 `test/iterate.spec.ts` 是并发任务的改动。)

Previous update: 2026-11-20 (**心跳身份与路由隔离审计收口** — Loop（`Loop heartbeat` /
`[grok-workflow loop]` / `/grok-workflow/loop` / `grok_loop`）与 Iterate（`RSI heartbeat` /
`# RSI heartbeat — round N`，`.rsi/HEARTBEAT.md`）身份拆成两个谓词（D-079）：
路由身份 `isLoopHeartbeat` 只认标记（`src/gate.ts:532` 门禁唯一入口），存储身份 `isLoopSlot`
只认保留名 + `rrule` + 目标会话；`open()` 三路清重复行、删除被拒改写幸存行，
Iterate 投递走 `non-user-source` 直通、`loop.review/admit/stop` 零调用（刹车 spy 钉死，
`test/heartbeat-identity.spec.ts` 10 例）。负对照：修前 `src/loop.ts` 上同两文件
**7 failed / 38 passed**（跑后 sha256 逐字节还原）；`npm run ci` exit 0 =
**66 文件 / 1195 测试 PASS**；live `schedule.json` 只读核对 = 一条无关任务、零写入。
改动未提交：`M src/loop.ts`、`M src/gate.ts`、`M test/loop*.spec.ts`、
`?? test/heartbeat-identity.spec.ts`、`?? docs/knowledge/HEARTBEATS.md` + 并发任务的
`src/intake.ts`/`src/command.ts`/`src/answer.ts`。**未验证（`NOT_RUN`）**：真实定时投递
（D-066）、真机 GUI 改写提示词观察投递；**残留**：F3 `.rsi/STOP` 双停（D-080）、
F5 保留名 `Loop heartbeat`（见 `HEARTBEATS.md` F5）。）

Last updated: 2026-11-19 (**用户报障修：续跑开关又能点了** — `LoopSwitch` 生产默认把
请求体形的 `loopSend` 当 fetch 用，真机上每次读取都只剩 `HTTP undefined`。
现默认走页面自己的 fetch + 新增生产路径回归用例；`npm run ci` exit 0 =
**63 文件 / 1159 测试 PASS**；复制 profile `loopfix-verify`（link 本树，端口 3451）
真机实测：路由 5×200 + 生产路径脚本 mount/开/关全通、服务端确认 task 落地与关闭、
实例已停、证据无密钥。改动未提交：`M src/client/index.js`、`M test/client.spec.ts`、
`M lib/client.js`、`M CHANGELOG.md`、`M docs/knowledge/VALIDATION.md`、
`?? .rsi/evidence/round-023/`。**已发版 `0.11.21`**：commit `73cbd4b`、annotated tag `v0.11.21` 已推，远端 CI `44543705967` success、Release `44543712011` success（asset `dsh-grok-workflow-0.11.21.tgz`）。用户已授权自动打 tag/push/发版（今后同类发版不再逐次请示）。）

Last updated: 2026-11-19 (**`0.11.17` 已发布并从 GitHub 更新到本机** — 常驻并行监护
（guardian）走 patch 发版：`package.json`/`package-lock.json`/`README×2`/
`docs/LOCAL-TESTING.md` 同步到 `0.11.17`，CHANGELOG `[Unreleased]` Added 搬进
`## [0.11.17]`；commit `5fc3e1d`、annotated tag `v0.11.17` 已推，远端 CI
`44459682983` success、Release 已建（asset `dsh-grok-workflow-0.11.17.tgz`）。
tag 安装验证 PASS（隔离 profile 从 `github:…#v0.11.17` 装：行激活、投影 11 键、
双工具、`loop` 路由开/关全通、`lib/guardian.js` 逐字节一致）。
本机 `web` profile 已从 GitHub 更新到 `#v0.11.17`（`0.11.13` → `0.11.17`，
guardian.js sha256 两侧一致，`--dump-config` 行正常）。
`npm run ci` exit 0 = **63 文件 / 1154 测试 PASS**。
**未验证（`NOT_RUN`）**：rrule 定时到点、真模型整轮、GUI 点击、unload/归档监听 firing
（操作体已 CONFIRMED）。
**剩余待办**：P3-01、P3-02 仍 OPEN；`src/index.ts:292` 注释仍 HYPOTHESIS 未动。）

Previous update: 2026-11-19 (**RSI round 17 完成 · `0.11.16` 已发布** — 主题：Q5 心跳识别修 + F1 设置面说法统一。
R6 一次过：commit `63a4fbb`、tag `v0.11.16` 已推、远端 CI `44440179151` success、GitHub Release 已建（Latest，asset `dsh-grok-workflow-0.11.16.tgz`）。
tag 安装验证 PASS：`…#v0.11.16` 装得上、行激活、投影 11 键与文档一致、假会话 open 被 admission 拒绝（行不落地）。
`npm run ci` exit 0 = **62 文件 / 1142 测试 PASS**。
**未验证（`NOT_RUN`）**：rrule 定时到点、真模型整轮、GUI 点击、unload/归档监听 firing（操作体已 CONFIRMED）。
**剩余待办**：P3-01、P3-02 仍 OPEN；`src/index.ts:292` 注释仍 HYPOTHESIS 未动。)

Previous update: 2026-11-19 (**RSI 连续循环 round 15 完成 · `0.11.15`** — 主题：收口 `v0.11.14` 的发布事故。
round 14 的标签提交 `20eafea` 的 `lib/` 落后于它的 `src/`（`lib/loop.js` 里没有 `callSchedule`），远端 CI 红、
Release 工作流停在 `Verify committed build artifacts`，所以那个标签**没有 GitHub Release**，也从未产出压缩包；
`main` 上的 `8c8e367` 只重建了产物。本轮按 D-070 从 `main` 打 **`0.11.15`**（patch）：只含构建产物重建 +
文档更正（两份 README 的测试数 1022/57 → 1081/60、新增「`v0.11.14` 不是发布版本、请固定 `v0.11.15`」一句）+
本轮记录，`v0.11.14` 标签原地不动、未 force-push、未发布 npm。`npm run ci` exit 0 =
**60 文件 / 1081 测试 PASS**、lint 22 warnings / 0 errors（`.rsi/evidence/round-015/pre-release-ci.txt`）；
新标签的 Release 由既有工作流创建，commit 与 run id 见 `.rsi/ROUND.md` Round 15 与 `VALIDATION.md` Round 61。
**剩余待办**：P3-01、P3-02 仍 OPEN（D-068 只改了顺序）；「客户端还没有真正会 POST `/grok-workflow/loop` 的
控件」仍是候选主题（D-069「现状」）。)

Previous update: 2026-11-18 (**RSI 连续循环 round 14 完成 · `0.11.14`** — 主题：续跑（repeat-run / loop）
面落地并发版。四个 `loop*` 键从「存着没人读」变成有驱动：一个循环 = Host Schedule 里一条 `rrule`
持久任务（标题 `Loop heartbeat`、文案前缀 `[grok-workflow loop]`、目标=本会话），插件自己不设 timer；
打开只走 `POST /grok-workflow/loop`（用户侧，路由在组合的 Host/Origin + 浏览器认证闸门后），
面向模型的 `grok_loop` 只有 `status`/`close`，`open` 以 `loop/user-only` 拒绝。停的语义：轮数上限写进
规则 `COUNT`（跑满行留 `ended`，下次 open 替换）、连败轮数只是文案提示（回执只证明收件箱写入）、
间隔取 `max(60, ceil(timeoutMs/60000), loopIntervalMin)` 封顶七天、关闭/卸载/停止/归档一律**删行**。
设置页多一组「续跑」（四字段，边界 100/20/10080，默认 false/10/3/0）。**文档**：README 中英各新增
「Repeat runs」一节 + 已知限制一条 + 表格行改为可核对的说法；CHANGELOG `## [0.11.14]` 双语；
DECISIONS **D-068**（操作者授权先落 P4 续跑面、P3-01/P3-02 保持 OPEN）与 **D-069**（续跑面归谁、
谁能开、靠什么停、关闭是什么）。`npm run ci` exit 0：typecheck 0 错、lint 22w/0e、
**60 文件 / 1081 测试 PASS**（发布脚本那次；文档侧先跑的一次是 60/1080，其间多了 1 条路由用例；
上一轮 57/1022，+3 文件/+59 测试，无删除无 skip）；commit `20eafea`、annotated tag `v0.11.14`，
`origin/main` = `20eafea`，旧标签未动。
证据 `.rsi/evidence/round-014/`、`VALIDATION.md` Round 60。
**剩余待办**：P3-01、P3-02（按 D-068 仍是 OPEN，顺序由下一位接手者按 PROTOCOL §2 决定）。

Previous update: 2026-11-18 (**RSI 连续循环 round 11 完成 · `0.11.11`** — 主题 P2-01：客户端 i18n 键
齐全性。bundle 有两本词典（插件 `DICT` 与面板 `PANEL_DICT`），此前没有任何检查把它们与代码实际请求的
键对起来。审计结论是**当前无缺陷**（插件每语言 137 键、面板 19 键，两表语言对称；字面/拼接/动态键全部
在消费它的那张表里可解析），因此本轮交付的是守卫：`test/i18n-parity.spec.ts` 6 条，按作用域断言，
并用一次变异重放证明它确实会红（删掉一个 `zh` 键 → `2 failed | 4 passed`，随即还原）。
`npm run ci` exit 0：typecheck 0 错、lint 22w/0e、**56 文件 / 1015 测试 PASS**；tag `v0.11.11`。
证据 `.rsi/evidence/round-011/`、`VALIDATION.md` Round 59、`D-065`。
**P1/P2 待办已清零**；剩余 P3-01/P3-02 与 POOL 里带 `P ·` 的调用点条目。

Previous update: 2026-11-18 (**RSI 连续循环 round 10 完成 · `0.11.10`** — 主题 P1-02：
`docs/ARCHITECTURE.md` 的版本状态。审计发现 POOL 的字面措辞（「current version」）已不存在，但同类
缺陷仍在：四处 `in this release` 无法落到版本，「resume 边界」只写了 DSH `0.2.1-rc.2` 而 round 8 已在
`0.2.2-rc.3` 上复查过。现改为 `since **0.8.0**` / `as of **0.11.9**`，并把「实测版本」与「只做复查的
版本」分开写、明写没有重测那条 journaling 边界。新增 `test/docs-architecture-version.spec.ts`（3 条）
钉住结构。`npm run ci` exit 0：typecheck 0 错、lint 22w/0e、**55 文件 / 1009 测试 PASS**；
tag `v0.11.10`。证据 `.rsi/evidence/round-010/`、`VALIDATION.md` Round 58、`D-064`。
**剩余待办**：P2-01（设置页 i18n 键齐全性守卫）、P3-01/P3-02、POOL 里的 P 级条目。

Previous update: 2026-11-18 (**RSI 连续循环 round 9 完成 · `0.11.9`** — 主题 P0-02：Progress 页
`执行`/`检查` 恒显示「事件中没有报告」。根因：脚本把 worker/verifier 的 `phase` 写成计划任务组
标题（`任务 n · 标题`），而面板只按 `phase` 匹配阶段，于是每次运行都必然发生的两个阶段永远空着。
修法：phase 命中不了阶段时再按**角色 label**（`执行`/`检查`、`Execute`/`Check`）判归属，并交叉
引用到阶段新增的 `evidence` 列表；`members` 仍是每行唯一的家（轨道与百分比统计同一批行），状态
自有行优先。role token 只匹配 label，标题含 `check` 的任务不会变成「检查」。两语言 meta 行改为
「N 行在下方任务节点中执行」/「N rows ran inside the plan tasks below」。`npm run ci` exit 0：
typecheck 0 错、lint 22w/0e、**54 文件 / 1006 测试 PASS**（上轮 54/999）；tag `v0.11.9`。
证据 `.rsi/evidence/round-009/`、`VALIDATION.md` Round 57、`D-063`。
**本轮起 STOP 判定强制留痕**：`.rsi/tools/stop-probe.sh` → `.rsi/evidence/stop-probes.txt`
+ `.rsi/LOG.md` 的 STOP 小节。**剩余待办**：P1-02、P2-01、P3-01/P3-02 与 POOL 里的 P 级条目。

Previous update: 2026-11-18 (**RSI 连续循环 round 8 完成 · `0.11.8`** — 主题：真机 disposition。
在 DSH `0.2.2-rc.3` 上用仓库内 `DSH_HOME`（沙箱下 `dsh` 写不了 `~/.dsh`，实测 EROFS）把本检出
`dsh plugin add` 进 `grok-workflow-dev`，`workflow-ptc` 改回启用后在 `127.0.0.1:3199` 起真实实例：
启动只有一行 URL（无 `pending`、无 `did not activate`），`POST /api/settings/describe` 投出 23 个
命名空间且 `grok-workflow` `autoGenerate: true`。**真模型消息 BLOCKED**：
`MISSING_CREDENTIAL … "deepseek-official"`，未把未跑过的运行标成 pass。顺手记下两处坑（`web` 模板
profile 无 `headless` 命令；`--from-default-profile web` 会启动并可能 EADDRINUSE）。`npm run ci`
exit 0：typecheck 0 错、lint 22w/0e、**54 文件 / 999 测试 PASS**；tag `v0.11.8`。
证据 `.rsi/evidence/round-008/`、`VALIDATION.md` Round 56、`D-062`。

Previous update: 2026-11-18 (**RSI 连续循环 round 7 完成 · `0.11.7`** — 主题：远端标签清单对账。
`git ls-remote --tags` 全量 32 个标签逐条对 README 中英列表与各标签所在提交的 `package.json`：
32/32 本地与远端对象相同（没有被移动过的标签）、每个 peeled 提交都是 `main` 祖先、两份列表
升序无重复无缺失且末项 = 当前发布、`HEAD == origin/main`。31 个标签版本一致；唯一例外
`v0.2.0-rc.1` 早于发布流程（所在提交 `package.json` 仍为 `0.1.0`），已发布标签不移动，改为在两份
README 写明并加 1 个守卫 `it`。`npm run ci` exit 0：typecheck 0 错、lint 22w/0e、
**54 文件 / 999 测试 PASS**；tag `v0.11.7`。证据 `.rsi/evidence/round-007/`、
`VALIDATION.md` Round 55、`D-061`。

Previous update: 2026-11-18 (**RSI 连续循环 round 6 完成 · `0.11.6`** — 主题 P1-03：
`docs/LOCAL-TESTING.md` 与 `src/config.ts` 对账。九个键、`maxRetries=1`、`maxActiveRuns=2` /
每进程 `8`、`timeoutMs` 默认 `3600000` 全部与代码一致；三处不符已修——四处安装示例指向
`0.2.0`/`0.2.1` 压缩包（发布线 0.11.x）、排障条目把「被修复的 `synthesis: deterministic`」写成
载入期拒绝、中文 README 的固化上限换了写法。`bump-version.py` 现在同步改写压缩包名；
`test/docs-config-keys.spec.ts` 7 → 12 个 `it`；`npm run ci` exit 0：typecheck 0 错、
lint 22w/0e、**54 文件 / 998 测试 PASS**（上一轮 54/993）；tag `v0.11.6`。
细节见 `.rsi/ROUND.md` round 6、`VALIDATION.md` Round 54、`D-060`。
**已知缺口（未修）**：Progress 页 Execute/Verify 段 `Not reported in the events`（P0-02）。

Previous update: 2026-11-18 (**RSI 连续循环 round 5 完成 · `0.11.5`** — 主题 P2-02：
`src/redact.ts` 的形状缺口与两处误伤。改前八条探针里五条是漏或损坏（引号内 `Cookie:`、
`X-Amz-Signature`/`X-Goog-Signature`/`?auth=`、PGP armor、`SECRET_KEY`/`PRIVATE_TOKEN`、
`const token = await refreshToken()` 被改写、`db_pass=hunter2;user=app` 丢尾部、占位符被二次脱敏）。
修复 = 引号感知的 cookie 规则 + 签名链接查询参数 + PGP 规则 + env 值 token 边界/比较符/关键字守卫 +
占位符守卫 + `isSensitiveKey` 连字符归一化。`npm run ci` exit 0：typecheck 0 错、lint 22w/0e（基线）、
**54 文件 / 993 测试 PASS**（基线 54/985）；tag `v0.11.5`。细节见 `.rsi/ROUND.md` round 5、
`docs/knowledge/VALIDATION.md` Round 53、`D-059`。**已知缺口（未修）**：仍无形状清单能穷尽；
base64 包裹的 PEM 无规则；Progress 页 Execute/Verify 段 `Not reported in the events`（P0-02，未修）。

Previous update: 2026-11-17 (**v0.10.0 发布准备完成 + 真机验收通过** —
基线 `main` = `ae0c6d3`（v0.9.4 已发布），工作提交在前一条 `3d9275a` 之上。
本轮 = 真机验收（**新 profile `acgtest95` / 新端口 `:3231`**，打包安装 `0.9.4` tgz、
md5 与仓库一致，Plugins 页出现 Grok workflow、8 键设置页、两次真实工作流运行：
7 段进度脊 + 首答 7s + 后台收尾 1/1 verified）→ `npm run ci` 全绿（typecheck 0 错、
lint 4w/0e、**51 文件 / 951 测试 PASS**、`lib/` 构建幂等且 `lib/client.js` 与
`src/client/index.js` 逐字节相同）→ 版本 `0.9.4` → **`0.10.0`**（`package.json` +
`package-lock.json` 联动）→ `CHANGELOG` 插入 `## [0.10.0] - 2026-11-17` →
README 中英配置参考按 8 键重写、`docs/LOCAL-TESTING.md` 同步 → push / tag / Release。
**已知缺口（未修）**：Progress 页 `Execute`/`Verify` 段报
`Not reported in the events`（成员事实没进该会话进度流），台账证明任务确实执行并核验
（见 VALIDATION Round 47）。

Previous update: 2026-11-17 (**设置页瘦身 + supervisor 第五角色，未提交** —
基线 `main` = `ae0c6d3`（v0.9.4）。工作树 50+ 文件；`npm run typecheck` 0 错、
`npx vitest run` **51 文件 / 951 测试全 PASS**、`npm run build` 成功且
`cmp src/client/index.js lib/client.js` 一致（191404 B）。
内容 = T1/T2/T3/T6 supervisor 贯通（五角色、预算 600、上限 100/默认 10）+
T4 删 24 键（CONFIG_KEYS 8 键、REMOVED 24 键、FIXED 写死、门控恒开、in-turn 恒定、
humanSummary 恒 true、markdown 直出）+ T5 设置页重写（4 标量 + 5 角色链、
无 hint/Danger/只读区、client 72 例绿）。CHANGELOG `[Unreleased]` 有 Added +
Changed 双语条目。**未提交 / 未 push / 未打 tag / 未发版**，等用户验收真机后再定。
`settings-simple-mock.html`（用户定稿 mock）未跟踪，不入库。

Previous update: 2026-11-15 (**v0.9.2 已发布** — `tag v0.9.2` → `5eb4942`，`origin/main` = `98f26a8`，
GitHub Release 已建（`dsh-grok-workflow-0.9.2.tgz` 464,763 B）。CI `43698707930`（Node 22+24）绿、
Release `43698836519` 绿；旧 tag 复核未动。发文细节与边界见文末
「2026-11-15 — v0.9.2 已发布：push / CI / tag / Release / Issue #1 闭环」。)

Previous update: 2026-11-15 (**v0.9.2 已本地提交 — 未 push / 未打 tag / 未发 GitHub Release**；
基线 `main` = `4b92278`。本轮内容 = B01/B02/B04 + 进度 Tab 脊椎/详情/连线 + 人话报告默认化
（agent-27）+ 两条基线既有 `test/gate.spec.ts` 失败的同步修复（只动测试等待条件）。工作树 30+ 文件；
`package.json` + `package-lock.json` = **`0.9.2`**；`CHANGELOG.md` 有 `## [0.9.2] - 2026-11-15`（中英
双语，含 `### Tests / 测试`）。本机 `npm run ci`：typecheck 0 错、oxlint **5 warning / 0 error**
（4 条既有 + `src/delivery/index.ts:264` 1 条新）、build client bundle **204585 B**、vitest
**51 文件 / 948 测试全 PASS**；build 幂等（`lib/` 67 产物 sha256 前后全等）+ `cmp lib/client.js
src/client/index.js` 一致。**push 与 tag 依 lead 2026-11-15 (B) 指令 HOLD**：等「human-only 默认
形态」真机复拍（`NOT_RUN`，需补图清单见 VALIDATION Round 40）；layerfs 借鉴结论为**只读评估、
本轮零用户可见落地**（D-049），故 CHANGELOG 不写 layerfs 条目。详见文末
「2026-11-15 — v0.9.2 收尾发版（本地已提交，push/tag HOLD）」。)

Previous update: 2026-11-15 (**v0.9.2 准备中 — 未提交 / 未 bump / 未发布**; 基线 `main` = `4b92278`。
工作树 19 文件（`src/` 4、`test/` 3、`lib/` 12）+ 未跟踪 `test/progress-connector.spec.ts` 与 Round2
真机证据；内容 = B01/B02/B04 + 进度 Tab 脊椎/详情/连线；人话报告默认化由 agent-27 进行中，
`src/answer.ts`/`report.ts`/delivery/`gate` 调用点不在收尾组写面。`package.json` 仍 `0.9.1`，
`CHANGELOG.md` 未动（发版 HOLD，用户 2026-11-15 指令）。`npm run ci`：50 文件 / 934 测试，
**932 PASS / 2 FAIL**，两条失败在 `test/gate.spec.ts` 且基线 `4b92278` 独立 worktree 同样失败（预存）。
详见文末「2026-11-15 — v0.9.2 准备中」。)

Previous update: 2026-11-15 (**v0.9.1 released** — tag `v0.9.1` → `9103280` on `main`; Release
green, asset `dsh-grok-workflow-0.9.1.tgz`; CI `43665777667` + Release `43666035740` success.
Fixes the user-reported WebUI enable failure: pre-v0.9.0 patch `maxConcurrency: 8 /
maxRetries: 5` now clamps to `6 / 3` with bilingual warnings instead of failing the row.
`package.json`+`package-lock.json` = `0.9.0`; `CHANGELOG.md` carries bilingual `## [0.9.1] - 2026-11-15`.
Evidence: `test/config-limits-repair.spec.ts` (17); isolated profile `gwverify851` with the 8/5
patch activates; control `0` still refuses with user-identical frames.)

Earlier update: 2026-11-15 (**wave1+wave2 已落盘、未提交** — 基线 `ee5e013`，工作树 dirty；
`package.json` = `0.9.0`（V 组 bump，未提交）；本轮 = B01-B18 清点 + 进度 Tab + 真机验证 H1/H2。
版本号与提交由 V 组做，M 组只写记忆与 CHANGELOG 的 `[Unreleased]`。详见文末
「2026-11-15 — wave1+wave2 收尾」。下降级保留的上一条 11-08 记录仍有效，未被覆盖。)

Previous update: 2026-11-08 (**v0.7.0 released** — tag `v0.7.0` → `146dce7` on `main`; Release
`42474831253` green, asset `dsh-grok-workflow-0.7.0.tgz` 317,470 B. Round 37: merged `origin/main`
(PR #44) resolving the `src/run.ts` startup conflict by keeping main's deadline race **and** routing
both entry points through `teamWorkflowEngine`; 37 files / 660 tests PASS; `[Unreleased]` promoted to
`## [0.7.0] - 2026-11-08`; `package.json`+`package-lock.json` = `0.7.0`. Content of the release:
Round 36's B plan — `full` mode now opens with `【人话结论】` (completed/partial only), `showDiagnostics`
(default off) gates Model routes/Deadline/Route switches/overflows/Errors, `Uncertainties` stays
visible; and Round 35's fix — a saved role/model setting now actually reaches the run. Live `:3090`
still needs a restart to load any of it — user-reserved, `NOT_RUN`)

## Prompt intake harden — 2026-11-19（agent-5，未提交）

- **CONFIRMED**：用户贴进新会话的「自我迭代 /grok 团队任务」提示词**不是**因长度卡住。实测
  2 041 字符 / 3 697 字节（`session-042dfe19` seq 4）与 2 032 / 3 688 两次
  （`session-b7be2bd2` seq 2944/2953），占 32 000 目标预算 6.4%，无截断；三条都结算成
  `Usage: /grok [on|off]`，且无 `user/message` / `agent/pre-step` / run。
- **根因（CONFIRMED，源码级）**：`dsh-commands` `parseCommand` 把消息第一行当命令、其余作
  `rawInput`；存档提示词第一行就是 `/grok 团队任务：…`，于是正文成了参数，旧语法只回一行用法
  就返回 → 用户侧等于静默。
- **改动**：`src/intake.ts`（新，入口上限与双语拒绝的唯一生成处）、`src/command.ts`（非开关参数
  按形态分档，开关语义未动）、`src/gate.ts`（`refusalOf` + 迟到目标走 intake）、
  `docs/task-prompt-template.md`（新，默认模板 + 规则）、`test/intake.spec.ts`（新，14 条）、
  `test/command.spec.ts` +3、`test/objective-limit.spec.ts` +1。
- **验证**：`npm run ci` exit 0 = **66 文件 / 1195 测试 PASS**；红证据 8 failed（
  `docs/knowledge/evidence/prompt-intake-2026-11-19/red-full.log`）。
- **NOT_RUN**：真机 GUI 粘贴同一条提示词（并发写入者在同一工作树）；commit/push。

## Repository

- Local path: `/home/fish/projects_mine/dsh-grok-workflow`
- Branch: `main`
- Git history: initial commit `beb55c6`; planner/recursion update `7b78db9`; remote evidence updates follow on `main`
- Remote: `origin` = https://github.com/free6589/dsh-grok-workflow.git (main pushed)
- Target GitHub repository: `https://github.com/free6589/dsh-grok-workflow`
- Target repository: **CONFIRMED public and reachable** after creation on 2026-10-25; it was confirmed absent immediately before creation.
- GitHub CLI: **CONFIRMED authenticated** as `free6589` with `repo` scope.

## Reference environments

- DSH checkout: `/home/fish/projects_mine/deepseek-harness` at `687f282e8625c6b8d11ff58211a90524be2e4317` (release `0.2.1-rc.2`).
- Installed DSH: `/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@deepseek-ai/dsh` version `0.2.1-rc.2`.
- Grok Build checkout: `/home/fish/dsh-tasks/grok-build` at `2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8`.

## Current phase

Last updated 2026-11-07 v0.6.0 released（`origin/main` = `1f9065d`，PR #43；tag `v0.6.0` 同 sha；见 VALIDATION Round 26 隔离验证）。

`0.6.0` **released**. Base of this state: **`origin/main` = `1f9065d`** (Merge PR #43,
release `0.6.0`; tag `v0.6.0` points at the same sha).

`v0.6.0` **is released** (tag `v0.6.0` → `1f9065d`, `git ls-remote --tags origin` CONFIRMED;
GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.6.0`
published **2026-11-07T10:09:17Z**, asset `dsh-grok-workflow-0.6.0.tgz` **299,146 B**,
Release workflow run `42362674837` green). `package.json` + `package-lock.json` both
read `0.6.0`; `CHANGELOG.md` carries bilingual `## [0.6.0] - 2026-11-07` (B-group empty-cap
heads-up + single-run scope + C1 cross-run hint; C2 ruled out per A16). Minor rationale:
C1 is backward-compatible (hint only reorders untried routes; solitary runs byte-identical),
so minor per RELEASING.md.

`v0.5.1` **is released** (tag `v0.5.1` → `5cc66be`, `git ls-remote --tags origin` CONFIRMED;
far-end sha matches `origin/main`; GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.5.1`
published **2026-11-07T02:08:32Z**, asset `dsh-grok-workflow-0.5.1.tgz` **294,363 B**).
`v0.5.0` **is released** (tag `v0.5.0` → `af82a34`). `package.json` + `package-lock.json` both
read `0.5.1`; `CHANGELOG.md` carries bilingual `## [0.5.1] - 2026-11-07` (PR #41 / `45d721a`:
quick-worker receives bounded conversation/carry-over context).

Authoritative numbers for this state (measured, not planned):

- `npm run ci` on `release/0.6.0` HEAD `ca040e4` (release-prep commit): **PASS** —
  typecheck 0 errors, lint **4 warnings / 0 errors** (3 pre-existing + 1 new unused `RoleName` import in `src/run.ts:29`, not fixed in this release), vitest
  **35 files / 624 tests PASS**; `git diff --exit-code -- lib/` = exit 0; build client bundle 84123 B; `npm pack --dry-run` 64 files / 299.1 kB. CI on PR #43 (run `42362505851`) Node 22 + 24 both pass.
- Round 26 (2026-11-07) is the **v0.6.0 isolated verification** (`CONFIRMED`): fresh profile `v060r`, models `wb/cn:deepseek-v4-pro` + `agnes-3.0-flash` (v4.1-flash was in per-model cooldown that day, stated not hidden); one gated team round with 2 tasks + 2-route worker chain (cap 1 each) → `Grok workflow: COMPLETED`, 2 verified, report carries `Route overflows (full lane yielded, not failures):` with `skipped full …` and both worker routes in `Model routes:`. Cross-run `(cross-run hint)` kind stays unit-covered (`test/route-concurrency.spec.ts`), no second concurrent live run staged. Evidence: `docs/knowledge/evidence/v060-route-cap/` (README + report-full + session-events 52 events).
- `v0.5.1` live check (Round 23, `CONFIRMED`): isolated profile `v051f`, model
  `wb/cn:deepseek-v4.1-flash`; session A follow-up answered `391` from the bounded context
  block without restatement; session B team round PASS then resume BLOCKED by the
  orphan-receipt defect (F3, same orphan class as Round 24). Evidence:
  `docs/knowledge/evidence/v051-fast-context/` (13 files).
- Round 24 (2026-11-07) is a **read-only diagnosis, no code change** (`CONFIRMED`):
  instant receipt written outside any step breaks `tokenMeter.measure()` from seq 2339 on,
  so auto-compaction never fires again after turn 4 while the GUI percentage keeps climbing
  92–95%. Full report `docs/knowledge/evidence/diag-ctx-compaction-2026-11-07.md` +
  replay script `docs/knowledge/evidence/diag-ctx-compaction-verify-metric.mjs`;
  `/compact` live test `NOT_RUN` (would mutate the session); Web GUI API fetch `BLOCKED`
  (endpoint 401, no credential read per policy). Fix left to user decision.
- Operator `web` profile on `:3090` runs released `dsh-grok-workflow@0.6.0` (read-only check
  2026-11-08: installed 2026-11-07 21:54, `lib/team-engine.js` absent → **without** the
  fix_child_names build; corrects the earlier `0.2.7` note). Any deployment of the fix build
  plus profile reload awaits explicit user approval (D-013), not done.
  Round 33 (2026-11-08) sharpens this: the fix build is absent from the whole live home
  (`find /home/fish/dsh-layerfs -name team-engine.js` → 0), the live GUI is 401-guarded on
  loopback too (no loopback bypass), and the durable panel data of the current orchestrator
  run shows generic `任务团队 child 15–28` labels for all 14 newest children — including
  attempt 5's own executor child (28). Round 34 (attempt 6/6 final, 2026-11-08) re-extracted
  the 8 newest children: labels `任务团队 child 25–32`, zero descriptive; attempt 6's own
  children (identified via the task marker in their logs) are among them. `origin/main` has
  since advanced to `3b1d9a8` (Merge PR #44, a different task's P1 fix) and still does not
  contain `ad66118`, so `pnpm update` on the live profile still will not fetch the fix.

Prior releases (unchanged): `v0.4.0` → `708c315` (PR #38, Round 20: 32 files / 545 tests);
`v0.3.0` → `3f5ad0a`; `v0.2.7` → `16a11b7`. `0.4.0`-era detail below is history, not the
current baseline.

History (unchanged detail, kept for reference): `v0.4.0` was released (tag `v0.4.0` on `708c315`, Release workflow run
[42075318386](https://github.com/free6589/dsh-grok-workflow/actions/runs/42075318386) green,
GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.4.0`, asset
`dsh-grok-workflow-0.4.0.tgz` 250,693 B, sha256 `e10802ca…`). At that time `package.json` read `0.4.0` and `CHANGELOG.md` carried
`## [0.4.0] - 2026-11-06` (Round 20). Prior: `v0.3.0` **is released** (tag `v0.3.0` on `3f5ad0a`, Release green
[41665410667](https://github.com/free6589/dsh-grok-workflow/actions/runs/41665410667), asset
`dsh-grok-workflow-0.3.0.tgz` 246,493 B). Earlier: `v0.2.7` **is released** (tag `v0.2.7` on `16a11b7`,
GitHub Release `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.2.7`, asset
`dsh-grok-workflow-0.2.7.tgz`), after `v0.2.6` (`f6ec5f1`), `v0.2.5` (`bf853ac`),
`v0.2.4` (`7357e5e`), `v0.2.3` (`538d1ab`). Operator `web` profile on
`/home/fish/dsh-layerfs` runs `dsh-grok-workflow@0.2.7` (upgraded 2026-11-03
from `0.2.6` via tag-pinned `add`; `CONFIRMED` in `plugin list`/`why`).

Merged into `main` since `v0.2.3` (each `CONFIRMED` in `git log`):

| PR | Merge commit | What it landed |
| --- | --- | --- |
| #25 | `54083ea` | the 32,000-character objective limit |
| #24 | `334daf6` | task-grouped progress panel (per-task groups, locale-following copy) |
| #23 | `2e9c26a` | Phase 1 dialogue reliability (P0) |
| #26 | `a000983` | segmented planner-failure fallback (`src/shards.ts`); review close-out is Round 13 |
| #27 | `6806426` | `/grok` session switch (mode/command/gate, D-028/D-029) |
| #28 | `7357e5e` | release `0.2.4` (prepare: opt-in `/grok` switch, Phase 1, sharded fallback, task panel, 32000 limit, GUI notes; Round 15 memory) |
| #29 | `bf853ac` | novice settings page + relaxed limits (v6: `grokDefault` off, 50-route chains, single-locale UI) |
| #30 | `e6d434d` | settings visual polish R1–R3 (hierarchy, rhythm, details; live screenshots) |
| P0-5 | `d8cc6cc` | first user message published before the run (no longer hidden) |
| #32 | `1b5ad75` | per-route concurrency cap (`maxInFlight`) + overflow to next route (D-030) |
| #33 | `16a11b7` | release `0.2.7` (per-route concurrency + first-message fix) |
| #35 | `af0394a` | synthesis/synthesizer mismatch warns + repairs instead of deactivating (D-031; closes #34) |
| #36 | `3f5ad0a` | release `0.3.0` (bump + bilingual changelog + `RELEASE-NOTES-0.3.0.md`; Round 19) |
| #37 | `9438b3d` | history-aware follow-up + hybrid classifier + instant receipt/summary (D-032/D-033/D-034; Round 20) |
| #38 | `708c315` | release `0.4.0` (bump + bilingual changelog + `RELEASE-NOTES-0.4.0.md`; Round 20) |

So the `0.2.4` cut carries the `/grok` switch, the task-grouped progress panel, the
32,000-character objective limit and the segmented fallback — all four are on `main` and tagged.

Authoritative numbers for this state (measured, not planned):

- `npm test` on the `0.4.0` release commit `472d043` (identical tree to the merge `708c315`):
  **32 files / 545 tests PASS**, exit 0 (Round 20); the Release workflow re-ran the same suite on
  `v0.4.0` and passed (run `42075318386`, step `Test` success). `npm run ci` on `472d043` = PASS
  (typecheck clean, lint 3 warnings / 0 errors pre-existing baseline, build clean, `lib/` in sync).
- `npm run ci` — last full run before this release was `npm run ci` on `472d043` (Round 20):
  32 files / 545 tests PASS, exit 0; quoted `main` number is the CI-script figure, not `npm test` alone.
- `lib/` reproducible: `npm run build && git diff --exit-code -- lib/` = exit 0 on `472d043`
  (Round 20, client bundle 81,835 B).
- Real-instance evidence, newest first: `VALIDATION.md` Round 16 (v0.2.4 install matrix on
  `7357e5e`: 8 PASS + 2 NOT_RUN, item 7 anomaly on record, item 8 partial), Round 15 (real Web
  GUI on `6806426`: `/grok` switch + settings card, isolated instance), Round 14 (real-model E2E,
  two bugs + fixes), Round 13 (PR #26 close-out); `docs/knowledge/evidence/t42`…`t49` cover the
  0.2.2 era. `src`/`lib`/`test` are identical between `6806426` and `7357e5e` (`git diff --stat
  6806426 7357e5e -- src lib test` is empty), so Round 15's GUI result carries over to `v0.2.4`.
- **Quality claims are bounded by measurement**: Round 8's 1 `COMPLETED` in 12 reports was the
  verifier-decision defect (fixed in 0.2.2), and Round 15's GUI round plus Round 16's matrix ran
  `glm-5.3-flash`, not `deepseek-v4.1-flash`. None of these results may be generalised into "the
  workflow accepts what it did not accept", nor into a per-model quality claim.

## Where the open questions live

- `docs/knowledge/VALIDATION.md` — Rounds 1–20. Round 6 row (g) is annotated: stability 5/5,
  accepted results 0/5, root cause fixed in 0.2.2. Round 7 closed the notice/route/deadline
  questions; Round 8 answers the quality question and records the operational caveat that the
  Plugins-page switch — not `cordis.patch.yml` — is what says whether the gate is armed. Round 13
  closed the PR #26 review, Round 14 the real-model E2E, and **Round 15 the two GUI checks that had
  been `NOT_RUN` since Round 14** (`/grok` switchable in the real GUI, settings card rendering and
  saving). Round 17 is the P0-5 first-message root cause, Round 18 the synthesis-mismatch fix,
  Round 19 records the PR #35 merge plus the `0.3.0` release checks and workflow run, and
  Round 20 records the PR #37 feature (`follow-up`/`hybrid`/receipt/summary) plus the `0.4.0`
  release checks, workflow run and isolated-profile live verification.
- `docs/knowledge/DECISIONS.md` — D-016…D-019 (per-session caps, 60-minute default, plugin-owned
  deadline, notice downgrade). D-020 covers the verifier-decision rule.
- Deferred to 0.2.3: rendering a plugin-authored chat row (needs a DSH-side API), see D-019.

## What `0.2.0` changed (short form)

| Area | State |
|---|---|
| Mandatory entry (gate on `agent/pre-step`) | implemented and the default (`enforceGate: true`); one-shot delivery measured (E-38/E-41); **long-lived GUI half measured in Round 15 for `in-turn`** (real Web GUI, gate claims the message, report rendered in the same turn) — `relay`/`append` in a long-lived GUI remain NOT_RUN (NR-1) |
| Per-role model routing + ordered chains | implemented (L1 in the generated script, U-2); real-provider switching NOT_RUN (NR-6) |
| Failure taxonomy (class + category) | implemented, rendered in the answer; real provider texts NOT_RUN (NR-5) |
| Settings surface (live values, validation) | implemented; the generated page is identified by the runtime; **a live GUI edit is measured — t32 for the 21-key page, and Round 15 re-measured it on `6806426`** (card renders, `grokDefault` `off`→`on`, revision 0→1, survives reload, applies to a new session) — NR-7/NR-8 |
| Write-path isolation (U-4) | implemented (`src/paths.ts` + `mapLimitIsolated`); planner fill-rate NOT_RUN (NR-9) |
| Reliability and safety set | implemented (cancellation, deadline, concurrency, duplicates, recursion, context bounds, redaction, partial, unload/reload) |

## Completed

- External bundle (`src/`, `cordis.patch.yml`, `package.json`), `lib/` output,
  composed by a real DSH Loader.
- Bounded plan → parallel execute → independent verify → bounded retry →
  synthesis, with report validation, cancellation/deadline handling, active-run
  caps, credential redaction and a routing/delivery ledger.
- The gate: `agent/pre-step` interception, `in-turn`/`relay`/`append` delivery,
  per-message de-duplication, queue bounds, explicit refusal, live configuration.
- Configuration surface: 26 keys (+`showProgress` since t44, +`maxActiveRunsTotal` since t45,
  +`mode`, `triageAsk`, `triageModel` since t52),
  unknown-key rejection, `configVersion` gate,
  route shorthand migration, chain validation against the live runtime.
- Documentation set kept in step with the code: DESIGN (DD-1..DD-9b, A/E/R/NR
  ledgers), ROADMAP (phases, U ledger, D-009 decisions), ARCHITECTURE, ACCEPTANCE,
  LOCAL-TESTING, RELEASING, VALIDATION, this STATE, HANDOFF, DECISIONS.
- `0.1.0` was published (tag `v0.1.0` → `a7d5a62`, Release run `40182751006`).

## Remaining / optional

- A clean-DSH-profile install check in CI (currently a local scripted smoke).
- **NR-1, NR-7 and NR-8 are no longer open GUI questions** — Round 15 measured all three on a real
  Web GUI against `6806426` (isolated instance `127.0.0.1:3199`, real Chromium), and Round 16's
  install matrix (against `7357e5e`, identical `src`/`lib`/`test`) leaves the GUI halves exactly
  where Round 15 put them: items 9–10 are `NOT_RUN` in the matrix **because** Round 15 already
  covered settings-page render and web-chat behaviour on the same code. What remains, and
  what must be stated with the result: the browser was **offscreen (headless) Chromium** because the
  host has no X11 display, and the model was **`wb/cn:glm-5.3-flash`** because the suggested
  `wb/cn:deepseek-v4.1-flash` answered `400 model_unavailable` (per-model cooldown) that day. So the
  GUI halves are verified for `in-turn` delivery and for the plugin settings card; **`relay` /
  `append` delivery in a long-lived GUI session is still NOT_RUN** (NR-1's remaining half), and no per-model quality claim
  follows from either round. Round 16's own boundaries: item 7's one direct-answer anomaly is on
  record (Rerun + run4 + run5 = 3 consecutive EXIT 0 + reports after it); item 8's web-profile
  check stopped at HTTP `401 unauthorized` on `settings`/`describe` (composition + boot
  `CONFIRMED`, API namespace not confirmed).
- L2 host-level routing (registering `agent/request-error` consumers) stays out
  of scope for `0.2.0` by decision U-2.
- Client-side chain editor (settings UI with model dropdowns) is Phase 9 / U-6.

## Blockers

None.

## Next priority

**`0.6.0` is released; nothing is blocked on review.** PR #43 was merged (`1f9065d`) and the
release went out as tag `v0.6.0` + GitHub Release (Round 26 isolated verification PASS).
The one open action is outside this repo: the live DSH service on `:3090` runs released
`dsh-grok-workflow@0.6.0` (2026-11-08 read-only check), which predates the fix_child_names build
(`ad66118` on `release/0.6.0`, unpublished); deploying that build awaits explicit user
approval (D-013); it is not done. Round 33 adds two deploy notes: the repo default branch is
`main` @ `1f9065d`, which lacks `ad66118`, so `pnpm update` of the live profile's
`github:` dependency will NOT fetch the fix — install the `ad66118` build explicitly
(HANDOFF); until then the live top panel keeps rendering generic `任务团队 child N` labels
for every new orchestrator run (durable descriptor data, Round 33).

B组+C1 已合入工作树、未发布（2026-11-07，route-cap-closer 收尾）：设置页 `warn.emptyCap`
黄字提醒不拦 Save + `validateRoutes` notes + 单 run 作用域（ARCHITECTURE），C1 `busyRoutes`
run 级估计重排未试顺序 + `skippedBusy '(cross-run hint)'` 标记 + 报告分开渲染，C2 按 A16 不做；
`npm run ci` 35 文件 / 624 测试 PASS（Round 25）；随本轮 commit 进 `origin release/0.5.1`，
未 bump 版本、未打 tag、未发布 npm、未重启 live。D-038 / VALIDATION.md Round 25 为准。

Older candidates — none decided, all `HYPOTHESIS` until the captain picks:
`relay`/`append` delivery in a long-lived GUI session (NR-1's remaining half), item 8's
API-side auth/namespace confirmation, a quality matrix (not a 1-run claim), and the
client-side chain editor (Phase 9 / U-6).

Any future live matrix must follow [docs/knowledge/TESTING.md](TESTING.md) (isolated workspace, one
turn at a time; Round 16's isolation proof is in `.workflow-artifacts/matrix-024/EVIDENCE.md`).
`v0.2.0` was released on 2026-10-26, `v0.2.1` on 2026-10-27, `v0.2.2` and `v0.2.3` on 2026-10-28.

## Homepage redesign — merged

- **Status:** PR #16 merged to `main` as `ea3e8e31`; GitHub Actions runs `40178081351`, `40178539805`, and `40178848058` PASS on Node 22 and Node 24.
- **Scope:** English quick-start landing page, complete Simplified Chinese README, matching SVG workflow illustrations, and `README.zh-CN.md` in package files.
- **Local follow-up:** Restored the compact reference sections required for configuration, disable/uninstall, testing, security, and exact compatibility, in both languages. Corrected the install order so a missing headless profile is created before `plugin add`; running `--from-default-profile` afterward would remove the installed plugin. Added local SVG XML and pack checks.
- **Validation:** SVG XML parsing PASS for both diagrams; current `npm pack --dry-run` lists 33 files and both READMEs. Detailed DSH runtime behavior is unchanged and covered by the existing 56-test suite.
- **Next action:** Keep `README.md` and `README.zh-CN.md` synchronized for future changes; do not remove the reference sections when editing the landing page.


## Release/versioning rollout — merged and released

- **Status:** PR #18 merged as `7904e23`; `v0.1.0` tag points to `a7d5a62`; GitHub Release published on 2026-10-25.
- **Release workflow:** first run `40182588171` failed on a JavaScript regex escaping bug in the changelog extractor; fixed in `a7d5a62`. The tag was recreated at the fixed commit before any Release existed. Run `40182751006` passed and created the Release.
- **Artifact:** `dsh-grok-workflow-0.1.0.tgz` (61,281 bytes) attached to the GitHub Release; URL `https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.1.0`. Tag-pinned install from `#v0.1.0` was smoke-tested in an isolated profile; config row present, real model call NOT_RUN.
- **Validation:** main CI `40182707932` PASS on Node 22/24; release workflow `40182751006` PASS on Node 22 only, including typecheck, lint, build, committed `lib/`, tests, package checks, and release creation.
- **Backup boundary:** Git history/Releases are version recovery, not independent disaster-recovery backup. Repository mirror and local DSH data backups remain a separate operational task.
- **Next action:** follow `docs/RELEASING.md` for future versions; do not move the published `v0.1.0` tag.

## Mandatory workflow, model routing, fallback — implemented

- **Status:** implemented and merged (phases 1–6); the design discussion below is
  history, not a plan.
- **Requirement:** every user message, including greetings and trivial
  questions, goes through the full workflow; the gate never silently falls back
  to ordinary direct answering (`enforceGate: true`, `gateRequired` for
  deployments that must fail instead of warn).
- **Capabilities delivered:** per-role model selection, ordered fallback chains
  per role, a switch policy (`switchOn`), failure classification with categories,
  a live settings surface, and write-path isolation for parallel tasks.
- **Persistent notes:** [WORKFLOW-DESIGN.md](WORKFLOW-DESIGN.md) (evidence ledger
  A/E/R + decisions DD + NOT_RUN ledger NR); decisions in
  [DECISIONS.md](DECISIONS.md) D-009/D-010/D-011.
- **Delivered after the first draft (2026-10-27, t32):** a plugin-owned settings page in
  the Web GUI — all 26 keys, per-role chain editing, validation, save applied to the next
  message. This closes NR-7 and NR-8 as *measured*; see
  [VALIDATION.md](VALIDATION.md) Round 3 and WORKFLOW-DESIGN.md DD-9c.
- **Activation (t33/t32, D-014):** installing the bundle puts the row into the composed
  graph, but the plugin only activates when a workflow provider is enabled — the web app
  ships `workflow-ptc` disabled. `docs/LOCAL-TESTING.md#enable` now carries the four
  checks that prove activation.
- **What is deliberately not delivered:** L2 host routing (U-2), model dropdowns in the
  chain editor (free-text provider/model fields today), and the long-lived GUI delivery
  measurement NR-1. 运维两条硬规则见 **D-013**（不重启在跑的 dsh 服务；队长只计划、实施交给子代理）。

## Overall roadmap — round 2 (phases 1–7), 2026-10-26

- **Roadmap:** [WORKFLOW-ROADMAP.md](WORKFLOW-ROADMAP.md) is the project-wide plan and phase order.
- **Design record:** [WORKFLOW-DESIGN.md](WORKFLOW-DESIGN.md) holds the confirmed
  requirements, the evidence ledger (A/E/R), the decisions (DD) and the NOT_RUN
  ledger (NR).
- **Decisions:** U-1..U-9 are answered in [DECISIONS.md](DECISIONS.md) **D-009**
  (user-approved 2026-10-26); the `0.2.0` breaking boundary is **D-011**; overnight
  execution and release discipline are **D-010**; the post-install strict-testing
  loop is **D-012**.
- **Version (t35, corrected in t37):** `0.2.1` — an **incremental** release on top of the published
  `0.2.0`; the changelog carries `## [0.2.0] - 2026-10-26` (unchanged history) and a separate
  `## [0.2.1] - 2026-10-27` section that only lists what is new. The evidence chain is stated as a
  **client-bundle invariant**, not as a tarball hash (a repack changes the tarball md5 whenever a
  shipped file such as `README`/`CHANGELOG` changes): `src/client/index.js` = `lib/client.js` =
  `package/lib/client.js` inside the tarball = the copy installed in the debug profile =
  **`68324a754a54ce36e6775618314592c5`** (`docs/knowledge/VALIDATION.md`, Round 3).
- **Known gap (t35):** the settings page validates the *shape* of a chain (bounds, missing model,
  duplicates, three-route limit), while *catalog membership* is enforced by the Host at load — a
  saved model the provider does not enumerate stops the row from activating and the boot line
  names it. A provider-aware model picker is not in 0.2.1.
- **Risk register (t35):** the settings page binds to whichever Loader row projects the plugin's
  fields, so a renamed row moves the page instead of losing it, and the console names the case
  when no row projects them (DD-9d). The entry point itself is the plugin manager's `plugins.item`
  slot — a Host-side contract, deliberately depended on and registered as a risk, not discovered
  later.
- **Release preparation:** the announcement for the current release lives in
  [docs/releases/RELEASE-NOTES-0.2.1.md](../releases/RELEASE-NOTES-0.2.1.md), and the text the
  release workflow publishes is the `## [0.2.1]` section of [CHANGELOG.md](../../CHANGELOG.md).
  The **published** `0.2.0` announcement is kept as
  [docs/releases/RELEASE-NOTES-0.2.0.md](../releases/RELEASE-NOTES-0.2.0.md) (tag `v0.2.0` on
  `f7a244c`, GitHub Release 2026-10-26T17:10:16Z, 42 files / 108,428 B).
- **Phase status:** 1 (environment/API audit), 2 (target design), 3–4 (role
  routing + ordered chains), 5 (configuration + settings surface), 6 (reliability
  and safety) and 7 (documentation, compatibility, release preparation) are
  implemented and `0.2.0` shipped on 2026-10-26; only the `0.2.1` tag and its GitHub Release
  remain, and they are created after the final acceptance pass.
- **Implementation boundary:** code changes go through the team's single-writer
  implementer with an independent review per batch; DSH core and global installs
  remain out of bounds.

## 2026-11-01 — PR #26 review close-out (`fix/fallback-shards`, work commit `68f3d15`, base `2e9c26a`)

- **Status:** the three codex P2 findings on the segmented planner-failure fallback are
  `CONFIRMED` and fixed (surrogate-adjusted segment count, JSON-escape aggregate false
  rejection, arbitrary-slice segments). Details and numbers: VALIDATION.md Round 13.
- **Shape:** `src/shards.ts` is now the only splitter — the generated script runs it, host
  validation re-derives the expected segments with it, and a fallback plan carrying anything
  else is rejected.
- **Verification (after rebasing onto `origin/main` `2e9c26a`):** `npm run ci` exit 0, **27 files /
  487 tests**; committed `lib/` matches a fresh build (`git diff --exit-code -- lib/` = 0). The
  rebase left `src/gate.ts`, `src/run.ts` and `src/triage.ts` (PR #23 P0 semantics) untouched.
- **Still open:** the generated script does not enforce `TASK_LIMITS.objectiveChars` itself; the
  host does (gate/tool/input). Not a regression, not fixed in this branch.

## 2026-11-02/03 — P0-5 首条消息不可见：根因 `CONFIRMED` + 修复（工作提交见 `git log`）

- **缺陷**：默认 `in-turn` 策略在 `agent/pre-step` 里 `await` 整个工作流之后才返回 `enter`，
  而 `AgentLoop.step()` 是被 claim 批次的唯一写入者 —— 运行期间会话里没有 `user/message`，
  GUI 只剩「正在分析请求 / 深度求索中」。真实会话 `session-d3d9375f-…`（qqbot，「机器猫人格」）
  的 transcript 51 条事件里 `user/message` = 0，`turnOutline.turns[0].prompt = ""`，
  `titleInput.count = 0`，首轮 1h41m 未关闭。
- **修复**：`src/gate.ts` `answerInTurn()` 在等待运行**之前**先 `commitClaimed()` 把原消息写进
  surface（同 id/source，保留 `rpcId`），并先取历史快照；运行结束后 `enter.messages` 只带报告
  （`withoutClaimed` 剔除已发布批次），`commitCancelled(..., alreadySurfaced)` 避免重复写。
- **验证**：新增回归测试（修复前 FAIL / 修复后 PASS，离线确定性）；`npm run ci` exit 0，
  **29 files / 522 tests**；`git diff --exit-code -- lib/` = 0；真机 Web GUI 前后对比截图见
  [VALIDATION.md](VALIDATION.md) Round 17 与 `docs/knowledge/evidence/first-message-visible/`。
- **契约变化（对后续 agent 重要）**：`in-turn` 的 `enter.messages` **不再**包含被 claim 的用户消息；
  P0-1 的准确表述改为"用户原话在会话 surface 里恰好一次"，写入者随策略不同而不同
  （`in-turn` 在等待前写、`relay`/`append` 在 reject 后写）。
- **未做**：`:3090` 实例未热加载（D-013）；`relay`/`append` 长驻 GUI 投递仍 `NOT_RUN`。

## 2026-11-03 — route-concurrency 每路由并发上限（`feat/route-concurrency`，未合并）

- **分支**：worktree `.worktrees/route-concurrency`，分支 `feat/route-concurrency`，基线
  `origin/main` `d8cc6cc`（v0.2.6 之后）。
- **设计（D-030）**：`ModelRoute.maxInFlight?`（1–64，留空=不限）；
  `HARD_LIMITS.routeInFlight={min:1,max:64}` 单一来源；打满=溢出到下一条未试路由，
  全满才排队等腾位（`queuedMs`）；溢出不算失败，不推进备用链、不耗重试、不动 `switchOn`；
  证据 `skippedBusy`/`queuedMs` 进 trail（`Route overflows …` 单独渲染）与台账。
- **验证**：`npm run ci` 全绿（待本轮最终跑）；回归 `test/route-concurrency.spec.ts`
  7 例（校验/溢出分流/排队峰值/预算不变/渲染与台账透传），`test/client.spec.ts`
  bounds parity + `error.badCap` 双语，`test/config.spec.ts` script clamp 钉；
  `git diff --exit-code -- lib/` 必须为 0（`src` 改必重建 `lib/`）。
- **交付**：push 到 `origin feat/route-concurrency`，开 PR `base:main`
  标题 `feat(routing): per-route concurrency with overflow to next route`。

## 2026-11-06 — 跨轮上下文延续：有界 digest 注入每一轮子代理（v0.5 未发布，工作树内）

- **状态**：实现 + 确定性测试完成（`npm test` **33 文件 / 568 测试 PASS**，`npm run lint`
  0 error / 3 个既有 warning），真机两轮实测 PASS（VALIDATION.md Round 21）。**未提交、未发布**。
- **做了什么**：新增 `src/carryover.ts`（从会话里插件自己写的报告编译轮次 → 有界结构化 digest，
  脱敏、双向预算、超限保留最新轮并写明丢弃数、无前序信息时返回空）；`src/script.ts`
  在 planner/worker/verifier/synthesizer 四个提示词里注入 `args.carryover` 并自带
  `CARRYOVER_MAX_CHARS` 夹取；`src/run.ts`/`src/gate.ts`（仅 `runTeam`）/`src/index.ts`（工具路径）
  各加一层注入。首轮不带该键，payload 与此前逐字节一致（`test/carryover.spec.ts` 钉住）。
- **测试**：`test/carryover.spec.ts` 21 例（解析/脱敏/降级/上限 6 档/轮数上限/代理对切割/
  真实脚本第 1 轮→第 2 轮提示词含研究结果/首轮不变/脚本 clamp/请求 payload）；
  `test/gate.spec.ts` 新增 2 例（真 Session + 真网关：第 2 轮 `args.carryover` 含第 1 轮证据、
  而 `args.objective` 不含；首轮无该键）。
- **真机**：隔离 home（`.carryover-e2e/home`，用后即删）+ 隔离工作区 `.carryover-e2e/work`，
  `headless` 模板 profile，模型 `wb/cn:deepseek-v4.1-flash`；第 1 轮 391 已验证，第 2 轮
  "再加 9" 直接答 `391 + 9 = 400`，未要求用户重述；3 个第 2 轮子代理日志出现 `PRIOR ROUNDS`，
  第 1 轮子代理 0 次（`docs/knowledge/evidence/carryover-e2e/`）。
- **新发现（未修，`CONFIRMED`）**：会话首条消息被 `in-turn` 在 `pre-step` 抢先写成
  `user/message` 后，`--session-id` 恢复报
  `SessionFormatError: system/message requires a protected first surface head`（F1）。
  与本次改动无关（P0-5 语义），已记入 VALIDATION Round 21 与 D-035。
- **未做**：`:3090` 未热加载（D-013）；未 bump 版本、未 tag、未发 npm；`relay`/`append` 长驻 GUI
  投递仍 `NOT_RUN`（NR-1 剩余半边）。

## 2026-11-06 — 增量记忆归档：轮次结算即写入、单次会话可读回（v0.5 未发布，工作树内）

- **状态**：实现 + 确定性测试完成（`npm test` **34 文件 / 589 测试 PASS**，`npm run lint`
  0 error / 3 个既有 warning），真机「团队档真跑 + 另一会话读回」实测 PASS（VALIDATION.md Round 22）。
  **未提交、未发布**。
- **做了什么**：新增 `src/memory/archive.ts`（只追加 JSONL 存储：`$DSH_HOME/memory/grok-workflow/
  archive.jsonl`，`GROK_WORKFLOW_MEMORY_DIR` 可改；`ARCHIVE_LIMITS` 全部有界；`appendArchiveEntry()`
  返回 `{written,id,reason}` 永不抛；`readArchive()` 新到旧 + 按 id 去重 + 4 MiB 尾部扫描），
  `src/memory/recorder.ts`（引擎事件 → `run:<runId>:agent:<seq>` 与 `run:<runId>` 条目；
  `agent-start` 捕获子会话、结算时读其 `ownEvents()`；子代理发现优先取结构化提交，退而取散文；
  `archiveRoundNow()` 给前台档用），`src/memory/cli.ts`（`node lib/memory/cli.js recent|path`，
  零依赖读回，不需要 DSH/插件在线）。`src/run.ts` 两处接线：引擎事件订阅与 `finally` 里的轮次
  结算（都**不**受 `showProgress` 控制），以及 `runSingleCall` 成功路径的前台档归档。
- **测试**：`test/memory-archive.spec.ts` 21 例——写入时刻（真引擎 harness 中途读只见 agent 条目
  且 `runSettled === false`，结束后出现 round 条目）、独立进程读回（`node --input-type=module -e`
  + 随包 CLI）、幂等/只追加（旧字节逐字节保留）、脱敏、写入失败不拖垮运行、子代理发现三形态
  （`plan: N task(s)` / 申报结果 / `verdict pass · N criteria`）、`agent-start` 捕获语义、
  会话服务不可达时的降级。
- **真机**：隔离 home `.workflow-artifacts/incr-archive-e2e/home`（`headless` 模板 + patch
  `grokDefault: "on"`）+ 隔离工作区 `…/work`，模型 `wb/cn:deepseek-v4.1-flash`；一轮两步骤任务
  结算后归档 4 条（3 agent + 1 round），随后**新起一个会话**跑 CLI 直接读到该轮条目与
  `verdict pass · 8 criterion/criteria checked`（`docs/knowledge/evidence/incremental-archive/`）。
- **新发现（`CONFIRMED`，见 RESEARCH A15）**：①`ctx.sessions` 在插件 fiber 上抛
  `cannot get property "sessions" without inject`，须用 `ctx.get('sessions')`；②引擎在
  `agent-end` 送达宿主前就 dispose 子会话，必须在 `agent-start` 捕获；③结构化子代理不产出
  assistant 文本，结论在 `tool-call.arguments`（JSON 字符串）；④`grokDefault` 默认 `off`，
  闸门没开时根本没有轮次可归档。
- **未做**：`:3090` 未热加载（D-013）；未 bump 版本、未 tag、未发 npm；两进程并发追加同一文件的
  压测 `NOT_RUN`；换引擎的子代理形状复测 `NOT_RUN`。

## 2026-11-06 — 先回捞后提问：ask 档提问前先读上文与磁盘记忆（v0.5 未发布，工作树内）

- **状态**：实现 + 确定性测试完成（`npm run ci` **35 文件 / 617 测试 PASS**，`Found 3 warnings and
  0 errors`，3 个均为既有 warning）；真机在线回放 `NOT_RUN`。**未提交、未发布**。
- **做了什么**：`src/triage.ts` 加 `recallFromPrior()`（双字/词锚点 ≥2，或指针式引用 + ≥120 字符实质
  材料）、`RECALL_LIMITS`、`TriageInput.prior`、`DETAIL.recalled`、`recallPrompt()`、`recalledNote()`、
  `missingNote()`，并把 4 处 ask 判定收敛成 `ambiguousVerdict()`（无 `prior` 时行为不变）；
  `src/gate.ts` 加 `memoryDocRoots()` / `readMemoryDocs()` / `collectRecallSources()` 并在
  `produceAnswer()` 的 ask 档前接线：命中→快手档据材料作答（回答注明出处），未命中且查过→提问后追加
  「先查后问，还缺 X」，无来源→提问逐字节不变。
- **测试**：新增 `test/triage-recall.spec.ts` 28 例（命中/未命中/指针式/确定性/摘录上限/脱敏/默认根目录
  与环境变量/ask 与 chat 逐字节回归/`session-7e079b80` 形态的回放成对用例/`readMemoryDocs` 降级）。
  全量套件从 34 文件 589 测试 → **35 文件 617 测试**，既有 triage/gate/followup 89 例全绿。
- **现场发现（`CONFIRMED`，已修）**：`relay` 在 `produceAnswer()` 之前就 `commitClaimed()`，首版召回把
  本轮消息读成"历史"→ 自命中；`collectRecallSources(…, exclude)` 修复。
- **决策**：D-037。**证据**：`docs/knowledge/evidence/history-first/`。
- **未做**：真机在线模型两轮回放、`:3090` 热加载（D-013）、版本号与发布。

## 2026-11-07 — 子代理顶栏显示名：诊断完成（当时判定 BLOCKED；**2026-11-08 已被第四次执行推翻并落地**，见下一节）

- **状态**：只读源码取证诊断，**无插件源码改动、无 DSH core 改动、未起隔离 profile、未碰 live `:3090`**。
  用户目标（顶栏每个子代理显示具体任务名、不出现 `任务团队 child N` / 提示词原文）在当前约束下不可达。
- **根因（`CONFIRMED`，行号即证据）**：插件已经传了标签
  （`src/script.ts:1188/1213/1324/1438` → `规划助手`/`执行`/`检查`/`汇总助手`），DSH 自己的工具文档也把
  `label` 写作 "(display)"（`dsh-tool-workflow/lib/index.js:143`）；但引擎运行时
  `packages/workflow/workflow-ptc/src/runtime.ts:183-188` 不把 `label` 转给 `startAgent`，
  宿主 `host.ts:200-205` 直接写死 `` `${this.meta.name} child ${callId}` ``，
  该值落成子会话首个 `subagent/descriptor`（`dsh-subagent/lib/index.js:1404,1800`）并被
  `foldSubagentDescriptor` 锁成不可改写（同文件 `:686-698`），GUI 顶栏主标签直接取它
  （`dsh-client-ui-subagent/lib/client.js:201`）。
- **否决的绕行**：追加描述符 / 自定义 `SubagentProvider` / 改 `meta.name` / 插件自建 `startActivation` / 改 core，
  逐条理由见 `DECISIONS.md` D-039 与 `VALIDATION.md` Round 27。
- **上游 ask（`NOT_RUN`）**：`runtime.ts` 转发 `opts.label` + `host.ts` 的 `childRequest()/startChild()`
  接 `label`（约 3 行），改完插件零改动即生效。
- **未做**：`CHANGELOG.md` 不加条目（无用户可见变更）；live `:3090` 版本查询 `NOT_RUN`
  （`GET /` → `401`，本会话无凭据）；真机 GUI 复验 `NOT_RUN`。
- **并发注意**：开工时工作树已有**另一任务**的改动（`src/client/index.js`、`lib/client.js`、
  `test/client.spec.ts`、未跟踪 `test/panel-links.spec.ts`），本轮未触碰、未提交。
- **第二次尝试补充（2026-11-07 晚，Round 28，`CONFIRMED`）**：结论**维持 BLOCKED**。上一轮的两项 `NOT_RUN`
  升级——①源码链逐条**独立重验**（本轮自己读的行号见 `VALIDATION.md` Round 28 表）；
  ②**隔离 profile 真机复现成功**：`out/childname-verify/`（profile `cnamer`，headless，模型
  v4-pro + agnes-3.0-flash，密钥仅布尔存在检查）跑一轮团队档 COMPLETED（2 任务 verified，6 个子代理），
  父会话 `tool-workflow/agent-start` 证明插件标签（`规划助手`/`执行`/`检查`）确实在传，
  而 6 个子会话首个 `subagent/descriptor` **全部**是 `"label":"任务团队 child N"`（N=1..6）——
  与用户截图逐字一致。证据：`docs/knowledge/evidence/childname-blocked/`。上游 ask 内容不变。
- **第三次执行补充（2026-11-08，Round 29，`CONFIRMED`）**：结论**维持 BLOCKED**。Round 27/28 链路第三次独立
  重验逐条一致；并新增**类型级证据**关闭末两个扩展点候选（每 run `subagentProvider` 覆盖 +
  `ctx.subagents.registerProvider`：continuable 子代理的 provider 参与只有 `ContinuableCreateSpec { seed? }`、
  无 label 字段；`WorkflowStartRequest` 全接口无 label；引擎 Config 无 label 模板；仅
  `PtcWorkflowEngine` 一个引擎实现）。core 检出 HEAD `687f282e` 与 installed 同为 `0.2.1-rc.2`，上游 ask
  仍必要。插件源码零改动。证据：`docs/knowledge/evidence/childname-blocked/extension-points-closure.md`；
  详见 `VALIDATION.md` Round 29 与 `DECISIONS.md` D-039 Addendum 2。

## 2026-11-08 — 子代理顶栏显示名：插件侧 twin 引擎落地，真机 PASS（fix_child_names 第四次执行，`CONFIRMED`）

- **状态**：实现 + 确定性测试 + 真机验证完成。`npm run ci` **37 文件 / 650 测试 PASS**
  （typecheck 0 错；lint 4 warning / 0 error，与 HEAD 基线一致）；隔离 profile `cfix`
  真机 PASS（Round 31）。**未提交（随本轮 commit）、未 bump 版本、未打 tag、未发布、
  live `:3090` 未动（仍 `0.2.7`，D-013）；DSH core 检出全程 clean（`687f282e`）**。
- **做了什么**：①`src/team-engine.ts`（新增）——用注入引擎**自己的构造函数**建私有 twin
  （static-inject 判别、WeakMap 按 ctx 缓存、`reflect.provide` 置空、引擎 config 镜像），
  twin 的 subagents 视图在 `startActivation` 处把 `spec.label` 重写为提示词首行
  （48 码点截断）；构造失败/非 PTC 引擎原样回退并 `logger.warn` 一次性。
  ②`src/script.ts`/`src/triage.ts`/`src/gate.ts`——每个子代理提示词**首行**改为描述性标题
  （`规划助手`/`<任务标题>`/`检查 · <任务标题>`/`汇总助手`/`快速应答`/`前台直答`/`前台任务`/`任务分类`），
  人设行保持第二行。③`src/run.ts`——两处 `ctx.workflowEngine.start` 改走
  `teamWorkflowEngine(ctx, logger)`。测试 `test/team-engine.spec.ts` 12 例 +
  `test/engine-harness.ts` 一处 additive 捕获。
- **关键机制（RESEARCH.md A18 / DECISIONS.md D-041）**：`PtcWorkflowEngine.start()` 在 start
  时读 `runCtx.subagents`，故插件可在交 run 前替换 subagents 视图——`startActivation` 的
  调用方变成插件，label 归调用方的契约站在插件这边。真机两次失败定位了 cordis 硬事实：
  代理 cordis ctx 会破坏 receiver 键控的服务解析；服务属性访问受 isolate guard，
  显式 `ctx.get(name)` 不受——twin 的服务从引擎自身 ctx 经 `ctx.get` 解析。
- **真机验证（Round 31）**：终验团队档 COMPLETED，6 个子会话首个 `subagent/descriptor`
  全部为描述性标签（规划助手 / 任务标题 / 检查 · 任务标题，含一条真实 agnes route-switch 重试），
  **0 处 `任务团队 child N`**；修复前同 patch 对照 3/3 为旧标签。GUI 主名判定 =
  `client.js:201` 源码链 + 描述符事件；浏览器点开 live `:3090` 验证 NOT_RUN（401，D-013）。
  证据：`docs/knowledge/evidence/childname-fix-2026-11-08/`。
- **未做**：live `:3090` 的浏览器复验（实例仍是旧插件 0.2.7，需重新部署后人工确认）；
  上游 3 行 ask 从"必要"降级为"可选简化"，未执行。
- **CHANGELOG**：`[Unreleased]` Fixed 增加英中双语条目"Task-team children are named after
  their work / 任务团队子代理按其工作命名"。
- **并发注意**：本节与 Round 30 的 fix_completed_links（D-040，已入库 `60cde95`）不冲突；
  本轮触碰的文件与其零交集（除 `CHANGELOG.md`/记忆文件的追加）。

## 2026-11-08 — 子代理顶栏显示名：GUI 浏览器验证 PASS（fix_child_names 验证轮，零源码改动，`CONFIRMED`）

- **状态**：Round 31 修复的浏览器观察轮完成（Round 32）。工作树基点 `ad66118`（`release/0.6.0`，
  与 origin 同步）；基线 `npm run ci` **37 文件 / 650 测试 PASS**；本轮零源码改动。
- **做了什么**：隔离 home `out/gui-verify/home/`（web 模板 profile `guiweb`，插件 dev 安装自
  工作树构建）起 Web 实例 `127.0.0.1:3199`（一次性 token 只走环境变量、不落盘、用后即杀），
  headless Chromium 两遍驱动：①真实 composer 键入团队档双计算任务 → `Grok workflow: COMPLETED`
  （6 子代理，含真实 agnes format-error 路由切换重试）；②展开库存 `Session hierarchy` 顶栏面板 →
  **6 个子代理主标签全部描述性**（`规划助手`/`计算并验算 919 + 27`/`检查 · 计算并验算 919 × 3` 等），
  **0 处 `任务团队 child N`**、0 处提示词原文作主标签；持久 `subagent/descriptor` 与面板逐字一致。
  证据：`evidence/childname-fix-2026-11-08/gui/`（README + 4 截图 + 3 JSON + 描述符摘录）。
- **记忆更正（只读核实）**：live web profile 的插件 = **released 0.6.0**（2026-11-07 21:54 安装，
  `lib/team-engine.js` 不存在 → 不含本修复；旧记"仍 0.2.7"过时，本文件与 VALIDATION 已更正）。
- **验收条款状态**：条款 1/2/3/5/6 满足；条款 4 的「DSH installation 加载 + ≥3 子代理工作流 +
  GUI 顶栏显示描述性名」三项在本机 `CONFIRMED`，唯一未达项 = 特指 live `:3090` 实例本身
  （仍跑不含修复的 released 0.6.0；部署需用户授权，D-013 步骤 5，本会话沙箱只可写工作树）。
- **未做**：live `:3090` 的修复部署与浏览器复验（用户授权动作）；上游 3 行 ask（可选，未执行）；
  无 CHANGELOG 变更（无新用户可见变更）。

## 2026-11-08 — 已完成子任务保持可点击：客户端重注册 workflow-run 节点（v0.6.0 工作树，未发布）

- **状态**：实现 + 确定性测试 + 真机验证完成（`npm run ci` **36 文件 / 638 测试 PASS**；
  隔离 profile `panelcheck` 真机 PASS，Round 30）。**未提交（随本轮 commit）、未 bump 版本、
  未打 tag、未发布、live `:3090` 未动（仍 `0.2.7`，D-013）**。
- **做了什么**：`src/client/index.js`（= `lib/client.js`）新增 `mountPanel`——经
  `conversation.chat.node` 键控槽位以 `key: 'workflow-run'`、`priority: -1` 重注册聊天任务
  列表渲染器；成员行可开性只看"子会话能否打开"（`panelMemberMode`），不看状态——运行中、
  已完成、失败、取消、中断全部是链接，点击即开子会话（`uiWorkspace.openSession`，可选注入）。
  测试 `test/panel-links.spec.ts` 14 例 + `test/client.spec.ts` 断言更新；
  `package.json` `test:unit` 收入新 spec。
- **硬约束（新发现，A17/D-040）**：键控槽位同键**同优先级**会让另一个注册者整条 boot fiber
  失败（首轮实测库存 `dsh-client-ui-workflow-run` "1 entry did not activate"、整页错误屏）；
  静态客户端路径无自动优先级分配，跨插件复用键控键**必须**显式 `priority: -1`。
- **真机验证（Round 30）**：隔离 home `.v070-home/`、web 模板 profile、headless Chromium；
  boot 干净后团队档真跑到 `completed`（6 子代理，含一条真实 agnes route-switch 的 failed 行），
  **6 行全部 `<button data-member-openable="true">`、0 行 inert**；点击已完成的 `规划助手` 行
  打开子会话视图（面包屑 `… / 任务团队 child 1`）。证据
  `docs/knowledge/evidence/panel-links-2026-11-08/`。
- **未做**：`relay`/`append` 形态的任务列表渲染（HYPOTHESIS 外推）、深色主题/移动端视觉
  （NOT_RUN）、CHANGELOG 之外的 README/ARCHITECTURE 更新（本轮认为无必要）。
- **并发注意**：工作树同时含 fix_child_names 任务的记忆条目（D-039/Round 27–29），本轮
  commit 一并入库（均为已完成的记录）；`src/` 其余文件本轮未触碰。

## 2026-11-13 — v0.8.0 已发布（PR #45 → 9c590f2；Tag v0.8.0 → 同 sha；Release 已建）

- **状态（`CONFIRMED`，lead 独立核验）**：`main = origin/main = 9c590f2`（ahead/behind 0/0）；
  `package.json` = `0.8.0`；Tag `v0.8.0` peel 到 `9c590f2`（本地与远端 `ls-remote` 一致）；
  PR #45 MERGED 2026-11-13T01:26:25Z（CI Node22+24 双绿）；Release published 2026-11-13T01:27:54Z
 （`dsh-grok-workflow-0.8.0.tgz`，Release workflow 绿）。Aggressive `git fsck` 悬空对象仅为历史
  dangling，无 WIP 丢失。
- **内容**：人话交付层（`src/delivery/` + `humanHead` 统一三态 + `showDiagnostics` 默认关）＋
  `synthesis: layered`（`SynthesisPolicy` 三值，报告 `mode` 仍两值，digest/guardrail/fallback 有界）＋
  checkpoint/resume（`src/checkpoint/` 原子写入校验 + `src/resume/` 校验恢复策略 + `src/run.ts` 接线，
  无用户可见面）。Watchdog 与 Evidence Collector 明确 `NOT_DONE`（工作树无实现，未伪装）。
- **安装验证**：隔离 profile `v080verify` 从 Tag 安装成功（`package.json` 0.8.0；headless 真跑
  `BLOCKED`——需模型调用，100s 无输出，不算通过）；`~/.dsh/profiles/web` 从 Tag 装到 0.8.0
 （`lib/delivery|checkpoint|resume` 齐，`config.js` 含 layered×10）。**`dsh-layerfs` 的 live
  `:3090`（pid 4003162，自 11-12 运行）未装、未重启**——`layerfs/profiles/web/node_modules/`
  下无此包、`pnpm-lock` 无记录；release-080 澄清其“live”仅指 `~/.dsh`，`layerfs` 生效记
  `UNVERIFIED`。重启仍是用户动作（D-013）。
- **测试诚实边界**：本版相关 12 spec / 198 PASS；全量 778 passed / 3 failed——`gate.spec` 2 失败在
  baseline `84e6894` 同样复现（预存/环境性），`human-output-contract` 全量时 1 flaky、单跑 9/9 过。
- **遗留**：工作树未跟踪（`.audit-scratch/`、`.tmp-largefiles/`、`RENDERING-STUDY.md`、
  `evidence/checkpoint-*`、`survey`）未入库；STATE/HANDOFF/VALIDATION 本轮未更新（写范围外）；
  `release/0.8.0` 分支未删；已发布 Tag 未动。

## 2026-11-15 — wave1+wave2 收尾（**未提交**）：B01-B18 清点 + 进度 Tab + 真机验证 H1/H2

- **From:** 收尾组 M · **To:** V 组（版本提交）/ lead · **可写面:** 六个 `docs/knowledge/*.md` +
  `CHANGELOG.md` 的 `[Unreleased]` 节 + `DESIGN-progress-tab.md` 追加收尾节；不碰
  `src/` `lib/` `test/` `package*.json` `README*` `cordis.patch.yml`，不 commit、不打 tag、不 push。
- **基线（`CONFIRMED`）**：`git status --short --branch` → `## main...origin/main`；`HEAD = ee5e013`
  （v0.8.0 发布记录 `docs(memory): v0.8.0 release record`）。工作树 **81 文件 / +7014 / −534**
  全部未提交：`src/` **13** 文件、`test/` **15** 文件、`lib/` **46** 个构建产物（+ 4 个新增
  `progress-tab.*`）、`docs/` 3 文件 + `README`/`README.zh-CN` + `CHANGELOG`（`git diff --name-only`
  逐区计数）。
  未跟踪新增：`src/progress-tab.ts`、`lib/progress-tab.js`（+ `.d.ts`/`.map`）、
  `test/progress-tab.spec.ts`、`test/delivery-human-block.spec.ts`、`docs/knowledge/DESIGN-progress-tab.md`、
  `docs/knowledge/evidence/{verify-H1,progress-tab-2026-11-15,checkpoint-engine-wire-2026-11-12,recovery-kill-restart-2026-11-12}/`。
- **版本（`CONFIRMED`）**：`package.json` 工作树已是 `0.9.0`（V 组的 bump，未提交）。本轮 M 组
  **不 bump**，只往 `[Unreleased]` 写内容（1 条 Added + 10 条 Fixed，中英双语）；写完后 V 组把节头
  提升为 `## [0.9.0] - 2026-11-15`，条目原文未动。`## [0.8.0] - 2026-11-13` 及以下未触碰。
- **环境（`CONFIRMED`，见 `evidence/verify-H1/ci.txt`）**：host `omarchy`，`node v26.8.1`、
  `npm 11.19.0`、`dsh 0.2.2-rc.3`。

### B01-B18 状态清单

状态词只用 `CONFIRMED` / `HYPOTHESIS` / `NOT_RUN` / `BLOCKED`。`CONFIRMED` 的行都有源码锚点
（本轮 grep 复核过行号）或证据文件，**逐行核过源码注释**（`src` 内以 `B<n>` 标注的注释即是审计
锚点）—— 例外是 B11/B16/B17：这三条在源码里没有编号锚点，映射是推断，见本节末「B11/B16/B17
的边界」。

| 编号 | 锚点（文件:行号） | 一句话 | 状态 |
| --- | --- | --- | --- |
| B01 | `package.json:39`（`engines.dsh: ">=0.2.1-rc.2 <0.3.0"`；同时删掉旧 `dsh.compatibility` 块） | 引擎兼容声明改成真 semver 区间，旧的手写兼容表撤除 | **CONFIRMED** — `evidence/verify-H1/engines-dsh-B01.txt`：真机 runtime `0.2.2-rc.3` → 判定 `null`（无未满足要求）；对照 `engines.dsh:"<0.2.0"` → REFUSED，证明检查非空转 |
| B02 | `src/triage.ts:249,291-294,356` | 分诊信号扫描有界（`TRIAGE_LIMITS.signalChars`），32k 粘贴不再按秒计 | **CONFIRMED** — 锚点注释 + `test/triage.spec.ts:84` |
| B03 | `src/command.ts:68-127`（`toggleFailureText` + 读回校验） | `/grok` 的写入没落地时只报失败、绝不用成功措辞 | **CONFIRMED** — `test/command.spec.ts:100-150`（拒绝写入 / 接受但读不回 / 无 session 三形态 + 健康路径） |
| B04 | `src/gate.ts:745,945` | 前台第二个问题到来时，未作答的上一个请求不被丢掉 | **CONFIRMED** — `test/phase1-dialogue.spec.ts:510` |
| B05 | `src/triage.ts:115,142,735,990` | 「先回答再派新活」的一条消息不再把答复当任务目标 | **CONFIRMED** — `test/triage.spec.ts:550,645` |
| B06 | `src/gate.ts:1238`、`src/history.ts`（排除自写批次的 id）、`test/history.spec.ts:61` | `relay`/`append` 自己是写者时，紧随的历史读不能把刚写的消息重复喂回 | **CONFIRMED** — `test/gate.spec.ts:592`、`test/history.spec.ts:61-75` |
| B07 | `src/config.ts:22,35`（`maxConcurrency` 6 / `maxRetries` 3 / `maxAttemptsPerTask` 400）、`test/routing.spec.ts:73`、`test/route-concurrency.spec.ts:102` | 并发/重试硬上限回到 AGENTS.md 的文档契约（3/6、1/3），脚本侧传入的超限被夹紧 | **CONFIRMED** — 见下「maxAttemptsPerTask = 400 的推导」 |
| B08 | `src/gate.ts:769,935` | 确认后复述的请求裁到 objective 预算内，而不是拒绝整轮 | **CONFIRMED** — `test/phase1-dialogue.spec.ts:536` |
| B09 | `src/triage.ts:233,237,277,363` | 顿号/全角逗号写的三件事不再被当成「一件事」压成单个 quick worker | **CONFIRMED** — `test/triage.spec.ts:230,243` |
| B10 | `src/delivery/index.ts:88,137,182,209,335,362` | 人话块里的失败原因被台账关键词的裸子串扫描误删；改成锚定/整词，且 `incomplete[].reason`/`task.error` 不再逐字段洗 | **CONFIRMED** — `test/delivery-human-block.spec.ts:114,154`（含「守卫没被删掉」的反向断言） |
| B11 | `src/client/index.js:714`（状态色改 design token `var(--dsw-alias-state-business-primary, …)`） | 状态点不再写死浅色 hex，跟随主题 | **HYPOTHESIS**（内容 CONFIRMED：`docs/task-progress-panel.md` §Client-surface hardening 第 1 条 + 锚点；**编号→条目映射**未获审计清单确认，见本节末「B11/B16/B17 的边界」） |
| B12 | `src/checkpoint/wiring.ts:775,933` | 检查点的任务身份取自引擎 `meta.name` 且脱敏有界；`stages`/`agents` 永不为 `undefined` | **CONFIRMED** — `test/checkpoint-wiring.spec.ts:212,228,239` |
| B13 | `src/checkpoint/wiring.ts:315` | 陈旧判定用自有区间 1 s–24 h，不借用写间隔 | **CONFIRMED** — `test/checkpoint-wiring.spec.ts:539,556` |
| B14 | `src/checkpoint/wiring.ts:828` | 同一 run 文件单飞写入；两个清洗后同名的 id 分开存 | **CONFIRMED** — `test/checkpoint-wiring.spec.ts:255`、`test/checkpoint-schema.spec.ts:379` |
| B15 | `src/checkpoint/wiring.ts:517,907` | 缺省 limits 按契约默认值记录；放弃写入时只说一次且可见 | **CONFIRMED** — `test/checkpoint-wiring.spec.ts:430,649`、`test/checkpoint-schema.spec.ts:339` |
| B16 | `src/client/index.js:690`（`guardedTranslator`）、`:1665,1688,1714`（`status.unknown`） | 字典缺注册时 key id 不上屏；面板不认识的状态说「状态未知」而不是把引擎原词塞进中文句子 | **HYPOTHESIS**（内容 CONFIRMED：同上 §Client-surface hardening 第 2、3 条；编号映射未确认） |
| B17 | `src/client/index.js:987,1005,1412`（设置页 `loading`/`error`/`unavailable` 三态）、`:945`（≤560px `.gw-row` 单列） | 失败不再永远显示「读取中…」；窄窗不再横向溢出 | **HYPOTHESIS**（内容 CONFIRMED：同上第 4、5 条；编号映射未确认） |
| B18 | `src/gate.ts:186,870` | 可选混合分类器给出的档位带**它自己**的理由句，不冒充规则句 | **CONFIRMED** — `test/phase1-dialogue.spec.ts:1073-…` |

**B11/B16/B17 的边界（`HYPOTHESIS`，不冒充）**：这三条在本仓库全树（`src/`、`test/`、`lib/`、
`docs/`、`.dsh-home/`、`.agent-teams/`）**没有任何 `B11`/`B16`/`B17` 源码注释锚点**，
审计清单也没有落盘文件。因此上表按「本轮客户端加固的实际改动」给出 `文件:行号` 与证据，
但**编号与条目的对应关系是推断**。lead 若持有清单原文，补一行即可把状态改成 `CONFIRMED`；
在此之前不得把它们当作「审计编号已核对」。

### H1 — 安装 / 加载 / 交互（真机，`evidence/verify-H1/`）

环境：隔离 `DSH_HOME=<repo>/.verify-gw/home`（跑完已删）、profile `gwverify`（自 `web` 模板）与
`gwverify-hl`（自 `headless`）、运行时 `dsh 0.2.2-rc.3`。命令与输出原文见该目录 `README.md`。

- **安装 PASS（`CONFIRMED`）**：
  `npm run build` → exit 0，client bundle **186091 B** → `lib/client.js`；
  `DSH_HOME=$PWD/.verify-gw/home dsh plugin --profile gwverify add "$PWD"` → pnpm 写入
  `dsh-grok-workflow link:../../../..`，安装后 manifest 版本 `0.8.0`（工作树基线），
  `dsh.profile.bundles` 变 **3 条**（`profile-bundles.json`）。同法在 `gwverify-hl` 重复，exit 0。
- **加载 PASS（`CONFIRMED`，不是「没报错就算过」）**：启用时 boot 只有 URL 一行
  （`boot-enabled.txt`），无 `pending` / `did not activate` / `skipping profile bundle`；
  **对照**：`--patch` 关掉 `workflow-ptc` → `dsh: warning: 1 entry did not activate` +
  `grok-workflow (dsh-grok-workflow): pending (waiting for service: workflowEngine)`
  （`boot-control-workflow-ptc-disabled.txt`）。对照存在，说明干净那行不是静默假象。
- **活实例三查（`CONFIRMED`）**：`POST /api/settings/describe` → 23 个命名空间，其中
  `grok-workflow`（`autoGenerate: true`、`applies: live`、28 投影字段、无 secret 槽）；
  首页把 `dsh-grok-workflow/client.js` 打进 `/plugins/??…` 批，取回字节 = `lib/client.js`
  加一行 `sourceMappingURL`（`client-bundle-serving.txt`）；真实会话出站请求的工具表
  **24 个含 `grok_workflow`**（`mock-boundary.txt`）。
- **前台（chat 档）PASS（`CONFIRMED`）**：
  `DSH_HOME=.verify-gw/home dsh --profile gwverify-hl --patch mock.patch.yml "你好"` → exit 0，
  stdout 由插件自己产出：`档位：直答档 — 因为：这是问候/寒暄，没有要做的事，前台直接回答。`
  且该裁决同时写进了会话日志（`session-dcf8b852…` 的 `user/message` seq 12，`front-desk-relay-message.txt`）。
- **团队档 model-BLOCKED（`BLOCKED`，不报 PASS）**：同一命令换成
  `"用团队跑一个小任务：…"` → exit 0，但 run `FAILED`：
  `task-1: failed (2 attempts) — worker failed on every route: [format-error] child returned no valid structured result`
  （`interact-team-tier.txt`）。档位行本身正确（`档位：团队档 — 因为：你的消息里点名了团队…`），
  规划/工人子会话都真的起来了；失败点是**被 mock 的模型给不出结构化结果**。
  真模型路径本轮**不可达**，原文如下（`model-boundary-BLOCKED.txt`）：

  ```text
  命令：DSH_HOME=.verify-gw/home dsh --profile gwverify-hl --patch .verify-gw/model.patch.yml "Reply with exactly: MODEL_OK"
  EXIT=1
  stderr: dsh: TIMEOUT: Request timed out.: Connect Timeout Error
          (attempted address: models.fyrali.com:443, timeout: 10000ms) (UND_ERR_CONNECT_TIMEOUT)

  getent hosts models.fyrali.com -> 100.111.111.99
  tailscale status: 100.111.111.99 bifrost active; relay "sin", tx 10764 rx 0
  ping 100.111.111.99: 2 packets transmitted, 0 received, 100% packet loss
  TCP 80/443/3000/3065/8000/8080/8888/9000/11434/4000 on 100.111.111.99: all closed/timeout
  备选本机网关 http://127.0.0.1:3065/v1 (agent2api) 列出模型，但
  POST /v1/chat/completions -> HTTP 401 model_api_key_required（取网关 key 需读用户凭据库，AGENTS.md 禁止）
  ```

  即 **`100.111.111.99` 不可达 = BLOCKED 的成因**：tailnet 侧显示 active 但 `rx 0`、
  100% 丢包、所有探测端口关闭；备选网关要凭据。**没有伪造任何 PASS**。
- **engines 上界边界（`CONFIRMED`）**：`evaluatePluginCompatibility` 用
  `semver.satisfies(runtime, range, { includePrerelease: true })`（`dsh-app-boot/lib/index.js`），
  所以 `<0.3.0` 实际**放行 `0.3.0-rc.*`** —— 实测 `0.3.0-rc.1` → compatible。
  即「上界 0.3.0」在当前实现里不构成对 rc 的围栏；安装从未因 `engines.dsh` 被拦。
  这是记录，不是缺陷：要不要收窄留给下次改 `engines` 时决定（见 DECISIONS D-043）。

### H2 — 进度 Tab 真机（14 帧，`evidence/progress-tab-2026-11-15/`）

隔离 `dsh web` 实例 `127.0.0.1:3210`、`DSH_HOME=<repo>/.dsh-home`、profile `gwprog`（自 `web` 模板）、
插件用**打包产物**装入、模型走 `127.0.0.1:18088` 真网关、headless Chromium 1440×900 / 480×900。
收尾：杀进程 + 删 token 日志（`PORT_3210_CLOSED` / `TOKEN_LOG_REMOVED`），`:3080`/`:3086`/`:3065` 未触碰。

| 状态 | 真机结论 | 证据 |
| --- | --- | --- |
| `pending` | **CONFIRMED** | `03`、`04`：7 个未命中的模板阶段保持 pending，`title="Not reported in the events"`，不借邻居状态 |
| `doing` | **CONFIRMED** | `03`；`TIMELINE` T+0 / +4s / +21s 三帧 |
| `done` | **CONFIRMED** | `03`（Start）、`04`（`3/3 · 100%`）、`06`（`规划 Done`） |
| `cancelled` | **CONFIRMED** | `12`/`13`/`14`：跑到 doing 时点 composer 停止（真实动作），`FINAL_STATES=["done","pending","cancelled"]`，引擎原话，未由「没结算」派生 |
| `blocked` | **NOT_RUN**（真机未触发） | 本轮没有真实触发条件（abort 给的是 `cancelled`）。单元覆盖：`test/progress-tab.spec.ts`、`test/client.spec.ts` |
| `failed` | **NOT_RUN**（真机未触发） | 未构造失败子调用（不伪造真机）。单元覆盖同上 |

- 三 Tab 共存且默认落对话：`A2_TABS=[Chat(selected), Trajectory, Progress]`、`A2_TAB_COUNT=3`（`01`）。
- 空态：有标题与「No rows declared yet」，无轨道/节点/百分比（`02`）。
- 详情三段：`DETAIL_HEADINGS=["Engine facts","Stage report"]`，7 字段全 `—` + `Source: not reported`
  （L3 落点，符合设计 §7），`Copy coordination block` 在无协调块时 `disabled=true`（`06`、`stage-d.log.txt`）。
- 窄屏 480 / 深色：详情变底部抽屉、字段单列；环色全来自 token（`07`、`08`）。
- 零回归：对话含任务原文 + 报告 + `/grok on` 回执、无 `TypeError`/`Cannot read`；轨迹 6132 字符含
  events / workflow；已完成行可点开真实子会话（`09`、`10`、`11`）。
- **`blocked`/`failed` 的补充是单元快照，不冒充真机**：
  `npx vitest run test/progress-tab.spec.ts test/client.spec.ts` → **2 文件 / 93 测试 PASS**
  （`unit-supplement.log.txt`）。
- **单 run 展示**：`selectActiveRun` 取 `anchorSeq` 最大的 run，故 `04` 之后只剩最新轨道（与设计 §3 一致）。

### `maxAttemptsPerTask = 400` 的推导（`CONFIRMED`）

`src/config.ts:35` 把上界从 `1100` 降到 `400`，`test/routing.spec.ts:73` 把它钉成等式：

```text
worker 链上限 50（HARD_LIMITS.chainLength）
+ verifier 链上限 50
= 每次尝试 100 次子调用
× 尝试次数（maxRetries 硬上限 3 → 3+1 = 4）
= 400
```

守卫是 `>`，所以**最坏的合法组合恰好等于 400 且能通过**；只有「将来把某个上限放宽却忘了 revisit」
才会撞到它。普通组合（3+3 链、默认 1 重试 = (3+3)×2 = 12）远在界内。
性质变了：旧值 1100 只是「足够大」，新值 400 是「最坏合法值」，等式由测试固定。

### link: 安装 / `grok on`（现象 `CONFIRMED`，归因 `HYPOTHESIS`）

- **`CONFIRMED`**：`dsh plugin --profile gwprog add link:<repo>` 装的实例里 `/grok on` 回
  `Failed / Grok workflow toggle not changed: Receiver must be an instance of class Session.`
  （`probes/probe-after-grok-on.png`）；换成同目录**打包产物**安装，同一条命令成功
  `Grok workflow ON — every message now runs the full plan→execute→verify workflow.`
  （`probes/probe-grok-on-existing.png`、`stage-e.log.txt` 的 `GROK_ON=true`）。
- **`HYPOTHESIS`（未插桩验证模块身份）**：`link:` 时插件解析到工作树自己的
  `node_modules/@deepseek-ai/dsh-session` **0.2.1-rc.2**（devDependencies），运行时是
  **0.2.2-rc.3**；`appendPluginRecord` 落在旧副本的私有方法上，跨副本 brand check 抛错。
  打包安装的 profile 里只有 `cosmokit`/`schemastery`，没有第二份，故正常。
- **影响面（`CONFIRMED` 的边界）**：只影响「把工作树 `link:` 进 profile 做真机验证」；
  不影响打包/npm 安装形态。**验证 `/grok` 开关必须用打包产物。**
- 附带 `CONFIRMED` 限制：会话首页（尚无 session）里发 `/grok on` 不执行，必须先有一条普通消息建会话。

### 本轮 `NOT_RUN` / `BLOCKED` 汇总

- `BLOCKED`：真模型团队档端到端（`100.111.111.99` 不可达，原文见上）；因此「团队档答案质量」本轮无结论。
- `NOT_RUN`：live `:3080` / `:3086` / `:3090` 的部署与重启（用户保留动作，D-013）；
  进度 Tab 的 `blocked`/`failed` 真机触发；`README`/`ARCHITECTURE` 之外的文档连带改动。
- 未提交、未 push、未打 tag、未 bump（版本由 V 组做）。

## 2026-11-15 — v0.9.2 准备中：B01/B02/B04 + 进度 Tab 脊椎/详情/连线（未提交、未 bump、未发布）

- **From:** 收尾组 agent-26 · **To:** lead / agent-27 / 后续代理 · **Base:** `main` = `4b92278`
  （v0.9.1 发布记录；`HEAD` 与 `origin/main` 同 sha）。工作树 dirty（本轮核数时；agent-27 的人话
  报告改动随后进入同一工作树，故这个数字会变）：**19 文件**
  （`src/` 4：`config.ts`/`index.ts`/`progress-tab.ts`/`client/index.js`；`test/` 3；
  `lib/` 12 个构建产物）+ 未跟踪 `test/progress-connector.spec.ts`、
  `docs/knowledge/evidence/progress-tab-2026-11-15/Round2/`、`.tmp/`（测试用 TMPDIR）。
- **发布动作全部 HOLD（`CONFIRMED`，用户 2026-11-15 指令，经 lead 下达）**：不写 `CHANGELOG.md`、
  不 bump `package.json`/`package-lock.json`（仍 `0.9.1`）、不 commit、不 push、不打 tag、不动 Issue。
  原因：用户反馈 Round2 的 `05` 截图里报告太机器（`stat`/`od`/`sha256`/路径/marker 全贴给用户，
  非技术读者看不懂）——截图逐字内容与判定见 `VALIDATION.md` Round 39 §6。
  人话报告改动归 **agent-27**（写面：`src/answer.ts`、`src/report.ts`、
  `src/delivery/*`、`src/gate.ts` 调用点及其测试），收尾组不碰这四处；等 agent-27 回齐 + lead 验货
  后统一发版。要求的默认形态：只发 human 块 + 下一步，机器证据收进 Progress 详情 / 诊断开关。
- **B01（`CONFIRMED`）**：设置页超限横幅读**用户层**，不读钳制后的生效值。锚点
  `src/client/index.js:862`（注释与取值）、`:1444`（`describe()` 投影里把 `user` 层带出来）。
  理由：`describe()` 发布的是**生效值**，横幅若读它，用户存的 `8` 被钳成 `6` 后被显示成 `6`，
  等于替用户改口。测试：`test/config-limits-repair.spec.ts`
  `reads the stored user layer, not the clamped projected value (B01)`。
- **B02（`CONFIRMED`）**：全部数值硬上限收敛到**一张表** `LIMIT_CAPS`（`src/config.ts:53` 起，
  值一律读 `HARD_LIMITS`），schema 侧 `clampedLimit(field, min)` 与载入期 `repairLimitOverruns`
  共用同一张表：新增上限只加一行，两侧不再各写一个界。表内 10 个字段：`maxConcurrency`、
  `maxRetries`、`maxQueuedMessages`、`historyTurns`、`historyChars`、`maxTasks`、`timeoutMs`、
  `maxActiveRuns`、`maxActiveRunsTotal`、`recordLimit`。**不在表内是刻意的**：每路由
  `maxInFlight`（在链内判，界是 `HARD_LIMITS.routeInFlight`）与 `configVersion`（线上契约，
  不匹配必须拒载而非改写）。低于下限、非数字、程序化 `resolveConfig` 越界仍硬拒（R-06 不变）。
- **B04（`CONFIRMED`）**：钳制告警**每次载入一条**。两层钳制都只记账
  （`recordOverrun()`：schema 没有 logger；repair 跑在一个仍可能因别的缺陷抛错的读里），
  由 `src/index.ts` 的 `announceOverruns()` 用一个 set 按 `field:stored` 去重后统一 `logger.warn`；
  `repairLimitOverruns` 自己的 `warnings` 仍决定"确实修过"。旧写法的问题：那条读路径**每条消息**
  走一次，只要补丁还在超限就会每消息刷一条告警。
- **进度 Tab 三处（`CONFIRMED`，`src/progress-tab.ts` 与 `src/client/index.js` 双侧同构）**：
  - **脊椎整词绑定**：拉丁字母 token 只在**词边界**命中，CJK token 仍按子串（`规划` 在
    `任务 1 · 规划` 里就是词）。松匹配的三个真实误报：`ui` 读进 `build`、`tag` 读进
    `stage`/`target`、`sync` 读进 `async`——旧脊椎因此报出没人跑过的阶段。
  - **详情协调块**：`parseCoordinationBlock` 只认三种形态（`json`/`grok-coordination` 围栏、
    任意围栏里的 `LABEL: value` 七字段块、无围栏的同款标签块），糊散文一律不认；来源阶梯
    `stage-detail` → 子会话协调块 → `not-reported`，块内值标 `Source: child coordination block`，
    只有拿到原文才允许 `Copy coordination block`（否则保持 disabled）。
  - **连线填充 + 状态字形**：连线只在**左侧节点自己 `done`** 时填充（`data-filled="true"`，
    否则属性**缺席**而不是 `"false"`）；`failed`/`blocked` 故意留空——线是证据，不是装饰。
    节点环里一个状态字形；节点聚合多行时用**行数**替换字形（可核对的数字优先于符号）。
    钉住：新 spec `test/progress-connector.spec.ts`（7 例，直接渲染 `lib/client.js`，含
    `blocked` 派生节点与"两行→计数、单行→字形"）。
- **测试（`CONFIRMED`，`TMPDIR=$PWD/.tmp`）**：`npm run ci` → `tsc` **0 错**；`oxlint`
  **4 warning / 0 error**（4 条均为既有：`src/run.ts` 未用 `RoleName`、`src/redact.ts` 多余转义、
  `src/client/index.js` 的 `GROUPS_WITH_FIELDS` 与 `field`）；`npm run build` **幂等**——构建前后
  67 个 `lib` 产物 sha256 全等，client bundle **204585 B**，`cmp lib/client.js src/client/index.js`
  一致；全量 vitest **50 文件 / 934 测试 → 932 PASS / 2 FAIL**。
- **两条失败是基线既有（`CONFIRMED`，独立 worktree 对照）**：`git worktree add .dsh-home/baseline-wt
  4b92278` 后在同一 worktree 跑 `npx vitest run test/gate.spec.ts` → **2 failed | 53 passed**，与本轮
  工作树失败项相同：`refuses a message explicitly when the queue is full and never retries it on its
  own`（单跑也复现）与 `writes the answer into the session when the append strategy is selected`
  （全量跑复现、单跑偶过）。本轮未改 `src/gate.ts`。**既不写成"已修"，也不写成"产品 PASS"**：
  发版前由 agent-27 或用户决定是否连带处理。
- **真机证据（Round2，`CONFIRMED`）**：`docs/knowledge/evidence/progress-tab-2026-11-15/Round2/`
  ——隔离 `dsh web` `127.0.0.1:3221`、`DSH_HOME=<repo>/.dsh-home/r2`、profile `gwprog2`（自 web 模板）、
  插件装**打包产物** `dsh-grok-workflow-0.9.1.tgz`（sha256 `ac51b89a…`）、模型走本机网关
  `127.0.0.1:18088`（`wb/cn:deepseek-v4.1-flash`）、headless Chromium 1440×900 / 480×900；
  **13 张 PNG** + 5 份 stage 日志 + `MANIFEST.sha256`；token 只经环境变量、收尾删日志与 envfile，
  目录内 token 形状字符串扫描 = 0。真机 `pending`/`doing`/`done`/`failed` 四态 `CONFIRMED`
  （`failed` 来自真实沙箱边界那一次运行，不是构造）；`blocked`/`cancelled` 本轮 `NOT_TRIGGERED`
  （不伪造，单测覆盖在 Round 38 记的 93 例里）。安装/加载/前台半边的证据仍是
  `docs/knowledge/evidence/verify-H1/`（`CONFIRMED`，含"关掉 `workflow-ptc` → pending"的对照）。
- **诚实边界**：`blocked`/`cancelled` 的真机补充 `NOT_RUN`；live `:3080`/`:3086`/`:3090` 未部署
  未重启（D-013）；版本号、节头、commit、push、tag、Issue 评论全部 HOLD，本段**不是发布记录**。

## 2026-11-15 — v0.9.2 收尾发版（本地已提交 `5eb4942`；push / tag / Issue 评论 HOLD）

- **From:** 收尾发版组 agent-30 · **To:** lead · **Base:** `main` = `4b92278`（`HEAD` = `origin/main`
  = v0.9.1 发布记录）。**本地提交 `5eb4942`**（release-prep：`src` 7 / `test` 9 / `lib` 40+ /
  `CHANGELOG.md` / `package.json` / `package-lock.json` / Round2 证据；72 文件 `+5135 −1021`）。
  记忆文件随本段之后的一个 docs 提交入库。**未 push、未打 tag、未发 GitHub Release、未动 Issue**
  （lead 2026-11-15 (B) 口径：等 human-only 真机复拍）。
- **内容（`CONFIRMED`，每条都有源码锚点）**：
  - **B01** — `src/client/index.js` 设置页超限横幅读**用户层**，不读钳制后的生效值（理由见 D-047）。
  - **B02** — `src/config.ts` `LIMIT_CAPS` 是唯一钳制表（10 个字段，界一律读 `HARD_LIMITS`），schema
    侧 `clampedLimit` 与载入期 `repairLimitOverruns` 共用同一张表。
  - **B04** — 两层钳制只记账，唯一发声点是 `src/index.ts` 的 `announceOverruns()`，按 `field:stored`
    去重，补丁仍超限时不再每条消息刷一条告警。
  - **进度 Tab** — `src/progress-tab.ts` 与 `src/client/index.js` 同构：脊椎拉丁 token 只在词边界命中
    （CJK 仍按子串）、详情七字段来源阶梯（`stage-detail` → 子会话协调块 → `not-reported`，只认三种
    显式块形态）、连线只在左侧节点自己 `done` 时填充、节点环一个状态字形（聚合多行换行数）。见 D-048。
  - **人话报告默认化**（agent-27；`src/answer.ts` + `src/delivery/index.ts`，调用点 `src/gate.ts`）——
    标记之间是人话块（中英双语），机器台账折到结束标记**之后**并有一行 `LEDGER_GUARD` 明说
    「这是内部上下文，不许引用」；`showDiagnostics` 打开时台账回到标记内；人话行剥掉机器细节
    （`MACHINE_DETAIL` 12 类：shell 命令、摘要/hex、路径、裸文件名、代码、relay 标记），整行都是
    机器细节的直接丢弃；失败原因保留措辞。台账仍随消息留存，供 Progress 详情与跨轮延续读回。
- **测试与构建（`CONFIRMED`，本机；证据见 VALIDATION Round 40）**：`npm run ci` → typecheck **0 错**；
  oxlint **5 warning / 0 error**（4 条既有 + `src/delivery/index.ts:264` 新增 1 条）；build client
  bundle **204585 B**；vitest **51 文件 / 948 测试全 PASS**；build 幂等（`lib/` 67 个产物 sha256
  前后全等）+ `cmp lib/client.js src/client/index.js` 一致。
- **两条 `test/gate.spec.ts` 同步修复（`CONFIRMED`，只动测试的等待条件，产品行为未变）**：队列满那条
  等的是「一条 relay follow-up」，而拒绝通知本身就满足它 → 在被受理的批次排空之前重发、又被同一个
  满队列拒绝；append 那条等「两条 session append」，而 run 自己的进度事件就满足它 → 断言早于
  `assistant/message` 落盘。两条在 `4b92278` 的独立 worktree 上同样失败（本机红、同一提交在 CI 的
  Node 22/24 绿 → 时序敏感，不是 CI 带红发版）。改法：分别等「拒绝通知 + 该 run 自己的答复」与
  `assistant/message`；单跑 **55/55**，全量 **948/948**。规则记入 D-051。
- **layerfs 借鉴结论（`CONFIRMED` = 只读评估；`NOT_RUN` = 移植与真机）**：agent-28（UI）与 agent-29
  （多 Agent）对 `/home/fish/projects_mine/layerfs`（本地检出 `87bd986`，UI = `dsh/packages`）做了
  **只读评估**：UI 8 条可借鉴 / 9 条不可搬，多 Agent 8 条可借鉴 / 7 条不可搬，逐条理由见 D-049。
  **本轮零用户可见落地**（进度 Tab 的 token 色 / 窄屏抽屉 / 百分比空态与交付层人话块都是 v0.9.0
  既有实现，不是照 layerfs 搬的），故 `CHANGELOG.md` 的 `[0.9.2]` **不写 layerfs 条目**。
- **放行的真实缺口（`NOT_RUN`）**：「human-only 默认形态」的**真机复拍**。仓库内最新真机证据止于
  11-15 12:09 的 `evidence/progress-tab-2026-11-15/Round2/`，全部是**人话默认化之前**的形态
  （`05-chat-with-run-report.png` 正是用户点名太机器的那张）。需补图清单见 VALIDATION Round 40 §6。
- **边界**：`v0.9.2` 目前只是本地提交——远端 `origin/main` 仍是 `4b92278`，没有 tag，因此没有 GitHub
  Release，Issue #1 无新评论；live `:3080`/`:3086`/`:3090` 未部署未重启（D-013）。


## 2026-11-15 — v0.9.2 已发布：push / CI / tag / Release / Issue #1 闭环

- **From:** 发版执行组 agent-38 · **To:** lead / 后续代理 · **Base:** `origin/main` = `4b92278`
  （= 上一版发布记录）→ 本轮推送后 `origin/main` = `98f26a8`。
- **结果（`CONFIRMED`，逐条可复核）**：
  - **push**：`git push origin main` → `4b92278..98f26a8`（fast-forward，**未 force**，exit 0）。
    两个提交：`4ab0cb3`（`.gitignore` 收 `.tmp/`）、`98f26a8`（人话默认形态真机证据落盘）。
  - **CI**：run `43698707930`，commit `98f26a8`，Node 22 + Node 24 **both success**（`gh run view`）。
  - **tag**：`git tag -a v0.9.2 5eb4942 -m "v0.9.2: plain-language answer by default, one clamp table,
    progress tab spine/detail/connector"` → `git push origin v0.9.2`（`* [new tag]`，exit 0）；
    `git merge-base --is-ancestor 5eb4942 origin/main` 通过。
  - **Release**：run `43698836519` success（tag ↔ `package.json` ↔ `CHANGELOG [0.9.2]` 校验、
    `lib/` 已提交且与构建一致、`npm test` 全绿）；GitHub Release published
    **2026-11-15T09:22:08Z**，asset `dsh-grok-workflow-0.9.2.tgz` **464,763 B**。
  - **旧 tag 复核**：`git ls-remote --tags origin` 前后对照 —— `v0.9.1` → `584dc22`（peel `9103280`）、
    `v0.9.0` → `936e625`、`v0.8.0` → `9c590f2` 及更早**全部未动**；新 `v0.9.2` → `38ef237`（peel `5eb4942`）。
  - **Issue #1**：状态评论
    [issuecomment-6892286461](https://github.com/free6589/dsh-grok-workflow/issues/1#issuecomment-6892286461)，
    `TEST_RESULTS: PASS`，模板 11 字段齐全。
- **证据落盘（`CONFIRMED`）**：`docs/knowledge/evidence/human-default-2026-11-15/`（8 PNG + stage 脚本/日志 +
  probes + `MANIFEST.sha256` 覆盖 85 个文件 + `lib/client.js`、`lib/progress-tab.js` 哈希；取自 agent-32
  的补拍，原名 `human-report-2026-11-15`，落盘时只改仪器脚本路径，结果 JSON/堆栈原文未改写，见 `LANDING.md`）。
- **`.tmp` 处置（`CONFIRMED`）**：按「可再生」判据整体清空（13 MB / 97 项：测试 checkpoints、隔离家
  `human-home`/`human-home-r2`、`npm pack` 产物、chromium 临时 profile、编译/npm 缓存、probe 日志），
  删前对两份 `.credentials.yaml`（各 161 B）做了布尔检查：只含 `client-connection/browser-session`
  一条记录，**provider key 标记 0 处**；`.gitignore` 增 `.tmp/`。副作用如实记录：证据 README 引用的
  `.tmp/r2-dump-booted.yml` 与打包 tgz 已随之删除（均可用文中命令重建）。
- **未做（`NOT_RUN`）**：live `:3080`/`:3086`/`:3090` 的部署与重启（D-013，用户动作）；证据集自陈的
  三项缺口（`showDiagnostics` 开态台账在答案里不可拍、完成行点开子会话未在本实例重拍、
  人话块后几轮仍漏 `od -c`/命令片段——见 VALIDATION Round 41 §2）。


## 2026-11-15 — 答案置顶 + 边聊边干（A/B/C 落地，未提交；`CONFIRMED` 代码 + 测试，`NOT_RUN` 真机）

- **基线**：`main` = `129a92e`（v0.9.2 已发布）。本轮工作树：`src/delivery/index.ts`、`src/script.ts`、
  `src/gate.ts`、`src/triage.ts` + 8 个测试文件 + `lib/` 构建产物 + `CHANGELOG.md[Unreleased]` +
  `docs/ARCHITECTURE.md` 策略段。
- **A（答案为本）**：`headline()`→`statusTail()`（计数只进尾巴），新增 `answerLead()`（summary
  首完整句→转述回落→绝不回落 ledger），`composeHuman()` 重排（答案→下一步→做成/没做成→caveats→尾巴），
  删除"关键证据："逐字块；`MACHINE_DETAIL` 新增站号/坐标/Model链/计数施工句 4 类；`answerLead` 回落
  句自带 `核验通过` 被自家 MIDLINE 误杀→改"有一项已得出可用结论。"；`stripIds` 单字符 lookbehind
  无捕获组导致 `Task a：`→`Task $1`→修替换串为空。
- **S（synthesizer 硬约束）**：`synthesizerPrompt` + `layeredPolishPrompt` 追加 HARD RULES（中英各一）；
  `polishVerbatimSources` + `polishStyleVerdict` 宿主校验（首句状态行/机器 token/逐字引用/反引号/
  中英复读/标题列表/>200词），`polishGuardrail` 第 5 步；`layeredFallbackSummary` confirmed 段改转述；
  `layeredPolishPrompt` 旧"照抄加反引号"指示改为"转述不抄"（否则 prompt 与 guardrail 自相矛盾）。
- **B/C（边聊边干 + 首答现场写）**：`triage.ts` 新增 `firstAnswerPrompt`（四要素信息结构 + FORBIDDEN）/
  `sanitizeFirstAnswer` / `firstAnswerFallback`（明说模板兜底）/`FIRST_ANSWER_LIMITS`；`gate.ts` 新增
  `canBackgroundDeliver`（whenIdle+followup+session 三探针，失败回落）/`produceFirstAnswer`/
  `answerTeamInteractive`（首答 enter + 后台 enqueue runTeam + `record admitted-team-background`）；
  `instantReceipt` 固定句删除、函数作写入通道保留、语义改为"是否写首答行"（默认仍 true）。
- **测试（`CONFIRMED`）**：`npm run ci` → typecheck 0 错、oxlint **4 warning / 0 error**（基线 5，
  修掉 2 个自带 useless-escape，另 1 个基线 warning 被重写带走）、build 产物一致、
  vitest **51 文件 / 948 测试全 PASS**。29 个旧断言按新行为更新（delivery 4 套件、gate、
  gate-partial-head、triage、phase1-dialogue、synthesis-guardrails、human-output-contract）；
  另修 2 个实现 bug（`$1` 注入、`核验通过` 自杀）。
- **不变量（`CONFIRMED`）**：并发 3/6、重试 1/3、maxActiveRuns 2/4、Total 8/16、核验独立/证据链/
  fail-closed/脱敏/unload 取消、`humanSummary` on、`showDiagnostics` off、`/grok` 开关、mode 语义、
  `answerStrategy` 默认 `in-turn`、`full` 管线字节——全部保留，仅 delivery 渲染与 team 走法变更。
- **未做（`NOT_RUN`）**：真机 Web 长驻验证（首答现场措辞、进度节点、中断重定向）、headless e2e
  回归（`scripts/e2e-headless-in-turn.sh`）、commit/push（等用户指令）。

## 2026-11-16 — 进度 Tab A+C 落地（`CONFIRMED` 代码 + 单测 + 隔离真机；未提交）

- **From:** lead · **Base:** `129a92e`（v0.9.2）+ 未提交 A/B/C（33 文件）。
- **做了什么**：只改 `src/client/index.js`（i18n +8 key 中英、`PROGRESS_CSS` 脊/段/分支/成员卡/jump/legend、link 规则补回、`ProgressNode`→段渲染、`ProgressMemberCard` 新增、`ProgressView` 手风琴状态机 + 跳转 + 分支渲染 + 键盘 Enter/Esc/↑↓）+ `test/client.spec.ts`（scope 断言改脊 + `aria-expanded` 默认开段）+ `test/progress-connector.spec.ts`（meta 计数断言 + 手风琴 3 例新测）。折叠/百分比/blocked/事件契约/5 状态色/详情阶梯/子会话打开——一律未动。
- **实现期抓到的真 bug（`CONFIRMED`，真机复现）**：
  1. 段头 meta 被 seg-line 穿过 → seg-head 加背景 + z-index，line 置后。
  2. 运行中分支把其他段挤扁 → branch/members/li 加 max-width + overflow hidden，label 补回 min-width:0（补回时发现旧 label 规则被删，标题裸奔）。
  3. 我的 python 行号替换把 link 规则弄丢 → link 宽 0，补回。
  4. `label-inverse, #fff` 字面色被 lint 规则抓 → 改 `inherit` 回退（token 保留）。
- **验证（`CONFIRMED`）**：`npm run ci` → typecheck 0 错、lint 4w/0e、**51 文件 / 951 测试 PASS**（948+3 新）；隔离 profile `acgtest`（`:3225`，打包安装，md5 校验）真机：脊 7 段 / 单展开 / +N / jump / scrollW==innerW（宽+窄）/ 深色 token / 详情三段 / Open child session 真开 / Chat 回归；窄屏竖排 + 详情抽屉 fixed 生效。
- **未做（`NOT_RUN`）**：commit/push/tag/Release（等用户指令）；live 更新（禁重启，需用户定夺路径）。

## 2026-11-16 — v0.9.3 已发布：push / CI / tag / Release / Issue #1 闭环 + live 文件已换（未重启）

- **From:** lead · **Base:** `origin/main` = `593f89e`（release-prep）→ 本轮推送后 `origin/main` = `593f89e`（已是最新，无新提交）。
- **结果（`CONFIRMED`，逐条可复核）**：
  - **push**：`git push origin main` → `7a31218..593f89e`（fast-forward，未 force，exit 0）。两个提交：`7a31218`（A+C 实现 + A/B/C + 测试 + 记忆）与 `593f89e`（bump 0.9.3 + CHANGELOG 节头；`lib/` 构建幂等无变化）。
  - **CI**：run `43738470054`（commit `593f89e`），Node 22 + Node 24 **both success**（`gh run view`）。
  - **tag**：`git tag -a v0.9.3 593f89e` → `git push origin v0.9.3`（`* [new tag]`，exit 0）；`git merge-base --is-ancestor 593f89e origin/main` 通过。
  - **Release**：`v0.9.3` run success；GitHub Release published，asset `dsh-grok-workflow-0.9.3.tgz` **483122 B**（与本地 `npm pack` 同字节一致）。
  - **旧 tag 复核**：`git ls-remote --tags origin` 推前后对照 —— `v0.9.1` → `584dc22`（peel `9103280`）、`v0.9.2` → `38ef237`（peel `5eb4942`）**全部未动**；新 `v0.9.3` → `f63bb7c`（peel `593f89e`）。
- **tag 可用性（`CONFIRMED`）**：`gh release download v0.9.3` 得 tgz（483122 B），解包 `package.json` = `0.9.3`，`lib/client.js` 含脊规则 31 处，md5 `6a797b90…` 与仓库 `lib/client.js` **逐字节一致**。
- **live 安装（`CONFIRMED` 文件已换，生效待重启）**：`dsh plugin --profile web add file:…0.9.3.tgz`（danger-full-access 审批后执行，exit 0），live `web` profile 内包版本 `0.9.2 → 0.9.3`，`lib/client.js` md5 `6a797b90…` 与仓库一致。**进程未重启**（D-013 用户保留动作）：运行中实例仍跑旧模块，新脊/首答渲染在用户下次重启 DSH 后生效。`~/.dsh/profiles/web` 在本会话沙箱下只读，安装经审批提权执行，未读未写任何凭据。
- **杂散清理**：删 `?? .tmp-weather/`（12 项天气抓取产物，与任务无关，不在 `.gitignore` 内）。
- **隔离实例**：`acgtest/:3225`（四轮 bundle 复验用）在收尾时仍在听；验证结束即 kill + 删 `dsh-url.env`，保留 `.dsh-home/acg/shots/` 与驱动脚本作复现证据（`.dsh-home/` 已 gitignore，不入库）。

## 2026-11-16 — 补交步 A 落地（未提交；`npm run ci` 全绿 51/954）

- **From:** lead · **Base:** `01f86de`（v0.9.3 已发布，live 文件已换待重启）。
- **起因（`CONFIRMED`，落盘对证）**：用户 session `3c296b9a` 任务 4（东北部天气）首跑 seq=5 被标失败，
  但子会话 `2d7bd1e7`（60 行）显示 TinyFish 4 连挂后 worker 绕道 `web_fetch`+`curl` 把数据全拿到了
  （S06 25.9°C/97.2%/1.5kn/226°、24h 预报、2h 临报），只是**没调 `structured_output` 就
  `turn/end completed`**。插件侧 `callRole` 只拿到 null → format-error → attempt 失败 → 整轮重试
  （seq=8，118 行转录）重跑全部 curl。浪费的是一整轮 worker，不是数据。
- **做了什么**：`src/script.ts`（模板内）+ `src/report.ts` + `src/types.ts` + `test/failure-paths.spec.ts`。
  worker 循环在 `execution == null && attemptFailure.class === 'format-error' && !setup` 时，
  同 attempt 内追加一次 `resubmitPrompt` 的 `callRole`（禁重做已完成工作、只取还缺的、立刻交卷）；
  成功则填 execution、清失败、标 `resubmitted: true`，正常进 verifier；再缺则按原失败路径走重试。
  report 白名单透传 `resubmitted`，types 加可选字段。
- **诚实边界**：补交是**新 child**（engine 无续会话通道，`agent()` 契约已确认），无原会话记忆，
  工具调用省不了，只能省试错（prompt 禁 exploratory search + 直接给最短路径习惯）。
  传输/模型失败、setup 故障不触发补交；每次 attempt 最多补一次；核验严格性零动
  （`checkVerification` 未碰，无 structured 仍是什么都核验不了）。
- **验证**：`npm run ci` → typecheck 0 错、lint 4w/0e、51 文件 / 954 测试 PASS
  （951 + 补交 3 例：补交成功 verified 且 attempts=1/resubmitted 真；补交再缺记 format-error；
  传输失败不补交）。真机复验 `NOT_RUN`（逻辑纯单测覆盖 + 模板文本变更；发版前建议走一次 acgtest）。
- **没做**：B（失败行分类显示）用户没点，`NOT_RUN`；push/tag/Release（等用户指令）。

## 2026-11-17 — T4 测试迁移完成（未提交；全量 vitest 51/951 绿 + typecheck 干净）

- **From:** agent-5 (lead T4) · **Base:** `ae0c6d3`（v0.9.4），worktree 延续 T1/T2/T6 未提交改动。
- **做了什么（`CONFIRMED`）**：T4 schema 瘦身后的测试套件迁移。src 侧 T4 改动（8 键 schema、
  24 键 unknown-key 拒载、FIXED_* 固定值、in-turn 唯一投递、hybrid/append/relay 删除）已由
  同 worktree 协作完成；本轮修复测试侧 ~60 处语义漂移：
  - 恢复被批量 strip 误删的 `carryoverBounds({historyTurns, historyChars})`、
    `routeBudgetFor(config)` 预算窗（T6 修复）、report wire `maxRetries`、
    `engine-harness` 超时透传；
  - `checkpoint-schema/wiring` 按 T6 数值（并发默认 10/上限 100、重试 1/3）重写过期期望；
  - `human-output/delivery/gate/phase1` 按固定输出重写（human 恒开、ledger 恒折叠、
    in-turn enter 断言）；`plugin-lifecycle`/`phase1` deadline 测试改 fake timer
   （`FIXED_TIMEOUT_MS` 60min 不可实等）；`triage.spec` route helper 按 in-turn 改写
    （entered 首答 + background followup 拼接；首答 markers 非终局判据用 ledger 行区分）；
  - `settings.ts` `distinctive` 键 `switchOn`→`synthesis`（删键后 value 匹配失效的根因）。
- **验证**：`npx tsc -p tsconfig.json --noEmit` 0 错；`npx vitest run` **51 文件 / 951 测试全绿**
  （20.4s，串行跑；并行跑曾因 CPU 争用出现 flake，单跑即绿）。
  注意全量 951（vs 之前 954）是 sibling 改写增删用例后的净数，非回归。
- **没做**：commit/push（等 lead 指令）；`lib/` 构建产物未重编；真机 live 验证 `NOT_RUN`。

## 2026-11-17 — v0.10.0：真机验收（acgtest95 / :3231）→ push / tag / Release

- **From:** agent-25（verify_push_release）· **Base:** `3d9275a`（T1–T6 实现提交，本地未 push）
  → 发布准备提交 → push。
- **真机验收（`CONFIRMED`，细节见 VALIDATION Round 47）**：`DSH_HOME=<repo>/.dsh-home/acgv095`、
  新 profile `acgtest95`、新端口 `:3231`、宿主 `dsh 0.2.2-rc.3`、本地网关模型路由。
  `npm pack` → `dsh-grok-workflow-0.9.4.tgz`（472,958 B）安装成功，已装 `lib/client.js`
  md5 `d1e2df8c…` 与仓库一致；`--dump-config` 显示 grok-workflow 8 键 + `workflow-ptc`
  由 overlay 重新启用；`curl http://127.0.0.1:3231/` → 401（围栏）。
  浏览器真实加载：`dsh-grok-workflow/client.js` 被请求、无失败无 console error；Plugins 页
  出现 Grok workflow 行；设置页 = 开关/模式/五角色链（含 Supervisor）/两数字 + Save，
  `scrollW == innerW`。两次真实对话：三城介绍（4 subagents，7 段脊，3/3 100%）、
  三城天气（04:00 首答 7s、04:02 后台收尾「1/1 项任务已由独立检查核验」，
  台账 `archive.jsonl` = `run:eef1f4b7-…` completed / verified 1/1 / confirmed 6）。
- **已知缺口（`CONFIRMED` 现象，归因 `HYPOTHESIS`）**：两次运行的 Execute/Verify 段都渲染为
  `Not reported in the events`（`members=0`、`branches=0`），与台账/答案中的"已执行并核验"
  矛盾；`deriveTrack` 成员来自 `run.members.phase`，即成员事实未进该会话进度流。
  是否为 supervisor 插入或 in-turn 后台投递引入，**未定位**，未写进 Release notes。
- **验证（`CONFIRMED`）**：`npm run ci` → typecheck 0 错、oxlint 4w/0e、build 成功、
  vitest 51 文件 / 951 测试 PASS；`git status --porcelain lib/` 为空（提交产物 = 全新构建）。
- **发版动作（`CONFIRMED`）**：`package.json` + `package-lock.json` = `0.10.0`；
  `CHANGELOG` 插入 `## [0.10.0] - 2026-11-17`（`[Unreleased]` 保留为空节）；
  README（英/中）配置参考与闸门说明按 8 键与恒开门控重写，`docs/LOCAL-TESTING.md` 同步；
  push（fast-forward，无 force）→ tag `v0.10.0` → Release（工作流校验 tag ↔ package.json ↔
  CHANGELOG ↔ `lib/` 后建）。远端 SHA / CI / Release 结论见 HANDOFF 与 VALIDATION。
- **未做（`NOT_RUN`）**：live `web` profile（`:3080`）换装与重启（D-013 用户动作）；
  进度 Execute/Verify 成员渲染缺口的定位与修复。

### 2026-11-17 — v0.10.0 发布结果（`CONFIRMED`，逐条可复核）

- **push**：`git fetch origin` → `origin/main` = `ae0c6d3`（= 本地 base，`merge-base --is-ancestor`
  通过）→ `git push origin main` → `ae0c6d3..b2c4515  main -> main`（fast-forward，未 force，exit 0）。
- **CI**：run `43946211999`（`headSha` = `b2c4515`）→ `conclusion: success`，`Node 22` +
  `Node 24` 两个 job 均 success（`gh run view --json jobs`）。
- **tag**：`git tag -a v0.10.0 b2c4515` → `git push origin v0.10.0`（`* [new tag]`，exit 0）；
  `git merge-base --is-ancestor b2c4515 origin/main` 通过；远端 `v0.10.0` object
  `63c04aa` / peel `b2c4515`。
- **old tags**：推前快照 `.tmp/v095/tags-before.txt` 与推后 `git ls-remote --tags origin`
  对照（剔除 `v0.10.0`）**逐行相同** → `v0.9.4`（`8ca2c1a`/peel `ae0c6d3`）、`v0.9.3`、`v0.9.2`、
  `v0.9.1` 及更早全部未动。
- **Release**：run `43946446721` success（tag ↔ `package.json` ↔ `CHANGELOG [0.10.0]` ↔ 已提交
  `lib/` 四项校验 + `npm test` + `npm pack`）；GitHub Release `Grok Workflow for DSH v0.10.0`
  published **2026-11-16T20:08:07Z**，非 draft 非 prerelease，asset
  `dsh-grok-workflow-0.10.0.tgz` **472,274 B**。
- **asset 可核**：`gh release download v0.10.0` → 包内 `package.json` = `0.10.0`，
  包内 `lib/client.js` md5 `d1e2df8c…` 与仓库 `lib/client.js` **一致**。
- **Issue #1**：状态评论 [issuecomment-6927842856](https://github.com/free6589/dsh-grok-workflow/issues/1#issuecomment-6927842856)，
  `TEST_RESULTS: PASS`、`LOCAL_RUNTIME_VERIFIED: yes`，模板 11 字段齐全。
- **凭证边界**：全程未读写任何 key/token（`BIFROST_VIRTUAL_KEY` 只在环境里，仅做过布尔/长度检查）；
  隔离实例的访问 token 只留在 `.tmp/v095/url.txt`（`.tmp/` gitignore），收尾删除。

## 2026-11-18 — RSI round 14：续跑（repeat-run / loop）面落地 + `0.11.14` 发版（`CONFIRMED`）

- **主题**：四个 `loop*` 键自设置面落地起只被存储、没有被任何驱动读取。本轮把驱动写出来（`src/loop.ts`
  536 行、`src/loop-surface.ts` 350 行），并把它按发布纪律写进文档、版本与 CHANGELOG。
- **代码（`CONFIRMED`）**：一条循环 = Host Schedule 里**一条** `rrule` 持久任务（标题 `Loop heartbeat`、
  文案前缀 `[grok-workflow loop]`、目标 `session` = 本会话）。插件不自持 timer，只调
  `create`/`catalog`/`edit`。`open` 对任何已定义 actor 抛 `loop/user-only`（浏览器请求天然不带 actor，
  所以路由能开、工具不能）；`grok_loop` 只有 `status`/`close`；路由 `POST /grok-workflow/loop` 在组合
  自己的 `connection.requestRejection` 闸门之后；无 Schedule 服务 → `loop/unavailable`（503）。
  规则 = `DTSTART` + `FREQ=MINUTELY;INTERVAL=<分钟>;COUNT=<轮数>`；间隔下限
  `max(60, ceil(timeoutMs/60000), loopIntervalMin)`、封顶 10080；`close`/`stopAll`/`forgetSession`
  一律删行；一个会话重复 open 只刷新同一行（串行化，避免两行）。
- **配置面**：`CONFIG_KEYS` 9 → 13（`loopEnabled`/`loopMaxRounds`/`loopFailStreak`/`loopIntervalMin`），
  `HARD_LIMITS` 100/20/10080，默认 false/10/3/0，`LIMIT_CAPS` 参与存值 clamp 与载入期 repair。
- **文档**：README（中英）新增「Repeat runs (the loop heartbeat) / 自动接着跑（循环心跳）」一节——
  开关、参数、心跳行为、停的语义四块；表格里 `loopEnabled` 一行与表后段落改成可核对的说法
  （原句写「由输入框旁的开关打开和关闭」，而本仓库客户端**没有任何代码去调那条路由**，
  `grep -rn "grok-workflow/loop" src/` 只有 `src/loop.ts:56` 一处常量），并在「已知限制」加一条；
  `CHANGELOG.md` `## [0.11.14]` 双语；`docs/LOCAL-TESTING.md` 键数与压缩包名随 bump 同步。
- **决定**：`DECISIONS.md` **D-068** 记录操作者授权「先落 P4 续跑面、P3-01/P3-02 保持 OPEN」，
  并写清授权只覆盖顺序、不放宽任何质量门；**D-069** 记录续跑面的四项归属选择与「客户端暂无开关控件」
  这一现状。
- **验证（`CONFIRMED`）**：`npm run typecheck` exit 0；`npm run ci` exit 0 = lint 22 warnings / 0 errors、
  **60 文件 / 1081 测试 PASS**（`.rsi/evidence/round-014/ci.txt`，发布脚本那次；文档侧先跑的
  `pre-release-ci.txt` 是 60/1080，两者差 1 条路由用例）。新增测试：`test/loop.spec.ts` 27、`test/loop-surface.spec.ts` 14、
  `test/heartbeat-guard.spec.ts` 14；`test/client.spec.ts` 与 config/settings 相关用例扩展。
  上一轮基线 57/1022，本轮 +3 文件 / +59 测试，无删除、无 skip。
- **未验证（`NOT_RUN`）**：真机心跳投递（需要 Host 常驻与真实额度，本轮没有创建任何定时任务——
  与 D-066 一致）；真实 Web GUI 里点一个会 POST 那条路由的控件（客户端还没有这个控件）。
- **发版（`CONFIRMED`）**：commit `20eafea`、annotated tag `v0.11.14`（object `2a7b074`，peel =
  `20eafea`），`origin/main` = `20eafea`（`merge-base --is-ancestor` 通过），`git ls-remote --tags
  origin` 与本地 `git tag -l 'v*'` 同集合（40 个），旧标签逐个未动（`v0.11.13` object `bac26e3` /
  peel `7a79efb`），未 force-push。`package.json` + `package-lock.json` + 两份 README 的版本句/安装 pin/已发布
  列表 + `docs/LOCAL-TESTING.md` 压缩包名 = `0.11.14`；`CHANGELOG` 有 `## [0.11.14] - 2026-11-18`；
  一个提交 + annotated tag `v0.11.14`，未移动任何旧标签、未 force-push、未发布 npm。

## 2026-11-19 — RSI round 15：`v0.11.14` 发布事故收口 + `0.11.15`（`CONFIRMED`）

- **前提（`CONFIRMED`）**：主工作树 `git status --short --branch` = `## main...origin/main`、HEAD = `b0d6d10`，
  但树上有 21 个 tracked 改动 + 6 个未跟踪条目（另一个写入者正在做客户端开关与 `verify:lib`）。本轮**不碰**
  这些文件：发版在独立克隆 `.worktrees/release-015`（从本地仓 `--no-hardlinks` 克隆、`origin` 改回 GitHub）
  里做，基线 = `b0d6d10`；`npm ci` 后 `npm run build`，`git diff --stat -- lib/` 为空——即 `main` 的产物与
  它自己的源码一致，事故只在那个已发布的标签里。
- **事故复述（`CONFIRMED`）**：`v0.11.14` 标签提交 `20eafea` 的 `src/loop.ts` 有 12 处 `callSchedule`，
  提交里的 `lib/loop.js` 为 0；远端 CI run `44345615218` = failure，Release run `44345622700` 在
  `Verify committed build artifacts` 失败，其后步骤（含 `Create GitHub Release`）全部 skipped；
  `gh release view v0.11.14` = release not found（最新发布仍是 `v0.11.13`）。
- **决定**：`DECISIONS.md` **D-070** —— 四个备选（移动标签 / `workflow_dispatch` 重跑 / 手工
  `gh release create` / 从 `main` 打 patch）逐一写明并选第四个；授权范围 = 一次 patch 标签 + 既有工作流
  创建的 Release，不含 npm 发布、不含移动标签、不含修改发布门禁。
- **改动（`CONFIRMED`）**：`src/`、`test/` 零改动（`git diff --stat -- src/ test/` 为空），本版本是「同一份
  源码、正确的构建产物」；README 中英把测试数 `1022 / 57` 改成 `1081 / 60`，并在「已发布」一句后写明
  `v0.11.14` 不是发布版本、安装请固定 `v0.11.15`；`CHANGELOG.md` `## [0.11.15]` 双语；
  `package.json` / `package-lock.json` / 两份 README 的版本句与 pin / `docs/LOCAL-TESTING.md` 压缩包名
  随 `bump-version.py` 同步。
- **门禁（`CONFIRMED`）**：`npm run typecheck` exit 0；`npm run ci` exit 0 = **60 文件 / 1081 测试 PASS**、
  lint `Found 22 warnings and 0 errors`（`.rsi/evidence/round-015/pre-release-ci.txt`；发布脚本那次的
  `ci.txt` 由 ROUND 引用）。与 `v0.11.13` 基线 57 / 1022 相比 +3 文件 / +59 测试，无删除、无 skip。
- **发版**：`finish-round.py --round 15 --version 0.11.15 --resume` → 单次提交 → annotated tag `v0.11.15` →
  `push origin main` → `push origin v0.11.15`；未移动任何旧标签、未 force-push、未发布 npm。
- **未验证（`NOT_RUN`）**：npm 发布（未授权）；真机心跳投递（D-066，操作者动作）；主工作树里另一位写入者的
  客户端开关改动（不属于本轮，未提交、未审阅）。
- **落地（`CONFIRMED`）**：commit `50c0321`、annotated tag `v0.11.15`（object `e52a8f4`，peel
  `50c0321`），`origin/main` = 该提交；远端 CI run `44359410024` = success，Release run
  `44359422843` = success（16 步全绿，含 `Verify committed build artifacts` 与
  `Create GitHub Release`）；https://github.com/free6589/dsh-grok-workflow/releases/tag/v0.11.15
  带资产 `dsh-grok-workflow-0.11.15.tgz`（523743 B）并标为 Latest。`npm run verify:lib` 在
  `50c0321` 上报 `141 files, byte-identical`（`.rsi/evidence/round-015/ci-committed.txt`）。
  首次 push 因远端在运行期间前进（`3c24f92` / `09d5daa`）被拒；发布提交 rebase 为 `50c0321`，
  从未推送过的本地标签删除后在 rebase 提交上重建，再推。旧标签逐个未动。


## 2026-11-19 — RSI round 16：续跑开关 + 心跳刹车落地（未发版，`CONFIRMED`）

- **前提（`CONFIRMED`）**：`HEAD` = `37cb0fc` = `origin/main`；开工时树上 46 条 dirty 条目
  （round 14 之后另一位写入者的客户端开关、`src/loop-brakes.ts`、`scripts/verify-lib.mjs` 等），
  全部其它代理已 `inactive`、`src/` 最后修改停在 07:35:02，本轮在**静止的树**上工作。开工指纹
  （sha256 前 16 位）`src/loop.ts 55483a52622f0f46`、`src/loop-surface.ts 6543545e5e3f6310`、
  `src/loop-brakes.ts 34f56e7095abf6cd`、`src/client/index.js d290765594d62a3b`、
  `src/gate.ts 332d23134642460c`、`src/config.ts c4d053572df36194`，收工前重算未变。
- **做了什么（`CONFIRMED`）**：把「有开关、能提前停」这两件事从**未提交的实现**变成**落地的提交**：
  ① `CHANGELOG.md` 的 `[Unreleased]` 补两条 Added（dock 开关、心跳刹车，双语）；
  ② `DECISIONS.md` 新增 **D-072**（开关放哪儿、不带数字、停=拒绝+删行、六道刹车的输入是既有事实、
  token 是预算不是计量、失败轮=没写出助手消息），并把 D-069「现状」段与 D-071 的过时一句指向 D-072；
  ③ `README`（中英）与 `docs/LOCAL-TESTING.md` 的 dock 开关说明此前已由并发写入者写好，本轮只核对与
  代码一致；④ 本文件、`VALIDATION.md`、`HANDOFF.md`、`.rsi/ROUND.md`、`.rsi/STATE.md` 记本轮。
- **代码归属（不是本轮新写，是本轮核对并落地）**：`src/client/index.js` 的 `startLoopSwitch`
  （`:3730-3743`，id `grok-workflow-loop`、order 90、`slots.inject` + `slots.register` 追加注册）、
  `LoopSwitch` 组件（`:3665-3718`）、文案键（`:260-262` 等）、路径常量 `:3527`；
  `src/loop-brakes.ts` 六道刹车与 `plugin:grok-workflow/loop-round` 记录（`:210`）；
  `src/gate.ts:1535-1575` 的挂载与 `loop-stop` 处理；`src/config.ts:388-399` 四键边界与 `:792-795` clamp。
- **门禁（`CONFIRMED`，命令与结果见 `VALIDATION.md` Round 62）**：`npm run typecheck` exit 0；
  `npx oxlint src test` = 22 warnings / 0 errors（107 文件）；`npm run build` = `client bundle: 224412 bytes`，
  构建前后 `lib/` 145 个文件 md5 清单完全相同（幂等，diff 为空）；`npx vitest run` =
  **62 文件 / 1139 测试 PASS**（24.21s）。与 `v0.11.15` 的 60/1081 相比 +2 文件 / +58 测试，无删除、无 skip。
- **未验证（`NOT_RUN`）**：真实 Web GUI 里点一次那个开关、真实心跳投递一次（需要常驻 Host 与真实
  profile，且 D-066 把第一跳定为操作者动作）；本轮没有创建、修改或删除任何 Schedule 任务。

## 2026-11-19 — RSI round 19：载入期路由校验补上 `supervisor`（`CONFIRMED`）

- **缺陷（`CONFIRMED`，修前探针）**：`src/settings.ts` 的 `ROLE_ORDER` 只有四个角色，
  `validateRoutes` 漏掉 `roles.supervisor`。错误 provider / 未宣告模型在 supervisor 上
  载入通过，跑到那个任务核验之后才失败；README/ARCHITECTURE 当时都写「每个配置的
  路由都校验」。探针：四角色各 1 条 error，supervisor 0 条。
- **改动**：`ROLE_ORDER` 补 `supervisor`（与 `src/report.ts` `ROLE_NAMES` 同序，注释写明
  它同时供两个循环使用）；`test/config.spec.ts` 新用例（五角色 × 三种配置）；
  `test/route-concurrency.spec.ts` 补 supervisor 的空 cap 提示 2 条；README 中英、`ARCHITECTURE`、
  `DECISIONS` D-075、`VALIDATION` Round 64。
- **门禁（`CONFIRMED`）**：修前 `npm run ci` 63/1154 → 只 stash 源码时 2 failed / 49 passed
  → 恢复后 51 passed → 全量 `npm run ci` exit 0，**63 文件 / 1155 测试 PASS**，oxlint 22
  warnings / 0 errors，`npm run build` 两次产物一致（`client bundle: 224525 bytes`）。
- **未验证（`NOT_RUN`）**：在真实 profile 的 patch 里放错 supervisor 路由看装载被拒（操作者
  环境，本轮不碰）；真模型整轮。
- **迁移**：supervisor 链指向未注册 provider 的 profile 现在装载失败 → 改为已注册 provider /
  已宣告模型，或只把该路由的 `provider` 留空（视为继承 run 的 provider）；**不要**删整条
  链（空链 = 监督门不跑，`src/script.ts:1945`）。

## 2026-11-19 — RSI round 21：C1 跨 run 路由提示补上 `supervisor`；脏树清理与遗留文件归位（`CONFIRMED`）

- **缺陷（`CONFIRMED`）**：`src/run.ts` 的 `configRouteLabels()` 只摊平
  `planner/worker/verifier/synthesizer` 四个角色。有 `roles.supervisor` 链的 run，其
  supervisor 路由从不进入 C1 跨 run 忙闲快照，于是另一个 run 打满的 supervisor 通道对下一次
  run 不可见，不会先避让。这是 round 19（`settings.ts` `ROLE_ORDER`）、round 20（诊断台账）
  同一遗漏类的第三处。
- **改动**：`src/run.ts` 角色元组四改五（`planner, worker, verifier, supervisor,
  synthesizer`，即 `src/report.ts` `ROLE_NAMES` / `src/settings.ts` `ROLE_ORDER` 的顺序）；
  `test/route-concurrency.spec.ts` 新增五角色标签列表用例；`CHANGELOG.md` `[Unreleased]`
  双语 Fixed 一条；`lib/` 由 `npm run build` 重建。版本号未动（开发提交，不发版）。
- **红→绿（`CONFIRMED`）**：仅加用例时该文件 **1 failed / 14 passed**（实收缺
  `"sup/watcher"`，`.rsi/evidence/round-021/red-spec-run.txt`）；补上角色后 **15 passed**
  （`green-spec-run.txt`）。
- **门禁（`CONFIRMED`）**：`npm run typecheck` exit 0；`npm run ci` exit 0，**63 文件 /
  1157 测试 PASS**，oxlint 22 warnings / 0 errors；`npm run build` 连跑逐字节一致
  （`client bundle: 224525 bytes`）；`npm run verify:lib` = `lib/ at 3cd68eb is the build of
  src/ at 3cd68eb`（149 files byte-identical）。证据 `.rsi/evidence/round-021/`。
- **来源**：改动与红/绿证据由并发写入者在 17:04:54–17:05:02 留下、未提交；本次清理任务核实
  后落地为 `3cd68eb`（未 push、未打 tag、未建 Release）。
- **脏树与遗留文件处置（`CONFIRMED`）**：`M src/run.ts`、`M test/route-concurrency.spec.ts`、
  `M CHANGELOG.md`、`M lib/run.*`、`?? .rsi/evidence/round-021/` 全部有价值 → 已提交。
  根目录遗留的 `settings-simple-mock.html`（179 行，sha256 `3fe1e657…`，D-055 的设计输入）
  逐字节存到 `.rsi/archive/settings-simple-mock.html`，来源与还原命令见
  `.rsi/archive/README.md`，根目录副本已删除；`.rsi/` 不在 `package.json` `files` 内，不会随包发布。
  「允许未跟踪文件」白名单就此作废（原为 `settings-simple-mock.html`）。
- **未验证（`NOT_RUN`）**：两个真实并发 run 的避让行为（提示只在脚本侧降权）；GUI 观感。
- **受保护对象（`CONFIRMED`）**：`package.json`、`package-lock.json` 未改（sha256 与开工一致）；
  `CHANGELOG.md` 只增 `[Unreleased]` 段；`lib/` 只经 `npm run build` 重建；`.git` 与
  `v0.11.14`–`v0.11.19` 等已发布 tag 及其 peel 未动；无 force-push、无新 tag、不发布 npm。

## 2026-11-19 — `/grok on` 之后发不出消息：会话级 full 改走后台受理（`CONFIRMED`，未提交）

- **缺陷**：`/grok on` 写 `workflowMode: 'full'`（`src/command.ts:142`），`full` 是唯一
  绕过交互式受理的形态（`answerTeamInteractive` 只接 `triage`，`src/gate.ts:1281`），于是
  落到 `await produceAnswer(...)`（修前 `src/gate.ts:1458`，现 `:1550`）：`in-turn` 把整步
  开着等 workflow 跑完，而 `AgentLoop` 只在 step 结算后才 claim 下一批
  （`dsh-agent-loop/lib/index.js:683` `inbox.claim`，`turn()` 的 `while` 在 `:752`、`step` 在 `:780`），
  这段时间（默认 60 分钟，`src/config.ts:104`）用户发的消息全部只进队列、永不派发 ——
  用户原话「`/grok on` 就无法发消息，`/grok off` 就可以」。
- **修复**：`src/gate.ts` 新增 `answerFullBehind`（`:1386`，条件 `:1398` = 会话记录
  `workflowMode === 'full'` + 可后台交付）：先回执 `acceptedEnterText`（`src/answer.ts:182`）
  再后台 `runTeam` + `deliverAndRecord`；部署级默认 `mode:'full'` 保持 T4 `in-turn` 不变。
- **证据**：`test/grok-on-ingress.spec.ts`（5 例，修前 3 failed → 修后 5 passed；修前的数
  据由 `HEAD` worktree 独立复跑，见 `docs/knowledge/evidence/grok-on-ingress-2026-11-19/repro-before-head-worktree.log`）。
  `npm run ci` 两处跑绿：共享工作树 exit 0 = **67 文件 / 1218 测试**
  （24 warnings / 0 errors，`verify:lib` byte-identical，`shared-tree-ci-green.log`）；
  「`HEAD` + 只本修复」隔离树 exit 0 = 64 文件 / 1164 测试（`ci-isolated-fix-only.log`）。
  同日更早几次共享树是红的，红点全在并发写入者的半成品（设置页语法错、`test/client.spec.ts`
  的 `TS2304`、配置面 5 文件），与本修复无关。
- **未做**：真机 GUI 连发两条（`NOT_RUN`，本树有并发写入者，留给收尾组）；commit/push/发版未授权。

## 2026-11-20 — `/compact` 修复在「全新 DSH profile」里的端到端验收（`CONFIRMED`）

- **前提（`CONFIRMED`）**：`HEAD` = `366d169`（0.12.13）；本机 `dsh --version` = `0.2.2-rc.3`，
  Node 26.8.1。工作树里 `src/checkpoint/schema.ts`、`src/delivery/index.ts`、
  `test/delivery-human-block.spec.ts`、`CHANGELOG.md` 是并发写入者的未提交改动，本轮
  **没有**提交它们；测试在 `.tmp/verify-head`（`366d169` 的干净 worktree，`node_modules` 软链）
  里跑，避开这些半成品。
- **做了什么（`CONFIRMED`）**：新建 `compactfix-verify`（`sdk` 模板 + 一次性 `DSH_HOME`
  `.tmp/e2e-home`），`dsh plugin add` 把本检出装成 bundle 行；用
  `.rsi/evidence/compact-e2e/drive.mjs` 起一个本地 OpenAI-completions 桩模型（唯一 mock 边界），
  经 SDK 的 `session/query` 发一条团队档消息（真实 `agent/pre-step` 闸门 → 真实 workflow 引擎），
  再发真实 `/compact`。两次运行都 exit 0：`Compacted 7 history items (~6140 tokens).`，
  日志里 0 条越界 `assistant/message`。激活不是推断：`request/header.tools` 含
  `grok_workflow`，且出现 `tool-workflow/run-start|agent-start|agent-end`。
- **门禁（`CONFIRMED`）**：`npm run ci` 在 `366d169` 干净 worktree exit 0 —— typecheck 0、
  oxlint 24 warnings / 0 errors、`lib/ at 366d169 … (153 files, byte-identical)`、
  **70 文件 / 1269 测试 PASS**；`npx vitest run test/compact-step-pairing.spec.ts` 6 passed；
  `node scripts/repro-compact.mjs` exit 0（writer `refused`，`/compact` success）。
- **对照（`CONFIRMED`）**：pre-fix 构建（`39eda66`）的 `headless` profile 跑同一条消息，
  日志里留下越界行 `session-01125c86-…` seq 40、`session-d86b5415-…` seq 25
  （`source=workflow-notice`）——正是计量器拒绝的那一类；修复后的 fresh-profile 运行没有。
  修复构建的 `headless` 同形跑法同样 0 条越界行（`session-abeab5ac-…`，26 事件，
  `headless-after-journal.txt`）；该次没走到通知写入点，故「拒绝写入」本身仍由
  `test/compact-step-pairing.spec.ts` 证明。
- **未验证 / `BLOCKED`**：想用 SDK `session/resume` 把那条 pre-fix 日志直接喂给 `/compact`，
  被拒：`SessionFormatError: system/message requires a protected first surface head`
  （headless 会话格式与 SDK 读取器不兼容）。因此「命令层 before/after」仍以
  `scripts/repro-compact.mjs` 为准，不是 profile 重放。
- **边界**：修复只防新增越界行，**不修复**已经写坏的历史会话（无迁移，未声称有）；
  `grokDefault` 必须为 `on`，否则闸门 `pass: mode-off`（首次尝试即如此，工具已注册但消息没被接管）。

