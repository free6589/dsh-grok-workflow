# RSI Log (append only; oldest rounds collapse into a digest when it grows past 10)

| round | time | theme | result | evidence | next-round suggestion |
|---|---|---|---|---|---|
| 0 | 2026-11-18T01:18+08:00 | carry-in of the 0.11.0 `timeoutMs` key (found green, uncommitted) | OK — commit `85541ad`, tag `v0.11.0`, pushed | `.rsi/evidence/round-000/` | start the protocol rounds from a clean tree |
| 1 | 2026-11-18T01:24+08:00 | README version claims were three releases stale; nothing checked them | OK — `test/docs-version.spec.ts` red→green; 52 files / 965 tests; tag `v0.11.1` | `.rsi/evidence/round-001/` | backfill the missing `[0.9.0]` changelog section and make the guard require it (P0-01) |
| 2 | 2026-11-18T01:25+0800 | restore the v0.9.0 changelog section a later release overwrote | OK — `0.9.0` body restored byte-identical from `2d2b347`; guard now requires a section per published tag | `.rsi/evidence/round-002/` | continue with P0-03 (README fixed-key list vs `REMOVED_CONFIG_KEYS`) |
| 3 | 2026-11-18T01:34+0800 | document the removed keys `triageModel` / `maxActiveRunsTotal`; guard the lists | OK — both READMEs now name every removed key; `test/docs-config-keys.spec.ts` pins it | `.rsi/evidence/round-003/` | code defect next: `roles.supervisor` is exempt from load-time route validation |
| 4 | 2026-11-18T09:10+08:00 | README config-surface drift + docs guard extension (incl. TS7016 shim); first review FAIL closed in rework | OK — `bcb601d`, tag `v0.11.4`, pushed; 54 files / 985 tests PASS | `.rsi/evidence/round-004/` | P2-02 redact shapes or P1-03 LOCAL-TESTING key audit next |
| 5 | 2026-11-18T13:51+08:00 | P2-02: redaction missed quoted cookies, presigned signatures, PGP armor, short `SECRET_KEY`; rewrote code and corrupted placeholders | OK — 54 files / 993 tests; tag `v0.11.5` | `.rsi/evidence/round-005/` | P1-03 LOCAL-TESTING key/default audit next |
| 6 | 2026-11-18T13:56+08:00 | P1-03: LOCAL-TESTING promised tarballs, a rejection and a notation it did not have | OK — 54 files / 998 tests; tag `v0.11.6` | `.rsi/evidence/round-006/` | tag inventory audit next |
| 7 | 2026-11-18T14:02+08:00 | remote tag inventory audited tag-by-tag vs README lists and per-tag package.json | OK — 32/32 identical objects, HEAD==origin/main, 54 files / 999 tests; tag `v0.11.7` | `.rsi/evidence/round-007/` | live runtime disposition next |
