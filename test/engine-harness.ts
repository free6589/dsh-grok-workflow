/**
 * Real-engine contract harness.
 *
 * Boundary (read this before trusting a green run):
 * - The workflow engine, its script VM, its guest program, its progress
 *   plumbing, its child lifecycle and its result materialization are the REAL
 *   `@deepseek-ai/dsh-workflow-ptc` implementation, running the REAL generated
 *   script text inside a real `node:vm` context.
 * - The PTC *process confinement* layer is replaced by an in-process runtime
 *   that evaluates the same program string with `new Function`. So this harness
 *   proves the engine's JavaScript contract (globals, `agent()` options and
 *   results, `structured` vs text, fatal propagation, JSON materialization), and
 *   proves nothing about sandboxing, process isolation, memory limits or
 *   cancellation of a hostile program.
 * - The subagent provider is fake: no model is called, no DSH session is
 *   created, no filesystem effect happens. Capability gating
 *   (`agentOptions`/`outputSchema`) is therefore not exercised either.
 * - `ctx.sandboxPolicy` / `ctx.workingDirectory` are minimal fakes; file policy
 *   is out of scope here.
 */
import * as vm from 'node:vm'
import { Context } from '@deepseek-ai/cordis'
import { PtcRuntime } from '@deepseek-ai/dsh-ptc-runtime'
import type { PtcRunRequest, PtcRunResult, PtcRunSpec } from '@deepseek-ai/dsh-ptc-runtime'
import PtcWorkflowEngine from '@deepseek-ai/dsh-workflow-ptc'
import type { WorkflowRun, WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'

/** One recorded `agent()` child activation. */
export interface ChildCall {
  provider?: string
  model?: string
  label?: string
  prompt: string
  outputSchema?: unknown
}

/** What the fake provider answers for one child. */
export interface ChildAnswer {
  output?: { type: 'text'; text: string }[]
  stopReason?: string
  structured?: unknown
}

export interface EngineHarness {
  run(script: string, options?: {
    args?: unknown
    meta?: { name: string; description: string }
    maxTotalAgents?: number
    subagentProvider?: string
  }): Promise<{ stopReason: string; value: unknown; error?: string; agentsStarted: number }>
  readonly children: ChildCall[]
  readonly events: string[]
  dispose(): Promise<void>
}

/** Evaluate the workflow program in-process (no process confinement). */
class InProcessPtcRuntime extends PtcRuntime {
  override readonly language = 'typescript'
  override readonly isolation = 'in-process'

  override get programFormat(): 'function-body' {
    return 'function-body'
  }

  override get sandboxMode(): 'danger-full-access' {
    return 'danger-full-access'
  }

  override get timeout(): { defaultMs: number; maxMs: number } {
    return { defaultMs: 30_000, maxMs: 60_000 }
  }

  override get executionInstructions(): string {
    return 'In-process contract harness; no process confinement.'
  }

  override async release(): Promise<void> {}

  override resolve(request: PtcRunRequest): PtcRunSpec {
    return { ...request, cwd: request.cwd ?? process.cwd(), timeoutMs: request.timeoutMs ?? null }
  }

  override async run(spec: PtcRunSpec): Promise<PtcRunResult> {
    const globals: Record<string, unknown> = {}
    for (const namespace of spec.bindings) {
      const members: Record<string, unknown> = Object.create(null)
      for (const [name, fn] of Object.entries(namespace.functions)) members[name] = fn
      globals[namespace.global] = members
    }
    try {
      // `vm.Script` (not `new Function`) so the program keeps a working dynamic
      // `import()`: the engine's program imports its guest module from a
      // `data:` URL, exactly as the released runtime does.
      const script = new vm.Script(`(async () => {\n${spec.program}\n})()`, {
        filename: 'ptc-in-process-program',
        // Node's own loader, so the engine's `data:` guest module resolves the
        // way it does in production. The API is marked experimental upstream and
        // prints one warning per process; a hand-written callback does not work
        // under the test runner's module transform.
        importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
      })
      const context = vm.createContext(globals, { name: 'ptc-in-process' })
      const value = await script.runInContext(context)
      if (value === undefined) return { logs: [] }
      const serialized: unknown = JSON.parse(JSON.stringify(value))
      return { logs: [], value: serialized as NonNullable<PtcRunResult['value']> }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { logs: [], error: { kind: 'exception', message } }
    }
  }
}

/**
 * Start the real engine over an in-process runtime and a scripted subagent
 * provider. `answer` decides what each child returns, so a test can drive
 * structured output, text output, a missing `structured`, or a child failure.
 */
export function createEngineHarness(answer: (call: ChildCall) => ChildAnswer | Promise<ChildAnswer>): EngineHarness {
  const children: ChildCall[] = []
  const events: string[] = []

  const provider = {
    name: 'contract-fake',
    capabilities: { agentOptions: true, agentPreset: false, outputSchema: true, depthLimit: true },
    inheritsParentContext: false,
  }

  const subagents = {
    getProvider(name: string) {
      return name === provider.name ? provider : undefined
    },
    async startActivation(request: {
      request: { prompt: { text: string }[]; outputSchema?: unknown; agentOptions?: { provider?: string; model?: string } }
    }) {
      const call: ChildCall = {
        prompt: request.request.prompt.map(block => block.text).join(''),
        ...request.request.outputSchema === undefined ? {} : { outputSchema: request.request.outputSchema },
        ...request.request.agentOptions?.provider === undefined ? {} : { provider: request.request.agentOptions.provider },
        ...request.request.agentOptions?.model === undefined ? {} : { model: request.request.agentOptions.model },
      }
      children.push(call)
      const settled = await answer(call)
      return {
        childId: `child-${children.length}`,
        result: Promise.resolve({
          output: settled.output ?? [{ type: 'text' as const, text: '' }],
          stopReason: settled.stopReason ?? 'completed',
          ...settled.structured === undefined ? {} : { structured: settled.structured },
        }),
        async dispose() {},
      }
    },
  }

  const ctx = new Context()
  ctx.provide('subagents', subagents)
  new InProcessPtcRuntime(ctx)
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'danger-full-access' }) })
  ctx.provide('workingDirectory', { ensure: () => process.cwd() })
  ctx.provide('logger', () => ({ warn() {}, info() {}, error() {}, debug() {} }))

  for (const name of ['workflow/phase', 'workflow/log', 'workflow/agent-start', 'workflow/agent-end']) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cordis event payloads are structural
    ;(ctx as unknown as { on(event: string, listener: (...args: any[]) => void): void })
      .on(name, (...args: unknown[]) => {
        const detail = args[1]
        events.push(`${name}:${typeof detail === 'string' ? detail : 'event'}`)
      })
  }

  const engine = new PtcWorkflowEngine(ctx as never, {
    provider: provider.name,
    maxConcurrentAgents: 0,
    maxTotalAgents: 1000,
    maxItemsPerCall: 4096,
    syncTimeoutMs: 5000,
  })

  const parent = { session: { header: {}, id: 'contract-parent' } }

  return {
    children,
    events,
    async run(script, options = {}) {
      const request: WorkflowStartRequest = {
        script,
        meta: options.meta ?? { name: 'contract', description: 'contract harness run' },
        ...options.args === undefined ? {} : { args: options.args },
        parent: parent as never,
        ...options.maxTotalAgents === undefined ? {} : { maxTotalAgents: options.maxTotalAgents },
        ...options.subagentProvider === undefined ? {} : { subagentProvider: options.subagentProvider },
      }
      const run: WorkflowRun = engine.start(request)
      const result = await run.result
      await run.dispose()
      return result
    },
    async dispose() {
      await ctx.fiber.dispose()
    },
  }
}
