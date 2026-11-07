# v0.6.0 isolated verification — dual-route worker overflow (2026-11-07)

What this proves: on a **fresh, isolated DSH profile** (`v060r`, isolated `DSH_HOME`
`out/v060-verify/home` — the operator's `/home/fish/dsh-layerfs` and live `:3090`
were never touched), the plugin built from the merged `main` commit `1f9065d`
(`v0.6.0`, `lib/` rebuilt, `git diff --exit-code -- lib/` = 0) runs a **single
gated team round with two tasks and a 2-route worker chain** (`maxInFlight: 1`
on both routes) to `COMPLETED`, and the report carries the B-group `Route
overflows (full lane yielded, not failures):` lines with `skipped full …`
evidence plus both worker routes in `Model routes:`.

## Environment

| | |
|---|---|
| Machine | operator machine, `/home/fish/projects_mine/dsh-grok-workflow` |
| Node / npm | `v26.8.1` / `11.19.0` |
| DSH CLI | `0.2.1-rc.2` (`dsh --version`) |
| Isolated DSH home | `out/v060-verify/home` (`DSH_HOME`, created for this run) |
| Profile | `v060r`, created with `--from-default-profile headless` |
| Session workspace | `out/v060-verify/work` (empty at start; TESTING.md rule 1: disposable dir, session dir `sessions/--home-fish-projects_mine-dsh-grok-workflow-out-v060-verify-work--` is the isolation proof) |
| Models | provider `bifrost-completions`, `wb/cn:deepseek-v4-pro` + `agnes-3.0-flash` (key from `apiKeyEnv: BIFROST_VIRTUAL_KEY`, presence checked as boolean only; no credential read, written or echoed). Note: `wb/cn:deepseek-v4.1-flash` answered `400 model_unavailable (per-model cooldown)` that day, so the check ran on v4-pro + agnes flash instead — one model swap, stated not hidden |
| Plugin | loaded from the build artifact `file:///home/fish/projects_mine/dsh-grok-workflow/lib/index.js` |
| Gate | `grokDefault: "off"` for turn 1 (greeting, F1/D-035 workaround), `grokDefault: "on"` + `mode: "full"` for turn 2 (the team round) |
| Code under test | `main` = `1f9065d` (Merge PR #43), tag `v0.6.0` → same sha; `package.json` = `0.6.0`, `CHANGELOG.md` carries `## [0.6.0] - 2026-11-07` |

## Overlays (committed here as text, fixtures live in untracked `out/v060-verify/`)

`model-pro.patch.yml` — two-model catalog (`wb/cn:deepseek-v4-pro`, `agnes-3.0-flash`),
default route v4-pro. `plugin-off.patch.yml` — gate off (turn 1). `plugin-on.patch.yml`
— gate on + `mode: full`, `maxConcurrency: 2`, `maxRetries: 0`, `maxTasks: 2`,
planner/verifier = v4-pro, worker = `[v4-pro cap 1, agnes-3.0-flash cap 1]`,
`synthesis: deterministic`.

## Run

```bash
cd /home/fish/projects_mine/dsh-grok-workflow
export DSH_HOME="$PWD/out/v060-verify/home"
dsh --profile v060r --from-default-profile headless --dump-config >/dev/null
cd out/v060-verify/work
DSH_HOME="$PWD/../home" dsh --profile v060r --patch ../model-pro.patch.yml \
  --patch ../plugin-off.patch.yml --json "你好，用一句话打个招呼。"
# -> session-c052a774-139b-4421-8ba6-e106e6de3e4a, turn 1 plain greeting, exit 0
DSH_HOME="$PWD/../home" dsh --profile v060r --patch ../model-pro.patch.yml \
  --patch ../plugin-on.patch.yml --session-id session-c052a774-139b-4421-8ba6-e106e6de3e4a \
  --json "用团队档做两件事：第一，在当前工作目录创建文件 sum.txt，内容只有一行：TOTAL: 611；第二，在当前工作目录创建文件 prod.txt，内容只有一行：PRODUCT: 611。两个文件都创建后读回来确认内容无误，再用人话告诉我两个文件里的数字。"
# -> turn 2 team round, exit 0
```

## Results

| Turn | Tier / route | Result | Evidence |
|---|---|---|---|
| 1 (gate off) | plain model (v4-pro) | greeting, exit 0 | session log seq 0–7 |
| 2 (gated) | **团队档 team**, 2 tasks, 2 verified | `Grok workflow: COMPLETED`, exit 0 | `report-full.txt`, `session-events.jsonl` |

Report (verbatim, see `report-full.txt`):

```text
Grok workflow: COMPLETED
Plan: planner; 2 task(s); 2 verified
- create-sum-txt: verified (1 attempt) — Create sum.txt containing TOTAL: 611 and verify it
- create-prod-txt: verified (1 attempt) — Create prod.txt containing PRODUCT: 611 and verify it
Model routes: planner=bifrost-completions/wb/cn:deepseek-v4-pro; worker=bifrost-completions/wb/cn:deepseek-v4-pro → bifrost-completions/agnes-3.0-flash; verifier=bifrost-completions/wb/cn:deepseek-v4-pro; synthesizer=inherit
Deadline: 3600000 ms per run (enforced by the plugin)
Route switches:
- worker attempt 1 via bifrost-completions/agnes-3.0-flash: format-error — child returned no valid structured result
Route overflows (full lane yielded, not failures):
- worker attempt 1 via bifrost-completions/agnes-3.0-flash: skipped full bifrost-completions/wb/cn:deepseek-v4-pro
- worker attempt 1 via bifrost-completions/wb/cn:deepseek-v4-pro: skipped full bifrost-completions/wb/cn:deepseek-v4-pro
```

Workspace check (TESTING.md rule 3): `sum.txt` = `TOTAL: 611` (11 B),
`prod.txt` = `PRODUCT: 611` (13 B); the two files are the only entries in
`out/v060-verify/work/` — no writes escaped the disposable dir. Session id
`session-c052a774-139b-4421-8ba6-e106e6de3e4a`, 52 log events.

## Boundary — what this does NOT claim

- The overflow lines exercised are the **local** kind (`skipped full …`,
  `Route overflows (full lane yielded, not failures):`). The **cross-run hint**
  kind (`(cross-run hint)`) is covered deterministically by
  `test/route-concurrency.spec.ts` (13/13, includes the hint-preference and the
  no-hint byte-identical cases) — no second concurrent live run was staged, so
  no live `(cross-run hint)` line was produced here.
- The `Route switches:` line in this report is a real `format-error` on one
  worker attempt (agnes route returned no valid structured result, retried per
  `maxRetries: 0` → recorded as a switch, run still `COMPLETED` with both tasks
  verified). It is stated as observed, not as a defect in this release.
- One model swap is stated above (v4.1-flash cooldown → v4-pro + agnes flash).
  The `warn.emptyCap` settings-page yellow hint was not clicked in a browser
  this round (unit-covered in `test/client.spec.ts` 34/34); GUI rendering stays
  `NOT_RUN` for this release.
- Live `:3090` untouched (still runs `0.2.7` per D-013); operator `DSH_HOME`
  untouched; no DSH core change; no tag moved.
