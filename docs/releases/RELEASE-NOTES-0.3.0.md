# Grok Workflow for DSH 0.3.0 — release notes

**Status: draft.** The `v0.3.0` tag and its GitHub Release are created by the release operator
**after** the final acceptance pass, following [the release guide](../RELEASING.md). The text the
release workflow publishes is the bilingual `## [0.3.0] - 2026-11-03` section of
[CHANGELOG.md](../../CHANGELOG.md), extracted verbatim.

## What this release is

`0.3.0` is a minor release (backward compatible with `0.2.7`): one behaviour change to configuration
validation plus the settings-page counterpart of that change.

- A synthesis/synthesizer mismatch no longer deactivates the plugin. Exactly two recoverable shapes
  are repaired at load with a warning that names the value actually in effect.
- The settings page blocks Save on the same two mismatches with a red bilingual error, so the repair
  is never silent and never permanent — the operator is told to confirm on the settings page.

`0.3.0` 是次版本（与 `0.2.7` 向后兼容）：一处配置校验行为变更，以及它在设置页上的对应处理。

- 合成/总结链配置不一致不再直接停用插件。只有两种"可恢复形状"在加载时被修复，并打出写明实际
  生效值的 warn 日志。
- 设置页对同样两种不一致红字拦 Save（中英双语），所以修复既不静默也不永久——页面会提示到设置页确认。

## The two repaired shapes, stated plainly

- Shape (a): a non-empty `roles.synthesizer` chain with `synthesis: deterministic`. Before this
  release that failed the load; now the chain wins — the effective value is `model`.
- Shape (b): `synthesis: model` with an empty `roles.synthesizer` chain. Before this release that
  failed the load; now the explicit mode wins — the effective value is `deterministic`.
- Each repair logs `… 已按 <mode> 生效，请在设置页确认` and keeps the tool, the gate and the settings
  page fully active. The one-line configuration signature carries `synthesis=<mode> (repaired)` so a
  repaired config is visible in the report rather than assumed.
- Nothing else became lenient. Unknown keys, unknown providers, models that are not in the live
  catalog, out-of-range numbers and malformed chains still fail hard (R-06 unchanged): a
  configuration that cannot be repaired is still refused at load instead of running half-wired.

- 形状 (a)：`roles.synthesizer` 链非空但 `synthesis: deterministic`。此前加载直接失败；现在以链为准，
  实际生效值是 `model`。
- 形状 (b)：`synthesis: model` 但 `roles.synthesizer` 链为空。此前加载直接失败；现在以显式模式为准，
  实际生效值是 `deterministic`。
- 每次修复都会打 `… 已按 <mode> 生效，请在设置页确认`，工具、门禁和设置页照常启用；一行配置签名
  带 `synthesis=<mode> (repaired)`，让"修复过的配置"在报告里可见，而不是靠假设。
- 其余校验没有放宽。未知键、未知 provider、不在运行时目录里的模型、越界数字、畸形链一律仍抛错
  （R-06 不动）：修不了的配置仍在加载时被拒绝，不会带着半截接线跑起来。

## Settings page

- `Save` is blocked while either mismatch is present, with a red bilingual message naming the field
  that has to change (`error.synthesisChainUnused` / `error.synthesisChainMissing`). The page never
  writes a repair behind the operator's back.
- 两种不一致存在时 `Save` 被拦下，红字双语提示指出需要改哪个字段
  （`error.synthesisChainUnused` / `error.synthesisChainMissing`）。页面不会背着操作者写入修复值。

## What did not change

- Config surface: no key added, renamed or removed. This release only changes what happens when two
  specific combinations appear.
- Execution: workflow script, gate scope, retry classes, budgets, routing and verdict rules are
  untouched.
- 配置面：没有新增、改名或删除任何键；本版只改变两种特定组合出现时的行为。
- 执行：工作流脚本、闸门范围、重试类别、预算、路由与判定规则原样不动。

## Verification boundary

- Unit coverage: `test/config-synthesis-fallback.spec.ts` (both shapes repaired, everything else
  still rejected), plus `test/client.spec.ts` for the Save gating; the full local suite is green on
  the release commit and again in the Release workflow.
- Real-machine evidence is **partial** and is stated as such: on an isolated instance
  (`DSH_HOME=/tmp/p1-verify-home`, `127.0.0.1:3297`) the bad-config instances stayed alive, but the
  boot warning line was not captured and `/api/settings/describe` plus the settings page returned
  `401` (the same known dead-end recorded in `docs/knowledge/VALIDATION.md` Round 16 item 8). The
  settings-page render and save-back of this change are `NOT_RUN` on a real GUI; the live `:3090`
  service was deliberately not touched (D-013).
- 单元覆盖：`test/config-synthesis-fallback.spec.ts`（两种形状被修复，其余仍被拒绝）以及
  `test/client.spec.ts` 的 Save 拦截；完整本地测试在发布提交上通过，Release 工作流中再次通过。
- 真机证据是**部分**的，如实记录：隔离实例（`DSH_HOME=/tmp/p1-verify-home`、`127.0.0.1:3297`）上
  配错配置的实例确实活着，但启动 warn 行未捕获，`/api/settings/describe` 与设置页均返回 `401`
  （与 `docs/knowledge/VALIDATION.md` Round 16 第 8 项同一个已知死胡同）。本改动在真 GUI 上的
  设置页渲染与回写为 `NOT_RUN`；在线 `:3090` 服务按要求未触碰（D-013）。
