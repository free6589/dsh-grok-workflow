/**
 * Shared workflow-run lifecycle used by both entry points.
 *
 * The tool path (model-initiated) and the mandatory-entry gate (host-initiated)
 * must behave identically: same deadline handling, same active-run cap, same
 * report validation, same redaction, and the same honest failure reporting.
 */
import { buildWorkflowRequest } from './script.js';
import { assertWorkflowReport, failureReport } from './report.js';
import { recordRouting } from './records.js';
import { redactDeep, redactError, redactSecrets } from './redact.js';
/** Create the lifetime state owned by one plugin instance. */
export function createActiveState() {
    return { disposed: false, pending: 0, controller: new AbortController(), runs: new Set() };
}
/** Short label used in thrown messages and rendered failures. */
export function workflowLabel(config) {
    return config.toolName;
}
/** Cancel every live run; called from the plugin disposer. */
export async function disposeActiveState(state) {
    state.disposed = true;
    state.controller.abort('grok-workflow plugin unloaded');
    const runs = [...state.runs];
    state.runs.clear();
    await Promise.allSettled(runs.map(async (run) => {
        run.cancel('grok-workflow plugin unloaded');
        await run.dispose();
    }));
}
/**
 * Combine signals without depending on `AbortSignal.any` availability.
 *
 * The manual path registers one listener per source, so it also returns a
 * disposer: a long-lived plugin controller would otherwise accumulate a listener
 * per run and eventually trip the EventEmitter warning.
 */
export function anySignal(signals) {
    const anyFn = AbortSignal.any;
    if (typeof anyFn === 'function')
        return { signal: anyFn(signals), dispose: () => { } };
    const controller = new AbortController();
    const abort = () => controller.abort();
    const bound = [];
    for (const signal of signals) {
        if (signal.aborted) {
            abort();
            break;
        }
        signal.addEventListener('abort', abort, { once: true });
        bound.push(signal);
    }
    return {
        signal: controller.signal,
        dispose: () => {
            for (const signal of bound)
                signal.removeEventListener('abort', abort);
        },
    };
}
/**
 * Start one workflow run and resolve with a report. Throws only for conditions
 * the caller can classify (busy/unavailable); engine failures become an explicit
 * failure report so that no caller can silently answer without the workflow.
 */
/** Read the session attached to an agent, when the runtime exposes one. */
function sessionOfAgent(agent) {
    try {
        return agent.session;
    }
    catch {
        return undefined;
    }
}
export async function runWorkflow(options) {
    const { ctx, config, state, logger, agent, objective } = options;
    if (state.disposed)
        throw new Error(`${workflowLabel(config)} is unavailable: plugin has been unloaded`);
    const callerTasks = options.callerTasks;
    const request = buildWorkflowRequest(objective, callerTasks, config);
    if (state.runs.size + state.pending >= config.maxActiveRuns) {
        throw new Error(`${workflowLabel(config)} already has ${state.runs.size + state.pending} active run(s); maxActiveRuns is ${config.maxActiveRuns}`);
    }
    const mode = options.failureMode ?? 'throw';
    const timeoutController = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
    }, config.timeoutMs);
    timer.unref?.();
    const combined = anySignal([state.controller.signal, timeoutController.signal, ...options.signals ?? []]);
    const signal = combined.signal;
    // The category tells a reader who failed: a deadline or a broken engine is
    // infrastructure (a retry may succeed), while a deliberate stop or a report
    // we could not validate is a configuration/runtime problem of ours (G-4).
    const categoryFor = (cause) => cause === 'timeout' || cause === 'engine-error' ? 'infrastructure' : 'configuration';
    const asReport = (phase, message, cause) => ({
        report: redactDeep(failureReport(objective, config, phase, message, categoryFor(cause))),
        ok: false,
        cause,
    });
    // A deadline always yields a report: the caller asked for work and must learn
    // that it stopped, not receive an exception the transport may swallow.
    const timeout = (message) => asReport('Timeout', message, 'timeout');
    const failure = (phase, message, cause) => {
        if (mode === 'throw')
            throw new Error(`${workflowLabel(config)} ${cause}: ${message}`);
        return asReport(phase, message, cause);
    };
    state.pending += 1;
    let run;
    let cancelOnAbort;
    try {
        try {
            const start = {
                script: request.script,
                meta: request.meta,
                args: request.args,
                parent: agent,
                signal,
                maxTotalAgents: request.maxTotalAgents,
                ...config.subagentProvider === undefined ? {} : { subagentProvider: config.subagentProvider },
            };
            try {
                run = await ctx.workflowEngine.start(start);
            }
            catch (error) {
                if (timedOut)
                    return timeout(`workflow exceeded the ${config.timeoutMs} ms deadline during startup`);
                throw error;
            }
            if (state.disposed) {
                run.cancel('grok-workflow plugin unloaded');
                throw new Error(`${workflowLabel(config)} cancelled: plugin unloaded`);
            }
            state.runs.add(run);
            // Belt and braces for in-turn delivery: `start({signal})` documents that an
            // aborted signal cancels the run, but an in-turn wait lives inside the open
            // turn, so a forgotten cancel would hang the turn until the deadline. This
            // listener makes the guarantee independent of the engine's implementation.
            const active = run;
            cancelOnAbort = () => { void active.cancel('workflow cancelled by its caller'); };
            signal.addEventListener('abort', cancelOnAbort, { once: true });
            if (signal.aborted)
                cancelOnAbort();
            if (timedOut) {
                run.cancel('workflow deadline exceeded during startup');
                return timeout(`workflow exceeded the ${config.timeoutMs} ms deadline and was cancelled`);
            }
        }
        finally {
            state.pending -= 1;
        }
        const activeRun = run;
        const result = await activeRun.result;
        if (timedOut) {
            return timeout(`workflow exceeded the ${config.timeoutMs} ms deadline and was cancelled`);
        }
        if (result.stopReason === 'completed') {
            try {
                const report = redactDeep(assertWorkflowReport(result.value, objective, config));
                // The ledger is plugin-owned state: the deterministic report is the truth,
                // the record survives for diagnostics and for the next run's audit trail.
                recordRouting(sessionOfAgent(agent), {
                    objective,
                    routing: report.routing,
                    synthesis: report.synthesis.mode,
                    routes: report.routes,
                }, logger);
                return { report, ok: true };
            }
            catch (error) {
                const detail = redactError(error);
                logger.warn(`report validation failed: ${detail}`);
                return failure('Report validation', detail, 'report-invalid');
            }
        }
        if (result.stopReason === 'cancelled') {
            return failure('Cancelled', `${workflowLabel(config)} was cancelled before it produced a report`, 'cancelled');
        }
        const detail = redactSecrets(String(result.error ?? 'unknown workflow failure'));
        return failure('Engine error', detail, 'engine-error');
    }
    finally {
        clearTimeout(timer);
        if (cancelOnAbort !== undefined)
            signal.removeEventListener('abort', cancelOnAbort);
        combined.dispose();
        if (run !== undefined) {
            state.runs.delete(run);
            try {
                await run.dispose();
            }
            catch (error) {
                logger.warn(`run disposal failed: ${redactError(error)}`);
            }
        }
    }
}
//# sourceMappingURL=run.js.map