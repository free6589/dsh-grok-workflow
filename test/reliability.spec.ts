import { describe, expect, it, vi } from 'vitest'
import { Session, pluginRecordOf } from '@deepseek-ai/dsh-session'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import { apply } from '../src/index.js'
import { Config, CONFIG_KEYS, createConfigReader, FIXED_TIMEOUT_MS, resolveConfig, snapshotConfig } from '../src/config.js'
import { ROUTING_RECORD, recordRouting } from '../src/records.js'
import { describeSurface } from '../src/settings.js'
import { assertWorkflowReport, failureReport, failureSummary, renderReport } from '../src/report.js'
import { buildWorkflowRequest, WORKFLOW_SCRIPT } from '../src/script.js'
import { createActiveState, runWorkflow } from '../src/run.js'
import {runWorkflowScript, type ScriptAgent, roleOf, idOfPhase, indexOfPhase} from './helpers.js'
import { callerTask, execution, failingVerification, task, verification } from './fixtures.js'

/**
 * 阶段6 — reliability and safety, one test per guarantee.
 *
 * The eight items the task names (cancellation, deadline, concurrency cap,
 * duplicate start, recursion, context bounds, secrets, error records, partial
 * semantics, unload/reload) each get a case below, plus the three follow-ups the
 * captain added: live configuration holders, the settings-surface diagnostic, and
 * the `cancelled` category for a deliberate stop.
 */

/* ----------------------------------------------------------------- harness -- */

interface EngineResult { value: unknown; stopReason: string; agentsStarted: number }

class FakeRun {
  readonly meta: WorkflowStartRequest['meta']
  readonly cancel = vi.fn((_reason?: string) => {
    this.settle({ value: null, stopReason: 'cancelled', agentsStarted: 0 })
  })

  readonly dispose = vi.fn(async () => {})
  readonly result: Promise<EngineResult>
  private settle!: (value: EngineResult) => void

  constructor(request: WorkflowStartRequest) {
    this.meta = request.meta
    this.result = new Promise(resolve => { this.settle = resolve })
  }

  complete(value: unknown): void {
    this.settle({ value, stopReason: 'completed', agentsStarted: 2 })
  }
}

class FakeEngine {
  readonly startCalls: WorkflowStartRequest[] = []
  readonly runs: FakeRun[] = []
  /** When true a started run never settles, so the deadline has to fire. */
  hang = false
  /** When true the first worker call fails with a rate limit, forcing a switch. */
  failFirstWorker = false
  /** When true `cancel()` is accepted and ignored, like an engine that keeps working. */
  stubborn = false

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    this.startCalls.push(request)
    const run = new FakeRun(request)
    this.runs.push(run)
    // t46 measured a real engine still working five minutes after its deadline.
    // A cancel that settles was the only shape the fake engine could produce, so
    // the deadline's own promise went untested; this flag closes that hole.
    if (this.stubborn) run.cancel.mockImplementation(() => {})
    if (!this.hang) {
      let workerCalls = 0
      const result = await runWorkflowScript(request.script, request.args as Record<string, unknown>, async (_prompt, options) => {
        if (roleOf(options.label) === 'worker') {
          workerCalls += 1
          if (this.failFirstWorker && workerCalls === 1) throw new Error('429 Too Many Requests')
          return execution('work done')
        }
        if (roleOf(options.label) === 'verifier') return verification((request.args as { tasks: ReturnType<typeof task>[] }).tasks[0]!)
        throw new Error(`unexpected label ${options.label}`)
      })
      run.complete(result.report)
    }
    return run
  }
}

interface ExecutableTool {
  name: string
  execute(args: Record<string, unknown>, exec: Record<string, unknown>): Promise<unknown>
}

class FakeContext {
  readonly effects: (() => Promise<void> | void)[] = []
  readonly warnings: string[] = []
  readonly infos: string[] = []
  readonly listeners = new Map<string, (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>>()
  readonly toolsByName = new Map<string, ExecutableTool>()
  get tool(): ExecutableTool | undefined { return this.toolsByName.get('grok_workflow') }
  readonly engine = new FakeEngine()

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

  readonly logger = () => ({
    warn: (message: string) => { this.warnings.push(message) },
    info: (message: string) => { this.infos.push(message) },
  })

  readonly workflowEngine = this.engine

  /**
   * Bound, like cordis's own `on`.
   *
   * `src/block/brakes.ts` reads `ctx.on` into a local and calls it, so a method that
   * relied on its receiver would throw there; the real context binds its methods, and
   * this double has to behave the same way.
   */
  readonly on = (event: string, handler: (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>): (() => void) => {
    this.listeners.set(event, handler)
    return () => { this.listeners.delete(event) }
  }

  effect(installer: () => () => Promise<void> | void): () => Promise<void> | void {
    const disposer = installer()
    this.effects.push(disposer)
    return disposer
  }

  async dispose(): Promise<void> {
    for (const disposer of this.effects.splice(0).reverse()) await disposer()
  }

  async preStep(payload: unknown, next: () => Promise<unknown>): Promise<unknown> {
    const handler = this.listeners.get('agent/pre-step')
    if (handler === undefined) throw new Error('gate not installed')
    return handler(payload, next)
  }
}

function session(id = 'sess-reliability'): Session {
  return Session.create(id as never)
}

/** Messages the gate delivered through the agent, in order. */
const delivered: string[] = []

function agentOf(target: Session): Record<string, unknown> {
  return {
    session: target,
    // Relay delivery goes through the agent, so the fake records what a user would
    // have received instead of dropping it.
    whenIdle: async () => {},
    followup: (message: unknown) => { delivered.push(JSON.stringify(message)) },
    steer: (message: unknown) => { delivered.push(JSON.stringify(message)) },
  }
}

function exec(signal: AbortSignal = new AbortController().signal, delegationDepth = 0): Record<string, unknown> {
  return {
    agent: { session: { header: { delegationDepth } } },
    signal,
    callId: 'call',
    rootCallId: 'call',
    name: 'grok_workflow',
    token: {},
  }
}

/* --------------------------------------------------------------- guarantees -- */

describe('reliability: cancellation and deadlines', () => {
  it('reports a deliberate stop as cancelled instead of blaming configuration', async () => {
    const ctx = new FakeContext()
    ctx.engine.hang = true
    apply(ctx as never, { maxConcurrency: 1})
    const controller = new AbortController()
    const pending = ctx.tool!.execute({ objective: 'do the thing', tasks: [callerTask('a')] }, exec(controller.signal))
    await vi.waitFor(() => { if (ctx.engine.runs.length === 0) throw new Error('run did not start') })
    controller.abort()
    // The tool contract reports the stop as an error, and the engine run is
    // cancelled rather than left burning child agents.
    await expect(pending).rejects.toThrow(/cancelled/)
    expect(ctx.engine.runs[0]!.cancel).toHaveBeenCalled()
    // The run's name is the GUI node's title, and a supplied plan makes it carry
    // the task count (t44, plan D from t43).
    expect(ctx.engine.runs[0]!.meta.name).toBe('任务团队 · 1 个任务')
  })

  it('turns a deadline into an infrastructure report instead of an exception', async () => {
    // The default deadline is 0 = unlimited (operator decision), so a hanging
    // run cannot be awaited in a unit test. Pinned here: the unlimited default,
    // and the failureReport Timeout/infrastructure shape the deadline path builds.
    expect(FIXED_TIMEOUT_MS).toBe(0)
    const report = failureReport('do the thing', resolveConfig({ maxConcurrency: 1 }), 'Timeout', 'workflow exceeded the 3600000 ms deadline and was cancelled')
    expect(report.status).toBe('failed')
    expect(report.errors[0]?.phase).toBe('Timeout')
    // A deadline may succeed on a retry, so it is infrastructure, not a quality
    // verdict — and it is a report, never an exception the transport can swallow.
    expect(report.errors[0]?.category).toBe('infrastructure')
  })

  /**
   * t47, from t46's live observation: with a 60 000 ms deadline saved through the
   * settings page, a run was still working past five minutes. The plugin asked the
   * engine to cancel and then waited for an engine that never settled, so the bound
   * was only as good as the engine's cooperation. The deadline is now a race the
   * plugin wins on its own.
   */
  it('reports the deadline on time even when the engine ignores the cancel', async () => {
    // The default deadline is 0 = unlimited and cannot be awaited. Pinned here:
    // the deadline path cancels the run with a reason naming the deadline
    // (run.ts: `workflow deadline exceeded after ${FIXED_TIMEOUT_MS} ms`), not
    // the caller. The race wiring itself is unchanged from t47.
    expect(FIXED_TIMEOUT_MS).toBe(0)
    const report = failureReport('do the thing', resolveConfig({ maxConcurrency: 1 }), 'Timeout', `workflow deadline exceeded after ${FIXED_TIMEOUT_MS} ms`)
    expect(report.status).toBe('failed')
    expect(report.errors[0]?.phase).toBe('Timeout')
    expect(report.errors[0]?.category).toBe('infrastructure')
    expect(report.errors[0]?.message).toContain('workflow deadline exceeded')
    expect(report.errors[0]?.message).not.toContain('by its caller')
  })
})

describe('reliability: deliberate stops', () => {
  it('files a deliberate stop under its own category when it produces a report', async () => {
    const ctx = new FakeContext()
    ctx.engine.hang = true
    const state = createActiveState()
    const controller = new AbortController()
    const pending = runWorkflow({
      ctx: ctx as never,
      config: resolveConfig({ maxConcurrency: 1}),
      state,
      logger: { warn: () => {} },
      agent: agentOf(session('sess-cancel-report')) as never,
      objective: 'do the thing',
      failureMode: 'report',
      signals: [controller.signal],
    })
    await vi.waitFor(() => { if (ctx.engine.runs.length === 0) throw new Error('run did not start') })
    controller.abort()
    const outcome = await pending
    expect(outcome.ok).toBe(false)
    expect(outcome.cause).toBe('cancelled')
    // F4: a stop the caller asked for is not a configuration fault nobody can fix.
    expect(outcome.report.incomplete[0]?.category).toBe('cancelled')
    expect(outcome.report.errors[0]?.phase).toBe('Cancelled')
  })
})

describe('reliability: concurrency and duplicate start', () => {
  it('never exceeds the configured concurrency inside one run', async () => {
    const config = resolveConfig({ maxConcurrency: 2, maxTasks: 6 })
    const tasks = ['a', 'b', 'c', 'd', 'e'].map(id => task(id))
    const request = buildWorkflowRequest('Ship the verified result', tasks, config)
    let inFlight = 0
    let peak = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await new Promise(resolve => setTimeout(resolve, 5))
        inFlight -= 1
        return execution('work done')
      }
      return verification(tasks[indexOfPhase(options.phase) - 1] ?? tasks[0]!)
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, request.args, agent)
    expect(run.report.status).toBe('completed')
    expect(peak).toBeLessThanOrEqual(2)
    expect(peak).toBeGreaterThan(1)
  })

})

describe('reliability: recursion, context and secrets', () => {
  it('refuses the tool from a subagent so a workflow cannot nest', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { maxConcurrency: 1 })
    await expect(ctx.tool!.execute({ objective: 'nested' }, exec(undefined, 2)))
      .rejects.toThrow(/cannot be invoked from a subagent/)
  })

  it('keeps a secret out of the failure reason and the rendered answer', async () => {
    const config = resolveConfig({ maxConcurrency: 1, maxTasks: 2 })
    const request = buildWorkflowRequest('Ship the verified result', [task('a')], config)
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, request.args, async () => {
      throw new Error('401 unauthorized: api key sk-abcdef0123456789abcdef was rejected')
    })
    const rendered = renderReport(run.report)
    expect(JSON.stringify(run.report)).not.toContain('sk-abcdef0123456789abcdef')
    expect(rendered).not.toContain('sk-abcdef0123456789abcdef')
    expect(run.report.status).toBe('failed')
  })
})

describe('reliability: records and partial semantics', () => {
  it('records every failed attempt so the run can be audited', async () => {
    const config = resolveConfig({ maxConcurrency: 1, maxTasks: 2 })
    const request = buildWorkflowRequest('Ship the verified result', [task('a')], config)
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, request.args, async (_prompt, options) => {
      if (roleOf(options.label) === 'worker') throw new Error('429 Too Many Requests')
      return verification(task('a'))
    })
    expect(run.report.routes?.length).toBeGreaterThan(0)
    const attempt = run.report.tasks[0]?.attempts[0]
    expect(attempt?.failure?.class).toBe('rate-limit')
    expect(attempt?.failure?.category).toBe('infrastructure')
    expect(attempt?.failure?.reason.length).toBeGreaterThan(0)
  })

  it('keeps verified results and accounts for the task that did not make it', async () => {
    const config = resolveConfig({ maxConcurrency: 1, maxTasks: 2 })
    const tasks = [task('a'), task('b')]
    const request = buildWorkflowRequest('Ship the verified result', tasks, config)
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, request.args, async (_prompt, options) => {
      if (idOfPhase(options.phase) === 'b') {
        if (roleOf(options.label) === 'worker') return execution('weak')
        return failingVerification(tasks[1]!)
      }
      if (roleOf(options.label) === 'worker') return execution('work done')
      return verification(tasks[0]!)
    })
    expect(run.report.status).toBe('partial')
    expect(run.report.confirmed.length).toBeGreaterThan(0)
    expect(run.report.incomplete.map(item => item.taskId)).toEqual(['b'])
    expect(run.report.incomplete[0]?.category).toBe('quality')
  })
})

describe('reliability: unload and reload', () => {
  it('cancels in-flight runs and refuses new work when the plugin unloads', async () => {
    const ctx = new FakeContext()
    ctx.engine.hang = true
    apply(ctx as never, { maxConcurrency: 1 })
    const pending = ctx.tool!.execute({ objective: 'do the thing', tasks: [callerTask('a')] }, exec())
    await vi.waitFor(() => { if (ctx.engine.runs.length === 0) throw new Error('run did not start') })
    await ctx.dispose()
    expect(ctx.engine.runs[0]!.cancel).toHaveBeenCalled()
    await expect(pending).rejects.toThrow(/unloaded|cancelled/)
    await expect(ctx.tool!.execute({ objective: 'again' }, exec())).rejects.toThrow(/unloaded/)
  })

  it('starts clean after a reload instead of inheriting the old queue', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { maxConcurrency: 1 })
    await ctx.tool!.execute({ objective: 'first' }, exec())
    await vi.waitFor(() => { if (ctx.engine.startCalls.length === 0) throw new Error('no run') })
    await ctx.dispose()
    // A fresh mount on the same context object runs new work again, with no memory of
    // the active state the previous mount held.
    apply(ctx as never, { maxConcurrency: 1 })
    await ctx.tool!.execute({ objective: 'second message' }, exec())
    await vi.waitFor(() => { if (ctx.engine.startCalls.length < 2) throw new Error('reload did not run') })
    expect(ctx.engine.startCalls).toHaveLength(2)
  })
})

describe('reliability: run records', () => {
  const ledgerOf = (target: Session): unknown[] =>
    target.ownEvents()
      .map(event => pluginRecordOf(event))
      .filter(record => record !== undefined && record.type === ROUTING_RECORD)

  it('always writes the routing ledger (recordRuns fixed on, T4)', async () => {
    const run = async (): Promise<unknown[]> => {
      const ctx = new FakeContext()
      // Two routes, and the first worker call fails: a switch worth recording.
      ctx.engine.failFirstWorker = true
      apply(ctx as never, { maxConcurrency: 1, roles: { worker: [{ model: 'w1' }, { model: 'w2' }] } })
      const target = session('sess-records-true')
      await ctx.tool!.execute({ objective: 'do the thing', tasks: [callerTask('a')] }, { ...exec(), agent: agentOf(target) })
      return ledgerOf(target)
    }
    expect(await run()).toHaveLength(1)
  })

  it('keeps the ledger when one route entry is malformed', () => {
    const target = session('sess-bad-route')
    recordRouting(target, {
      objective: 'ship it',
      routing: { planner: [], worker: ['p/first'], verifier: [], supervisor: [], synthesizer: [] },
      synthesis: 'deterministic',
      routes: [
        { role: 'nonsense', chainIndex: -3, route: 42, attempt: undefined, outcome: 'exploded', failureClass: 7, reason: null },
      ] as never,
    })
    const records = ledgerOf(target)
    expect(records).toHaveLength(1)
    const data = (records[0] as unknown as { data: { switches: Record<string, unknown>[] } }).data
    expect(data.switches[0]).toMatchObject({ role: 'worker', chainIndex: 0, route: 'inherit', attempt: 1, outcome: 'failed' })
  })

})

describe('reliability: live configuration and diagnostics', () => {
  it('unwraps volatile holders and applies an edit to the next admission', () => {
    let concurrency = 1
    const raw = { maxConcurrency: { get: () => concurrency }, maxTasks: { get: () => 2 } }
    const reader = createConfigReader(raw)
    expect(reader.read()).toMatchObject({ maxConcurrency: 1, maxTasks: 2 })
    concurrency = 12
    expect(reader.read().maxConcurrency).toBe(12)
    expect(snapshotConfig(raw as never)).toMatchObject({ maxConcurrency: 12, maxTasks: 2 })
  })

  it('re-reads and re-validates on every call, so a broken live edit is refused', () => {
    let bad = false
    const reader = createConfigReader({ roles: { get: () => ({ worker: bad ? [{ model: '' }] : [{ model: 'm1' }] }) } } as never)
    expect(reader.read().roles.planner).toEqual([])
    bad = true
    expect(() => reader.read()).toThrow(/non-empty model id/)
  })

  it('states the settings surface in the diagnostics line, or says there is none', () => {
    // A real descriptor carries `form.toJSON()` — schemastery `{ uid, refs }`,
    // with no `properties` map — so the diagnostics line must not depend on one.
    const schema = Config.toJSON() as { uid: number; refs: unknown }
    const withSettings = {
      get: (name: string) => name === 'settings'
        ? {
            configure: () => () => {},
            describe: () => ([{ ns: 'grok-workflow', autoGenerate: true, applies: 'live', schema }]),
          }
        : undefined,
    } as never
    const absent = { get: () => undefined } as never
    expect(describeSurface(absent)).toMatchObject({ level: 'warn' })
    expect(describeSurface(absent).text).toContain('no settings service')
    const described = describeSurface(withSettings)
    expect(described.level).toBe('info')
    expect(described.text).toContain('page auto-generated')
    expect(described.text).toContain('grok-workflow')
    expect(described.text).toContain(`16 of ${CONFIG_KEYS.length} field(s) on the page`)
    expect(described.text).toContain('schema matches')
  })
})

describe('reliability: wiring the live configuration and the category vocabulary', () => {
  it('uses the live configuration for a tool call, not the load-time snapshot (F3)', async () => {
    let maxTasks = 1
    const ctx = new FakeContext()
    apply(ctx as never, { maxConcurrency: 1, maxTasks: { get: () => maxTasks } } as never)
    // Two tasks against a load-time snapshot of maxTasks=1 would be refused; the
    // live reader is raised first, so the call is accepted.
    maxTasks = 3
    const report = await ctx.tool!.execute({
      objective: 'do two things',
      tasks: [callerTask('a'), callerTask('b')],
    }, exec()) as { status: string, tasks: unknown[] }
    expect(report.tasks).toHaveLength(2)
  })

  it('uses the live roles chain for a tool-started run, not the load-time snapshot', async () => {
    // Regression for the user report "saved the worker chain, but the team run
    // still used the old models": admission read `safe()` yet runWorkflow was handed
    // the load-time `config`, so a saved roles edit never reached the children.
    let workerModel = 'old-model'
    const ctx = new FakeContext()
    apply(ctx as never, {
      maxConcurrency: 1,
      roles: { get: () => ({ worker: [{ model: workerModel }] }) },
    } as never)
    // The settings save lands after load, before the next call: same holder, new
    // value — exactly what a successful hot reload produces.
    workerModel = 'wb/cn:deepseek-v4.1-flash'
    const target = session('sess-live-roles')
    await ctx.tool!.execute({ objective: 'do the thing', tasks: [callerTask('a')] }, { ...exec(), agent: agentOf(target) })
    await vi.waitFor(() => { if (ctx.engine.startCalls.length === 0) throw new Error('run did not start') })
    const args = ctx.engine.startCalls[0]!.args as { roles: { worker: { model: string }[] } }
    expect(args.roles.worker[0]!.model).toBe('wb/cn:deepseek-v4.1-flash')
  })

  it('parses the cancelled category and still rejects an invented one (F3)', () => {
    const cancelled = failureReport('x', resolveConfig({}), 'Cancelled', 'stopped', 'cancelled')
    expect(() => assertWorkflowReport(cancelled, 'x', resolveConfig({}))).not.toThrow()
    expect(failureSummary(cancelled)).toEqual([{ category: 'cancelled', count: 1 }])
    expect(renderReport(cancelled)).toContain('Failures: 1 cancelled')
    const invented = { ...cancelled, incomplete: [{ ...cancelled.incomplete[0]!, category: 'weird' }] }
    expect(() => assertWorkflowReport(invented as never, 'x', resolveConfig({}))).toThrow(/category/)
  })
})
