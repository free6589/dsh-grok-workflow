# Grok Workflow for DSH 0.2.4 — release notes

**Status: draft.** The `v0.2.4` tag and its GitHub Release are created by the release operator
**after** the final acceptance pass, following [the release guide](../RELEASING.md). The text the
release workflow publishes is the bilingual `## [0.2.4] - 2026-11-01` section of
[CHANGELOG.md](../../CHANGELOG.md), extracted verbatim.

## What this release is

`0.2.4` is the **opt-in** release: the workflow no longer hijacks every message. A session starts
as plain chat and only runs the plan→execute→verify→report workflow after you turn it on with
`/grok` for that session (PR #27). Default is **off** (`grokDefault: 'off'`).

On top of the switch: the progress panel groups by task instead of by role (PR #24), the
workflow objective limit is 32,000 characters (PR #25), the planner-failure fallback is sharded
instead of dropped (PR #26), and the Issue #22 Phase 1 dialogue-reliability fixes ship in this
version (PR #23, reviewed).

`0.2.4` 是**选择加入**版本：工作流不再拦截每条消息。会话默认是普通聊天，用 `/grok`
为该会话显式开启后才走 规划→执行→验证→汇报 的完整流程（PR #27）。默认**关**
（`grokDefault: 'off'`）。

开关之外：进度面板改为按任务分组（PR #24）、工作流目标上限提到 32,000 字符（PR #25）、
规划失败回退改为分片不再丢弃（PR #26）、Issue #22 Phase 1 对话可靠性修复随本版发布
（PR #23，已审查）。

## The default-behaviour change, stated plainly

A fresh install of `0.2.4` does **not** run the workflow for every message. Sessions start as
plain chat until `/grok` turns the workflow on for that session; `/grok off` turns it back off.
The toggle is per-session, durable across restart / resume / fork, and recorded in the session
log. `/grok` appears in interactive UIs (Web / CLI); headless and ACP surfaces have no command
menu and follow `grokDefault`.

Deployments that want the previous always-on posture set `grokDefault: 'on'`. A config-level
`grokDefault: 'on'` still respects `mode`, so a deployment can choose triage; an explicit
`/grok` records `workflowMode: 'full'` on the session and the gate honours it even under
`mode: triage`.

新装 `0.2.4` **不会**对每条消息跑工作流。会话默认是普通聊天，用 `/grok`
为该会话显式开启，`/grok off` 关回。开关按会话、挺过重启 / 恢复 /
分身、记在会话日志里。`/grok` 在有命令面的界面（Web / CLI）可用；headless / ACP
无命令菜单，跟随 `grokDefault`。

需要以前常开姿态的部署请设 `grokDefault: 'on'`。配置级 `grokDefault: 'on'`
仍尊重 `mode`，部署方仍可选分诊；显式 `/grok` 会在会话里记 `workflowMode: 'full'`，
即使在 `mode: triage` 下闸门也照此执行完整流程。

## Also in this release

- **Objective limit 32,000 characters (PR #25).** The gate and the direct `grok_workflow` tool
  used to refuse any objective over 4,000 characters; the limit is now 32,000
  (`TASK_LIMITS.objectiveChars`). Per-task bounds are unchanged. The 4,001–32,000 range was the
  exact window where the planner-failure fallback was re-rejected; it is now covered by the
  sharded fallback.
  目标上限 32,000 字符（PR #25）：闸门与直接调用以前拒绝超过 4,000
  字符的目标，现在是 32,000（`TASK_LIMITS.objectiveChars`）；每任务边界不变。
  4,001–32,000 正是以前回退会被二次拒绝的窗口，现在由分片回退覆盖。
- **Sharded planner-failure fallback (PR #26).** When planning fails, the fallback splits the
  objective into contiguous shards of at most `taskTextChars` characters (`src/shards.ts`,
  shared by the generated script and host validation): concatenation reproduces the original
  byte for byte, every shard carries the same `origin_goal_id`, the run reports `partial` with
  `planning.source: "fallback"`. Three review findings are closed in the same PR (surrogate-pair
  boundary segment count, JSON-escape aggregate budget, balanced boundary-aligned segments with
  per-segment criteria).
  分片回退（PR #26）：规划失败时回退把目标切成连续分片（`src/shards.ts`，
  脚本与宿主校验共用），拼接与原文逐字节一致、分片共享 `origin_goal_id`、运行以 `partial`
  收尾。同 PR 关闭三条审查意见（代理对边界计数、JSON 转义合计预算、均衡对齐分段与分段标准）。
- **Issue #22 Phase 1 dialogue reliability (PR #23).** P0-1 the user's own message stays in the
  transcript; P0-2 a confirmation answer keeps the task (pending keeps `originalRequest`,
  10-minute TTL, consume-once); P0-3 every internal error ends visibly; P0-4 cancellation ends
  and keeps finished work (`commitCancelled()`, `interrupted` / `not started`, run error
  `cancelled`).
  Issue #22 Phase 1 对话可靠性（PR #23）：P0-1 用户原话保留；P0-2 确认档保留任务
  （pending 存原文、10 分钟、用后即弃）；P0-3 内部错误皆有可见终态；P0-4
  取消到达终态并保留已完成工作。

## Limits stated on purpose

- The browser window was **off-screen (headless Chromium)**: the machine has no X11 display,
  so a headed window was impossible. Page, DOM, CSS, screenshots and network are the real
  application; only the window is off-screen.
  浏览器窗口是**离屏的（headless Chromium）**：本机无 X11 显示，不可能开出可见窗口。
  页面、DOM、CSS、截图、网络都是真应用；只有窗口是离屏的。
- Every model round in the GUI verification ran on **`wb/cn:glm-5.3-flash`**, not the originally
  planned model (direct probe returned model-unavailable; same-provider live model used instead).
  No quality-matrix claim is made from these rounds.
  GUI 验证的全部模型轮次用的是 **`wb/cn:glm-5.3-flash`**，而非原定模型（直探返回模型不可用，
  改用同 provider 下可用模型）。不据此轮次做任何质量率结论。
- `relay` / `append` delivery on a long-lived GUI session remains **`NOT_RUN`**: this release's
  GUI evidence covers the default `in-turn` delivery only.
  长驻 GUI 会话里的 `relay` / `append` 投递仍为 **`NOT_RUN`**：本版 GUI 证据只覆盖默认
  `in-turn` 投递。

## Verification

- `npm run ci` — typecheck, oxlint (0 warnings / 0 errors), build, `lib/` consistency, tests.
- Real-GUI verification on an isolated instance (VALIDATION Round 15): default plain chat →
  `/grok` full run → `/grok off` back to plain chat, plus settings-card render / save /
  persist / take-effect-on-new-session. Evidence paths are recorded in the validation log
  (`.workflow-artifacts/gui-verify/`, not committed).

## Install

```bash
dsh plugin add dsh-grok-workflow@0.2.4
```

Nothing else changes about delivery: the answer still arrives inside the same turn by default,
and sessions start as plain chat until `/grok` opts in.
