# fix_child_names GUI verification — descriptive names in the real Web GUI top panel (2026-11-08)

What this proves: on an **isolated DSH web instance** (profile `guiweb` from the web template,
isolated `DSH_HOME=out/gui-verify/home/` — the operator's home and live `:3090` were never touched,
D-013), the plugin build at `ad66118` runs a gated team workflow **driven through the real GUI
composer** to completion (6 subagents, one real agnes `format-error` route-switch retry), and the
stock **Session hierarchy top panel** — the panel the defect was reported on — shows a specific,
descriptive task name for **every** child, with **zero** `任务团队 child N` and **zero**
raw-prompt-text display names.

## Environment

| | |
|---|---|
| Machine | operator machine, `/home/fish/projects_mine/dsh-grok-workflow` |
| DSH CLI / instance | `dsh` → `/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@deepseek-ai/dsh` (`0.2.1-rc.2`), isolated instance `127.0.0.1:3199` (port checked free; killed after the run) |
| Isolated DSH home | `out/gui-verify/home/` (gitignored), profile `guiweb` via `--from-default-profile web` |
| Plugin | dev-installed into the profile from the checkout (`dsh plugin add file:///…`); installed `lib/team-engine.js` md5 == checkout `lib/team-engine.js` |
| Patches | `workflow-ptc` enabled (`provider: spawn`) + `grok-workflow` config (`mode: full`, gate on, `maxTasks: 2`, concurrency 2, retries 0, `synthesis: deterministic`); models `wb/cn:deepseek-v4-pro` + `agnes-3.0-flash`, `apiKeyEnv: BIFROST_VIRTUAL_KEY` (presence checked as boolean only) |
| Browser | headless Chromium (`chromium_headless_shell-1248` via playwright-core from `@playwright/cli`), viewport 1440×900 |
| Run prompt | 团队档双计算任务：`919 + 27` 并验算、`919 × 3` 并验算（typed into the real composer, submitted with Enter） |
| Instance URL token | one-time token printed by boot stdout, passed to the driver via `GUI_URL` env only — persisted nowhere in this evidence |

## Results

1. **Boot clean** — no `pending` / `did not activate`; the only console item across both passes is
   one cosmetic `404 /open-in-app/icon/filemanager` (icon resource).
2. **Run completes in the GUI** — plugin panel `data-run-status="completed"`; parent session
   (`session-0a8eb864…`) log contains `Grok workflow: COMPLETED`; 6 children: planner 1 +
   workers 3 (one real failed attempt via `agnes-3.0-flash` `format-error`, then the v4-pro retry) + verifiers 2.
3. **Mid-run** (`03-running.png`): hierarchy trigger aria = `1 subagent` (running); plugin panel
   `任务团队 · 1 member / Running` with `规划助手 Running`.
4. **The top panel itself** (`11-hierarchy-open.png`, `12-hierarchy-rows.png`): opened
   `Session hierarchy` shows 6 entries whose primary labels are exactly the descriptive names —
   `规划助手`, `计算并验算 919 + 27`, `计算并验算 919 × 3`, `检查 · 计算并验算 919 + 27`,
   `计算并验算 919 × 3`, `检查 · 计算并验算 919 × 3` — **no `任务团队 child N`, no prompt-text
   label** (driver assertion `bad=[]`, `ok=true`, exit 0 — `hierarchy-result.json`).
   The secondary line is the child session title (DSH derives it from the child prompt; with the fix
   the prompt's first line is the descriptive title, so the secondary line also leads with the task name).
5. **Durable-data cross-check**: the first `subagent/descriptor` event of each of the 6 child
   sessions in the raw logs carries exactly the labels the panel rendered
   (`child-descriptor-events-gui-run.txt`), and the parent log carries `Grok workflow: COMPLETED`.

## Files

- `03-running.png` — mid-run state (trigger count + plugin panel running row).
- `04-final.png` — completed state (plugin chat panel `任务团队 · 6 members / Completed`, all rows links).
- `11-hierarchy-open.png` / `12-hierarchy-rows.png` — the opened Session hierarchy top panel.
- `hierarchy-result.json` — pass-2 DOM dump (rows: aria/label/summary) + assertions.
- `result.json` — pass-1 assertions (`ok: true`, `hasTeamChildPattern: false`, run completed) + mid-run log.
- `mid-run.json` — mid-run snapshot (trigger aria `1 subagent running`, panel rows).
- `child-descriptor-events-gui-run.txt` — raw-log descriptor labels of all 6 children + parent terminal marker.

## Boundary — what this does NOT claim

- The **live** instance at `http://100.111.111.88:3090` was not touched (D-013). Read-only check:
  its `web` profile carries **released `0.6.0`** (installed 2026-11-07 21:54; `lib/team-engine.js`
  absent — i.e. a build **without** this fix; corrects the earlier "`0.2.7`" note). Seeing the same
  descriptive panel there requires deploying the `ad66118` build into the live profile plus an
  authorized service reload (D-013 step 5) — left to the user/lead.
- Headless Chromium (this host has no X11 display), light theme, desktop width only.
- The plugin's client chat panel (`data-grok-workflow-panel`) renders role labels (`执行`/`检查`)
  by design; the criterion's panel is the stock subagent hierarchy, which is what passes 1–2 assert on.
