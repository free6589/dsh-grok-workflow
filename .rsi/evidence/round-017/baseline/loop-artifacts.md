# Round 17 · Loop 产物表

`HEAD` = `4db78f41f00416abe55baa1ec9403c4fa1a63379`。所有数字是 `grep -c` / `grep -n` / `wc` / `ls` 的
直接输出，不是从记忆抄的。

## 1. `callSchedule` 命中数：源码 vs 编译产物

| 产物 | 存在 | 字节 | 命中数 | 其中 | 命中行号 |
| --- | --- | --- | --- | --- | --- |
| `src/loop.ts` | 是（619 行） | — | **11** | 1 处定义 + **10** 处调用 | 定义 `:364`；调用 `:389 :397 :412 :420 :435 :441 :455 :464 :469 :480` |
| `lib/loop.js` | 是 | 23247 | **11** | 1 处定义 + **10** 处调用 | 定义 `:191`；调用 `:214 :223 :238 :247 :261 :269 :282 :291 :298 :311` |

- **数量一致（11 vs 11）**，且不是只对了个总数：两边的调用标签按同一顺序逐项对得上——
  `the task catalog` ×2 → `the task update` → `the task resume` → `the task creation`
  → `the task catalog` ×2 → `the task catalog` → `the task catalog` ×2 → `the task catalog`
  （最后一条在 `serialized()` 里包给 `deleteSessionHeartbeats`）。
  即 `lib/loop.js` 不是「数量碰巧相等」的旧产物，它是当前 `src/loop.ts` 的编译结果。

## 2. `lib/loop-brakes.js` 是否存在

| 产物 | 存在 | 字节 | 说明 |
| --- | --- | --- | --- |
| `src/loop-brakes.ts` | 是 | 442 行 | round 16 落地的六道刹车 |
| `lib/loop-brakes.js` | **是** | 14738 | 与 `src/loop-brakes.ts` 同名同层级 |
| `lib/loop-brakes.d.ts` | 是 | 12008 | 类型面 |
| `lib/loop-brakes.js.map` | 是 | 8435 | sourcemap |

`src/loop-brakes.ts` 的实际消费者是 `src/gate.ts:64-65`（`import { createLoopBrakes } from './loop-brakes.js'`
+ 类型导入），所以它必须被编进 `lib/`——它在了。

## 3. 产物是不是「当前源码编出来的」（stale-lib 风险，round 14 的事故点）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 工作树与 `HEAD` 的 blob 相同 | `git hash-object lib/loop.js lib/loop-brakes.js` vs `git rev-parse HEAD:lib/loop.js HEAD:lib/loop-brakes.js` | `lib/loop.js` 两边都是 `33f3cb3bdca160b30cf0e511c105b30cfbf12c22`；`lib/loop-brakes.js` 两边都是 `3adb6ccea4036b2ad624dc1343455930467688b8` → **相同** |
| 已跟踪文件有无未提交改动 | `git diff --stat HEAD -- lib/ src/` | 空 |
| 全量模块覆盖（递归） | 每个 `src/**/*.ts` 都要有对应 `lib/**/*.js` | **0 缺失**。`src` 侧 36 个 `.ts` + 1 个 `.js`（`src/client/index.js`，浏览器半边本来就写 JS）= 37 个源；`lib` 侧 37 个 `.js`，一一对应 |
| `lib/` 文件总数 | `find lib -type f \| wc -l` | **145**，与 `verify:lib` 报的「145 files」同数 |

`verify:lib` 我**没有自己跑**（它会重新构建 `lib/`，与「read-only except evidence」冲突）。同轮的
`ci` 片跑过，两次结果一致，原文：

```
.rsi/evidence/round-017/ci/ci.txt:lib/ at 4db78f4 is the build of src/ at 4db78f4 (145 files, byte-identical)
.rsi/evidence/round-017/ci/verify-lib.txt:lib/ at 4db78f4 is the build of src/ at 4db78f4 (145 files, byte-identical)
```

`ci` 片还跑了两次 `npm run build` 验证幂等：`lib-idempotence-diff.txt` 与
`lib-idempotence-diff-build2.txt` 都是 `DIFF-EXIT=0`。

**判定**：`v0.11.14` 那种「树在动、`lib/` 落后」的条件在本基线**不成立**——tracked 0 改动、
`lib/` 与 `HEAD` 逐 blob 相同、全量 `verify:lib` 字节相同。这是别人的命令，作为交叉引用记录，
本轮自己的证据只有上表前三行的读操作。

## 4. 与本轮风险清单的对应

| 风险 | 本基线状态 |
| --- | --- |
| `v0.11.14` stale-lib 事故 | 当前树不复现：`lib/` = `src/` 的构建，145 文件字节相同 |
| `host_loop_service` 曾 fail | 记忆侧已由 A27 收口（`RESEARCH.md:879-970`）；代码侧 `src/loop.ts:505` `ctx.get?.('schedule')` 是唯一的服务取用点，取不到时走「no scheduler」分支 |
| `src/index.ts:292` 注释两半 | 在生产代码里，只登记不改（见 `memory-vs-code.md` §二） |

## 5. attempt 2 复核：重建之后仍然相同

`ci` 片在 08:46–08:48 跑了 `npm run ci`（链内含 `npm run build`），因此 `lib/loop.js`、
`lib/loop-brakes.js` 的 mtime 变成 `Nov 19 08:47`。重建之后再测：

| 检查 | 结果 |
| --- | --- |
| `git hash-object lib/loop.js lib/loop-brakes.js` | `33f3cb3bdca160b30cf0e511c105b30cfbf12c22` / `3adb6ccea4036b2ad624dc1343455930467688b8` |
| `git rev-parse HEAD:lib/loop.js HEAD:lib/loop-brakes.js` | 同上两组 |
| `grep -c callSchedule src/loop.ts lib/loop.js` | `11` / `11` |
| `ls -l lib/loop.js lib/loop-brakes.js` | 23247 B / 14738 B（与 attempt 1 相同） |

即：这两个产物**被真实重建过一次**，字节没有变化。`v0.11.14` 那种「`src` 改了、`lib` 没跟上」
的条件在基线上仍不成立；同时这也排除了「mtime 新 = 内容新」的误读——mtime 变是因为别人跑了构建，
内容不是新的。
