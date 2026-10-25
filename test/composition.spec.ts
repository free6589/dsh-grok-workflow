/**
 * Layer 5 — composed `agent/pre-step` behaviour.
 *
 * The unit tests in `gate.spec.ts` drive this plugin's listener alone. A real
 * DSH profile dispatches `agent/pre-step` as a cordis waterfall through every
 * in-tree listener, so this spec mounts the reproductions in
 * `composition-listeners.ts` on a **real cordis `Context`** together with this
 * plugin's real `apply()`, then dispatches through the real waterfall:
 *
 * - the ordering, `prepend` placement and "a listener that does not call `next()`
 *   vetoes the chain" semantics are cordis's own, not a test double;
 * - the gate is the plugin's real listener, registered by the real `apply()`.
 *
 * What it proves: no in-tree listener can turn a rejected user batch into a
 * model request, and the only ways this gate is starved are the two known
 * windows (archived sessions, and a goal round rejected by another listener).
 */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { apply } from '../src/index.js'
import { inTreeListeners, message } from './composition-listeners.js'
import type { ComposedAgent, ComposedDecision, ComposedEffects, ComposedListener, ComposedPayload } from './composition-listeners.js'

/* ------------------------------------------------------------------ engine -- */

class ComposedRun {
  readonly id = 'run-composed'
  readonly meta: WorkflowStartRequest['meta']
  readonly result: Promise<{ value: unknown; stopReason: string; agentsStarted: number }>
  readonly dispose = vi.fn(async () => {})
  readonly cancel = vi.fn((_reason?: string) => {})

  constructor(request: WorkflowStartRequest) {
    this.meta = request.meta
    // A cancelled run exercises the delivery path without a real engine: the
    // gate must still answer and record, and no model call happens either way.
    this.result = Promise.resolve({ value: null, stopReason: 'cancelled', agentsStarted: 0 })
  }
}

class ComposedEngine {
  readonly startCalls: WorkflowStartRequest[] = []

  async start(request: WorkflowStartRequest): Promise<ComposedRun> {
    this.startCalls.push(request)
    return new ComposedRun(request)
  }
}

/* ----------------------------------------------------------------- context -- */

interface ComposedHarness {
  ctx: Context
  engine: ComposedEngine
  effects: ComposedEffects
  warnings: string[]
  followups: UserMessage[]
  dispatch: (payload: ComposedPayload) => Promise<ComposedDecision>
  innerCalls: () => number
  /** Resolves once the gate has asked the engine to start, or throws on timeout. */
  waitForStart: () => Promise<void>
}

interface HarnessOptions {
  /** `first` = registered before the in-tree listeners (outermost). */
  gatePlacement?: 'first' | 'last'
  archived?: string[]
  sessions?: Map<string, ComposedAgent['session']>
  planModeActive?: boolean
  withInTree?: boolean
  /** Which of two competing vetoing listeners is outermost, for W2. */
  listenerOrder?: 'goal-driver-outer' | 'archived-outer'
}

function harness(options: HarnessOptions = {}): ComposedHarness {
  const ctx = new Context()
  const engine = new ComposedEngine()
  const effects: ComposedEffects = { observed: [], appended: [], effects: [] }
  const warnings: string[] = []
  const followups: UserMessage[] = []
  let inner = 0
  let lastMessages: UserMessage[] = []

  const register = (listener: ComposedListener): void => {
    ctx.on(
      'agent/pre-step',
      listener.handler as never,
      listener.prepend === true ? { prepend: true } : undefined,
    )
  }

  const installGate = (): void => {
    const shim = {
      on: (event: string, handler: unknown) => ctx.on(event as never, handler as never),
      effect: (installer: () => () => void) => {
        const disposer = installer()
        return disposer
      },
      logger: () => ({ warn: (text: string) => { warnings.push(text) }, info: () => {}, debug: () => {} }),
      tools: { register: () => () => {} },
      systemPrompt: { section: () => () => {}, getSectionOrder: () => 2600 },
      workflowEngine: engine,
    }
    apply(shim as never, { historyTurns: 4, historyChars: 4_000 })
  }

  if (options.gatePlacement === 'first') installGate()
  if (options.withInTree !== false) {
    for (const listener of inTreeListeners(effects, {
      ...options.archived === undefined ? {} : { archived: options.archived },
      ...options.sessions === undefined ? {} : { sessions: options.sessions },
      ...options.planModeActive === undefined ? {} : { planModeActive: options.planModeActive },
      ...options.listenerOrder === undefined ? {} : { listenerOrder: options.listenerOrder },
    })) register(listener)
  }
  if (options.gatePlacement !== 'first') installGate()

  return {
    ctx,
    engine,
    effects,
    warnings,
    followups,
    innerCalls: () => inner,
    dispatch: async (payload: ComposedPayload) => {
      lastMessages = payload.messages
      return await ctx.waterfall(
        'agent/pre-step',
        payload as never,
        async () => {
          inner += 1
          return { kind: 'enter', messages: lastMessages } as ComposedDecision
        },
      ) as ComposedDecision
    },
    waitForStart: async () => {
      await vi.waitFor(() => {
        if (engine.startCalls.length === 0) throw new Error('the gate did not start a run')
      }, { timeout: 2_000, interval: 5 })
    },
  }
}

/* -------------------------------------------------------------------- agent -- */

/** Minimal session surface the gate reads: header, id, history, records. */
class ComposedSession {
  readonly id: string
  readonly header: ComposedAgent['session']['header']
  readonly appended: { type: string; data: unknown }[] = []

  constructor(id: string, header: ComposedAgent['session']['header']) {
    this.id = id
    this.header = header
  }

  ownEvents(): { type: string; data: unknown }[] { return this.appended }
  deriveMessages(): unknown[] { return [] }
  append(type: string, data: unknown): number {
    this.appended.push({ type, data })
    return this.appended.length
  }
}

class ComposedAgentStub {
  readonly id: string
  readonly session: ComposedSession
  readonly options = { provider: 'p', model: 'm' }
  readonly followups: UserMessage[] = []
  readonly followupError: Error | undefined
  readonly whenIdle = vi.fn(async () => {})
  readonly followup = vi.fn((message: UserMessage) => {
    if (this.followupError !== undefined) throw this.followupError
    this.followups.push(message)
  })

  constructor(id: string, header: ComposedAgent['session']['header']) {
    this.id = id
    this.session = new ComposedSession(header.id, header)
  }
}

function userAgent(overrides: Partial<{ id: string; origin: string; delegationDepth: number; id_header: string }> = {}): ComposedAgentStub {
  const agentId = overrides.id ?? 'session-composed'
  return new ComposedAgentStub(agentId, {
    id: overrides.id_header ?? agentId,
    ...overrides.origin === undefined ? {} : { origin: overrides.origin },
  })
}

function payload(agent: ComposedAgentStub, messages: UserMessage[], turn = 1, step = 1): ComposedPayload {
  return { agent: agent as unknown as ComposedAgent, messages, turn, step, signal: new AbortController().signal }
}

/* -------------------------------------------------------------------- tests -- */

describe('composed pre-step waterfall', () => {
  it('composes at least eight in-tree listeners besides the gate', () => {
    const listeners = inTreeListeners({ observed: [], appended: [], effects: [] })
    const packages = new Set(listeners.map(listener => listener.package))
    expect(listeners.length).toBeGreaterThanOrEqual(8)
    expect(packages.size).toBeGreaterThanOrEqual(7)
    expect([...packages]).toEqual(expect.arrayContaining([
      'dsh-api-session-controller',
      'dsh-goal-round-driver',
      'dsh-plan-mode',
      'dsh-compaction-basic',
      'dsh-agent-instructions',
      'dsh-session-reference',
      'dsh-tool-skill',
      'dsh-time-context',
      'dsh-tmux-context',
    ]))
  })

  it('rejects a user batch inside the full composition and issues no request', async () => {
    const composed = harness()
    const agent = userAgent()
    const decision = await composed.dispatch(payload(agent, [message('please refactor the parser', 'user')]))
    expect(decision).toEqual({ kind: 'reject' })
    // The built-in behaviour is the only place a model request can originate.
    expect(composed.innerCalls()).toBe(0)
    await composed.waitForStart()
    expect(composed.engine.startCalls).toHaveLength(1)
    // No post-processing listener resurrected the batch as context.
    expect(composed.effects.observed.every(entry => entry.kind === 'reject')).toBe(true)
    expect(composed.effects.appended).toEqual([])
  })

  it('stays rejected when the gate is registered first (outermost) instead of last', async () => {
    const composed = harness({ gatePlacement: 'first' })
    const agent = userAgent()
    const decision = await composed.dispatch(payload(agent, [message('please refactor the parser', 'user')]))
    expect(decision).toEqual({ kind: 'reject' })
    expect(composed.innerCalls()).toBe(0)
    await composed.waitForStart()
    // Outermost: the in-tree listeners never ran, so their side effects are absent.
    expect(composed.effects.effects.some(entry => entry.package === 'dsh-compaction-basic')).toBe(false)
  })

  it('is starved by the archived-session gate, which rejects without calling next', async () => {
    const archivedId = 'session-archived'
    const composed = harness({ archived: [archivedId] })
    const agent = userAgent({ id: archivedId })
    const decision = await composed.dispatch(payload(agent, [message('please refactor the parser', 'user')]))
    expect(decision).toEqual({ kind: 'reject' })
    expect(composed.innerCalls()).toBe(0)
    // Documented window W1: the archived gate runs before this plugin and vetoes,
    // so no workflow starts and no notice is delivered.
    expect(composed.engine.startCalls).toEqual([])
    expect(composed.effects.effects.some(entry => entry.effect === 'reject-archived')).toBe(true)
  })

  it('passes a goal round through, so the goal driver completes its round', async () => {
    const composed = harness()
    const agent = userAgent()
    const decision = await composed.dispatch(payload(agent, [message('goal round 1 instruction', 'goal', { round: 1, goalId: 'g', revision: 1 })]))
    expect(decision.kind).toBe('enter')
    expect(decision).toMatchObject({ startsRequestSeries: true })
    expect(composed.innerCalls()).toBe(1)
    expect(composed.engine.startCalls).toEqual([])
    expect(composed.effects.effects.some(entry => entry.effect === 'goal-blocked')).toBe(false)
  })

  it('never rejects a goal round itself, so the goal driver keeps its round', async () => {
    // The gate's admission predicate matches `source.kind === 'user'` only, and a
    // goal round is `{kind:'goal', round>0}`. This is the load-bearing fact behind
    // window W2: a goal round reaches the driver intact.
    const composed = harness({ gatePlacement: 'first' })
    const decision = await composed.dispatch(payload(userAgent(), [message('goal round 1 instruction', 'goal', { round: 1, goalId: 'g', revision: 1 })]))
    expect(decision.kind).toBe('enter')
    expect(composed.effects.effects.some(entry => entry.effect === 'goal-blocked')).toBe(false)
    expect(composed.engine.startCalls).toEqual([])
  })

  it('shows that the goal-blocking branch depends on which listener rejects first', async () => {
    // Ordering decides whether a rejected goal round is turned into
    // `goals.block('prompt-rejected')` (goal driver above the vetoing listener)
    // or silently swallowed before the driver ever runs (driver below it).
    const archivedId = 'session-archived'
    const outerDriver = harness({ archived: [archivedId], listenerOrder: 'goal-driver-outer' })
    const driverFirst = await outerDriver.dispatch(payload(userAgent({ id: archivedId }), [message('goal round 1', 'goal', { round: 1, goalId: 'g', revision: 1 })]))
    expect(driverFirst).toEqual({ kind: 'reject' })
    expect(outerDriver.effects.effects.some(entry => entry.effect === 'goal-blocked')).toBe(true)

    const outerArchived = harness({ archived: [archivedId], listenerOrder: 'archived-outer' })
    const archivedFirst = await outerArchived.dispatch(payload(userAgent({ id: archivedId }), [message('goal round 1', 'goal', { round: 1, goalId: 'g', revision: 1 })]))
    expect(archivedFirst).toEqual({ kind: 'reject' })
    expect(outerArchived.effects.effects.some(entry => entry.effect === 'goal-blocked')).toBe(false)
    // Neither order starts a workflow: this plugin is starved in both.
    expect(outerDriver.engine.startCalls).toEqual([])
    expect(outerArchived.engine.startCalls).toEqual([])
  })

  it('passes this plugin relay message, context-only batches and subagent steps through', async () => {
    const composed = harness()
    const relay = await composed.dispatch(payload(userAgent(), [message('workflow report', 'grok-workflow')]))
    expect(relay.kind).toBe('enter')
    const context = await composed.dispatch(payload(userAgent(), [message('runtime context', 'runtime-context')]))
    expect(context.kind).toBe('enter')
    const subagent = await composed.dispatch(payload(userAgent({ origin: 'subagent' }), [message('child task', 'user')]))
    expect(subagent.kind).toBe('enter')
    expect(composed.engine.startCalls).toEqual([])
  })

  it('keeps every appended message out of a rejected decision in both placements', async () => {
    for (const gatePlacement of ['first', 'last'] as const) {
      const composed = harness({ gatePlacement })
      const decision = await composed.dispatch(payload(userAgent(), [message('do the thing', 'user')]))
      expect(decision).toEqual({ kind: 'reject' })
      expect(composed.effects.appended).toEqual([])
      expect(composed.effects.observed.every(entry => entry.kind === 'reject')).toBe(true)
    }
  })
})
