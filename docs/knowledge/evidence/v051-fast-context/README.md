# v0.5.1 live check — the quick worker answers a follow-up from bounded context (2026-11-07)

What this proves: on a **fresh, isolated DSH profile** created for this verification only, the
plugin built from this working tree hands the quick-tier (`fast`) worker the bounded conversation /
carry-over context it was triaged against, so a follow-up that never restates round 1's fact is
answered **from that fact** — no "I cannot see earlier turns", no request for the user to repeat
themselves. Fix under test: PR #41 / commit `45d721a`
(`singleCallPrompt(verdict, request, wantJson, context)` + the `fastContext` block in `src/gate.ts`).

Everything below was executed on this machine on 2026-11-07 (Asia/Singapore) against the release
commit `720eeb6` (`release/0.5.1`) with `lib/` rebuilt by `npm run ci`.

## Environment

| | |
|---|---|
| Machine | operator machine, `/home/fish/projects_mine/dsh-grok-workflow` |
| Node / npm | `v26.8.1` / `11.19.0` |
| DSH CLI | `0.2.1-rc.2` (`dsh --version`) |
| Isolated DSH home | `.v051-verify/home` (`DSH_HOME`, created for this run — the operator's `/home/fish/dsh-layerfs` was never touched) |
| Profile | `v051f`, created with `--from-default-profile headless` (shipped `headless` template) |
| Session workspace | `.v051-verify/work` (empty at start) |
| Model route | `bifrost-completions` → `wb/cn:deepseek-v4.1-flash`, key taken from `apiKeyEnv: BIFROST_VIRTUAL_KEY` (presence checked as a boolean only; no credential read, written or echoed) |
| Plugin | loaded from the build artifact: `file:///home/fish/projects_mine/dsh-grok-workflow/lib/index.js` |
| Gate | `grokDefault: "on"`, `answerStrategy: in-turn`, `showProgress: true` for the gated turns; `grokDefault: "off"` for each session's first message (F1/D-035 workaround) |

## Reproduction

The three overlays are not committed (they live in the untracked `.v051-verify/` fixture). Their
content, verbatim:

`.v051-verify/model.patch.yml`

```yaml
- id: llm-pi-ai
  config:
    providers:
      bifrost-completions:
        displayName: Bifrost Completions
        api: openai-completions
        baseURL: https://models.fyrali.com/openai/v1
        apiKeyEnv: BIFROST_VIRTUAL_KEY
        models:
          - id: wb/cn:deepseek-v4.1-flash
            name: DeepSeek V4.1 Flash (cn)
            contextWindow: 500000
- id: agent-default-model
  config:
    provider: bifrost-completions
    model: wb/cn:deepseek-v4.1-flash
```

`.v051-verify/plugin-on.patch.yml` (gated) and `.v051-verify/plugin-off.patch.yml` (gate off for the
first message only) — both `insert` one `grok-workflow` row named
`file:///home/fish/projects_mine/dsh-grok-workflow/lib/index.js`; `plugin-on` sets
`answerStrategy: in-turn`, `grokDefault: "on"`, `showProgress: true`, `plugin-off` sets
`answerStrategy: in-turn`, `grokDefault: "off"`.

```bash
cd /home/fish/projects_mine/dsh-grok-workflow
mkdir -p .v051-verify/home .v051-verify/work
export DSH_HOME="$PWD/.v051-verify/home"
dsh --profile v051f --from-default-profile headless --dump-config >/dev/null   # creates the profile
cd .v051-verify/work

# session A — round 1 material, then a follow-up that never restates it
# (turn 1 must be gate-off: resuming a session whose FIRST message went through the gate hits
#  F1/D-035, `SessionFormatError: system/message requires a protected first surface head`)
dsh --profile v051f --patch ../model.patch.yml --patch ../plugin-off.patch.yml --json \
    "你好，用一句话打个招呼。"                                    # -> session-1f46bda8-…
dsh --profile v051f --patch ../model.patch.yml --patch ../plugin-on.patch.yml \
    --session-id session-1f46bda8-3f85-4cd6-83c7-60cd26c56485 --json \
    "任务：在当前工作目录创建一个文件 note.txt，内容只有一行：SESSION-FACT: 391。创建后读回来确认内容无误，再告诉我文件里最终写的数字是多少。"
dsh --profile v051f --patch ../model.patch.yml --patch ../plugin-on.patch.yml \
    --session-id session-1f46bda8-3f85-4cd6-83c7-60cd26c56485 --json \
    "用人话告诉我：刚才那个 SESSION-FACT 里的数字是多少？只要一句结论，顺带说清这个数字是从哪儿来的。"
```

The child prompts were read out of the isolated home's own session logs:

```bash
zstd -dc .v051-verify/home/sessions/--home-fish-projects_mine-dsh-grok-workflow-.v051-verify-work--/\
b967ee28-ec3b-4da6-b764-f8c94ac71c64/session.v4.jsonl.zstd | grep -c 'Context (do not ask for what is already here)'
# 2  (the same prompt appears as agent/inbox/spliced and as user/message)
```

## Results (session A, `session-1f46bda8-3f85-4cd6-83c7-60cd26c56485`)

| Turn | Tier / route | Result | Evidence |
|---|---|---|---|
| 1 (gate off) | plain model | `你好！很高兴见到你，有什么我可以帮你的吗？`, exit 0 | `session-a-turn1-gateoff-events.jsonl` |
| 2 (gated, first material round) | **快手档 fast** | created `note.txt`, reported the fact `SESSION-FACT: 391`, exit 0 | `session-a-turn2-gated-events.jsonl` |
| 3 (gated, follow-up that does **not** restate 391) | **快手档 fast** — "这是对上文的追问，有历史可接" | answered `数字是 391`, named its source as the previous round's report, never said it cannot see earlier turns, never asked for a restatement, exit 0 | `session-a-turn3-followup-events.jsonl` |

The prompt the follow-up's quick worker actually received contains the bounded context block and
round 1's report, verbatim (`session-a-context-block.txt`, complete prompt in
`session-a-round2-child-prompt.txt`):

```text
Context (do not ask for what is already here):
Conversation so far (context only):
User: 你好，用一句话打个招呼。
…
Assistant: <<<GROK-WORKFLOW-REPORT>>>
… SESSION-FACT: 391 … 文件中最终写的数字是 **391**。
<<<END-GROK-WORKFLOW-REPORT>>>

Request:
用人话告诉我：刚才那个 SESSION-FACT 里的数字是多少？只要一句结论，顺带说清这个数字是从哪儿来的。
```

`note.txt` was deleted after round 1 (a copy was kept outside the session workspace) so the number
was not reachable by re-reading the work directory; the answer still produced it, and the model
itself noticed the file was gone ("当前工作目录 work/ 是空的、note.txt 根本不在那儿"). The whole
prompt is 4 357 characters, i.e. the block is bounded, not the transcript.

## Second session (B) — team round PASS, then resume BLOCKED (F3, recorded not fixed)

A second, independent session was run to exercise the *team* half (`--session-id` after a team
round). Round 1 (gate off) and round 2 (`团队档`, real workflow: `Grok workflow: COMPLETED`,
`47×13 = 611`, `611+100 = 711`, `report.txt` written and read back — see
`session-b-turn2-team-events.jsonl`) both passed, and then resuming that session failed:

```bash
dsh --profile v051f --patch ../model.patch.yml --patch ../plugin-on.patch.yml \
    --session-id session-1f1024ae-2504-44cd-85c0-59476a381885 --json "用人话告诉我：…"
# exit 1
# dsh: stored session "session-1f1024ae-…" is corrupt: stored log is corrupt:
#   SessionFormatError: assistant/message does not match an open turn and step
```

`session-b-orphan-receipt.txt` shows why: line 26 of the stored log is an `assistant/message`
(seq 25) written after `turn/start` (seq 22) and **before** that turn's first `step/start` (seq 37) —
the team-tier instant receipt. This is the same orphan-event class as
`../diag-ctx-compaction-2026-11-07.md` (there it breaks `tokenMeter.measure()`; here it breaks
loading the log at all). It is `CONFIRMED` and **not fixed here**: fixing the receipt/envelope write
is out of this task's scope (F1/D-035 and the Round 24 compression diagnosis are both explicitly
left to the user's decision).

Consequence for coverage: the live sample exercises the **history** half of `fastContext`
(`recalled === undefined` → `histForTriage` + digest, digest empty because that session had no
prior team round). The digest half is covered by `test/carryover.spec.ts` (Round 21 live sample) and
by `test/triage.spec.ts`.

## Boundary — what this does NOT claim

- One model (`wb/cn:deepseek-v4.1-flash`), one machine, one task pair. This is a behavioural check
  that a follow-up is answered from the carried context, not a quality matrix.
- The follow-up's answer was also cross-checked by the worker with tool reads (it read the snapshot
  file outside the workspace and `t1.jsonl`), so "answered from context" is established by the
  **prompt** containing the fact, not only by the wording of the answer.
- The operator's live `:3090` Web GUI instance was **not** reloaded, restarted or reconfigured
  (D-013); it still runs `dsh-grok-workflow@0.2.7`. The operator's own `DSH_HOME`
  (`/home/fish/dsh-layerfs`) was never written.
- Nothing here is a claim that the orphan-receipt defect (F3) is fixed, or that a team round can be
  resumed on this DSH version.
