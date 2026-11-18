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
| 8 | 2026-11-18T14:16+08:00 | live runtime disposition: isolated profile on DSH 0.2.2-rc.3 | OK — install/activation/settings projection PASS; model-backed run BLOCKED (MISSING_CREDENTIAL); 54 files / 999 tests; tag `v0.11.8` | `.rsi/evidence/round-008/` | ordered theme list exhausted; remaining backlog P0-02/P1-02/P2-01/P3-* | | P0-02 next: bind plan-task rows to a stage by role label |
| 9 | 2026-11-18T14:19+08:00 | P0-02: Progress 页 `执行`/`检查` 恒为「事件中没有报告」 | OK — role-label evidence channel (TS + browser mirror); 54 files / 1006 tests; tag `v0.11.9` | `.rsi/evidence/round-009/` | P1-02 next: ARCHITECTURE "current version" statuses |
| 10 | 2026-11-18T14:26+08:00 | P1-02: ARCHITECTURE 的版本状态写「in this release」而非 `since X.Y.Z` | OK — 4 处锚定到版本 + DSH 边界区分「实测」与「复查」；新守卫 3 条；55 files / 1009 tests；tag `v0.11.10` | `.rsi/evidence/round-010/` | P2-01 next: settings client i18n key parity |
| 11 | 2026-11-18T14:30+08:00 | P2-01: 两本 i18n 词典与代码请求的键没有任何对照 | OK — 审计无缺陷；新增 `test/i18n-parity.spec.ts`（6 条，含变异重放证明会红）；56 files / 1015 tests；tag `v0.11.11` | `.rsi/evidence/round-011/` | P3-01/P3-02 next（设置页文案、进度详情行）；P1/P2 待办清零 |

## Round-start STOP probes

Every round starts by testing `.rsi/STOP`; the verdict is written to
`.rsi/evidence/stop-probes.txt` by `.rsi/tools/stop-probe.sh <round>` (timestamp, round, cwd,
exact command, verdict). `STOP ABSENT` is not recorded here — the log row above is the round,
the probe file is the evidence.

| round | probe command | result | recorded in |
|---|---|---|---|
| 9 | `test -e .rsi/STOP` (cwd `/home/fish/projects_mine/dsh-grok-workflow`) | `STOP ABSENT` | `.rsi/evidence/stop-probes.txt` line `round=9` |
| 10 | `test -e .rsi/STOP` | `STOP ABSENT` | `.rsi/evidence/stop-probes.txt` line `round=10` |
| 11 | `test -e .rsi/STOP` | `STOP ABSENT` | `.rsi/evidence/stop-probes.txt` line `round=11` |

Rounds 0–8 ran the same test but only wrote the verdict as prose in `.rsi/STATE.md`; that is
the recording gap a review named on 2026-11-18. History is not rewritten here: from round 9 on
the probe leaves the two artifacts above, and `.rsi/tools/stop-probe.sh` is the only writer.
