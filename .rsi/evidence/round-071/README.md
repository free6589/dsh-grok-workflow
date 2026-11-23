# round-071 证据：队长三件套（`captain-pack`，自 main `cda5d4e`）

任务口径：只做三件（拆排交给模型 / 前台确认拆法 / 三叠纸记忆），门卫、检查、台账不动；不提交、不推送。

## 红 / 绿（每件一条，均由同一命令在"临时关掉新行为"与"还原"两种状态下跑出）

| 件 | 临时改动（仅取证用，已还原） | 旧码 | 新码 | 文件 |
| --- | --- | --- | --- | --- |
| A 拆排/停 | `runWaves(..., plan.onFailure === 'stop')` → `false` | FAIL exit 1 | PASS exit 0 | `red-cutA-stop.txt` / `green-cutA-stop.txt` |
| B 前台确认 | 两处确认分支 `if (…)` → `if (false)` | 5 failed / 1 passed, exit 1 | 6 passed, exit 0 | `red-cutB-confirm.txt` / `green-cutB-confirm.txt` |
| C 三叠纸 | `captainBrief()` 恒返 `''` | 2 failed / 14 passed, exit 1 | 16 passed, exit 0 | `red-cutC-memory.txt` / `green-cutC-memory.txt` |

还原后四个源文件与备份逐字节相同（`cmp` 通过后才删除备份）。

## 门禁

- `npm run build` → exit 0（`build.txt`；client bundle 303813 bytes）。
- `npm run ci` → exit 0，**90 文件 / 1678 测试 PASS**（`ci.txt`；基线为 87 / 1656）。

注意：`npm run verify:lib` 用 `git archive HEAD` 在工作树之外构建 HEAD 的 src/lib 对，
**不覆盖未提交的工作树**；合并时须把 `lib/`（含新增 `lib/captain*.js`）与 `src/` 一起提交。

## 未执行

- 真机隔离 soak：`NOT_RUN`（本轮只要求 build + ci，且不发布）。
- 真实操作员对确认轮手感的人工判断：`NOT_RUN`（只能由操作员本人做）。

## lib 与 src 的一致性（因 `verify:lib` 不覆盖未提交树）

`verify:lib` 用 `git archive HEAD` 在临时目录构建 **HEAD** 的 src/lib 对，未提交的工作树不在其判定范围。
因此另做了一次独立核对：先对 `lib/script.js`、`lib/gate.js`、`lib/captain.js`、`lib/captain-memory.js`
取 sha256，再执行 `npm run build`，四个哈希全部 `OK`（`sha256sum -c` 通过）——
即工作树的 `lib/` 就是工作树 `src/` 的构建产物，重复构建逐字节稳定。
