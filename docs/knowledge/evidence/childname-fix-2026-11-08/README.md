# Child display-name fix (fix_child_names): real-machine PASS — descriptor labels are the task names (2026-11-08)

What this proves: on the **real installed DSH** (`0.2.1-rc.2` at
`/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@deepseek-ai/dsh/`),
a fresh, isolated-profile run of the **shipping build** of the fixed plugin creates every
workflow child with a **descriptive durable display label** — the planner reads
`规划助手`, workers read their task title, verifiers read `检查 · <task title>` — and the
engine-fallback label `任务团队 child N` occurs **zero** times. The pre-fix contrast runs
(same machine, same patches, pre-fix build) still produced `任务团队 child 1..3` for every
child, so the delta is the plugin fix alone.

This reverses D-039/Round 27–29's BLOCKED verdict: the extension point exists, and it is
plugin-only (see `docs/knowledge/DECISIONS.md` D-041).

## Environment

| | |
|---|---|
| Machine | operator machine, `/home/fish/projects_mine/dsh-grok-workflow` |
| DSH CLI | `0.2.1-rc.2` (`dsh --version`), Node `v26.8.1` |
| Isolated DSH home | `out/childname-fix-verify/home` (fresh; operator `DSH_HOME` and live `:3090` untouched) |
| Profile | `cfix`, created `--from-default-profile headless` |
| Session workspace | `out/childname-fix-verify/work` |
| Models | provider `bifrost-completions` (`wb/cn:deepseek-v4-pro` + `agnes-3.0-flash`), key via `apiKeyEnv: BIFROST_VIRTUAL_KEY` (presence checked as boolean only; never read/echoed) |
| Plugin | loaded from the working-tree build `file:///home/fish/projects_mine/dsh-grok-workflow/lib/index.js` (fix included; overlays reused from `out/v060-verify/`: `model-pro.patch.yml`, `plugin-off.patch.yml`, `plugin-on.patch.yml` — gate off→on, `mode: full`, `maxTasks: 2`, `maxRetries: 0`) |
| Final verification command | `DSH_HOME="$PWD/../home" dsh --profile cfix --patch ../../v060-verify/model-pro.patch.yml --patch ../../v060-verify/plugin-on.patch.yml --session-id session-941d9487-… --json "用团队档做两件事：…final-sum.txt…final-prod.txt…"` → exit 0, `Grok workflow: COMPLETED`, both files created and verified |

## Results

`child-descriptor-events-final-run.txt` — the first durable `subagent/descriptor` event of
all 6 children of the final run (planner, 2 workers incl. one real route-switch retry to
`agnes-3.0-flash`, 2 verifiers):

```text
"label":"规划助手"
"label":"创建并读回核验 final-sum.txt（内容 TOTAL: 2026）"
"label":"创建并读回核验 final-prod.txt（内容 PRODUCT: 2026）"
"label":"创建并读回核验 final-prod.txt（内容 PRODUCT: 2026）"   (route-switch retry)
"label":"检查 · 创建并读回核验 final-sum.txt（内容 TOTAL: 2026）"
"label":"检查 · 创建并读回核验 final-prod.txt（内容 PRODUCT: 2026）"
```

Label audit over the final run: **0** occurrences of `任务团队 child`.
`child-descriptor-events-prefix-run.txt` — the pre-fix contrast (3 children, all
`任务团队 child 1..3`).

The parent session (`session-941d9487-…`) logged the team report `Grok workflow:
COMPLETED`; the workflow observer records still carry the plugin's member labels
(`规划助手`/`执行`/`检查`), unchanged — the fix only redirects the durable descriptor
label, which is what the Web GUI team panel renders as the child's primary name.

## Why the pre-fix runs failed and how the seam was found (root-cause trail)

Three interim runs between the first build and the passing build, each with an
env-gated stderr probe (since removed from the shipping code):

1. Proxy view over the plugin context → twin build threw
   `cannot get property "ptcRuntime" without inject` (cordis's get handler is
   receiver-keyed; forwarding the raw target as receiver broke the ancestor-fiber walk).
2. Receiver-correct proxy over the engine's own context → same error on `subagents`:
   cordis property access of a service is isolate-guarded, and the plugin context cannot
   see the engine bundle's services at all. The recorded probe:
   `{"ownKeys":["fiber"],"hasOwnSubagents":false,"readSubagents":"threw: cannot get property \"subagents\" without inject","getSubagents":"object","reflectGet":"object","readWorkflowEngine":"object"}`
   — property read throws while `ctx.get('subagents')` and `ctx.reflect.get('subagents', false)` return the service.
3. Shipping shape: a minimal service holder resolved from the engine's own context via
   `ctx.get(name)` (property-read-first, explicit-API fallback), `subagents` decorated,
   `reflect.provide` neutralized (the twin stays unregistered), engine config mirrored.
   Interim run 8's probe then showed `twin built ok`, `resolved engine: twin=true`, and
   `startActivation intercepted` × 6 with the engine-proposed `任务团队 child 1..6` —
   each rewritten before `startLocal` snapshots the descriptor.

## Boundary — what this does NOT claim

- The **live `:3090` instance was not touched** (D-013; it still runs the released
  `0.2.7` plugin). The GUI's primary name is a direct function of the descriptor label
  per `@deepseek-ai/dsh-client-ui-subagent/lib/client.js:201` (`entry.label ?? entry.id`,
  source-verified this round), so the panel now shows the labels above; clicking around
  in a browser against the live instance was not possible (endpoint 401, no credential
  read per policy).
- DSH core is unmodified: `git -C /home/fish/projects_mine/deepseek-harness status` clean
  at `687f282e` throughout.
- Deterministic unit tests (`test/team-engine.spec.ts`, 12 cases) cover the label
  derivation, the seam rewrite, the non-PTC fallback, and the prompt-first-line contract
  over the real `WORKFLOW_SCRIPT`; full suite `npm run ci` → 37 files / 650 tests PASS.
