# Grok Workflow for DSH 0.5.0 — release notes

**Status: prepared** — `0.5.0` is a minor release (backward compatible with `0.4.0`):
cross-round context carry-over, an incremental memory archive, and recall-before-asking.
The text the release workflow publishes is the bilingual `## [0.5.0] - 2026-11-06` section of
[CHANGELOG.md](../../CHANGELOG.md), extracted verbatim.

## What this release is

- **Look it up before asking / 先回捞，后提问** — the front desk reads the conversation so far,
  earlier validated reports, and on-disk memory markdown before asking a clarification; a hit is
  answered by one worker with the material in the prompt, a miss asks once and names what is missing.
- **Cross-round context carry-over / 跨轮上下文延续** — every round compiles earlier rounds of the
  same session into one bounded digest (24 rounds / 12 000 chars) injected into all four role prompts.
- **Incremental memory archive / 随做随存的增量记忆归档** — round and agent results are appended
  at settlement to `$DSH_HOME/memory/grok-workflow/archive.jsonl`, readable later without the plugin.

`0.5.0` 是次版本（与 `0.4.0` 向后兼容）：提问前先读、跨轮上下文延续、随做随存的增量记忆归档。

- 提问前先读会话上文、已验证报告与磁盘记忆；命中即作答，未命中只问一次并指明缺什么。
- 每轮把前序轮次编译成有界 digest（24 轮 / 12000 字符）注入四个角色提示词。
- 轮次结算即追加归档到 `$DSH_HOME/memory/grok-workflow/archive.jsonl`，后续会话免插件可读。

## Compatibility

- First-round prompts are byte-identical to before; no new config keys; no new storage format for
  the digest; archiving is append-only and idempotent (617/617 tests pass, including 21 carry-over,
  28 recall and archive cases).
- 首轮提示词逐字节一致；无新增配置键；归档只追加、幂等（617/617 通过，含 21 个跨轮、28 个回捞与归档用例）。
