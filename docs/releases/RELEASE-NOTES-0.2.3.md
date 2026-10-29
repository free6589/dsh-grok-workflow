# Grok Workflow for DSH 0.2.3 — release notes

**Status: draft.** The `v0.2.3` tag and its GitHub Release are created by the release operator
**after** the final acceptance pass, following [the release guide](../RELEASING.md). The text the
release workflow publishes is the bilingual `## [0.2.3] - 2026-10-28` section of
[CHANGELOG.md](../../CHANGELOG.md), extracted verbatim.

## What this release is

`0.2.3` is the **front desk** release, and the first release that changes the plugin's central
promise. Until `0.2.2` the rule was "every user message runs the full workflow". It is now: *every
user message passes the front desk, the front desk states the tier it chose and why in the answer
itself, and it may never take a cheaper path quietly* (DECISIONS D-021). The user authorised the
change; the transparency is what keeps it honest.

Four tiers, all visible in the answer's first line as `档位：… — 因为：…`:

| Tier | What runs | Cost |
|---|---|---|
| `直答档` direct | a template answers small talk | no model call |
| `快手档` quick | one worker, one pass | one call (a structured retry if the first returns nothing) |
| `团队档` team | the full workflow, with the greeting and the progress board | the normal run |
| `确认档` confirm | it asks one question and remembers the answer | no model call |

`mode: 'full'` restores the old rule exactly — every message runs the team, no tier line, no
greeting — so an existing installation can keep its behaviour with one key.

## The correction that matters most

The first cut of the front desk **looked like it worked and did no work**: its "short and inert ⇒
direct tier" shortcut ran before the sequencing and question rules, so `为什么天空是蓝的`,
`先备份然后升级` and `这个报错 src/triage.ts:42` were answered with a greeting template. The tier line
was honest and the task was never done — the worst shape a defect can take in this feature, because
the user is told a tier was chosen rather than that nothing happened. The shortcut now runs after
every strong signal, a question always costs at least one worker, a pointer carrying a path / error
code / snippet is dispatched instead of being asked about, and enumerations (`1) … 2) …`, `一、… 二、…`)
and semicolons count as sequencing. The ordering is pinned by regression tests built from the
fourteen samples that exposed it, and re-checked message by message on a real instance (VALIDATION
Round 10).

## Also in this release

- Three settings, in the existing settings page and both languages: `mode` (`triage` / `full`),
  `triageAsk`, `triageModel`. Configuration keys 23 → 26; the other 23 keys are unchanged.
- A bare `简单` / `团队` with no question waiting no longer guesses and no longer crashes: it says the
  pending question expired or the plugin reloaded.

## Limits stated on purpose

- The greeting arrives **with** the final answer, not before it: under `in-turn` a turn admits one
  plugin message, so during the run the visible signal is the progress board.
- The confirm tier's question and answer live in **plugin memory for ten minutes** and are consumed
  when used. A reload or a longer pause forgets them, and the next bare choice word says so
  (DECISIONS D-024).
- The quick tier is "one call in the common case": when the plain call returns nothing, one
  structured retry follows, and the answer text still says one worker.
- Latency figures in the validation log are single samples on a shared instance, not a benchmark.

## Verification

- `npm run ci` — typecheck, oxlint (0 warnings / 0 errors), build, **366 tests across 22 files**.
- Live matrix on the test instance (`:3100`): nine messages for the tiers themselves (VALIDATION
  Round 9, evidence `docs/knowledge/evidence/t52/`) and the fourteen directed samples that exposed
  the ordering defect (VALIDATION Round 10, evidence `docs/knowledge/evidence/t54/`).
- `mode: 'full'` verified on the same instance: no tier line, the full workflow runs.

## Install

```bash
dsh plugin add dsh-grok-workflow@0.2.3
```

Nothing else changes: the gate is still on by default, the answer still arrives inside the same
turn, and `mode` defaults to `triage` — the behaviour of this release.
