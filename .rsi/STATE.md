Updated: 2026-11-20T12:05+08:00 · round 33 (hand-folded base64 key + ledger backfill) · `npm run ci` 68 files / 1231 tests PASS · released `0.12.8` (commit `9f91684`) · previous release `0.12.7` (`56e701d`, tag `v0.12.7`, CI `44666191493`, Release `44666195466`)

Previous rounds: `0.12.7`/`56e701d` (32) · `0.12.6`/`e7150ab` (30, CI `44659057507`, Release `44659061505`) · `0.12.5`/`5b7cae1` (29, CI `44656151053`, Release `44656153854`) · `0.12.4`/`5cd2b1c` (28, CI `44652383452`, Release `44652387975`) · `0.12.3`/`fd6a5ee` (27, CI `44647313571`, Release `44647317251`) · `0.12.2`/`40228c5` · `0.12.1`/`23d3369` — per-round detail lives in `.rsi/ROUND.md`, `.rsi/LOG.md` and `.rsi/ledger.jsonl`.
## Facts

- Round 33 (this round): a base64 block folded narrower than its own encoded banner (a `fold -w 8`
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
  Evidence `.rsi/evidence/round-033/`.
- Round 31 (this round): the round-27 comment claimed the refused band ran to 1,048,576, but the
  integrity record is 122 bytes plus the decimal digits of `bytes` (129 only for a 7-digit count), so
  `writeCheckpoint` refuses from 1,048,448. The behaviour was right; the prose was not. The comment now
  names 1,048,447 with the arithmetic, and one test measures the record from a real sealed file, writes
  at the ceiling (file exactly 1,048,576 B, reads back intact), refuses at +1, then reads the source back
  and requires the comment to state that number. Red/green is over the comment: pre-round source fails
  the last assertion. No release — comment and test only (`D-087`, `A36`, VALIDATION Round 83).
  Evidence `.rsi/evidence/round-031/`.
- Round 30 (this round): a base64-wrapped *GnuPG* private key (`base64`d keyring export, key in a
  JSON field) reached reports verbatim — round 29 closed only the PEM half. `base64-private-key` now
  carries nine literals: the `PRIVATE` and legacy `SECRET` banner at all three group alignments; the
  windows reach byte 17, where `PRI`/`SEC` separate from `PUB`, so base64 public keys stay untouched
  (measured: a marker on the shared `-----BEGIN PGP ` prefix matches public blobs). Red/green: pre-fix
  source fails 2 of 3 new cases with the whole block in the output; 37 passed after (+2 over 35).
  Also measured and pooled, not fixed: a blob wrapped narrower than 24 columns splits the marker and
  is not matched at all. D-086, A35, VALIDATION Round 81/82. Evidence `.rsi/evidence/round-030/`.
  Heartbeat row unchanged: `status: active`, single owner, two real deliveries recorded
  (01:01:50Z, 02:01:50Z), rrule still ends 2026-11-20T10:01:50Z — a subagent cannot edit `schedule_*`.
- Round 29 (this round): a base64-wrapped PEM (`base64 -w0` key file, JSON field, blob inside a
  larger encoding) reached reports verbatim — every armor rule matched the decoded banner, and
  only a secret-named label (`PRIVATE_KEY=`) happened to catch it. New rule `base64-private-key`
  matches the banner's encoded form at all three group alignments, replaces the whole blob
  including wrapped continuation lines; base64 `CERTIFICATE` and base64 PGP armor stay untouched.
  Red/green: on the pre-fix source the two positive cases fail with the whole key body in the
  output; 35 passed after (+3 over baseline). D-085, A34, VALIDATION Round 79.
  Evidence `.rsi/evidence/round-029/`. Heartbeat row: `status: active`, single owner, one real
  delivery confirmed, but `COUNT=10` hourly ends 2026-11-20T10:01:50Z — not through 2026-12-01,
  and this session cannot touch `schedule_*` (subagent refusal).

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

- Closed by rounds 28–33: R11 (cancelled terminal composes `humanConclusion`), the `src/panel.ts`
  importer question (module deleted), the checkpoint payload-ceiling comment (round 31) and the
  narrow-folded base64 block (round 33, this round — 8..23 columns now redacted).
- Still open and next in line: folds of **7 columns or fewer** (pooled this round), the nested
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
