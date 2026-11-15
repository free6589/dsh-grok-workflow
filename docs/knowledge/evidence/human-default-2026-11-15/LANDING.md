# Landing record — human-default evidence set (2026-11-15)

Written by the release executor (agent-38) when this directory was committed for `v0.9.2`.
It records what changed at landing time; the measurements themselves are in `README-r2.md`
and are not restated here.

## 1. Directory name

The verification pass (agent-32) wrote this set to `docs/knowledge/evidence/human-report-2026-11-15/`.
It was landed under the name the release checklist asked for
(`docs/knowledge/HANDOFF.md` §"放行后要做的三步" item 1):
`docs/knowledge/evidence/human-default-2026-11-15/`.

What changed at landing time, and what deliberately did not:

| touched | file | change |
| --- | --- | --- |
| yes | `README-r2.md` | the three reproduction paths rewritten to the new directory name |
| yes | `stage-c1-r2.mjs`, `stage-c6-r2.mjs`, `probes/probe-*.mjs` | absolute screenshot output paths rewritten (instrument code, not results) |
| **no** | `run-state-r2.json`, `final-answer.json`, `stage-c6-r2.json`, `stage-c3-r2.log.txt`, `stage-c6-r2.log.txt` | byte-identical to what the run produced; they still say `human-report-2026-11-15` because that is what the run wrote. Result JSONs and stack traces are not rewritten. |

No PNG, no measurement and no status label was altered.

## 2. What the per-run `TMPDIR` held, and that it was removed

The same release pass cleaned the repository-local `TMPDIR` (`$PWD/.tmp`, now gitignored).
Consequences for this evidence set, stated rather than papered over:

- `README-r2.md` §1 cites `.tmp/human-pack-r2/dsh-grok-workflow-0.9.2.tgz`
  (sha256 of the packed tarball is quoted in that row) and §4.6 cites
  `.tmp/r2-dump-booted.yml` line 1322ff. **Both files are gone.** They were
  `npm pack` output and a `--dump-config` output, reproducible with the exact commands
  recorded in those rows; the claim they support (F2: an overlay pins the entry's `config`,
  so a profile-layer switch is a silent no-op) is also recorded as text in
  `stage-c6-r2.json` → `switch_layer`.
- The isolated homes `.tmp/human-home/` and `.tmp/human-home-r2/` were deleted after a
  boolean credential check: each held a 161-byte `.credentials.yaml` containing only a
  `client-connection/browser-session` record (its own one-time browser secret); **zero**
  provider-key markers. They are regenerable with `dsh ghuman --from-default-profile web`.
- All figures quoted in `README-r2.md` (1 645 characters, `204585` bytes, `464 763` bytes,
  background `rgb(21, 21, 21…)`, `scrollWidth = 480`) were measured before the deletion and
  are carried verbatim.

## 3. Coverage against `VALIDATION.md` Round 40 §6

Six items were required. States below are the evidence set's own labels, not a re-measurement
by the release executor.

| §6 item | state | artefact / caveat |
| --- | --- | --- |
| 1. three Tabs coexist, Chat default | `CONFIRMED` | `01-three-tabs-default-chat.png` (`Chat(selected) / Trajectory / Progress`) |
| 2. default inbound message = human block + next step, no `stat`/`od`/`sha256`/absolute path/marker | `CONFIRMED` for turn 1, **falsified for turns 2 and 5** | `02-human-default-report.png` (1 645 chars, no marker, no digest, no absolute path) **but** `README-r2.md` §3 F4 reports the turn-1 block still carries the relative `.tmp/` path and mid-sentence clamp markers, and that turns 5 and 6 leaked `od -c` output and a `test -` command fragment. Read item 2 as "markers and absolute paths gone", not as "no machine raw material anywhere". |
| 3. `showDiagnostics` off/on contrast | `CONFIRMED` on the transcript side only | `07-diagnostics-on-report-head.png` (reader side unchanged: human block only) + `08-diagnostics-ledger-visible.png` (the marked text carries the ledger). F3: the stored `assistant/message` contains no ledger label, so "ledger visible in the answer" could not be photographed. Design call, not decided here. |
| 4. ≤480 px and dark theme | `CONFIRMED` | `03-narrow-480-report.png` (`scrollWidth = 480`, no overflow), `04-dark-report.png` |
| 5. regression: Chat / Trajectory / Progress, finished rows open their child session | `CONFIRMED` for Chat + Trajectory, `NOT_RUN` for opening a finished row from this instance | `05-chat-regression.png`, `06-trajectory-regression.png`, `probes/progress-tab-probe.png`; child-session opening is covered by `evidence/progress-tab-2026-11-15/Round2/09`–`11` and by `test/panel-links.spec.ts`, not re-taken here |
| 6. machine-checkable corroboration | `CONFIRMED` | `run-state-r2.json` (19 797 B), `final-answer.json`, `stage-c*-r2.json` / `.log.txt` pairs |

Items this set explicitly leaves `NOT_RUN` (from `README-r2.md` §5): the live-apply path of the
settings switch, whether a user can flip `showDiagnostics` without a launch-time overlay, and the
Progress tab / 480 px / dark re-taken on the switch-on session. No `test/` run belongs to this
pass — the 948-test figure is Round 40's, on `5eb4942`.

## 4. Committed with

`v0.9.2` release pass, evidence commit on top of `5eb4942` (the release-prep commit that this
tag points at). `MANIFEST.sha256` in this directory lists every file plus the worktree
`lib/client.js` and `lib/progress-tab.js` it was taken against.
