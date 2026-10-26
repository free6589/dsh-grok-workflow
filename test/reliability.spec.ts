import { describe, expect, it, vi } from 'vitest'
import { Session, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import { apply } from '../src/index.js'
import { Config, CONFIG_KEYS, createConfigReader, resolveConfig, snapshotConfig } from '../src/config.js'
import { DELIVERY_RECORD, ROUTING_RECORD, recordRouting } from '../src/records.js'
import { describeSurface } from '../src/settings.js'
import { collectHistory, composeObjective, renderHistory } from '../src/history.js'
import { assertWorkflowReport, failureReport, failureSummary, renderReport } from '../src/report.js'
import { buildWorkflowRequest, WORKFLOW_SCRIPT } from '../src/script.js'
import { createActiveState, runWorkflow } from '../src/run.js'
import { runWorkflowScript, type ScriptAgent } from './helpers.js'
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

  async start(request: WorkflowStartRequest): Promise<FakeRun> {
    this.startCalls.push(request)
    const run = new FakeRun(request)
    this.runs.push(run)
    if (!this.hang) {
      let workerCalls = 0
      const result = await runWorkflowScript(request.script, request.args as Record<string, unknown>, async (_prompt, options) => {
        if (options.label.startsWith('grok-worker-')) {
          workerCalls += 1
          if (this.failFirstWorker && workerCalls === 1) throw new Error('429 Too Many Requests')
          return execution('work done')
        }
        if (options.label.startsWith('grok-verifier-')) return verification((request.args as { tasks: ReturnType<typeof task>[] }).tasks[0]!)
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
  tool: ExecutableTool | undefined
  readonly engine = new FakeEngine()

  readonly tools = {
    register: (tool: ExecutableTool) => { this.tool = tool; return () => { this.tool = undefined } },
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

  on(event: string, handler: (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>): () => void {
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

function userMessage(text: string): ReturnType<typeof createUserMessage> {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } as never })
}

function stepPayload(agent: Record<string, unknown>, messages: unknown[], signal = new AbortController().signal): Record<string, unknown> {
  return { agent, messages, turn: 1, step: 1, signal }
}

function passThrough(messages: unknown[]): () => Promise<unknown> {
  return async () => ({ kind: 'enter', messages })
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
    apply(ctx as never, { maxConcurrency: 1, timeoutMs: 60_000 })
    const controller = new AbortController()
    const pending = ctx.tool!.execute({ objective: 'do the thing', tasks: [callerTask('a')] }, exec(controller.signal))
    await vi.waitFor(() => { if (ctx.engine.runs.length === 0) throw new Error('run did not start') })
    controller.abort()
    // The tool contract reports the stop as an error, and the engine run is
    // cancelled rather than left burning child agents.
    await expect(pending).rejects.toThrow(/cancelled/)
    expect(ctx.engine.runs[0]!.cancel).toHaveBeenCalled()
    expect(ctx.engine.runs[0]!.meta.name).toBe('grok-workflow')
  })

  it('turns a deadline into an infrastructure report instead of an exception', async () => {
    const ctx = new FakeContext()
    ctx.engine.hang = true
    apply(ctx as never, { maxConcurrency: 1, timeoutMs: 1_000 })
    const started = Date.now()
    const report = await ctx.tool!.execute({ objective: 'do the thing', tasks: [callerTask('a')] }, exec()) as {
      status: string
      errors: { phase: string; category: string }[]
    }
    expect(Date.now() - started).toBeGreaterThanOrEqual(900)
    expect(report.status).toBe('failed')
    expect(report.errors[0]?.phase).toBe('Timeout')
    // A deadline may succeed on a retry, so it is infrastructure, not a quality
    // verdict — and it is a report, never an exception the transport can swallow.
    expect(report.errors[0]?.category).toBe('infrastructure')
    expect(ctx.engine.runs[0]!.cancel).toHaveBeenCalled()
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
      config: resolveConfig({ maxConcurrency: 1, timeoutMs: 60_000 }),
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
    const config = resolveConfig({ maxConcurrency: 2, maxRetries: 0, maxTasks: 6 })
    const tasks = ['a', 'b', 'c', 'd', 'e'].map(id => task(id))
    const request = buildWorkflowRequest('Ship the verified result', tasks, config)
    let inFlight = 0
    let peak = 0
    const agent: ScriptAgent = async (_prompt, options) => {
      if (options.label.startsWith('grok-worker-')) {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await new Promise(resolve => setTimeout(resolve, 5))
        inFlight -= 1
        return execution('work done')
      }
      return verification(tasks.find(item => options.label.includes(`-${item.id}-`)) ?? tasks[0]!)
    }
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, request.args, agent)
    expect(run.report.status).toBe('completed')
    expect(peak).toBeLessThanOrEqual(2)
    expect(peak).toBeGreaterThan(1)
  })

  it('starts one workflow per user message even when pre-step fires again', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { maxConcurrency: 1 })
    const target = session('sess-duplicate')
    const messages = [userMessage('do the thing')]
    await ctx.preStep(stepPayload(agentOf(target), messages), passThrough(messages as never))
    await vi.waitFor(() => { if (ctx.engine.startCalls.length === 0) throw new Error('no run') })
    await vi.waitFor(() => {
      const routed = target.ownEvents().some(event => JSON.stringify(event).includes('delivered'))
      if (!routed) throw new Error('delivery not recorded yet')
    })
    // Same batch again: the durable delivery record answers instead of a second run.
    await ctx.preStep(stepPayload(agentOf(target), messages), passThrough(messages as never))
    expect(ctx.engine.startCalls).toHaveLength(1)
  })
})

describe('reliability: recursion, context and secrets', () => {
  it('refuses the tool from a subagent so a workflow cannot nest', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { maxConcurrency: 1 })
    await expect(ctx.tool!.execute({ objective: 'nested' }, exec(undefined, 2)))
      .rejects.toThrow(/cannot be invoked from a subagent/)
  })

  it('bounds forwarded context by turns, characters and the objective limit', () => {
    const messages = Array.from({ length: 30 }, (_unused, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: [{ type: 'text' as const, text: `line ${index} ${'x'.repeat(400)}` }],
    }))
    const bounded = renderHistory(messages as never, { turns: 2, chars: 500 })
    expect(bounded.length).toBeLessThanOrEqual(500)
    // One message is truncated to the per-message cap, never the whole block dropped.
    const long = renderHistory([{ role: 'user', content: [{ type: 'text', text: 'y'.repeat(5_000) }] }] as never, { turns: 1, chars: 8_000 })
    expect(long.length).toBeLessThan(5_000)
    expect(long.endsWith('…')).toBe(true)
    const objective = composeObjective(bounded, 'now do this', 4_000)
    expect(objective).toBeDefined()
    expect((objective ?? '').length).toBeLessThanOrEqual(4_000)
    expect(composeObjective(bounded, 'z'.repeat(5_000), 4_000)).toBeUndefined()
    expect(collectHistory(undefined, { turns: 2, chars: 500 })).toBe('')
  })

  it('keeps a secret out of the failure reason and the rendered answer', async () => {
    const config = resolveConfig({ maxConcurrency: 1, maxRetries: 0, maxTasks: 2 })
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
    const config = resolveConfig({ maxConcurrency: 1, maxRetries: 0, maxTasks: 2 })
    const request = buildWorkflowRequest('Ship the verified result', [task('a')], config)
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, request.args, async (_prompt, options) => {
      if (options.label.startsWith('grok-worker-')) throw new Error('429 Too Many Requests')
      return verification(task('a'))
    })
    expect(run.report.routes?.length).toBeGreaterThan(0)
    const attempt = run.report.tasks[0]?.attempts[0]
    expect(attempt?.failure?.class).toBe('rate-limit')
    expect(attempt?.failure?.category).toBe('infrastructure')
    expect(attempt?.failure?.reason.length).toBeGreaterThan(0)
  })

  it('keeps verified results and accounts for the task that did not make it', async () => {
    const config = resolveConfig({ maxConcurrency: 1, maxRetries: 0, maxTasks: 2 })
    const tasks = [task('a'), task('b')]
    const request = buildWorkflowRequest('Ship the verified result', tasks, config)
    const run = await runWorkflowScript(WORKFLOW_SCRIPT, request.args, async (_prompt, options) => {
      if (options.label.includes('-b-')) {
        if (options.label.startsWith('grok-worker-')) return execution('weak')
        return failingVerification(tasks[1]!)
      }
      if (options.label.startsWith('grok-worker-')) return execution('work done')
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
    const target = session('sess-reload')
    await ctx.preStep(stepPayload(agentOf(target), [userMessage('first')]), passThrough([]))
    await vi.waitFor(() => { if (ctx.engine.startCalls.length === 0) throw new Error('no run') })
    await ctx.dispose()
    // A fresh mount on the same context object admits a new message again.
    apply(ctx as never, { maxConcurrency: 1 })
    await ctx.preStep(stepPayload(agentOf(target), [userMessage('second message')]), passThrough([]))
    await vi.waitFor(() => { if (ctx.engine.startCalls.length < 2) throw new Error('reload did not admit') })
    expect(ctx.engine.startCalls).toHaveLength(2)
  })
})

describe('reliability: run records', () => {
  const ledgerOf = (target: Session): unknown[] =>
    target.ownEvents()
      .map(event => pluginRecordOf(event))
      .filter(record => record !== undefined && record.type === ROUTING_RECORD)

  it('writes the routing ledger only when recordRuns allows it', async () => {
    const run = async (recordRuns: boolean): Promise<unknown[]> => {
      const ctx = new FakeContext()
      // Two routes, and the first worker call fails: a switch worth recording.
      ctx.engine.failFirstWorker = true
      apply(ctx as never, { maxConcurrency: 1, maxRetries: 0, recordRuns, roles: { worker: [{ model: 'w1' }, { model: 'w2' }] } })
      const target = session(`sess-records-${String(recordRuns)}`)
      await ctx.tool!.execute({ objective: 'do the thing', tasks: [callerTask('a')] }, { ...exec(), agent: agentOf(target) })
      return ledgerOf(target)
    }
    expect(await run(true)).toHaveLength(1)
    expect(await run(false)).toHaveLength(0)
  })

  it('keeps the ledger when one route entry is malformed', () => {
    const target = session('sess-bad-route')
    recordRouting(target, {
      objective: 'ship it',
      routing: { planner: [], worker: ['p/first'], verifier: [], synthesizer: [] },
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

  it('records the delivery outcome so a restart cannot re-route the message', async () => {
    const ctx = new FakeContext()
    apply(ctx as never, { maxConcurrency: 1 })
    const target = session('sess-delivery')
    await ctx.preStep(stepPayload(agentOf(target), [userMessage('do the thing')]), passThrough([]))
    await vi.waitFor(() => { if (ctx.engine.startCalls.length === 0) throw new Error('no run') })
    await vi.waitFor(() => {
      const types = target.ownEvents().map(event => pluginRecordOf(event)).filter(record => record !== undefined).map(record => record.type)
      if (!types.includes(DELIVERY_RECORD)) throw new Error('delivery record missing')
    })
    const outcomes = target.ownEvents()
      .map(event => pluginRecordOf(event))
      .filter(record => record !== undefined && record.type === DELIVERY_RECORD)
      .map(record => (record!.data as { phase: string; outcome: string }))
    expect(outcomes.some(entry => entry.phase === 'delivered' || entry.phase === 'started')).toBe(true)
  })
})

describe('reliability: live configuration and diagnostics', () => {
  it('unwraps volatile holders and applies an edit to the next admission', () => {
    let queued = 1
    const raw = { maxQueuedMessages: { get: () => queued }, maxTasks: { get: () => 2 } }
    const reader = createConfigReader(raw)
    expect(reader.read()).toMatchObject({ maxQueuedMessages: 1, maxTasks: 2 })
    queued = 0
    expect(reader.read().maxQueuedMessages).toBe(0)
    expect(snapshotConfig(raw as never)).toMatchObject({ maxQueuedMessages: 0, maxTasks: 2 })
  })

  it('keeps the last good snapshot when a live edit breaks validation', () => {
    let bad = false
    const reader = createConfigReader({ roles: { get: () => ({ worker: bad ? [{ model: '' }] : [{ model: 'm1' }] }) } } as never)
    expect(reader.read().roles.planner).toEqual([])
    bad = true
    expect(() => reader.read()).toThrow(/non-empty model id/)
    // Delivery work that already started keeps a usable snapshot.
    expect(reader.lastGood().roles.worker).toEqual([{ model: 'm1' }])
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
    expect(described.text).toContain(`${CONFIG_KEYS.length} field(s)`)
    expect(described.text).toContain('schema matches')
  })
})

describe('reliability: wiring the live configuration and the category vocabulary', () => {
  it('applies a live gate scope edit to the next claimed message (F3)', async () => {
    // The gate reads its scope live: a session outside the named preset passes
    // while `gateScope` is preset-scoped, and is admitted once the edit widens it.
    let scope: 'process' | 'preset' = 'preset'
    const ctx = new FakeContext()
    // A volatile field reaches the plugin as a live holder; reading it on every
    // decision is what makes an edit apply to the next message.
    apply(ctx as never, {
      maxConcurrency: 1,
      gateScope: { get: () => scope },
      gatePreset: 'workflow-only',
    } as never)
    const target = session('sess-scope')
    const payload = stepPayload(agentOf(target), [userMessage('scope check')])
    await ctx.preStep(payload, passThrough([]))
    expect(ctx.engine.startCalls).toHaveLength(0)
    scope = 'process'
    await ctx.preStep(stepPayload(agentOf(target), [userMessage('scope check again')]), passThrough([]))
    expect(ctx.engine.startCalls).toHaveLength(1)
  })

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

  it('falls back to the last good snapshot, not the load-time config (F1)', async () => {
    // Sequence that kills the M3 mutation: a valid edit takes effect, then an
    // invalid edit arrives. Delivery must keep the last *valid* value, because
    // falling back to load-time values would silently undo a live edit.
    let queued = 1
    let broken = false
    const ctx = new FakeContext()
    ctx.engine.hang = true
    apply(ctx as never, {
      // `relay` queueing is where the live bound is read, and it returns before the
      // run settles, so the refusal can be observed while the first run hangs.
      answerStrategy: 'relay',
      maxConcurrency: 1,
      maxQueuedMessages: { get: () => queued },
      roles: { get: () => broken ? { worker: [{ model: '' }] } : {} },
    } as never)
    const target = session('sess-lastgood')
    void ctx.preStep(stepPayload(agentOf(target), [userMessage('first message')]), passThrough([]))
    await vi.waitFor(() => { if (ctx.engine.startCalls.length === 0) throw new Error('run did not start') })
    // A valid edit takes effect: the live bound is 0 and the read makes it the last
    // good snapshot.
    queued = 0
    delivered.length = 0
    await ctx.preStep(
      stepPayload(agentOf(target), [userMessage('second message')]),
      async () => ({ kind: 'enter' }),
    )
    expect(delivered.join('\n')).toContain('already has 0 queued message(s)')
    // Now the edit is broken. Delivery must keep the *last good* bound (0); falling
    // back to the load-time snapshot (1) would silently undo the live edit.
    broken = true
    delivered.length = 0
    await ctx.preStep(
      stepPayload(agentOf(target), [userMessage('third message')]),
      async () => ({ kind: 'enter' }),
    )
    expect(delivered.join('\n')).toContain('already has 0 queued message(s)')
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
