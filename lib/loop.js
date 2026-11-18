/**
 * Host-side repeat-run ("loop") service.
 *
 * Why this module exists: `ResolvedConfig` has carried the four repeat-run keys
 * (`loopEnabled` / `loopMaxRounds` / `loopFailStreak` / `loopIntervalMin`) since the
 * settings surface landed, and nothing read them — every message still ran once. This
 * module is the driver those keys were declared for: one durable Host `Schedule` task
 * per session, an RRULE heartbeat whose delivery target is that same session.
 *
 * Ownership, stated once:
 *
 * - DSH's Schedule service owns the durable record, the timer, admission, delivery,
 *   catch-up, and the archive behaviour of session-target tasks. This module starts
 *   no timer of its own and runs no background loop: a heartbeat that is not a
 *   Schedule row does not exist here.
 * - This module owns the three decisions DSH does not make: **who may open** (the
 *   user only), **what rule a loop gets** (an interval floor of one worst-case round,
 *   a `COUNT` round bound), and **what closing means** (the row is deleted, not
 *   paused: a paused row is still a stored heartbeat).
 *
 * The user-only rule is structural, not a permission string. DSH's own management
 * API distinguishes a human caller from an acting Agent by `actorSessionId`: the
 * Remote form omits it, `create(request, actorSessionId)` records the Agent. The same
 * convention is reused here — {@link LoopService.open} refuses any defined actor, so
 * the model-facing tool cannot open a loop on the user's behalf, and the browser
 * switch (which carries no Agent) can.
 *
 * What this module deliberately does **not** do:
 * - It does not run rounds. A heartbeat is one Schedule delivery; the round itself is
 *   the session's normal turn, which the existing gate/workflow path owns.
 * - It does not enforce `loopFailStreak`. A delivery receipt records that the Session
 *   inbox accepted a message, not whether the model's round succeeded, so the host has
 *   no honest failure count to compare. The number is carried into the heartbeat text
 *   as an instruction instead, and this limitation is stated rather than implied.
 */
import { redactError } from './redact.js';
/** Stored task name of every loop heartbeat. Matched exactly, together with the marker. */
export const LOOP_TASK_TITLE = 'Loop heartbeat';
/** First line of every heartbeat prompt; the ownership marker cleanup matches on. */
export const LOOP_PROMPT_PREFIX = '[grok-workflow loop]';
/** Default minutes between heartbeats. Also the hard floor: see {@link loopPolicyFromConfig}. */
export const DEFAULT_LOOP_INTERVAL_MINUTES = 60;
/** Hard ceiling on the interval, so a typo cannot park a loop for a year. */
export const MAX_LOOP_INTERVAL_MINUTES = 7 * 24 * 60;
/** Longest prompt this service accepts; the Schedule task stores it verbatim. */
export const MAX_LOOP_PROMPT_CHARS = 4000;
/** Route the browser switch posts to. One exact path, one POST body. */
export const LOOP_ROUTE_PATH = '/grok-workflow/loop';
/** Model-facing tool name. Registered only when the Host composes Schedule. */
export const LOOP_TOOL_NAME = 'grok_loop';
/** A stated loop failure; `code` is the stable discriminator. */
export class LoopError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'LoopError';
        this.code = code;
    }
}
/** True when the row is a heartbeat this plugin owns. */
export function isLoopTask(task, sessionId) {
    if (task.kind !== 'rrule')
        return false;
    if (task.title !== LOOP_TASK_TITLE)
        return false;
    if (!task.prompt.startsWith(LOOP_PROMPT_PREFIX))
        return false;
    if (sessionId !== undefined && task.target.sessionId !== sessionId)
        return false;
    return true;
}
/**
 * Effective heartbeat interval from the live configuration.
 *
 * A heartbeat that can arrive while the previous round is still running would stack
 * rounds, so the floor is one worst-case round: the configured `timeoutMs`, rounded up
 * to whole minutes. `timeoutMs = 0` means "no deadline", where no honest bound exists;
 * the floor stays {@link DEFAULT_LOOP_INTERVAL_MINUTES}. The configured
 * `loopIntervalMin` can only raise the floor — it is a wait, not a budget — and the
 * result never falls below 60 minutes.
 * @param timeoutMs - configured run deadline in milliseconds; `0` = unlimited.
 * @param intervalMinutes - configured minutes between rounds (`loopIntervalMin`).
 * @param rounds - configured round cap (`loopMaxRounds`).
 * @param failStreak - configured consecutive-failure stop point (`loopFailStreak`).
 * @returns the effective policy, already inside the hard bounds.
 */
export function loopPolicyFromConfig(timeoutMs, intervalMinutes, rounds, failStreak) {
    const worstRoundMinutes = timeoutMs > 0 ? Math.ceil(timeoutMs / 60_000) : 0;
    const effective = Math.max(DEFAULT_LOOP_INTERVAL_MINUTES, worstRoundMinutes, Math.ceil(intervalMinutes));
    return {
        intervalMinutes: Math.min(effective, MAX_LOOP_INTERVAL_MINUTES),
        rounds: clampInteger(rounds, 1, 1000, 10),
        failStreak: clampInteger(failStreak, 1, 1000, 3),
    };
}
/**
 * Build the two-line rule Schedule stores. `DTSTART` is a whole UTC second so the
 * parser sees a real UTC date-time; the first actual occurrence is one interval after
 * acceptance, because Schedule chooses the first occurrence strictly after creation.
 * @param intervalMinutes - minutes between occurrences.
 * @param rounds - `COUNT` bound; exhaustion leaves the task stored as `ended`.
 * @param now - clock reading in epoch milliseconds.
 * @returns the normalized `DTSTART` + `RRULE` text.
 */
export function loopRrule(intervalMinutes, rounds, now) {
    const start = new Date(Math.ceil(now / 1000) * 1000);
    const stamp = start.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return `DTSTART:${stamp}\nRRULE:FREQ=MINUTELY;INTERVAL=${intervalMinutes};COUNT=${rounds}`;
}
/** Minutes encoded in a stored rule, or `undefined` when it is not this shape. */
export function intervalMinutesOf(rrule) {
    const frequency = /\bFREQ=([A-Z]+)/.exec(rrule)?.[1];
    const interval = Number(/\bINTERVAL=(\d+)/.exec(rrule)?.[1] ?? '1');
    if (!Number.isFinite(interval) || interval <= 0)
        return undefined;
    if (frequency === 'MINUTELY')
        return interval;
    if (frequency === 'HOURLY')
        return interval * 60;
    if (frequency === 'DAILY')
        return interval * 24 * 60;
    return undefined;
}
/** `COUNT` encoded in a stored rule, or `undefined` when the rule is unbounded. */
export function roundsOf(rrule) {
    const count = /\bCOUNT=(\d+)/.exec(rrule)?.[1];
    const value = Number(count ?? Number.NaN);
    return Number.isFinite(value) && value > 0 ? value : undefined;
}
/** The default heartbeat text; `failStreak` is guidance, not host-enforced. */
export function defaultLoopPrompt(failStreak) {
    return [
        `${LOOP_PROMPT_PREFIX} Loop heartbeat: the previous round has ended.`,
        "Continue this session's unfinished work from where it stopped; do not redo completed steps.",
        'If the work is finished, report the final result and stop instead of starting anything new.',
        `If the last ${failStreak} rounds failed in a row, stop and report why rather than trying again.`,
    ].join(' ');
}
/** Create the service. The returned object is the only Host surface for a loop. */
export function createLoopService(deps) {
    const now = deps.now ?? Date.now;
    const policy = deps.policy ?? (() => loopPolicyFromConfig(0, 0, 10, 3));
    /** One FIFO for mutations: two concurrent opens cannot mint two rows for one session. */
    let tail = Promise.resolve();
    const serialized = (work) => {
        const next = tail.then(() => work(), () => work());
        tail = next.then(() => undefined, () => undefined);
        return next;
    };
    const schedule = () => {
        const service = deps.schedule();
        if (service === undefined) {
            throw new LoopError('loop/unavailable', 'the Host Schedule service is not composed; a loop heartbeat needs it');
        }
        return service;
    };
    const open = async (request, actorSessionId) => {
        if (actorSessionId !== undefined) {
            throw new LoopError('loop/user-only', "a loop heartbeat can be opened only by the user from the composer switch; an agent cannot open one on the user's behalf");
        }
        const sessionId = requireSessionId(request.sessionId);
        const current = policy();
        const interval = resolveInterval(request.intervalMinutes, current.intervalMinutes);
        const prompt = request.prompt === undefined
            ? defaultLoopPrompt(current.failStreak)
            : requirePrompt(request.prompt);
        const service = schedule();
        const rrule = loopRrule(interval, current.rounds, now());
        return serialized(async () => {
            const existing = (await service.catalog()).filter(task => isLoopTask(task, sessionId));
            const live = existing.find(task => task.status === 'active');
            // Refreshing an active row keeps its committed anchor when nothing but the
            // descriptive fields changed; a different rule recomputes the next occurrence,
            // which is Schedule's own documented edit behaviour.
            if (live !== undefined) {
                const changed = intervalMinutesOf(live.rrule ?? '') !== interval || roundsOf(live.rrule ?? '') !== current.rounds;
                if (!changed && prompt === live.prompt)
                    return snapshotOf(live, sessionId);
                const updated = await service.edit({
                    id: live.id,
                    action: 'update',
                    patch: {
                        prompt,
                        ...changed ? { timing: { kind: 'rrule', rrule } } : {},
                    },
                });
                return snapshotOf(asTask(updated) ?? live, sessionId);
            }
            // A paused row has no timer obligation; resuming it is cheaper than a new row and
            // keeps the task identity a user may already have seen. An ended row cannot resume
            // without new timing, so it is removed and replaced instead.
            const paused = existing.find(task => task.status === 'paused');
            if (paused !== undefined) {
                const updated = await service.edit({
                    id: paused.id,
                    action: 'update',
                    patch: { prompt, active: true, timing: { kind: 'rrule', rrule } },
                });
                return snapshotOf(asTask(updated) ?? paused, sessionId);
            }
            for (const stale of existing)
                await deleteTask(service, stale.id, deps.logger);
            const created = await service.create({
                title: LOOP_TASK_TITLE,
                prompt,
                timing: { kind: 'rrule', rrule },
                target: { kind: 'session', sessionId },
            });
            deps.logger.info?.(`loop opened for session ${sessionId} (task ${created.id}, every ${interval} min, ${current.rounds} rounds)`);
            return snapshotOf(created, sessionId);
        });
    };
    const close = async (request, _actorSessionId) => {
        const sessionId = requireSessionId(request.sessionId);
        const service = schedule();
        return serialized(async () => {
            const tasks = (await service.catalog()).filter(task => isLoopTask(task, sessionId));
            for (const task of tasks)
                await deleteTask(service, task.id, deps.logger);
            // Read the state back instead of asserting it: a refused delete leaves a live row,
            // and a switch that reported "closed" over a running heartbeat would be lying to
            // the person who flipped it. `deleteTask` already logged the refusal.
            const remaining = (await service.catalog()).filter(task => isLoopTask(task, sessionId));
            const stillStored = remaining.find(task => task.status === 'active') ?? remaining[0];
            if (stillStored !== undefined) {
                deps.logger.warn(`loop close for session ${sessionId} left ${remaining.length} heartbeat${remaining.length === 1 ? '' : 's'} stored`);
                return snapshotOf(stillStored, sessionId);
            }
            if (tasks.length > 0)
                deps.logger.info?.(`loop closed for session ${sessionId} (${tasks.length} task${tasks.length === 1 ? '' : 's'} deleted)`);
            return { open: false, sessionId };
        });
    };
    const status = async (request) => {
        const sessionId = requireSessionId(request.sessionId);
        const service = schedule();
        const tasks = (await service.catalog()).filter(task => isLoopTask(task, sessionId));
        const chosen = tasks.find(task => task.status === 'active') ?? tasks[0];
        return snapshotOf(chosen, sessionId);
    };
    const stopAll = async (reason) => {
        const service = deps.schedule();
        if (service === undefined)
            return 0;
        return serialized(async () => {
            const tasks = (await service.catalog()).filter(task => isLoopTask(task));
            for (const task of tasks)
                await deleteTask(service, task.id, deps.logger);
            // Count what is actually gone, not what was attempted: an unload that reports
            // success over a surviving row would hide the one thing it exists to prevent.
            const left = (await service.catalog()).filter(task => isLoopTask(task)).length;
            const deleted = Math.max(0, tasks.length - left);
            if (deleted > 0)
                deps.logger.info?.(`loop cleanup (${reason}): deleted ${deleted} heartbeat${deleted === 1 ? '' : 's'}`);
            if (left > 0)
                deps.logger.warn(`loop cleanup (${reason}) left ${left} heartbeat${left === 1 ? '' : 's'} stored`);
            return deleted;
        });
    };
    const forgetSession = async (sessionId) => {
        const service = deps.schedule();
        if (service === undefined)
            return 0;
        return serialized(async () => {
            const tasks = (await service.catalog()).filter(task => isLoopTask(task, sessionId));
            for (const task of tasks)
                await deleteTask(service, task.id, deps.logger);
            const left = (await service.catalog()).filter(task => isLoopTask(task, sessionId)).length;
            const deleted = Math.max(0, tasks.length - left);
            if (deleted > 0)
                deps.logger.info?.(`loop archived with session ${sessionId}: deleted ${deleted} heartbeat${deleted === 1 ? '' : 's'}`);
            if (left > 0)
                deps.logger.warn(`loop archive cleanup for session ${sessionId} left ${left} heartbeat${left === 1 ? '' : 's'} stored`);
            return deleted;
        });
    };
    return {
        available: () => deps.schedule() !== undefined,
        open,
        close,
        status,
        stopAll,
        forgetSession,
    };
}
/**
 * Read the Host Schedule service from a context, or `undefined` when the composition
 * has none.
 *
 * The service is looked up rather than injected as a hard dependency: a headless or
 * minimal profile without Schedule must still load this plugin, and its other features
 * (the workflow tool, the gate) do not need a heartbeat. Duck-typed because the
 * service's package is not part of this bundle's dependency graph.
 * @param ctx - context exposing `get(name)` for Cordis services.
 * @returns the three Schedule methods this service calls, when present.
 */
export function scheduleServiceOf(ctx) {
    const candidate = ctx.get?.('schedule');
    if (typeof candidate !== 'object' || candidate === null)
        return undefined;
    const service = candidate;
    if (typeof service.create !== 'function' || typeof service.catalog !== 'function' || typeof service.edit !== 'function') {
        return undefined;
    }
    return candidate;
}
/** Snapshot one stored row; `undefined` means "this session has no loop". */
function snapshotOf(task, sessionId) {
    if (task === undefined)
        return { open: false, sessionId };
    const intervalMinutes = intervalMinutesOf(task.rrule ?? '');
    const rounds = roundsOf(task.rrule ?? '');
    const deliveredAt = task.lastDelivery?.deliveredAt;
    return {
        open: task.status === 'active',
        sessionId,
        taskId: task.id,
        taskStatus: task.status,
        ...intervalMinutes === undefined ? {} : { intervalMinutes },
        ...rounds === undefined ? {} : { rounds },
        ...task.status === 'active' ? { nextAt: task.scheduledAt } : {},
        ...task.createdAt === undefined ? {} : { createdAt: task.createdAt },
        ...deliveredAt === undefined ? {} : { lastDeliveredAt: deliveredAt },
    };
}
/** Narrow a Schedule edit result to a catalog row; misses and conflicts are not rows. */
function asTask(result) {
    if (typeof result !== 'object' || result === null)
        return undefined;
    const candidate = result;
    return typeof candidate.id === 'string' && typeof candidate.status === 'string' && typeof candidate.kind === 'string'
        ? candidate
        : undefined;
}
/** Delete one row, treating "already gone" as success and refusing to hide real errors. */
async function deleteTask(service, id, logger) {
    try {
        await service.edit({ id, action: 'delete' });
    }
    catch (error) {
        // A row another actor removed is the state we wanted; anything else is a real
        // failure and must stay visible instead of being reported as a clean close.
        logger.warn(`could not delete loop heartbeat ${id}: ${redactError(error)}`);
    }
}
/** Resolve the effective interval: the request may raise the floor, never lower it. */
function resolveInterval(requested, floor) {
    if (requested === undefined)
        return floor;
    if (!Number.isInteger(requested) || requested < 1) {
        throw new LoopError('loop/interval', `intervalMinutes must be a whole number of minutes, got ${String(requested)}`);
    }
    const effective = Math.max(floor, requested);
    if (effective > MAX_LOOP_INTERVAL_MINUTES) {
        throw new LoopError('loop/interval', `intervalMinutes must be at most ${MAX_LOOP_INTERVAL_MINUTES}`);
    }
    return effective;
}
/** Accept only an opaque, bounded Session id; Schedule decides whether it exists. */
function requireSessionId(value) {
    if (typeof value !== 'string')
        throw new LoopError('loop/session', 'sessionId is required');
    const trimmed = value.trim();
    if (trimmed === '' || trimmed.length > 128 || /[\s\p{Cc}]/u.test(trimmed)) {
        throw new LoopError('loop/session', 'sessionId is not a usable Session id');
    }
    return trimmed;
}
/** Accept only a non-empty, bounded prompt. */
function requirePrompt(value) {
    if (typeof value !== 'string')
        throw new LoopError('loop/prompt', 'prompt must be a string');
    const trimmed = value.trim();
    if (trimmed === '')
        throw new LoopError('loop/prompt', 'prompt must not be empty');
    if (trimmed.length > MAX_LOOP_PROMPT_CHARS) {
        throw new LoopError('loop/prompt', `prompt must be at most ${MAX_LOOP_PROMPT_CHARS} characters`);
    }
    return trimmed;
}
/** Clamp a configured integer into a hard range without trusting its stored type. */
function clampInteger(value, min, max, fallback) {
    if (!Number.isFinite(value))
        return fallback;
    return Math.min(max, Math.max(min, Math.trunc(value)));
}
//# sourceMappingURL=loop.js.map