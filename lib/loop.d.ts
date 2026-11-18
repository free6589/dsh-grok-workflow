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
import type { WorkflowLogger } from './run.js';
/** Stored task name of every loop heartbeat. Matched exactly, together with the marker. */
export declare const LOOP_TASK_TITLE = "Loop heartbeat";
/** First line of every heartbeat prompt; the ownership marker cleanup matches on. */
export declare const LOOP_PROMPT_PREFIX = "[grok-workflow loop]";
/** Default minutes between heartbeats. Also the hard floor: see {@link loopPolicyFromConfig}. */
export declare const DEFAULT_LOOP_INTERVAL_MINUTES = 60;
/** Hard ceiling on the interval, so a typo cannot park a loop for a year. */
export declare const MAX_LOOP_INTERVAL_MINUTES: number;
/** Longest prompt this service accepts; the Schedule task stores it verbatim. */
export declare const MAX_LOOP_PROMPT_CHARS = 4000;
/** Route the browser switch posts to. One exact path, one POST body. */
export declare const LOOP_ROUTE_PATH = "/grok-workflow/loop";
/** Model-facing tool name. Registered only when the Host composes Schedule. */
export declare const LOOP_TOOL_NAME = "grok_loop";
/** Failure kinds this service states. Stable strings, so a UI can branch on them. */
export type LoopErrorCode = 
/** A defined acting Agent tried to open a loop; only the user may. */
'loop/user-only'
/** The session id is missing or not a plausible Session id. */
 | 'loop/session'
/** The requested interval is not a whole number of minutes inside the bounds. */
 | 'loop/interval'
/** The requested prompt is empty or too long. */
 | 'loop/prompt'
/** The Host composition has no Schedule service. */
 | 'loop/unavailable'
/** The request named an action this service does not implement. */
 | 'loop/action'
/** Schedule refused the write (archived target, invalid row, domain failure). */
 | 'loop/schedule-refused';
/** A stated loop failure; `code` is the stable discriminator. */
export declare class LoopError extends Error {
    readonly code: LoopErrorCode;
    constructor(code: LoopErrorCode, message: string);
}
/** Delivery destination as this module reads it back from Schedule. */
export interface LoopScheduleTarget {
    readonly kind: string;
    readonly sessionId?: string;
}
/** The slice of a Schedule catalog entry this module reads. */
export interface LoopScheduleTask {
    readonly id: string;
    readonly title: string;
    readonly prompt: string;
    readonly kind: string;
    /** Normalized two-line DTSTART/RRULE value; present on `kind: 'rrule'` rows. */
    readonly rrule?: string;
    /** Next committed occurrence (UTC) while active, or the final one once ended. */
    readonly scheduledAt: string;
    readonly status: 'active' | 'paused' | 'ended';
    readonly createdAt?: string;
    readonly target: LoopScheduleTarget;
    readonly lastDelivery?: {
        readonly scheduledAt: string;
        readonly deliveredAt: string;
    };
}
/** One `create` request in the shape Schedule accepts. */
export interface LoopScheduleCreate {
    readonly title: string;
    readonly prompt: string;
    readonly timing: {
        readonly kind: 'rrule';
        readonly rrule: string;
    };
    readonly target: {
        readonly kind: 'session';
        readonly sessionId: string;
    };
}
/** One `edit` request in the shape Schedule accepts. */
export type LoopScheduleEdit = {
    readonly id: string;
    readonly action: 'update';
    readonly patch: {
        readonly prompt?: string;
        readonly active?: boolean;
        readonly timing?: {
            readonly kind: 'rrule';
            readonly rrule: string;
        };
    };
} | {
    readonly id: string;
    readonly action: 'delete';
};
/**
 * The two Schedule methods this service needs, typed locally.
 *
 * The plugin ships as an external bundle and does not depend on
 * `@deepseek-ai/dsh-schedule`; a structural interface keeps that true while still
 * documenting exactly which calls the service makes. `catalog()` is the documented
 * unbounded read (management reads never activate a Session), so cleanup does not
 * need to page.
 */
export interface LoopScheduleLike {
    create(request: LoopScheduleCreate, actorSessionId?: string, signal?: AbortSignal): Promise<LoopScheduleTask>;
    catalog(): Promise<LoopScheduleTask[]>;
    edit(request: LoopScheduleEdit, actorSessionId?: string, signal?: AbortSignal): Promise<unknown>;
}
/** An opened loop, as {@link LoopService.status} reports it. */
export interface LoopSnapshot {
    /** True only while the stored task is active (it has a timer obligation). */
    readonly open: boolean;
    readonly sessionId: string;
    readonly taskId?: string;
    /** Interval read back from the stored rule, not from the request. */
    readonly intervalMinutes?: number;
    /** Round bound read back from the stored rule's `COUNT`. */
    readonly rounds?: number;
    /** Next committed occurrence, while the task is active. */
    readonly nextAt?: string;
    readonly taskStatus?: 'active' | 'paused' | 'ended';
    readonly createdAt?: string;
    /** Most recent acknowledged delivery, when the Host saved one. */
    readonly lastDeliveredAt?: string;
}
/** Open request. `sessionId` is the session that receives every heartbeat. */
export interface LoopOpenRequest {
    readonly sessionId: string;
    /** Requested minutes between heartbeats; the effective value is never below the policy floor. */
    readonly intervalMinutes?: number;
    /** Replacement heartbeat text; omitted uses the built-in continuation instruction. */
    readonly prompt?: string;
}
/** Status/close request. */
export interface LoopSessionRequest {
    readonly sessionId: string;
}
/** Effective repeat-run policy, computed from the live configuration at open time. */
export interface LoopPolicy {
    /** Minimum minutes between heartbeats: never below {@link DEFAULT_LOOP_INTERVAL_MINUTES}. */
    readonly intervalMinutes: number;
    /** Round bound stored as the rule's `COUNT`, so exhaustion ends the task in Schedule itself. */
    readonly rounds: number;
    /** Consecutive failed rounds the heartbeat text asks the round to stop after. */
    readonly failStreak: number;
}
/** Dependencies of one service instance. */
export interface LoopServiceDeps {
    /** Live Schedule service lookup; `undefined` when the composition has none. */
    readonly schedule: () => LoopScheduleLike | undefined;
    readonly logger: WorkflowLogger;
    /** Live policy; defaults to the documented defaults when omitted. */
    readonly policy?: () => LoopPolicy;
    /** Clock seam for the RRULE anchor. */
    readonly now?: () => number;
}
/** The one Host-surface object both callers use. */
export interface LoopService {
    /** True when the Host composes Schedule, i.e. when a heartbeat can be stored at all. */
    available(): boolean;
    /**
     * Open (or refresh) the calling session's heartbeat.
     * @param request - session to target, optional interval override and prompt.
     * @param actorSessionId - the acting Agent's session; **must be undefined** for a user.
     * @returns the loop as stored.
     */
    open(request: LoopOpenRequest, actorSessionId?: string): Promise<LoopSnapshot>;
    /**
     * Close a heartbeat and leave nothing behind.
     * @param request - session whose loop should go.
     * @param actorSessionId - optional acting Agent; closing is not user-only.
     * @returns a closed snapshot.
     */
    close(request: LoopSessionRequest, actorSessionId?: string): Promise<LoopSnapshot>;
    /** Read the stored loop for one session without writing. */
    status(request: LoopSessionRequest): Promise<LoopSnapshot>;
    /** Delete every loop heartbeat this plugin owns; used by unload. */
    stopAll(reason: string): Promise<number>;
    /** Delete the loop heartbeat of one session; used by archive. */
    forgetSession(sessionId: string): Promise<number>;
}
/** True when the row is a heartbeat this plugin owns. */
export declare function isLoopTask(task: LoopScheduleTask, sessionId?: string): boolean;
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
export declare function loopPolicyFromConfig(timeoutMs: number, intervalMinutes: number, rounds: number, failStreak: number): LoopPolicy;
/**
 * Build the two-line rule Schedule stores. `DTSTART` is a whole UTC second so the
 * parser sees a real UTC date-time; the first actual occurrence is one interval after
 * acceptance, because Schedule chooses the first occurrence strictly after creation.
 * @param intervalMinutes - minutes between occurrences.
 * @param rounds - `COUNT` bound; exhaustion leaves the task stored as `ended`.
 * @param now - clock reading in epoch milliseconds.
 * @returns the normalized `DTSTART` + `RRULE` text.
 */
export declare function loopRrule(intervalMinutes: number, rounds: number, now: number): string;
/** Minutes encoded in a stored rule, or `undefined` when it is not this shape. */
export declare function intervalMinutesOf(rrule: string): number | undefined;
/** `COUNT` encoded in a stored rule, or `undefined` when the rule is unbounded. */
export declare function roundsOf(rrule: string): number | undefined;
/** The default heartbeat text; `failStreak` is guidance, not host-enforced. */
export declare function defaultLoopPrompt(failStreak: number): string;
/** Create the service. The returned object is the only Host surface for a loop. */
export declare function createLoopService(deps: LoopServiceDeps): LoopService;
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
export declare function scheduleServiceOf(ctx: {
    readonly get?: (name: string) => unknown;
}): LoopScheduleLike | undefined;
//# sourceMappingURL=loop.d.ts.map