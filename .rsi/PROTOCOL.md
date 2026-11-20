# RSI 协议（每一轮、每个任务开始前都必须先读完本文件）

## 目标
无人值守地迭代 dsh-grok-workflow 的一切：bug、功能增删、测试、文档、UI 显示与交互。
已授权：修改代码、增加或删减功能、重构、改文案。没有人会中途回复，不确定时按本协议自行判断并写日志，不要提问。

## 一轮只做一个主题
1. 读 AGENTS.md、docs/RELEASING.md、docs/LOCAL-TESTING.md、CHANGELOG.md、.rsi/STATE.md、.rsi/LOG.md 末尾。
2. 评估并更新待办池（价值/风险/大小），按优先级选且只选一个主题：
   P0 功能错误 > 文档与版本不一致 > 测试与可靠性缺口 > UX 显示与交互 > 新功能 > 删减/重构。
3. 实施：只改与本主题相关的内容。
   新功能要有测试、文档和 CHANGELOG；删减功能要写明原因、迁移说明，中英文 README 同步，并标注 Removed/Breaking。
4. 自测：npm run ci 全绿；每处改动有"改前失败、改后通过"的测试；
   按 docs/LOCAL-TESTING.md 在独立开发 profile（grok-workflow-dev）里真实发消息实测，保存输出作为证据；
   回归 /grok 开关、full 模式、team 档完整跑一次。
5. 写 .rsi/ROUND.md（本轮报告）：主题、改动文件、证据位置、未验证项、建议版本号（patch 或 minor）。
6. 不要自行提交、不要打 tag。发布由外部脚本在检查通过后执行。

## 红线
- 不得削弱验证：不删测试、不放宽断言、不跳过测试、不改 CI 使其更容易通过。
  测试数只增不减；被测行为被有意删除时才可同步删对应测试，并在 ROUND.md 说明。
- 不得伪造真实环境测试结果。测不了的写成"未验证"。
- 只使用 grok-workflow-dev profile；不碰其他 profile、运行中的实例、本机其他项目；
  不修改 cordis.patch.yml、LICENSE、.github/ 下的发布与 CI 保护逻辑。
  文档中标明"需要操作者授权"的步骤一律跳过并记录。
- 不写入任何密钥或个人信息；不新增运行时依赖（除非有充分理由写进 ROUND.md）；不加联网上报或自动更新。
- 不放宽安全边界：不绕过 DSH 审批、沙箱、工具策略；子代理不得递归调用 grok_workflow。
- 不得为凑数做无意义改动（只改格式、反复换措辞、无意义重命名）。
- 不得升 major 版本，不发布 1.0.0。

## 记录
- .rsi/STATE.md（覆盖更新，100 行内）：当前版本、已完成主题、待办池、失败记录、连续失败轮数、连续无价值轮数。
- .rsi/LOG.md（只追加）：每轮一条，含时间、主题、结果、证据位置、给下一轮的建议。旧条目超过 10 轮时折叠成摘要。
- .rsi/HEARTBEAT.md（心跳轮的入口）：定时任务投递的那条 prompt 模板 + 守护契约。
  心跳轮次第 0 步先跑 `.rsi/tools/heartbeat-guard.sh --round <N> --record`，按它的
  `RESUME`/`SKIP`/`STOP` 决定开不开本轮；`SKIP` 表示上一轮未闭合，不得在其上再开一轮。

## 预算与心跳（1000 轮，一次上弦）
- 总量 1000 轮，数字与规则在 `.rsi/harness.json` + `.rsi/HARNESS.md`；一轮 = 一次定时投递，
  一次投递只做一轮，进程里没有数到 1000 的循环。
- 心跳行是一条 `RRULE`，`INTERVAL=60`、有限 `COUNT`。默认 `shape: single`：这一行的 `COUNT`
  就是**剩余全部轮数**，所以走完 1000 轮只需要**一次**上弦动作，之后不再需要任何人介入
  （D-093）。`chain`（每臂 ≤100 轮，上一臂跑完再上下一臂）留给愿意让每一行都落在插件开关
  宽度内的人，代价是每臂一次上弦。
- 上弦只有一次动作：`node .rsi/tools/iterate-plan.mjs --arm-spec` 打印槽名、`rrule` 与
  `.rsi/HEARTBEAT-PROMPT.md` 的字符数（对 4000 上限）；用 `schedule_*` 或插件开关落地后，
  用 `--verify-row` 复核 `COUNT - 已投递` 是否仍覆盖剩余轮数（`0` ARMED / `21` NOT_ARMED /
  `22` 读不到宿主存储）。本轮不得自己上弦、不得嵌套 workflow（D-066、D-092、D-093）。
- 门禁：`.rsi/tools/heartbeat-guard.sh --round auto --max-rounds 1000 --record`；
  `--round auto` 按记录自算轮次（`ROUND.md` 与 `ledger.jsonl` 取高者 +1），所以一个常量 prompt
  就能开完整个预算的每一轮。
  `round-cap` / `budget-exhausted` 表示预算用尽，`blocked-streak` / `stall-unclosed` / `stop-file` /
  `protocol-stop` 各自由谁清除，见 `.rsi/HARNESS.md` 的停止规则表。
- 预算用尽不是失败：池里没有高于风险的主题时按本轮停止条件收尾，不为了用满 1000 而凑数。

## 本轮应停止的情况（写入 ROUND.md 的 status 字段）
- status: STOP 当：待办池里没有价值高于风险的主题；连续失败 2 轮；发现自己违反了红线。
- 否则 status: OK。

## 首轮
只做基线：npm ci && npm run ci；核对版本与文档不一致
（README 里一处写当前版本 0.8.0，另一处写 0.10.0 起 enforceGate 已移除，需核实并修正）；
读 GitHub 上 3 个未关闭 Issue；建立初始待办池。首轮不新增功能。
