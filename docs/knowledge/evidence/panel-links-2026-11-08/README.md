# fix_completed_links real-GUI verification — completed subtask rows stay clickable (2026-11-08)

What this proves: on an **isolated DSH profile** (`panelcheck`, web template, isolated
`DSH_HOME=.v070-home/` — the operator's home and live `:3090` were never touched), the plugin
with the client-side `workflow-run` panel re-registration boots the Web GUI **cleanly**, runs a
gated team workflow **to completion** (6 subagents, one real agnes `format-error` route switch —
same shape as Round 26), and **every member row in the chat task list is a clickable button that
opens its child-session view** — the planner row `规划助手` with status `已完成` (the reported
defect), both `执行` rows, both `检查` rows, and the `执行 failed` row. Zero inert rows.

## Environment

| | |
|---|---|
| Machine | operator machine, `/home/fish/projects_mine/dsh-grok-workflow` |
| Node / DSH CLI | `v26.8.1` / `0.2.1-rc.2` |
| Isolated DSH home | `.v070-home/` (`DSH_HOME`, created for this run; gitignored) |
| Profile | `panelcheck`, created with `--from-default-profile web`, plugin dev-installed from the checkout, `workflow-ptc` enabled by patch |
| Models | provider `bifrost-completions`, `wb/cn:deepseek-v4-pro` (planner/verifier/worker primary) + `agnes-3.0-flash` (worker overflow); key from `apiKeyEnv: BIFROST_VIRTUAL_KEY`, presence checked as boolean only |
| Instance | `127.0.0.1:3179` (disposable; killed after the run). The instance URL carries a one-time token — not stored anywhere in this evidence |
| Browser | headless Chromium (Playwright), viewport 1440×900 |
| Run prompt | 计算类双任务（611+9、611×2，无文件写入）——首轮验证 run 曾用写文件任务，因 `/home` 以 ro 挂载按预期 FAILED，恰好覆盖 failed 行渲染与可点击（failed 分支验收由该轮 console 输出与本轮 `执行 failed` 行共同覆盖） |

## Files

- `result.json` — the driver's final DOM assertion dump: `panel.runStatus = "completed"`,
  6 rows, every row `tag: "button"` + `data-member-openable: "true"`, `stockRows: []`
  (the stock renderer did not lose the seat — it is shadowed by `priority: -1`), and the
  planner-row click result.
- `04-running-panel.png` / `05-running-rows.png` — the run in progress: the `规划助手` running
  row is a button (`data-member-openable="true"`), matching the stock running-row behavior.
- `06-final-panel.png` — after completion: `任务团队 · 6 members / Completed`; every row —
  `规划助手 (Completed)`, `执行 (Failed)`, `执行 (Completed)` ×2, `检查 (Completed)` ×2 —
  renders as an underlined link.
- `07-after-planner-click.png` — after clicking the completed `规划助手` row: the main pane
  switched to the child session view (breadcrumb `用团队档完成两个独立的计算 / 任务团队 child 1`,
  planning prompt, `Completed in 34s`, Chat/Trajectory tabs) — the same subtask view a running
  row opens.

## Boundary — what this does NOT claim

- `relay`/`append` delivery forms were not separately exercised (the panel folds the same
  `tool-workflow/*` events regardless of delivery; extrapolation is `HYPOTHESIS`, not measured).
- Dark theme / mobile-width styling not audited (`NOT_RUN`).
- The first verification run (file-writing tasks) ended FAILED because the workers' CWD sits on
  a read-only btrfs mount of `/home` — an environment fact, not a plugin defect; its artifacts
  were overwritten by the second run, so the failed-row evidence in-repo comes from the second
  run's `执行 failed` row.
- Live `:3090` untouched (still `0.2.7` per D-013); DSH core unmodified; no tag, no release.
