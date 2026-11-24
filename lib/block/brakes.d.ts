/**
 * The block intake's one listener: a narrow observer on `agent/pre-step`.
 *
 * Why it exists: a block's work continues across turns (a foreman dispatches it, a
 * workflow runs it, a later turn closes it), and the only clock the Host gives this
 * plugin is the heartbeat delivery it already schedules for a loop. A block that is
 * waiting on a heartbeat has no other way to say "the beat arrived". So the intake
 * records that fact — and nothing else.
 *
 * Three limits are the whole design:
 *
 * 1. **Off registers nothing.** `enabled !== true` returns a disposer and installs no
 *    listener, so a profile that leaves `blockIntake` off keeps exactly the
 *    `agent/pre-step` chain it had before this module existed.
 * 2. **It never decides.** The handler computes the decision first (`await next()`),
 *    returns that same object, and only then appends the observation. A failure in
 *    the observation is warned about and swallowed, so a full disk cannot refuse a
 *    turn. Nothing here deletes, replaces or reorders another listener.
 * 3. **It writes one narrow file.** `heartbeats.jsonl` in the block ledger directory,
 *    one line per observed heartbeat. It never writes `verdicts.jsonl` (a verdict is
 *    a judgement about work; a heartbeat is not) and it never appends a `blocks.jsonl`
 *    version: a version slot is capped at `BLOCK_INTAKE_LIMITS.versionsPerBlock`, so
 *    charging a heartbeat against it would retire a real block after 20 beats.
 *
 * The observation is what makes "the beat reached a session that still owes work"
 * answerable offline; it is deliberately not a status, a progress figure or a
 * verdict, because none of those is known at delivery time.
 */
import type { BlockLedgerOptions } from './index.js';
/** File name of the heartbeat observations, one line per delivery. */
export declare const HEARTBEATS_FILE: "heartbeats.jsonl";
/**
 * Observations kept per ledger file.
 *
 * A heartbeat is at least an hour apart, so this is a year of beats for one session;
 * the cap exists so a broken Schedule row (a minute-by-minute `rrule`, say) cannot
 * grow the file without bound. Past it the observer stops writing and warns once.
 */
export declare const HEARTBEAT_OBSERVATION_LIMIT = 200;
/** One recorded heartbeat: which session, which blocks still owed work, and when. */
export interface HeartbeatObservation {
    v: 1;
    kind: 'heartbeat';
    sessionId: string;
    /** Row ids of the session's blocks that were still `open` when the beat arrived. */
    blockIds: string[];
    /** ISO timestamp of the observation. */
    at: string;
}
/** Path of the observations: `<ledgerDir>/heartbeats.jsonl`. */
export declare function heartbeatsFile(options?: BlockLedgerOptions): string;
/**
 * Read the observations back.
 *
 * Lenient by design, like the ledger's own readers: a line that does not parse is
 * skipped rather than failing the read, because an observation is evidence, not a
 * gate. A missing file reads as "no observation yet".
 * @param options - ledger directory.
 * @returns The observations in file order.
 */
export declare function readHeartbeatObservations(options?: BlockLedgerOptions): HeartbeatObservation[];
/** Dependencies of the observer. */
export interface HeartbeatBrakeInput {
    /**
     * Host context; only `on` is used.
     *
     * Typed as `unknown` on purpose: cordis's `on` is a generic overload over its own
     * event map, so a structural parameter type cannot name it without importing the
     * whole event table. The runtime check below is what actually guards it.
     */
    ctx: {
        on?: unknown;
    };
    logger: {
        warn(message: string): void;
    };
    /** `true` installs the one listener; anything else installs nothing at all. */
    enabled: boolean;
    options?: {
        /** Ledger directory; defaults to the environment-aware block ledger dir. */
        dir?: string;
        /** Clock override, for tests. */
        now?: () => number;
        /** Observation cap, for tests. */
        limit?: number;
    };
}
/**
 * Install the intake's narrow heartbeat observer.
 *
 * @param input - context, logger, the switch, and optional test seams.
 * @returns The disposer cordis already owns; a no-op when the switch is off.
 */
export declare function installHeartbeatBrakes(input: HeartbeatBrakeInput): () => void;
//# sourceMappingURL=brakes.d.ts.map