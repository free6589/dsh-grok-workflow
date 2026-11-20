Updated: {{STAMP}} · round 39 (交付边界：双语 4800 上限两侧各保结论 + 台账 `Model routes:` 行拒绝非法链) · `npm run ci` 70 files / 1296 tests PASS · release `0.12.15` on `{{SHA}}` · tag `v0.12.15` pushed (object `{{TAGOBJ}}`) · remote CI `{{CI}}` / Release `{{REL}}` · evidence `.rsi/evidence/round-039/`

Previous rounds: `0.12.14`/`c0eabef` (compact 回执) · `0.12.13`/`e80ed6d`（合并 `5fb5da0`） · `0.12.12`/`61c7cb8` (36, 协作轮) · `0.12.9`/`5d3bcea` (34) · `0.12.8`/`9f91684` (33, CI `44670766356`, Release `44670771402`) · `0.12.6`/`e7150ab` (30, CI `44659057507`, Release `44659061505`) · `0.12.5`/`5b7cae1` (29, CI `44656151053`, Release `44656153854`) — 每轮细节在 `.rsi/ROUND.md`、`.rsi/LOG.md`、`.rsi/ledger.jsonl`。

## Facts

- Round 39 (this round): bilingual delivery was bounded by slicing the concatenation of the two
  blocks, and 2400 + 2399 + 2 = **4801** — one over the 4800 cap — so the blind cut ate the last
  characters of the **second** language's verdict (`明细已记入台…`). `pairCaps` now splits the budget
  (measured: `pairCaps(2400,2400)=[2399,2399]`, `(2400,2399)=[2399,2399]`, `(2400,100)=[2400,100]`),
  `clampHumanBlock` reserves the tail, shrinks the head before it, cuts the middle at a line
  boundary and marks the junction, and every human-block cut goes through `cutCodeUnits` (no lone
  surrogate). Same module: `machineLedger` handed `report.routing` to `Array#join` (number/`null`/
  object coerced into a readable route; non-array chain = bare `TypeError`) — `routeChains` refuses
  with path + shape, `deliverReport` drops the ledger instead of the answer when it refuses
  (`text === human`). Red 14 failed / 20 passed (34, detatched worktree at `bffd0b4`) → green 39.
  26 new `it(` = 14 pins + 5 `pairCaps` direct + 7 regression guards (stated, not fudged).
  **Provenance:** the change set was inherited uncommitted from the interrupted round-37/40 attempts
  in this checkout (mtimes 23:14:35 — the 0.12.14 release stashed and restored them on purpose);
  this round verified it independently, closed the records and released it. The other leftovers
  (checkpoint docblock + `test/checkpoint-bound.spec.ts`, `test/config-chain-types.spec.ts`) are
  **preserved, not shipped**: `.rsi/evidence/round-039/preserved/` (+ `git apply --check` on the
  patch), recorded in `POOL.md` as PRESERVED.
- Round 37: a `roles` value that is not an object loaded with five empty chains — `assertKnownKeys`
  now refuses it with its shape; the harness got `shape: single` (one arming action reaches round
  1000), `--arm-spec`, `--verify-row` and `--round auto` (`D-093`, `A42`).
- Round 36: the 2400-char human-block clamp kept the head and cut the verdict; it now keeps head +
  tail and cuts the middle (`aa5e79c`, shipped in `0.12.12`).
- Round 34: double-escaped (`\\n`) folded base64 key breaks are matched (`D-089`, `0.12.9`).
- Round 33: base64 blocks folded narrower than 24 columns are redacted (fold-tolerant windows) and
  `.rsi/ledger.jsonl` was backfilled so the gate stops reading `round-without-ledger` (`0.12.8`).
- Round 31/30/29/28/27: checkpoint payload-ceiling comment corrected to 1,048,447; GnuPG and PEM
  base64-wrapped private keys redacted in encoded form; cancelled terminal composes
  `humanConclusion`; `integrity.bytes` reads against the writer's bound.
- Repo: `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`, remote `origin`
  = https://github.com/free6589/dsh-grok-workflow.git. Test-count line: 68/1230 (round 27) →
  69/1262 (37) → 70/1269 (compact) → **70/1296** (this round, +1 new case and the 0.12.14 line).

## Installed profile (web)

- `~/.dsh/profiles/web` carries `dsh-grok-workflow` at `#v0.12.14` (pinned). This round did **not**
  touch the profile: installing `0.12.15` is one operator action
  (`dsh plugin --profile web add github:free6589/dsh-grok-workflow#v0.12.15`). DSH host pid `154637`
  has run since 2026-11-17T22:49:32 without a restart through every profile update.

## Pool (`.rsi/POOL.md`)

- Closed by round 39: the 4800 pair cap losing the second verdict (R36 follow-on) and the ledger's
  route line coercing a non-label entry.
- **Preserved, ready to land** (`POOL.md` → Checkpoint and resume, PRESERVED entry): the
  checkpoint-bound docblock + spec at `.rsi/evidence/round-039/preserved/` — a docs-only round, no
  version bump; and `test/config-chain-types.spec.ts`, whose coverage overlaps the committed
  `test/config.spec.ts` case (decide before adding it, or the count grows without a second behaviour).
- Still open and next in line: `repairLimitOverruns` still clamps seven removed keys through
  `LEGACY_LIMIT_CAPS` (dead path, misleading warning), six fail-closed config branches with no test,
  the "bilingual" mirror repeating one sentence, the fallback-partial `0 项没做成`, `dedupeBilingual`,
  `progress.notReported`, the resume policy/integrity/validator items, the README model/validation
  bullets and `DESIGN-progress-tab.md`. Start at the top of `POOL.md`.
- The ledger's own 8,000-character clamp is pooled (no validated report reaches it, so no measured
  shape to pin); the human-block clamps are covered by `cutCodeUnits`.

## Failures / counters

- Consecutive failed rounds: 0. Consecutive no-value rounds: 0.
- Review: first fresh-context reviewer FAIL (4 items) → 2 real defects fixed (ledger-clamp comment
  narrowed + pooled; `deliverReport` drops the ledger instead of the answer, new test), 2 items were
  the release-staged changelog being read as a lost write. Second pass required before the tag.
- Standing `NOT_RUN` (operator action, D-066): a real scheduled heartbeat delivery, a real GUI click
  through the bilingual switch, and installing `0.12.15` into the web profile.
