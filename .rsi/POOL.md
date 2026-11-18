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
- P · `src/records.ts` lines ~292, ~664, ~756 log `error.message` raw where sibling
  sites use `redactError` (lines ~555, ~690). S / low.
- P · `src/history.ts` ~78-80 truncates before redacting, so a credential straddling
  the cap survives as a sub-threshold fragment. S / low.
- P · Base64-wrapped PEM has no rule (a `BEGIN PRIVATE KEY` body that is itself
  base64 of a PEM block). Recorded in `docs/ARCHITECTURE.md` as a known gap. S / low.

## Configuration (`src/config.ts`, `src/settings.ts`, `src/index.ts`)

- R5 PENDING · `roles.supervisor` is outside `ROLE_ORDER` (`src/settings.ts:94`), so a bad
  supervisor route fails at run time instead of load. S / low.
- R6 PENDING · `resolveConfig` never validates `grokDefault` (`config.ts:700`) though the type
  is `'on' | 'off'` and the gate tests `=== 'on'`. S / low.
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

- P · The delivered answer is only the FIRST sentence of the synthesis, with no ellipsis
  (`delivery/index.ts:457`), while `answer.ts:51-53` forbids the model to add anything. S / medium.
- P · The 2400-char clamp drops the verdict line and, in bilingual delivery, the whole second
  language (`delivery/index.ts:588`, `:613`). S / low.
- R11 PENDING · The cancelled terminal embeds the relay preamble, markers and ledger
  (`gate.ts:533`) although it is a real `assistant/message`. S / low.
- P · The "bilingual" mirror repeats the same sentence under English labels
  (`answer.ts:111-114`, `delivery/index.ts:611`). S / low.
- R9 PENDING · A COMPLETED run prints `Failures: 1 infrastructure` for an attempt that was
  retried and verified (`report.ts:769`, `delivery/index.ts:630`). S / low.
- R8 PENDING · The ledger's model-route line omits `supervisor` (`delivery/index.ts:695`) and
  pushes a duplicate `Synthesis: <mode>` label. S / low.
- P · A fallback partial that verified everything says `0 项没做成` and never mentions the
  degraded plan (`delivery/index.ts:387-392`, `script.ts:2160`). S / low.
- P · `dedupeBilingual` deletes a deliberately repeated sentence from an answer (`:429`).
  H on intent. S / low.

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

- P · `integrity.bytes` is bounded by `countCeiling` (1,000,000) on read but `maxBytes`
  (1,048,576) on write (`schema.ts:59`, `:859`), so a legal payload in between writes fine and
  reads back `invalid`. S / low.
- R10 PENDING · `durationMs` is gated on `countCeiling` (16 min 40 s) instead of the field's own
  `msCeiling` (`wiring.ts:786`, `schema.ts:624`), so every longer run records no duration. S / low.
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
