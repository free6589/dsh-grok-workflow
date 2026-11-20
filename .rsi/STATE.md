Updated: 2026-11-20T10:13+08:00 · round 30 (base64-wrapped GnuPG private key) · `npm run ci` 68 files / 1235 tests PASS · `verify:lib` byte-identical at `e7150ab` · released `0.12.6` (commit `e7150ab`, tag `v0.12.6` object `167b475`, CI `44659057507`, Release `44659061505`, asset 600,316 B)

Updated: 2026-11-20T09:45+08:00 · round 29 (base64-wrapped private key) · `npm run ci` 68 files / 1233 tests PASS · released `0.12.5` (commit `5b7cae1`, tag `v0.12.5`, CI `44656151053`, Release `44656153854`)

Updated: 2026-11-20T08:45+08:00 · round 27 (checkpoint read-side byte bound) · **released
`0.12.3`**: commit `fd6a5ee`, tag `v0.12.3`, CI `44647313571`, Release `44647317251` ·
`npm run ci` 68 files / 1230 tests PASS · web profile on `#v0.12.3` (host pid `154637` never
restarted) · previous releases `v0.12.2` (`40228c5`, CI `44641153858`, Release `44641158387`)
and `v0.12.1` (`23d3369`, CI `44595376323`, Release `44595391505`)

## Facts

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

- `~/.dsh/profiles/web` carries `dsh-grok-workflow` at the newest published tag; the shipped
  `lib/` is byte-identical to the tag's (`diff -r --exclude='*.map'` = 0).
- DSH host pid `154637` has run since 2026-11-17T22:49:32 without a restart through every
  profile update (`lstart` and boot id `9d066162-…` unchanged). `docs/knowledge/HANDOFF.md`
  records which version each update installed.

## Pool (`.rsi/POOL.md`)

- Re-checked against the tree this round: `records.ts` redaction, `history.ts` truncate order,
  `answerLead` sentence count, R6, R9, R10 are all resolved (marked STALE/DONE with anchors).
- Still open: R11 (the cancelled terminal still composes `relayText`, preamble + markers) and the
  `src/panel.ts` importer question. Next round should start there.

## Failures / counters

- Consecutive failed rounds: 0. Consecutive no-value rounds: 0.
- Standing `NOT_RUN` (operator action, D-066): a real scheduled delivery of a heartbeat, and a
  manual browser click-through with a screenshot.
