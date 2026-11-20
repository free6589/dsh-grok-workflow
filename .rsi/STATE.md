Updated: 2026-11-20T14:20+08:00 · round 37 (roles shape refused; harness now needs ONE arming action) · `npm run ci` 69 files / 1261 tests PASS · code commit `eb61ac8` · harness commit `621f2ab` · no release this round (`0.12.12` was published by the concurrent agent on `61c7cb8`)

Previous rounds: `0.12.8`/`9f91684` (33, CI `44670766356`, Release `44670771402`) · `0.12.7`/`56e701d` (32) · `0.12.6`/`e7150ab` (30, CI `44659057507`, Release `44659061505`) · `0.12.5`/`5b7cae1` (29, CI `44656151053`, Release `44656153854`) · `0.12.4`/`5cd2b1c` (28, CI `44652383452`, Release `44652387975`) · `0.12.3`/`fd6a5ee` (27, CI `44647313571`, Release `44647317251`) · `0.12.2`/`40228c5` · `0.12.1`/`23d3369` — per-round detail lives in `.rsi/ROUND.md`, `.rsi/LOG.md` and `.rsi/ledger.jsonl`.
## Facts

- Round 37 (this round): `resolveConfig` read `config.roles?.planner`, so a `roles` that was a string, an
  array or `null` produced `undefined` for all five roles — the load succeeded with **no route configured**
  and the report said "inherit the run's route" five times. `assertKnownKeys` now refuses a present,
  non-object `roles` with its shape named (`got a string "worker:m1"`); absent `roles` and `{}` still load,
  and the chain-shorthand case is still `resolveChain`'s. Red/green: the new case fails on the pre-change
  reader (1 failed, `.rsi/evidence/harness/round-037-red.txt`) and `test/config.spec.ts` is 39 passed after.
  The same round replaced the harness's default shape: `single` — one row carries the whole remaining
  `COUNT`, so round 1000 costs **one** arming action instead of ten (D-092's cost was in direct conflict
  with "no prompting"). New: `iterate-plan.mjs --arm-spec` (slot title, row to edit, `rrule`, prompt size
  against the 4000-char bound), `--verify-row` (reads the host schedule store, prompt **lengths only**,
  `COUNT - deliveries` vs remaining → `ARMED`/`NOT_ARMED`/`UNKNOWN`), the constant arm prompt
  `.rsi/HEARTBEAT-PROMPT.md` (measured 2,319 chars), and `heartbeat-guard.sh --round auto` (round from
  `ROUND.md`/`ledger.jsonl`, higher wins, +1). Measured on this host: `--verify-row` → `NOT_ARMED`,
  `covered=4` vs `remaining=965` — the loop is still unarmed, and that is now a measurement, not a claim.
  `npm run ci` 69 files / 1261 tests PASS. `D-093`, `A42`. Evidence `.rsi/evidence/harness/`.
- Round 34 (this round): a log line that already carries literal `\n` breaks, forwarded inside another
  JSON document, doubles every backslash; `BASE64_BREAK` only knew the single form, so a folded base64
  private-key block reached reports verbatim (measured on the pre-round source: the new case keeps a
  `nIEtFWS0tLS0tCk1NTU1NTU1N` run). The break now also matches the doubled form (`D-089`), which keeps the
  rule pure-regex so `src/script.ts` still mirrors `REDACTION_RULES` by `pattern.source`. Measured: PGP
  public key and certificate stay untouched across real-newline / `\n` / `\\n` folds, prose with `\\n`
  is returned unchanged, private key redacted in all three forms with the JSON still parseable; cost is
  unchanged (174,000 B prose 9.14 ms → 9.08 ms A/B, `perf-probe.mjs`). Red/green: pre-round source
  **1 failed**, after **41 passed** (baseline 40); `npm run ci` 68 files / 1232 tests PASS.
  **Provenance:** this attempt inherited the round-34 change set uncommitted from the interrupted prior
  attempt (whose `npm run ci` was red only on the round-33 ledger invariant — `ROUND.md` documented
  round 34 with no ledger row); round 33 itself was already landed and released as `0.12.8` at `06651e0`.
  This attempt verified the change independently, closed the records and landed the release.
  Evidence `.rsi/evidence/round-034/`.
- Round 33: a base64 block folded narrower than its own encoded banner (a `fold -w 8`
  key file, an editor-wrapped paste) reached reports verbatim — the marker was a contiguous
  20-character literal, so the fold split the marker itself; measured widths 8/12/16/19/20/21/22/23
  all kept 100% of the block and 24 was the first width that redacted. The nine windows are now
  generated (`BASE64_PRIVATE_KEY_WINDOWS` + `foldable()`) with `BASE64_BREAK` allowed between any two
  characters (real newline or the JSON `
` escape), continuation floor 16 → 8, and
  `BASE64_BLOB_END` anchors each continuation line so prose is not eaten (`D-088`, `A37`).
  A fold of ≤7 columns is left alone and pooled. The same round repaired the loop's own gate:
  `.rsi/ledger.jsonl` stopped at round 25 while `ROUND.md` documented 27–32, so
  `heartbeat-guard.sh` read `code=round-without-ledger` (SKIP on every heartbeat, STOP after three);
  six rows backfilled and `test/rsi-ledger.spec.ts` pins the invariant. Red/green: pre-round source
  2 failed / 38 passed → 40 passed; ledger test 1 failed on the old ledger → 5 passed.
  Released `0.12.8`: tag `v0.12.8` on `9f91684`, remote CI `44670766356` success, Release
  `44670771402` success (asset `dsh-grok-workflow-0.12.8.tgz`, 602,301 B).
  Evidence `.rsi/evidence/round-033/`.
- Round 36: the 2400-char human-block clamp kept the head and cut the verdict; it now keeps head and
  tail (bilingual halves independently). Code `aa5e79c`, released as `0.12.12` (`61c7cb8`, Release
  `44686655900` success) by the concurrent agent. `.rsi/ROUND.md` round 36.
- Rounds 29-31 (condensed; detail in `.rsi/ROUND.md`, `.rsi/ledger.jsonl`, `docs/knowledge/VALIDATION.md`):
  base64-wrapped PEM and GnuPG keys redacted in their encoded form (`D-085`, `D-086`); the checkpoint
  payload-ceiling comment corrected to the measured 1,048,447 (`D-087`, `A36`).
- Round 27 (this round): `assertCheckpoint` bounded `integrity.bytes` with `countCeiling`
  (1,000,000, a row-count backstop) while `sealCheckpoint` accepts payloads up to `maxBytes`
  (1,048,576). A payload in between sealed, wrote, then read back `invalid` — an unrestorable
  checkpoint. One-line bound swap + comment (`src/checkpoint/schema.ts`), +1 test that sizes a
  payload across the boundary (481 max-width evidence rows = 1,001,015 bytes; 2,055 bytes/row).
  Pool reconciled against the tree first: six entries were stale, R11 is still open. D-084,
  A33, VALIDATION Round 76. Evidence `.rsi/evidence/round-027/`.
- Round 26: `resolveConfig` refuses a bad `grokDefault`; a COMPLETED run no longer counts a
  retried-and-recovered attempt as a failure. Shipped in `0.12.2`.
- Round 25: the self-iteration default template is this repository's round prompt
  (`docs/iterate-template.md`, 3 239 chars), pinned by `test/iterate-template.spec.ts` and the
  bundle copy. Shipped in `0.12.1`.
- Round 24: second composer switch for the self-iteration heartbeat (`RSI heartbeat`,
  `/grok-workflow/iterate`, editable `iterateTemplate`), `/grok on` background acceptance,
  `/grok`-prefixed prompt intake refusal. Shipped in `0.12.0`.
- Round 22: checkpoint `durationMs` now gated on `msCeiling`, not the row-count ceiling.
- Repo: `/home/fish/projects_mine/dsh-grok-workflow`, branch `main`, remote `origin`
  = https://github.com/free6589/dsh-grok-workflow.git.
- Release line (rounds 4–20): `v0.11.4` bcb601d · `v0.11.5` bf0dc91 · `v0.11.6` 88d133b ·
  `v0.11.7` 1760d50 · `v0.11.8` a045154 · `v0.11.9` 596239a · `v0.11.10` 000a56e ·
  `v0.11.11` 6ff6373 · `v0.11.12` be64d56 · `v0.11.13` 7a79efb · `v0.11.14` 20eafea (no Release) ·
  `v0.11.15` 50c0321 · `v0.11.16` 63a4fbb · `v0.11.17` 5fc3e1d · `v0.11.18` 3b131c4 · `v0.11.19` b38d23a.
  Test-count line: 54/985 → … → 63/1156 (0.11.19) → 68/1227 (0.12.1) → 68/1229 (0.12.2) → **68/1230**.

## Installed profile (web)

- `~/.dsh/profiles/web` carries `dsh-grok-workflow` at the newest published tag; the shipped `lib/`
  is byte-identical to the tag's (`diff -r --exclude='*.map'` = 0). DSH host pid `154637` has run
  since 2026-11-17T22:49:32 without a restart through every profile update (`lstart` and boot id
  `9d066162-…` unchanged); `docs/knowledge/HANDOFF.md` records which version each update installed.

## Pool (`.rsi/POOL.md`)

- Closed by rounds 28–34: R11 (cancelled terminal composes `humanConclusion`), the `src/panel.ts`
  importer question (module deleted), the checkpoint payload-ceiling comment (round 31), the
  narrow-folded base64 block (round 33 — 8..23 columns redacted) and the double-escaped fold
  (round 34, this round — `\\n` breaks now matched).
- Pool note corrected this round: "folds of 7 columns or fewer" was measured against the *pre-round-33*
  source. On HEAD, real-newline folds of 1–24 columns are all redacted, so that entry is stale rather
  than open; the live residual is triple-or-deeper escaping (no measured shape).
- Still open and next in line: triple-or-deeper escaping, the nested
  unknown-key drop (`config.ts`), the bare `TypeError` on a non-string `model`/`provider`, the
  `repairLimitOverruns` dead path, the 2400-char clamp that drops the verdict line, the
  "bilingual" mirror that repeats one sentence, the fallback-partial sentence, `meta.phases`
  dropping at `run-start`, the resume policy/integrity/validator items and the README model/validation
  bullets. Start at the top of `POOL.md`.
- Record-layer repair of this round is pinned by `test/rsi-ledger.spec.ts`: the ledger must admit the
  newest `ROUND.md` round, carry the fields a reviewer reads, and point at existing evidence. Rounds
  0/1 and 18/23/24/26 have no ledger row and 18/23/24/26/29 have no `ROUND.md` section — pre-existing
  gaps left as they are, recorded here rather than back-filled with invented numbers.

## Failures / counters

- Consecutive failed rounds: 0. Consecutive no-value rounds: 0.
- Standing `NOT_RUN` (operator action, D-066): a real scheduled heartbeat delivery and a manual click-through.
