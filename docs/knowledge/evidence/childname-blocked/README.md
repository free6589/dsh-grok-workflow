# Child display-name fix (fix_child_names): BLOCKED evidence — real-machine reproduction (2026-11-07)

What this proves: on the **real installed DSH** (`0.2.1-rc.2` at
`/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@deepseek-ai/dsh/`),
a **fresh, isolated profile** run of the dsh-grok-workflow plugin creates every
workflow child with the engine-generated durable display label
`任务团队 child N` — the plugin-supplied descriptive labels (`规划助手` /
`执行` / `检查`) are recorded **only** in the parent session's
`tool-workflow/agent-start` observer records and never reach the child's
`subagent/descriptor`. The GUI top panel renders the descriptor label as the
primary name (`dsh-client-ui-subagent/lib/client.js:201`,
`entry.label ?? entry.id`), which is exactly the user-reported
`任务团队 child N` + prompt-text-title display.

This upgrades D-039 (BLOCKED) from source-derived to **observed on this
machine**. The primary label is written by DSH core at child creation
(`dsh-workflow-ptc/lib/index.js` host `startChild`: `` label: `${this.meta.name} child ${callId}` ``;
guest `agent()` forwards only prompt/schema/provider/model — `opts.label`
feeds observer events only) and is locked immutable by the descriptor contract
(`dsh-subagent/lib/index.js` `foldSubagentDescriptor` takes the first
`subagent/descriptor` event; the type comment states a later same-type event
cannot rewrite the composition). No plugin-side or documented extension point
can change it. See `docs/knowledge/DECISIONS.md` D-039 for the full rationale
and the rejected alternatives.

## Environment

| | |
|---|---|
| Machine | operator machine, `/home/fish/projects_mine/dsh-grok-workflow` |
| DSH CLI | `0.2.1-rc.2` (`dsh --version`) |
| Node | `v26.8.1` |
| Isolated DSH home | `out/childname-verify/home` (created for this run; operator `DSH_HOME` and live `:3090` untouched) |
| Profile | `cnamer`, created with `--from-default-profile headless` |
| Session workspace | `out/childname-verify/work` (disposable; session dir under `home/sessions/` is the isolation proof) |
| Models | provider `bifrost-completions` (`wb/cn:deepseek-v4-pro` + `agnes-3.0-flash`), key via `apiKeyEnv: BIFROST_VIRTUAL_KEY` (presence checked as boolean only; never read/echoed) |
| Plugin | loaded from the working-tree build `file:///home/fish/projects_mine/dsh-grok-workflow/lib/index.js` (HEAD `524097f` + the concurrent task's client-bundle change; the child-naming path `src/script.ts`/`src/run.ts` is untouched by that change) |
| Overlays | reused `out/v060-verify/model-pro.patch.yml`, `plugin-off.patch.yml`, `plugin-on.patch.yml` (gate off → on, `mode: full`, `maxTasks: 2`, `maxRetries: 0`) |

## Run

```bash
cd out/childname-verify/work
DSH_HOME="$PWD/../home" dsh --profile cnamer \
  --patch ../../v060-verify/model-pro.patch.yml --patch ../../v060-verify/plugin-off.patch.yml \
  --json "你好，用一句话打个招呼。"
# -> session-765de8f7-15ae-490b-8c16-ce39018edac9, exit 0
DSH_HOME="$PWD/../home" dsh --profile cnamer \
  --patch ../../v060-verify/model-pro.patch.yml --patch ../../v060-verify/plugin-on.patch.yml \
  --session-id session-765de8f7-15ae-490b-8c16-ce39018edac9 \
  --json "用团队档做两件事：第一，在当前工作目录创建文件 sum.txt，内容只有一行：TOTAL: 611；第二，在当前工作目录创建文件 prod.txt，内容只有一行：PRODUCT: 611。两个文件都创建后读回来确认内容无误，再用人话告诉我两个文件里的数字。"
# -> team round COMPLETED (2 tasks verified; one real format-error route switch on worker attempt 1), exit 0
```

## Results

Parent session records (`parent-run-start-excerpt.txt`,
`parent-agent-start-excerpts.txt`): run name `任务团队` (task count unknown at
start, plan-first), and every `agent()` call carries the plugin's descriptive
label + phase, e.g. `{"label":"规划助手","phase":"规划","childId":"de461a52…"}`,
`{"label":"执行","phase":"任务 1 · Create and verify sum.tx…","childId":"eaad1243…"}`.

Child sessions (`child-descriptor-events.txt`): the **first** durable
`subagent/descriptor` event of every one of the 6 children (planner 1, workers
2/3/5, verifiers 4/6) reads `"label":"任务团队 child N"` at `seq 0`:

```text
{"type":"subagent/descriptor","seq":0,…,"data":{"version":3,"mode":"continuable","provider":"spawn","label":"任务团队 child 1",…}}
… identical shape for child 2 … child 6
```

So the top-panel display is `任务团队 child N` (primary, from the descriptor)
plus the child session title (secondary; auto-generated per
`dsh-session-title`, falling back to the first user message words
`You are the planning agent` / `You are the execution agent` until/unless
generated). Both halves of the user's complaint are reproduced.

## Boundary — what this does NOT claim

- The **live `:3090` instance was not touched** (D-013; it still runs the
  released `0.2.7` plugin). This reproduction runs an isolated profile on the
  same machine and the same installed DSH core.
- The GUI rendering itself was not clicked in a browser this round; the
  rendered string is a direct consequence of the descriptor label per
  `dsh-client-ui-subagent/lib/client.js:201` (source-verified) plus the
  user-observed screenshot recorded in the task. Web GUI fetch was already
  `BLOCKED` in Round 24 (endpoint 401, no credential read per policy).
- No fix exists yet to verify; this evidence supports the **BLOCKED** verdict,
  not a pass.
