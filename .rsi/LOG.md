# RSI Log (append only; oldest rounds collapse into a digest when it grows past 10)

| round | time | theme | result | evidence | next-round suggestion |
|---|---|---|---|---|---|
| 0 | 2026-11-18T01:18+08:00 | carry-in of the 0.11.0 `timeoutMs` key (found green, uncommitted) | OK — commit `85541ad`, tag `v0.11.0`, pushed | `.rsi/evidence/round-000/` | start the protocol rounds from a clean tree |
| 1 | 2026-11-18T01:24+08:00 | README version claims were three releases stale; nothing checked them | OK — `test/docs-version.spec.ts` red→green; 52 files / 965 tests; tag `v0.11.1` | `.rsi/evidence/round-001/` | backfill the missing `[0.9.0]` changelog section and make the guard require it (P0-01) |
