/**
 * The heartbeat listener on `agent/pre-step` — the only brake owner since M3.2.
 *
 * Why its own listener at all: a block's work outlives the turn that started it, and the
 * only clock the Host gives this plugin is a scheduled delivery. The old front desk
 * (`src/gate.ts`) used to decide a beat's fate from inside its own branch; since M3.2 it
 * does not route heartbeats at all, so this listener is what reviews the brakes, charges
 * a round, or refuses the step. `src/index.ts` installs it unconditionally, outside the
 * intake's own switch: a profile with the intake off must still have a brake owner, or a
 * stopped loop would keep running with nobody left to stop it.
 *
 * Why its own file: `src/block/brakes.ts` already records a heartbeat, into
 * `heartbeats.jsonl`. Writing to the same name would put two lines under one beat and
 * make "how many beats arrived" unanswerable, so this listener owns
 * `heartbeats-listen.jsonl` and never touches the intake's ledger, its verdicts or the
 * brakes' file.
 *
 * One beat, one line: the outcome says what the beat did — `continued` when the brakes
 * let it run, `stopped` plus the brake code when they did not. `observed` is read but
 * never written: it is the shape this listener had while it only watched the old front
 * desk (M3.1), and `readHeartbeatListenObservations` still returns those lines so an
 * existing file stays readable.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { blockLedgerDir, canonicalJson } from './block/index.js';
import { isLoopHeartbeat } from './loop.js';
import { redactError } from './redact.js';
/** File name of this listener's observations, one line per heartbeat. */
export const HEARTBEATS_LISTEN_FILE = 'heartbeats-listen.jsonl';
/**
 * Observations kept in one file.
 *
 * Same cap and same reason as the intake's own observer: a broken Schedule row must not
 * grow the file without bound. Past it the listener warns once and stops writing.
 */
export const HEARTBEAT_LISTEN_LIMIT = 200;
/** Path of the observations: `<ledgerDir>/heartbeats-listen.jsonl`. */
export function heartbeatsListenFile(options = {}) {
    return join(blockLedgerDir(options), HEARTBEATS_LISTEN_FILE);
}
/** One of the three outcomes, or `undefined` for anything else a line may carry. */
function outcomeOf(value) {
    return value === 'observed' || value === 'continued' || value === 'stopped' ? value : undefined;
}
/**
 * Read the observations back.
 *
 * Lenient like the ledger's own readers: a line that does not parse is skipped, because
 * an observation is evidence, not a gate. A missing file reads as "no observation yet".
 * @param options - ledger directory.
 * @returns The observations in file order.
 */
export function readHeartbeatListenObservations(options = {}) {
    let text;
    try {
        text = readFileSync(heartbeatsListenFile(options), 'utf8');
    }
    catch {
        return [];
    }
    const out = [];
    for (const line of text.split('\n')) {
        if (line.trim() === '')
            continue;
        try {
            const parsed = JSON.parse(line);
            if (parsed.v !== 1 || parsed.kind !== 'heartbeat-listen')
                continue;
            if (typeof parsed.sessionId !== 'string' || typeof parsed.at !== 'string')
                continue;
            const outcome = outcomeOf(parsed.outcome);
            if (outcome === undefined)
                continue;
            out.push({
                v: 1,
                kind: 'heartbeat-listen',
                sessionId: parsed.sessionId,
                outcome,
                ...typeof parsed.code === 'string' ? { code: parsed.code } : {},
                at: parsed.at,
            });
        }
        catch {
            continue;
        }
    }
    return out;
}
/** Append one observation, creating the ledger directory on the first write. */
function appendObservation(observation, options) {
    const file = heartbeatsListenFile(options);
    mkdirSync(dirname(file), { recursive: true });
    const existing = (() => {
        try {
            return readFileSync(file, 'utf8');
        }
        catch {
            return '';
        }
    })();
    const line = canonicalJson(observation);
    const body = existing === '' || existing.endsWith('\n') ? `${existing}${line}\n` : `${existing}\n${line}\n`;
    writeFileSync(file, body, 'utf8');
}
/** Plain text of one message: the parts the heartbeat marker can appear in. */
function messageText(message) {
    const content = message.content;
    if (!Array.isArray(content))
        return '';
    const parts = [];
    for (const part of content) {
        const block = part;
        if (block?.type === 'text' && typeof block.text === 'string')
            parts.push(block.text);
    }
    return parts.join('\n').trim();
}
/**
 * True when this message is a loop heartbeat delivered by the Host.
 *
 * Two facts have to agree: the delivery source (`schedule`) and the ownership marker
 * this plugin writes into every prompt it creates. Either alone is spoofable — a user
 * can paste the marker, and a scheduled reminder can carry arbitrary text — so the pair
 * is what identifies the heartbeat. Moved here from `src/gate.ts` in M3.1 so the two
 * listeners that could then see a beat read one definition; since M3.2 the gate does not
 * route a beat at all, so this is the one reader left.
 *
 * It runs on **every** pre-step batch, not only inside a heartbeat branch, so a
 * malformed element has to read as "not a heartbeat" instead of throwing: a null in
 * the array must not take a turn down.
 * @param message - one message of the batch; null and undefined are tolerated.
 * @returns true only for a scheduled delivery carrying this plugin's marker.
 */
export function isHeartbeatMessage(message) {
    if (message === null || message === undefined)
        return false;
    const source = message.source;
    if (source?.kind !== 'schedule')
        return false;
    return isLoopHeartbeat(messageText(message));
}
/** The session id a dispatch belongs to, spelled exactly like the gate's own id. */
function sessionIdOf(payload) {
    const id = payload.agent?.session?.id;
    const text = id === undefined ? '' : String(id);
    return text === '' ? 'unknown-agent' : text;
}
/** The first heartbeat in the batch, or `undefined` when this is no beat at all. */
function heartbeatOf(payload) {
    const messages = payload.messages;
    if (!Array.isArray(messages))
        return undefined;
    return messages.find(message => isHeartbeatMessage(message));
}
/**
 * Review one heartbeat's brakes.
 *
 * The order is the contract, inherited from the front desk's own heartbeat branch (M3.1)
 * and now the only review on the chain: a delegated child never owns a loop, a load
 * without a driver can only continue, and a tripped brake stops before anything is
 * charged. This stays a pure function with no listener and no I/O, so the one thing that
 * decides a beat's fate is testable without a Host.
 * @param input - the port, the payload and the configuration reader.
 * @returns `pass` with the gate's old reason label, or `stop` with the brake's code.
 */
export function reviewHeartbeat(input) {
    const session = input.payload.agent?.session;
    const header = session?.header;
    // A Schedule targets the session the user opened; a beat inside a child is a
    // mis-targeted delivery, and charging it would put the parent's accounting in the
    // child's log.
    if (header?.origin === 'subagent' || (header?.delegationDepth ?? 0) > 0)
        return { kind: 'pass', reason: 'subagent' };
    const agentId = sessionIdOf(input.payload);
    const loop = input.loop;
    if (loop === undefined)
        return { kind: 'pass', reason: 'loop-continuation' };
    const round = { sessionId: agentId, session, config: input.config() };
    const verdict = loop.review(round);
    if (verdict.kind === 'stop')
        return { kind: 'stop', agentId, code: verdict.code, detail: verdict.detail };
    // Charged before the turn runs: an admitted round consumes a slot and may already have
    // spent quota even if the turn then crashes.
    loop.admit(round);
    return { kind: 'pass', reason: 'loop-continuation' };
}
/**
 * Install the intake's heartbeat listener.
 *
 * @param input - context, logger, the switch and optional test seams.
 * @returns The disposer cordis already owns; a no-op when the switch is off.
 */
export function installHeartbeatListen(input) {
    const { ctx, logger, enabled } = input;
    // Off is inert: not a listener that returns early, but no listener at all, so the
    // registered chain is exactly the pre-feature one.
    if (enabled !== true)
        return () => { };
    if (typeof ctx.on !== 'function')
        return () => { };
    // Called through the context, like the gate's own registration: cordis binds `on` to
    // its receiver, so a destructured call would lose `this` on any context that keeps it.
    const host = ctx;
    const options = input.options?.dir === undefined ? {} : { dir: input.options.dir };
    const now = input.options?.now ?? (() => Date.now());
    const limit = input.options?.limit ?? HEARTBEAT_LISTEN_LIMIT;
    let warnedFull = false;
    /** The live configuration, degrading to the load-time snapshot like the gate does. */
    const scope = () => {
        if (input.readConfig === undefined)
            return input.config;
        try {
            return input.readConfig();
        }
        catch {
            return input.config;
        }
    };
    /** Append one line, or stop at the cap with a single warning. */
    const record = (sessionId, outcome, code) => {
        if (readHeartbeatListenObservations(options).length >= limit) {
            if (!warnedFull) {
                warnedFull = true;
                logger.warn(`heartbeat listener: observations reached the ${limit}-line cap; no more are recorded`);
            }
            return;
        }
        appendObservation({
            v: 1,
            kind: 'heartbeat-listen',
            sessionId,
            outcome,
            ...code === undefined ? {} : { code },
            at: new Date(now()).toISOString(),
        }, options);
    };
    /** Never let evidence-keeping decide a turn: a failed write is warned about and dropped. */
    const tryRecord = (sessionId, outcome, code) => {
        try {
            record(sessionId, outcome, code);
        }
        catch (error) {
            logger.warn(`heartbeat listener: could not record the observation: ${redactError(error)}`);
        }
    };
    /**
     * Whether this batch is a heartbeat, with an unreadable batch counted as "no".
     *
     * The predicate runs on every pre-step now, and this listener must never be the reason
     * a turn fails: a batch it cannot read is warned about and then treated as ordinary,
     * which is the same "warn and continue" rule the rest of the handler follows.
     */
    const isBeat = (payload) => {
        try {
            return heartbeatOf(payload) !== undefined;
        }
        catch (error) {
            logger.warn(`heartbeat listener: could not tell whether this batch is a heartbeat: ${redactError(error)}`);
            return false;
        }
    };
    /**
     * Review the brakes, then route.
     *
     * A failure while reviewing continues the turn (a listener must not veto on its own
     * bug), but a failure *after* a stop verdict still refuses it: the one thing this
     * handler may never do is run a beat the brakes already stopped. The `reject` is
     * returned without calling `next()`, which is why this listener is installed
     * outermost — a beat refused here never reaches the front desk or the intake's own
     * observer.
     */
    const handle = async (payload, next) => {
        if (!isBeat(payload))
            return next();
        let review;
        try {
            review = reviewHeartbeat({ loop: input.loop, payload, config: scope });
        }
        catch (error) {
            logger.warn(`heartbeat listener: the brake review failed, continuing the turn: ${redactError(error)}`);
            return next();
        }
        const sessionId = sessionIdOf(payload);
        if (review.kind === 'stop') {
            tryRecord(sessionId, 'stopped', review.code);
            try {
                await input.loop?.stop({ sessionId, code: review.code, detail: review.detail });
            }
            catch (error) {
                logger.warn(`heartbeat listener: could not delete the stopped loop's schedule: ${redactError(error)}`);
            }
            return { kind: 'reject' };
        }
        tryRecord(sessionId, 'continued');
        return next();
    };
    const dispose = host.on('agent/pre-step', handle);
    return typeof dispose === 'function' ? dispose : () => { };
}
//# sourceMappingURL=heartbeat-listen.js.map