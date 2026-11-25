/**
 * Layer 5 — composed `agent/pre-step` behaviour.
 *
 * A real DSH profile dispatches `agent/pre-step` as a cordis waterfall through every
 * in-tree listener, so this spec mounts the reproductions in
 * `composition-listeners.ts` on a **real cordis `Context`** together with this
 * plugin's real `apply()`, then dispatches through the real waterfall:
 *
 * - the ordering, `prepend` placement and "a listener that does not call `next()`
 *   vetoes the chain" semantics are cordis's own, not a test double;
 * - the plugin's listeners are registered by the real `apply()`, so what the chain
 *   composes is the shipped registration, not a hand-installed stub. Since M3.3 that
 *   is the narrow heartbeat listener plus the intake's observer — two listeners that
 *   record a beat and decide nothing about a user batch.
 *
 * What it proves: the plugin's presence changes nothing about a user batch (the same
 * decision with and without it, in either placement), no run starts from a message,
 * and the two windows that starve it are unchanged (archived sessions, and a goal
 * round rejected by another listener).
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
}

interface HarnessOptions {
  /** `first` = registered before the in-tree listeners (outermost). */
  pluginPlacement?: 'first' | 'last'
  /** `false` mounts the in-tree composition alone, with no plugin. */
  withPlugin?: boolean
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

  const installPlugin = (): void => {
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
    // The real entry point: it registers the narrow heartbeat listener and, with
    // the intake on by default, the intake's own observer. Neither decides a user
    // batch, which is what the cases below measure.
    apply(shim as never, { grokDefault: 'on' })
  }

  if (options.withPlugin !== false && options.pluginPlacement === 'first') installPlugin()
  if (options.withInTree !== false) {
    for (const listener of inTreeListeners(effects, {
      ...options.archived === undefined ? {} : { archived: options.archived },
      ...options.sessions === undefined ? {} : { sessions: options.sessions },
      ...options.planModeActive === undefined ? {} : { planModeActive: options.planModeActive },
      ...options.listenerOrder === undefined ? {} : { listenerOrder: options.listenerOrder },
    })) register(listener)
  }
  if (options.withPlugin !== false && options.pluginPlacement !== 'first') installPlugin()

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
  // T4: in-turn is the only delivery. This stub exposes no whenIdle/followup,
  // so canBackgroundDeliver is false and the gate takes the blocking in-turn
  // path: the answer arrives as the entered step's message. The ComposedRun
  // already settles cancelled, so the gate answers in-turn without a model call.
  readonly id: string
  readonly session: ComposedSession
  readonly options = { provider: 'p', model: 'm' }

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

/**
 * How many `agent/pre-step` listeners this context holds (cordis's own hook list).
 * @param ctx - the mounted context.
 * @returns the number of registered listeners.
 */
function listenerCount(ctx: Context): number {
  const events = (ctx as unknown as { events: { _hooks: Record<string, unknown[]> } }).events
  return (events._hooks['agent/pre-step'] ?? []).length
}

/**
 * The decision as bytes with the host's own ids collapsed.
 *
 * The in-tree reproductions append their own context messages, each with a freshly
 * minted id, so two runs of the same composition differ only in identity. Folding
 * `id` is what lets "the plugin changed nothing" be compared across two harnesses.
 * @param decision - one waterfall decision.
 * @returns the decision as a stable string.
 */
function stable(decision: unknown): string {
  return JSON.stringify(decision, (key, value) => key === 'id' ? '<id>' : value)
}

describe('composed pre-step waterfall', () => {
  it('composes at least eight in-tree listeners besides the plugin\'s two', () => {
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
    // The plugin's own two: the narrow heartbeat listener and the intake observer.
    // Counted on a real context, so "the chain carries them" is the shipped wiring.
    expect(listenerCount(harness().ctx)).toBe(listeners.length + 2)
    expect(listenerCount(harness({ withPlugin: false }).ctx)).toBe(listeners.length)
  })

  it('changes nothing about a user batch, in either placement', async () => {
    // The M3.3 claim, at the composition level: take the plugin out of the chain and
    // the decision is the same one. A user batch is not admitted, not refused, not
    // annotated — and no run starts from it.
    const messages = [message('please refactor the parser', 'user')]
    const without = harness({ withPlugin: false })
    const expected = stable(await without.dispatch(payload(userAgent(), messages)))
    expect(without.engine.startCalls).toEqual([])

    for (const pluginPlacement of ['first', 'last'] as const) {
      const composed = harness({ pluginPlacement })
      const decision = await composed.dispatch(payload(userAgent(), messages))
      expect(stable(decision), `${pluginPlacement}: the decision changed`).toBe(expected)
      expect(composed.innerCalls(), `${pluginPlacement}: the terminal runs once`).toBe(1)
      expect(composed.effects.observed.every(entry => entry.kind === 'enter')).toBe(true)
      expect(composed.engine.startCalls, `${pluginPlacement}: no run may start`).toEqual([])
    }
  })

  it('is starved by the archived-session gate, which rejects without calling next', async () => {
    const archivedId = 'session-archived'
    const composed = harness({ archived: [archivedId] })
    const agent = userAgent({ id: archivedId })
    const decision = await composed.dispatch(payload(agent, [message('please refactor the parser', 'user')]))
    expect(decision).toEqual({ kind: 'reject' })
    expect(composed.innerCalls()).toBe(0)
    // Window W1, unchanged by M3.3: the archived gate runs before this plugin and
    // vetoes, so the plugin's listeners never see the batch.
    expect(composed.effects.effects.some(entry => entry.effect === 'reject-archived')).toBe(true)
    expect(composed.engine.startCalls).toEqual([])
  })

  it('passes a goal round through, so the goal driver completes its round', async () => {
    const composed = harness()
    const agent = userAgent()
    const decision = await composed.dispatch(payload(agent, [message('goal round 1 instruction', 'goal', { round: 1, goalId: 'g', revision: 1 })]))
    expect(decision.kind).toBe('enter')
    expect(decision).toMatchObject({ startsRequestSeries: true })
    expect(composed.innerCalls()).toBe(1)
    expect(composed.effects.effects.some(entry => entry.effect === 'goal-blocked')).toBe(false)
  })

  it('never rejects a goal round itself, so the goal driver keeps its round', async () => {
    // A goal round is `{kind:'goal', round>0}`: the plugin's listeners only ever look
    // at a `schedule` source, so the round reaches the driver intact.
    const composed = harness({ pluginPlacement: 'first' })
    const decision = await composed.dispatch(payload(userAgent(), [message('goal round 1 instruction', 'goal', { round: 1, goalId: 'g', revision: 1 })]))
    expect(decision.kind).toBe('enter')
    expect(composed.effects.effects.some(entry => entry.effect === 'goal-blocked')).toBe(false)
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
    // Neither order starts a workflow: this plugin starts none from a message at all.
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

  it('leaves the batch the loop claimed in the decision, in both placements', async () => {
    // What is pinned: the plugin neither replaces nor re-wraps the claimed batch, and
    // the messages other listeners append ride inside the entered decision rather
    // than becoming a second turn.
    for (const pluginPlacement of ['first', 'last'] as const) {
      const composed = harness({ pluginPlacement })
      const messages = [message('do the thing', 'user')]
      const decision = await composed.dispatch(payload(userAgent(), messages))
      expect(decision.kind).toBe('enter')
      const carried = (decision as unknown as { messages: UserMessage[] }).messages
      expect(carried[0], `${pluginPlacement}: the claimed message leads`).toBe(messages[0])
      expect(composed.engine.startCalls).toEqual([])
    }
  })
})
