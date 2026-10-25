/**
 * Faithful reproductions of the in-tree `agent/pre-step` listeners that share a
 * real DSH composition with this plugin. Provenance for every entry is the
 * installed DSH 0.2.1-rc.2 source, quoted with file:line in the header of each
 * factory. They exist so the composition test can run in CI without a DSH
 * installation; `docs/ARCHITECTURE.md` records the drift risk and the audit
 * command that re-derives this list from the installation.
 *
 * Only the decision-relevant control flow is reproduced. Reservation bookkeeping,
 * projections, narration text and persistence calls are reduced to recorded side
 * effects, because they cannot change whether a rejected batch reaches a model.
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'

/** One `agent/pre-step` listener and the placement options it registers with. */
export interface ComposedListener {
  /** Package that ships the listener, as installed. */
  package: string
  /** `file:line` of the `ctx.on('agent/pre-step', …)` call. */
  provenance: string
  /** `true` when the real listener registers with `{prepend: true}`. */
  prepend?: boolean
  /** The listener body. */
  handler: (payload: ComposedPayload, next: () => Promise<ComposedDecision>) => Promise<ComposedDecision>
}

/** The `agent/pre-step` payload subset every listener reads. */
export interface ComposedPayload {
  agent: ComposedAgent
  messages: UserMessage[]
  turn: number
  step: number
  signal: AbortSignal
}

/** `PreStepDecision` as the waterfall carries it. */
export type ComposedDecision =
  | { kind: 'reject' }
  | { kind: 'enter'; messages: UserMessage[]; startsRequestSeries?: true }

/** The agent fields the listeners read: session header plus id. */
export interface ComposedAgent {
  id: string
  session: { id: string; header: { id: string; origin?: string; parentSession?: string; agentPreset?: string } }
}

/** Deterministic user message builder used by every fixture. */
export function message(text: string, kind: string, extra: Record<string, unknown> = {}): UserMessage {
  return createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind, ...extra } as never,
  }) as UserMessage
}

/** What the reproductions observed, for assertions. */
export interface ComposedEffects {
  /** Decisions each post-processing listener saw from its `next()`. */
  observed: { package: string; kind: string }[]
  /** Context messages a listener appended to a decision. */
  appended: { package: string; kind: string; text: string }[]
  /** Non-decision side effects (compaction, flush, goal transitions). */
  effects: { package: string; effect: string; detail?: string }[]
}

function appendContext(
  effects: ComposedEffects,
  pkg: string,
  decision: ComposedDecision,
  text: string,
  kind: string,
): ComposedDecision {
  if (decision.kind === 'reject') return decision
  effects.appended.push({ package: pkg, kind, text })
  return { ...decision, messages: [...decision.messages, message(text, kind)] }
}

/**
 * Archived-session gate.
 * Provenance: @deepseek-ai/dsh-api-session-controller lib/index.js:2513-2519
 * (`ArchivedSessionGate`) and the lineage walk at :2528-2540.
 *
 * Rejects **without** calling `next()`, so in a real composition it pre-empts
 * every listener registered after it (this plugin's gate included).
 */
export function archivedSessionGate(effects: ComposedEffects, archived: string[], sessions: Map<string, ComposedAgent['session']>): ComposedListener {
  const underArchived = (agent: ComposedAgent): boolean => {
    const seen = new Set<string>()
    let header: ComposedAgent['session']['header'] | undefined = agent.session.header
    while (header !== undefined && !seen.has(header.id)) {
      if (archived.includes(header.id)) return true
      seen.add(header.id)
      if (header.origin !== 'subagent' || header.parentSession === undefined) return false
      const parent = sessions.get(header.parentSession)
      if (parent === undefined) return archived.includes(header.parentSession)
      header = parent.header
    }
    return false
  }
  return {
    package: 'dsh-api-session-controller',
    provenance: 'lib/index.js:2516',
    handler: (payload, next) => {
      if (underArchived(payload.agent)) {
        effects.effects.push({ package: 'dsh-api-session-controller', effect: 'reject-archived' })
        return Promise.resolve({ kind: 'reject' })
      }
      return next()
    },
  }
}

/**
 * Goal-round driver.
 * Provenance: @deepseek-ai/dsh-goal-round-driver lib/index.js:291-352, source
 * predicate at :32-34 (`source.kind === 'goal' && source.round > 0`).
 *
 * Two behaviours matter for the gate:
 * - a rejected goal round is turned into `ctx.goals.block(…, 'prompt-rejected')`,
 *   so any listener that rejects a goal round has an externally visible effect;
 * - an entered goal round is forced to `startsRequestSeries: true`.
 * The reservation validation that runs before `next()` is reduced to "the round
 * is current" because it never applies to a `source.kind === 'user'` message.
 */
export function goalRoundDriver(effects: ComposedEffects): ComposedListener {
  return {
    package: 'dsh-goal-round-driver',
    provenance: 'lib/index.js:291',
    handler: async (payload, next) => {
      const submitted = payload.messages.find(message => {
        const source = message.source as { kind?: string; round?: number } | undefined
        return source?.kind === 'goal' && (source.round ?? 0) > 0
      })
      if (submitted === undefined) return next()
      const decision = await next()
      effects.observed.push({ package: 'dsh-goal-round-driver', kind: decision.kind })
      if (payload.signal.aborted) return decision
      if (decision.kind === 'reject') {
        effects.effects.push({
          package: 'dsh-goal-round-driver',
          effect: 'goal-blocked',
          detail: 'prompt-rejected',
        })
        return decision
      }
      effects.effects.push({ package: 'dsh-goal-round-driver', effect: 'starts-request-series' })
      return { ...decision, startsRequestSeries: true }
    },
  }
}

/** Plan-mode narration. Provenance: @deepseek-ai/dsh-plan-mode lib/index.js:151-171. */
export function planMode(effects: ComposedEffects, active: boolean): ComposedListener {
  return {
    package: 'dsh-plan-mode',
    provenance: 'lib/index.js:151',
    handler: async (payload, next) => {
      const decision = await next()
      effects.observed.push({ package: 'dsh-plan-mode', kind: decision.kind })
      if (decision.kind === 'reject' || payload.signal.aborted || !active) return decision
      return appendContext(effects, 'dsh-plan-mode', decision, 'plan mode is active', 'plan/mode')
    },
  }
}

/**
 * Step-pressure compaction. Provenance: @deepseek-ai/dsh-compaction-basic
 * lib/index.js:839-853.
 *
 * Compacts the surface **before** calling `next()`, so it runs its side effect
 * even for a batch this plugin later rejects; it never rewrites the decision.
 */
export function compactionBasic(effects: ComposedEffects): ComposedListener {
  return {
    package: 'dsh-compaction-basic',
    provenance: 'lib/index.js:839',
    handler: async (payload, next) => {
      if (!payload.signal.aborted) {
        effects.effects.push({ package: 'dsh-compaction-basic', effect: 'compact-if-needed' })
      }
      return next()
    },
  }
}

/**
 * Workspace instructions. Provenance: @deepseek-ai/dsh-agent-instructions
 * lib/index.js:1406-1424 (honours both `reject` and an empty `enter` batch).
 */
export function agentInstructions(effects: ComposedEffects): ComposedListener {
  return {
    package: 'dsh-agent-instructions',
    provenance: 'lib/index.js:1406',
    handler: async (payload, next) => {
      const decision = await next()
      effects.observed.push({ package: 'dsh-agent-instructions', kind: decision.kind })
      if (decision.kind === 'reject') return decision
      if (payload.step === 1 && decision.messages.length === 0) return decision
      return appendContext(effects, 'dsh-agent-instructions', decision, 'workspace instructions', 'agent-instructions')
    },
  }
}

/**
 * Session references. Provenance: @deepseek-ai/dsh-session-reference
 * lib/index.js:470-479, registered with `{ prepend: true }`.
 */
export function sessionReference(effects: ComposedEffects): ComposedListener {
  return {
    package: 'dsh-session-reference',
    provenance: 'lib/index.js:470',
    prepend: true,
    handler: async (_payload, next) => {
      const decision = await next()
      effects.observed.push({ package: 'dsh-session-reference', kind: decision.kind })
      if (decision.kind === 'reject') return decision
      return appendContext(effects, 'dsh-session-reference', decision, 'session reference snapshot', 'session-reference')
    },
  }
}

/**
 * Skill invocation and catalog. Provenance: @deepseek-ai/dsh-tool-skill
 * lib/index.js:896-928 (invoked skills) and :931-… (catalog snapshot).
 */
export function toolSkill(effects: ComposedEffects): ComposedListener[] {
  return [{
    package: 'dsh-tool-skill',
    provenance: 'lib/index.js:896',
    handler: async (_payload, next) => {
      const decision = await next()
      effects.observed.push({ package: 'dsh-tool-skill', kind: decision.kind })
      if (decision.kind === 'reject') return decision
      return appendContext(effects, 'dsh-tool-skill', decision, 'skill content', 'skill-invocation')
    },
  }, {
    package: 'dsh-tool-skill',
    provenance: 'lib/index.js:931',
    handler: async (_payload, next) => {
      const decision = await next()
      effects.observed.push({ package: 'dsh-tool-skill', kind: decision.kind })
      if (decision.kind === 'reject') return decision
      return appendContext(effects, 'dsh-tool-skill', decision, 'skill catalog', 'skill-catalog')
    },
  }]
}

/** Time context. Provenance: @deepseek-ai/dsh-time-context lib/index.js:215-227. */
export function timeContext(effects: ComposedEffects): ComposedListener {
  return {
    package: 'dsh-time-context',
    provenance: 'lib/index.js:215',
    handler: async (payload, next) => {
      const decision = await next()
      effects.observed.push({ package: 'dsh-time-context', kind: decision.kind })
      if (decision.kind === 'reject' || payload.signal.aborted) return decision
      return appendContext(effects, 'dsh-time-context', decision, 'current time', 'time-context')
    },
  }
}

/** Tmux context. Provenance: @deepseek-ai/dsh-tmux-context lib/index.js:2265-2281. */
export function tmuxContext(effects: ComposedEffects): ComposedListener {
  return {
    package: 'dsh-tmux-context',
    provenance: 'lib/index.js:2265',
    handler: async (payload, next) => {
      const decision = await next()
      effects.observed.push({ package: 'dsh-tmux-context', kind: decision.kind })
      if (decision.kind === 'reject' || payload.signal.aborted || payload.step !== 1) return decision
      return appendContext(effects, 'dsh-tmux-context', decision, 'tmux reading', 'tmux-context')
    },
  }
}

/** Repeat-tool reminder bookkeeping. Provenance: @deepseek-ai/dsh-repeat-tool-reminder lib/index.js:2261-2265. */
export function repeatToolReminder(effects: ComposedEffects): ComposedListener {
  return {
    package: 'dsh-repeat-tool-reminder',
    provenance: 'lib/index.js:2261',
    handler: (payload, next) => {
      if (payload.messages.some(message => (message.source as { kind?: string }).kind === 'user')) {
        effects.effects.push({ package: 'dsh-repeat-tool-reminder', effect: 'reset-chains' })
      }
      return next()
    },
  }
}

/** Session checkpoint policy. Provenance: @deepseek-ai/dsh-session-checkpoint-policy lib/index.js:72-75. */
export function sessionCheckpointPolicy(effects: ComposedEffects): ComposedListener {
  return {
    package: 'dsh-session-checkpoint-policy',
    provenance: 'lib/index.js:72',
    handler: async (_payload, next) => {
      effects.effects.push({ package: 'dsh-session-checkpoint-policy', effect: 'flush-session' })
      return next()
    },
  }
}

/** Extra context a listener appends on an `enter` decision. */
export function authContext(effects: ComposedEffects): ComposedListener {
  return {
    package: 'dsh-client-connection',
    provenance: 'fixture-only: stands in for the remaining context appenders',
    handler: async (_payload, next) => {
      const decision = await next()
      if (decision.kind === 'reject') return decision
      return appendContext(effects, 'dsh-client-connection', decision, 'runtime context', 'runtime-context')
    },
  }
}

/** Every in-tree listener above, in the load order a real composition produces. */
export function inTreeListeners(effects: ComposedEffects, options: { archived?: string[]; sessions?: Map<string, ComposedAgent['session']>; planModeActive?: boolean; listenerOrder?: 'goal-driver-outer' | 'archived-outer' } = {}): ComposedListener[] {
  const archived = archivedSessionGate(effects, options.archived ?? [], options.sessions ?? new Map())
  const driver = goalRoundDriver(effects)
  // The relative order of these two is fixed by plugin load order in a real
  // profile; both orders are exercised because they differ observably.
  const order = options.listenerOrder === 'goal-driver-outer' ? [driver, archived] : [archived, driver]
  return [
    sessionReference(effects),
    ...order,
    compactionBasic(effects),
    planMode(effects, options.planModeActive ?? true),
    timeContext(effects),
    tmuxContext(effects),
    ...toolSkill(effects),
    repeatToolReminder(effects),
    sessionCheckpointPolicy(effects),
    agentInstructions(effects),
    authContext(effects),
  ]
}
