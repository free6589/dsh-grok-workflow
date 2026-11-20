Updated: 2026-11-21T07:55+08:00 · round 41 CLOSED (S1 docs-only: checkpoint byte-bound docblock + pinning spec land byte-identical from preserved) · `npm run ci` 71 files / 1302 tests PASS · no version bump — `0.12.15` (`01272af`) stays the published release · gate `RESUME next_round=42`

Previous rounds: `0.12.14`/`c0eabef` (compact 回执，CI `44760621921`, Release `44760644587`) · `0.12.13`/`e80ed6d`（合并 `5fb5da0`） · `0.12.12`/`61c7cb8` (36, 协作轮) · `0.12.9`/`5d3bcea` (34) · `0.12.8`/`9f91684` (33, CI `44670766356`, Release `44670771402`) · `0.12.6`/`e7150ab` (30, CI `44659057507`, Release `44659061505`) · `0.12.5`/`5b7cae1` (29, CI `44656151053`, Release `44656153854`) — 每轮细节在 `.rsi/ROUND.md`、`.rsi/LOG.md`、`.rsi/ledger.jsonl`。
## Facts

- Round 40 (this round, closed): `repairLimitOverruns` no longer clamps removed keys through
  `LEGACY_LIMIT_CAPS` — the branch "repaired" `maxRetries:5→3` / `maxActiveRuns:5→4` and announced a
  cap it could not deliver (the run enforces `FIXED_MAX_ACTIVE_RUNS=2`), yet `resolveConfig` still
  refused the repaired shape (`unknown configuration key`), so the clamp saved nothing and the
  warning lied. `LEGACY_LIMIT_CAPS`, `LegacyLimitField`/`OverrunField`, `legacyRecordOverrun` and the
  second loop are deleted (net -44 lines in `src/config.ts`); removed keys are left untouched so
  `assertKnownKeys` names the real defect. Live-table behaviour unchanged (`maxConcurrency:120→100`
  still clamps and loads). `lib/config.*` rebuilt from this tree, not hand-edited. Measured red→green
  in `.rsi/evidence/round-040/`. **Version:** no bump and no tag — `0.12.15` (`01272af`, remote tag
  `8a13c46`) stays the published release; this fix sits unreleased and suggests patch.
  **Next action:** the round-41 shortlist below.
- **Numbering reconciled (round-40 closeout):** `test/delivery-human-block.spec.ts` labelled its
  cases `round 37` (5 cases) and `round 40` (2 cases) for work that the commit message, `ROUND.md`
  §39, the LOG row and the ledger all attribute to **round 39**; both labels came from the
  interrupted round-37/40 attempts that produced the set. All ten label sites (two section comments
  plus eight `describe` titles) now say `round 39`, matching `01272af`. Comment/title text only — no
  assertion, fixture or expectation was touched. Round 37 stays `roles`-shape + harness arming, round
  38 stays non-string `model`/`provider`, round 40 stays this config repair. The pre-ship capture
  `.rsi/evidence/delivery-round40.md` keeps its verbatim outputs under a provenance header.
- Round 39: bilingual delivery was bounded by slicing the concatenation of the two
  blocks, and 2400 + 2399 + 2 = **4801** — one over the 4800 cap — so the blind cut ate the last
  characters of the **second** language's verdict (`明细已记入台…`). `pairCaps` now splits the budget
  (measured: `pairCaps(2400,2400)=[2399,2399]`, `(2400,2399)=[2399,2399]`, `(2400,100)=[2400,100]`),
  `clampHumanBlock` reserves the tail, shrinks the head first, cuts the middle at a line boundary
  and marks the junction, and every human-block cut goes through `cutCodeUnits` (no lone surrogate).
  Same module: `machineLedger` handed `report.routing` to `Array#join` (number/`null`/object coerced
  into a readable route; non-array chain = bare `TypeError`) — `routeChains` refuses with path +
  shape, `deliverReport` drops the ledger instead of the answer when diagnostics are on
  (`text === human`). Red 14 failed / 20 passed (34, detached worktree at `bffd0b4`) → green 39.
  26 new `it(` = 14 pins + 5 `pairCaps` direct + 7 regression guards (stated, not fudged).
  **Provenance:** the change set was inherited uncommitted from the interrupted round-37/40 attempts
  in this checkout (the 0.12.14 release stashed and restored them on purpose); this round verified
  it independently (A1 delivery audit + A2 docs line + C test re-measure 39/40 + D fresh review PASS),
  deleted the `test/tmp-ledger-probe.spec.ts` leftover, and shipped it via `finish-round.py`.
  The other leftovers (checkpoint docblock + `test/checkpoint-bound.spec.ts`,
  `test/config-chain-types.spec.ts`) are **preserved, not shipped**:
  `.rsi/evidence/round-039/preserved/` (+ `git apply --check` verified), recorded in `POOL.md` as PRESERVED.
- Round 38: a non-string `model`/`provider` now refused with path and got-type (was bare `TypeError`).
- Round 37: a non-object `roles` refused with its shape; harness `shape: single` (one arming action
  reaches round 1000), `--arm-spec`, `--verify-row`, `--round auto` (`D-093`, `A42`).
- Round 36: the 2400-char human-block clamp keeps head + tail and cuts the middle (`aa5e79c`,
  shipped in `0.12.12`).
- Round 34: double-escaped (`\\n`) folded base64 key breaks are matched (`D-089`, `0.12.9`).
- Round 33: base64 blocks folded narrower than 24 columns are redacted (fold-tolerant windows) and
  `.rsi/ledger.jsonl` was backfilled (`0.12.8`).
- Round 31/30/29/28/27: checkpoint payload-ceiling comment corrected to 1,048,447; GnuPG and PEM
  base64-wrapped private keys redacted in encoded form; cancelled terminal composes
  `humanConclusion`; `integrity.bytes` reads against the writer's bound.
- Repo: `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`, remote `origin`
  = https://github.com/free6589/dsh-grok-workflow.git. Test-count line: 68/1230 (round 27) →
  69/1263 (38) → **70/1296** (this round).

## Installed profile (web)

- `~/.dsh/profiles/web` carries `dsh-grok-workflow` at `#v0.12.14` (pinned). This round did **not**
  touch the profile: installing `0.12.15` is one operator action
  (`dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.12.15`). DSH host pid `154637`
  has run since 2026-11-17T22:49:32 without a restart through every profile update.

## Pool (`.rsi/POOL.md`)

- Closed by round 39: the 4800 pair cap losing the second verdict (R36 follow-on) and the ledger's
  route line coercing a non-label entry.
- Closed by round 41 (S1): the preserved checkpoint-bound docblock + spec landed byte-identical
  (file-vs-payload split, 122/129/1,048,447, seal-vs-write, comment pinned). Red 1 failed /
  4 passed on the old comment → green 5 passed; 4/5 behaviour-overlap with
  `test/checkpoint-schema.spec.ts` honestly stated, 2 genuine new pins.
  Still PRESERVED: `test/config-chain-types.spec.ts` (decide vs `config.spec.ts` before adding).
## Next round shortlist (round 42) — 3 candidates, disjoint file lists

Take one whole round from this list; none of them shares a file with another, so a later round can
pick the next without a merge question. Ordered by cost, cheapest first. (S1 landed in round 41.)

1. **S2 · config fail-closed coverage** — the six untested refusal branches. Files: `src/config.ts`
   (`:654`, `:444`, `:462`, `:438`, `:680`, `:826`) plus `test/config-limits-repair.spec.ts`.
   Coverage only; a mutation run is needed to show each branch bites. S / low.
2. **S3 · resume validator coverage** — the five untested refusal branches. Files:
   `src/resume/validator.ts` (`:231`, `:274`, `:290`, `:296`, `:308`) plus `test/resume-validator.spec.ts`.
   Coverage only. S / low.
3. **S4 · docs truth pass** — the README examples the loader refuses (`synthesis: deterministic`, the
   removed `switchOn` key; EN ~176-183, zh ~169-176) and the stale "more than three routes" bullet
   (real limit `HARD_LIMITS.chainLength` = 50). File: `README.md` only. S / low.

- `test/config-chain-types.spec.ts` (preserved) overlaps the committed `test/config.spec.ts` case —
  decide before adding it, or the test count grows without a second behaviour.
- Deferred, not in the shortlist (needs a measured shape or a product decision): the "bilingual"
  mirror repeating one sentence, the fallback-partial `0 项没做成`, `dedupeBilingual`,
  `progress.notReported`, the resume integrity/`recordableTimeoutMs` items, the ledger's own
  8,000-character clamp, and `DESIGN-progress-tab.md` §4. Still listed in `POOL.md`.
- The ledger's own 8,000-character clamp is pooled (no validated report reaches it, so no measured
  shape to pin it with yet); the human-block clamps are covered by `cutCodeUnits`.

## Failures / counters

- Consecutive failed rounds: 0. Consecutive no-value rounds: 0.
- Review: D round-39 first-pass notes were 4 items in the round report (2 were the staged-changelog
  read, 2 were real defects fixed before landing: ledger-clamp comment narrowed + pooled,
  `deliverReport` drops the ledger instead of the answer). Second pass: D PASS with 1 mandatory
  pre-stage deletion (`test/tmp-ledger-probe.spec.ts`, done). C re-measured 39/40 green,
  typecheck 0, lint 0 errors, verify:lib 153 files byte-identical.
- Standing `NOT_RUN` (operator action, D-066): a real scheduled heartbeat delivery, a real GUI click
  through the bilingual switch, and installing `0.12.15` into the web profile.
