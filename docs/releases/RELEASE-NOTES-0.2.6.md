# Grok Workflow for DSH 0.2.6 — release notes

**Status: draft.** The `v0.2.6` tag and its GitHub Release are created by the release operator
**after** the final acceptance pass, following [the release guide](../RELEASING.md). The text the
release workflow publishes is the bilingual `## [0.2.6] - 2026-11-02` section of
[CHANGELOG.md](../../CHANGELOG.md), extracted verbatim.

## What this release is

`0.2.6` is the **settings page visual polish** release: three live-screenshot passes over the
Settings → Plugins → `Grok workflow` page — info hierarchy and breathing (R1), alignment and
rhythm (R2), and detail finalization (R3). No config keys, bounds, validation or wiring
changed — styles, grouping order and copy only. Fully backward compatible with `0.2.5`.

`0.2.6` 是**设置页视觉打磨**版本：对设置 → 插件 → `Grok workflow` 页面做了三轮真机截图验证的
视觉打磨——信息层级与呼吸感（R1）、对齐与节奏（R2）、细节定稿（R3）。未动任何配置键、上限、
校验与接线，只改样式、分组顺序与文案。与 `0.2.5` 完全向后兼容。

## The three passes, stated plainly

- R1 info hierarchy and breathing: title ladder, hint styles, hairline row dividers, unified
  32px/8px controls, unit suffixes like ms/retries/turns, restyled status line, card-ified
  role chains with numbered badges, solid-blur sticky footer.
- R2 alignment and rhythm: two-column baselines, semantic green ON switch, disclosure
  markers, right-aligned revision.
- R3 details: dashed empty state, tinted error box, hover/focus/disabled states, 340px
  internal chain scroll, bilingual EN/ZH overflow checks.

- R1 信息层级与呼吸感：标题阶梯、hint 样式、行分隔线、统一 32px/8px 控件、ms/次/轮等单位后缀、
  状态行重塑、角色链卡片化+序号徽、实底毛玻璃吸底栏。
- R2 对齐与节奏：两列基线、语义绿 ON 开关、折叠箭头、修订号右对齐。
- R3 细节定稿：虚线空态、红底错误框、hover/focus/disabled 三态、链内 340px 滚动、
  中英双语溢出检查。

## What did not change

- Config surface: no key added, removed or renamed; bounds and validation untouched.
- Wiring: save path, provider→model dropdowns, switchOn checkboxes and status line logic
  are exactly what they were.
- Execution: the workflow script, gate, retries, budgets and reports are untouched.

- 配置面：没有增删改任何键；上限与校验原样不动。
- 接线：保存路径、通道→模型双下拉、switchOn 勾选框与状态行逻辑与原来完全一致。
- 执行：工作流脚本、闸门、重试、预算、报告原样不动。
