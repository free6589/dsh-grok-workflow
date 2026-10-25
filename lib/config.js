import z from '@deepseek-ai/schemastery';
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
};
const TOOL_NAME = /^[a-z][a-z0-9_]{1,40}$/;
/** DSH profile configuration schema. */
export const Config = z.object({
    toolName: z.string().default('grok_workflow'),
    enforceGate: z.boolean().default(true),
    gateScope: z.union([z.const('process'), z.const('preset')]).default('process'),
    gatePreset: z.string().default(''),
    answerStrategy: z.union([z.const('relay'), z.const('append')]).default('relay'),
    historyTurns: z.natural().min(0).max(HARD_LIMITS.historyTurns).default(4),
    historyChars: z.natural().min(0).max(HARD_LIMITS.historyChars).default(4_000),
    maxQueuedMessages: z.natural().min(0).max(HARD_LIMITS.maxQueuedMessages).default(4),
    maxConcurrency: z.natural().min(1).max(HARD_LIMITS.maxConcurrency).default(3),
    maxRetries: z.natural().min(0).max(HARD_LIMITS.maxRetries).default(1),
    maxTasks: z.natural().min(1).max(HARD_LIMITS.maxTasks).default(6),
    timeoutMs: z.natural().min(1_000).max(HARD_LIMITS.timeoutMs).default(1_800_000),
    maxActiveRuns: z.natural().min(1).max(HARD_LIMITS.maxActiveRuns).default(2),
    subagentProvider: z.string().default(''),
});
function integer(name, value, min, max) {
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return value;
}
/** Resolve defaults and enforce the hard limits for direct construction paths. */
export function resolveConfig(config = {}) {
    const toolName = config.toolName ?? 'grok_workflow';
    if (!TOOL_NAME.test(toolName)) {
        throw new Error(`toolName must match ${TOOL_NAME.source}`);
    }
    const provider = config.subagentProvider?.trim();
    const answerStrategy = config.answerStrategy ?? 'relay';
    const gateScope = config.gateScope ?? 'process';
    const gatePreset = (config.gatePreset ?? '').trim();
    if (gateScope === 'preset' && gatePreset === '') {
        throw new Error('gateScope "preset" requires gatePreset to name the agent preset that owns the gate');
    }
    return {
        toolName,
        enforceGate: config.enforceGate ?? true,
        gateScope,
        ...gatePreset === '' ? {} : { gatePreset },
        answerStrategy,
        historyTurns: integer('historyTurns', config.historyTurns ?? 4, 0, HARD_LIMITS.historyTurns),
        historyChars: integer('historyChars', config.historyChars ?? 4_000, 0, HARD_LIMITS.historyChars),
        maxQueuedMessages: integer('maxQueuedMessages', config.maxQueuedMessages ?? 4, 0, HARD_LIMITS.maxQueuedMessages),
        maxConcurrency: integer('maxConcurrency', config.maxConcurrency ?? 3, 1, HARD_LIMITS.maxConcurrency),
        maxRetries: integer('maxRetries', config.maxRetries ?? 1, 0, HARD_LIMITS.maxRetries),
        maxTasks: integer('maxTasks', config.maxTasks ?? 6, 1, HARD_LIMITS.maxTasks),
        timeoutMs: integer('timeoutMs', config.timeoutMs ?? 1_800_000, 1_000, HARD_LIMITS.timeoutMs),
        maxActiveRuns: integer('maxActiveRuns', config.maxActiveRuns ?? 2, 1, HARD_LIMITS.maxActiveRuns),
        ...provider === undefined || provider === '' ? {} : { subagentProvider: provider },
    };
}
//# sourceMappingURL=config.js.map