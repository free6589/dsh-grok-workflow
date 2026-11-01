# Grok Workflow for DSH 0.2.5 — release notes

**Status: draft.** The `v0.2.5` tag and its GitHub Release are created by the release operator
**after** the final acceptance pass, following [the release guide](../RELEASING.md). The text the
release workflow publishes is the bilingual `## [0.2.5] - 2026-11-01` section of
[CHANGELOG.md](../../CHANGELOG.md), extracted verbatim.

## What this release is

`0.2.5` is the **novice settings page** release: the Settings → Plugins → `Grok workflow`
page now speaks one language at a time — exactly the language DSH is set to — with plain
words instead of field keys and jargon. History, concurrency, retry, task and timeout
bounds are relaxed for long jobs, and every role chain holds up to 50 backup routes.

`0.2.5` 是**新手设置页**版本：设置 → 插件 → `Grok workflow` 页面一次只说一种语言——严格
跟随 DSH 的语言设置，用人话代替字段键与黑话。历史、并发、重试、任务与超时上限为长任务
放宽，每条角色链最多可放 50 条备用路由。

## The page, stated plainly

- One language only: every visible string comes from the active locale. No raw field keys
  (they survive only as `data-field` DOM attributes), no mixed bilingual lines.
- A live one-line status under the intro follows the current draft: off → plain chat,
  on + triage → smart triage, on + full → full team. It is never saved.
- Controls are grouped into Mode / Who does it / Limits / More (collapsed by default) /
  Advanced — leave alone / Status (read-only). Role names are plain words
  (Planner / Executor / Checker / Summarizer in the user's language).
- Role chains and the triage model use provider→model dropdowns fed by the runtime's
  declared models, falling back to free text when the runtime exposes no catalog.
  Leaving a chain blank still means "use the model you are already talking to".
- `switchOn` is seven checkboxes with plain names; all checked is the built-in rule.
  A long chain plus high retries shows a heads-up above the save button, never a block.

- 只说一种语言：所有可见文案都来自当前语言。没有 raw 字段键（只留在 `data-field`
  DOM 属性里），没有中英混排。
- 页头有一句跟随当前草稿的实时状态：关着 → 普通聊天，开着 + 分诊 → 智能分诊，
  开着 + 全员 → 全员出动。只展示，不保存。
- 控件按"模式 / 谁来干 / 上限 / 其他（默认折叠）/ 高级（别碰）/ 运行状态（只读）"分组。
  角色名是人话（规划 / 执行 / 检查 / 总结）。
- 角色链与分诊模型用"通道→模型"双下拉，目录来自运行时已声明的模型；读不到就回退手写框。
  留空仍表示"用跟你对话的模型"。
- `switchOn` 是七个有人话名字的勾选框，全勾就是内置行为。长链 + 高重试只在保存按钮
  上方提醒一句，不拦保存。

## Bounds, stated plainly

`historyTurns` 0–1000000 (default `12`), `historyChars` 0–1000000 (default `20000`),
`maxConcurrency` 1–1000000 (default `4`), `maxRetries` 0–10 (default `2`), `maxTasks`
1–100 (default `12`), `timeoutMs` up to 7 days (default still 60 minutes), each role
chain up to `50` backup routes (was 3). The generated script's defensive clamps mirror
the backend limits and a test pins them equal. Data and validation logic are unchanged:
field keys, value shapes, `{key, params}` error findings and the save path ops are
exactly what they were.

`historyTurns` 0–1000000（默认 `12`）、`historyChars` 0–1000000（默认 `20000`）、
`maxConcurrency` 1–1000000（默认 `4`）、`maxRetries` 0–10（默认 `2`）、`maxTasks` 1–100
（默认 `12`）、`timeoutMs` 最长 7 天（默认仍 60 分钟）、每条角色链最多 `50` 条备用路由
（原来 3 条）。生成脚本里的兜底值与后端上限对齐，并有测试钉死两者一致。数据与校验逻辑
不动：字段键、存值形态、`{key, params}` 错误结构、保存的 path ops 与原来完全一致。

## What did not change

- Config surface: no key added, removed or renamed; stored values stay English.
- Validation: same checks, same params; only the rendered prose is plainer.
- Execution: the workflow script, gate, retries, budgets and reports are untouched
  except the widened clamps.

- 配置面：没有增删改任何键；存值保持英文。
- 校验：同样的检查、同样的参数；变的只是渲染出来的人话。
- 执行：工作流脚本、闸门、重试、预算、报告除放宽兜底外原样不动。
