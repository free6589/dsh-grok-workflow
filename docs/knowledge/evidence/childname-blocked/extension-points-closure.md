# Extension-point closure for the child display label (2026-11-08, Round 29)

What this file proves: the **last two plausible plugin-side extension points** for the
workflow-child display label — (a) the per-run `subagentProvider` override on
`WorkflowStartRequest` and (b) `ctx.subagents.registerProvider()` — were examined at
type level on the installed DSH `0.2.1-rc.2` and **cannot change the label**. This
upgrades the Round 27 "alternatives rejected" entries (自定义 SubagentProvider /
插件自建 startActivation) from reasoned rejection to **type-level proof**, and confirms
the core checkout is at the same release (no upstream fix has landed).

All locators verified by direct read on 2026-11-08.

## 1. No label anywhere in the plugin-reachable request surface

`…/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-workflow/lib/types/runtime-types.d.ts:15-28`
— the complete `WorkflowStartRequest` (what the plugin passes to
`ctx.workflowEngine.start()`, see `src/run.ts:722`):

```ts
export interface WorkflowStartRequest {
    script: string;
    meta: WorkflowMeta;          // name is the run name ("任务团队", src/naming.ts:101)
    args?: unknown;
    subagentProvider?: string;   // engine-wide child-PROVIDER override (a name, not a label)
    maxTotalAgents?: number;
    parent: Agent;
    signal…
}
```

No label/title/display-name field exists. `meta.name` is controllable by the plugin but
the host template always appends ` child ${callId}`
(`dsh-workflow-ptc/lib/index.js:332`), so renaming the run cannot remove `child N`.

## 2. The provider override exists but cannot touch the label

Registration and selection are real, documented APIs:

- `…/@deepseek-ai/dsh-subagent/lib/types/index.d.ts:288` —
  `registerProvider(provider: SubagentProvider): () => void` on the `ctx.subagents`
  service (plus `getProvider` / `list`).
- `packages/workflow/workflow-ptc/src/index.ts:70-79` — `resolveSubagentProvider`
  resolves `request.subagentProvider ?? config.provider` against the registry
  (`ctx.subagents.getProvider(provider)`), engine `Config.provider` default `'spawn'`
  (`:105-111`; the Config surface is provider / maxConcurrentAgents / maxTotalAgents /
  maxItemsPerCall / syncTimeoutMs — **no label template**).
- `packages/workflow/workflow-ptc/src/index.ts` contains the **only**
  `extends WorkflowEngine` in the core checkout (grep verified) — there is no
  alternative engine the plugin could select.

But the provider contract makes the label unreachable:

- For **continuable** children (what workflow children are: descriptor
  `"mode":"continuable","provider":"spawn"`, see `child-descriptor-events.txt`), the
  provider's only participation is
  `prepareContinuable → ContinuableCreateSpec { seed? }`
  (`dsh-subagent/lib/types/types.d.ts:187-213`). The spec is DATA with a single field
  (the parent-history seed) — **no label field**. The doc comment states the
  continuation manager owns "identity reservation, composition, Agent creation, prompt
  delivery, cold resume, ownership, and disposal" and "a provider never sees the
  child's Agent".
- The descriptor is built by the runtime's `startLocal`
  (`dsh-subagent/lib/index.js:1404`): `snapshotSubagentDescriptor({ …, label: spec.label })`
  — and `spec.label` is owned by the `startActivation` caller, not the provider:
  `SubagentActivationSpec.request: Omit<SubagentStartRequest, 'label' | 'signal'>`
  with the comment "startActivation carries these fields in request while owning its
  label" (`types.d.ts:122-124,29-33`). The caller is the workflow host, which hardcodes
  the label.
- A provider **without** `prepareContinuable` executes children as external one-shot
  runs (`start?(request)`). `SubagentRunInfo` carries only
  `runId / provider / id / local` (`types.d.ts:88-102`) — no label and no session
  catalog entry — so the GUI would render the raw child session id
  (`entry.label ?? entry.id`, `dsh-client-ui-subagent/lib/client.js:201`), which is
  strictly worse than `任务团队 child N`, and it would abolish the continuable
  task-team model (child sessions, catalog panel, plugin archiver via `workflow/agent-end`
  child ids all assume continuable children).
- `ctx.subagents` exposes no `startActivation` at all (service surface:
  `registerProvider` / `getProvider` / `list` / `interruptByParent` / …,
  `index.d.ts:270-300`); `startActivation` lives on the `SubagentRuntime` class
  (`index.d.ts:135,145`) and calling it host-side would bypass the engine's `agent()`
  hook — forbidden by this repo's architecture invariant (AGENTS.md) and by the task
  wording ("children created via the workflow agent() hook").

## 3. No upstream fix has landed

`/home/fish/projects_mine/deepseek-harness` HEAD `687f282e` = merge of
`worktree/release-dsh-0.2.1-rc.2` — the same release as the installed `0.2.1-rc.2`;
`packages/workflow/workflow-ptc/src/host.ts:205` still hardcodes
`` label: `${this.meta.name} child ${callId}` `` and
`runtime.ts:183-188` still forwards only prompt/schema/provider/model. The ~3-line
upstream ask recorded in D-039 remains necessary.

## Conclusion

Within the task constraints ("plugin codebase or its documented DSH extension points
only; never modify DSH core"), no path exists that changes the primary top-panel label
of workflow children. Status **BLOCKED** stands (D-039). The two remediation options
are unchanged: the upstream ~3-line label forwarding, or the user-approved
`ctx.sessionTitle.rename` half-measure (secondary line only, does not satisfy
acceptance criterion 1).
