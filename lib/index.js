import { defineTool } from '@deepseek-ai/dsh-tools';
import { DEFAULT_ITERATE_TEMPLATE, FIXED_HISTORY_CHARS, FIXED_HISTORY_TURNS, MAX_TIMER_DELAY_MS, createConfigReader, describeResolvedConfig, limitOverrunWarning, repairLimitOverruns, repairSynthesisInconsistency, resolveConfig, snapshotConfig, takeLimitOverruns } from './config.js';
import { describeSurface, validateRoutes } from './settings.js';
import { carryoverBounds, carryoverForSession } from './carryover.js';
import { registerGrokCommand } from './command.js';
import { installGate } from './gate.js';
import { ITERATE_TASK_TITLE, createLoopService, loopPolicyFromConfig, scheduleServiceOf } from './loop.js';
import { installLoop } from './loop-surface.js';
import { installModeRoute } from './mode-surface.js';
import { installShutdownProbe } from './records.js';
import { normalizeCallerTasks, GrokWorkflowInputError, TASK_LIMITS } from './input.js';
import { renderReport } from './report.js';
import { redactError } from './redact.js';
import { createActiveState, disposeActiveState, runWorkflow } from './run.js';
export { Config, HARD_LIMITS } from './config.js';
export { GrokWorkflowInputError } from './input.js';
/** Unique plugin name for DSH diagnostics. */
export const name = 'dsh-grok-workflow';
/** Required DSH services. The base/web/headless bundles provide them. */
export const inject = ['tools', 'workflowEngine', 'systemPrompt'];
/** Install the workflow tool and its lifetime-scoped state. */
export function apply(ctx, rawConfig = {}) {
    const logger = ctx.logger('dsh-grok-workflow');
    // One reader, re-validated per admission (DD-9 1-2): a settings edit applies to
    // the next message, and a run that already started keeps the snapshot it was
    // given, so its limits cannot move under it.
    const reader = createConfigReader(rawConfig, logger);
    // t47: every effective-configuration change is announced once. The t46 round could
    // not tell a settings save from a profile-patch edit — and could not read the
    // deadline the run actually used — because both lived only in memory.
    //
    // P1 (synthesis fallback) and B07 (stored limit over the hard maximum): only those
    // recoverable shapes are repaired at load, and on every later read too, so the tool
    // keeps working after a bad settings save or a stale pre-v0.9.0 patch. Everything
    // else still throws (R-06), and the cap itself is never widened.
    //
    // The limit half is normally repaired *earlier* than this function: the host
    // validates the profile patch against the exported `Config` schema before the plugin
    // is called, so `Config` clamps the overrun and leaves a note here (a schema has no
    // logger). Announcing that note is what makes the repair visible, and the map below
    // is per load, so a document the host re-parses on every settings read cannot turn
    // one overrun into a warning per message.
    const announcedOverruns = new Set();
    const announceOverruns = () => {
        for (const overrun of takeLimitOverruns()) {
            const key = `${overrun.field}:${overrun.stored}`;
            if (announcedOverruns.has(key))
                continue;
            announcedOverruns.add(key);
            logger.warn(limitOverrunWarning(overrun));
        }
    };
    let configSignature = '';
    const readConfig = () => {
        announceOverruns();
        try {
            const next = reader.read();
            const signature = describeResolvedConfig(next);
            if (signature !== configSignature) {
                configSignature = signature;
                logger.info?.(`configuration in effect: ${signature}`);
            }
            return next;
        }
        catch (error) {
            const snap = snapshotConfig(rawConfig);
            // Two load-time repairs, in a fixed order so a config carrying both defects is
            // repaired by one round instead of needing two restarts. Both are the D-031
            // "configurable mistake must not remove the page you would fix it on" path; the
            // repairs themselves never validate, and anything else still throws (R-06).
            // The limit repair is the backstop for a caller whose config never met the
            // schema (a programmatic `apply()`, a stale `lib/`): on the host path the schema
            // has already clamped, so this branch finds nothing to do there.
            const synthesis = repairSynthesisInconsistency(snap);
            const limits = repairLimitOverruns(synthesis.repaired);
            const warnings = [...synthesis.warnings, ...limits.warnings];
            if (warnings.length === 0)
                throw error;
            // A repaired shape may still hide another defect: resolving it must succeed
            // before any warning is emitted, otherwise the non-repairable error stays a
            // hard fail and no "repaired" line is ever logged for a config that cannot run.
            const fixed = resolveConfig(limits.repaired);
            if (synthesis.warnings.length > 0)
                fixed.synthesisRepaired = true;
            for (const warning of synthesis.warnings)
                logger.warn(warning);
            // The limit half is announced through the same set as the schema clamp (B04):
            // `repairLimitOverruns` only *records* what it clamped, so the wording is the
            // schema path's own sentence and a read that keeps landing here — this branch
            // runs once per message while another defect keeps failing — warns once, not
            // once per message. `limits.warnings` still decides that a repair happened.
            announceOverruns();
            const signature = describeResolvedConfig(fixed);
            if (signature !== configSignature) {
                configSignature = signature;
                logger.info?.(`configuration in effect: ${signature}`);
            }
            return fixed;
        }
    };
    const config = readConfig();
    const state = createActiveState();
    // Settings surface: the generated form comes from the `Config` schema this
    // module exports, so the fields a user edits in the Web UI are the fields the
    // run reads. Declaring it is intent, not enablement (auto defaults to true);
    // the diagnostics line below makes "the page is real" answerable from the log
    // alone, and says what the only surface is when there is none (R-004).
    const surface = describeSurface(ctx);
    if (surface.level === 'warn')
        logger.warn(surface.text);
    else
        logger.info?.(surface.text);
    // Route validation (D): fail the load on a provider or enumerated model that
    // the runtime does not have, because a silently ignored chain looks like
    // routing that works. Anything the runtime cannot judge becomes a warning.
    const routes = validateRoutes(ctx, config);
    for (const note of routes.notes)
        logger.warn(note);
    if (routes.errors.length > 0)
        throw new Error(routes.errors.join('; '));
    // t45: remember shutdown signals, so the dispose record can say "the process is
    // shutting down" instead of "cause unknown". Removed again on reload.
    ctx.effect(() => installShutdownProbe(state));
    ctx.effect(() => async () => {
        // The disposer is where the t41 blind spot lived: two runs in two workspaces
        // were cancelled 573 ms apart with no way to tell who unloaded the plugin.
        // The raw stack is captured here, at the only place that knows the answer,
        // and `disposeActiveState` records what it attributes it to (t45, P0-1).
        await disposeActiveState(state, {
            logger,
            ...new Error('dsh-grok-workflow disposer').stack === undefined
                ? {}
                : { callSite: String(new Error('dsh-grok-workflow disposer').stack) },
        });
    }, 'dsh-grok-workflow: active runs');
    ctx.systemPrompt.section({
        name: 'tool:grok-workflow',
        order: ctx.systemPrompt.getSectionOrder('TOOL_WORKFLOW'),
        text: [
            `Use ${config.toolName} for substantial objectives that benefit from decomposition, independent subtasks, explicit verification, and a bounded retry policy.`,
            'It plans first when no tasks are supplied, runs independent tasks concurrently, verifies every acceptance criterion with evidence, and reports completed/partial/failed honestly.',
            'Do not use it for a single trivial lookup or a task whose result cannot be checked.',
        ].join(' '),
    });
    // `/grok [on|off]`: the per-session toggle command. Lazy `commands` mount,
    // exactly like plan-mode's `/plan` — interactive UIs only; headless surfaces
    // compose no commands service and stay governed by `grokDefault`.
    registerGrokCommand(ctx, logger);
    const parameters = {
        objective: {
            type: 'string',
            required: true,
            description: `The complete objective to plan, execute, verify, and report. At most ${TASK_LIMITS.objectiveChars} characters. Be specific about scope and desired deliverable.`,
        },
        tasks: {
            type: 'array',
            description: 'Optional independent plan. When omitted, a planner child decomposes the objective. Caller tasks must not depend on each other.',
            items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    id: { type: 'string', description: 'Stable id; generated as task-N when omitted. Unique within the plan.' },
                    title: { type: 'string', required: true, description: 'Short task title.' },
                    objective: { type: 'string', required: true, description: 'Outcome this task must achieve.' },
                    expectedOutput: { type: 'string', required: true, description: 'Concrete expected output.' },
                    acceptanceCriteria: {
                        type: 'array',
                        required: true,
                        description: 'Non-empty testable acceptance checks; the verifier must cite evidence for each one.',
                        items: { type: 'string' },
                    },
                    context: { type: 'string', description: 'Optional context the worker needs.' },
                    constraints: {
                        type: 'array',
                        description: 'Optional constraints and non-goals.',
                        items: { type: 'string' },
                    },
                    writesPaths: {
                        type: 'array',
                        description: 'File or directory paths this task writes. Overlapping tasks are serialized (they share one working directory); omit when unknown.',
                        items: { type: 'string' },
                    },
                },
            },
        },
    };
    const tool = defineTool({
        name: config.toolName,
        description: [
            'Plan, execute, independently verify, retry within a bounded limit, and synthesize a complex objective.',
            'Use for multi-step work with independent subtasks and concrete acceptance checks.',
            'Returns a canonical report with status completed, partial, or failed; never infer success from a worker self-report.',
        ].join(' '),
        parameters,
        output: {
            schema: { type: 'json' },
            render: (_args, value) => {
                // T4: diagnostics always off — the relay text carries the human block,
                // the PTC render path renders the same report without the ledger.
                void readConfig;
                return [{
                        type: 'text',
                        text: renderReport(value),
                    }];
            },
        },
        // DSH `defineTool({timeoutMs})` requires a positive finite number and throws
        // otherwise, so an unlimited (0) or overflow (> MAX_TIMER_DELAY_MS) deadline
        // omits the field entirely (no DSH-side deadline); otherwise the tool gets
        // the run deadline plus 60 s of headroom, never past the setTimeout ceiling.
        ...config.timeoutMs <= 0 || config.timeoutMs > MAX_TIMER_DELAY_MS
            ? {}
            : { timeoutMs: Math.min(config.timeoutMs + 60_000, MAX_TIMER_DELAY_MS) },
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            // Read at execution time, not at registration: a settings edit applies to
            // the next call. An invalid edit is reported as the reason the call cannot
            // run (never silently replaced by defaults).
            let live;
            try {
                live = readConfig();
            }
            catch (error) {
                throw new Error(`${config.toolName} cannot run: the current configuration is invalid: ${redactError(error)}`);
            }
            const { agent } = exec;
            if (!agent) {
                throw new Error(`${config.toolName} requires a calling agent (exec.agent was undefined)`);
            }
            const sessionHeader = agent.session?.header;
            const delegationDepth = sessionHeader?.delegationDepth ?? 0;
            if (sessionHeader?.origin === 'subagent' || delegationDepth > 0) {
                throw new Error(`${config.toolName} cannot be invoked from a subagent (delegation depth ${delegationDepth})`);
            }
            if (state.disposed) {
                throw new Error(`${config.toolName} is unavailable: plugin has been unloaded`);
            }
            if (exec.signal.aborted) {
                throw new Error(`${config.toolName} cancelled before start`);
            }
            const objective = args.objective.trim();
            if (!objective)
                throw new GrokWorkflowInputError('objective must be a non-empty string');
            if (objective.length > TASK_LIMITS.objectiveChars) {
                throw new GrokWorkflowInputError(`objective must be at most ${TASK_LIMITS.objectiveChars} characters`);
            }
            const callerTasks = normalizeCallerTasks(args.tasks, live.maxTasks);
            // Cross-round carry-over (v0.5): a tool call is also a new round inside the
            // session, so it gets the same bounded digest of the earlier rounds that the
            // gate hands to a message-driven run. Empty when the session has none.
            const carryover = carryoverForSession(agent.session, carryoverBounds({ historyTurns: FIXED_HISTORY_TURNS, historyChars: FIXED_HISTORY_CHARS }));
            const outcome = await runWorkflow({
                ctx,
                config: live,
                state,
                logger,
                agent,
                objective,
                signals: [exec.signal],
                ...callerTasks === undefined ? {} : { callerTasks },
                ...carryover.digest === '' ? {} : { carryover: carryover.digest },
                failureMode: 'throw',
            });
            return outcome.report;
        },
    });
    ctx.tools.register(tool);
    // Repeat-run driver (Host loop service). A loop is one durable Schedule rrule task
    // whose delivery target is the same session; this plugin owns no timer, so an open
    // loop survives a plugin reload and an unload deletes it (no ownerless work). The
    // policy is read at open time, so a settings edit reaches the next switch flip rather
    // than the next restart; `loopEnabled` stays the deployment default for a future
    // automatic driver, and the composer switch is the session's explicit override.
    const loop = createLoopService({
        schedule: () => scheduleServiceOf(ctx),
        logger,
        policy: () => {
            const live = readConfig();
            return loopPolicyFromConfig(live.timeoutMs, live.loopIntervalMin, live.loopMaxRounds, live.loopFailStreak);
        },
    });
    // Self-iteration driver: a second service instance over the same Schedule, bound to
    // the `RSI heartbeat` slot instead of the loop slot, so the two switches can never
    // adopt, charge or delete each other's row. Its prompt is the editable template
    // persisted in the profile (`iterateTemplate`), so a settings edit reaches the next
    // open; a whitespace-only template falls back to the built-in default. No routing
    // marker and no unload sweep: these deliveries route as ordinary schedule messages
    // and the beat is the repository's own (docs/knowledge/HEARTBEATS.md §1).
    const iterate = createLoopService({
        schedule: () => scheduleServiceOf(ctx),
        logger,
        identity: {
            title: ITERATE_TASK_TITLE,
            defaultPrompt: () => {
                const template = readConfig().iterateTemplate.trim();
                return template === '' ? DEFAULT_ITERATE_TEMPLATE : template;
            },
        },
        policy: () => {
            const live = readConfig();
            return loopPolicyFromConfig(live.timeoutMs, live.iterateIntervalMin, live.loopMaxRounds, live.loopFailStreak);
        },
    });
    installLoop({ ctx: ctx, loop, logger, iterate });
    // The composer's master switch rides the same durable mode record `/grok`
    // writes: a browser click has no commanding agent, so it gets one exact route
    // (`POST /grok-workflow/mode`) instead of a second store. `status` reports the
    // live `grokDefault` fallback, which is exactly what the gate applies when no
    // record exists — the default is stated once, never copied into the button.
    installModeRoute({
        ctx: ctx,
        fallback: () => {
            try {
                return readConfig().grokDefault === 'on';
            }
            catch {
                // A broken live edit must not make "is the workflow on?" unanswerable:
                // the load-time snapshot is the same fallback the gate uses.
                return config.grokDefault === 'on';
            }
        },
        logger,
    });
    // T4: the gate is always on (enforceGate removed) — every top-level user
    // message passes the front desk.
    installGate({
        ctx,
        config,
        state,
        logger,
        readConfig,
        lastGoodConfig: () => reader.lastGood(),
    });
}
//# sourceMappingURL=index.js.map