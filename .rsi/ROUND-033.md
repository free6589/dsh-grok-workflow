# Round 33 — 手工折行的 base64 私钥整块落进报告

Round report for RSI round 33. This file mirrors the `## Round 33` section of
`.rsi/ROUND.md` (which is the canonical record and the one `heartbeat-guard.sh` parses);
it exists so the round is also addressable by number. Keep the two in step.

## Round 33 — 2026-11-20 — 手工折行的 base64 私钥整块落进报告（`CONFIRMED`，patch `0.12.8`）

- **门禁（R1）**：`heartbeat-guard.sh --round 33 --record` 首跑给出
  `SKIP code=round-without-ledger next_round=33 round_max=32 ledger_max=25`。按 PROTOCOL §3，
  `SKIP` 表示上一轮未闭合、不得在其上再开一轮；但实查第 32 轮**已闭合**（`ROUND.md` 收尾段带
  `status: OK`、`report_open=0`、树干净、无 `.rsi/STOP`），所以这是账本滞后造成的**假**未闭合信号：
  `.rsi/ledger.jsonl` 停在 round 25，而 `ROUND.md`/`LOG.md`/`STATE.md` 已记到 32。门禁停留在
  `SKIP` 上三轮就会升级为 `stall-unclosed` 的 **STOP**，也就是整条无人值守循环会在没有任何测试变红
  的情况下停摆。记录层修复因此是本轮开门的前置动作（不是第二个主题）：补 6 行（27–32，每行
  的 commit / tag / CI / Release 均取自 `ROUND.md`、`LOG.md`、`git log` 与已提交证据），并新增
  `test/rsi-ledger.spec.ts` 把门禁读的那条不变式钉住。修后门禁码变为 `dirty-tracked`（本轮自己的
  改动），即门禁恢复正常。
- **选题（R2）**：`POOL.md` 池顶红脱敏项——base64 块**折行窄于 24 列时完全不脱敏**。原因是标记是
  一段连续的 20 字符字面量：任何窄于它的折行都把标记自身拆到两行，续行规则还要求每行 ≥16 字符。
  round 30 量到 8/12/16/19/20/21/22/23 列全部整块留存、24 列才第一次生效；池里写明修法需要
  「容忍自身被断开的标记」或「解码后再查」，属需要自己决策的一项。
- **决策（D-088）**：选**容忍断行的标记**，不选解码复核。理由：`REDACTION_RULES` 会被
  `src/script.ts` 按 `pattern.source` + `replacement` 原样镜像进生成的 workflow 脚本，纯正则的
  同一份声明能同时保护报告边界与复查/重试提示词；解码复核无法被这样镜像，会引入两套实现。
  标记的 9 条窗口改由 `BASE64_PRIVATE_KEY_WINDOWS` 生成，字符之间允许一个断行——真实换行，
  或 JSON 字符串里的 `\n` 转义（`BASE64_BREAK`）；续行下限从 16 降到 **8**（`w >= 8` 的折行每行
  正好不少于 8 字符），并用 `BASE64_BLOB_END` 要求续行后必须是行边界/引号/输入结束，否则散文里的
  下一个单词会被当成一行折行吃掉。
- **改动**：`src/redact.ts`（窗口生成 + `foldable()` + `BASE64_BREAK`/`BASE64_BLOB_END`，续行 16→8
  且按行边界锚定）；`test/redact.spec.ts` +3 用例（8/12/16/19/20/21/22/23 列 × PEM/PGP 折行、
  JSON 字段里的折行块、折行公钥与证书的不过度匹配）；`test/rsi-ledger.spec.ts` 新增（5 用例）；
  `.rsi/ledger.jsonl` 补 27–32 六行。
- **红绿（`CONFIRMED`，本树实跑）**：旧码 `npx vitest run test/redact.spec.ts` = **2 failed / 38
  passed**（折行用例与 JSON 用例留整块原文）；新码 **40 passed**。账本用例对旧账本 = **1 failed**
  （`expected [2,3,…,25] to include 32`），补行后 **5 passed**。`npm run ci` exit 0 =
  **68 文件 / 1231 测试 PASS**（基线 67/1223：+1 文件、+8 用例，无既有断言被放宽），
  typecheck 0 错，oxlint 24 warnings / 0 errors。
- **度量（`CONFIRMED`）**：折行 8/12/16/19/20/21/22/23 列，PEM 与 PGP 两种 armor 都整块脱敏；
  折行**≤7 列**仍留原样，并入池（该宽度下续行与散文单词不可区分）。性能：同一条规则在 116 KB
  散文上旧码 1.23 ms → 新码 7.86 ms（`perf.txt`；整份 `redactSecrets` 在该输入上 43 ms，
  报告体量远小于此）。
- **证据**：`.rsi/evidence/round-033/`（`red.txt`、`red-ledger.txt`、`ci-1.txt`、`ci-2.txt`、`perf.txt`）。
- **未验证（`NOT_RUN`）**：真实定时投递与 GUI 手点（操作方动作，D-066）；折行 ≤7 列的块；除
  JSON `\n` 转义与真实换行之外的其它转义形态。
- **建议版本**：patch → `0.12.8`（安全修复，行为向后兼容；CHANGELOG 记 Fixed 双语）。
- **status:** OK
