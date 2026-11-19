# Live environment evidence — dsh-grok-workflow (read-only collection)

Collected 2026-11-19 16:23–17:05 UTC (2026-11-20 00:23–01:05 Asia/Singapore) by
delegated subagent `agent-10` for the lead task `live-env-evidence`.
Method: read-only observation of the live machine. No source, schedule, setting,
or live-profile value was changed by this task. No credential value was read or
printed. Evidence bundle: this directory (scratch copy
`/tmp/live-env-evidence-20261119T1623Z/`, durable copy
`.rsi/evidence/loop-iterate-env-evidence-20261119/` — untracked, not committed).

## 1. Version and install source — CONFIRMED

- Live instance: pid 154637, `dsh web --host 100.111.111.88 --port 3080 --no-open`,
  `DSH_HOME=/home/fish/.dsh`, profile **web**, parent = systemd --user,
  boot 2026-11-17 22:49:32 +08 (`ps -p 154637 -o pid,ppid,lstart,cmd`).
- Live registry (plugin_manager list_plugins against the running instance):
  `{entryId:"include:grok-workflow", moduleName:"dsh-grok-workflow", enabled:true, fiberPhase:"active", patchId:"grok-workflow"}`;
  also `include:optional-ralph-workflow` = `@deepseek-ai/dsh-workflow-ptc` active.
- Installed package: `~/.dsh/profiles/web/node_modules/dsh-grok-workflow/package.json`
  → name `dsh-grok-workflow`, **version 0.11.21** (copied to `01-version-source/installed-package.json`).
- Install source (profile `pnpm-lock.yaml` lines 32–34, 223–226; excerpt in
  `01-version-source/pnpm-lock-excerpt.txt`): specifier
  `github:free6589/dsh-grok-workflow` (unpinned) → tarball
  `https://codeload.github.com/free6589/dsh-grok-workflow/tar.gz/22bbe178ed375176b6b33674c85ae0ab47b10fe6`,
  integrity `sha512-aehcy+oJvtatK1WN+/AdtnvsZVXD5mIckw3sThAh8p1XgDv/6+ADxFXhoUCNexjSVJj/cwhdENLMLywfFsRZ+g==`.
- Commit identity: installed tarball = main HEAD commit `22bbe17` (= the docs commit
  after release commit `73cbd4b`; tag `v0.11.21^{commit}` = `73cbd4b13bf724ffd094eb7b5e11dfaccc915a0d`,
  local repo `git rev-parse`). package.json version at `22bbe17` is 0.11.21.
- Byte-identity of the installed copy with commit `22bbe17`
  (`01-version-source/file-hash-comparison.txt`): lib/loop.js, lib/client.js,
  lib/index.js, lib/loop-surface.js, lib/guardian.js, package.json, cordis.patch.yml —
  **7/7 sha256 MATCH** (sha256 of `git cat-file -p 22bbe17:<file>`).
- Composed config (`DSH_HOME=/home/fish/.dsh dsh --profile web --dump-config`,
  excerpt `01-version-source/composed-grok-workflow-config.txt`):
  `- id: grok-workflow / name: dsh-grok-workflow`, config `mode: full`,
  `grokDefault: 'on'`, 5 roles (planner bifrost-responses/opencode-go muse-spark…,
  worker/verifier/supervisor agent2api deepseek-v4.1-flash…), `timeoutMs: 0`;
  `- id: workflow-ptc … disabled: false`. **No `loop*` keys present** → loop settings
  at code defaults (loopEnabled default off).
- Install timeline from plugin-manager logs (`.plugin-manager/logs/operation-*/pnpm.log`,
  excerpt `01-version-source/plugin-manager-install-logs.txt`, token-scan clean):
  - 2026-11-19 23:39 — operation-g1yu8W `Packages: +1 -3`, removes
    `dsh-grok-workflow github:free6589/dsh-grok-workflow#v0.11.21` (proves a tag-pinned
    0.11.21 row existed before);
  - 2026-11-19 23:39 — operation-sjpPCh `Packages: +4`, adds unpinned
    `dsh-grok-workflow github:free6589/dsh-grok-workflow` (12.3 s) → resolves to `22bbe17`;
  - 2026-11-20 00:07 — operation-oZspIo installs unrelated `chat-in-dsh` (+1).
  So the 0.11.21 content was on disk from 2026-11-19 23:39, i.e. **before** the
  23:42:58 reproduction paste below.
- HYPOTHESIS (unverified): which build the running instance had loaded in memory at
  each paste (boot 2026-11-17 vs installs 23:39/00:07; hot-reload behaviour of the
  live plugin-manager was not directly observed). The failed second boot attempt at
  2026-11-17 22:50:19 (`~/.dsh/logs/startup-2026-11-17T14-50-19.828Z-….log`:
  `EADDRINUSE 100.111.111.88:3080` + `2 required plugins did not activate`) proves the
  port was already held by the running instance and that a Nov-17 composed config
  already carried the grok-workflow row.

## 2. Host schedule list — CONFIRMED (both states)

- Store: `/home/fish/.dsh/storages/schedule.json` (unit `{name:"schedule",version:2}`);
  snapshot copied to `02-schedules/schedule.json.snapshot` (taken 2026-11-20 00:26 +08).
- `tables.tasks` contains exactly **1 row**:
  `schedule-12eadb13-49c0-4479-9ac2-0d0e8e7ff1d0`, title `派发个人助理灵感箱`,
  `kind:"rrule"`, `RRULE:FREQ=DAILY;BYHOUR=9,13,18,22;BYMINUTE=0`, `status:"active"`,
  target session-a52a4e1d… — a user cron-board task, **not** a Loop heartbeat row.
- **Loop heartbeat rows (title `Loop heartbeat`, prompt prefix `[grok-workflow loop]`): 0.**
  Persisted schedule state = Loop **off** for every session on this host right now.
- On-versus-off: an **on-state row does not currently exist** to snapshot; creating one
  would have been a schedule mutation, refused by this task's constraint (NOT_RUN).
  Historical on→off: the loopfix-verify GUI test (2026-11-19, recorded in
  docs/knowledge/HANDOFF.md round-023 — memory, cross-checked here) created a Loop row
  and closed it; the store now shows no residue, consistent with 0 rows. Loop-route
  calls are client↔server HTTP and were searched for as session events in 9 workspace
  sessions mentioning loop/heartbeat: only prompt-text mentions found, no loop-route
  session events.
- Tool note: the host `schedule_list` tool refuses delegated subagents
  (`"A delegated subagent cannot use scheduled tasks."`) — the on-disk store above is
  the ground truth used instead. No schedule_create/schedule_edit/grok_loop-open was
  attempted.

## 3. Reproduction transcript — CONFIRMED (prompt pasted to a new session is swallowed)

Sessions live at
`~/.dsh/sessions/--home-fish-projects_mine-dsh-grok-workflow--/<session-id>/session.v4.jsonl.zstd`
(zstd JSONL, one event per line). Decompressed copies in `03-repro-logs/`
(b7be2bd2 trimmed to the reproduction window — see §5).

### session-042dfe19-f236-4cbf-8a96-d357455238da — the NEW-session reproduction

Created 2026-11-19 23:42:48 +08; paste 10 s later; cwd=/home/fish/projects_mine/dsh-grok-workflow.

| seq | time (+08) | event | content |
|---|---|---|---|
| 0–3 | 23:42:48 | preset/sandbox/approval/subagent-policy | workspace-write / ask / agent2api deepseek-v4.1-flash |
| 4 | 23:42:58 | `command/run` name=grok | `args:" on /grok 团队任务：实现「自我迭代」功能…"` (**2041 chars**, full team-task prompt; first line was `/grok on /grok 团队任务：…`), source.kind=user |
| 5 | 23:42:58 | `command/done` kind=**error** | text **`Usage: /grok [on|off]`** |
| 6–8 | 2026-11-20 00:12:00 | `command/run` args `" on"` → `plugin:grok-workflow/mode {enabled:true, workflowMode:"full", setBy:"command:/grok"}` → done success "Grok workflow ON…" | user typed `/grok on` |
| 9–10 | 00:12:07–08 | model/selection | bifrost-responses / muse-spark… |
| 11 | 00:12:10 | `command/run` name=grok | `args:" 团队任务：…"` (**2032 chars** re-paste; first line `/grok 团队任务：…`) |
| 12 | 00:12:10 | `command/done` kind=**error** | text **`Usage: /grok [on|off]`** |

**No `user/message`, no `agent/pre-step`, no workflow run anywhere in the session.**
The paste was consumed as a `/grok` command argument and answered with one usage line,
both before and after `/grok on`.

### session-b7be2bd2-397a-49c8-a70d-f37e96ffcc98 — same shape, independent session

Created 2026-11-19 13:10:42 +08 (existing session used for retries):

| seq | time (+08) | event | content |
|---|---|---|---|
| 2944 | 23:33:43 | `command/run` name=grok | `args:" 团队任务：…"` (2032 chars) |
| 2945 | 23:33:43 | `command/done` error | `Usage: /grok [on|off]` |
| 2952 | 23:35:38 | `command/done` success | `Grok workflow ON — every message now runs the full plan→execute→verify workflow.` |
| 2953 | 23:35:49 | `command/run` name=grok | re-paste, 2032 chars |
| 2954 | 23:35:49 | `command/done` error | `Usage: /grok [on|off]` |
| 2955 | 23:38:54 | `command/run` name=grok | `args:" off"` |

### Reproduction outcome (CONFIRMED)

Both paste shapes — `/grok <task body>` and `/grok on /grok <task body>` — are parsed
as a `/grok` command whose whole body is the argument; the handler answers
`Usage: /grok [on|off]` and returns. The task prompt never reaches the workflow gate:
no `user/message`, no run, in both `/grok` off and on (`workflowMode:"full"`) states.
Matches the intake audit in docs/knowledge/VALIDATION.md (`2 041` and `2 032`-char
shapes). The intake fix (`src/intake.ts`) exists only in the local uncommitted tree —
it is in **neither** the released 0.11.21 nor any earlier release, so this stall is
expected on the live install regardless of which build the instance had loaded.

## 4. Logs

- `~/.dsh/logs/` holds boot logs only; newest = the FAILED boot attempt
  2026-11-17 22:50:19 (`03-repro-logs/boot-log-failed-attempt-excerpt.txt`):
  `EADDRINUSE 100.111.111.88:3080`, `2 required plugins did not activate`, composed
  entries include `include:grok-workflow / module: dsh-grok-workflow`. The running
  instance's own boot log is not in `~/.dsh/logs`; no per-request runtime log file
  was found. The per-event ground truth is the session transcripts (§3) and the
  plugin-manager install logs (§1).

## 5. Constraint compliance and redaction

- Zero mutations: reads only. Evidence written to the scratch dir and to
  `.rsi/evidence/loop-iterate-env-evidence-20261119/` (the lead-designated evidence
  path; it is NOT gitignored, so these files appear untracked in `git status` —
  nothing was committed or staged).
- `schedule_list` refused for delegated subagents (recorded above); no mutation tools used.
- Secret scan (sk- prefix + 20 alnum, ghp- prefix + 20 alnum, GitHub personal-access-token
  prefixes, private-key headers, long api-key assignments, long Bearer tokens) over the whole
  bundle: the only hit was in
  the full 8.7 MB `session-b7be2bd2` transcript, which was therefore **trimmed to the
  reproduction window** (header + seq 2940–2959, 19 lines / 38,632 B) and re-scanned
  clean. The full transcript was NOT copied into the evidence bundle; the original
  remains at its source path.
- No credential file was opened (`.credentials.yaml`, `.dsh/lingshu` tokens etc. not read).

## 6. Exact commands and outcomes

| # | command | outcome |
|---|---|---|
| 1 | `ps -fp 154637` + `readlink /proc/154637/cwd` + `/proc/154637/environ` filtered to `^DSH_(HOME\|PROFILE\|PORT\|HOST)=` | pid 154637 `dsh web --host 100.111.111.88 --port 3080 --no-open`, boot 2026-11-17 22:49:32, DSH_HOME=/home/fish/.dsh |
| 2 | `jq '{name,version,…}' ~/.dsh/profiles/web/node_modules/dsh-grok-workflow/package.json` | `dsh-grok-workflow 0.11.21` |
| 3 | `grep -n -A6 dsh-grok-workflow ~/.dsh/profiles/web/pnpm-lock.yaml` | specifier `github:free6589/dsh-grok-workflow`; tarball `…/tar.gz/22bbe178…`; integrity sha512-aehcy+… |
| 4 | `plugin_manager list_plugins` (offsets 0 and 150) | live registry: `include:grok-workflow … enabled:true, fiberPhase:"active"`; workflow-ptc active |
| 5 | `DSH_HOME=/home/fish/.dsh dsh --profile web --dump-config` | composed rows: grok-workflow (mode full, grokDefault 'on', no loop keys), workflow-ptc enabled; exit 0 |
| 6 | `schedule_list` (host tool) | REFUSED: "A delegated subagent cannot use scheduled tasks." |
| 7 | `cp ~/.dsh/storages/schedule.json …/schedule.json.snapshot` + `jq` | 1 task row (派发个人助理灵感箱, active), 0 Loop heartbeat rows |
| 8 | `zstd -dc …/session-042dfe19…/session.v4.jsonl.zstd` / `…b7be2bd2…` | transcripts extracted; events as in §3 |
| 9 | `for d in session-*/; do zstd -dc … \| grep -q "grok-workflow/loop\|Loop heartbeat" && echo FOUND` | 9 sessions mention loop/heartbeat; all are prompt-text mentions, 0 loop-route session events |
| 10 | `date -u -d @$((t/1000))` on event times | timeline in §3 |
| 11 | `git -C repo rev-parse v0.11.21 v0.11.21^{commit} HEAD` | tag object `3e74038…`, peel `73cbd4b…`, HEAD `22bbe17…` |
| 12 | `sha256sum` installed files vs `git cat-file -p 22bbe17:<file>` | 7/7 MATCH (§1) |
| 13 | tail of `.plugin-manager/logs/operation-*/pnpm.log` | install timeline in §1; token scan clean |
| 14 | `grep -rl <secret-patterns> $EV` | 1 hit in full b7be2bd2 transcript → trimmed + re-scan clean |

## 7. Label summary

- **CONFIRMED**: version 0.11.21; install source unpinned `github:free6589/dsh-grok-workflow`
  → codeload tarball at `22bbe17` with sha512 integrity; installed copy byte-identical to
  `22bbe17` (7/7 files); live registry row active; composed config mode=full/grokDefault=on
  with no `loop*` keys; schedule store = 1 non-loop row, **0 Loop heartbeat rows** (on-state
  row absent = loop off everywhere, no residue from the loopfix-verify on→off test);
  both paste shapes swallowed with `Usage: /grok [on|off]`, no user/message/run, in both
  `/grok` off and on states; 0.11.21 install (23:39) predates the 23:42:58 paste.
- **HYPOTHESIS**: which build the running instance had in memory at each paste
  (boot 2026-11-17 vs installs 23:39/00:07; hot-reload not directly observed).
- **NOT_RUN**: a paste performed by this task and a live Loop-on row snapshot — both
  would mutate the live profile/schedules, refused by the task constraint. The
  reproduction evidence is the user's own pastes recorded in the live session store.
