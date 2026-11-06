# cross-round carry-over — real DSH two-round test (Round 21)

Everything in this directory was produced by the commands below on this machine on
2026-11-06. No value here is expected output: it is captured output.

## 0. Isolation proof (TESTING.md rule 1 and 8)

- `DSH_HOME=/home/fish/projects_mine/dsh-grok-workflow/.carryover-e2e/home` — a throwaway home
  created for this round (the host's `/tmp` is per-command ephemeral in this session, so the
  scratch area lives inside the repo checkout and is deleted after the round; it is not in any
  commit).
- Session workspace: `/home/fish/projects_mine/dsh-grok-workflow/.carryover-e2e/work` — the encoded
  session directory name `sessions/--home-fish-projects_mine-dsh-grok-workflow-.carryover-e2e-work--`
  is the reproducible evidence, and `session-surface-events.txt` line 2 records the same path from
  the session header.
- The live profile (`:3090`, `DSH_HOME=/home/fish/dsh-layerfs`) was never started, restarted or
  written to; that home is mounted read-only for this account, and nothing in this round points at
  it.
- Profile: `carryover`, created from the shipped `headless` template
  (`dsh --profile carryover --from-default-profile headless --dump-config`).

## 1. Environment

| Fact | Value |
| --- | --- |
| Node | `v26.8.1` |
| DSH CLI | `0.2.1-rc.2` (`dsh --version`) |
| Plugin build | `lib/index.js` of this checkout, loaded as `file://…/lib/index.js` (no install) |
| Model route | provider `bifrost-completions`, model `wb/cn:deepseek-v4.1-flash` |
| Credential | `apiKeyEnv: BIFROST_VIRTUAL_KEY` — the key stays in the environment; no key is written to any file in this repository |

## 2. Exact commands

```sh
W=/home/fish/projects_mine/dsh-grok-workflow/.carryover-e2e
export DSH_HOME=$W/home

# profile (shipped headless template; model + workflow-provider + plugin overlays are in
# model.patch.yml / plugin.patch.yml / plugin-off.patch.yml)
dsh --profile carryover --from-default-profile headless --dump-config

# round 0 — plugin loaded but the gate switched off, so the Host writes the session's own
# system/message first (see finding F1 below)
cd $W/work && dsh --profile carryover --patch ../model.patch.yml --patch ../plugin-off.patch.yml \
  --json "你好，请用一句话回答：这是第 0 轮预热消息。" > ../round0.jsonl

# round 1 — gate on, same session
cd $W/work && dsh --profile carryover --patch ../model.patch.yml --patch ../plugin.patch.yml \
  --json --session-id session-c207cd96-a49c-404b-bd36-a2d575e5b5ec \
  "请计算 17 乘以 23 的准确结果，并在最终回答中明确写出这个乘积。" > ../r1.jsonl

# round 2 — follow-up that never restates the number
cd $W/work && dsh --profile carryover --patch ../model.patch.yml --patch ../plugin.patch.yml \
  --json --session-id session-c207cd96-a49c-404b-bd36-a2d575e5b5ec \
  "把上一轮得到的那个数字再加 9，直接告诉我最终数字，不需要我重复说明。" > ../r2.jsonl
```

## 3. Results

| # | Command | Result |
| --- | --- | --- |
| R0 | round 0 (gate off) | exit 0; session `session-c207cd96-…` created; 20 events; first surface event `system/message` then `user/message` |
| R1 | round 1 (gated) | exit 0; `Grok workflow: COMPLETED`; 1 task `compute-product` verified; confirmed evidence quotes `17 × 23 = 391` (`round-reports.txt`) |
| R2 | round 2 (gated, same session) | exit 0; `Grok workflow: COMPLETED`; task `add-nine-to-prior` verified; the delivered answer is `391 + 9 = 400，最终数字是 400。`; one criterion explicitly checks *"does not ask the user to repeat, re-supply or clarify the previous number"* and passes (`round-reports.txt`) |
| R3 | `grep -c 'PRIOR ROUNDS'` over every child session log | round-1 children 09:38–09:39 → **0**; round-1 children 09:46–09:47 → **0**; round-2 children 09:49–09:51 → **2** each (`digest-per-child-session.txt`) |
| R4 | digest excerpt from a round-2 child prompt | the planner prompt carries `PRIOR ROUNDS … Round -1 [completed] …` followed by round 1's verified rows, including `The final answer text contains the exact numeral 391 …` (`child-prompt-digest.txt`) |

R3/R4 are the decisive evidence that the second round read the first round's *workflow report*
through the new digest, not only through the pre-existing "Conversation so far" history block:
the digest block appears in exactly the children of the round that had a prior round.

## 4. Findings from this round (honest record)

- **F1 — `--session-id` resume fails when the session's first message went through the gate.**
  A session whose very first message is claimed by the gate cannot be resumed:
  `stored log is corrupt: SessionFormatError: system/message requires a protected first surface
  head`. Cause: the `in-turn` strategy publishes the claimed user message in `agent/pre-step`
  (P0-5, Round 17) *before* the loop writes its first `system/message`, so the log's first surface
  event is `user/message`. Observed, not introduced by this change, and not fixed here (the
  publishing order is P0-5 semantics and outside this task's scope). Round 0 of this round exists
  only to work around it; a first gated message in a fresh session hits F1.
- **F2 — the carry-over info line is not visible in headless runs.** The plugin logs
  `grok-workflow carry-over: N earlier round(s), M chars` through `logger.info`, and the headless
  runner prints no plugin log channel: `grep 'carry-over' r2.err r2.jsonl` → 0 matches. The digest
  is therefore evidenced by the child prompts (R3/R4), not by a log line.

## 5. Workspace diff (TESTING.md rule 3)

```sh
find .carryover-e2e/work -type f | wc -l          # -> 0
find . -newermt '2026-11-06 09:35:00' -type f \
     -not -path './.git/*' -not -path './.carryover-e2e/*' -not -path './node_modules/*'
```

Result: **0** files were written into the session workspace by either round (both rounds were
arithmetic; the verifiers ran `expr`/`python3 -c` only), and the only paths modified outside it are
the documentation files of this change. Nothing was written to `$HOME` or to the live profile home.
