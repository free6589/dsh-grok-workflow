import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.js'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import { execution, task, verification } from './fixtures.js'
import { runWorkflowScript } from './helpers.js'

interface ExecutableTool {
  name: string
  execute(args: Record<string, unknown>, exec: Record<string, unknown>): Promise<unknown>
  output: { render(args: unknown, value: unknown): { type: string; text: string }[] }
}

class FakeEngine {
  readonly startCalls: WorkflowStartRequest[] = []
  readonly runs: FakeRun[] = []
  autoRun = false

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    this.startCalls.push(request)
    const run = new FakeRun(request)
    this.runs.push(run)
    request.signal?.addEventListener('abort', () => { run.cancel('signal aborted') }, { once: true })
    if (this.autoRun) {
      const tasks = (request.args as { tasks?: ReturnType<typeof task>[] }).tasks ?? [task('a')]
      const result = await runWorkflowScript(request.script, request.args as Record<string, unknown>, async (_prompt, options) => {
        if (options.label.startsWith('grok-worker-')) return execution('work done')
        if (options.label.startsWith('grok-verifier-')) return verification(tasks[0]!)
        if (options.label === 'grok-planner') return { tasks }
        throw new Error(`unexpected label ${options.label}`)
      })
      run.complete(result.report)
    }
    return run
  }
}

class FakeRun {
  readonly id = 'run-test'
  readonly meta: WorkflowStartRequest['meta']
  readonly cancel = vi.fn((_reason?: string) => {
    this.resolve({ value: null, stopReason: 'cancelled', agentsStarted: 0 })
  })
  readonly dispose = vi.fn(async () => {})
  readonly result: Promise<{ value: unknown; stopReason: string; agentsStarted: number }>
  private resolve!: (value: { value: unknown; stopReason: string; agentsStarted: number }) => void

  constructor(request: WorkflowStartRequest) {
    this.meta = request.meta
    this.result = new Promise(resolve => { this.resolve = resolve })
  }

  complete(value: unknown): void {
    this.resolve({ value, stopReason: 'completed', agentsStarted: 2 })
  }
}

class FakeContext {
  readonly effects: (() => Promise<void> | void)[] = []
  readonly warnings: string[] = []
  tool: ExecutableTool | undefined
  promptSections: unknown[] = []
  readonly engine = new FakeEngine()
  readonly tools = {
    register: (tool: ExecutableTool) => { this.tool = tool; return () => { this.tool = undefined } },
  }

  readonly systemPrompt = {
    section: (section: unknown) => { this.promptSections.push(section); return () => {} },
    getSectionOrder: () => 2600,
  }

  readonly logger = () => ({ warn: (message: string) => { this.warnings.push(message) } })
  readonly workflowEngine = this.engine

  effect(installer: () => () => Promise<void> | void): () => Promise<void> | void {
    const disposer = installer()
    this.effects.push(disposer)
    return disposer
  }

  async dispose(): Promise<void> {
    for (const disposer of this.effects.splice(0).reverse()) await disposer()
  }
}

function exec(signal = new AbortController().signal, delegationDepth = 0): Record<string, unknown> {
  return {
    agent: { session: { header: { delegationDepth } } },
    signal,
    callId: 'call',
    rootCallId: 'call',
    name: 'grok_workflow',
    token: {},
  }
}

describe('plugin lifecycle and tool boundary', () => {
  it('registers the tool and prompt section, then executes through the workflow engine', async () => {
    const ctx = new FakeContext()
    ctx.engine.autoRun = true
    apply(ctx as never, { maxConcurrency: 2 })
    expect(ctx.tool?.name).toBe('grok_workflow')
    expect(ctx.promptSections).toHaveLength(1)
    const report = await ctx.tool!.execute({
      objective: 'do the thing',
      tasks: [{ ...task('a'), id: 'a' }],
    }, exec()) as { status: string; tasks: { status: string }[] }
    expect(report.status).toBe('completed')
    expect(report.tasks[0]!.status).toBe('verified')
    expect(ctx.engine.startCalls).toHaveLength(1)
    expect(ctx.engine.startCalls[0]!.maxTotalAgents).toBeGreaterThan(0)
    const rendered = ctx.tool!.output.render({}, report)
    expect(rendered[0]!.text).toContain('COMPLETED')
  })

  it('rejects recursive invocation from a subagent', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    await expect(ctx.tool!.execute({ objective: 'recursive' }, exec(undefined, 1))).rejects.toThrow(/cannot be invoked from a subagent/)
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('rejects invalid caller tasks before starting an engine run', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    await expect(ctx.tool!.execute({
      objective: 'do it',
      tasks: [{ title: 'x', objective: 'x', expectedOutput: 'x', acceptanceCriteria: [] }],
    }, exec())).rejects.toThrow(/acceptanceCriteria/)
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('enforces maxActiveRuns', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { maxActiveRuns: 1 })
    const first = ctx.tool!.execute({ objective: 'first' }, exec())
    await vi.waitFor(() => expect(ctx.engine.runs).toHaveLength(1))
    await expect(ctx.tool!.execute({ objective: 'second' }, exec())).rejects.toThrow(/maxActiveRuns/)
    await ctx.dispose()
    await expect(first).rejects.toThrow(/cancelled/)
  })

  it('cancels and disposes active runs during plugin unload', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const pending = ctx.tool!.execute({ objective: 'long objective' }, exec())
    await vi.waitFor(() => expect(ctx.engine.runs).toHaveLength(1))
    const run = ctx.engine.runs[0]!
    await ctx.dispose()
    await expect(pending).rejects.toThrow(/cancelled/)
    expect(run.cancel).toHaveBeenCalled()
    expect(run.dispose).toHaveBeenCalled()
  })

  it('rejects a malformed successful workflow report instead of trusting it', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const pending = ctx.tool!.execute({ objective: 'bad report' }, exec())
    await vi.waitFor(() => expect(ctx.engine.runs).toHaveLength(1))
    ctx.engine.runs[0]!.complete({ schemaVersion: 1, status: 'completed', objective: 'bad report', plan: { source: 'caller', tasks: [] }, tasks: [] })
    await expect(pending).rejects.toThrow(/unsupported schemaVersion|invalid workflow report/)
    await ctx.dispose()
  })

  it('returns a failed report when the deadline cancels the run', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { timeoutMs: 1000 })
    const report = await ctx.tool!.execute({ objective: 'too slow' }, exec()) as { status: string; errors: { phase: string }[] }
    expect(report.status).toBe('failed')
    expect(report.errors[0]!.phase).toBe('Timeout')
    await ctx.dispose()
  })
})
