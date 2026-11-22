/**
 * Resident parallel supervision for one workflow run (host side).
 *
 * Why this module exists: the pre-existing `supervisor` role is a *serial*
 * stage — one judgement call per task attempt, run after verification and only
 * able to fail the attempt, never to pass it. That stage cannot see a child
 * that never settles: a worker whose `agent()` call hangs keeps the script's
 * worker pool occupied, and the only bound that fires is the run-level
 * deadline (default 60 minutes). This module is the parallel counterpart: one
 * `RunGuardian` per run, created in `runWorkflow` before the engine starts,
 * observing the same `workflow/agent-start` / `workflow/agent-end` events the
 * progress recorder and the memory archiver already consume, judging
 * *liveness* (never quality), and acting only through channels the plugin
 * already owns — cancel a stuck run, record what happened, and let the normal
 * terminal path turn that into an honest report.
 *
 * What it deliberately does NOT do (architecture constraints):
 *
 * - No agent loop of its own: it never calls the engine's `agent()` hook, so
 *   it costs zero model calls and adds no agent role. Child work is still
 *   created only by the generated script through `ctx.workflowEngine`.
 * - No DSH scheduler re-implementation: no timer owns a run, no queue is kept
 *   across runs. The one periodic check is a single `setInterval`, `unref()`ed
 *   so it never keeps the process alive, armed only between `adopt()` and
 *   `finish()`/`dispose()`, exactly like the checkpoint recorder's timer.
 * - Bounded by construction: per-child stall detection is inherited from the
 *   run deadline. A stalled child receives one rescue nudge; the guardian
 *   never cancels the parent run. The workflow's own deadline remains the
 *   final outer bound, and no loop in this module is unbounded.
 * - No ownerless background work: `dispose()` clears the timer, removes the
 *   event listeners, and empties the registry. `disposeActiveState` (plugin
 *   unload) reaches every live guardian through the same instance registry
 *   pattern the checkpoint wiring uses, so an unload cancels/disposes all
 *   supervision with the runs it watches.
 *
 * State source: engine events only. `agent-start` opens a watched child
 * (seq + label + childId + arrival time), `agent-end` settles it by `seq`
 * (later settlements for the same seq are ignored, exactly like the progress
 * recorder's idempotence rule). No session store is read, no child output is
 * inspected, no prompt text is parsed: the guardian judges *whether* children
 * settle, never *what* they said. That is also why the existing supervisor
 * semantics are untouched — quality judgement stays in the script's serial
 * supervisor stage (pass/fail per attempt), while this module only answers
 * "is this child still alive?".
 *
 * Stuck definition (two independent signals, either one fires):
 *
 * - **Timeout**: a child whose `agent-end` has not arrived within the
 *   per-child budget. The budget is derived from the run's own deadline
 *   (`config.timeoutMs`): `min(deadline, CHILD_TIMEOUT_CAP_MS)`, floored at
 *   `CHILD_TIMEOUT_FLOOR_MS`. `0` (unlimited run deadline) arms no timeout,
 *   mirroring `run.ts` — an explicitly unbounded run is not second-guessed.
 * - **Heartbeat loss**: `agent-start` arrived but nothing followed — no
 *   `agent-end`, no further `agent-start` from the same run — for longer than
 *   the heartbeat budget. On the host side the only liveness signal a child
 *   produces is its settlement event, so "no event at all for N ms while at
 *   least one child is open" is the host-observable shape of a stall. The
 *   heartbeat budget equals the timeout budget; the two signals differ only in
 *   what they report, not in when they fire.
 *
 * Handling action and its upper bound: when either signal fires the guardian
 * marks the child as already nudged and records one bounded finding. If a
 * child session and rescue executor are available, it interrupts only that
 * child and sends recovery guidance; otherwise it records an observation.
 * It never calls `run.cancel()`. The one-shot nudge prevents repeated
 * interruptions, while the workflow's own deadline remains the outer safety
 * bound. The guardian never retries, re-plans, or re-drives tasks.
 *
 * Findings are evidence, not verdicts: `finish()` folds them into the
 * terminal report's `errors` list as `{ phase: 'Guardian', category:
 * 'cancelled' }` entries when the run's own report carries none for the
 * timed-out child, so a reader can tell "the work did not finish because a
 * child stalled" apart from "the work was judged and failed". Nothing here
 * changes `status` computation: a run with no verified task is still
 * `failed`, a run with kept work is still `partial`/`failed` by the existing
 * rules in `run.ts`.
 */
import type { WorkflowStopReason } from '@deepseek-ai/dsh-workflow';
import type { WorkflowLogger } from './run.js';
/** Bounds of the guardian. All counts are per run, never global. */
export declare const GUARDIAN_LIMITS: {
    /** Children watched per run (the engine cap is the real bound; this only caps the map). */
    readonly maxChildren: 256;
    /** Findings kept per run. */
    readonly maxFindings: 32;
    /** Label characters kept per finding. */
    readonly labelChars: 160;
    /** Reason characters kept per finding. */
    readonly reasonChars: 400;
    /** Base child timeout when no adjudication route is configured. */
    readonly childTimeoutCapMs: 600000;
    /** Lower bound of one child's budget: below this the timer is noise, not signal. */
    readonly childTimeoutFloorMs: 5000;
    /** How often the single periodic check runs. */
    readonly checkIntervalMs: 10000;
    /** Upper bound of one periodic-check wait on unload (the disposer must finish). */
    readonly unloadTimeoutMs: 3000;
};
/** Why the guardian acted on a child. */
export type GuardianSignal = 'timeout' | 'heartbeat-loss';
/** One guardian action, kept as evidence for the terminal report. */
export interface GuardianFinding {
    /** Engine `seq` of the child that stalled. */
    seq: number;
    /** Child label as the engine reported it, bounded. */
    label: string;
    /** Which liveness signal fired. */
    signal: GuardianSignal;
    /** What the guardian did: steer the child, or record an observation if it cannot. */
    action: 'observe' | 'rescue';
    /** Human-readable reason, bounded and redacted. */
    reason: string;
    /** Epoch milliseconds at which the signal fired. */
    atMs: number;
}
/** Terminal outcome of one guarded run, for the caller that settles the report. */
export interface GuardianSettlement {
    /** Findings recorded over the run's lifetime (possibly empty). */
    findings: GuardianFinding[];
    /** Always false: liveness detection never cancels the workflow. */
    cancelled: boolean;
}
/** The run handle the guardian may cancel (structural subset of `WorkflowRun`). */
export interface GuardianRunHandle {
    readonly id: string;
    cancel(reason?: string): void;
}
/** One declared write path with the freshest change the host has seen. */
export interface FileHeartbeat {
    /** The declared path that moved, verbatim. */
    path: string;
    /** Epoch milliseconds of the freshest change observed. */
    atMs: number;
}
/** Read the freshest change among a child's declared write paths, if any. */
export type FileHeartbeatReader = (writesPaths: readonly string[]) => FileHeartbeat | undefined;
/** What the child's own session says about its open turn (timestamps only). */
export interface SessionHeartbeat {
    /** Epoch milliseconds of the freshest turn activity observed. */
    atMs: number;
}
/**
 * Read one child's session liveness by its engine child id.
 * Returns the freshest turn timestamp, or `undefined` when the child session
 * cannot be read (released, unregistered key, no open turn). Only timestamps
 * travel — never message content. A reader that throws reads as "no signal".
 */
export type SessionHeartbeatReader = (childId: string) => SessionHeartbeat | undefined;
/** Options for one guardian. Every field is optional except identity. */
export interface GuardianOptions {
    /**
     * Run id this guardian watches (the engine's `info.id`).
     *
     * May be `''` when the engine has not handed back a run yet: the guardian
     * buffers `agent-start`/`agent-end` rows by their `info.id` (like the
     * progress recorder's pre-adoption buffer) and `adopt()` binds the run id
     * from the live handle. A guardian created with a concrete id only watches
     * that id.
     */
    runId: string;
    /** Per-child stall budget in milliseconds (0/negative = disarmed). */
    childBudgetMs: number;
    /** Clock seam. Defaults to `Date.now`. */
    now?: () => number;
    /** Timer seam. Defaults to `setInterval`/`clearInterval`. */
    schedule?: (fn: () => void, ms: number) => unknown;
    cancelSchedule?: (handle: unknown) => void;
    logger?: WorkflowLogger;
    /** Plugin instance state, for the unload registry. */
    state?: object;
    /**
     * File-heartbeat reader (B2): given a child's task-declared write paths,
     * return the freshest change seen, or `undefined` when nothing moved.
     * A reader that throws is treated as "no signal" — never as a verdict.
     * Absent means no task declared paths, and the old budget-only rule holds.
     */
    fileHeartbeat?: FileHeartbeatReader;
    /**
     * Rebuild a child's declared write paths from its phase header (B2 host
     * leg): the engine forwards only `{seq,label,phase,childId}`, so a path
     * the script knew cannot ride the event. The host maps phase `任务 n` back
     * to the caller plan's nth task. Absent (planner-built plans) means no
     * child carries paths and the old rule holds.
     */
    writesPathsForPhase?: (phase: string) => string[];
    /**
     * Session-heartbeat reader (C1): given the engine child id, return the
     * freshest turn timestamp from the child's own session, or `undefined`
     * when it cannot be read. Fresh (within budget) means the child is talking
     * — it stays alive regardless of files or narration. Stale or unreadable
     * degrades to the older signals, never to a false alive.
     */
    sessionHeartbeat?: SessionHeartbeatReader;
    /**
     * Rescue executor (C3): interrupt the child and deliver the adjudicator's
     * guidance. Called once per `guardian rescue` log line the script emits;
     * unlimited by design (per operator decision) — each call appends one
     * `rescue` finding, so the spend is auditable in the terminal report.
     * A callback that throws is contained as a warning, never as a failed run.
     */
    rescue?: (childId: string, guidance: string) => void;
    /** Called after a bounded finding is stored; failures are contained and never affect the run. */
    onFinding?: (finding: GuardianFinding) => void;
}
/** Derive one child's stall budget from the run's own deadline. */
export declare function guardianChildBudgetMs(timeoutMs: number, childTimeoutMs?: number): number;
/**
 * Create the resident guardian for one run.
 *
 * The guardian subscribes to the engine's observe-only `workflow/*` events
 * immediately (so the first `agent-start` cannot be missed), but attributes
 * every row by `info.id`: events for any other run are ignored. It arms one
 * `unref()`ed interval only after `adopt()` hands it the live run handle, and
 * it disarms everything on `finish()`/`dispose()`. Cancelling happens at most
 * once; every later firing only appends a bounded finding.
 */
export declare function createRunGuardian(options: GuardianOptions): RunGuardian;
/** The live guardian for one run. Every method is safe to call and never throws. */
export interface RunGuardian {
    /** Engine run id this guardian watches. */
    readonly runId: string;
    /** Findings recorded so far (a copy). */
    readonly findings: GuardianFinding[];
    /** Always false: liveness detection never cancels the workflow. */
    readonly cancelled: boolean;
    /** Adopt the live run handle; arms the single periodic check. Idempotent. */
    adopt(handle: GuardianRunHandle): void;
    /** Observe one `workflow/agent-start` event. */
    agentStart(info: unknown, member?: unknown): void;
    /** Observe one `workflow/agent-end` event. */
    agentEnd(info: unknown, member?: unknown): void;
    /** Observe the run's terminal event. */
    runEnd(info: unknown): void;
    /**
     * Observe one run-level narration (`workflow/phase` or `workflow/log`).
     * A narrating run is a progressing run: it downgrades a quiet child from
     * heartbeat-loss to its own timeout, and never marks a child alive by
     * itself. Never throws.
     */
    runHeartbeat(info: unknown, at?: number): void;
    /**
     * Observe one `guardian rescue` log line from the script. Parses the seq
     * and guidance, interrupts that child and delivers the guidance through
     * the injected executor. Unknown seq, settled child, missing guidance or
     * executor, and throwing executor are all contained — never the run.
     * Lines arriving before adoption are buffered and replayed on adopt.
     */
    noteRescue(info: unknown, message: unknown): void;
    /** Run one liveness sweep now; returns the findings so far. */
    check(now?: number): GuardianFinding[];
    /** Settle the guardian and release everything; returns the terminal settlement. */
    finish(stop?: WorkflowStopReason): GuardianSettlement;
    /** Release the timer, listeners and registry entry without settling. */
    dispose(): void;
    /** Diagnostics snapshot (tests and logs). */
    readonly stats: {
        runId: string;
        armed: boolean;
        budgetMs: number;
        children: number;
        open: number;
        settled: number;
        findings: number;
        cancelled: boolean;
        timerArmed: boolean;
        listeners: number;
        disposed: boolean;
    };
}
/** Join one instance's guardian registry. Idempotent. */
export declare function registerRunGuardian(state: object, guardian: RunGuardian): void;
/** Leave one instance's guardian registry. */
export declare function unregisterRunGuardian(state: object, guardian: RunGuardian): void;
/** How many guardians are currently registered for an instance (tests/diagnostics). */
export declare function registeredRunGuardians(state: object): number;
/**
 * Dispose every live guardian for this plugin instance.
 *
 * Called from `disposeActiveState` alongside the run cancellation, so no
 * guardian timer or listener outlives the unload. Never throws: a disposal
 * that refuses must not stop the unload. Returns how many guardians were
 * disposed (0 for an idle plugin).
 */
export declare function unloadRunGuardians(state: object): number;
//# sourceMappingURL=guardian.d.ts.map