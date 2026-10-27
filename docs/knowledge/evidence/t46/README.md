# t46 — v0.2.2 on a second, independent instance (:3100)

Every artefact here was produced on a **copy** of the live web profile, listening on
`127.0.0.1:3100`, with its own `DSH_HOME` (`/home/fish/dsh-v022-home`). The live instance
(`:3090`, `DSH_HOME=/home/fish/dsh-layerfs`, profile `web`) was **never restarted, stopped or
reconfigured** during this task: its `grok-workflow` entry is still `disabled: true`, which is
the state the user chose.

## Provenance

| item | value |
| --- | --- |
| repo tree | `/home/fish/projects_mine/dsh-grok-workflow`, HEAD `cecc065` + uncommitted t42/t44/t45 work (no commit made) |
| build under test | `npm pack` of that tree → `/tmp/t46-pack/dsh-grok-workflow-0.2.2-rc1.tgz` (md5 `0a2190b6…1dbcc`) |
| installed into | `/home/fish/dsh-v022-home/profiles/web-v022-test/node_modules/dsh-grok-workflow` |
| byte identity | `lib/{client,records,run,config,index}.js` installed == repo (md5s in `instance-facts.txt`); `lib/client.js` == `src/client/index.js` |
| bundle count | 19 third-party bundles copied from `profiles/web` (incl. this one), plus the DSH built-ins |
| process | `DSH_HOME=/home/fish/dsh-v022-home dsh --profile web-v022-test --host 127.0.0.1 --port 3100 --no-open` (left running; token in `instance-facts.txt`'s sibling note) |
| session logs read | `/home/fish/dsh-v022-home/sessions/**/session.v4.jsonl.zstd` (server side, decompressed read-only) |

Profile edits relative to the copy: the `grok-workflow` block only (enabled, short-run test
limits, role chains). `workflow-ptc` was already enabled upstream. `timeoutMs` is deliberately
**absent** from the profile so the built-in default (3 600 000 ms) is what the product uses.

## Matrix (a–h) and where the evidence is

| # | claim | evidence |
| --- | --- | --- |
| a | every user message is forced through the workflow, zero direct answers | `A-conversation.txt`, `A3-conversation-final.png`, `session-evidence.txt` §1 (3 messages → 3 runs, 1:1), reports in `A-reports.txt` |
| b | progress is visible live: node appears in ~0.3 s, member count grows, terminal state settles | `B-samples-hi.json` (first paint 358 ms), `B-samples-simple.json` (40 ms), `B-samples-followup.json` (21 ms), `B1-node-hi.png` |
| c | settings page renders in EN and ZH, with the 3 600 000 default | `C1-settings-zh.{png,txt}`, `C2-settings-en.{png,txt}`, `C-settings.log` (assertions: 每会话活跃运行上限 / Active runs per session, 全部会话活跃运行上限 / Active runs across all sessions, `3600000`, 按角色模型链 / Per-role model chains) |
| d | role chains are editable through the product and take effect per role | `D1-inputs.json` (chains as the page reads them), `D2-roles-edited.png`, `D3-saved.png`, `D-roles-save.log` (banner “已保存，下一条消息生效。”), `instance-facts.txt` (saved chain in the patch), `session-evidence.txt` §3 (child agents ran `wb/cn:deepseek-v4.1-flash` while the parent session ran `wb/cn:mimo-v2.6-pro`) |
| e | fail-closed paths: unload mid-run, caller stop, deadline | unload: `E1-run-live-before-toggle.png`, `E2-plugins-after-toggle.png`, `E4-report-after-unload.txt`; caller stop: `F-stop.log`, `F1-after-stop.png`, `session-evidence.txt` §4 (`run-end stopReason=cancelled`, `turn/end aborted/user`); deadline: `I-deadline.log`, `I1-deadline-conversation.txt` (inconclusive — the 60 s value did not stop the run, and the saved value could not be read back) |
| f | idempotence, no recursion into subagents, no secrets in session logs | `session-evidence.txt` §1 (runs == admitted == delivered, 0 duplicates), §2 (19 child sessions, 0 runs), §5 (key scan) |
| g | five consecutive rounds without degradation | `G-rounds-session.json` (server side: 154.7 s, 472.4 s, 362.5 s, 317.8 s, 492.7 s, all `completed`), `G-rounds.log`, `G-rounds.json`, `G1-round.png`, `G5-round.png`. *(**Corrected by t49 R2:** "all `completed`" is the *engine's* stop reason. All five **reports** say `Grok workflow: FAILED`, `Failures: 1 quality`, `0 verified` — 0/5 accepted results. Root cause was ours: a non-empty verifier `issues` list failed the task even when the verdict was `pass`; fixed in 0.2.2, see VALIDATION Round 8.)* |
| h | coexistence with the other 18 third-party bundles | `instance-facts.txt` (boot warnings: only the two pre-existing `@dsh-layerfs/*` resolutions and the account-controller wait, all also true of the source profile), `H-plugins-page.png`. *(**t49 R6:** the live profile has 20 bundles — `@orbisapp/remote-dsh` was missing from this instance. t48 restored it and re-ran the boot on the same profile: the warning list is unchanged (same three pre-existing entries), so the conclusion holds at 20 bundles, but the count in this row was one bundle short.)* |

## Two t45 NOT_RUNs

1. **Notice row on screen.** Closed as *negative*: the notice row is written to the session
   (`E3-conversation-after-toggle.txt` shows the session surface) but the transcript does **not**
   render it — `session-evidence.txt` §6 shows the event at `turn=1 step=0` and no assistant row
   for that step in the transcript. *(**Corrected by t47 §1 / t49 R4:** the event **does** carry
   `surfaceOp: "append"` — it is a top-level sibling of `data`, which is where this task looked
   for it. The real reason the row never renders is that the panel opens an assistant row only on
   `step/start`, and this `(turn, step)` never had one; `dsh-client-ui-chat/lib/client.js:8094-8108`.
   Recorded here in place — the finding stands, the explanation of it was wrong.)* What the user *does* see is the report
   the gate relays after the cancellation: `E4-report-after-unload.txt`
   (`Failures: 1 cancelled … cancelled because the plugin was unloaded while the run was in
   flight (not a deadline and not a manual stop)`). So the information reaches the user, but not
   through the notice row. Root cause not fixed here (verification task).
2. **Settings page, new labels + 3 600 000 default, EN and ZH.** Closed as *positive*:
   `C1-settings-zh.*`, `C2-settings-en.*`, `C-settings.log`.

## Known gaps, stated rather than glossed

- The per-session slot refusal could not be provoked from the GUI on this instance: a second
  message sent while a run is live is **queued** by the client and replayed as a new turn, so a
  single session never holds two runs at 3100. That wording is covered by the unit tests
  (`test/lifecycle-disposal.spec.ts`) and by the t45 live run, not by a :3100 screenshot.
- The deadline path was exercised live but is **inconclusive**: with 60 000 ms saved through the
  page, a run was still working at 2 m 40 s and past 5 minutes. Either the save did not reach the
  runtime or the engine ignores the aborted signal while a child call is in flight. The value could
  not be re-read afterwards (the patch was inspected only after the restore), so this is recorded as
  an open question rather than a pass or a fail.
- The report printed `Model routes:` only **after** the settings page had saved the config; in
  the runs before that save the same chain produced no such line. Recorded as a discrepancy to
  root-cause, not as a pass.
