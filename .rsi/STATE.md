Updated: 2026-11-21T01:58+08:00 · round 39 (delivery pair clamp keeps both 4800 verdicts + `Model routes:` refuses illegal chains) · `npm run ci` 70 files / 1296 tests PASS · code+evidence commit `01272af` · release `0.12.15` on `01272af` · tag `v0.12.15` pushed (remote `8a13c46`) · remote CI `44788061342` success / Release `44788066114` success · evidence `.rsi/evidence/round-039/`

Previous rounds: `0.12.14`/`c0eabef` (compact 回执，CI `44760621921`, Release `44760644587`) · `0.12.13`/`e80ed6d`（合并 `5fb5da0`） · `0.12.12`/`61c7cb8` (36, 协作轮) · `0.12.9`/`5d3bcea` (34) · `0.12.8`/`9f91684` (33, CI `44670766356`, Release `44670771402`) · `0.12.6`/`e7150ab` (30, CI `44659057507`, Release `44659061505`) · `0.12.5`/`5b7cae1` (29, CI `44656151053`, Release `44656153854`) — 每轮细节在 `.rsi/ROUND.md`、`.rsi/LOG.md`、`.rsi/ledger.jsonl`。
## Facts

- Round 39 (this round): bilingual delivery was bounded by slicing the concatenation of the two
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
- **PRESERVED, ready to land** (`POOL.md` → Checkpoint and resume, PRESERVED entry): the
  checkpoint-bound docblock + spec at `.rsi/evidence/round-039/preserved/` — a docs-only round, no
  version bump; and `test/config-chain-types.spec.ts`, whose coverage overlaps the committed
  `test/config.spec.ts` case (decide before adding it, or the count grows without a second behaviour). S / low.
- Still open and next in line: `repairLimitOverruns` still clamps seven removed keys through
  `LEGACY_LIMIT_CAPS` (dead path, misleading warning), six fail-closed config branches with no test,
  the "bilingual" mirror repeating one sentence, the fallback-partial `0 项没做成`, `dedupeBilingual`,
  `progress.notReported`, the resume policy/integrity/validator items, the README model/validation
  bullets and `DESIGN-progress-tab.md`. Start at the top of `POOL.md`.
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
