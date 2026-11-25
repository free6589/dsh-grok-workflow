/**
 * The block intake's one listener: a narrow observer on `agent/pre-step`.
 *
 * Why it exists: a block's work continues across turns (a dispatcher owns it, a
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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BLOCK_LEDGER_VERSION, blockLedgerDir, canonicalJson, readBlockRows } from './index.js';
import { redactError } from '../redact.js';
/** File name of the heartbeat observations, one line per delivery. */
export const HEARTBEATS_FILE = 'heartbeats.jsonl';
/**
 * Observations kept per ledger file.
 *
 * A heartbeat is at least an hour apart, so this is a year of beats for one session;
 * the cap exists so a broken Schedule row (a minute-by-minute `rrule`, say) cannot
 * grow the file without bound. Past it the observer stops writing and warns once.
 */
export const HEARTBEAT_OBSERVATION_LIMIT = 200;
/** Path of the observations: `<ledgerDir>/heartbeats.jsonl`. */
export function heartbeatsFile(options = {}) {
    return join(blockLedgerDir(options), HEARTBEATS_FILE);
}
/**
 * Read the observations back.
 *
 * Lenient by design, like the ledger's own readers: a line that does not parse is
 * skipped rather than failing the read, because an observation is evidence, not a
 * gate. A missing file reads as "no observation yet".
 * @param options - ledger directory.
 * @returns The observations in file order.
 */
export function readHeartbeatObservations(options = {}) {
    let text;
    try {
        text = readFileSync(heartbeatsFile(options), 'utf8');
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
            if (parsed.v !== 1 || parsed.kind !== 'heartbeat')
                continue;
            if (typeof parsed.sessionId !== 'string' || !Array.isArray(parsed.blockIds))
                continue;
            if (typeof parsed.at !== 'string')
                continue;
            out.push({
                v: 1,
                kind: 'heartbeat',
                sessionId: parsed.sessionId,
                blockIds: parsed.blockIds.filter((id) => typeof id === 'string'),
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
    const file = heartbeatsFile(options);
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
    // One write per observation, never a rewrite of another file: the two ledgers stay
    // byte-identical to what their own writers left.
    writeFileSync(file, body, 'utf8');
}
/**
 * The open blocks of one session, by row id.
 *
 * "Open" is read from the newest version of each row, exactly like `getBlockRow`:
 * a later version that closes a block must not keep it open here. Exported because
 * the narrow heartbeat listener (`src/heartbeat-listen.ts`) asks the same question —
 * one definition, so the two observers cannot disagree about what "owes work" means.
 * @param sessionId - the session the heartbeat arrived in.
 * @param options - ledger directory.
 */
export async function openBlockIds(sessionId, options) {
    const rows = await readBlockRows(options);
    const newest = new Map();
    for (const row of rows) {
        if (row.sessionId !== sessionId)
            continue;
        const seen = newest.get(row.id);
        if (seen === undefined || row.version > seen.version)
            newest.set(row.id, row);
    }
    const open = [];
    for (const [id, row] of newest) {
        if (row.blocks.some(block => block.status === 'open'))
            open.push(id);
    }
    return open.sort();
}
/** True when this batch carries a Host-scheduled delivery. */
function carriesHeartbeat(messages) {
    return messages.some(message => {
        const source = message?.source;
        return source?.kind === 'schedule';
    });
}
/** The session id a dispatch belongs to, spelled exactly like the gate's own id. */
function sessionIdOf(payload) {
    const id = payload.agent?.session?.id;
    const text = id === undefined ? '' : String(id);
    return text === '' ? 'unknown-agent' : text;
}
/**
 * Install the intake's narrow heartbeat observer.
 *
 * @param input - context, logger, the switch, and optional test seams.
 * @returns The disposer cordis already owns; a no-op when the switch is off.
 */
export function installHeartbeatBrakes(input) {
    const { ctx, logger, enabled } = input;
    // Off is inert: not a listener that returns early, but no listener at all, so the
    // registered chain (and therefore every decision) is exactly the pre-feature one.
    if (enabled !== true)
        return () => { };
    const on = ctx.on;
    if (typeof on !== 'function')
        return () => { };
    const options = input.options?.dir === undefined ? {} : { dir: input.options.dir };
    const now = input.options?.now ?? (() => Date.now());
    const limit = input.options?.limit ?? HEARTBEAT_OBSERVATION_LIMIT;
    let warnedFull = false;
    const observe = async (payload) => {
        const messages = Array.isArray(payload.messages) ? payload.messages : [];
        if (!carriesHeartbeat(messages))
            return;
        const sessionId = sessionIdOf(payload);
        const open = await openBlockIds(sessionId, options);
        // No open block means the intake owes nothing for this beat: nothing is written.
        if (open.length === 0)
            return;
        if (readHeartbeatObservations(options).length >= limit) {
            if (!warnedFull) {
                warnedFull = true;
                logger.warn(`block intake: heartbeat observations reached the ${limit}-line cap; no more are recorded`);
            }
            return;
        }
        appendObservation({ v: BLOCK_LEDGER_VERSION, kind: 'heartbeat', sessionId, blockIds: open, at: new Date(now()).toISOString() }, options);
    };
    const handler = async (payload, next) => {
        // The decision is computed and returned untouched, exactly as the chain below
        // produced it; the observation is a side effect that runs afterwards, so it can
        // neither veto a turn nor alter one.
        const decision = await next();
        try {
            await observe(payload);
        }
        catch (error) {
            logger.warn(`block intake: could not record the heartbeat observation: ${redactError(error)}`);
        }
        return decision;
    };
    const dispose = on('agent/pre-step', handler);
    return typeof dispose === 'function' ? dispose : () => { };
}
//# sourceMappingURL=brakes.js.map