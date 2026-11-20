# RSI Pool — findings with file:line anchors

Built from eight read-only audits on 2026-11-18 (config/validation, redaction, report/delivery,
client settings, progress panel, checkpoint/resume, script/scheduling, docs). A finding is
pooled only with an anchor; `H` marks an unverified hypothesis. Rounds 4–11 are taken from
here and are marked DONE when their commit lands.

## Redaction (`src/redact.ts`, call sites)

- R5 DONE · quoted `Cookie:` headers (`curl -H 'Cookie: …'`), `X-Amz-Signature` /
  `X-Goog-Signature` / `?auth=`, PGP armor, short `SECRET_KEY`/`PRIVATE_TOKEN`,
  env value termination, placeholder stability, `x-api-key` deep keys (round 5).
- R4 DONE · `Authorization:` leaks for every scheme except Bearer/Basic and for a
  bare opaque value.
- STALE (round 27) · `src/records.ts` logged `error.message` raw at three sites; every
  logger in the file now calls `redactError` (`:292`, `:375`, `:554`, `:663`, `:688`, `:754`).
  Re-checked against HEAD `fd241c8`; nothing left to do here.
- STALE (round 27) · `renderHistory` now redacts a bounded window first and truncates
  after (`src/history.ts:97-109`), which is the order the defect asked for.
- R29 DONE · Base64-wrapped PEM had no rule: a `BEGIN PRIVATE KEY` body that is itself base64
  (`base64 -w0` key file, a JSON field, a blob inside a larger encoding) reached the report
  verbatim, because every armor rule matched the *decoded* banner and the `key-value` rules only
  catch it when a secret-named label happens to precede it. New `base64-private-key` rule matches
  the banner's encoded form at all three base64 group alignments and replaces the whole blob
  (continuation lines of a wrapped blob included); a base64 `CERTIFICATE` and base64 PGP armor
  are deliberately untouched. `test/redact.spec.ts` pins the three alignments, the wrapped shape,
  JSON parseability and the no-over-reach cases; on the pre-fix source the two positive cases
  leak the whole blob. Evidence `.rsi/evidence/round-029/`.
- R30 DONE · Base64-wrapped *PGP armor* (`BEGIN PGP PRIVATE KEY BLOCK` after decoding) had no rule:
  the round-29 marker set was the PEM banner only. The rule now carries six more literals — the
  `PRIVATE` and legacy `SECRET` banner at all three base64 group alignments — and the windows reach
  byte 17, where `PRI`/`SEC` separate from `PUB`, so a base64 `PGP PUBLIC KEY BLOCK` is still left
  alone (measured: a bytes-0..14 marker would match public blobs, `RESEARCH.md` A35). `D-086`.
  `test/redact.spec.ts` pins three alignments, the wrapped shape and the public-key no-over-reach
  case; on the pre-fix source both positive cases leak the whole block. Evidence
  `.rsi/evidence/round-030/`.
- P · A base64 blob wrapped *narrower than 24 columns* is not redacted at all: the marker is a
  20-character contiguous literal, so any wrap below 20 characters splits it across lines, and the
  continuation rule additionally needs ≥16 characters per line. Measured this round for both
  armors: wraps of 8/12/16/19/20/21/22/23 columns leave 100% of the encoded block in place, 24 is
  the first width that redacts (pre-existing for PEM since round 29 — the marker width, not the new
  PGP literals, sets the floor). Fixing it needs a marker that tolerates a break between its own
  characters, or a decode pass; both are a decision of their own. M / low (real `base64` wraps at 76
  and `-w0` does not wrap; the risk is a hand-wrapped paste).

## Configuration (`src/config.ts`, `src/settings.ts`, `src/index.ts`)

- R19 DONE · `roles.supervisor` was outside `ROLE_ORDER` (`src/settings.ts:94`), so a bad
  supervisor route failed at run time instead of load — and the role was also exempt from the
  empty-`maxInFlight` note. `ROLE_ORDER` now lists all five roles in report order
  (`src/report.ts` `ROLE_NAMES`); `test/config.spec.ts` pins all five, `test/route-concurrency.spec.ts`
  pins the note. Evidence `.rsi/evidence/round-019/`.
- R6 DONE · `resolveConfig` validates `grokDefault` and fails closed (`config.ts:700`); shipped in
  `0.12.2` (`c1be0c7`), pinned by `test/config.spec.ts`. (The pool entry said PENDING until round 27.)
- P · Unknown keys are rejected at the top level but silently dropped one level down:
  `roles.reviewer` and a route's `maxInflight` are discarded (`config.ts:337`, `:439`, `:385`)
  while the stored document keeps them. S / medium (stricter load needs a migration note).
- P · A non-string `model`/`provider` throws a bare `TypeError` naming neither key nor shape
  (`config.ts:456`, `:461`). S / low.
- P · `repairLimitOverruns` still clamps seven removed keys through `LEGACY_LIMIT_CAPS`
  (`config.ts:612-636`) and announces a cap that is not the fixed value (`maxActiveRuns` says 4,
  the fixed value is 2). Dead path, misleading warning. S / low.
- P · Six fail-closed branches have no test: `config.ts:654`, `:444`, `:462`, `:438`, `:680`,
  `:826`. Coverage only (mutation run needed to show they bite). S / low.

## Report and delivery (`src/report.ts`, `src/delivery/index.ts`, `src/answer.ts`)

- STALE (round 27) · `answerLead` walks up to three sentence pieces before falling back
  (`src/delivery/index.ts:440-462`), so the lead is no longer one sentence.
- P · The 2400-char clamp drops the verdict line and, in bilingual delivery, the whole second
  language (`delivery/index.ts:588`, `:613`). S / low.
- R11 DONE · the cancelled terminal stated the kept report via `relayText` (success preamble +
  markers + folded ledger), reading as if the workflow had finished. Round 28 composes it
  via `humanConclusion` instead (`src/gate.ts` `cancelledText`); the ledger stays in the
  progress node. Pinned by `test/gate-partial-head.spec.ts` + `test/phase1-dialogue.spec.ts`.
  Evidence `.rsi/evidence/round-028/`.
- P · The "bilingual" mirror repeats the same sentence under English labels
  (`answer.ts:111-114`, `delivery/index.ts:611`). S / low.
- R9 DONE · a COMPLETED run no longer prints `Failures:` for an attempt a later attempt
  recovered (`report.ts`, `delivery/index.ts`); shipped in `0.12.2` (`c1be0c7`).
- R8 DONE · The ledger's model-route line omitted `supervisor` (`delivery/index.ts:695`). The role
  table now names all five in report order, with a parity assertion against the human route line
  (`test/delivery.spec.ts`). Evidence `.rsi/evidence/round-020/`. The duplicate `Synthesis: <mode>`
  label reported in the same audit line was outside that round and stays pooled. S / low.
- R21 DONE · `configRouteLabels` (`src/run.ts:141`) flattened four roles, so a `roles.supervisor`
  chain never reached the C1 cross-run busy hint. All five roles now, report order, pinned by
  `test/route-concurrency.spec.ts`. Evidence `.rsi/evidence/round-021/`.
- P · A fallback partial that verified everything says `0 项没做成` and never mentions the
  degraded plan (`delivery/index.ts:387-392`, `script.ts:2160`). S / low.
- P · `dedupeBilingual` deletes a deliberately repeated sentence from an answer (`:429`).
  H on intent. S / low.

## Client i18n (`src/client/index.js`)

- R11 DONE · the bundle's two tables (`DICT`, `PANEL_DICT`) were never compared with the keys the
  code asks for, and the panel's copy is only reachable through its own translator. Audit at
  `0.11.11`: 137 keys per plugin locale, 19 per panel locale, both symmetric, every literal /
  concatenated / dynamic key resolves — no copy defect existed. Guard added:
  `test/i18n-parity.spec.ts` (6 its, with a mutation replay proving it fails).
  Evidence `.rsi/evidence/round-011/`.
- P · `progress.notReported` is still the right answer for a stage with no rows and no evidence;
  a future "declared but not started" distinction needs `meta.phases` (see the P0 item below).

## Progress panel (`src/progress-tab.ts`, `src/client/index.js`, `src/records.ts`)

- P0 DONE · Execute/Verify printed `Not reported in the events` because rows were matched by
  `agent-start.data.phase`, which the script fills with the plan-task group title, never
  `执行`/`检查` (`progress-tab.ts:543-580`, tokens `:184-185`, producer `script.ts:1849-1852`).
  Fixed in round 9 by the second channel the pool proposed: a row whose phase names no stage is
  bound by its role label and cross-referenced onto the stage's `evidence` list, so the
  one-node-per-row invariant (`test/progress-tab.spec.ts:269`) survives. Evidence
  `.rsi/evidence/round-009/`.
- P · Edge nodes (Start/End) print the same `Not reported in the events` copy although
  `run-start`/`run-end` did arrive (`client/index.js:2669`, `:2673`). S / low.
- P · `meta.phases` (which does declare `检查`) is dropped at `run-start` (`records.ts:597`), so
  "declared, no rows yet" is indistinguishable from "never planned". S / medium (typed session
  event; needs a DSH-upgrade check first). H that the extra key is safe.
- P · Fixtures feed the panel a stream shape the recorder cannot produce (`phase: '执行'`), which
  is why 951 green tests coexist with an empty panel (`test/progress-tab.spec.ts:247`, `:54`). S / low.

## Checkpoint and resume (`src/checkpoint/*`, `src/resume/*`)

- R27 DONE · `integrity.bytes` was bounded by `countCeiling` (1,000,000, a row-count
  backstop) on read while the writer accepts payloads up to `maxBytes` (1,048,576), so a
  checkpoint whose payload landed between the two ceilings sealed, wrote, and read back as
  `invalid` — a resume that could never happen (`schema.ts:859`, `:451`). Both sides now use
  the writer's bound; `test/checkpoint-schema.spec.ts` sizes a payload across the boundary
  (481 max-width evidence rows = 1,001,015 bytes). Evidence `.rsi/evidence/round-027/`.

- STALE (round 29) · "`integrity.bytes` is bounded by `countCeiling` (1,000,000) on read but
  `maxBytes` (1,048,576) on write" — fixed in round 27 (`fd6a5ee`); both sides use `maxBytes`.
  The entry above it (R27 DONE) is the record; this duplicate stayed behind.
- P · The comment added in round 27 says the refused band runs to 1,048,576, but a sealed file
  carries a 129-byte integrity record, so `writeCheckpoint`'s file bound caps a legal payload at
  **1,048,447** (`schema.ts:59`). Cosmetic-only, but it is the carried uncertainty A33 recorded
  as "left untouched because editing shipped source after the tag would make `lib/` differ from
  `v0.12.3`" — `0.12.5` rebuilds `lib/` anyway, so that reason no longer applies and the one-line
  correction is ready for its own round. S / low.
- R10 DONE · `durationMs` is gated on `msCeiling` (`wiring.ts:784-790`, `schema.ts:624`), fixed in
  round 22 and shipped in `0.11.20`.
- P · `recordableTimeoutMs`'s upper guard is vacuous (`msCeiling === MAX_SAFE_INTEGER`), so a
  config-legal `timeoutMs` near `MAX_SAFE_INTEGER` makes every checkpoint write `invalid`
  (`wiring.ts:541-593`). S / low.
- P · A caller-supplied `git` provider returning `head: ''` makes every write fail
  (`wiring.ts:757`, `schema.ts:686`); the provider is untested. S / low.
- P · Restore decisions drop `title`, `attempt`, `updatedAt` while claiming `retain` keeps the
  task as-is (`resume/policy.ts:137-145`). S / medium.
- P · Integrity is verified over the validator's normalized rebuild, so changing `git.head`'s
  case after sealing still verifies (`writer.ts:160`, `schema.ts:812`, `:685`). S / low.
- P · Five validator refusal branches are untested (`resume/validator.ts:231`, `:274`, `:290`,
  `:296`, `:308`). Coverage only. S / low.
- P · `completed` is retained with no evidence, while a bare `success` is refused as a
  self-report (`resume/policy.ts:96-99` vs `:116-119`). H on intent; M / medium.

## Docs

- R6 DONE · `docs/LOCAL-TESTING.md` install examples named `0.2.0`/`0.2.1` tarballs, the
  troubleshooting entry quoted a message the build never emits and described a repaired
  value as a rejection, and the zh README used a different notation for the fixed caps
  (round 6; guard 7 → 12 its, bump-version.py now rewrites the tarball name).
- R10 DONE · `docs/ARCHITECTURE.md` said "in this release" four times and dated the `resume`
  boundary to DSH 0.2.1-rc.2 only. Now every status names `since **X.Y.Z**`, the no-caller
  claims are dated `as of **0.11.9**`, and the boundary line separates the measured version
  from round 8's activation re-check on 0.2.2-rc.3. Guard: `test/docs-architecture-version.spec.ts`
  (3 its). Evidence `.rsi/evidence/round-010/`.
- P · Both README "Models per role" examples are patches the loader refuses:
  `synthesis: deterministic` and the removed `switchOn` key (EN ~176-177, zh ~169-170). S / low.
- P · README validation bullet still says "more than three routes" and "an unknown `switchOn`
  class" (EN ~183, zh ~176); the real limit is `HARD_LIMITS.chainLength` = 50 and `switchOn` is
  a removed key. S / low.
- P · `docs/knowledge/DESIGN-progress-tab.md` §4 documents the old delivery-template spine and
  §12 never records the Execute/Verify gap. S / low.

## Runtime (round 8)

- R8 DONE · plugin installs into a real DSH profile, the row activates (no `pending`), and the
  settings projection serves `grok-workflow` (`autoGenerate: true`) on DSH 0.2.2-rc.3.
  BLOCKED: a model-backed `grok_workflow` message (`MISSING_CREDENTIAL … "deepseek-official"` in
  the isolated profile; copying a key is forbidden). Evidence `.rsi/evidence/round-008/`.

## Open questions

- `src/panel.ts` has no production importer (only `test/panel.spec.ts`, `test/gui-fold.ts`); its
  "only a task-level result can produce a pass word" guarantee may never run. H — verify against
  the shipped bundle before deciding to delete or wire it. M / medium.
