/**
 * The intake's own listener on `agent/pre-step`.
 *
 * Why a second listener at all: the old front desk (`src/gate.ts`) owns both the
 * admission decision and the loop's brakes, and a block's work outlives the turn that
 * started it. The only clock the Host gives this plugin is a scheduled delivery, so the
 * intake needs its own view of that delivery on its own registration — one that
 * survives the front desk being switched off (`legacyGate: false`).
 *
 * Why it coexists instead of taking over: every existing profile runs the old chain,
 * and "the beat reached a session that still owes work" is an observation, not a
 * decision. With `ownsRouting: false` the handler computes nothing, changes nothing and
 * appends one line. Only `ownsRouting: true` — the shape where `installGate` is not
 * registered at all — reviews the brakes itself, and then it is the single owner of a
 * heartbeat's fate. `src/index.ts` never installs both shapes in one load.
 *
 * Why its own file: `src/block/brakes.ts` already records a heartbeat, into
 * `heartbeats.jsonl`. Writing to the same name would put two lines under one beat and
 * make "how many beats arrived" unanswerable, so this listener owns
 * `heartbeats-listen.jsonl` and never touches the intake's ledger, its verdicts or the
 * brakes' file.
 *
 * One beat, one line: the outcome says what the beat did (`observed` when this
 * listener only watched, `continued`/`stopped` when it routed), never two lines for one
 * delivery.
 */
import type { Session } from '@deepseek-ai/dsh-session';
import type { BlockLedgerOptions } from './block/index.js';
import type { LoopBrakeCode, LoopBrakeInput, LoopBrakePort } from './loop-brakes.js';
import type { ResolvedConfig } from './types.js';
/** File name of this listener's observations, one line per heartbeat. */
export declare const HEARTBEATS_LISTEN_FILE: "heartbeats-listen.jsonl";
/**
 * Observations kept in one file.
 *
 * Same cap and same reason as the intake's own observer: a broken Schedule row must not
 * grow the file without bound. Past it the listener warns once and stops writing.
 */
export declare const HEARTBEAT_LISTEN_LIMIT = 200;
/** What one beat did, as far as this listener is concerned. */
export type HeartbeatListenOutcome = 'observed' | 'continued' | 'stopped';
/** One recorded heartbeat. */
export interface HeartbeatListenObservation {
    v: 1;
    kind: 'heartbeat-listen';
    sessionId: string;
    outcome: HeartbeatListenOutcome;
    /** Brake code, present only when the beat was stopped. */
    code?: string;
    /** ISO timestamp of the observation. */
    at: string;
}
/** Path of the observations: `<ledgerDir>/heartbeats-listen.jsonl`. */
export declare function heartbeatsListenFile(options?: BlockLedgerOptions): string;
/**
 * Read the observations back.
 *
 * Lenient like the ledger's own readers: a line that does not parse is skipped, because
 * an observation is evidence, not a gate. A missing file reads as "no observation yet".
 * @param options - ledger directory.
 * @returns The observations in file order.
 */
export declare function readHeartbeatListenObservations(options?: BlockLedgerOptions): HeartbeatListenObservation[];
/** Payload shape of one `agent/pre-step` dispatch (only the fields read here). */
export interface HeartbeatPayload {
    agent?: {
        session?: Session;
    } | undefined;
    messages?: unknown[] | undefined;
}
/**
 * True when this message is a loop heartbeat delivered by the Host.
 *
 * Two facts have to agree: the delivery source (`schedule`) and the ownership marker
 * this plugin writes into every prompt it creates. Either alone is spoofable — a user
 * can paste the marker, and a scheduled reminder can carry arbitrary text — so the pair
 * is what identifies the heartbeat. Moved here from `src/gate.ts` so the two listeners
 * that can see a beat read one definition; the gate imports this one.
 *
 * It runs on **every** pre-step batch now, not only inside the gate's heartbeat branch,
 * so a malformed element has to read as "not a heartbeat" instead of throwing: a null in
 * the array must not take a turn down.
 * @param message - one message of the batch; null and undefined are tolerated.
 * @returns true only for a scheduled delivery carrying this plugin's marker.
 */
export declare function isHeartbeatMessage(message: HeartbeatMessageLike | null | undefined): boolean;
/** The shape this module reads off one message; everything else is opaque. */
interface HeartbeatMessageLike {
    content?: unknown;
    source?: unknown;
}
/** What one heartbeat's brakes decided, in the shape a caller routes on. */
export type HeartbeatReview = {
    kind: 'pass';
    reason: 'subagent' | 'loop-continuation';
} | {
    kind: 'stop';
    agentId: string;
    code: LoopBrakeCode;
    detail: string;
};
/** Dependencies of one review. */
export interface HeartbeatReviewInput {
    /** The brake port, or `undefined` when no driver is wired. */
    loop?: LoopBrakePort | undefined;
    payload: HeartbeatPayload;
    /**
     * The configuration slice the brakes read.
     *
     * A thunk, not a value: with no port the review returns before it needs one, exactly
     * like the gate code this replaced — a load without a driver must not start reading
     * live configuration it will not use.
     */
    config: () => LoopBrakeInput['config'];
}
/**
 * Review one heartbeat's brakes.
 *
 * The order is the contract and is copied from the gate's heartbeat branch: a delegated
 * child never owns a loop, a load without a driver can only continue, and a tripped
 * brake stops before anything is charged. The caller maps the answer onto its own
 * decision type, so this stays a pure function with no listener and no I/O.
 * @param input - the port, the payload and the configuration reader.
 * @returns `pass` with the gate's own reason label, or `stop` with the brake's code.
 */
export declare function reviewHeartbeat(input: HeartbeatReviewInput): HeartbeatReview;
/** Dependencies of the listener. */
export interface HeartbeatListenInput {
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
    /** `true` installs the listener; anything else installs nothing at all. */
    enabled: boolean;
    /**
     * `true` when the old front desk is not registered, so this listener owns the brakes.
     *
     * It is not a preference: with the gate gone there is no other place a heartbeat can
     * be stopped, and with the gate present a second review would charge a round twice.
     */
    ownsRouting: boolean;
    /** The brake port; required in the owning shape, unused otherwise. */
    loop?: LoopBrakePort | undefined;
    /** Load-time configuration, and the live reader the brakes fall back to. */
    config: ResolvedConfig;
    readConfig?: (() => ResolvedConfig) | undefined;
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
 * Install the intake's heartbeat listener.
 *
 * @param input - context, logger, the two switches and optional test seams.
 * @returns The disposer cordis already owns; a no-op when the switch is off.
 */
export declare function installHeartbeatListen(input: HeartbeatListenInput): () => void;
export {};
//# sourceMappingURL=heartbeat-listen.d.ts.map