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
import type { RoleName, WorkflowReport } from '../types.js';
import type { CheckpointGit, CheckpointInput, CheckpointLimits, CheckpointPhase, WorkflowCheckpoint } from './schema.js';
/** Wiring's own bounds. They bound the *rate* and *retention* of writes. */
export declare const CHECKPOINT_WIRING_LIMITS: {
    /** Periodic checkpoint interval; clamped into this range at construction. */
    readonly intervalMs: {
        readonly min: 1000;
        readonly max: 300000;
        readonly default: 30000;
    };
    /** Consecutive failed writes after which a recorder stops retrying. */
    readonly maxConsecutiveFailures: 3;
    /** How many distinct run ids one recorder keeps event rows for. */
    readonly rememberedRuns: 4;
    /**
     * Upper bound on the wait for the unload checkpoint. A disposer must finish;
     * an abandoned write is dropped (it never retries and starts no timer).
     */
    readonly unloadWriteTimeoutMs: 3000;
    /** A checkpoint younger than this is treated as possibly still live. */
    readonly resumeStaleAfterMs: 120000;
};
/**
 * The only roles a checkpoint may name: the four the plugin already runs.
 *
 * Wiring records child calls from the report's route trail, so this list is a
 * guard, not a taxonomy: a route entry with any other role is dropped instead of
 * being recorded under an invented name (AGENTS.md: no new agent role).
 */
export declare const HOST_ROLES: readonly ["planner", "worker", "verifier", "synthesizer"];
/** Whether a value is one of {@link HOST_ROLES}. */
export declare function isHostRole(value: unknown): value is RoleName;
/** Caller-supplied location; an explicit `dir` wins over everything else. */
export interface CheckpointDirectoryOptions {
    dir?: string;
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
export declare function checkpointDir(options?: CheckpointDirectoryOptions): string;
/** Path of one run's checkpoint file. One file per run, atomically replaced. */
export declare function checkpointFile(runId: string, options?: CheckpointDirectoryOptions): string;
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
export declare function phaseFromTitle(title: unknown): CheckpointPhase | undefined;
/** What the host should do with a checkpoint it found. */
export type ResumeAction = 'resume' | 'wait' | 'none';
/** The host's answer, with the facts it was derived from. */
export interface ResumeDecision {
    action: ResumeAction;
    /** Why, in the shape a smoke note or a log line can quote verbatim. */
    reason: string;
    runId: string;
    /** Tasks that were not `verified` when the checkpoint was taken. */
    unfinished: string[];
    /** Context a fresh run may carry instead of restoring engine state. */
    seed: string;
}
export interface ResumeOptions {
    now?: number;
    /** Override how recent a `running` checkpoint must be to count as live. */
    staleAfterMs?: number;
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
export declare function resumeDecision(checkpoint: WorkflowCheckpoint, options?: ResumeOptions): ResumeDecision;
/** Minimal logger surface; matches `WorkflowLogger` in `src/run.ts` structurally. */
export interface CheckpointLogger {
    warn(message: string): void;
    info?(message: string): void;
}
/**
 * The observe-only side of a cordis context: `ctx.on(name, listener)` returning
 * a disposer function.
 *
 * Typed loosely on purpose. The concrete context types its events per plugin, and
 * naming them here would either duplicate that surface or force every caller to
 * cast; this module only ever needs "subscribe and get a disposer back", and it
 * contains every failure of that.
 */
export interface CheckpointEventSource {
    on?: unknown;
}
/** The engine run object, reduced to the identity wiring needs. */
export interface CheckpointRunHandle {
    id?: unknown;
    meta?: {
        name?: unknown;
    };
}
/** Successful write. */
export interface CheckpointWriteSuccess {
    ok: true;
    path: string;
    bytes: number;
    checksum: string;
    /** `true` when this write was the run's terminal one. */
    terminal: boolean;
}
/** Refused or failed write; the run continues regardless. */
export interface CheckpointWriteFailure {
    ok: false;
    /** `io`/`too-large`/`invalid`/`integrity` from the writer, or a wiring reason. */
    reason: string;
    detail?: string;
    terminal: boolean;
}
export type CheckpointWriteOutcome = CheckpointWriteSuccess | CheckpointWriteFailure;
/** What the caller knows when a run ends. */
export interface CheckpointFinish {
    /** The report the run produced, when it produced one. */
    report?: WorkflowReport;
    /** Engine stop reason, verbatim (`completed`/`cancelled`/`error`). */
    stopReason?: string;
    /** Cause the caller already classified (unloaded/cancelled/…). */
    cause?: string;
    /** True when the plugin unloaded underneath this run. */
    unloaded?: boolean;
}
/** Host-observed child counts. Diagnostics only; never a schema field. */
export interface CheckpointObservedAgents {
    started: number;
    failed: number;
    cancelled: number;
}
/** The recorder for one run. */
export interface RunCheckpointRecorder {
    /** Adopt the live engine run; starts the periodic timer. Idempotent. */
    adopt(run: CheckpointRunHandle): void;
    /** Record that the caller's deadline fired (host fact, not a child's claim). */
    noteDeadline(reason?: string): void;
    /** Record that the caller cancelled the run. */
    noteCancel(reason: string): void;
    /** Write the terminal checkpoint, then release the timer and listeners. */
    finish(outcome?: CheckpointFinish): Promise<CheckpointWriteOutcome | undefined>;
    /** Write the unload (`cancelled`) checkpoint, then release everything. */
    unload(reason: string): Promise<CheckpointWriteOutcome | undefined>;
    /** One periodic write. Called by the timer; exposed so a test can drive it. */
    tick(): Promise<CheckpointWriteOutcome | undefined>;
    /** The input the next write would use. Read-only snapshot for notes/tests. */
    snapshot(): CheckpointInput | undefined;
    /** Subscribe/dispose bookkeeping, for tests and notes. */
    readonly stats: CheckpointRecorderStats;
    /** Release the timer and every listener. Idempotent, never throws. */
    dispose(): void;
}
/** Observable recorder state. */
export interface CheckpointRecorderStats {
    runId?: string;
    disposed: boolean;
    unloaded: boolean;
    writes: number;
    failures: number;
    lastPath?: string;
    /** Whether a periodic timer is currently armed. */
    timerArmed: boolean;
    /** Engine listeners currently held. */
    listeners: number;
    agents: CheckpointObservedAgents;
}
export interface CheckpointRecorderOptions {
    /** The cordis context, for `workflow/*` subscription only. */
    eventSource?: CheckpointEventSource;
    logger?: CheckpointLogger;
    /** The plugin instance's `ActiveState`; enables the unload registry. */
    state?: object;
    /** Explicit directory (tests, e2e lanes); else the env/`$DSH_HOME` rule. */
    directory?: string;
    /** Periodic interval in milliseconds; clamped to the wiring range. */
    intervalMs?: number;
    /** The run's objective, already redacted by the caller. */
    objective: string;
    sessionId?: string;
    startedAtMs?: number;
    /** Limits the run actually used; recorded as data, never enforced here. */
    limits?: Partial<CheckpointLimits> & {
        maxTotalAgents?: number;
    };
    /** Host-side git facts, only when a caller can actually observe them. */
    git?: () => CheckpointGit | undefined;
    /** Carry-over digest the run was given; recorded as `minContext.source: caller`. */
    minContextDigest?: string;
    /** Clock seam. Defaults to `Date.now`. */
    now?: () => number;
    /** Timer seam. Defaults to `setInterval`/`clearInterval`. */
    schedule?: (fn: () => void, ms: number) => unknown;
    cancelSchedule?: (handle: unknown) => void;
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
export declare function createCheckpointRecorder(options: CheckpointRecorderOptions): RunCheckpointRecorder;
/** Join one instance's unload registry. Idempotent. */
export declare function registerCheckpointRecorder(state: object, recorder: RunCheckpointRecorder): void;
/** Leave one instance's unload registry. */
export declare function unregisterCheckpointRecorder(state: object, recorder: RunCheckpointRecorder): void;
/** How many recorders are currently registered for an instance (tests/diagnostics). */
export declare function registeredCheckpointRecorders(state: object): number;
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
export declare function unloadCheckpointRecorders(state: object, cause: string, logger?: CheckpointLogger): Promise<number>;
//# sourceMappingURL=wiring.d.ts.map