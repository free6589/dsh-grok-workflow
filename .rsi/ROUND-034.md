# Round 34 — 双重转义的折行 base64 块整块落进报告

Round report for RSI round 34. This file mirrors the `## Round 34` section of
`.rsi/ROUND.md` (which is the canonical record and the one `heartbeat-guard.sh` parses);
it exists so the round is also addressable by number. Keep the two in step.

## Round 34 — 2026-11-20 — 双重转义的折行 base64 块整块落进报告（`CONFIRMED`，patch `0.12.9`）

- **轮次归属（`CONFIRMED`）**：本 attempt 接手时 **round 33 已落地并已发版**——HEAD 为 `06651e0`，
  `v0.12.8` 指向 `9f91684`，远端 CI `44670766356` 与 Release `44670771402` 均 success，工作树里
  没有 round 33 的未完成项。工作树里留着的是一份**未提交的 round 34 改动集**（`src/redact.ts`、
  `test/redact.spec.ts`、重建的 `lib/redact.*`、CHANGELOG `[0.12.9]`、版本号 `0.12.9`、
  `ROUND.md`/`POOL.md`/`LOG.md`/`STATE.md` 的 round 34 段落、`.rsi/evidence/round-034/`），
  它由上一个 attempt 在被中断前写入。在该树上 `npm run ci` 是**红的**，唯一失败是 round 33 新增的
  账本不变式：`ROUND.md` 已写 round 34 而 `ledger.jsonl` 没有第 34 行
  （`ci-before-ledger-row.txt`：`expected [ 2, …, 33 ] to include 34`）。
  丢弃这份已验证的改动会销毁工作；把它留在工作树里会让门禁读到 `dirty_tracked`（且
  `round_max=34 > ledger_max=33`）而停摆。因此本 attempt 的任务是**独立复核这份改动、补齐收尾
  记录、按发布流程落地**。**代码改动本身不是本 attempt 写的**；本 attempt 的产出是复核、收尾与发布。
- **选题（R2）**：`POOL.md` 池顶 `P ·` 项——窄折行 base64 块的残留。先实测再定界：HEAD 上**真换行**
  折行 1–24 列**已全部脱敏**（round 33 的容忍断行标记已覆盖），池里「≤7 列留存」是基于修前旧码的
  过时描述，直接把下限压到 1 会吃掉散文（round 33 `A37` 已实测）。活着的缺口是**双重转义**：
  一条已经带字面 `\n` 的日志行再被包进另一层 JSON `stringify`，每个反斜杠加倍成 `\\n`，
  `BASE64_BREAK` 的单反斜杠分支匹配不上，整块编码原文落进报告。
- **决策（D-089）**：仍走纯正则，不引入解码复核（延续 `D-088`）：`BASE64_BREAK` 增加第三个分支
  匹配**双反斜杠 + n**，而不是放宽成「任意反斜杠」。理由是放宽会吞掉正常转义文本，而三层及以上
  转义没有实测形状，留作池内残留。`REDACTION_RULES` 被 `src/script.ts` 按 `pattern.source` +
  `replacement` 镜像，报告边界与复查/重试提示词继续同源，无分叉。
- **改动**：`src/redact.ts`（`BASE64_BREAK` 加双反斜杠分支 + 注释说明两层覆盖与三层不跟的原因）；
  `test/redact.spec.ts` +1 用例（24 列折行 + 双重 `stringify`，断言出现占位符、无 `LS0tLS1CRUdJTi`
  残留、无 20+ 字符 base64 片段）；`lib/redact.*` 随 `src/` 重建。
- **红绿（`CONFIRMED`，本 attempt 独立实跑）**：把 `src/redact.ts` 换回 `HEAD` 版本（`git show
  HEAD:src/redact.ts`）后跑新用例 = **1 failed**，输出里留着 `nIEtFWS0tLS0tCk1NTU1NTU1N` 这类
  20+ 字符片段（`.rsi/evidence/round-034/red.txt`），源码随后原样还原；修后
  `npx vitest run test/redact.spec.ts` = **41 passed**（基线 40，`green-spec.txt`）。
  `npm run ci` exit 0 = **68 文件 / 1232 测试 PASS**（基线 68/1231，+1，无既有断言被放宽），
  typecheck 0 错，oxlint 24 warnings / 0 errors，`verify:lib` 153 files byte-identical。
- **过脱敏与性能（`CONFIRMED`，本 attempt 实测，探针入库）**：`reach-probe.mjs` 对折行 PGP 公钥与
  折行证书各跑三种断行（真换行 / `\n` / `\\n`），六种组合**全部不脱敏**；带 `\\n` 的散文原样返回；
  私钥块三种断行全部整块脱敏且 JSON 仍可解析。`perf-probe.mjs` 在同一台机器上对 `HEAD` 的
  `lib/redact.js` 与当前 `lib/redact.js` 做 A/B：174,000 B 散文 **9.14 ms → 9.08 ms（×0.99）**，
  42,039 B 对抗输入 2.48 ms——新增分支未带来可测的耗时变化（与 round 33 从 1.23 ms 升到 7.86 ms
  那次的量级不同）。
- **记录层（`CONFIRMED`）**：`.rsi/ledger.jsonl` 补第 34 行（`commit` = 代码提交 `5d3bcea`，
  `tag` = `v0.12.9`，CI/Release 号在发布回填提交里写实）。round 33 新增的
  `test/rsi-ledger.spec.ts` 正是让「`ROUND.md` 记了轮次而账本没记」变红的那条用例，本轮它先红后绿。
  **异常记录**：本 attempt 开始时该行不存在，12:14:44 工作树里出现了一行 `commit`/`tag` 为空、
  ci 字段未经核对的 round 34 记录（非本 attempt 所写，无对应进程可归因）；已按实测值重写该行，
  未采信其未经核对的 ci 断言。
- **证据**：`.rsi/evidence/round-034/`（`red.txt`、`green-spec.txt`、`perf.txt`、`perf-probe.mjs`、
  `reach.txt`、`reach-probe.mjs`、`ci.txt`（上一 attempt 的绿跑，0.12.8 时代）、
  `ci-before-ledger-row.txt`（上一 attempt 中断前的红跑）、本 attempt 的 `ci-*.txt`、`verify-lib.txt`）。
- **未验证（`NOT_RUN`）**：真机 GUI 手点；真实定时投递（操作方动作，D-066）；三层及以上转义。
- **建议版本**：patch → `0.12.9`（安全修复，行为向后兼容；CHANGELOG 记 Fixed 双语）。
- **status:** OK
