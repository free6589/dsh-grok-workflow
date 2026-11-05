# Grok Workflow for DSH 0.4.0 — release notes

**Status: prepared** — `0.4.0` is a minor release (backward compatible with `0.3.0`):
history-aware follow-up triage, an opt-in hybrid classifier, and team-tier instant
receipt with a deterministic plain-language lead-in. The text the release workflow
publishes is the bilingual `## [0.4.0] - 2026-11-06` section of
[CHANGELOG.md](../../CHANGELOG.md), extracted verbatim.

## What this release is

- Follow-up fragments ("说人话", "继续", "详细点" …) with conversation history now route
  `fast/followup` instead of the greeting template; a first message without history asks
  instead of answering from the template. Disable with `triageFollowupAsFast: false`.
- `triageClassifier: rules` (default) keeps pure string rules byte-for-byte; `hybrid` adds
  one model call only for unclear cases (`ask`/`ambiguous-escalate`, or `chat` with history),
  falling back to the rules verdict on any failure.
- The team tier posts its tier line immediately (`instantReceipt`, default on) and prepends
  a deterministic `【人话结论】 verified/total` lead-in before the machine report
  (`humanSummary`, default on). Both are pure additions with zero extra model calls.

`0.4.0` 是次版本（与 `0.3.0` 向后兼容）：追问可接上文、可选混合分诊、团队档即时回执与确定性人话导读。

- 有上文时"说人话/继续/详细点"走快手档（`fast/followup`），不再回寒暄模板；首条无上文时改为追问确认。可用 `triageFollowupAsFast: false` 关闭。
- 默认 `rules` 纯规则零行为变化；`hybrid` 仅在拿不准时多花一次模型调用，失败回退规则结果。
- 团队档先回档位行（`instantReceipt` 默认开），报告前加确定性 `【人话结论】` 导读（`humanSummary` 默认开）。两者零额外模型调用。

## Compatibility

- Default path is behavior-preserving: `triageClassifier` defaults to `rules`,
  `triageFollowupAsFast` only changes messages that previously hit the greeting template,
  and the summary lead-in is a deterministic header with no extra engine calls
  (545/545 tests pass, including the 5 new follow-up cases).
- Four new volatile config keys (`triageClassifier`, `triageFollowupAsFast`,
  `instantReceipt`, `humanSummary`) appear in the settings page (zh/en) and the
  `27`-field projection assertions.

- 默认路径保持兼容：`triageClassifier` 默认 `rules`，追问快捷键只改变原来掉进寒暄模板的消息，
  人话导读是确定性拼接、无额外调用（545/545 通过，含 5 个新增追问用例）。
- 4 个新 volatile 配置键进设置页（中英）与 `27` 字段投影断言。
