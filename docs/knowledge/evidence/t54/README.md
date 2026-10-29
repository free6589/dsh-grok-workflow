# t54 — the t53 F1 samples, re-run on `:3100`

The fourteen directed samples from the t53 review (the ones that exposed "short questions and
short two-step instructions answered from the greeting template"), sent one by one through the
front desk of the test instance after the ordering fix.

Instance: test home `/home/fish/dsh-v022-home`, profile `web-v022-test`, listener
`127.0.0.1:3100`, built from `/tmp/t52-pack/gw-t54.tgz` (same tree as this change). The live
`:3090` instance was not touched.

`<ID>.txt` is the page text after that message, `<ID>.png` its screenshot, `matrix*.log` the
timings.

| ID | Message | Tier observed | What actually happened |
|---|---|---|---|
| Q1 | `为什么天空是蓝的` | 快手档 (`question`) | a real Rayleigh-scattering answer from one worker |
| Q2 | `今天几号` | 快手档 (`question`) | answered from the date, not from a template |
| Q3 | `解释幂等` | 快手档 (`question`) | an explanation, one worker |
| Q4 | `what is idempotency` | 快手档 (`question`) | same, in English |
| Q5 | `how many files are in src/` | 快手档 (`question`) | the worker counted and reported |
| P1 | `这个报错 src/triage.ts:42` | 快手档 (`single-step`) | dispatched — **not** asked about, the concrete anchor is what changed |
| A1 | `改一下那个` | 确认档 (`ambiguous`) | asked back; nothing dispatched |
| S1 | `简单` | 快手档 (`pending-fast`) | read as the answer to A1's question |
| S2 | `团队` | 直答档 (`stale-choice`) | said the pending question was gone; nothing dispatched, no crash |
| C1 | `你好` | 直答档 (`small-talk`) | template, no dispatch |
| M1 | `先备份然后升级` | team (by rule + work done) | real work: `.backups/`, `upgrade/`, `UPGRADE_REPORT.md` |
| M2 | `先建目录再拷文件` | team (by rule + work done) | real work: `dsh-backup-copy-20261029/`, `COPY_REPORT.md` |
| M3 | `备份数据库并通知我` | team (by rule + work done) | real work: `.backups/db-backup-…/`, `DB_BACKUP_REPORT.md`, `NOTIFY.md` |
| E1 | `1) 备份 2) 升级` | team (by rule; unit-tested, not run live) | — |

For M1–M3 the answer had not arrived when the capture budget ran out (M1 was still executing at
900 s), so the tier **line** is missing from those page captures; what proves the team tier is the
work itself — a template or a single worker produced none of those directories. E1 was not sent at
all; its tier is pinned by `test/triage.spec.ts` only.

## The workspace these samples ran in

The profile's workspace is `/home/fish/project_jobs`, and starting the instance from a scratch
directory does **not** change it. So M1–M3 really did their work in the user's workspace (which is
what the team tier is for, but not what a matrix should do to a live workspace). Everything they
created — `.backups/`, `.npm-cache/`, `dsh-backup-copy-20261029/`, `upgrade/`, `UPGRADE_REPORT.md`,
`COPY_REPORT.md`, `DB_BACKUP_REPORT.md`, `NOTIFY.md`, 329 MB in total — was moved out to
`/tmp/t54-quarantine/` and is listed in `QUARANTINE-MANIFEST.txt`. Nothing pre-existing was modified
or deleted, the dsh install is still `0.2.1-rc.2`, and `:3090` was never touched.
