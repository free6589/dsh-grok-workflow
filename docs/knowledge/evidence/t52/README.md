# t52 — the front desk on `:3100`

Plan C (greeting + difficulty tiers + ask when unsure): the raw material behind VALIDATION
Round 9 and DECISIONS D-021…D-023. Every file here is the page text of one message typed
into the web UI of the test instance, plus its screenshot.

Instance: test home `/home/fish/dsh-v022-home`, profile `web-v022-test`,
listener `127.0.0.1:3100`, built from `/tmp/t52-pack/gw-triage7.tgz` (the same tree as this
commit). The live `:3090` instance and its profile were not touched.

| File | Message | Tier |
| --- | --- | --- |
| `M1-chat.txt` | `你好` | 直答档 (template, no call) |
| `M2-fast.txt` | `算一下 5×6 等于多少，只回答数字` | 快手档 (one worker) |
| `M3-ask.txt` | `把这个弄一下` | 确认档 (asks back) |
| `M4-pending-fast.txt` | `简单` (answer to M3) | 快手档, the pending choice is remembered |
| `M5-team-forced.txt` | `用团队：只回答一个字` | 团队档 forced by the user, greeting + full report |
| `M6-chat-again.txt` | `你好` | 直答档 again — the tier does not drift inside a session |
| `M8-team-complex.txt` | `先读一下 src/triage.ts 里的 TRIAGE_LIMITS，然后把两个阈值的意思写成三句说明` | 团队档 by sequencing (after the M7 defect fix) |
| `M9-full-mode-rollback.txt` | `你好` with `mode: full` | pre-t52 behaviour: the full workflow, no tier line |
| `matrix.log` | timings of the run |

`M9` was extracted from the session log rather than the page text: the headless browser
crashed while that run was in flight (`Target page, context or browser has been closed`), and
the report in the session log is the same text the page renders.

Two runs are kept deliberately: `M8-team-complex.txt` is the natural (rule-chosen) team
tier, and it is a **failed** run — the objective pointed at `src/triage.ts` while the
instance's workspace is `/home/fish/project_jobs`, so the worker could not read the file and
the report says so. It is evidence that the tier was chosen correctly and that a failed run
is reported as failed, not as an answer.
