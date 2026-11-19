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
 *
 * **Two heartbeats, one shape.** This repository also runs an *Iterate* heartbeat (the
 * RSI self-iteration loop): a second instance of this service (`src/index.ts`), bound to
 * its own slot (`{@link ITERATE_TASK_TITLE}`) and its own route, whose stored prompt is
 * the operator-editable `iterateTemplate`. Both deliveries arrive as
 * `source.kind === 'schedule'`, so identity is all that keeps them apart, and it is split
 * deliberately into two predicates with two different jobs:
 *
 * - {@link isLoopHeartbeat} — the *routing* identity, read from prompt text by the gate.
 *   It matches this plugin's marker and nothing else, which is why an Iterate delivery
 *   takes the generic non-user pass and is never charged to a loop or stopped by a brake.
 * - {@link isLoopSlot} — the *storage* identity, read from a Schedule row. It matches the
 *   reserved task name, which is what close/archive/unload act on; a prompt is editable
 *   text (DSH's own `schedule_edit` accepts `prompt`), so a row whose marker was edited
 *   away is still this plugin's slot even though it no longer routes as a heartbeat.
 *   Each instance binds it to its own title (`slotOf`), never to another heartbeat's.
 *
 * Neither identity may match the other heartbeat's task, in either direction.
 * `test/heartbeat-identity.spec.ts` pins that against the real `.rsi/HEARTBEAT.md`
 * template, and `docs/knowledge/HEARTBEATS.md` records the audit behind it.
 */
import type { WorkflowLogger } from './run.js';
/**
 * Stored task name of every loop heartbeat: this plugin's reserved Schedule slot.
 *
 * Matched exactly, and used for two different questions — is this row ours to delete
 * ({@link isLoopSlot}), and does this row still route as a heartbeat ({@link isLoopTask}).
 * The name is reserved: another Schedule task under the same name, in a session this
 * plugin drives, is treated as this plugin's slot.
 */
export declare const LOOP_TASK_TITLE = "Loop heartbeat";
/**
 * First line of every loop heartbeat prompt: the *routing* marker the gate matches on.
 *
 * Cleanup does not use it — that is {@link isLoopSlot}'s job — because the prompt is
 * editable text.
 */
export declare const LOOP_PROMPT_PREFIX = "[grok-workflow loop]";
/**
 * True when this text is a heartbeat this plugin wrote.
 *
 * The marker is the only identity a `pre-step` listener has: the delivered message
 * carries the prompt text and `source.kind`, not the Schedule row that produced it.
 * A replacement prompt that drops the marker therefore also drops continuation
 * routing — the marker is the ownership marker, not a decoration.
 *
 * DSH wraps a delivered prompt in its own framing (`[SCHEDULE REMINDER] …`
 * `reminder_prompt_json: "<the stored prompt>"`, measured live in round 17), so
 * the marker survives inside that quoted field rather than at the start of the
 * delivered text. Both shapes are accepted; the caller still pairs this with
 * `source.kind === 'schedule'` before treating a message as a heartbeat.
 * @param text - message text as the step sees it.
 * @returns true when the text leads with {@link LOOP_PROMPT_PREFIX}, or embeds
 * it as a quoted `reminder_prompt_json` value.
 */
export declare function isLoopHeartbeat(text: string): boolean;
/** Default minutes between heartbeats. Also the hard floor: see {@link loopPolicyFromConfig}. */
export declare const DEFAULT_LOOP_INTERVAL_MINUTES = 60;
/** Hard ceiling on the interval, so a typo cannot park a loop for a year. */
export declare const MAX_LOOP_INTERVAL_MINUTES: number;
/** Longest prompt this service accepts; the Schedule task stores it verbatim. */
export declare const MAX_LOOP_PROMPT_CHARS = 4000;
/** Route the browser switch posts to. One exact path, one POST body. */
export declare const LOOP_ROUTE_PATH = "/grok-workflow/loop";
/**
 * Stored task name of the self-iteration heartbeat (`/grok-workflow/iterate`).
 *
 * Deliberately different from {@link LOOP_TASK_TITLE}: the two switches must never
 * adopt or delete each other's row, and the name is the storage identity. This is
 * also the name `docs/knowledge/HEARTBEATS.md` §1 recommends for the operator's own
 * Automation task, so a row the operator armed by hand and one the switch armed are
 * the same slot, not two competing beats.
 */
export declare const ITERATE_TASK_TITLE = "RSI heartbeat";
/** Route the self-iteration switch posts to. */
export declare const ITERATE_ROUTE_PATH = "/grok-workflow/iterate";
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
    /**
     * Which Schedule slot this instance owns. Defaults to the auto-continue loop
     * identity ({@link LOOP_TASK_TITLE} + {@link LOOP_PROMPT_PREFIX}); the
     * self-iteration service passes its own title so the two switches can never
     * adopt, charge or delete each other's row. A prompt prefix of `undefined`
     * means the prompt is free text (the editable template) and is never
     * marker-checked.
     */
    readonly identity?: LoopIdentity;
}
/**
 * The Schedule slot one service instance owns.
 *
 * Storage identity is the reserved task {@link title}; the optional
 * {@link promptPrefix} is the routing marker that keeps a delivery a continuation.
 * The self-iteration heartbeat deliberately has none: its deliveries route as
 * ordinary schedule messages (`docs/knowledge/HEARTBEATS.md` §2), so the gate's
 * dispatcher is never touched by this service.
 */
export interface LoopIdentity {
    readonly title: string;
    readonly promptPrefix?: string;
    /** Prompt used when a request carries none; defaults to the loop's own text. */
    readonly defaultPrompt?: (policy: LoopPolicy) => string;
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
/**
 * True when this row occupies the loop slot: the reserved name, a recurring rule, and
 * (when asked) this session as the delivery target.
 *
 * This is the **storage** identity, and it is deliberately weaker than
 * {@link isLoopTask}: a prompt is editable text, and DSH's own `schedule_edit` accepts a
 * new one. A row whose marker an operator edited away is still the row this plugin
 * opened, so closing, archiving and unloading must still be able to take it away —
 * otherwise a live delivery would keep arriving after the switch said "off". Routing
 * never uses this predicate; {@link isLoopHeartbeat} is the only routing identity.
 * @param task - one Schedule catalog row.
 * @param sessionId - when given, the row must target this session.
 * @returns true when the row is this plugin's slot.
 */
export declare function isLoopSlot(task: LoopScheduleTask, sessionId?: string): boolean;
/**
 * True when the row is a loop heartbeat this plugin wrote: the slot, plus the marker
 * that makes its deliveries route as continuations.
 *
 * Checked as a pair because neither half identifies a heartbeat on its own — a task that
 * merely shares the reserved name does not route here, and a prompt that merely quotes
 * the marker is not this plugin's row. Neither half may match the Iterate task.
 * @param task - one Schedule catalog row.
 * @param sessionId - when given, the row must target this session.
 * @returns true when the row is both this plugin's slot and still marked.
 */
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
 * Build the two-line rule Schedule stores.
 *
 * The anchor matters twice. Schedule commits `scheduledAt = next(now)` — the first
 * occurrence strictly after creation — so the anchor itself is the first beat whenever
 * it is at or behind the clock, while an anchor one interval ahead puts that beat a full
 * interval out. And `COUNT` counts occurrences from the anchor, so an anchor at or
 * behind the clock is already past: it spends one of the `rounds` and silently delivers
 * `rounds - 1` beats. Anchoring one interval ahead of the next whole second satisfies
 * both — every stored occurrence is still to come, and the first beat is never early.
 *
 * The anchor is rounded up rather than down because the wait must never be shorter than
 * the interval: rounding down would put the first beat up to a second early. A whole
 * second is required because the parser rejects a fractional `DTSTART`, so the grid
 * cannot line up with a sub-second clock reading and the first beat may land up to one
 * second late instead of exactly one interval out.
 * @param intervalMinutes - minutes between occurrences.
 * @param rounds - `COUNT` boundary; every occurrence is delivered, then the task ends.
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
/**
 * Delete every heartbeat one identity owns for one session, in one place.
 *
 * Ownership here is the slot (`slot`), not the marker: a row whose prompt was edited
 * away must still be removable, or a brake that stops a loop would leave the very
 * deliveries it exists to prevent.
 *
 * The slot predicate is a parameter because two services share this body with two
 * different slots (`Loop heartbeat` and `RSI heartbeat`). A hard-coded predicate would
 * make the iterate service's archive cleanup delete the *loop's* row and leave its own,
 * which is the one cross-heartbeat write this separation exists to prevent. The default
 * is the loop's own slot, so the brake — which owns only the loop — keeps its meaning
 * without passing anything.
 *
 * Both callers that must leave nothing behind share this body: the archive cleanup on a
 * service, and a brake that stops a loop after the fact. The count is what is actually
 * gone, not what was attempted — a refused delete leaves a live row, and reporting
 * "deleted" over a surviving heartbeat is the one lie this cleanup exists to prevent.
 * @param service - the Host Schedule surface rows live in.
 * @param sessionId - session whose heartbeats go.
 * @param logger - warn sink for a refused delete.
 * @param slot - storage predicate of the identity whose rows go; defaults to the loop slot.
 * @returns how many rows are no longer stored.
 */
export declare function deleteSessionHeartbeats(service: LoopScheduleLike, sessionId: string, logger: WorkflowLogger, slot?: (task: LoopScheduleTask, sessionId?: string) => boolean): Promise<number>;
//# sourceMappingURL=loop.d.ts.map