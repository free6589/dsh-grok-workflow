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
- R33 DONE · A base64 blob wrapped *narrower than 24 columns* was not redacted at all: the marker
  was a contiguous 20-character literal, so any wrap below 20 characters split it across lines, and
  the continuation rule additionally needed ≥16 characters per line (measured: 8/12/16/19/20/21/22/23
  columns left 100% of the encoded block, 24 was the first width that redacted). The nine encoded
  windows are now generated so a line break — a real newline or the `\n` escape a JSON string
  carries — may fall between any two of their characters, and continuation lines are consumed down
  to eight characters with a line-boundary anchor (`src/redact.ts`, `D-088`, `A37`).
  `test/redact.spec.ts` pins eight fold widths for both armors, the JSON-field fold and the
  no-over-reach cases; on the pre-round source the two positive cases leak the whole block.
  Evidence `.rsi/evidence/round-033/`.
- R34 DONE · Narrow real-newline folds (1–24 cols) already redacted since round 33; the live gap
  was **double-escaped** breaks (a pre-escaped `\n` log line wrapped in another JSON layer doubles
  every backslash, which the single-backslash break branch could not match). `BASE64_BREAK` gained
  the double-backslash branch; `test/redact.spec.ts` pins the 24-col double-encoded shape.
  Evidence `.rsi/evidence/round-034/`. Residual: triple-or-deeper escaping (no measured shape).
- R36 DONE · A base64 blob folded **below the eight-character continuation floor** was left almost
  whole: the fold-tolerant window matched the encoded banner, but no line was long enough to be a
  continuation line, so 244 of 272 encoded characters survived at seven columns — and decoded back
  to the banner and the key body (`A41`; the round-33/34 assertion only decoded ≥4-character
  fragments, which a narrow fold shatters into per-line noise). A run of two or more base64-only
  lines is now consumed as one narrow fold (`BASE64_CONTINUATION`, `D-091`), with the run optional
  so wider folds still match. The documented footer rule was stale in two places and is now the
  measured one: a final line under 8 characters survives (≤7 characters, ≤5 decoded bytes), and the
  old "narrower than 24 columns is not matched at all / 16-character floor" prose in
  `ARCHITECTURE` is gone. `test/redact.spec.ts` pins widths 1–7 (report + prompt realm), both sides
  of the 7/8 footer boundary, the over-reach boundary (two short lines yes, one no) and the base64
  PGP banner at both boundaries; on the pre-fix source (`91ed287`) the narrow-fold case fails with
  252 characters kept. Evidence `.rsi/evidence/round-036/`.

## Configuration (`src/config.ts`, `src/settings.ts`, `src/index.ts`)

- R19 DONE · `roles.supervisor` was outside `ROLE_ORDER` (`src/settings.ts:94`), so a bad
  supervisor route failed at run time instead of load — and the role was also exempt from the
  empty-`maxInFlight` note. `ROLE_ORDER` now lists all five roles in report order
  (`src/report.ts` `ROLE_NAMES`); `test/config.spec.ts` pins all five, `test/route-concurrency.spec.ts`
  pins the note. Evidence `.rsi/evidence/round-019/`.
- R6 DONE · `resolveConfig` validates `grokDefault` and fails closed (`config.ts:700`); shipped in
  `0.12.2` (`c1be0c7`), pinned by `test/config.spec.ts`. (The pool entry said PENDING until round 27.)
- R35 DONE · Unknown keys were rejected at the top level but silently dropped one level down:
  `roles.reviewer` and a route's `maxInflight` were discarded while the stored document kept them.
  `assertKnownKeys` now also walks `roles` (role name) and each route object (field), naming the
  full path — `roles.worker[0].maxInflight (did you mean "maxInFlight"?)` — with `ROLE_KEYS` /
  `ROUTE_KEYS` pinned to what `resolveConfig` builds. Measured (`A39`): the exported `Config` schema
  passes unknown *nested* keys through to `apply()` unchanged, so the reader is the only place the
  refusal can happen. Migration note in both READMEs and `CHANGELOG.md` (a valid patch is unaffected;
  the named key has no replacement). `test/config.spec.ts` pins both levels, the schema round trip
  and the no-over-reach cases; on the pre-fix source (top-level check only) the new case fails.
  Evidence `.rsi/evidence/round-035/`.
- R37 DONE · `roles` that is not an object at all was silently read as "every chain empty":
  `resolveConfig({ roles: 'worker:m1' })` loaded with five empty chains, because `config.roles?.planner`
  on a non-object yields `undefined`. `assertKnownKeys` now refuses a present, non-object `roles` with
  its shape named (`got a string "worker:m1"`); an absent `roles` and `{}` still load. Test fails on the
  pre-change reader (`.rsi/evidence/harness/round-037-red.txt`), passes after. Commit `eb61ac8`.
- R38 DONE · A non-string `model`/`provider` threw a bare `TypeError` (`?.trim is not a
  function`). `resolveChain` now refuses with the full path + got-type
  (`roles.worker[0].model must be a model id string, got number`), pinned by
  `test/config.spec.ts`. Evidence `.rsi/evidence/round-038/`.
- R40 DONE · `repairLimitOverruns` no longer clamps removed keys: the `LEGACY_LIMIT_CAPS`
  branch "repaired" `maxRetries:5→3` / `maxActiveRuns:5→4` with a "takes effect as" warning,
  yet `resolveConfig` still refused the repaired shape (`unknown configuration key`) — the
  clamp saved nothing and the sentence lied about the enforced value (measured: the warning
  announced `maxActiveRuns` taking effect as 4 while the run enforces `FIXED_MAX_ACTIVE_RUNS=2`).
  The branch, `LEGACY_LIMIT_CAPS`, `LegacyLimitField`/`OverrunField` and `legacyRecordOverrun`
  are deleted; removed keys are left untouched so the refusal names the real defect. Live-table
  behaviour unchanged (`maxConcurrency:120→100` still clamps and loads). Pinned by a new
  round-40 case in `test/config-limits-repair.spec.ts`. Evidence `.rsi/evidence/round-040/`.
- NEXT (round 42) · Shortlist ordered in `STATE.md` → "Next round shortlist (round 42)", three
  candidates with disjoint file lists: S2 the fail-closed config branches below
  (`src/config.ts` + `test/config-limits-repair.spec.ts`), S3 the validator branches below
  (`src/resume/validator.ts` + `test/resume-validator.spec.ts`), S4 README model/validation
  bullets (`README.md`). One round takes one candidate. (S1 landed in round 41.)
- P · Six fail-closed branches have no test: `config.ts:654`, `:444`, `:462`, `:438`, `:680`,
  `:826`. Coverage only (mutation run needed to show they bite). S / low. [S2]

## Report and delivery (`src/report.ts`, `src/delivery/index.ts`, `src/answer.ts`)

- STALE (round 27) · `answerLead` walks up to three sentence pieces before falling back
  (`src/delivery/index.ts:440-462`), so the lead is no longer one sentence.
- R36 DONE · The 2400-char clamp cut the tail, dropping the verdict line — and, in bilingual
  delivery, the whole second language. `composeHuman` now keeps the head (answer) + tail
  (verdict) and cuts the middle; each language block is clamped independently so the second
  language keeps its own verdict. Pinned by `test/delivery-human-block.spec.ts` (3 its).
  Evidence `.rsi/evidence/round-036/`.
- R39 DONE · The round-36 head/tail clamp still leaked at the *pair* boundary. `humanConclusion`
  bounded the two blocks by slicing their concatenation, so one block at the single-pass cap
  (2400) plus one at 2399 plus the two-character separator is **4801**, one over the 4800 cap,
  and the blind cut ate the last characters of the **second** language's verdict
  (`明细已记入台…`). The middle cut also ignored line breaks (a half-word sewn onto the verdict)
  and every clamp cut through UTF-16 code units (a lone surrogate renders as a replacement box).
  The pair budget is now split by `pairCaps` (exported, five direct tests), the middle cut lands
  on a line boundary, `…` marks the junction, and every cut goes through `cutCodeUnits`, which
  never splits an astral character; the verdict is reserved before the head is allowed to shrink.
  Same module, same spec: the ledger's `Model routes:` line handed `report.routing` to `Array#join`,
  so a number/`null`/object inside a chain was coerced into a readable route and a non-array chain
  threw a bare `TypeError` — `routeChains` now refuses with path and shape
  (`roles.worker[1] must be a "provider/model" string, got number`), and a malformed chain costs the
  ledger line, never the answer. Red 13 failed / 20 passed on the pre-change module (bffd0b4), green
  38 passed after. Evidence `.rsi/evidence/round-039/`.
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

- P · 团队档「实时回执」与取消终态、卸载通知都不再是聊天行（`D-094`：DSH 的 token 计量器要求
  `assistant/message` 落在打开的 `step/start`…`step/end` 之间）。文字已存入
  `plugin:grok-workflow/terminal` 记录，缺的是渲染：把这三类文本画在进度面板里，或用客户端插件
  自绘一行（`src/client/index.js`），不再借 `assistant/message`。M / medium.
  Evidence `.rsi/evidence/compact-fix/`。

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
- R31 DONE · The comment added in round 27 said the refused band runs to 1,048,576, but a sealed
  file carries the integrity record — **122 bytes plus the decimal digits of the byte count**, so
  129 at the ceiling — and `writeCheckpoint`'s file bound caps a legal payload at **1,048,447**.
  The comment now names that ceiling, and `test/checkpoint-schema.spec.ts` derives it from a real
  sealed file, writes at it and one byte over, then reads the source back and requires the comment
  to state it (`D-087`, `A36`). The behaviour was already right (round 27) — this round closed the
  prose and pinned it. Evidence `.rsi/evidence/round-031/`.
- R41 DONE · The longer `CHECKPOINT_LIMITS.maxBytes` docblock + `test/checkpoint-bound.spec.ts`
  landed byte-identical from the preserved bytes (round 39 set them aside for a single-theme
  tree; round 41 took them as its S1). The comment names the file-vs-payload split, 122 fixed
  bytes + digit count (129 at 7 digits), ceiling 1,048,447, the seal-vs-write division and the
  pinning spec. Red 1 failed / 4 passed on the old comment → green 5 passed; overlap with
  `test/checkpoint-schema.spec.ts` is honest: 4/5 behaviour-overlap, 2 genuine new pins
  (seal-accepts-while-write-refuses + maxBytes-comment anchor). Evidence `.rsi/evidence/round-041/`.
  Still preserved: `.../config-chain-types.spec.ts.txt`, an 188-line spec for the round-38
  `model`/`provider` refusal; decide first whether it adds coverage over the committed
  `test/config.spec.ts` case or only duplicates it, so the count does not grow without a second
  behaviour. S / low.
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

- R32 DONE · `src/panel.ts` had no production importer (only `test/panel.spec.ts` +
  a type import in `test/gui-fold.ts`); its guarantee never ran in production while the live
  panel renders via `progress-tab.ts` + the bundle renderer (`test/panel-links.spec.ts`).
  Deleted `src/panel.ts` (286 lines) + `test/panel.spec.ts` (557 lines); `test/gui-fold.ts`
  now carries its own `PanelEvent` type for `test/progress.spec.ts`. Evidence
  `.rsi/evidence/round-032/`.
