# Round worklist triage — candidate selection, file-disjoint map, sizing

Task: `candidate_triage` · subagent `agent-7` · repo `/home/fish/projects_mine/dsh-grok-workflow`,
branch `main`, HEAD `bffd0b4`, version `0.12.14` (`package.json:3`).
Measured 2026-11-21T01:28 → 01:35 +08:00. Method: `git`, `sed`, `grep`, two throw-away vitest
probes under the gitignored `.tmp/`, plus the two target specs. No network, no model, no commit,
no code edit. Probe dir was deleted after the runs; the only file this task added is this report.

Status vocabulary per `AGENTS.md`: `CONFIRMED` = read in source or measured by a command in this
run; `HYPOTHESIS` = plausible, unmeasured; `NOT_RUN` = deliberately not executed.

---

## 0. Precondition the round cannot skip

`bash .rsi/tools/heartbeat-guard.sh --round auto` → `SKIP code=dirty-tracked next_round=39
threshold=3 max_rounds=0 blocked_streak=0 round_max=38 ledger_max=38 dirty_tracked=8`
(`CONFIRMED`, this run). Eight tracked files are dirty: six are the unlanded delivery change
(`src/delivery/index.ts`, `test/delivery-human-block.spec.ts`,
`lib/delivery/index.{js,d.ts,js.map,d.ts.map}`) and two are its round-39 bookkeeping
(`.rsi/POOL.md` carries the `R39 DONE` + `PRESERVED` entries; `.rsi/evidence/stop-probes.txt`
carries `round=39 -> STOP ABSENT`).

Consequence: **no round opens until that set is committed or reverted.** That work is owned; this
triage does not touch `src/delivery/**`, `test/delivery-human-block.spec.ts`, `lib/delivery/**` or
`.rsi/POOL.md`. All three proposed candidates are free of those paths, so the round can start the
moment the delivery change lands. A second worker was writing
`.rsi/evidence/baseline-round40-test-baseline.md` at 01:24–01:28 during this run — the tree is not
quiet, so re-check `git status --short` at round start rather than trusting this snapshot.

Pool state: `grep -c "^- P ·" .rsi/POOL.md` = **19** open rows; `.rsi/POOL.md` is 259 lines.

---

## 1. Ranked candidates (kept)

Ranking criterion: correctness and documented-invariant violations first, wording and style last.

### W1 — rank 1 · class: FIX (documented invariant is false; run loses its checkpoints) · size M

**Claim.** The checkpoint run path writes values the schema refuses, and the code comment, the
architecture doc and the pool entry all say the opposite.

1. `CHECKPOINT_LIMITS.msCeiling` is `Number.MAX_SAFE_INTEGER` (`src/checkpoint/schema.ts:106`),
   and its docblock (`:100-105`) claims it "Accepts … any configured timeoutMs up to MAX_SAFE_INTEGER, so a
   checkpoint records the configured deadline honestly instead of refusing or clamping it".
   The guard implements exactly that comparison (`src/checkpoint/wiring.ts:541-545`).
2. But the value actually written is a **timestamp**: `deadlineAtMs = startedAtMs + timeoutMs`
   (`wiring.ts:591-595`), and the schema requires a *safe* integer
   (`integer()` → `Number.isSafeInteger`, `schema.ts:343-348`).
3. `resolveConfig` accepts `timeoutMs` up to `Number.MAX_SAFE_INTEGER`
   (`src/config.ts:806`, `:486`), so the hole is reachable from user configuration, not only from a
   programmatic caller.

**Measured** (probe at `.tmp/probe41/probe.spec.ts`, since deleted; real `createCheckpointRecorder`,
real clock, `limits.timeoutMs = Number.MAX_SAFE_INTEGER`):

```
outcomes = [{"ok":false,"reason":"invalid","detail":"checkpoint time.deadlineAtMs must be a safe integer","terminal":false} ×3, null]
stats    = {"writes":0,"failures":3,"writesStopped":true,...}
```

Every write is refused; after three consecutive failures the recorder stops for the run
(`wiring.ts:909-918`) — so a long run with a huge `timeoutMs` produces **no checkpoint at all** and
the only trace is three warnings. That is the "run can never be resumed" failure mode.

4. Second defect in the same file, same theme (a value the recorder hands the schema): a
   caller-supplied `git` provider returning `head: ''` is passed through unfiltered
   (`wiring.ts:757`) and every write is refused with
   `checkpoint git.head must be 7-64 hex characters (got "")` (measured, four ticks, same
   `writesStopped: true` dead end). `src/checkpoint/schema.ts:684-688` lowercases and requires
   7–64 hex. No test anywhere supplies a `git` provider — `grep -rn "git: ()" test/` and
   `grep -n "git:" test/checkpoint-wiring.spec.ts test/checkpoint-engine-wire.spec.ts` are both
   empty (`CONFIRMED`).
5. The documentation asserts the property that fails: `docs/ARCHITECTURE.md:542-545` says
   "`msCeiling` (604,800,000 = 7 days) bounds durations and timeouts so that any
   `HARD_LIMITS.timeoutMs` the plugin accepts stays recordable (`src/checkpoint/schema.ts:95`,
   `:101`; `src/config.ts:14`)". All three anchors are wrong: `schema.ts:95-96` is
   `countCeiling`, the ceiling is `MAX_SAFE_INTEGER` not 604,800,000, and `HARD_LIMITS` has no
   `timeoutMs` field at all (`src/config.ts:6-62`).

**Touch map**

| path | change |
| --- | --- |
| `src/checkpoint/wiring.ts` | bound the *timestamp* (`startedAtMs + timeoutMs` must stay a safe integer) not only the duration; omit `time.git.head` when the provider supplies an empty/whitespace head. Ordering wrinkle: `recordableTimeoutMs` is computed at `:541` but `startedAtMs` only exists at `:553`, so `const startedAtMs = options.startedAtMs ?? clock()` must move above it — one `clock()` call, unchanged seam |
| `src/checkpoint/schema.ts` | docblock at `:100-105` only (comment; the ceiling does not buy recordability — the timestamp rule lives in wiring) |
| `test/checkpoint-wiring.spec.ts` | 3 new cases: huge `timeoutMs` → write `ok`, `deadlineAtMs` absent; `git: () => ({ head: '', dirty: false })` → write `ok`, `git.head` absent; boundary `startedAtMs + timeoutMs === MAX_SAFE_INTEGER` still records |
| `docs/ARCHITECTURE.md` | the `msCeiling` paragraph: correct value, correct anchors, correct invariant |
| `lib/checkpoint/wiring.*`, `lib/checkpoint/schema.*` | `npm run build` output (tracked; `verify:lib` requires it) |

Baseline for the spec: `npx vitest run test/checkpoint-wiring.spec.ts` → 31 tests passed
(`CONFIRMED`). Both changes are omissions, never clamps, so no existing assertion on "omitted,
never clamped" semantics moves.

### W2 — rank 2 · class: FIX (test reliability; the gate is red in this tree) · size XS

**Claim.** `test/tmp-ledger-probe.spec.ts` is untracked, inside the vitest include glob
(`test/**/*.spec.ts`, `vitest.config.ts:7`), and failing — so `npm run ci`
(`typecheck && lint && verify:lib && npm test`, `package.json:64`) cannot be green here.

**Measured** (`npx vitest run test/tmp-ledger-probe.spec.ts`):

```
FAIL test/tmp-ledger-probe.spec.ts > probe > measures the ledger clamp
Error: workflow result completed lacks confirmed evidence for task a0 criterion
  ❯ assertWorkflowReport src/report.ts:586:17
Test Files 1 failed (1) · Tests 1 failed (1)
```

It is a measurement probe, not a test: 66 lines, `console.log` per pad width and a closing
`expect(true).toBe(true)`. Its subject — astral-safe clamping of the human block — is already
pinned in the (dirty but committed-intent) delivery spec: `test/delivery-human-block.spec.ts:398`
carries the lone-surrogate helper and `:543`/`:550` are the two lone-surrogate tests
(`CONFIRMED`). Deleting the probe therefore loses no coverage and weakens no assertion — the
red-line "no weakening" rule is not engaged.

**Touch map**

| path | change |
| --- | --- |
| `test/tmp-ledger-probe.spec.ts` | delete (untracked; `git status --short test/` shows it as the only `??` under `test/`) |

### W3 — rank 3 · class: FIX (wrong number announced; dead path) · size S · **designated yield**

**Claim.** `repairLimitOverruns` clamps pre-T4 removed keys to `LEGACY_LIMIT_CAPS`
(`src/config.ts:893-904`) and announces caps that are not the values the plugin actually fixes.

**Measured** (probe via `repairLimitOverruns`, since deleted):

```
{"maxActiveRuns":5}      -> repaired {"maxActiveRuns":4}      warning "…over the hard maximum 4…"
{"maxActiveRunsTotal":20}-> repaired {"maxActiveRunsTotal":16} warning "…over the hard maximum 16…"
{"recordLimit":999}      -> repaired {"recordLimit":256}       warning "…over the hard maximum 256…"
FIXED_MAX_ACTIVE_RUNS = 2   FIXED_MAX_ACTIVE_RUNS_TOTAL = 8
```

`src/config.ts:254-256` fixes 2 and 8; both READMEs publish 2 and 8
(`README.md:247`, `README.zh-CN.md:237`). So the repair announces 4/16 and leaves a value that
still overruns the fixed cap. `recordLimit` (256) happens to match. The legacy branch appears in
**no** test: `grep -rn "LEGACY_LIMIT_CAPS" test/ src/` matches only `src/config.ts` (`CONFIRMED`),
and `grep -n "maxActiveRuns" test/config-limits-repair.spec.ts` is empty.

**Touch map**

| path | change |
| --- | --- |
| `src/config.ts` | `LEGACY_LIMIT_CAPS`: read `maxActiveRuns`/`maxActiveRunsTotal` (and any other mismatch) off the same constants the fixed values come from, so the announcement cannot drift again |
| `test/config-limits-repair.spec.ts` | 2 cases: the announced cap equals `FIXED_MAX_ACTIVE_RUNS`/`_TOTAL`; a legal value still says nothing |
| `lib/config.*` | `npm run build` output |

Baseline: `npx vitest run test/config-limits-repair.spec.ts` → 24 tests passed (`CONFIRMED`).
Harm is limited: `maxActiveRuns` is in `REMOVED_CONFIG_KEYS` (`config.ts:351`), so the normal load
path refuses the row before the repair runs; only a direct/programmatic caller sees it. This is
why W3 is the yield and not rank 1.

---

## 2. Disjointness matrix (zero overlap)

`write` = edited by that candidate; `read` = inspected only. Round-level files are excluded by
rule (§3).

| path | W1 | W2 | W3 |
| --- | --- | --- | --- |
| `src/checkpoint/wiring.ts` | **write** | | |
| `src/checkpoint/schema.ts` | **write** (docblock `:100-105`) | | |
| `test/checkpoint-wiring.spec.ts` | **write** | | |
| `docs/ARCHITECTURE.md` | **write** (`:542-545`) | | |
| `lib/checkpoint/wiring.*` / `schema.*` | **rebuild** | | |
| `test/tmp-ledger-probe.spec.ts` | | **delete** | |
| `src/config.ts` | | | **write** |
| `test/config-limits-repair.spec.ts` | | | **write** |
| `lib/config.*` | | | **rebuild** |
| `src/checkpoint/writer.ts` | read | | |

No path is written by two candidates. No candidate writes `src/delivery/**`,
`test/delivery-human-block.spec.ts`, `lib/delivery/**`, `.rsi/POOL.md` — the currently dirty set.

---

## 3. Round-level files (assigned to no candidate)

`CHANGELOG.md` is written **once** per round, in both languages, per `AGENTS.md`
("Release and version discipline"); if it were attached to two candidates the map would overlap.
It therefore belongs to the round integrator, not to W1/W2/W3. `package.json` /
`package-lock.json` change only when preparing a release and are out of scope here.

---

## 4. Round size and why

The dynamic rule (context §1: 1–4 items, hard ceiling 6, file-disjoint only, prior-round
smoothness adjusts, small doc fixes allow more, core changes fewer):

- **Proposed count: 3** (W1, W2, W3).
- **Prior-round smoothness argues for the low end.** Two consecutive attempts (rounds 39/40) never
  closed: `round_max=38` / `ledger_max=38` against `next_round=39`, 8 dirty tracked files, one red
  stray spec, 30 untracked files. That is not a round to run at 5 or 6.
- **W1 is a core change** (checkpoint run path + a tracked `lib/` rebuild) and "core changes allow
  fewer" caps the count at 3. W2 is a one-file deletion; W3 is small and in one config file.
- **W3 yields on conflict**: if any of its three paths is held at round start, drop W3 and run
  W1 + W2 (2 items); W3 becomes `deferred-priority-next-round`. W1 never yields (it is the
  important work of the round); if W1's path were held, the round waits rather than substituting.
- Nothing here is a small doc fix, so the "docs allow more" allowance is not used this round.

**Execution order:** W2 first (one `rm` makes `npm test` collect a green set), then W1, then W3.

---

## 5. Deferred — `deferred-priority-next-round`

| # | item | files (verified live) | size | why deferred |
| --- | --- | --- | --- | --- |
| D1 | Resume `retain` promise vs plan contents: `preserve` carries only `outputs`/`files`/`evidence` (`src/resume/policy.ts:130-136`, type `:54-58`) while the action documents "Keep the task as-is" (`:45`) and "nothing is re-run" (`:96-99`); `completed` is retained with no evidence while a bare `success` is refused (`:116-119`) | `src/resume/policy.ts`, `test/resume-validator.spec.ts`, `lib/resume/policy.*` | S/M | the cheap half is a doc-comment wording change, the real half is a product decision (should a restore plan carry `title`/`attempt`?) — a triage read cannot settle intent, and `test/resume-validator.spec.ts:256-272` + `test/recovery-kill-restart.spec.ts:273-274` pin the current shape |
| D2 | Panel truth at both ends (POOL rows 6–10): edge nodes fall back to `notReported`; `meta.phases` is dropped at `run-start` (`src/records.ts:616`, and `grep -n phases src/records.ts` = no match); the fixtures feed a stream shape the recorder cannot produce | `src/client/index.js`, `src/records.ts`, `lib/client.js` (byte-identical to the source per `scripts/build-client.mjs:4`), `lib/records.*`, `test/client.spec.ts`, `test/progress.spec.ts`, `test/progress-tab.spec.ts` | M/L | five defects at once, a client-bundle rebuild, and a record-type decision — cannot ride beside a core checkpoint change |
| D3 | Docs reconciliation: mark POOL rows 17–19 `STALE`/`DONE` (all three measured superseded — `grep -n "synthesis: deterministic\|more than three routes" README.md README.zh-CN.md` returns only the legitimate `switchOn=[]` line at `README.md:247`) **and** land the preserved round-39 checkpoint docblock (`src/checkpoint/schema.ts:55-63` via `.rsi/evidence/round-039/preserved/checkpoint-docblock.patch`, which passes `git apply --check`, + `test/checkpoint-bound.spec.ts` from `…/checkpoint-bound.spec.ts.txt`) | `.rsi/POOL.md`, `src/checkpoint/schema.ts`, `test/checkpoint-bound.spec.ts`, `lib/checkpoint/schema.*` | S | `.rsi/POOL.md` is dirty (owned by the unlanded delivery change) and this is polish; also collides with W1 on `src/checkpoint/schema.ts` **as a file**, so it must land after W1 and be rebased on its comment change |

Also still open, low value, not scheduled: the two coverage-only pool rows (six config fail-closed
branches; five validator refusal branches) and the integrity-normalization question
(`writer.ts:160` + `schema.ts:468-482`, verified over the validator's rebuilt object, so a case-only
`git.head` change still verifies) — the last one is arguably intentional normalization, `H` on intent.

---

## 6. What this triage established and what it did not

**Established by measurement (all commands run in this session):** the dirty-tracked set and the
gate verdict that follows from it (§0); the two checkpoint dead ends with their exact refusal
strings and `writesStopped: true` (§1 W1); the absence of any test supplying a `git` provider
(W1); the stray spec's failure and its being inside the include glob (W2); the 4/16 vs 2/8 repair
mismatch and the fixed constants (§1 W3); baseline spec counts 31 and 24 (`CONFIRMED`); the
preserved patch applying cleanly (`git apply --check`); the file-disjointness matrix (§2).

**`NOT_RUN`:** the full `npm run ci` — the red is established by running the exact collected file,
not the whole suite; `npm run build` (no lib/ was touched, and the two rebuilt sets are estimated
from the tracked artifacts that exist today: `lib/checkpoint/wiring.{js,d.ts,js.map,d.ts.map}`,
`lib/config.*`); any behaviour of a fix (none was implemented); whether W3's dead path is reachable
through a real settings load (the removed key is refused first, which is exactly why W3 is low).
