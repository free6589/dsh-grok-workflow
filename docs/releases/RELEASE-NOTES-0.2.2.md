# Grok Workflow for DSH 0.2.2 — release notes

**Status: draft.** The `v0.2.2` tag and its GitHub Release are created by the release operator
**after** the final acceptance pass, following [the release guide](../RELEASING.md). The text the
release workflow publishes is the bilingual `## [0.2.2] - 2026-10-28` section of
[CHANGELOG.md](../../CHANGELOG.md), extracted verbatim.

## What this release is

`0.2.2` is an **incremental** release on top of the published `0.2.1` (tag `cecc065`, 43 files).
Three things change, and one of them is a correction of our own behaviour rather than a feature:

1. **The deadline is enforced by the plugin.** `timeoutMs` used to be enforced by aborting a
   signal and then waiting for the engine; a measured run kept working minutes after its 60 s
   deadline, and its cancellation was reported as "cancelled by its caller". The run result now
   races the plugin's own deadline, the cancel reason names the deadline it hit, and every report
   carries `Deadline: <n> ms per run (enforced by the plugin)`.
2. **Model routing is visible in every report.** `Model routes:` is printed unconditionally —
   an unconfigured role says `inherit` instead of the line disappearing — and a failure report
   derives its chains from the configuration in force instead of hard-coding an empty block.
3. **A verified task is no longer failed for the verifier's prose.** The task decision is the
   verifier's structured judgement (`verdict` + one `criteria` entry per acceptance criterion with
   `met` and evidence). A non-empty `issues` list used to override it, so a verifier that said
   `pass` with every criterion met still failed the task for writing down a caveat. Those notes now
   travel to the report as `Uncertainties` → `verifier note: …`.

Also in this release, from the same work: the active-run cap is **per session**
(`maxActiveRuns`, default 2) with a process-wide backstop (`maxActiveRunsTotal`, default 8) and
refusals that name the holders; an unload writes a `plugin:grok-workflow/dispose` record before it
cancels anything, and cancelled reports distinguish an unload from a deadline and from a caller;
the default deadline is 60 minutes; the settings page follows DSH's language setting.

## On "quality" — please read this before quoting the release

This release fixes a **decision defect**; it does not make the models better. The measured record
from the development instance before the fix: **12 reports — 1 `COMPLETED`, 8 failed for the defect
in item 3, 3 cancelled by deliberate probes** (two deadline, one unload). All eight quality
failures were that one defect; the verifier had returned `verdict: pass` in every one of them.

After the fix, three objectives that had failed on the same three `deepseek-v4.1-flash` routes
came back `COMPLETED` on the first attempt — a sample of three, on one objective family each.
Verification strictness is a model choice (`roles.verifier`), not something this release tunes.

## Upgrading

`0.2.2` needs DSH `0.2.1-rc.2` and Node.js 22 or newer, exactly as `0.2.1`. Configuration is
compatible: 23 keys, no key renamed or removed, no change to the report schema other than the two
additive lines described above. Install with the tag once it exists:

```
dsh plugin --profile <your-profile> add github:free6589/dsh-grok-workflow#v0.2.2
```

## Where the evidence is

- `docs/knowledge/VALIDATION.md` Rounds 6–8 — the matrix on a second instance, the deadline/route/
  notice closure, and the quality-failure root cause with its per-report analysis.
- `docs/knowledge/evidence/t49/` — the twelve reports classified, the branch-order proof, the
  mutation check of the regression tests, and the three post-fix runs.
- `docs/knowledge/DECISIONS.md` D-018…D-020 — why the deadline is ours, why the notice row is
  ledger-only in this DSH build, and why prose does not decide a task.
