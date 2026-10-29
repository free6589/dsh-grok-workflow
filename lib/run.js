/**
 * Shared workflow-run lifecycle used by both entry points.
 *
 * The tool path (model-initiated) and the mandatory-entry gate (host-initiated)
 * must behave identically: same deadline handling, same active-run cap, same
 * report validation, same redaction, and the same honest failure reporting.
 */
import { buildWorkflowRequest } from './script.js';
import { assertWorkflowReport, failureReport } from './report.js';
import { appendUnloadNotice, callSiteFrames, classifyDisposeTrigger, createWorkflowProgressRecorder, recordDispose, recordRouting, } from './records.js';
import { redactDeep, redactError, redactSecrets } from './redact.js';
/** Create the lifetime state owned by one plugin instance. */
export function createActiveState() {
    return {
        disposed: false,
        pending: 0,
        createdAt: Date.now(),
        controller: new AbortController(),
        runs: new Set(),
        active: new Map(),
        starting: new Map(),
    };
}
/** Human-shaped elapsed time for a message a user may read (`14m38s`, `820ms`). */
export function formatElapsed(ms) {
    const bounded = Math.max(0, Math.trunc(ms));
    if (bounded < 1_000)
        return `${bounded}ms`;
    const totalSeconds = Math.trunc(bounded / 1_000);
    const hours = Math.trunc(totalSeconds / 3_600);
    const minutes = Math.trunc((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0)
        return `${hours}h${String(minutes).padStart(2, '0')}m`;
    if (minutes > 0)
        return `${minutes}m${String(seconds).padStart(2, '0')}s`;
    return `${seconds}s`;
}
/** Session key used by the per-session cap when the runtime exposes no session. */
const UNKNOWN_SESSION = 'unknown-session';
/** Session id of an agent, without throwing on a partial agent. */
function sessionIdOf(agent) {
    const session = sessionOfAgent(agent);
    if (session === undefined)
        return UNKNOWN_SESSION;
    const id = String(session.id ?? '');
    return id === '' ? UNKNOWN_SESSION : id;
}
/** Live runs that belong to one session, oldest first. */
function runsOfSession(state, sessionId) {
    const infos = [];
    for (const info of state.active.values()) {
        if (info.sessionId === sessionId)
            infos.push(info);
    }
    return infos.sort((left, right) => left.startedAtMs - right.startedAtMs);
}
/** How many runs (started + starting) one session holds against its cap. */
export function activeCountOfSession(state, sessionId) {
    return (state.starting.get(sessionId) ?? 0) + runsOfSession(state, sessionId).length;
}
/** `run <id> (running 14m38s)` — the detail a refusal has to carry to be actionable. */
function describeHolder(info, now) {
    return `run ${info.runId} (running ${formatElapsed(now - info.startedAtMs)})`;
}
/** Short label used in thrown messages and rendered failures. */
export function workflowLabel(config) {
    return config.toolName;
}
/** Notice text for a session whose run was cut by an unload. */
function unloadNoticeText(record, interrupted) {
    const runs = interrupted === 1 ? '1 workflow run' : `${interrupted} workflow runs`;
    // Two facts, both observed rather than guessed: how many runs are being cut, and
    // whether the process received a shutdown signal (empty for an in-process
    // unload, where the host does not disclose who asked for it).
    const cause = record.signals.length > 0
        ? `Cause: the process is shutting down (${record.signals.join(', ')}), so this is not a deadline, not a manual stop and not a plugin setting.`
        : 'Cause: the plugin was unloaded inside a running process (a settings toggle, a reload or an upgrade);'
            + ' the host does not disclose which, and the disposal call path is recorded in this session for whoever asks.';
    return [
        `[grok-workflow] The plugin was unloaded while this session had ${runs} in flight, so that work was cancelled.`,
        cause,
        'This notice is written once, at unload time. Messages sent until the plugin is enabled again are answered',
        'directly and are no longer forced through the mandatory workflow.',
    ].join(' ');
}
/**
 * Cancel every live run; called from the plugin disposer.
 *
 * Two obligations that t41 showed were missing (t45, P0):
 *
 * 1. **Be observable.** Before anything is aborted this writes one
 *    `plugin:grok-workflow/dispose` record per affected session (time, uptime,
 *    shutdown signals, trigger class, redacted call site, run count and per-run
 *    elapsed) and one diagnostics line, so "who unloaded the plugin" is answerable
 *    from the log.
 * 2. **Say what it broke, once.** A session whose run is interrupted gets one
 *    user-visible notice; an *idle* unload — what a user does on purpose when
 *    disabling the plugin from the settings surface — stays silent, because a
 *    direct answer is the expected behaviour there and a per-message banner
 *    would be noise.
 *
 * Every write is contained: this runs inside a disposer, where the session
 * service may already be gone, and a refused record must never stop the
 * cancellation that follows it.
 */
export async function disposeActiveState(state, context = {}) {
    const logger = context.logger ?? { warn: () => { } };
    const now = Date.now();
    state.disposed = true;
    state.unloadedAt = now;
    const runs = [...state.runs];
    const infos = runs
        .map(run => state.active.get(run))
        .filter((info) => info !== undefined);
    const record = {
        v: 1,
        at: new Date(now).toISOString(),
        uptimeMs: Math.max(0, now - state.createdAt),
        signals: [...state.signals ?? []],
        trigger: classifyDisposeTrigger(context.callSite ?? '', state.signals ?? []),
        callSite: callSiteFrames(context.callSite),
        activeRuns: runs.length,
        pending: state.pending,
        runs: infos
            .map((info) => ({
            runId: info.runId,
            // Only a real session id is worth recording: the placeholder used by the
            // cap would read like an identity that exists.
            ...info.sessionId === UNKNOWN_SESSION ? {} : { sessionId: info.sessionId },
            startedAtMs: info.startedAtMs,
            elapsedMs: Math.max(0, now - info.startedAtMs),
        }))
            .sort((left, right) => left.startedAtMs - right.startedAtMs)
            .slice(0, 32),
        notices: 0,
    };
    // One record and at most one notice per affected session, written *before* the
    // abort: afterwards every session is racing its own turn teardown.
    const bySession = new Map();
    for (const info of infos) {
        const entry = bySession.get(info.sessionId)
            ?? { ...info.session === undefined ? {} : { session: info.session }, interrupted: 0 };
        entry.interrupted += 1;
        bySession.set(info.sessionId, entry);
    }
    if (bySession.size === 0) {
        // Idle unload: nothing was damaged, so nothing is written into any session.
        // A user who disables the plugin on purpose gets a direct answer, silently —
        // a per-message banner there would be noise, and there is no run to explain.
        logger.info?.(`dsh-grok-workflow: disposed with no active run (trigger=${record.trigger}, uptime=${formatElapsed(record.uptimeMs)})`);
    }
    else {
        logger.warn(`dsh-grok-workflow: disposing with ${record.activeRuns} active and ${record.pending} starting run(s) ` +
            `(trigger=${record.trigger}, uptime=${formatElapsed(record.uptimeMs)}, sessions=${bySession.size}); ` +
            'the runs are cancelled and each affected session receives one interruption notice');
        let notices = 0;
        for (const [sessionId, entry] of bySession) {
            const scoped = {
                ...record,
                runs: record.runs.filter(run => run.sessionId === sessionId),
                notices: 0,
            };
            const wrote = appendUnloadNotice(entry.session, unloadNoticeText(scoped, entry.interrupted), logger);
            if (wrote)
                notices += 1;
            recordDispose(entry.session, { ...scoped, notices: wrote ? 1 : 0 }, logger);
        }
        record.notices = notices;
    }
    state.controller.abort('grok-workflow plugin unloaded');
    state.runs.clear();
    state.active.clear();
    state.starting.clear();
    await Promise.allSettled(runs.map(async (run) => {
        try {
            run.cancel('grok-workflow plugin unloaded');
        }
        catch (error) {
            logger.warn(`run cancel failed during unload: ${redactError(error)}`);
        }
        await run.dispose();
    }));
    return record;
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
    // Two independent caps (t41, P1-3): the per-session one is what a user can
    // reason about ("this conversation already runs two workflows"), and the
    // process-wide one only exists so a fleet of sessions cannot unbounded the
    // child-agent count. Before t45 there was a single process-wide cap, and two
    // long runs in one workspace starved every other workspace: four refusals in
    // three different sessions, all with "already has 2 active run(s)".
    const sessionId = sessionIdOf(agent);
    const sessionActive = activeCountOfSession(state, sessionId);
    if (sessionActive >= config.maxActiveRuns) {
        const now = Date.now();
        const holders = runsOfSession(state, sessionId).map(info => describeHolder(info, now));
        throw new Error(`${workflowLabel(config)} already has ${sessionActive} active run(s) in this session; ` +
            `maxActiveRuns is ${config.maxActiveRuns} per session` +
            (holders.length === 0 ? '' : ` (holding: ${holders.slice(0, 3).join(', ')})`));
    }
    const totalActive = state.runs.size + state.pending;
    if (totalActive >= config.maxActiveRunsTotal) {
        const now = Date.now();
        const holders = [];
        const seen = new Set();
        for (const info of [...state.active.values()].sort((left, right) => left.startedAtMs - right.startedAtMs)) {
            if (seen.has(info.sessionId))
                continue;
            seen.add(info.sessionId);
            const count = runsOfSession(state, info.sessionId).length;
            holders.push(`session ${info.sessionId} (${count} run(s), oldest ${formatElapsed(now - info.startedAtMs)})`);
        }
        throw new Error(`${workflowLabel(config)} already has ${totalActive} active run(s) across ${seen.size || 'several'} session(s); ` +
            `maxActiveRunsTotal is ${config.maxActiveRunsTotal}` +
            (holders.length === 0 ? '' : ` (holding: ${holders.slice(0, 3).join(', ')})`));
    }
    const mode = options.failureMode ?? 'throw';
    const timeoutController = new AbortController();
    let timedOut = false;
    // t47: the deadline is a plugin-owned hard bound, not a hint to the engine. The
    // t46 acceptance round measured a run that was still working five minutes after a
    // 60 s deadline: the timer aborted the signal and asked the engine to cancel, and
    // the turn then waited for the engine to settle. This promise lets the caller stop
    // waiting, so a deadline always produces a report on time whether or not the
    // engine honours the abort.
    let hitDeadline;
    const deadline = new Promise(resolve => { hitDeadline = () => resolve('deadline'); });
    const timer = setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
        hitDeadline?.();
    }, config.timeoutMs);
    timer.unref?.();
    const combined = anySignal([state.controller.signal, timeoutController.signal, ...options.signals ?? []]);
    const signal = combined.signal;
    // The category tells a reader who failed: a deadline or a broken engine is
    // infrastructure (a retry may succeed), while a deliberate stop or a report
    // we could not validate is a configuration/runtime problem of ours (G-4).
    const categoryFor = (cause) => {
        if (cause === 'timeout' || cause === 'engine-error')
            return 'infrastructure';
        // A deliberate stop is neither a broken provider nor bad work: it is the
        // caller's decision, so it gets its own category instead of being filed as a
        // configuration fault nobody can fix (t14, F4).
        if (cause === 'cancelled' || cause === 'unloaded')
            return 'cancelled';
        return 'configuration';
    };
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
    state.starting.set(sessionId, (state.starting.get(sessionId) ?? 0) + 1);
    let run;
    let cancelOnAbort;
    // The stop reason the engine settled on; `run-end` reports it, and a run that
    // never settles (an engine throw) is reported as an error rather than silently
    // left open in the GUI.
    let settledStop;
    // Progress recording is a presentation switch: one GUI node with a member row
    // per subagent. It is subscribed *before* the run exists so the first
    // `agent-start` cannot be missed, and it never affects the run itself.
    const progress = config.showProgress
        ? createWorkflowProgressRecorder(sessionOfAgent(agent), logger)
        : undefined;
    const stopProgressListeners = [];
    /**
     * Subscribe one engine event and keep its disposer.
     *
     * Subscribing is part of "recording never affects the run": a context with no
     * event bus (a bare unit-test context) or one that refuses the listener costs
     * the panel entry, never the workflow.
     */
    const listen = (register) => {
        try {
            const off = register();
            if (typeof off === 'function')
                stopProgressListeners.push(off);
        }
        catch (error) {
            logger.warn(`progress recording is unavailable: ${redactError(error)}`);
        }
    };
    if (progress !== undefined && typeof ctx.on === 'function') {
        listen(() => ctx.on('workflow/agent-start', (info, member) => { progress.agentStart(String(info.id), member); }));
        listen(() => ctx.on('workflow/agent-end', (info, member) => { progress.agentEnd(String(info.id), member); }));
    }
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
            // The node is announced before the script can produce anything, which is
            // what turns "several minutes of empty window" into a live row (t43).
            progress?.runStart(run);
            if (state.disposed) {
                run.cancel('grok-workflow plugin unloaded');
                settledStop = 'cancelled';
                throw new Error(`${workflowLabel(config)} cancelled: plugin unloaded`);
            }
            state.runs.add(run);
            const owner = sessionOfAgent(agent);
            state.active.set(run, {
                runId: run.id,
                sessionId,
                ...owner === undefined ? {} : { session: owner },
                startedAtMs: Date.now(),
            });
            // Belt and braces for in-turn delivery: `start({signal})` documents that an
            // aborted signal cancels the run, but an in-turn wait lives inside the open
            // turn, so a forgotten cancel would hang the turn until the deadline. This
            // listener makes the guarantee independent of the engine's implementation.
            const active = run;
            cancelOnAbort = () => {
                // The reason string is what the engine echoes back, so it has to name the
                // real cause: an unload and a caller cancellation are indistinguishable
                // once only `cancelled` survives (t41, P0-2). t47 added the third cause:
                // the deadline used to be announced as "cancelled by its caller", which
                // pointed the reader at the wrong actor.
                const reason = state.disposed
                    ? 'grok-workflow plugin unloaded'
                    : timedOut
                        ? `workflow deadline exceeded after ${config.timeoutMs} ms`
                        : 'workflow cancelled by its caller';
                void active.cancel(reason);
            };
            signal.addEventListener('abort', cancelOnAbort, { once: true });
            if (signal.aborted)
                cancelOnAbort();
            if (timedOut) {
                run.cancel('workflow deadline exceeded during startup');
                settledStop = 'cancelled';
                return timeout(`workflow exceeded the ${config.timeoutMs} ms deadline and was cancelled`);
            }
        }
        finally {
            state.pending -= 1;
            const startingHere = (state.starting.get(sessionId) ?? 1) - 1;
            if (startingHere <= 0)
                state.starting.delete(sessionId);
            else
                state.starting.set(sessionId, startingHere);
        }
        const activeRun = run;
        // The deadline wins the race even when the engine keeps working: the caller asked
        // for bounded work and must be told the bound was hit, not left waiting for an
        // engine that ignores `cancel`.
        const raced = await Promise.race([activeRun.result, deadline]);
        if (raced === 'deadline') {
            void activeRun.cancel(`workflow deadline exceeded after ${config.timeoutMs} ms`);
            settledStop = 'cancelled';
            return timeout(`workflow exceeded the ${config.timeoutMs} ms deadline and was cancelled; the engine had not settled, so this report is the authoritative result`);
        }
        const result = raced;
        settledStop = result.stopReason;
        if (timedOut) {
            return timeout(`workflow exceeded the ${config.timeoutMs} ms deadline and was cancelled`);
        }
        if (result.stopReason === 'completed') {
            try {
                const report = redactDeep(assertWorkflowReport(result.value, objective, config));
                // The ledger is plugin-owned state: the deterministic report is the truth,
                // the record survives for diagnostics and for the next run's audit trail.
                // Run records are a configuration switch: a user who does not want the
                // plugin appending ledger entries to the session can turn them off, and
                // `recordLimit` bounds what is written.
                if (config.recordRuns) {
                    recordRouting(sessionOfAgent(agent), {
                        objective,
                        routing: report.routing,
                        synthesis: report.synthesis.mode,
                        routes: report.routes,
                    }, logger, config.recordLimit);
                }
                return { report, ok: true };
            }
            catch (error) {
                const detail = redactError(error);
                logger.warn(`report validation failed: ${detail}`);
                return failure('Report validation', detail, 'report-invalid');
            }
        }
        if (result.stopReason === 'cancelled') {
            // Split by cause (t45, P0-2). Before t45 both exits read "was cancelled
            // before it produced a report", so a maintainer could not tell a user stop
            // from the plugin being unloaded underneath the run — which is exactly what
            // happened twice in t41, in two workspaces, 573 ms apart.
            if (state.unloadedAt !== undefined) {
                return failure('Unloaded', `${workflowLabel(config)} was cancelled because the plugin was unloaded while the run was in flight ` +
                    `(not a deadline and not a manual stop); the plugin's dispose record in this session says when and by what`, 'unloaded');
            }
            return failure('Cancelled', `${workflowLabel(config)} was cancelled by its caller before it produced a report`, 'cancelled');
        }
        const detail = redactSecrets(String(result.error ?? 'unknown workflow failure'));
        return failure('Engine error', detail, 'engine-error');
    }
    finally {
        clearTimeout(timer);
        if (cancelOnAbort !== undefined)
            signal.removeEventListener('abort', cancelOnAbort);
        // Close the node even when this function throws: an abandoned node would read
        // as "still running" in the panel until the turn ends.
        if (run !== undefined)
            progress?.runEnd(run.id, settledStop ?? 'error');
        progress?.dispose();
        for (const off of stopProgressListeners ?? [])
            off();
        combined.dispose();
        if (run !== undefined) {
            state.runs.delete(run);
            state.active.delete(run);
            try {
                await run.dispose();
            }
            catch (error) {
                logger.warn(`run disposal failed: ${redactError(error)}`);
            }
        }
    }
}
/** Name of the single-call run in the panel (`workflowRun` title). */
const TRIAGE_RUN_LABEL = 'Front desk';
/**
 * Build the guest script for one call: one `agent()`, one string field back.
 *
 * The schema is not decoration: without it the guest collapses "the child failed"
 * and "the child returned no value" into the same `null`, and a failed greeting
 * would be delivered as an empty one.
 * @param prompt - the prompt handed to the child.
 * @param label - child label.
 * @param route - optional provider/model override.
 * @returns the script body.
 */
function singleCallScript(prompt, label, route, structured) {
    const call = { label, phase: 'Answer' };
    if (structured) {
        call.schema = {
            type: 'object',
            required: ['reply'],
            properties: { reply: { type: 'string' } },
        };
    }
    if (route.provider !== undefined)
        call.provider = route.provider;
    if (route.model !== undefined)
        call.model = route.model;
    // `value` is the child's structured result with a schema and its text without
    // one; both shapes are accepted so the caller reads one field either way.
    return `const value = await agent(${JSON.stringify(prompt)}, ${JSON.stringify(call)})
if (typeof value === 'string') return { reply: value }
if (value && typeof value.reply === 'string') return { reply: value.reply }
if (value && typeof value.text === 'string') return { reply: value.text }
return { reply: null }
`;
}
/**
 * Answer one message with a single child call.
 *
 * Never throws: a provider failure, a deadline or a cancelled turn becomes
 * `{ok: false, reason}`, and the caller states it in the answer instead of
 * silently falling back to a full run (the front desk may not quietly upgrade a
 * "quick" answer into a ten-minute team run).
 * @param options - call request.
 * @returns the text, or why there is none.
 */
export async function runSingleCall(options) {
    const { ctx, config, state, logger, agent, prompt, label } = options;
    if (state.disposed)
        return { ok: false, reason: `${workflowLabel(config)} is unavailable: plugin has been unloaded` };
    const route = config.triageModel === undefined
        ? {}
        : config.triageModel.provider === undefined
            ? { model: config.triageModel.model }
            : { provider: config.triageModel.provider, model: config.triageModel.model };
    const deadlineMs = config.timeoutMs;
    const signals = options.signals ?? [];
    if (state.disposed)
        return { ok: false, reason: `${workflowLabel(config)} is unavailable: plugin has been unloaded` };
    /**
     * One attempt of the front-desk call.
     *
     * `structured` selects the schema-shaped variant; the plain variant asks for a
     * natural answer, which the child returns as text. Measured on :3100: a
     * schema-constrained child sometimes answers in prose, and the guest collapses
     * that to `{"reply":null}` — the plain call is the primary, the schema call the
     * retry, and the outcome says how many attempts it took.
     */
    const attempt = async (structured) => {
        state.pending += 1;
        let run;
        let timer;
        let detach;
        try {
            const start = {
                script: singleCallScript(structured ? `${prompt}\n\nReturn only a JSON object with one field: {"reply": "<your answer>"}.` : prompt, label, route, structured),
                meta: {
                    name: TRIAGE_RUN_LABEL,
                    description: 'Answer one message with a single child call (front-desk tier).',
                    phases: [{ title: 'Answer', detail: 'One worker answers the message directly.' }],
                },
                args: {},
                parent: agent,
                // One child: the tier's whole promise is "one model call".
                maxTotalAgents: 1,
                ...config.subagentProvider === undefined ? {} : { subagentProvider: config.subagentProvider },
            };
            let timedOut = false;
            try {
                run = await ctx.workflowEngine.start(start);
            }
            catch (error) {
                return { ok: false, reason: redactError(error) };
            }
            const live = run;
            detach = () => {
                live.cancel(state.disposed ? 'grok-workflow plugin unloaded' : 'front-desk call cancelled by its caller');
            };
            for (const signal of signals) {
                if (signal.aborted === true)
                    detach();
                else
                    signal.addEventListener('abort', detach, { once: true });
            }
            const result = await Promise.race([
                live.result,
                new Promise(resolve => {
                    timer = setTimeout(() => {
                        timedOut = true;
                        live.cancel(`front-desk call exceeded the ${deadlineMs} ms deadline`);
                        resolve(undefined);
                    }, deadlineMs);
                }),
            ]);
            if (timedOut)
                return { ok: false, reason: `the front-desk call exceeded the ${deadlineMs} ms deadline` };
            if (result === undefined)
                return { ok: false, reason: 'the front-desk call settled without a result' };
            if (result.stopReason !== 'completed') {
                return {
                    ok: false,
                    reason: `the front-desk call stopped: ${result.stopReason}${result.error === undefined ? '' : ` (${result.error})`}`,
                };
            }
            const value = result.value;
            const text = typeof value === 'string'
                ? value.trim()
                : value !== null && typeof value === 'object' && typeof value.reply === 'string'
                    ? value.reply.trim()
                    : '';
            if (text === '') {
                // The guest collapses "the child failed" and "the child returned no
                // structured value" into null, so the reason carries what the engine did
                // report: `agentsStarted` 0 means the call was never accepted.
                logger.warn(`front-desk call produced no reply (agentsStarted=${result.agentsStarted} value=${JSON.stringify(result.value)?.slice(0, 120) ?? 'undefined'})`);
                return { ok: false, reason: `the front-desk worker returned no text (agentsStarted=${result.agentsStarted})` };
            }
            return { ok: true, text };
        }
        catch (error) {
            logger.warn(`front-desk call failed: ${redactError(error)}`);
            return { ok: false, reason: redactError(error) };
        }
        finally {
            if (timer !== undefined)
                clearTimeout(timer);
            if (detach !== undefined)
                for (const signal of signals)
                    signal.removeEventListener('abort', detach);
            state.pending -= 1;
            run?.dispose().catch(() => { });
        }
    };
    const plain = await attempt(false);
    if (plain.ok)
        return plain;
    // One retry, schema-shaped: a cheap answer may cost two calls when the child
    // returns nothing, and the answer text says so (`attempts`).
    const retry = await attempt(true);
    if (retry.ok)
        return { ok: true, text: retry.text, retried: true };
    return { ok: false, reason: `${plain.reason}; retry with a structured answer also failed: ${retry.reason}` };
}
//# sourceMappingURL=run.js.map