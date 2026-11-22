import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_TIMEOUT_MS,
  FIXED_TIMEOUT_MS,
  MAX_TIMER_DELAY_MS,
  resolveConfig,
} from '../src/config.js'
import type { ResolvedConfig } from '../src/types.js'
import { apply } from '../src/index.js'
import { assertWorkflowReport, renderReport } from '../src/report.js'
import { buildWorkflowRequest, maxTotalAgentsFor, routeBudgetFor } from '../src/script.js'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import { callerTask, task } from './fixtures.js'

/**
 * v0.11.0: the run deadline is the ninth config key (`timeoutMs`).
 *
 * Committed contract (85541ad, must not drift without a version bump):
 * default 3_600_000 (60 min, measured in t45); 0 = unlimited (no timer is
 * armed — an explicit opt-in, never the default); any non-negative integer up
 * to MAX_SAFE_INTEGER is accepted; negatives, fractions, NaN and non-numbers
 * fail the load with a reason naming `timeoutMs`; a value above
 * MAX_TIMER_DELAY_MS (the setTimeout ceiling Node fires immediately) runs
 * unlimited internally while report and checkpoint record the configured
 * number; `defineTool({timeoutMs})` omits the field when 0 or overflow
 * (DSH requires a positive finite number) and otherwise carries the run
 * deadline plus 60 s of headroom, never past the ceiling.
 *
 * Harness: the hanging-engine FakeEngine from test/plugin-lifecycle.spec.ts
 * (a started run that never settles unless cancelled), driven with fake
 * timers so the suite never waits out a real deadline.
 */

class HangingRun {
  readonly id = 'run-timeout'
  readonly meta: WorkflowStartRequest['meta']
  readonly cancel = vi.fn((_reason?: string) => {
    this.settle({ value: null, stopReason: 'cancelled', agentsStarted: 0 })
  })
  readonly dispose = vi.fn(async () => {})
  readonly result: Promise<{ value: unknown; stopReason: string; agentsStarted: number }>
  private settle!: (value: { value: unknown; stopReason: string; agentsStarted: number }) => void

  constructor(request: WorkflowStartRequest) {
    this.meta = request.meta
    this.result = new Promise(resolve => { this.settle = resolve })
  }
}

class HangingEngine {
  readonly startCalls: WorkflowStartRequest[] = []
  readonly runs: HangingRun[] = []

  async start(request: WorkflowStartRequest): Promise<HangingRun> {
    const run = new HangingRun(request)
    this.startCalls.push(request)
    this.runs.push(run)
    // The timer aborts the signal; the engine honours it the way the real one
    // does (belt-and-braces listener in run.ts also cancels on abort).
    request.signal?.addEventListener('abort', () => { run.cancel('signal aborted') }, { once: true })
    return run
  }
}

interface ExecutableTool {
  name: string
  timeoutMs?: number
  execute(args: Record<string, unknown>, exec: Record<string, unknown>): Promise<unknown>
  output: { render(args: unknown, value: unknown): { type: string; text: string }[] }
}

class FakeContext {
  readonly effects: (() => Promise<void> | void)[] = []
  readonly toolsByName = new Map<string, ExecutableTool>()
  get tool(): ExecutableTool | undefined { return this.toolsByName.get('grok_workflow') }
  readonly engine = new HangingEngine()
  readonly tools = {
    register: (tool: ExecutableTool) => {
      this.toolsByName.set(tool.name, tool)
      return () => { if (this.toolsByName.get(tool.name) === tool) this.toolsByName.delete(tool.name) }
    },
  }

  readonly systemPrompt = {
    section: () => () => {},
    getSectionOrder: () => 2600,
  }

  readonly logger = () => ({ warn: () => {} })
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

afterEach(() => {
  vi.useRealTimers()
})

describe('timeoutMs default and validation (v0.11.0 contract)', () => {
  it('defaults to 60 minutes and aliases the historical FIXED_TIMEOUT_MS name', () => {
    expect(resolveConfig({}).timeoutMs).toBe(3_600_000)
    expect(DEFAULT_TIMEOUT_MS).toBe(3_600_000)
    expect(FIXED_TIMEOUT_MS).toBe(DEFAULT_TIMEOUT_MS)
  })

  it('rejects illegal values with a reason naming timeoutMs (4 cases)', () => {
    const bad: Array<{ value: unknown; label: string }> = [
      { value: -1, label: 'negative' },
      { value: 1.5, label: 'fraction' },
      { value: Number.NaN, label: 'NaN' },
      { value: 'x', label: 'non-number' },
    ]
    for (const { value, label } of bad) {
      expect(() => resolveConfig({ timeoutMs: value } as never), label)
        .toThrow(/timeoutMs must be a non-negative integer/)
    }
  })

  it('accepts the boundary values a caller may actually configure', () => {
    expect(resolveConfig({ timeoutMs: 0 }).timeoutMs).toBe(0)
    expect(resolveConfig({ timeoutMs: 1 }).timeoutMs).toBe(1)
    expect(resolveConfig({ timeoutMs: 120_000 }).timeoutMs).toBe(120_000)
    expect(resolveConfig({ timeoutMs: MAX_TIMER_DELAY_MS }).timeoutMs).toBe(MAX_TIMER_DELAY_MS)
    expect(resolveConfig({ timeoutMs: Number.MAX_SAFE_INTEGER }).timeoutMs).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('timeoutMs deadline behaviour (fake timers, hanging engine)', () => {
  it('fires the default 3600000 ms deadline with a Timeout report naming the bound', async () => {
    vi.useFakeTimers()
    const ctx = new FakeContext()
    apply(ctx as never, {})
    const pending = ctx.tool!.execute({ objective: 'hangs with default deadline' }, exec())
    await vi.waitFor(() => expect(ctx.engine.startCalls).toHaveLength(1))
    const report = await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS + 1_000).then(() => pending) as {
      status: string
      limits: { timeoutMs?: number }
      errors: { phase: string; message: string; category: string }[]
    }
    expect(report.status).toBe('failed')
    expect(report.errors[0]!.phase).toBe('Timeout')
    expect(report.errors[0]!.category).toBe('infrastructure')
    expect(report.errors[0]!.message).toContain(`workflow exceeded the ${DEFAULT_TIMEOUT_MS} ms deadline`)
    expect(report.limits.timeoutMs).toBe(DEFAULT_TIMEOUT_MS)
    expect(ctx.engine.runs[0]!.cancel).toHaveBeenCalled()
    await ctx.dispose()
  })

  it('fires a small configured deadline (120000 ms) with the same Timeout shape', async () => {
    vi.useFakeTimers()
    const ctx = new FakeContext()
    apply(ctx as never, { timeoutMs: 120_000 })
    const pending = ctx.tool!.execute({ objective: 'hangs with small deadline' }, exec())
    await vi.waitFor(() => expect(ctx.engine.startCalls).toHaveLength(1))
    const report = await vi.advanceTimersByTimeAsync(121_000).then(() => pending) as {
      status: string
      limits: { timeoutMs?: number }
      errors: { phase: string; message: string; category: string }[]
    }
    expect(report.status).toBe('failed')
    expect(report.errors[0]!.phase).toBe('Timeout')
    expect(report.errors[0]!.category).toBe('infrastructure')
    expect(report.errors[0]!.message).toContain('workflow exceeded the 120000 ms deadline')
    expect(report.limits.timeoutMs).toBe(120_000)
    expect(ctx.engine.runs[0]!.cancel).toHaveBeenCalled()
    await ctx.dispose()
  })

  it('arms no timer at 0: advancing 24 h leaves the run pending with no Timeout', async () => {
    vi.useFakeTimers()
    const ctx = new FakeContext()
    apply(ctx as never, { timeoutMs: 0 })
    const pending = ctx.tool!.execute({ objective: 'hangs with no deadline' }, exec())
    await vi.waitFor(() => expect(ctx.engine.startCalls).toHaveLength(1))
    const raced = await Promise.race([
      pending.then(() => 'settled' as const),
      vi.advanceTimersByTimeAsync(24 * 3_600_000).then(() => 'still-pending' as const),
    ])
    expect(raced).toBe('still-pending')
    // No deadline timer is armed at 0 (the checkpoint recorder's own periodic
    // timer may exist, so count is not asserted — the pending race above is the
    // proof: with a timer armed the run would have settled as Timeout).
    expect(ctx.engine.runs[0]!.cancel).not.toHaveBeenCalled()
    await ctx.dispose()
    await expect(pending).rejects.toThrow(/cancelled/)
  })

  it('reports cause cancelled — not timeout — when the caller aborts an unlimited run', async () => {
    const ctx = new FakeContext()
    // Real timers: the run has no deadline, so the abort is the only exit.
    apply(ctx as never, { timeoutMs: 0 })
    const controller = new AbortController()
    const pending = ctx.tool!.execute({ objective: 'cancel an unlimited run', tasks: [callerTask('a')] }, exec(controller.signal))
    await vi.waitFor(() => { if (ctx.engine.runs.length === 0) throw new Error('run did not start') })
    controller.abort()
    await expect(pending).rejects.toThrow(/cancelled/)
    expect(ctx.engine.runs[0]!.cancel).toHaveBeenCalled()
    await ctx.dispose()
  })
})

describe('timeoutMs tool registration (defineTool field)', () => {
  it('omits timeoutMs on the registered tool when unlimited (0)', () => {
    const ctx = new FakeContext()
    apply(ctx as never, { timeoutMs: 0 })
    expect(ctx.tool?.name).toBe('grok_workflow')
    expect(ctx.tool).not.toHaveProperty('timeoutMs')
  })

  it('omits timeoutMs on the registered tool when above the setTimeout ceiling', () => {
    const ctx = new FakeContext()
    apply(ctx as never, { timeoutMs: MAX_TIMER_DELAY_MS + 1 })
    expect(ctx.tool).not.toHaveProperty('timeoutMs')
  })

  it('carries deadline + 60 s headroom, capped at the setTimeout ceiling', () => {
    const ctx = new FakeContext()
    apply(ctx as never, { timeoutMs: 120_000 })
    expect((ctx.tool as { timeoutMs?: number }).timeoutMs).toBe(180_000)

    const capped = new FakeContext()
    apply(capped as never, { timeoutMs: MAX_TIMER_DELAY_MS })
    expect((capped.tool as { timeoutMs?: number }).timeoutMs).toBe(MAX_TIMER_DELAY_MS)
  })
})

describe('timeoutMs report parity (args, limits, Deadline line)', () => {
  const OBJECTIVE = 'Ship the verified result'

  interface TaskRow {
    id: string
    criteria: string[]
  }

  function executionResult(): Record<string, unknown> {
    return {
      summary: 'done',
      status: 'completed',
      deliverables: [{ description: 'file', locator: 'file:///tmp/out' }],
      evidence: [{ claim: 'implemented', source: 'src/index.ts' }],
      testsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
      filesChanged: ['src/index.ts'],
      uncertainties: [],
    }
  }

  function verificationResult(criteria: string[]): Record<string, unknown> {
    return {
      verdict: 'pass',
      criteria: criteria.map(criterion => ({ criterion, met: true, evidence: `verified ${criterion}` })),
      checkedEvidence: [{ kind: 'file', locator: 'file:///tmp/out', finding: 'observed' }],
      commandsRun: [{ command: 'npm test', status: 'passed', detail: 'ok' }],
      issues: [],
      confidence: 'high',
    }
  }

  function canonicalReport(config: ResolvedConfig, timeoutMs: number | undefined): Record<string, unknown> {
    const criteria = ['a works']
    return {
      schemaVersion: 'grok-workflow/v1',
      status: 'completed',
      objective: OBJECTIVE,
      plan: {
        source: 'caller',
        tasks: [{ id: 'a', title: 'Task a', objective: 'Do a', expectedOutput: 'Output a', acceptanceCriteria: criteria, context: '', constraints: [] }],
        error: '',
      },
      tasks: [{
        id: 'a',
        title: 'Task a',
        objective: 'Do a',
        expectedOutput: 'Output a',
        acceptanceCriteria: criteria,
        context: '',
        constraints: [],
        status: 'verified',
        attempts: [{
          attempt: 1,
          execution: executionResult(),
          verification: verificationResult(criteria),
          passed: true,
          error: '',
        }],
        error: '',
      }],
      confirmed: [{ taskId: 'a', criterion: 'a works', evidence: 'verified a works' }],
      incomplete: [],
      errors: [],
      uncertainties: [],
      limits: {
        maxConcurrency: 1,
        maxRetries: 1,
        maxTasks: 10,
        maxTotalAgents: maxTotalAgentsFor(1, 1, routeBudgetFor(config)),
        ...timeoutMs === undefined ? {} : { timeoutMs },
      },
    }
  }

  it('records a configured 120000 in args, limits and the Deadline line', () => {
    const config = resolveConfig({ maxConcurrency: 1, timeoutMs: 120_000 })
    const request = buildWorkflowRequest(OBJECTIVE, [task('a')], config)
    expect((request.args as { timeoutMs: number }).timeoutMs).toBe(120_000)

    const validated = assertWorkflowReport(canonicalReport(config, 120_000), OBJECTIVE, config)
    expect(validated.limits.timeoutMs).toBe(120_000)
    expect(renderReport(validated, { showDiagnostics: true })).toContain('Deadline: 120000 ms per run')
  })

  it('omits limits and the Deadline line when unlimited (0)', () => {
    const config = resolveConfig({ maxConcurrency: 1, timeoutMs: 0 })
    const request = buildWorkflowRequest(OBJECTIVE, [task('a')], config)
    // The request still carries the configured 0 (the guest treats it as no
    // bound); the report drops it because there is no deadline to name.
    expect((request.args as { timeoutMs: number }).timeoutMs).toBe(0)

    const validated = assertWorkflowReport(canonicalReport(config, undefined), OBJECTIVE, config)
    expect(validated.limits.timeoutMs).toBeUndefined()
    expect(renderReport(validated, { showDiagnostics: true })).not.toContain('Deadline:')
  })
})
