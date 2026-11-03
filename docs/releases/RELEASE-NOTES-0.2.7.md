# Grok Workflow for DSH 0.2.7 — release notes

**Status: draft.** The `v0.2.7` tag and its GitHub Release are created by the release operator
**after** the final acceptance pass, following [the release guide](../RELEASING.md). The text the
release workflow publishes is the bilingual `## [0.2.7] - 2026-11-03` section of
[CHANGELOG.md](../../CHANGELOG.md), extracted verbatim.

## What this release is

`0.2.7` is a minor release (backward compatible with `0.2.6`):

- Per-route concurrency cap with overflow to the next route (PR #32): each route in a role's
  chain can carry an optional `maxInFlight` (1–64, blank = unlimited).
- First-message visibility fix (P0-5): the session's first user message is published to the
  transcript before the workflow runs, so it never disappears during the run.

`0.2.7` 是次版本（与 `0.2.6` 向后兼容）：

- 按路由并发上限，打满溢出到下一条（PR #32）：角色链里每条路由可配可选的 `maxInFlight`
  （1–64，留空=不限）。
- 首条消息可见性修复（P0-5）：会话第一条用户消息先写进会话再跑工作流，运行期间不再"消失"。

## Per-route concurrency, stated plainly

- Each route carries an optional `maxInFlight`: an integer 1–64, or blank which means
  unlimited. Set it in the settings page's third box per row or in the profile patch.
- While a capped route is full, a new call overflows to the next route in chain order
  instead of queueing on the full one; only when every route is full does the call wait
  for a drain.
- **Overflow is not failure and costs no retry attempt.** A full lane advances no fallback
  chain — it only yields to the next route. A content failure still retries in place on the
  same route; only a broken road switches routes.
- The trail records the yield separately (`skippedBusy` / `queuedMs`), and the report renders
  a `Route overflows …` line rather than `Route switches:`, so "used route B because route A
  was full" never reads as "route A failed".

- 每条路由可配可选的 `maxInFlight`：整数 1–64，留空表示不限。在设置页每行第三个框或
  profile patch 里填写。
- 某条路由打满时，新调用按链顺序溢出到下一条，而不是排队等它；只有所有路由都满才等待腾位。
- **打满让路不是失败，不消耗重试次数。** 打满不推进备用链，只是让到下一条。内容没做好仍在
  原路由原地重试；只有路不通才换路由。
- 让路在 trail 里单独记录（`skippedBusy` / `queuedMs`），报告里渲染为 `Route overflows …`
  行而非 `Route switches:`，"因为 A 满了所以用了 B"永远不会被读成"A 失败了"。

## First message no longer disappears

- With the default `in-turn` strategy the gate waited for the whole workflow before handing
  the claimed message back to the loop, and the loop is the only writer of `user/message`
  events — so the transcript held no message at all for the entire run: the GUI showed an
  empty turn with just the running/planning status, and a page reload lost what the user
  had typed.
- The claimed message is now published to the transcript before the wait (same id, same
  source, `rpcId` kept, exactly once), and the entered step carries only the report;
  thinking/planning stays a status indicator.

- 默认 `in-turn` 策略下，网关要等整个工作流跑完才把已认领的消息交回循环，而循环是
  `user/message` 事件的唯一写入者——于是整段运行期间会话里一条消息都没有：界面只剩
  「正在分析请求/规划中」状态，刷新页面后用户输入的内容彻底消失。
- 现在网关在等待之前就把原消息写进会话（同 id、同 source、保留 `rpcId`，且只写一份），
  进入的步骤只携带报告；思考/规划只作为状态显示。

## What did not change

- Config surface: only the per-row `maxInFlight` box is added; no key renamed or removed,
  other bounds and validation untouched.
- Execution: workflow script, gate scope, retry classes, budgets and verdict rules are
  unchanged apart from the two shipped items above.

- 配置面：只新增每行 `maxInFlight` 框；没有改名或删除任何键，其余上限与校验原样不动。
- 执行：除上面两项外，工作流脚本、闸门范围、重试类别、预算与判定规则原样不动。
