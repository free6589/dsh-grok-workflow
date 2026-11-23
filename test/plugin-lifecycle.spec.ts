import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.js'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import { callerTask, execution, task, verification } from './fixtures.js'
import {runWorkflowScript, roleOf, idOfPhase, attemptOf} from './helpers.js'

interface ExecutableTool {
  name: string
  execute(args: Record<string, unknown>, exec: Record<string, unknown>): Promise<unknown>
  output: { render(args: unknown, value: unknown): { type: string; text: string }[] }
  /** Cooperative host-side tool deadline; absent means the registry arms none. */
  timeoutMs?: number
}

class FakeEngine {
  readonly startCalls: WorkflowStartRequest[] = []
  readonly runs: FakeRun[] = []
  autoRun = false
  startError: Error | undefined
  startGate: Promise<void> | undefined
  startGateError: Error | undefined

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    this.startCalls.push(request)
    if (this.startError) throw this.startError
    if (this.startGate) await this.startGate
    if (this.startGateError) throw this.startGateError
    const run = new FakeRun(request)
    this.runs.push(run)
    request.signal?.addEventListener('abort', () => { run.cancel('signal aborted') }, { once: true })
    if (this.autoRun) {
      const tasks = (request.args as { tasks?: ReturnType<typeof task>[] }).tasks ?? [task('a')]
      const result = await runWorkflowScript(request.script, request.args as Record<string, unknown>, async (_prompt, options) => {
        if (roleOf(options.label) === 'worker') return execution('work done')
        if (roleOf(options.label) === 'verifier') return verification(tasks[0]!)
        if (roleOf(options.label) === 'planner') return { tasks }
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
  readonly toolsByName = new Map<string, ExecutableTool>()
  get tool(): ExecutableTool | undefined { return this.toolsByName.get('grok_workflow') }
  promptSections: unknown[] = []
  readonly engine = new FakeEngine()
  readonly tools = {
    register: (tool: ExecutableTool) => {
      this.toolsByName.set(tool.name, tool)
      return () => { if (this.toolsByName.get(tool.name) === tool) this.toolsByName.delete(tool.name) }
    },
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
      tasks: [callerTask('a')],
    }, exec()) as { status: string; tasks: { status: string }[] }
    expect(report.status).toBe('completed')
    expect(report.tasks[0]!.status).toBe('verified')
    expect(ctx.engine.startCalls).toHaveLength(1)
    expect(ctx.engine.startCalls[0]!.maxTotalAgents).toBeGreaterThan(0)
    const rendered = ctx.tool!.output.render({}, report)
    expect(rendered[0]!.text).toContain('COMPLETED')
  })

  // Manual item Sec.2-1 ("运行时限默认还是 60 分钟，我要的是不限时"): "0 = unlimited"
  // is only true end to end if the *host tool definition* carries no deadline
  // either. `defineTool` rejects a non-positive number, so the registration omits
  // the field for 0 and for a value past the setTimeout ceiling; a regression
  // here would put a silent host-side cap back on an unbounded run.
  it('arms no host tool deadline when the run deadline is unlimited (the default)', () => {
    const ctx = new FakeContext()
    apply(ctx as never, {})
    expect(ctx.tool?.timeoutMs).toBeUndefined()
  })

  it('gives the tool the run deadline plus 60 s of headroom when one is configured', () => {
    const ctx = new FakeContext()
    apply(ctx as never, { timeoutMs: 3_600_000 })
    expect(ctx.tool?.timeoutMs).toBe(3_660_000)
  })

  it('rejects recursive invocation from a subagent', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    await expect(ctx.tool!.execute({ objective: 'recursive' }, exec(undefined, 1))).rejects.toThrow(/cannot be invoked from a subagent/)
    expect(ctx.engine.startCalls).toHaveLength(0)
  })

  it('accepts an objective exactly at the limit', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    ctx.engine.autoRun = true
    const objective = 'x'.repeat(32000)
    const report = await ctx.tool!.execute({ objective, tasks: [callerTask('a')] }, exec()) as { status: string; objective: string }
    expect(report.status).toBe('completed')
    expect(report.objective).toBe(objective)
    await ctx.dispose()
  })

  it('rejects an overlong objective before starting an engine run', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    await expect(ctx.tool!.execute({ objective: 'x'.repeat(32001) }, exec())).rejects.toThrow(/objective must be at most 32000 characters/)
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

  it('clears the deadline timer when workflow startup rejects', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, {})
    ctx.engine.startError = new Error('start failed')
    vi.useFakeTimers()
    try {
      await expect(ctx.tool!.execute({ objective: 'startup failure' }, exec())).rejects.toThrow(/start failed/)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
    expect(ctx.engine.startCalls).toHaveLength(1)
    await ctx.dispose()
  })

  it('enforces the fixed per-session run cap (maxActiveRuns=2, T4)', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, {})
    const first = ctx.tool!.execute({ objective: 'first' }, exec())
    await vi.waitFor(() => expect(ctx.engine.runs).toHaveLength(1))
    const second = ctx.tool!.execute({ objective: 'second' }, exec())
    await vi.waitFor(() => expect(ctx.engine.runs).toHaveLength(2))
    await expect(ctx.tool!.execute({ objective: 'third' }, exec())).rejects.toThrow(/maxActiveRuns/)
    await ctx.dispose()
    await expect(first).rejects.toThrow(/cancelled/)
    await expect(second).rejects.toThrow(/cancelled/)
  })

  it('cancels a run that arrives after plugin unload during startup', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    let release!: () => void
    ctx.engine.startGate = new Promise(resolve => { release = resolve })
    const pending = ctx.tool!.execute({ objective: 'startup then unload' }, exec())
    await vi.waitFor(() => expect(ctx.engine.startCalls).toHaveLength(1))
    await ctx.dispose()
    release()
    await expect(pending).rejects.toThrow(/unloaded|cancelled/)
    const run = ctx.engine.runs[0]!
    expect(run.cancel).toHaveBeenCalled()
    expect(run.dispose).toHaveBeenCalled()
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

  it('returns the canonical validated report and drops unknown engine fields', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const pending = ctx.tool!.execute({ objective: 'canonical report' }, exec())
    await vi.waitFor(() => expect(ctx.engine.runs).toHaveLength(1))
    const request = ctx.engine.startCalls[0]!
    const fakeTasks = [task('a')]
    const result = await runWorkflowScript(request.script, request.args as Record<string, unknown>, async (_prompt, options) => {
      if (roleOf(options.label) === 'worker' && idOfPhase(options.phase) === 'a' && attemptOf(options.label) === 1) return execution('done')
      if (roleOf(options.label) === 'verifier' && idOfPhase(options.phase) === 'a' && attemptOf(options.label) === 1) return verification(fakeTasks[0]!)
      throw new Error(`unexpected label ${options.label}`)
    })
    const secret = ['sk', 'proj', 'FAKEEXAMPLE1234567890'].join('-')
    ctx.engine.runs[0]!.complete({ ...result.report, extra: { secret } })
    const report = await pending as Record<string, unknown>
    expect(report).not.toHaveProperty('extra')
    expect(JSON.stringify(report)).not.toContain(secret)
    await ctx.dispose()
  })

  it('rejects a complete-shaped report whose task status contradicts completed', async () => {
    const ctx = new FakeContext()
    apply(ctx as never)
    const pending = ctx.tool!.execute({ objective: 'contradictory report', tasks: [callerTask('a')] }, exec())
    await vi.waitFor(() => expect(ctx.engine.runs).toHaveLength(1))
    const request = ctx.engine.startCalls[0]!
    const fakeTasks = [task('a')]
    const result = await runWorkflowScript(request.script, request.args as Record<string, unknown>, async (_prompt, options) => {
      if (roleOf(options.label) === 'worker' && idOfPhase(options.phase) === 'a' && attemptOf(options.label) === 1) return execution('done')
      if (roleOf(options.label) === 'verifier' && idOfPhase(options.phase) === 'a' && attemptOf(options.label) === 1) return verification(fakeTasks[0]!)
      throw new Error(`unexpected label ${options.label}`)
    })
    const taskReport = result.report.tasks[0]!
    const contradictory = {
      ...result.report,
      status: 'completed',
      tasks: [{
        ...taskReport,
        status: 'failed',
        attempts: taskReport.attempts.map(attempt => ({ ...attempt, passed: false })),
        error: 'contradictory failure',
      }],
      confirmed: [],
      incomplete: [{ taskId: 'a', reason: 'contradictory failure' }],
    }
    ctx.engine.runs[0]!.complete(contradictory)
    await expect(pending).rejects.toThrow(/completed requires every task to be verified/)
    await ctx.dispose()
  })

  it('returns the deadline while workflow startup is still pending, then disposes a late run', async () => {
    // The default deadline is 0 = unlimited, so the test configures an explicit
    // bound — fake timers stand in for it so the suite stays fast.
    vi.useFakeTimers()
    try {
      const ctx = new FakeContext()
      apply(ctx as never, { timeoutMs: 3_600_000 })
      let release!: () => void
      ctx.engine.startGate = new Promise(resolve => { release = resolve })
      const pending = ctx.tool!.execute({ objective: 'startup never resolves before the deadline' }, exec())
      await vi.waitFor(() => expect(ctx.engine.startCalls).toHaveLength(1))

      const raced = await Promise.race([
        pending.then(report => ({ kind: 'settled' as const, report: report as { status: string; errors: { phase: string }[] } })),
        vi.advanceTimersByTimeAsync(3_600_000 + 1_000).then(() => ({ kind: 'stuck' as const })),
      ])
      // Always release the fake engine so a regression fails cleanly instead of
      // leaving a pending promise behind for the rest of the suite.
      release()
      const report = raced.kind === 'settled' ? raced.report : await pending as { status: string; errors: { phase: string }[] }

      expect(raced.kind).toBe('settled')
      expect(report.status).toBe('failed')
      expect(report.errors[0]!.phase).toBe('Timeout')
      await vi.waitFor(() => expect(ctx.engine.runs).toHaveLength(1))
      const lateRun = ctx.engine.runs[0]!
      await vi.waitFor(() => expect(lateRun.cancel).toHaveBeenCalled())
      await vi.waitFor(() => expect(lateRun.dispose).toHaveBeenCalled())
      await ctx.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns promptly when the caller cancels while workflow startup is pending', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, {})
    let release!: () => void
    ctx.engine.startGate = new Promise(resolve => { release = resolve })
    const controller = new AbortController()
    const pending = ctx.tool!.execute({ objective: 'caller cancels during startup' }, exec(controller.signal))
      .then(() => 'resolved', () => 'rejected')
    await vi.waitFor(() => expect(ctx.engine.startCalls).toHaveLength(1))

    controller.abort()
    const raced = await Promise.race([
      pending,
      new Promise<string>(resolve => setTimeout(() => resolve('stuck'), 800)),
    ])
    release()
    expect(raced).toBe('rejected')
    await vi.waitFor(() => expect(ctx.engine.runs).toHaveLength(1))
    const lateRun = ctx.engine.runs[0]!
    expect(lateRun.cancel).toHaveBeenCalled()
    expect(lateRun.dispose).toHaveBeenCalled()
    await ctx.dispose()
  })

  it('returns timeout when startup resolves after the deadline', async () => {
    // The default deadline is 0 = unlimited — an explicit bound is configured
    // here; fake timers stand in for it instead of a real wait.
    vi.useFakeTimers()
    try {
      const ctx = new FakeContext()
      apply(ctx as never, { timeoutMs: 3_600_000 })
      let release!: () => void
      ctx.engine.startGate = new Promise(resolve => { release = resolve })
      const pending = ctx.tool!.execute({ objective: 'late startup' }, exec())
      await vi.waitFor(() => expect(ctx.engine.startCalls).toHaveLength(1))
      await vi.advanceTimersByTimeAsync(3_600_000 + 1_000)
      release()
      const report = await pending as { status: string; errors: { phase: string }[] }
      expect(report.status).toBe('failed')
      expect(report.errors[0]!.phase).toBe('Timeout')
      await vi.waitFor(() => expect(ctx.engine.runs[0]!.cancel).toHaveBeenCalled())
      await vi.waitFor(() => expect(ctx.engine.runs[0]!.dispose).toHaveBeenCalled())
      await ctx.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns timeout when startup rejects after the deadline', async () => {
    // The default deadline is 0 = unlimited — an explicit bound is configured
    // here; fake timers stand in for it instead of a real wait.
    vi.useFakeTimers()
    try {
      const ctx = new FakeContext()
      apply(ctx as never, { timeoutMs: 3_600_000 })
      let release!: () => void
      ctx.engine.startGate = new Promise(resolve => { release = resolve })
      const pending = ctx.tool!.execute({ objective: 'late rejection' }, exec())
      await vi.waitFor(() => expect(ctx.engine.startCalls).toHaveLength(1))
      await vi.advanceTimersByTimeAsync(3_600_000 + 1_000)
      ctx.engine.startGateError = new Error('startup aborted')
      release()
      const report = await pending as { status: string; errors: { phase: string }[] }
      expect(report.status).toBe('failed')
      expect(report.errors[0]!.phase).toBe('Timeout')
      await ctx.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns a failed report when the deadline cancels the run', async () => {
    // The default deadline is 0 = unlimited — an explicit bound is configured
    // here. The engine never settles, so advancing past the configured deadline
    // must fail the run.
    vi.useFakeTimers()
    try {
      const ctx = new FakeContext()
      apply(ctx as never, { timeoutMs: 3_600_000 })
      const pending = ctx.tool!.execute({ objective: 'too slow' }, exec())
      const report = await vi.advanceTimersByTimeAsync(3_600_000 + 1_000).then(() => pending) as { status: string; errors: { phase: string }[] }
      expect(report.status).toBe('failed')
      expect(report.errors[0]!.phase).toBe('Timeout')
      await ctx.dispose()
    } finally {
      vi.useRealTimers()
    }
  })
})
