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
    maxActiveRunsTotal: 16,
    timeoutMs: 86_400_000,
    /** Maximum routes in one role's fallback chain. */
    chainLength: 3,
    /** Maximum characters in one provider or model id. */
    routeChars: 120,
    /** Hard ceiling on child calls charged against one task (worker + verifier). */
    maxAttemptsPerTask: 6,
    /** Hard ceiling on routing ledger entries kept per run. */
    recordEntries: 256,
};
/**
 * Default deadline for one workflow run: 60 minutes (t45, P1-4).
 *
 * The old 30-minute default was measured to be wrong twice in one afternoon —
 * two four-task runs were killed at exactly 30m00s and 30m01s — while real
 * four-task runs finish in 878 s / 1148 s / 1801 s. 60 minutes keeps a hung run
 * bounded and gives the observed worst case roughly 2x headroom; a caller with a
 * longer objective raises it in the profile patch (t45 D-017).
 */
export const DEFAULT_TIMEOUT_MS = 3_600_000;
/** Default concurrent workflow runs per session (t45, P1-3). */
export const DEFAULT_MAX_ACTIVE_RUNS = 2;
/**
 * Default concurrent workflow runs across every session.
 *
 * The per-session cap is what a user reasons about; this one only keeps the
 * number of child agents in one process bounded.
 */
export const DEFAULT_MAX_ACTIVE_RUNS_TOTAL = 8;
/** Version of the configuration surface this build understands. */
export const CONFIG_VERSION = 1;
/**
 * Every top-level key the configuration accepts, in schema order.
 * Kept explicit so an unknown key can be rejected instead of silently dropped:
 * a typo that is silently ignored looks exactly like a setting that "does not
 * work", which is the failure mode the settings surface must not have.
 */
export const CONFIG_KEYS = [
    'toolName',
    'enforceGate',
    'gateRequired',
    'gateScope',
    'gatePreset',
    'answerStrategy',
    'historyTurns',
    'historyChars',
    'maxQueuedMessages',
    'maxConcurrency',
    'maxRetries',
    'maxTasks',
    'timeoutMs',
    'maxActiveRuns',
    'maxActiveRunsTotal',
    'subagentProvider',
    'roles',
    'synthesis',
    'switchOn',
    'recordRuns',
    'recordLimit',
    'showProgress',
    'configVersion',
];
const TOOL_NAME = /^[a-z][a-z0-9_]{1,40}$/;
/**
 * DSH profile configuration schema.
 *
 * Every user-editable field is `volatile()`: the runtime then hands it over as a
 * live holder (`.get()`) and an edit does not remount the plugin — a remount
 * would kill an in-flight run (E-12/E-31). The structural fields stay plain:
 * `toolName` is fixed at registration, `enforceGate`/`gateRequired` decide
 * whether the gate exists at all, and `configVersion` is a wire contract.
 * `snapshotConfig()` below turns holders back into plain values, so one reader
 * serves a hand-written config, a profile patch and a live settings form alike.
 */
export const Config = z.object({
    toolName: z.string().default('grok_workflow'),
    enforceGate: z.boolean().default(true),
    gateRequired: z.boolean().default(false),
    gateScope: z.union([z.const('process'), z.const('preset')]).default('process').volatile(),
    gatePreset: z.string().default('').volatile(),
    // `in-turn` is the default because it is the only strategy that survives a
    // one-shot app: `relay`/`append` deliver after the turn closes, and a one-shot
    // process tears the agent tree down at that point (G-18/F9), which loses the
    // answer entirely and breaks R-001. Measured in t24 (NR-1 probe, exit 0 with a
    // real model). Both older strategies stay selectable for long-lived surfaces.
    answerStrategy: z.union([z.const('in-turn'), z.const('relay'), z.const('append')]).default('in-turn').volatile(),
    historyTurns: z.natural().min(0).max(HARD_LIMITS.historyTurns).default(4).volatile(),
    historyChars: z.natural().min(0).max(HARD_LIMITS.historyChars).default(4_000).volatile(),
    maxQueuedMessages: z.natural().min(0).max(HARD_LIMITS.maxQueuedMessages).default(4).volatile(),
    maxConcurrency: z.natural().min(1).max(HARD_LIMITS.maxConcurrency).default(3).volatile(),
    maxRetries: z.natural().min(0).max(HARD_LIMITS.maxRetries).default(1).volatile(),
    maxTasks: z.natural().min(1).max(HARD_LIMITS.maxTasks).default(6).volatile(),
    // 60 minutes, not 30 (t45, P1-4): the two measured deadline kills were 30m00s
    // and 30m01s on four-task objectives, and a real four-task run took 878 s / 1148 s
    // / 1801 s. 60 minutes keeps the "a hung run cannot run forever" property while
    // giving the observed worst case ~2x headroom; a longer objective raises it in
    // the profile patch, where the run's own tool timeout follows it (t45 D-017).
    timeoutMs: z.natural().min(1_000).max(HARD_LIMITS.timeoutMs).default(DEFAULT_TIMEOUT_MS).volatile(),
    // Per session, not per process (t45, P1-3): one session's long runs must not
    // starve another session's message. `maxActiveRunsTotal` is the process-wide
    // backstop that keeps the child-agent count bounded.
    maxActiveRuns: z.natural().min(1).max(HARD_LIMITS.maxActiveRuns).default(DEFAULT_MAX_ACTIVE_RUNS).volatile(),
    maxActiveRunsTotal: z.natural().min(1).max(HARD_LIMITS.maxActiveRunsTotal).default(DEFAULT_MAX_ACTIVE_RUNS_TOTAL).volatile(),
    subagentProvider: z.string().default('').volatile(),
    roles: z.object({
        planner: z.array(z.object({ provider: z.string().default(''), model: z.string() })).default([]),
        worker: z.array(z.object({ provider: z.string().default(''), model: z.string() })).default([]),
        verifier: z.array(z.object({ provider: z.string().default(''), model: z.string() })).default([]),
        synthesizer: z.array(z.object({ provider: z.string().default(''), model: z.string() })).default([]),
    }).default({ planner: [], worker: [], verifier: [], synthesizer: [] }).volatile(),
    synthesis: z.union([z.const('deterministic'), z.const('model')]).default('deterministic').volatile(),
    // Switching policy (阶段5): which failure classes advance the fallback chain.
    // Empty means "use the built-in policy" (every transport/model class switches;
    // content failures never do), which is what phases 3-4 shipped.
    switchOn: z.array(z.string()).default([]).volatile(),
    // Run records: the routing/delivery ledger written into the session.
    recordRuns: z.boolean().default(true).volatile(),
    recordLimit: z.natural().min(0).max(HARD_LIMITS.recordEntries).default(64).volatile(),
    // Progress visibility: the Web GUI folds four `tool-workflow/*` session events
    // into one run node (members = subagents). On by default — a user watching a
    // multi-minute run should see it — and off for a user who wants the session log
    // to carry nothing but messages.
    showProgress: z.boolean().default(true).volatile(),
    // Config version, so a future rename can be migrated instead of guessed.
    configVersion: z.natural().default(CONFIG_VERSION),
});
/** Failure classes a user may name in `switchOn`. */
export const SWITCHABLE_CLASSES = [
    'rate-limit',
    'server-error',
    'connection',
    'timeout',
    'model-unavailable',
    'format-error',
    'agent-start-failed',
];
/**
 * Reject unknown top-level keys instead of letting the schema drop them.
 *
 * A silently ignored key is indistinguishable from a setting that does not
 * work, and the whole point of the configuration layer (D) is that a user can
 * tell those apart. The message names the closest accepted key.
 * @param config - raw user configuration.
 * @throws If a key is not part of the configuration surface.
 */
export function assertKnownKeys(config) {
    const known = new Set(CONFIG_KEYS);
    for (const key of Object.keys(config)) {
        if (known.has(key))
            continue;
        const suggestion = CONFIG_KEYS.find(candidate => candidate.toLowerCase().startsWith(key.toLowerCase().slice(0, 4)))
            ?? CONFIG_KEYS.find(candidate => key.toLowerCase().startsWith(candidate.toLowerCase().slice(0, 4)));
        throw new Error(`unknown configuration key "${key}"${suggestion === undefined ? '' : ` (did you mean "${suggestion}"?)`}; ` +
            `accepted keys: ${CONFIG_KEYS.join(', ')}`);
    }
}
/**
 * Validate and normalize the switching policy.
 *
 * An unknown class name would silently never switch, so it is refused: the
 * policy is a whitelist, and a typo in it must not look like "no fallback".
 * @param list - the configured classes, or undefined for the built-in policy.
 * @returns The normalized list (empty means the built-in policy).
 */
function resolveSwitchOn(list) {
    if (list === undefined || list.length === 0)
        return [];
    const allowed = new Set(SWITCHABLE_CLASSES);
    const out = [];
    for (const entry of list) {
        const name = typeof entry === 'string' ? entry.trim() : '';
        if (!allowed.has(name)) {
            throw new Error(`switchOn has "${String(entry)}", which is not a switchable failure class; ` +
                `accepted: ${SWITCHABLE_CLASSES.join(', ')} ` +
                '(content and setup failures never switch: task-failed, verification-failed, budget-exhausted)');
        }
        if (!out.includes(name))
            out.push(name);
    }
    return out;
}
/**
 * Accept a bare model id where a route object is expected.
 *
 * Written as a migration aid: `worker: ['fast', 'slow']` reads naturally, and
 * normalizing it here keeps one shape downstream instead of teaching every
 * consumer two spellings.
 * @param entry - route object, or a bare model id string.
 * @param path - configuration path used in the error message.
 * @returns A route object.
 */
function normalizeRoute(entry, path) {
    if (typeof entry === 'string') {
        const model = entry.trim();
        if (model === '')
            throw new Error(`${path} must name a model, not an empty string`);
        return { model };
    }
    if (entry === null || typeof entry !== 'object')
        throw new Error(`${path} must be a route object or a model id string`);
    return entry;
}
function resolveChain(role, chain) {
    if (chain === undefined)
        return [];
    if (!Array.isArray(chain))
        throw new Error(`roles.${role} must be an array of routes`);
    // An empty chain means "inherit the run's route". The schema default fills every
    // role with `[]`, so emptiness cannot be told apart from "not configured"; the
    // effective chains are surfaced in the report instead of failing the load.
    if (chain.length === 0)
        return [];
    if (chain.length > HARD_LIMITS.chainLength) {
        throw new Error(`roles.${role} has ${chain.length} routes; the maximum chain length is ${HARD_LIMITS.chainLength}`);
    }
    const seen = new Set();
    const out = [];
    for (const [index, raw] of chain.entries()) {
        const entry = normalizeRoute(raw, `roles.${role}[${index}]`);
        const model = entry?.model?.trim() ?? '';
        if (model === '')
            throw new Error(`roles.${role}[${index}].model must be a non-empty model id`);
        if (model.length > HARD_LIMITS.routeChars) {
            throw new Error(`roles.${role}[${index}].model is longer than ${HARD_LIMITS.routeChars} characters`);
        }
        const provider = entry?.provider?.trim() ?? '';
        if (provider.length > HARD_LIMITS.routeChars) {
            throw new Error(`roles.${role}[${index}].provider is longer than ${HARD_LIMITS.routeChars} characters`);
        }
        const key = `${provider}/${model}`;
        if (seen.has(key))
            throw new Error(`roles.${role} repeats the same route twice: ${key}`);
        seen.add(key);
        out.push(provider === '' ? { model } : { provider, model });
    }
    return out;
}
function integer(name, value, min, max) {
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`${name} must be an integer between ${min} and ${max}`);
    }
    return value;
}
/** Resolve defaults and enforce the hard limits for direct construction paths. */
export function resolveConfig(config = {}) {
    assertKnownKeys(config);
    const configVersion = integer('configVersion', config.configVersion ?? CONFIG_VERSION, 1, CONFIG_VERSION);
    const toolName = config.toolName ?? 'grok_workflow';
    if (!TOOL_NAME.test(toolName)) {
        throw new Error(`toolName must match ${TOOL_NAME.source}`);
    }
    const provider = config.subagentProvider?.trim();
    const answerStrategy = config.answerStrategy ?? 'in-turn';
    const gateScope = config.gateScope ?? 'process';
    const gatePreset = (config.gatePreset ?? '').trim();
    if (gateScope === 'preset' && gatePreset === '') {
        throw new Error('gateScope "preset" requires gatePreset to name the agent preset that owns the gate');
    }
    const roles = {
        planner: resolveChain('planner', config.roles?.planner),
        worker: resolveChain('worker', config.roles?.worker),
        verifier: resolveChain('verifier', config.roles?.verifier),
        synthesizer: resolveChain('synthesizer', config.roles?.synthesizer),
    };
    const maxRetries = integer('maxRetries', config.maxRetries ?? 1, 0, HARD_LIMITS.maxRetries);
    // Budget invariant (R-12): one task may charge at most
    // HARD_LIMITS.maxAttemptsPerTask child calls, and every attempt pays for one
    // worker and one verifier call per chain entry.
    const callsPerAttempt = Math.max(1, roles.worker.length) + Math.max(1, roles.verifier.length);
    const attemptsPerTask = maxRetries + 1;
    if (callsPerAttempt * attemptsPerTask > HARD_LIMITS.maxAttemptsPerTask) {
        throw new Error(`roles.worker + roles.verifier need ${callsPerAttempt} child calls per attempt; with maxRetries ${maxRetries} ` +
            `that is ${callsPerAttempt * attemptsPerTask} calls per task, over the ${HARD_LIMITS.maxAttemptsPerTask}-call ` +
            'budget per task. Shorten the chains or lower maxRetries ' +
            `(a ${HARD_LIMITS.chainLength}-route worker chain needs maxRetries 0 even with a single verifier route).`);
    }
    const synthesis = config.synthesis ?? 'deterministic';
    if (synthesis === 'model' && roles.synthesizer.length === 0) {
        throw new Error('synthesis "model" requires a non-empty roles.synthesizer chain');
    }
    if (roles.synthesizer.length > 0 && synthesis === 'deterministic') {
        throw new Error('roles.synthesizer is set but synthesis is "deterministic": set synthesis to "model" or remove the chain');
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
        timeoutMs: integer('timeoutMs', config.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000, HARD_LIMITS.timeoutMs),
        maxActiveRuns: integer('maxActiveRuns', config.maxActiveRuns ?? DEFAULT_MAX_ACTIVE_RUNS, 1, HARD_LIMITS.maxActiveRuns),
        maxActiveRunsTotal: integer('maxActiveRunsTotal', config.maxActiveRunsTotal ?? DEFAULT_MAX_ACTIVE_RUNS_TOTAL, 1, HARD_LIMITS.maxActiveRunsTotal),
        switchOn: resolveSwitchOn(config.switchOn),
        recordRuns: config.recordRuns ?? true,
        showProgress: config.showProgress ?? true,
        recordLimit: integer('recordLimit', config.recordLimit ?? 64, 0, HARD_LIMITS.recordEntries),
        configVersion,
        ...provider === undefined || provider === '' ? {} : { subagentProvider: provider },
    };
}
/** True for a value the runtime wrapped because the field is volatile. */
function isHolder(value) {
    return value !== null
        && typeof value === 'object'
        && typeof value.get === 'function';
}
/**
 * Unwrap every volatile holder into a plain configuration object.
 *
 * The plugin reads its configuration through this function and never through
 * `rawConfig` directly, so a value edited in the settings UI (which writes the
 * holder) and a value written in a profile patch (which stays plain) reach
 * `resolveConfig()` in exactly one shape.
 * @param raw - configuration as the runtime provided it.
 * @returns Plain configuration.
 */
export function snapshotConfig(raw) {
    if (raw === undefined || raw === null)
        return {};
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
        if (value === undefined)
            continue;
        if (isHolder(value)) {
            let unwrapped;
            try {
                unwrapped = value.get();
            }
            catch {
                // A holder that cannot be read is a runtime fault, not user input; leaving
                // the field out lets validation apply its own default instead of crashing.
                continue;
            }
            if (unwrapped === undefined)
                continue;
            out[key] = unwrapped;
            continue;
        }
        out[key] = value;
    }
    return out;
}
/**
 * Build the reader used by the tool and the gate.
 *
 * A settings edit invalidates nothing by itself: the next `read()` validates the
 * new values, so a broken edit refuses the next message with its exact reason
 * instead of half-applying, and a run that already started keeps the snapshot it
 * was given (`lastGood()`), which is what "live" has to mean for a run whose
 * limits must not move under it.
 * @param raw - live configuration object (holders included).
 * @param logger - optional logger for the fallback warning.
 * @returns A reader with a validated snapshot cache.
 */
/** One-line summary of a resolved config, for the load-time and per-edit log line.
 *
 * t47: the t46 acceptance round could not answer "what did the runtime actually
 * read?" from any artefact — the deadline and the role chains only existed in
 * memory, so a settings save and a patch edit were indistinguishable from the
 * outside. This string is written to the log whenever the effective config
 * changes, and the deadline travels into the run's report as well.
 */
export function describeResolvedConfig(config) {
    const role = (name) => {
        const chain = config.roles[name];
        return chain.length === 0 ? 'inherit' : chain.map(route => route.provider === '' ? route.model : `${route.provider}/${route.model}`).join('→');
    };
    return [
        `timeoutMs=${config.timeoutMs}`,
        `maxTasks=${config.maxTasks}`,
        `maxConcurrency=${config.maxConcurrency}`,
        `maxRetries=${config.maxRetries}`,
        `maxActiveRuns=${config.maxActiveRuns}/${config.maxActiveRunsTotal}`,
        `gate=${config.enforceGate ? 'on' : 'off'}/${config.gateScope}${config.gateRequired ? ' (required)' : ''}`,
        `synthesis=${config.synthesis}`,
        `roles=planner:${role('planner')} worker:${role('worker')} verifier:${role('verifier')} synthesizer:${role('synthesizer')}`,
    ].join(' ');
}
export function createConfigReader(raw, logger) {
    let lastGood;
    return {
        read() {
            const next = resolveConfig(snapshotConfig(raw));
            lastGood = next;
            return next;
        },
        lastGood() {
            if (lastGood !== undefined)
                return lastGood;
            // Nothing has validated yet: fall back to defaults rather than to whatever
            // was on the wire, because a delivery decision cannot be made from garbage.
            const fallback = resolveConfig({});
            lastGood = fallback;
            logger?.warn('configuration was not readable yet; delivery fell back to defaults');
            return fallback;
        },
    };
}
//# sourceMappingURL=config.js.map