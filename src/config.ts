import z from '@deepseek-ai/schemastery'
import type { GrokWorkflowConfig, ModelRoute, ResolvedConfig } from './types.js'

/** Hard limits; user configuration can only tighten these. */
export const HARD_LIMITS = {
  historyTurns: 20,
  historyChars: 8_000,
  maxQueuedMessages: 8,
  maxConcurrency: 6,
  maxRetries: 3,
  maxTasks: 12,
  maxActiveRuns: 4,
  timeoutMs: 86_400_000,
  /** Maximum routes in one role's fallback chain. */
  chainLength: 3,
  /** Maximum characters in one provider or model id. */
  routeChars: 120,
  /** Hard ceiling on child calls charged against one task (worker + verifier). */
  maxAttemptsPerTask: 6,
} as const

const TOOL_NAME = /^[a-z][a-z0-9_]{1,40}$/

/** DSH profile configuration schema. */
export const Config = z.object({
  toolName: z.string().default('grok_workflow'),
  enforceGate: z.boolean().default(true),
  gateRequired: z.boolean().default(false),
  gateScope: z.union([z.const('process'), z.const('preset')]).default('process'),
  gatePreset: z.string().default(''),
  // `in-turn` is the default because it is the only strategy that survives a
  // one-shot app: `relay`/`append` deliver after the turn closes, and a one-shot
  // process tears the agent tree down at that point (G-18/F9), which loses the
  // answer entirely and breaks R-001. Measured in t24 (NR-1 probe, exit 0 with a
  // real model). Both older strategies stay selectable for long-lived surfaces.
  answerStrategy: z.union([z.const('in-turn'), z.const('relay'), z.const('append')]).default('in-turn'),
  historyTurns: z.natural().min(0).max(HARD_LIMITS.historyTurns).default(4),
  historyChars: z.natural().min(0).max(HARD_LIMITS.historyChars).default(4_000),
  maxQueuedMessages: z.natural().min(0).max(HARD_LIMITS.maxQueuedMessages).default(4),
  maxConcurrency: z.natural().min(1).max(HARD_LIMITS.maxConcurrency).default(3),
  maxRetries: z.natural().min(0).max(HARD_LIMITS.maxRetries).default(1),
  maxTasks: z.natural().min(1).max(HARD_LIMITS.maxTasks).default(6),
  timeoutMs: z.natural().min(1_000).max(HARD_LIMITS.timeoutMs).default(1_800_000),
  maxActiveRuns: z.natural().min(1).max(HARD_LIMITS.maxActiveRuns).default(2),
  subagentProvider: z.string().default(''),
  roles: z.object({
    planner: z.array(z.object({ provider: z.string().default(''), model: z.string() })).default([]),
    worker: z.array(z.object({ provider: z.string().default(''), model: z.string() })).default([]),
    verifier: z.array(z.object({ provider: z.string().default(''), model: z.string() })).default([]),
    synthesizer: z.array(z.object({ provider: z.string().default(''), model: z.string() })).default([]),
  }).default({ planner: [], worker: [], verifier: [], synthesizer: [] }),
  synthesis: z.union([z.const('deterministic'), z.const('model')]).default('deterministic'),
})

/**
 * Validate one role's chain and return the normalized routes.
 *
 * Fail-fast (R-06): an unusable chain is rejected at load, never discovered
 * mid-run, because a silently ignored chain looks like routing that works.
 */
function resolveChain(role: string, chain: ModelRoute[] | undefined): ModelRoute[] {
  if (chain === undefined) return []
  if (!Array.isArray(chain)) throw new Error(`roles.${role} must be an array of routes`)
  // An empty chain means "inherit the run's route". The schema default fills every
  // role with `[]`, so emptiness cannot be told apart from "not configured"; the
  // effective chains are surfaced in the report instead of failing the load.
  if (chain.length === 0) return []
  if (chain.length > HARD_LIMITS.chainLength) {
    throw new Error(`roles.${role} has ${chain.length} routes; the maximum chain length is ${HARD_LIMITS.chainLength}`)
  }
  const seen = new Set<string>()
  const out: ModelRoute[] = []
  for (const [index, entry] of chain.entries()) {
    const model = entry?.model?.trim() ?? ''
    if (model === '') throw new Error(`roles.${role}[${index}].model must be a non-empty model id`)
    if (model.length > HARD_LIMITS.routeChars) {
      throw new Error(`roles.${role}[${index}].model is longer than ${HARD_LIMITS.routeChars} characters`)
    }
    const provider = entry?.provider?.trim() ?? ''
    if (provider.length > HARD_LIMITS.routeChars) {
      throw new Error(`roles.${role}[${index}].provider is longer than ${HARD_LIMITS.routeChars} characters`)
    }
    const key = `${provider}/${model}`
    if (seen.has(key)) throw new Error(`roles.${role} repeats the same route twice: ${key}`)
    seen.add(key)
    out.push(provider === '' ? { model } : { provider, model })
  }
  return out
}

function integer(name: string, value: number, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`)
  }
  return value
}

/** Resolve defaults and enforce the hard limits for direct construction paths. */
export function resolveConfig(config: GrokWorkflowConfig = {}): ResolvedConfig {
  const toolName = config.toolName ?? 'grok_workflow'
  if (!TOOL_NAME.test(toolName)) {
    throw new Error(`toolName must match ${TOOL_NAME.source}`)
  }
  const provider = config.subagentProvider?.trim()
  const answerStrategy = config.answerStrategy ?? 'in-turn'
  const gateScope = config.gateScope ?? 'process'
  const gatePreset = (config.gatePreset ?? '').trim()
  if (gateScope === 'preset' && gatePreset === '') {
    throw new Error('gateScope "preset" requires gatePreset to name the agent preset that owns the gate')
  }
  const roles = {
    planner: resolveChain('planner', config.roles?.planner),
    worker: resolveChain('worker', config.roles?.worker),
    verifier: resolveChain('verifier', config.roles?.verifier),
    synthesizer: resolveChain('synthesizer', config.roles?.synthesizer),
  }
  const maxRetries = integer('maxRetries', config.maxRetries ?? 1, 0, HARD_LIMITS.maxRetries)
  // Budget invariant (R-12): one task may charge at most
  // HARD_LIMITS.maxAttemptsPerTask child calls, and every attempt pays for one
  // worker and one verifier call per chain entry.
  const callsPerAttempt = Math.max(1, roles.worker.length) + Math.max(1, roles.verifier.length)
  const attemptsPerTask = maxRetries + 1
  if (callsPerAttempt * attemptsPerTask > HARD_LIMITS.maxAttemptsPerTask) {
    throw new Error(
      `roles.worker + roles.verifier need ${callsPerAttempt} child calls per attempt; with maxRetries ${maxRetries} ` +
      `that is ${callsPerAttempt * attemptsPerTask} calls per task, over the ${HARD_LIMITS.maxAttemptsPerTask}-call ` +
      'budget per task. Shorten the chains or lower maxRetries ' +
      `(a ${HARD_LIMITS.chainLength}-route worker chain needs maxRetries 0 even with a single verifier route).`,
    )
  }
  const synthesis = config.synthesis ?? 'deterministic'
  if (synthesis === 'model' && roles.synthesizer.length === 0) {
    throw new Error('synthesis "model" requires a non-empty roles.synthesizer chain')
  }
  if (roles.synthesizer.length > 0 && synthesis === 'deterministic') {
    throw new Error('roles.synthesizer is set but synthesis is "deterministic": set synthesis to "model" or remove the chain')
  }
  return {
    toolName,
    enforceGate: config.enforceGate ?? true,
    gateRequired: config.gateRequired ?? false,
    roles,
    synthesis,
    gateScope,
    ...gatePreset === '' ? {} : { gatePreset },
    answerStrategy,
    historyTurns: integer('historyTurns', config.historyTurns ?? 4, 0, HARD_LIMITS.historyTurns),
    historyChars: integer('historyChars', config.historyChars ?? 4_000, 0, HARD_LIMITS.historyChars),
    maxQueuedMessages: integer('maxQueuedMessages', config.maxQueuedMessages ?? 4, 0, HARD_LIMITS.maxQueuedMessages),
    maxConcurrency: integer('maxConcurrency', config.maxConcurrency ?? 3, 1, HARD_LIMITS.maxConcurrency),
    maxRetries,
    maxTasks: integer('maxTasks', config.maxTasks ?? 6, 1, HARD_LIMITS.maxTasks),
    timeoutMs: integer('timeoutMs', config.timeoutMs ?? 1_800_000, 1_000, HARD_LIMITS.timeoutMs),
    maxActiveRuns: integer('maxActiveRuns', config.maxActiveRuns ?? 2, 1, HARD_LIMITS.maxActiveRuns),
    ...provider === undefined || provider === '' ? {} : { subagentProvider: provider },
  }
}
