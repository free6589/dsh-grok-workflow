# Human-only default form — real-machine screenshots (retry run, 2026-11-15)

Second pass at the human-report evidence set. The first pass produced shots 01–06 and then
failed at stage D: the diagnostics contrast never got taken, and the two files it left
(`07`/`08`, 98 209 bytes each) were identical pictures of an unloaded page. This pass re-took
the whole set on a freshly built and freshly installed worktree, and — this is the important
part — it found out *why* the contrast kept failing instead of taking a third picture of a
blank page.

Everything below is a measurement. Labels: **CONFIRMED** = observed in a command, a file or a
live DOM in this run; **HYPOTHESIS** = plausible, not verified; **NOT_RUN** = not executed.
No commit or push was made; the only repository change is this untracked evidence directory.

## 1. What was booted

| step | exact command | result |
| --- | --- | --- |
| worktree build | `TMPDIR=$PWD/.tmp npm run build` | `tsc -p tsconfig.build.json && node scripts/build-client.mjs`; `client bundle: 204585 bytes → lib/client.js`; exit 0; `git status` stayed clean |
| pack | `npm pack --pack-destination .tmp/human-pack-r2` | `dsh-grok-workflow-0.9.2.tgz`, 464 763 bytes, npm shasum `fcb502afbc0a867ad38103c11c87f6a9f336d10d` |
| isolated home | `DSH_HOME=$PWD/.tmp/human-home-r2 dsh ghuman --from-default-profile web --dump-config` | fresh profile `ghuman` (bundles: base + web-app), exit 0 |
| install | `dsh plugin --profile ghuman add file:$PWD/.tmp/human-pack-r2/dsh-grok-workflow-0.9.2.tgz` | `+ dsh-grok-workflow`, and the bundle row was added to `dsh.profile.bundles` automatically |
| boot (default) | `dsh ghuman --patch docs/knowledge/evidence/human-default-2026-11-15/overlay-r2.yml --port 3217 --host 127.0.0.1 --no-open` | `dsh web: http://127.0.0.1:3217/?token=…` |
| boot (switch on) | same with `overlay-r2-diag.yml --port 3221` | `dsh web: http://127.0.0.1:3221/?token=…` |

The one-time token was read out of the app's own stdout into `DSH_URL` for each Playwright
process and never written anywhere else: `grep -rn 'token=[A-Za-z0-9_.-]\{8,\}'` over this
directory returns nothing. All four instances of this run were killed after use (ports 3217,
3219, 3221 are gone; only the *first pass*'s 3211 is still up, and it is not mine to stop).

Nothing about the model or the network is mocked: the endpoint is the machine-local gateway
on `127.0.0.1:18088` with `wb/cn:deepseek-v4.1-flash`, `mode: full`, and the team really
ran — each run took about one to two minutes end to end.

## 2. The shots

| file | state | what backs it |
| --- | --- | --- |
| `01-three-tabs-default-chat.png` | ① three Tab coexist, Chat selected by default | `tabsInfo` = `Chat(selected) / Trajectory / Progress`; the user's request is on screen (`getBoundingClientRect().top = 92`) so the shot is the conversation head, not a second copy of 02 |
| `02-human-default-report.png` | ② the human-only report | report = `做完了：… 关键证据：… 下一步：… 需要你知道的：…` + the English mirror; 1 645 chars; markers absent; no `stat`/`od`/`sha`/digest/absolute path (see §3) |
| `03-narrow-480-report.png` | ④ narrow | 480×900, `documentElement.scrollWidth = 480` (no horizontal overflow), report box 409×814, three tabs still present |
| `04-dark-report.png` | ④ dark | `prefers-color-scheme: dark`, body background `rgb(21, 21, 23)`, text `rgb(249, 250, 251)`, tab colour `rgb(122, 170, 255)` |
| `05-chat-regression.png` | ⑤ chat has no regression | after a Chat → Trajectory → Chat round-trip the same answer is byte-identical (1 645 chars, `same_report: true`), turn tail visible (`top = 724`) |
| `06-trajectory-regression.png` | ⑤ trajectory has no regression | Trajectory renders the run: `SYSTEM` + `USER` + four `CONTEXT` rows + the `ASSISTANT` answer, header shows `Standard mode · 3 subagents`, zero crash strings |
| `07-diagnostics-on-report-head.png` | ③ the contrast, reader side | the answer of the run whose composed config has `showDiagnostics: true` — and it is the **human block only**, exactly like 02 |
| `08-diagnostics-ledger-visible.png` | ③ the contrast, transcript side | the Trajectory detail panel of that same turn, scrolled to the ledger the switch added: `Uncertainties:`, `Synthesis: deterministic`, `Model routes: planner=… verifier=…`, `Deadline: 900000 ms per run (enforced by the plugin)` |
| `probes/progress-tab-probe.png` | supporting | the Progress tab: 8 nodes, states `done/pending`, `3/3 · 100%` |

`probes/` also holds the disposable instruments this pass added (`probe-settings-r2.mjs`,
`probe-grok-settings-r2.mjs`, `probe-grok-fields-r2.mjs`, `probe-settings-persist-r2.mjs`)
and their screenshots. `lib.mjs` is the first pass's helper module, reused unchanged so the
two passes measure the same DOM contract; `r2-lib.mjs` only adds a second state file
(`run-state-r2.json`) and a composer-wait for a fresh home.

## 3. Findings

**F1 — the generated settings switch cannot be committed from the page.** CONFIRMED.
`Plugins → Grok workflow → "More · Defaults are fine"` really contains the field — its own
label is *“Machine diagnostics — Off: hide model routes, deadline, switches, overflows and
errors. Uncertainties always stay.”* (checkbox index 13 of 43 controls; the first pass never
got this far). Ticking it flips the box to `true` and turns the footer button into
`Save (1)` — and pressing that button leaves it at `Save (1)` and writes nothing: the pending
count is still there 3.5 s later, and `<DSH_HOME>/profiles/ghuman/cordis.patch.yml` is still
`[]` (stages C2, C3; screenshots `probes/settings-switch-flip-r2.png`,
`probes/settings-after-save-r2.png`). DSH's loader does treat schema-`volatile` fields as
live-only (`cordis-plugin-loader/lib/index.js:260`), which is consistent with "the value never
lands on disk", but whether the page *should* still apply it in memory is **HYPOTHESIS** — I
did not find where the write goes. One consequence is CONFIRMED though: the next run is
unaffected, see F3.

**F2 — a launch-time `--patch` replaces the profile layer's `config` for the same entry id.**
CONFIRMED. With `showDiagnostics: true` in `profiles/ghuman/cordis.patch.yml` *and*
`overlay-r2.yml` on the command line, `dsh ghuman --patch overlay-r2.yml --dump-config`
prints the entry as `patched by <profile>, <overlay>` with the overlay's `mode: full` and
**no `showDiagnostics` at all**. So "put the switch in the profile layer" is silently a no-op
while an overlay pins that entry — which is exactly the setup the first pass's stage D used,
and a plausible reason it saw no change. (Its own failure was different; see the incident.)

**F3 — the switch does reach the plugin, but not the reader.** CONFIRMED, and it is the
substance of ③. With `showDiagnostics: true` verified in the composed tree
(`--dump-config` → `mode: full` + `showDiagnostics: true`), a real team run's transcript holds
a `user/message` whose marked text does contain the ledger — `Uncertainties:`,
`Synthesis: deterministic`, `Model routes: planner=bifrost-completions/wb/cn:deepseek-v4.1-flash; …`,
`Deadline: 900000 ms per run (enforced by the plugin)` — while the stored
`assistant/message` for that same turn (2 284 chars) contains no ledger label and no `---`
rule. The relay instruction tells the main model to reproduce the marked lines verbatim; it
reproduced the human block and dropped the ledger. So the diagnostics contrast currently
cannot be photographed as "ledger visible in the answer"; it can only be photographed as
07 (reader side, unchanged) + 08 (transcript side, ledger present). Whether the fix belongs
in the relay wording or in delivering the ledger as its own message is a design call, not
something this evidence set decides.

**F4 — the default human block is free of commands and digests, but not of paths or clamps.**
CONFIRMED on the turn-1 report (1 645 chars): no `stat -c`, no `od`, no `sha256`, no hex
digest, no `<<<…GROK-WORKFLOW-REPORT>>>` marker, no absolute path. It does still contain the
relative path `.tmp/` (“The file .tmp/ exists as a regular file at …”), and its evidence lines
end in mid-sentence clamp markers (`…（`). Later runs in this instance were dirtier:
turn 5 leaked `od -c` output (`0000000 7 4 \n`) and 34 mathematical-italic characters
(`𝑎𝑛𝑑𝑠𝑒𝑐…`, i.e. U+1D400 block, presumably from quoted content the pipeline re-styled), turn 6
leaked a command fragment (`test -`). So "no machine raw material in the human block" is
**CONFIRMED for turn 1** and **falsified for turns 2/5** with the samples above.

**F5 — the sidebar renders its own markup.** CONFIRMED, cosmetic: session rows and the header
show the literal string `**Session Title:** 创建 human-scratch-…` in every screenshot,
including `01`, `05`, `06`.

**F6 — the session archive can become unloadable, and the symptom looks exactly like "the
plugin produced nothing".** See `INCIDENT-session-corrupt-r2.md`. This is what the first
pass's stage D almost certainly hit; it is my operation error (two instances pointed at one
`DSH_HOME`, then a `SIGKILL`), not a plugin defect.

## 4. Failed steps in this pass — exact command, environment, error text

Nothing here was retried blindly; each entry says what was wrong with the step itself.

**4.1 — `dsh web --profile ghuman` is invalid.** (agent-32 first boot attempt)
Command: `DSH_HOME=$PWD/.tmp/human-home-r2 dsh web --profile ghuman --patch … --port 3217 --host 127.0.0.1 --no-open`
Output: `error: option '--profile <name>' argument 'ghuman' is invalid. select a profile only once`
Cause: `dsh web` already names the `web` profile, so the profile is selected positionally —
`dsh ghuman --patch … --port …`. Fixed and re-run; see §1.

**4.2 — narrow 480 px photographed the landing page instead of the session.** (stage B)
Command: `node stage-b-r2.mjs` against `:3217`. Result in `stage-b-r2.json`: `narrow.reopened=false`,
`tabs=[]`, `reportBox=null` — at 480 px the sidebar is collapsed on boot, so the session row the
stage looks for is not in the DOM at all. Not an app error: the selector was wrong for that
width. Fixed in `stage-b2-r2.mjs` by pressing the top-left **Open sidebar** control first.

**4.3 — the settings-page Save click left the page pending and then killed the page.** (stage C3)
Command: `node stage-c3-r2.mjs` against `:3217`; state after the click recorded in
`stage-c3-r2.log.txt`: `afterSave: {checked: true}`, `buttons_after: [… "Save (1)", "Discard"]`,
`profile_layer_written: false`. The stage then died in `settle()` with Playwright's
`locator.innerText: Timeout 30000ms exceeded. Call log: - waiting for locator('body')` — the page
was gone. Its JSON was therefore never written; the log and
`probes/settings-switch-flip-r2.png` are the evidence.

**4.4 — two instances on one `DSH_HOME`.** (restart attempt, 16:04)
Command: `dsh ghuman --patch … --port 3219 … > .tmp/r2-server.log 2>&1 &` while `pid 1623332`
was still serving `:3217` on the same home. Result: the new process never reached the listening
state — `ss -ltn | grep 3219` stayed empty for 1 m 33 s and its log stayed empty, consistent
with the home's single-instance lock (`sessions/…/session.lock`). No error line was printed by
the app. This is the step that led to 4.5.

**4.5 — the first session's archive became unloadable.** (stage C4, 16:19)
Command: `node stage-c4-r2.mjs` against `:3219`. Result: `reopened=false, responses_total=0`, and
the page showed (see the stage's `07-diagnostics-on-report-head.png`):
`Failed to load history: stored session "session-96a7b5f9-…" is corrupt: … SessionFormatError:
system/message requires a protected first surface head (raw log: …/session.v4.jsonl.zstd)
(gateway/internal)`. Full analysis in `INCIDENT-session-corrupt-r2.md`.

**4.6 — the switch set in the profile layer had no effect, while an overlay pinned that entry.**
(stages C2 and C5) Not an error message: a composed-config measurement. See F2 in §3 and
`.tmp/r2-dump-booted.yml` line 1322ff, which shows the entry patched by both layers carrying only
the overlay's `config`.

## 5. What is NOT verified


- The live-apply path of the settings switch (F1): I proved the click leaves the page
  pending and the profile layer untouched, not where the intent is lost. **HYPOTHESIS.**
- Whether a user can ever flip `showDiagnostics` without a launch-time overlay. **NOT_RUN.**
- The Progress tab under the diagnostics switch, and 480 px/dark re-taken on the switch-on
  session. **NOT_RUN** — 03/04 come from the same session as 01/02 (switch off).
- `test/`: no repository test was run in this pass; this is a picture-and-measurement job.
