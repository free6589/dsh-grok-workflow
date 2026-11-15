# Incident — the first session's archive became unloadable after the restart

**Summary.** The session that produced shots 01–06 loaded and accepted a new message until
15:56, and could not be loaded at all after the instance was restarted at 16:19. The app
refused the whole session with a corruption error, which is why stage C4 recorded
`reopened: false, responses_total: 0` and why the first pass's stage D recorded the same
shape (`opened: false`, 0 responses, an empty flow). The archive is throwaway evidence state
under `.tmp/human-home-r2/`, not a repository artefact, and the plugin was not implicated.

## The app's own words (verbatim, from `07-diagnostics-on-report-head.png` of stage C4)

```
Failed to load history: stored session "session-96a7b5f9-d488-4f41-a8d1-2c97b32f99a3" is
corrupt: session "session-96a7b5f9-d488-4f41-a8d1-2c97b32f99a3", stored log is corrupt:
SessionFormatError: system/message requires a protected first surface head
(raw log: /home/fish/projects_mine/dsh-grok-workflow/.tmp/human-home-r2/sessions/
--home-fish-Documents-deepseek-harness-default-workspace--/session-96a7b5f9-d488-4f41-a8d1-2c97b32f99a3/session.v4.jsonl.zstd)
(gateway/internal)
```

## What the raw log contains (CONFIRMED)

The zstd JSONL decompresses cleanly and holds 81 records: a complete turn 1 (with
`turn/start`, `step/start`, `system/message`, user turns, answer, `turn/end`), a complete
turn 2, and a complete turn 3 — its workflow run (`tool-workflow/run-start` … `run-end`),
its delivery record, `step/start`/`step/end`, the assistant answer, `turn/end`. The first
record is the usual `{"type":"session","version":4,…}` header and the file is not truncated.

What is unusual: `system/message` appears **once** in the whole log (turn 1, step 1). Turns 2
and 3 go `turn/start → step/start → user/message…` without one. The loader only began
rejecting the log after the restart, so whatever makes that shape invalid is evaluated during
replay, not at write time.

## Sequence around the break (CONFIRMED timeline)

| time | event |
| --- | --- |
| 15:34–15:56 | instance on `:3217` (`pid 1623332`) runs turns 1 and 2; the session is reopened and re-read repeatedly by stages A2–C2, all of which load history fine |
| ~16:04 | a second instance (`pid 1709370`) is started on `:3219` against the **same** `DSH_HOME`; it never reaches the listening state (the home's single-instance lock, `sessions/…/session.lock`) |
| ~16:05 | stage C3 sends turn 3 through `:3217`; turn 3 completes on the server (16:05:52) while the browser page dies mid-`settle` |
| ~16:08–16:10 | `pid 1623332` is killed, then the straggler `pid 1709370` is killed with `SIGKILL` |
| 16:19 | the restart on `:3219` boots; the session no longer loads: the error above |

## Honest attribution

Two of these steps are mine and are the ones a careful operator would not repeat: never point
two instances at one `DSH_HOME`, and do not `SIGKILL` a harness process. Both are the obvious
candidates for the broken replay (**HYPOTHESIS**: the archive's shape is what it is, but I did
not reproduce the corruption deliberately, so I cannot say which step introduced it — nor
whether the missing `system/message` records are its cause or a pre-existing property that
the loader tolerates until a later write lands).

What is CONFIRMED is the *symptom equivalence* with the first pass: a session that will not
load produces an empty chat, so a stage that re-opens a session and measures the assistant's
reply records `0` responses and concludes "the switch changed nothing". That is exactly what
stage C4 of this retry recorded (`reopened: false`, `responses_total: 0`), and it is what the
first pass's stage D recorded.

For the record, the four "no ledger" observations in this retry have four different causes and
only one of them is about the switch:

| observation | session loaded? | reason it showed no ledger |
| --- | --- | --- |
| stage C2, turn 2 on `:3217` | yes | the launch-time overlay replaced the profile layer's `config`, so the switch was never on (README F2) |
| stage C3, turn 3 on `:3217` | yes | same as C2; the settings-page click never committed either (README F1) |
| stage C4 on `:3219` | **no** | this incident — zero responses were read at all |
| stage C5 on `:3219` | yes | same as C2 (profile-layer switch, overlay in play) |
| stage C6 on `:3221` | yes | the switch was on and the plugin produced the ledger; the relay dropped it (README F3) |

## Recovery taken

The affected session is left in place as evidence. The contrast shots 07/08 were retaken on a
new session of the same instance (stages C5, C7–C9); nothing was repaired by hand and no
loader or plugin code was touched.
