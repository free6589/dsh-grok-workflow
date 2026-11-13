/**
 * Engine wiring: checkpointing attached to the workflow-run lifecycle.
 *
 * This module is the only place that connects the checkpoint schema
 * (`./schema.js`) and its atomic writer (`./writer.js`) to a live run started
 * through `ctx.workflowEngine.start` and to the plugin's disposal path. It owns
 * four obligations, and nothing else:
 *
 * 1. **Periodic checkpoints.** While a run is live, one host timer rewrites the
 *    run's checkpoint file on a fixed interval. The timer is `unref()`ed, so a
 *    checkpoint never keeps the process alive, and it exists only between
 *    `adopt()` and `finish()`/`unload()`/`dispose()` — an idle plugin (or an
 *    unmounted bundle row) owns no timer at all.
 * 2. **Terminal checkpoints.** `finish()` writes the run's final status and the
 *    report-derived rows (tasks, agents, evidence); `unload()` writes the
 *    `cancelled` shape that a plugin unload produces, before the runs are
 *    cancelled, because afterwards there is no run left to describe.
 * 3. **Host-side watchdog evidence.** Deadline and cancellation facts flow into
 *    `watchdog` from the host: the recorder's own clock against the deadline it
 *    was given, the engine's `workflow/end` stop reason, and the caller's own
 *    statements (`noteDeadline`/`noteCancel`/`finish`). Nothing is inferred from
 *    a child's self-report.
 * 4. **Four roles, no new ones.** Everything recorded about children comes from
 *    host-observable data — the report's own route trail — and a row whose role
 *    is not one of {@link HOST_ROLES planner, worker, verifier, synthesizer} is
 *    dropped rather than given a label. Wiring never calls `agent()` and never
 *    starts a model turn: it costs zero model calls and adds zero roles.
 *
 * What wiring deliberately does NOT do:
 * - It never touches the engine. It subscribes to the observe-only
 *   `workflow/*` events (`@deepseek-ai/dsh-workflow`) and reads the run object
 *   it is handed; it never starts, cancels or disposes a run. Cancellation stays
 *   with `src/run.ts` and `disposeActiveState`.
 * - It never claims engine-level resume. The shipped engine has no journaling or
 *   resume (`dsh-workflow/README.md`, limitations), so {@link resumeDecision}
 *   answers a *host* question — "should a new run be started from this file, and
 *   with which unfinished tasks?" — and says so in its reason string.
 * - It never writes what it cannot observe. Before a report exists the
 *   checkpoint says `plan.source: 'unavailable'` with no tasks and no agent rows,
 *   instead of guessing at the plan from the script text. `git` is written only
 *   when the caller supplies a provider; otherwise the schema default is recorded
 *   and must not be read as an observation.
 *
 * Durability and failure policy: every write goes through
 * `writeCheckpoint` (atomic rename + checksum). A failed write is a warning and a
 * counter, never a failed run — recording must not be able to break the work it
 * records. After {@link CHECKPOINT_WIRING_LIMITS.maxConsecutiveFailures}
 * consecutive failures the recorder stops retrying for that run, so a read-only
 * or full disk costs one warning per interval instead of one per tick forever.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { phaseLabel } from '../naming.js';
import { redactError } from '../redact.js';
import { CHECKPOINT_LIMITS } from './schema.js';
import { checkpointFileName, writeCheckpoint } from './writer.js';
/* ------------------------------------------------------------------ *
 * Bounds and host vocabulary
 * ------------------------------------------------------------------ */
/** Wiring's own bounds. They bound the *rate* and *retention* of writes. */
export const CHECKPOINT_WIRING_LIMITS = {
    /** Periodic checkpoint interval; clamped into this range at construction. */
    intervalMs: { min: 1_000, max: 300_000, default: 30_000 },
    /** Consecutive failed writes after which a recorder stops retrying. */
    maxConsecutiveFailures: 3,
    /** How many distinct run ids one recorder keeps event rows for. */
    rememberedRuns: 4,
    /**
     * Upper bound on the wait for the unload checkpoint. A disposer must finish;
     * an abandoned write is dropped (it never retries and starts no timer).
     */
    unloadWriteTimeoutMs: 3_000,
    /** A checkpoint younger than this is treated as possibly still live. */
    resumeStaleAfterMs: 120_000,
};
/**
 * The only roles a checkpoint may name: the four the plugin already runs.
 *
 * Wiring records child calls from the report's route trail, so this list is a
 * guard, not a taxonomy: a route entry with any other role is dropped instead of
 * being recorded under an invented name (AGENTS.md: no new agent role).
 */
export const HOST_ROLES = ['planner', 'worker', 'verifier', 'synthesizer'];
/** Whether a value is one of {@link HOST_ROLES}. */
export function isHostRole(value) {
    return typeof value === 'string' && HOST_ROLES.includes(value);
}
/**
 * Resolve the checkpoint directory.
 *
 * Same three-step rule as the memory archive (`src/memory/archive.ts`
 * `archiveDir`), for the same reason: a test, an e2e lane and a real operator all
 * need to point checkpoints at a scratch directory without a config key, and the
 * suite must never write into an operator's real `$DSH_HOME`.
 * @param options - caller options; `dir` wins over the environment.
 * @returns The absolute checkpoint directory.
 */
export function checkpointDir(options = {}) {
    if (options.dir !== undefined && options.dir.trim() !== '')
        return options.dir;
    const override = process.env.GROK_WORKFLOW_CHECKPOINT_DIR;
    if (override !== undefined && override.trim() !== '')
        return override;
    const home = process.env.DSH_HOME;
    const base = home !== undefined && home.trim() !== '' ? home : join(homedir(), '.dsh');
    return join(base, 'checkpoints', 'grok-workflow');
}
/** Path of one run's checkpoint file. One file per run, atomically replaced. */
export function checkpointFile(runId, options = {}) {
    return join(checkpointDir(options), checkpointFileName(runId));
}
/* ------------------------------------------------------------------ *
 * Host-visible vocabulary mapping
 * ------------------------------------------------------------------ */
const PHASE_KINDS = ['plan', 'execute', 'verify', 'synthesize', 'answer'];
/**
 * Map a script phase *title* (what `phase()` actually emits) to a checkpoint
 * phase, or `undefined` when the title is not one of this plugin's own labels.
 *
 * Both shipping languages are accepted because the title carries the localized
 * copy (`src/naming.ts` `phaseLabel`), and the bare English kind is accepted
 * because that is what the script source uses. An unrecognized title is dropped:
 * a stage row is evidence, and inventing one would make the file lie.
 * @param title - the `workflow/phase` title, verbatim.
 * @returns The matching checkpoint phase, or `undefined`.
 */
export function phaseFromTitle(title) {
    if (typeof title !== 'string')
        return undefined;
    const trimmed = title.trim();
    if (trimmed === '')
        return undefined;
    const lower = trimmed.toLowerCase();
    for (const kind of PHASE_KINDS) {
        if (lower === kind)
            return kind;
        if (trimmed === phaseLabel(kind, 'zh') || trimmed === phaseLabel(kind, 'en'))
            return kind;
    }
    return undefined;
}
/**
 * Decide what a host should do with one checkpoint.
 *
 * The engine cannot resume a run (no journaling, no resume — see the module
 * header), so `resume` never means "restore engine state". It means: start a new
 * run carrying `seed` as its context and re-drive `unfinished`, because the
 * verified rows in the file say which work is already done. `wait` is the honest
 * answer for a `running` checkpoint that may still be owned by a live process.
 *
 * Scope: this reads a *run* checkpoint (`grok-workflow.checkpoint/v1`, written by
 * this module) and answers "should a host re-drive this run?". It is not the
 * restore policy in `src/resume/policy.ts`, which consumes a
 * `grok-workflow.resume-checkpoint` and decides task by task what may be retained
 * verbatim; the two answer different questions over different artifacts.
 * @param checkpoint - a verified checkpoint (as returned by `readCheckpoint`).
 * @param options - clock and staleness overrides.
 * @returns The decision, its reason, and the task ids a resume would re-drive.
 */
export function resumeDecision(checkpoint, options = {}) {
    const now = options.now ?? Date.now();
    const staleAfterMs = boundedMs(options.staleAfterMs ?? CHECKPOINT_WIRING_LIMITS.resumeStaleAfterMs);
    const runId = checkpoint.run.runId;
    const unfinished = checkpoint.tasks.filter(task => task.status !== 'verified').map(task => task.id);
    const seed = checkpoint.minContext.digest;
    if (checkpoint.run.status === 'completed') {
        return {
            action: 'none',
            reason: 'the run already completed, so re-driving it would redo verified work',
            runId,
            unfinished: [],
            seed,
        };
    }
    if (checkpoint.run.status === 'running') {
        const ageMs = now - checkpoint.time.updatedAtMs;
        if (ageMs >= 0 && ageMs < staleAfterMs) {
            return {
                action: 'wait',
                reason: `the checkpoint was written ${ageMs} ms ago (below ${staleAfterMs} ms), so the process that owns the run may still be alive`,
                runId,
                unfinished,
                seed,
            };
        }
    }
    if (unfinished.length === 0) {
        if (checkpoint.tasks.length === 0) {
            return {
                action: 'none',
                reason: 'the checkpoint carries no task rows (it was taken before the run produced a report), so a new run has nothing named to re-drive',
                runId,
                unfinished,
                seed,
            };
        }
        return {
            action: 'none',
            reason: `status ${checkpoint.run.status} with every task verified, so there is nothing a new run could add`,
            runId,
            unfinished,
            seed,
        };
    }
    return {
        action: 'resume',
        reason: `${unfinished.length} task(s) were not verified when the checkpoint was taken (status ${checkpoint.run.status}); a new run can re-drive them from the recorded context`,
        runId,
        unfinished,
        seed,
    };
}
/** Clamp a millisecond value into the wiring interval range. */
function boundedMs(value) {
    if (!Number.isFinite(value))
        return CHECKPOINT_WIRING_LIMITS.intervalMs.default;
    return Math.min(CHECKPOINT_WIRING_LIMITS.intervalMs.max, Math.max(CHECKPOINT_WIRING_LIMITS.intervalMs.min, Math.trunc(value)));
}
/**
 * Create the checkpoint recorder for one run.
 *
 * The recorder subscribes to the engine's observe-only events immediately, but
 * attributes every row by the `info.id` in the event payload — so a record whose
 * run is not the adopted one is dropped instead of mis-filed, and no timer or
 * file exists until a run is actually adopted. When `state` is supplied the
 * recorder also joins that instance's unload registry, so
 * `disposeActiveState` can write one `cancelled` checkpoint per live run.
 * @param options - identity, location, limits and test seams.
 * @returns The recorder.
 */
export function createCheckpointRecorder(options) {
    const clock = options.now ?? (() => Date.now());
    const schedule = options.schedule ?? ((fn, ms) => setInterval(fn, ms));
    const cancelSchedule = options.cancelSchedule ?? ((handle) => { clearInterval(handle); });
    const logger = options.logger ?? { warn: () => { } };
    const directoryOptions = options.directory === undefined ? {} : { dir: options.directory };
    const limits = {
        maxConcurrency: nonNegative(options.limits?.maxConcurrency ?? 0),
        maxRetries: nonNegative(options.limits?.maxRetries ?? 0),
        maxTasks: Math.max(1, nonNegative(options.limits?.maxTasks ?? 1)),
        ...options.limits?.timeoutMs === undefined ? {} : { timeoutMs: nonNegative(options.limits.timeoutMs) },
    };
    const intervalMs = boundedInterval(options.intervalMs ?? CHECKPOINT_WIRING_LIMITS.intervalMs.default);
    /**
     * The run's deadline, but only when the record can express it.
     *
     * `CHECKPOINT_LIMITS.countCeiling` bounds every recorded count to 1,000,000 —
     * about 16m40s of milliseconds — while the plugin accepts deadlines up to a
     * week (`HARD_LIMITS.timeoutMs` in src/config.ts). A deadline above the ceiling
     * is *omitted*, never clamped: writing `deadlineMs: 1000000` for a week-long
     * run would be a number that describes no real bound. The same value gates
     * `time.deadlineAtMs` and the derived `watchdog.deadlineHit`, so an
     * unrepresentable deadline simply leaves those fields absent rather than
     * pretending the run has no deadline.
     */
    const recordableTimeoutMs = limits.timeoutMs !== undefined
        && limits.timeoutMs >= 1
        && limits.timeoutMs <= CHECKPOINT_LIMITS.countCeiling
        ? limits.timeoutMs
        : undefined;
    const recordedLimits = {
        ...limits,
        ...recordableTimeoutMs === undefined ? {} : { timeoutMs: recordableTimeoutMs },
    };
    if (recordableTimeoutMs === undefined)
        delete recordedLimits.timeoutMs;
    const wiring = {
        startedAtMs: options.startedAtMs ?? clock(),
        intervalMs,
        disposed: false,
        writes: 0,
        failures: 0,
        listeners: [],
        stages: new Map(),
        agents: new Map(),
    };
    /* ---------------------------------------------------------- helpers -- */
    const deadlineAtMs = () => {
        if (recordableTimeoutMs === undefined)
            return undefined;
        return wiring.startedAtMs + recordableTimeoutMs;
    };
    const runIdOf = (info) => {
        if (typeof info !== 'object' || info === null)
            return '';
        const raw = info.id;
        if (typeof raw === 'string')
            return raw.trim();
        if (typeof raw === 'number' && Number.isFinite(raw))
            return String(raw);
        return '';
    };
    /** Stage rows for one run, created on demand and bounded. */
    const stagesOf = (runId) => {
        const existing = wiring.stages.get(runId);
        if (existing !== undefined)
            return existing;
        if (wiring.stages.size >= CHECKPOINT_WIRING_LIMITS.rememberedRuns) {
            // Drop the oldest remembered run rather than grow without bound; the
            // adopted run is always re-creatable from its own next event.
            const oldest = wiring.stages.keys().next();
            if (!oldest.done)
                wiring.stages.delete(oldest.value);
        }
        const created = [];
        wiring.stages.set(runId, created);
        return created;
    };
    /** Child counters for one run, bounded the same way. */
    const agentsOf = (runId) => {
        const existing = wiring.agents.get(runId);
        if (existing !== undefined)
            return existing;
        const created = { started: 0, failed: 0, cancelled: 0 };
        if (wiring.agents.size >= CHECKPOINT_WIRING_LIMITS.rememberedRuns) {
            const oldest = wiring.agents.keys().next();
            if (!oldest.done)
                wiring.agents.delete(oldest.value);
        }
        wiring.agents.set(runId, created);
        return created;
    };
    /** Close the last open stage row: the script moved on or the run settled. */
    const closeOpenStage = (runId, status, at, error) => {
        const rows = wiring.stages.get(runId);
        if (rows === undefined || rows.length === 0)
            return;
        const last = rows[rows.length - 1];
        if (last === undefined || last.endedAtMs !== undefined)
            return;
        last.endedAtMs = at;
        last.status = status;
        if (error !== undefined)
            last.error = error;
    };
    /* ------------------------------------------------------------ events -- */
    const notePhase = (info, title) => {
        const runId = runIdOf(info);
        if (runId === '')
            return;
        if (wiring.runId !== undefined && runId !== wiring.runId)
            return;
        const phase = phaseFromTitle(title);
        if (phase === undefined)
            return;
        const rows = stagesOf(runId);
        if (rows.some(row => row.phase === phase))
            return;
        const at = clock();
        closeOpenStage(runId, 'completed', at);
        if (rows.length >= CHECKPOINT_LIMITS.maxStages)
            return;
        rows.push({ phase, status: 'running', startedAtMs: at });
    };
    const noteAgent = (info, settled, outcome) => {
        const runId = runIdOf(info);
        if (runId === '')
            return;
        if (wiring.runId !== undefined && runId !== wiring.runId)
            return;
        const counters = agentsOf(runId);
        if (settled) {
            if (outcome === 'failed')
                counters.failed += 1;
            else if (outcome === 'cancelled')
                counters.cancelled += 1;
            return;
        }
        counters.started += 1;
    };
    const noteEnd = (info, result) => {
        const runId = runIdOf(info);
        if (runId === '')
            return;
        if (wiring.runId !== undefined && runId !== wiring.runId)
            return;
        const stopReason = typeof result === 'object' && result !== null ? result.stopReason : undefined;
        const error = typeof result === 'object' && result !== null ? result.error : undefined;
        if (stopReason === 'cancelled' && wiring.cancelReason === undefined) {
            wiring.cancelReason = 'the engine reported the run cancelled';
        }
        const status = stopReason === 'completed' ? 'completed' : stopReason === 'cancelled' ? 'cancelled' : 'failed';
        closeOpenStage(runId, status, clock(), typeof error === 'string' && error !== '' ? error : undefined);
    };
    const subscribe = () => {
        const source = options.eventSource;
        const on = source === undefined ? undefined : source.on;
        if (typeof on !== 'function')
            return;
        const bind = (name, listener) => {
            try {
                const off = on.call(source, name, listener);
                if (typeof off === 'function')
                    wiring.listeners.push(off);
            }
            catch (error) {
                logger.warn(`checkpoint wiring could not subscribe to ${name}: ${redactError(error)}`);
            }
        };
        bind('workflow/phase', (info, title) => { notePhase(info, title); });
        bind('workflow/agent-start', info => { noteAgent(info, false); });
        bind('workflow/agent-end', (info, agent) => {
            noteAgent(info, true, typeof agent === 'object' && agent !== null ? agent.outcome : undefined);
        });
        bind('workflow/end', (info, result) => { noteEnd(info, result); });
    };
    /* ------------------------------------------------------------ writes -- */
    const statusNow = (at) => {
        if (wiring.unloadedReason !== undefined)
            return 'cancelled';
        if (wiring.report !== undefined)
            return reportStatus(wiring.report.status);
        if (wiring.stopReason === 'cancelled')
            return 'cancelled';
        // A settled stop with no validated report is not a success: the engine may
        // have returned a value this plugin refused (`report-invalid`), and a file
        // that read "completed" there would contradict the report the user saw.
        if (wiring.stopReason !== undefined)
            return 'failed';
        const deadline = deadlineAtMs();
        // A run past its own deadline without a settled report is a failure by the
        // caller's own bound, not a "running" run: the deadline is a host fact.
        if (deadline !== undefined && at >= deadline)
            return 'failed';
        return 'running';
    };
    const watchdogNow = (at) => {
        const deadline = deadlineAtMs();
        const deadlineHit = wiring.deadlineReason !== undefined || (deadline !== undefined && at >= deadline);
        const cancelReason = wiring.unloadedReason !== undefined
            ? wiring.unloadedReason
            : wiring.cancelReason ?? wiring.deadlineReason;
        return {
            deadlineHit,
            cancelled: wiring.unloadedReason !== undefined || wiring.cancelReason !== undefined || wiring.stopReason === 'cancelled',
            ...recordableTimeoutMs === undefined ? {} : { deadlineMs: recordableTimeoutMs },
            ...cancelReason === undefined ? {} : { cancelReason },
        };
    };
    const snapshot = () => {
        const runId = wiring.runId;
        if (runId === undefined)
            return undefined;
        const at = clock();
        const report = wiring.report;
        const stages = (wiring.stages.get(runId) ?? []).map(row => ({ ...row }));
        const deadline = deadlineAtMs();
        const git = options.git?.();
        const input = {
            run: {
                runId,
                objective: options.objective,
                status: statusNow(at),
                ...options.sessionId === undefined ? {} : { sessionId: options.sessionId },
                ...wiring.cause === undefined && wiring.unloadedReason === undefined
                    ? {}
                    : { cause: wiring.unloadedReason ?? wiring.cause ?? '' },
            },
            // Before a report exists the plan is genuinely unknown: the planner runs
            // inside the script, so the host has nothing to copy. Saying so beats
            // echoing the requested objective back as if it were a plan.
            plan: report === undefined
                ? { source: 'unavailable', tasks: [] }
                : planFromReport(report),
            stages,
            time: {
                startedAtMs: wiring.startedAtMs,
                updatedAtMs: at,
                // `durationMs` is omitted, never clamped, when it exceeds the schema's
                // ceiling: a clamped number would be a duration this run did not have.
                ...at - wiring.startedAtMs >= 0 && at - wiring.startedAtMs <= CHECKPOINT_LIMITS.countCeiling
                    ? { durationMs: at - wiring.startedAtMs }
                    : {},
                ...deadline === undefined ? {} : { deadlineAtMs: deadline },
            },
            limits: recordedLimits,
            watchdog: watchdogNow(at),
            ...git === undefined ? {} : { git },
        };
        if (report !== undefined) {
            const tasks = tasksFromReport(report);
            input.tasks = tasks;
            input.agents = agentsFromReport(report);
            input.evidence = evidenceFromReport(report);
        }
        if (options.minContextDigest !== undefined && options.minContextDigest.trim() !== '') {
            input.minContext = { objective: options.objective, digest: options.minContextDigest };
        }
        return input;
    };
    const write = async (terminal) => {
        const runId = wiring.runId;
        const input = snapshot();
        if (runId === undefined || input === undefined) {
            return { ok: false, reason: 'not-adopted', detail: 'no engine run has been adopted, so there is nothing to describe', terminal };
        }
        const file = checkpointFile(runId, directoryOptions);
        try {
            const result = await writeCheckpoint(file, input);
            wiring.writes += 1;
            wiring.failures = 0;
            wiring.lastPath = result.path;
            return { ok: true, path: result.path, bytes: result.bytes, checksum: result.checksum, terminal };
        }
        catch (error) {
            wiring.failures += 1;
            const detail = redactError(error);
            const reason = typeof error.reason === 'string' ? String(error.reason) : 'io';
            logger.warn(`checkpoint write failed for run ${runId} (${reason}): ${detail}`);
            return { ok: false, reason, detail, terminal };
        }
    };
    /* ------------------------------------------------------------ timers -- */
    const armTimer = () => {
        if (wiring.disposed || wiring.timer !== undefined)
            return;
        try {
            const handle = schedule(() => { void tick(); }, wiring.intervalMs);
            // A checkpoint must never be the reason a process stays alive.
            const unref = handle?.unref;
            if (typeof unref === 'function')
                unref.call(handle);
            wiring.timer = handle;
        }
        catch (error) {
            logger.warn(`checkpoint timer could not start: ${redactError(error)}`);
        }
    };
    const disarmTimer = () => {
        if (wiring.timer === undefined)
            return;
        const handle = wiring.timer;
        wiring.timer = undefined;
        try {
            cancelSchedule(handle);
        }
        catch (error) {
            logger.warn(`checkpoint timer could not be cleared: ${redactError(error)}`);
        }
    };
    const release = () => {
        if (wiring.disposed)
            return;
        wiring.disposed = true;
        disarmTimer();
        for (const off of wiring.listeners) {
            try {
                off();
            }
            catch {
                // A disposer that throws is already gone; there is nothing to repair.
            }
        }
        wiring.listeners = [];
        if (options.state !== undefined)
            unregisterCheckpointRecorder(options.state, recorder);
    };
    /* ----------------------------------------------------------- actions -- */
    const tick = async () => {
        if (wiring.disposed || wiring.unloadedReason !== undefined)
            return undefined;
        if (wiring.runId === undefined)
            return undefined;
        if (wiring.failures >= CHECKPOINT_WIRING_LIMITS.maxConsecutiveFailures)
            return undefined;
        return write(false);
    };
    const adopt = (run) => {
        if (wiring.disposed)
            return;
        const id = typeof run?.id === 'string' || typeof run?.id === 'number' ? String(run.id).trim() : '';
        if (id === '') {
            // No identity means no filename: dropping the recorder is the honest
            // outcome, and it is silent because nothing was promised yet.
            disarmTimer();
            return;
        }
        if (wiring.runId !== undefined && wiring.runId !== id)
            return;
        wiring.runId = id;
        if (options.state !== undefined)
            registerCheckpointRecorder(options.state, recorder);
        armTimer();
    };
    const finish = async (outcome = {}) => {
        if (wiring.disposed)
            return undefined;
        if (outcome.report !== undefined)
            wiring.report = outcome.report;
        if (outcome.stopReason !== undefined)
            wiring.stopReason = outcome.stopReason;
        if (outcome.cause !== undefined)
            wiring.cause = outcome.cause;
        if (outcome.unloaded === true && wiring.unloadedReason === undefined) {
            wiring.unloadedReason = outcome.cause ?? 'the plugin was unloaded while the run was in flight';
            wiring.unloadedAtMs = clock();
        }
        disarmTimer();
        if (wiring.runId === undefined) {
            // Nothing was ever adopted: there is no checkpoint to write, and a file
            // per attempted run would be noise.
            release();
            return undefined;
        }
        const written = await write(true);
        release();
        return written;
    };
    const unload = async (reason) => {
        if (wiring.disposed)
            return undefined;
        if (wiring.unloadedReason === undefined) {
            wiring.unloadedReason = reason === '' ? 'the plugin was unloaded while the run was in flight' : reason;
            wiring.unloadedAtMs = clock();
        }
        disarmTimer();
        if (wiring.runId === undefined) {
            release();
            return undefined;
        }
        const written = await writeWithin(write(true), CHECKPOINT_WIRING_LIMITS.unloadWriteTimeoutMs, logger);
        release();
        return written;
    };
    const recorder = {
        adopt,
        noteDeadline: (reason) => {
            if (wiring.deadlineReason !== undefined)
                return;
            wiring.deadlineReason = reason === undefined || reason === '' ? 'the run passed its own deadline' : reason;
        },
        noteCancel: (reason) => {
            if (wiring.cancelReason !== undefined)
                return;
            wiring.cancelReason = reason === '' ? 'the run was cancelled by its caller' : reason;
        },
        finish,
        unload,
        tick,
        snapshot,
        dispose: release,
        get stats() {
            const counters = wiring.runId === undefined ? undefined : wiring.agents.get(wiring.runId);
            return {
                ...wiring.runId === undefined ? {} : { runId: wiring.runId },
                disposed: wiring.disposed,
                unloaded: wiring.unloadedReason !== undefined,
                writes: wiring.writes,
                failures: wiring.failures,
                ...wiring.lastPath === undefined ? {} : { lastPath: wiring.lastPath },
                timerArmed: wiring.timer !== undefined,
                listeners: wiring.listeners.length,
                agents: counters === undefined ? { started: 0, failed: 0, cancelled: 0 } : { ...counters },
            };
        },
    };
    subscribe();
    return recorder;
}
/* ------------------------------------------------------------------ *
 * Unload registry
 * ------------------------------------------------------------------ */
/**
 * Recorders registered against one plugin instance, keyed by its `ActiveState`.
 *
 * A `WeakMap` on purpose: the plugin instance is the owner, and an unload that
 * forgets to deregister must not keep a state object (and through it, listeners)
 * alive. Registration happens at `adopt()` — a recorder that never saw a run
 * never joins, so an idle plugin instance holds nothing.
 */
const UNLOAD_REGISTRY = new WeakMap();
/** Join one instance's unload registry. Idempotent. */
export function registerCheckpointRecorder(state, recorder) {
    const existing = UNLOAD_REGISTRY.get(state);
    if (existing === undefined) {
        UNLOAD_REGISTRY.set(state, new Set([recorder]));
        return;
    }
    existing.add(recorder);
}
/** Leave one instance's unload registry. */
export function unregisterCheckpointRecorder(state, recorder) {
    const existing = UNLOAD_REGISTRY.get(state);
    if (existing === undefined)
        return;
    existing.delete(recorder);
    if (existing.size === 0)
        UNLOAD_REGISTRY.delete(state);
}
/** How many recorders are currently registered for an instance (tests/diagnostics). */
export function registeredCheckpointRecorders(state) {
    return UNLOAD_REGISTRY.get(state)?.size ?? 0;
}
/**
 * Write one terminal `cancelled` checkpoint per live run, then release every
 * recorder for this plugin instance.
 *
 * Called from `disposeActiveState` *before* the runs are cancelled, because after
 * the abort there is no longer a live run to describe. Never throws: an
 * unwritable checkpoint must not be able to stop an unload, and the timeout keeps
 * a slow disk from holding the disposer open.
 * @param state - the plugin instance's `ActiveState`.
 * @param cause - how the unload happened, recorded as `run.cause` and `watchdog.cancelReason`.
 * @param logger - optional diagnostics sink.
 * @returns How many recorders were unloaded (0 for an idle plugin).
 */
export async function unloadCheckpointRecorders(state, cause, logger) {
    const registered = UNLOAD_REGISTRY.get(state);
    if (registered === undefined || registered.size === 0)
        return 0;
    const recorders = [...registered];
    UNLOAD_REGISTRY.delete(state);
    let written = 0;
    for (const recorder of recorders) {
        try {
            const outcome = await recorder.unload(cause);
            if (outcome !== undefined && outcome.ok)
                written += 1;
        }
        catch (error) {
            logger?.warn(`checkpoint unload failed: ${redactError(error)}`);
        }
    }
    return written;
}
/* ------------------------------------------------------------------ *
 * Report → checkpoint mapping
 * ------------------------------------------------------------------ */
/** Normalize a report status into the checkpoint vocabulary. */
function reportStatus(status) {
    return status === 'completed' || status === 'partial' || status === 'failed' ? status : 'failed';
}
/** The run's plan, echoed from the report the run actually produced. */
function planFromReport(report) {
    const source = report.plan?.source;
    const normalized = source === 'caller' || source === 'planner' || source === 'fallback' ? source : 'unavailable';
    return {
        source: normalized,
        tasks: report.tasks.slice(0, CHECKPOINT_LIMITS.maxTasks).map(task => ({
            id: task.id,
            title: task.title,
            writesPaths: task.writesPaths,
        })),
    };
}
/** Task rows from the report's own per-task result. */
function tasksFromReport(report) {
    return report.tasks.slice(0, CHECKPOINT_LIMITS.maxTasks).map(task => {
        const status = task.status === 'verified' ? 'verified' : 'failed';
        return {
            id: task.id,
            title: task.title,
            status,
            attempts: Array.isArray(task.attempts) ? task.attempts.length : 0,
            ...task.error === undefined || task.error === '' ? {} : { error: task.error },
        };
    });
}
/**
 * Agent rows from the report's route trail — the only host-side record of child
 * calls that carries a real role.
 *
 * A row with a role outside {@link HOST_ROLES} is dropped: wiring must never
 * invent a fifth role, and a report is untrusted input like any other.
 */
function agentsFromReport(report) {
    const rows = [];
    for (const entry of report.routes.slice(0, CHECKPOINT_LIMITS.maxAgents)) {
        if (!isHostRole(entry.role))
            continue;
        rows.push({
            role: entry.role,
            outcome: entry.outcome === 'ok' ? 'ok' : 'failed',
            ...entry.attempt === undefined ? {} : { attempt: entry.attempt },
            ...entry.route === undefined || entry.route === '' ? {} : { route: entry.route },
            ...entry.failureClass === undefined ? {} : { failureClass: entry.failureClass },
            ...entry.reason === undefined || entry.reason === '' ? {} : { reason: entry.reason },
        });
    }
    return rows;
}
/** Evidence rows from the report's confirmed evidence. */
function evidenceFromReport(report) {
    return report.confirmed.slice(0, CHECKPOINT_LIMITS.maxEvidence).map(row => ({
        taskId: row.taskId,
        criterion: row.criterion,
        claim: row.evidence,
    }));
}
/* ------------------------------------------------------------------ *
 * Small numeric helpers
 * ------------------------------------------------------------------ */
function nonNegative(value) {
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}
function boundedInterval(value) {
    if (!Number.isFinite(value))
        return CHECKPOINT_WIRING_LIMITS.intervalMs.default;
    const truncated = Math.trunc(value);
    return Math.min(CHECKPOINT_WIRING_LIMITS.intervalMs.max, Math.max(CHECKPOINT_WIRING_LIMITS.intervalMs.min, truncated));
}
/**
 * Race one write against a bound.
 *
 * The abandoned promise is left to settle on its own: it holds no timer, retries
 * nothing, and writes at most one bounded file, so dropping it cannot leave
 * ownerless background work behind.
 */
async function writeWithin(work, timeoutMs, logger) {
    let timer;
    const timeout = new Promise(resolve => {
        timer = setTimeout(() => resolve('timeout'), timeoutMs);
        const unref = timer.unref;
        if (typeof unref === 'function')
            unref.call(timer);
    });
    try {
        const raced = await Promise.race([work, timeout]);
        if (raced === 'timeout') {
            logger.warn(`checkpoint unload write exceeded ${timeoutMs} ms and was abandoned`);
            return { ok: false, reason: 'timeout', detail: `write exceeded ${timeoutMs} ms`, terminal: true };
        }
        return raced;
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
//# sourceMappingURL=wiring.js.map