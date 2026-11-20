# POOL triage, round 39 — re-anchored after the delivery edits (attempt 1 of 2)

Read-only triage. This file is the **only** path this task wrote; no `src/`, `test/`, `lib/`, `POOL.md`,
`STATE.md` or `CHANGELOG.md` byte was touched by it.

Why a second triage file: `.rsi/evidence/triage-round39.md` (16:10:30) was written before the
concurrent delivery worker's last two edits (`src/delivery/index.ts` 16:51:38, again 18:13:18;
`src/delivery/index.ts` is now **+125/−22** against `HEAD`). Every `src/delivery/index.ts` anchor in
that file has drifted, and one open item (`POOL.md:158-160`) turns out to need a different fix than
"give `src/records.ts` a free worker". This file re-anchors all 19 open `P` entries against the tree
as it stood 18:16:30 and re-ranks the themes. It is not a duplicate of the earlier list, and where I
agree with it I re-measured rather than citing it.

- Repo `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`, `HEAD` `366d169`
  (`docs(rsi): compact fix — npm run ci output at 91d4361`), `## main...origin/main` (no divergence).
- `package.json:3` → version `0.12.13`.
- Status vocabulary: `CONFIRMED` = read in source or measured by a command in this run;
  `HYPOTHESIS` = plausible, unmeasured; `NOT_RUN` = deliberately not executed.

## 1. The tree is loud — who owns what at 18:16

`git status --short --branch` at 18:16:30 (CONFIRMED):

```
 M src/checkpoint/schema.ts          (16:07:57)
 M src/delivery/index.ts             (18:13:18, still moving)
 M test/delivery-human-block.spec.ts (16:53:32)
?? test/checkpoint-bound.spec.ts     (16:06:55)
?? test/config-chain-types.spec.ts   (18:14:42)
?? .rsi/evidence/{baseline-round39,baseline-round39-attempt2,checkpoint-comment-fix,
   ci-health-round39,delivery-bilingual-edge,runtime-audit-2026-11-20,triage-round39}.md
?? .rsi/evidence/harness/{verify-round39,verify-round39-live,verify-round39-armed-row-refresh,
   verify-row-endstate-round39}.{md,txt}
?? .rsi/evidence/heartbeat-rearm/{05-arm-cross-check.md,06-attempt2-verification.txt,07-handoff-one-call.md}
```

Two facts change the theme assignment compared with the 16:10 triage, and a third (added below) changes what a later worker may claim:

1. `test/config-chain-types.spec.ts` appeared at **18:14:42** and its header says
   *"Chain route type validation in `resolveConfig` (RSI round 39)"* — a config worker is live
   **right now**. `src/config.ts` is untouched so far (mtime 15:39:07), but its test file is already
   new. A config theme is therefore **contested**, not free.
2. `src/checkpoint/wiring.ts` is **clean** (mtime 2026-11-19 20:41:10, absent from `git status`) and
   `test/checkpoint-wiring.spec.ts` is clean too — the checkpoint-reserved task only owns
   `src/checkpoint/schema.ts` + the new `test/checkpoint-bound.spec.ts`.

Files provably free at 18:16 (`git status` clean, no concurrent mtime today): `src/checkpoint/wiring.ts`,
`src/client/index.js` (02:59:17, unmodified), `src/records.ts` (15:45:09), `src/resume/policy.ts`,
`src/progress-tab.ts`, plus their tracked specs `test/checkpoint-wiring.spec.ts`, `test/client.spec.ts`,
`test/progress.spec.ts`, `test/resume-validator.spec.ts`.

Third fact, observed while this file was being written (18:16:30 → 18:18:29): the delivery worker also
landed a build — `lib/checkpoint/schema.*` and `lib/delivery/index.*` are now ` M` and `CHANGELOG.md`
is ` M`, none of it mine. Two consequences for whoever reads this: `lib/` is no longer the build of
`HEAD`, so a `verify:lib` claim cannot be made from this tree until it is rebuilt at the final commit;
and the measurements in §7 were re-run against that just-rebuilt `lib/` and still hold (§7.0).

## 2. Open-item inventory — all 19 open `P` entries, re-anchored

`RESERVED` = the file the fix must edit is held by an in-flight worker (see §1). Line numbers are at
`HEAD 366d169` for clean files and at the stated mtime for the two dirty ones.

| POOL lines | Item | Live anchor now | Drift vs POOL | Verdict |
| --- | --- | --- | --- | --- |
| 94-96 | `repairLimitOverruns` clamps seven removed keys, announces a cap that is not the fixed one | `src/config.ts:893-904` (`LEGACY_LIMIT_CAPS`), `:910-912` (`legacyRecordOverrun` helper, called at `:939`), `:933-941` (legacy loop), `:420` (`limitOverrunWarning`), `:26` (`HARD_LIMITS.maxActiveRuns: 4`) vs `:254` (`FIXED_MAX_ACTIVE_RUNS = 2`), caller `src/index.ts:98` | POOL's `:612-636` is now `assertKnownNestedKeys` | OPEN, **contested** (config worker) |
| 97-98 | six fail-closed branches have no test | POOL's `:438/:444/:462/:826` are comments; the route-key branch at `:652-659` **is** covered (`test/config.spec.ts:65`, `:67`); the genuinely unasserted ones are `:681` (`switchOn` class), `:786` (route path shape), `:807` (non-negative integer), `:977` (`mode`), `:1000` (`synthesis: model` needs a synthesizer), `:1017`+`:1020` (`iterateTemplate` type/length) | anchors stale; count survives | OPEN, **contested** |
| 114-115 | "bilingual" mirror repeats one sentence under English labels | `src/answer.ts:111-114` (unchanged), `src/delivery/index.ts:696` (mirror compose) | delivery anchor `:611` → `:696` | RESERVED (`src/delivery/index.ts`) |
| 125-126 | fallback partial says `0 项没做成`, never names the degraded plan | `src/delivery/index.ts:406` (partial sentence), `:410` (failure sentence), `src/script.ts:2157-2163` (`planningFallback` / `status`) | `:387-392` → `:406`; `script.ts:2160` lands inside the status block, still valid | RESERVED |
| 127-128 | `dedupeBilingual` deletes a deliberately repeated sentence | `src/delivery/index.ts:436-454`, caller `:473` | `:429` → `:436` | RESERVED |
| 138-139 | `progress.notReported` cannot say "declared, no rows yet" | copy `src/client/index.js:301` (en) / `:503` (zh), consumer `:2956-2959`; the distinguishing fact has no producer — see next row | unchanged | OPEN, theme [W2] |
| 143-147 | 实时回执 / cancel terminal / unload notice are records with no panel rendering | `src/records.ts:51` (`TERMINAL_RECORD`), `:241` (`PluginRecordMap` entry, block `:232-243`), `:794-813` (persist helper, append at `:813`); `grep -n "plugin:grok-workflow" src/client/index.js` → **0 matches** | none | OPEN, theme [W2] |
| 156-157 | Edge nodes print "not reported" although `run-start`/`run-end` arrived | `src/client/index.js:2576-2582` (`edgeState`), `:2601` (state picked), `:2953-2959` (tooltip), `:2965-2966` (meta line), `:3111` (detail source line), copy `:301`/`:503` | POOL's `:2669`/`:2673` are now inside the fold and the copy table | OPEN, theme [W2] |
| 158-160 | `meta.phases` is dropped at `run-start` | `src/records.ts:503` (signature `meta: { readonly name: string }`), `:612-616` (writes only `{runId, name}`), payload type `:424-427`; the DSH-owned type is `ToolWorkflowRunStartData { runId, name }` (`@deepseek-ai/dsh-tool-workflow/lib/types/types.d.ts:10-13`); the contract is pinned two-key-exact by `test/progress.spec.ts:53-70` | POOL's `:597` → `:616` | OPEN, theme [W2], **fix shape changed** — see §6 |
| 161-162 | fixtures feed the panel a stream shape the recorder cannot produce | `test/progress-tab.spec.ts:541`, `:543`, `:565`, `:581` send `phase: '执行'`; producer sends the plan-task group title `src/script.ts:1849-1851` | `:247`/`:54` point at the helper/label, not the impossible rows | OPEN, unselected (test-only) |
| 185-187 | `recordableTimeoutMs`'s upper guard is vacuous | `src/checkpoint/wiring.ts:541-547` (guard), `:591-593` (`deadlineAtMs`), `:745` (`limits.timeoutMs`), `:792` (`time.deadlineAtMs`); ceiling `src/checkpoint/schema.ts:114` (`msCeiling: Number.MAX_SAFE_INTEGER`, read-only — dirty file); config accepts the same ceiling at `src/config.ts:486` / `:806` | unchanged | OPEN, theme **[W1]** |
| 188-189 | caller-supplied `git` provider returning `head: ''` fails every write | provider type `src/checkpoint/wiring.ts:456`, call `:757`, record `:796`; refusal `src/checkpoint/schema.ts:692-694` (`validateHead`) | POOL's `schema.ts:686` → `:692 / :693` | OPEN, same file as [W1] → sequenced, not parallel |
| 190-191 | restore decisions drop `title`, `attempt`, `updatedAt` while claiming `retain` | `src/resume/policy.ts:62-71` (interface), `:137-145` (literal); the validator *keeps* the fields at `src/resume/validator.ts:275`, `:278`, `:281` | `:137-145` still right | OPEN, theme **[W3]** |
| 192-193 | integrity verified over the validator's normalized rebuild (`git.head` case) | `src/checkpoint/writer.ts:160`, `src/checkpoint/schema.ts:812`/`:685` | — | RESERVED (`src/checkpoint/schema.ts`) |
| 194-195 | five validator refusal branches untested | live `refuse()` sites `src/resume/validator.ts:232`, `:275`, `:291`, `:297`, `:309` | POOL's `:231/:274/:290/:296/:308` = −1 drift | OPEN, same file as [W3] → sequenced |
| 196-197 | `completed` retained with no evidence vs bare `success` refused | `src/resume/policy.ts:96-99` vs `:116-119` | unchanged | OPEN, same file as [W3]; intent is `H` |
| 210-211 | README "Models per role" examples are patches the loader refuses | `README.md:176` and `README.zh-CN.md:169` both say `synthesis: layered`; the other two examples at `README.md:218` / `README.zh-CN.md:208` do too | — | **STALE — CONFIRMED** |
| 212-214 | README validation bullet says "more than three routes" / unknown `switchOn` class | `README.md:182` and `README.zh-CN.md:175` say "more than 50 routes"; `switchOn` appears only in the fixed-key list (`README.md:247`, `README.zh-CN.md:237`) | — | **STALE — CONFIRMED** |
| 215-216 | `DESIGN-progress-tab.md` §4 documents the old spine, §12 never records the Execute/Verify gap | §4 old spine `docs/knowledge/DESIGN-progress-tab.md:55-57`, its own backfill `:63-69`, §12 item 6 recording exactly that gap `:211` | — | **STALE — CONFIRMED** (the doc self-identifies the stale half) |

## 3. Prior opens from this round: what is actually still open

The task context names four carried opens. Their state on disk, not in a report:

| Prior open | Evidence on disk | State at 18:16 |
| --- | --- | --- |
| delivery edge / **bilingual truncation** | `.rsi/evidence/delivery-bilingual-edge.md` (16:55) — 4 measured defects, `pairCaps` extracted and pinned, "Working tree only: nothing committed, nothing pushed, no full CI"; diff is +125/−22 in `src/delivery/index.ts` + +251 in `test/delivery-human-block.spec.ts`, still being edited at 18:13 | **open, unlanded, and still moving** → `src/delivery/index.ts` stays RESERVED; POOL `:114-115`, `:125-128` unselectable |
| harness verify | `.rsi/evidence/harness/verify-round39.md` + `-live.txt` + `-armed-row-refresh.txt` + new `verify-row-endstate-round39.txt` (18:16) — read-only, `--verify-row` exit 0, title/`COUNT` evidence | carried, read-only; **not** a code theme, no file in this triage's scope |
| heartbeat re-arm | `.rsi/evidence/heartbeat-rearm/07-handoff-one-call.md` — records **no** re-arm; the row still ends 2026-11-20T18:01:50+08:00; `COUNT=969` vs the planner's `single` shape | carried; blocked on one `schedule_edit` an operator must issue (`schedule_*` is refused to a delegated subagent) — **not** a code theme |
| compact_fix / auto_iter | landed earlier; `.rsi/ledger.jsonl` row `round: 38` `status: OK` | closed, not re-opened here |

So of the four carried opens, exactly one (`bilingual truncation`/delivery edge) removes files from the
parallel frontier, and none of them adds a new POOL item. Everything else in §2 is the standing backlog.

## 4. Ranked themes — file-disjoint (three executable now, one after the config worker lands)

Ranking criterion is the task's: **scope isolation** (how much of the edit set sits in files no other
worker holds, and how little cross-file coupling the change carries). A value column follows so the
integrator can trade one off against the other.

| # | Theme | POOL | Files written | Isolation | Value | Test scope | Size |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **[W1]** | Checkpoint deadline representability | `:185-187` | `src/checkpoint/wiring.ts`, `test/checkpoint-wiring.spec.ts` | **highest** — 1 clean src + 1 clean spec; only outward need is `msCeiling`, read-only | production path: such a run can never be resumed | 2 files, ~10 lines + comment | S/M |
| **[W3]** | Resume decision completeness | `:190-191` (+`:194-195`, `:196-197` sequenced) | `src/resume/policy.ts`, `test/resume-validator.spec.ts` | **high** — 1 clean src + 1 clean spec, no bundle, no i18n | latent: nothing in `src/` imports `src/resume/` (only tests) | 2 files, ~12 lines | S |
| **[W2]** | Panel tells the truth about the two ends | `:156-157`, `:158-160`, `:138-139`, `:143-147` | `src/client/index.js` (+ rebuilt `lib/client.js`), `src/records.ts`, `test/client.spec.ts`, `test/progress.spec.ts` | **medium** — 2 clean src but one is a served bundle (`scripts/build-client.mjs:4`: `lib/client.js` must stay byte-identical), and the phases half needs a record-type decision | four user-visible items at once | 4 files + rebuild | M |
| **[W4]** | Config legacy repair | `:94-96` (+`:97-98`) | `src/config.ts`, `test/config-limits-repair.spec.ts`, `test/config.spec.ts` | **contested** — `test/config-chain-types.spec.ts` was created 18:14 by another round-39 worker; `src/config.ts` is its obvious next edit | dead branch with a false sentence | 3 files, ~35-40 lines deleted | S |

Under a value-first ranking [W2] moves to #2 and [W3] to #4; the file-disjointness of the set does
not change. [W1], [W3] and [W2] share no file with each other or with any held path and can start
immediately; [W4] waits for `test/config-chain-types.spec.ts`'s worker to land `src/config.ts`.

### [W1] Checkpoint deadline — the guard cannot bite, so every snapshot of such a run is refused

CONFIRMED both halves, measured in this run (§7.1–7.2): `src/config.ts:486` / `:806` accept
`timeoutMs` up to `Number.MAX_SAFE_INTEGER`, `src/checkpoint/schema.ts:114` sets
`msCeiling = Number.MAX_SAFE_INTEGER`, so the guard at `src/checkpoint/wiring.ts:541-544` can never
reject a config-legal value; then `deadlineAtMs()` (`:591-593`) computes `startedAtMs + timeoutMs`,
which overflows: `now=1795169728056 + MAX_SAFE_INTEGER = 9008994424469048`, `Number.isSafeInteger`
false, and `buildCheckpoint` refuses `time.deadlineAtMs must be a safe integer`.

Blast radius is bounded and known: `writeOnce` catches it (`src/checkpoint/wiring.ts:815-825`), counts
`wiring.failures` and logs a warning, so the run does not crash — it simply never produces a readable
checkpoint, i.e. the run is unrestorable, which is the exact thing this wiring exists for.

Fix shape: bound by representability (`Number.isSafeInteger(startedAtMs + timeoutMs)`, or
`msCeiling - startedAtMs`), keep the documented "omit, never clamp" policy at `:530-540`, and cover
both sides of the boundary. Existing coverage touches `timeoutMs` only at small values
(`test/checkpoint-wiring.spec.ts:170`, `:194`, `:646` — `60_000` and `3_600_000`), so the new case is
a real addition. **Do not edit `src/checkpoint/schema.ts`** — it is dirty and owned by the
checkpoint-comment task; read `msCeiling` by name, not by line, because that worker's 10-line diff
sits in the same file.

### [W3] Resume decisions drop the fields `retain` promises to keep

`TaskRestoreDecision` (`src/resume/policy.ts:62-71`) carries `id/seq/status/action/retained/preserve/reason`
while its own `retain` reason says "keep the task as-is" (`:45`, `:98`). The validator validates and
preserves `title`, `attempt`, `updatedAt` (`src/resume/validator.ts:275`, `:278`, `:281`, `:322-324`),
then the policy literal at `src/resume/policy.ts:137-145` copies none of them — a restored task loses
the journaled title and attempt count. Add the three optional fields to the interface and copy them in
the literal; the decision describes the task, so `replan` decisions carry them too.

Two follow-ons live in the same file and must be sequenced, not parallelised: `:194-195` (five
untested validator refusals — `src/resume/validator.ts:232`, `:275`, `:291`, `:297`, `:309`, −1 drift
from POOL) and `:196-197` (`completed` retained vs bare `success` refused, `policy.ts:96-99` vs
`:116-119`, intent unverified).

Honest value caveat: `grep -rn "src/resume/" src/` returns only a comment reference in
`src/checkpoint/wiring.ts:238`; the three importers are tests (`test/recovery-kill-restart.spec.ts`,
`test/recovery-artifacts.spec.ts`, `test/resume-validator.spec.ts`). This is latent correctness, not a
live user-facing bug — which is why it ranks below [W1] and why it must not be pitched as urgent.

### [W2] The panel's two ends, and the facts it was never given

Four POOL entries, one file pair, no overlap with anyone else:

1. `:156-157` — `edgeState` (`src/client/index.js:2576-2582`) computes a real state from
   `run-start`/`run-end` (`:2601`), yet the tooltip (`:2953-2959`), the meta line (`:2965-2966`) and the
   detail source line (`:3111`) all fall through to `progress.notReported` (`:301`/`:503`), because an
   edge node's `members` and `evidence` are empty by construction. The two nodes whose facts are known
   are the two that claim nothing was reported.
2. `:158-160` + `:138-139` — "declared but not started" is indistinguishable from "never planned"
   because `run-start` writes only `{runId, name}` (`src/records.ts:612-616`). **This is the row whose
   fix shape changed** — see §6.
3. `:143-147` — the terminal / 实时回执 / unload texts are stored as
   `plugin:grok-workflow/terminal` (`src/records.ts:51`, `:241`, `:794-813`) and the client bundle
   never mentions any `plugin:grok-workflow` record (`grep` → 0 matches), so they render nowhere.

Write scope: `src/client/index.js` (both dictionaries must gain any new key — `test/i18n-parity.spec.ts`
enforces symmetry), the rebuilt `lib/client.js` (`scripts/build-client.mjs:4` requires byte-identical
output; `npm test` runs the build), `src/records.ts` if the phases half is taken, and the two pinning
specs `test/client.spec.ts` + `test/progress.spec.ts`. Keep `src/progress-tab.ts` out: the client-side
duplicate (`:2576-2610`) is where the state already exists, and carrying the fact through
`progress-tab.ts` would drag `test/progress-tab.spec.ts` in for no gain.

### [W4] `repairLimitOverruns` legacy branch — held, then decided

Measured (§7.3): `repairLimitOverruns({maxActiveRuns: 10})` returns
`maxActiveRuns is 10, over the hard maximum 4: it now takes effect as 4 (repaired). 已按 4 生效（原值 10 超过上限 4），请在设置页确认`,
while `FIXED_MAX_ACTIVE_RUNS` is `2` (`src/config.ts:254`) and the key is a removed key the reader
refuses — `resolveConfig(repaired)` → `unknown configuration key "maxActiveRuns"`, so the caller at
`src/index.ts:98-113` can never reach `announceOverruns()` for it. The branch is dead and its sentence
points at a settings row that does not exist.

Note what the code already concedes: the comment at `src/config.ts:930-932` says these numbers "are
unknown keys by the time `resolveConfig` runs, so this cannot save such a row; it keeps the
announcement a stale caller used to get". So the POOL's "dead path, misleading warning" is right and
the intent is now documented — the open question is only the decision: delete
`LEGACY_LIMIT_CAPS`/`legacyRecordOverrun`/the loop at `:933-941` (with `limitOverrunWarning`'s
"confirm on the settings page" clause for keys the page cannot show), or re-point the caps to the
`FIXED_*` values. `test/config-limits-repair.spec.ts:202` (removed keys with value `1` produce no
warning) must stay green either way.

**Do not start this theme in parallel.** `test/config-chain-types.spec.ts` was created 18:14:42 by
another worker whose subject is `resolveConfig` chain typing; `src/config.ts` is its next edit and
`test/config.spec.ts` may be too. Land it after, or hand it to that worker.

## 5. Disjointness matrix

`●` written, `○` read only, `—` untouched, `✕` held by another task.

| File | [W1] wiring | [W3] resume | [W2] client+records | [W4] config | Held by another round-39 task |
| --- | --- | --- | --- | --- | --- |
| `src/checkpoint/wiring.ts` | ● | — | — | — | — |
| `test/checkpoint-wiring.spec.ts` | ● | — | — | — | — |
| `src/resume/policy.ts` | — | ● | — | — | — |
| `test/resume-validator.spec.ts` | — | ● | — | — | — |
| `src/client/index.js` | — | — | ● | — | — |
| `lib/client.js` (build output) | — | — | ● | — | — |
| `src/records.ts` | — | — | ● | — | — |
| `test/client.spec.ts` | — | — | ● | — | — |
| `test/progress.spec.ts` | — | — | ● | — | — |
| `src/config.ts` | — | — | — | ● | ✕ (config chain-types worker, live) |
| `test/config-limits-repair.spec.ts`, `test/config.spec.ts` | — | — | — | ● | ✕ same |
| `src/checkpoint/schema.ts` | ○ | — | — | — | ✕ checkpoint-comment task (` M`) |
| `test/checkpoint-bound.spec.ts` | — | — | — | — | ✕ same |
| `src/delivery/index.ts`, `test/delivery-human-block.spec.ts` | — | — | — | — | ✕ delivery task (` M`, moving at 18:13) |
| `test/i18n-parity.spec.ts` | — | — | ○ (guard runs) | — | — |
| `src/progress-tab.ts`, `test/progress-tab.spec.ts` | — | — | ○/— (item `:161-162` unselected) | — | — |

Pairwise: [W1]∩[W3] = ∅, [W1]∩[W2] = ∅, [W1]∩[W4] = ∅, [W3]∩[W2] = ∅, [W3]∩[W4] = ∅,
[W2]∩[W4] = ∅ — and every set is disjoint from the three held paths.

**Three themes can run in parallel now** ([W1], [W3], [W2]); [W4] becomes a fourth only after the
config worker lands. There is no clean fifth: the remaining unselected items are either in a held file,
in a theme's own file (sequenced), or test-only.

## 6. Two findings this triage adds that POOL does not have

**(a) `POOL.md:158-160` cannot be fixed the obvious way.** The payload of `run-start` is a DSH-owned
typed session event: `ToolWorkflowRunStartData { readonly runId; readonly name }` at
`<dsh install>/node_modules/@deepseek-ai/dsh-tool-workflow/lib/types/types.d.ts:10-13`. The plugin
deliberately mirrors the in-tree shape (`src/records.ts:414-417`: "same four types, same field
shapes"), and `test/progress.spec.ts:53-70` pins it two-key-exact —
`{ type: PROGRESS_RUN_START, data: { runId: 'run-1', name: '任务团队 · 2 个任务' } }`. Adding `phases`
to `run-start` therefore diverges from the host type *and* fails a deliberately-tight contract test.
The executable shape is a **plugin-owned record type** (like `plugin:grok-workflow/terminal`,
`src/records.ts:51`) carrying the declared phases, plus a client reader — which is why [W2] must write
`src/records.ts` **and** `src/client/index.js` in one theme instead of leaving `records.ts` as a "free
round-40 candidate". POOL's `H that the extra key is safe` resolves to: not on `run-start`.

**(b) `src/records.ts:414` cites a test file that does not exist.** The comment says
"`test/records.spec.ts` pins the shapes"; `ls test/records*` → only `test/records-redaction.spec.ts`
(CONFIRMED). The shapes are actually pinned in `test/progress.spec.ts:53-70`. Whoever takes [W2] should
fix the pointer while they are in the file — it is one word, and it currently sends a reader to a
missing file.

## 7. Measurements run in this task

**7.0 Provenance.** The first pass ran against the `lib/` that was clean at 18:12 (the build of `HEAD`).
Between 18:16:30 and 18:18:29 a concurrent worker rebuilt `lib/checkpoint/schema.*` and `lib/delivery/index.*`
from the in-flight `src/` (both now ` M`), so every numeric measurement below was **re-run against that
new `lib/`** and returned identical values (`msCeiling` `9007199254740991`, the overflow refusal, and
the `repairLimitOverruns` warning). The line anchors are source reads and do not depend on `lib/`.
`lib/client.js` (mtime 16:12) and `src/client/index.js` (02:59:17, unmodified) still agree, and
`git diff --stat -- src test` is unchanged at `3 files changed, 364 insertions(+), 22 deletions(-)`.


1. `node --input-type=module -e "import {CHECKPOINT_LIMITS} from './lib/checkpoint/schema.js'"`
   → `msCeiling: 9007199254740991`, `=== Number.MAX_SAFE_INTEGER: true` — **CONFIRMED** the guard's
   ceiling equals the config's own ceiling (`src/config.ts:486`, `:806`).
2. Same harness with `startedAtMs = Date.now()`, `timeoutMs = Number.MAX_SAFE_INTEGER`:
   `deadline 9008994424469048 safe? false` → `buildCheckpoint` refused
   `checkpoint time.deadlineAtMs must be a safe integer` — **CONFIRMED** [W1]'s second half on a
   config-legal value.
3. `repairLimitOverruns({maxActiveRuns: 10})` → the quoted warning naming cap `4`;
   `HARD_LIMITS.maxActiveRuns: 4`, `FIXED_MAX_ACTIVE_RUNS: 2`; `resolveConfig(repaired)` →
   `unknown configuration key "maxActiveRuns"` — **CONFIRMED** [W4] is dead and its number is wrong.
4. `buildCheckpoint({... git: { head: '' } ...})` → refused (`git.head must be 7-64 hex characters`,
   `git.dirty must be a boolean` for the bare probe) at `src/checkpoint/schema.ts:692-694` —
   **CONFIRMED** POOL `:188-189`, with the anchor moved from `:686` to `:692/:693`.
5. Refusal-coverage map for POOL `:97-98`: for each live throw message in `src/config.ts`, counted test
   files containing that exact string — `switchOn … not a switchable failure class` (0),
   `must be "model" or "provider/model"` (0), `must be a non-negative integer between` (0),
   `mode must be "full" or "triage"` (0), `requires a non-empty roles.synthesizer chain` (0),
   `iterateTemplate must be` (0) vs `unknown configuration key` (5 files),
   `roles must be an object` (1), `accepted route keys` (1), `did you mean` (1).
   **CONFIRMED** that no test *text* asserts those six refusals; whether the branches can even be
   reached in a test is `HYPOTHESIS` until someone mutates them (`NOT_RUN`).
6. Anchor sweep: `grep -n` / `sed -n` over `src/config.ts`, `src/checkpoint/{wiring,schema}.ts`,
   `src/resume/{policy,validator}.ts`, `src/client/index.js`, `src/records.ts`, `src/script.ts`,
   `src/delivery/index.ts`, `README.md`, `README.zh-CN.md`, `docs/knowledge/DESIGN-progress-tab.md`,
   `test/progress.spec.ts`, `test/checkpoint-wiring.spec.ts` — the line numbers in §2/§4 are those
   reads (**CONFIRMED**).
7. DSH type read: `@deepseek-ai/dsh-tool-workflow/lib/types/types.d.ts:10-13` inside the installed DSH
   checkout — **CONFIRMED** §6(a).
8. `grep -rn "src/resume/" src/` and `grep -rln "src/resume" test/` — **CONFIRMED** [W3] has no
   production importer.

## 8. `NOT_RUN` in this task, and what it means

- No `npm run ci`, no `npm test`, no build: this task changed no code and claims no green suite. The
  suite figure quoted anywhere in the repo (69 files / 1263 tests, `.rsi/ledger.jsonl` round 38) is read,
  not re-measured here.
- No fix attempted: [W1]–[W4] are proposals with measured defect halves, not landed work.
- No GUI/browser verification of [W2]'s copy: the defect is source-read only, and the client bundle in
  `lib/` is the `HEAD` build, not a rendering.
- Mutation runs for POOL `:97-98` — `NOT_RUN`; the branch list is a coverage-gap claim, marked
  `HYPOTHESIS` where it says "these branches have no test that bites".
- `POOL.md`, `STATE.md`, `CHANGELOG.md`, `src/`, `lib/` untouched by design: §2's STALE verdicts and
  §6's two findings are recommendations for whoever owns `POOL.md`, not edits made here.

## 9. Files written

- `.rsi/evidence/triage-round39-reattempt.md` (this file) — the only write. Verified by
  `git status --short` at 18:13 and again at 18:18: the only path this task added is this one. Other
  paths that appeared in between (`CHANGELOG.md`, `lib/checkpoint/schema.*`, `lib/delivery/index.*`,
  `test/config-chain-types.spec.ts`, `.rsi/evidence/harness/verify-row-endstate-round39.txt`) were
  created or modified by concurrent workers after this task began; none was opened for writing here.

Every other dirty path in §1 belongs to a concurrent worker (checkpoint-comment, delivery, config
chain-types, harness-verify, heartbeat-rearm) or pre-dated this task. This task did not read the
in-flight `src/delivery/index.ts` hunks beyond the line-level anchors it had to cite.
