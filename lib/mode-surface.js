/**
 * Host surface of the workflow master switch: the browser button's HTTP route.
 *
 * The switch has exactly one source of truth — the session's own durable mode
 * record (`src/mode.ts`, `plugin:grok-workflow/mode`) — and exactly one reader,
 * `src/gate.ts` `classifyPreStep` (`mode-off`). This module adds the *write* path a
 * composer button needs: a browser request cannot call a slash command, and a
 * second copy of the state (a global file, a profile field) would let the record
 * say `on` while the button says `off`. So the route reads and writes that same
 * record through the same two functions the `/grok` command uses, and answers with
 * the state it read back — never with the state it merely asked for.
 *
 * `status` is the fallback-aware read: with no record written, the effective value
 * is the live `grokDefault === 'on'`, which is the rule the gate applies at
 * `src/gate.ts` (`isModeEnabled(session, grokDefault === 'on')`). The default is
 * therefore never restated here or in the button; both ask this route.
 *
 * Like `src/loop-surface.ts`, the route is optional in a composition (only mounted
 * when `webServer` + `connection` + `sessions` exist) and sits behind the same
 * trust fence: `connection.requestRejection` is the Host/Origin + browser-auth
 * check DSH's shipped routes use, so a cross-site or unauthenticated request is
 * refused before any state is touched.
 */
import { readModeRecord, setMode } from './mode.js';
import { redactError } from './redact.js';
/** Exact Host route of the composer switch. */
export const MODE_ROUTE_PATH = '/grok-workflow/mode';
/** Largest browser body this route accepts; the switch sends two short fields. */
const MAX_BODY_BYTES = 64 * 1024;
/** A body past {@link MAX_BODY_BYTES}; its own answer is 413, not `mode/internal`. */
class BodyTooLarge extends Error {
    constructor() {
        super(`request body exceeds ${MAX_BODY_BYTES} bytes`);
        this.name = 'BodyTooLarge';
    }
}
/** One stated refusal; the HTTP status is derived from the code, never guessed. */
export class ModeError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'ModeError';
        this.code = code;
    }
}
/**
 * Read the effective switch for one session, without writing anything.
 *
 * Two facts, in this order: the record (authoritative when present), then the live
 * fallback. A config that cannot be read is stated only when it is *needed* —
 * with a record in hand the switch is answerable anyway, and failing that read
 * would make a set switch look unset.
 */
export function modeState(deps, session) {
    const record = readModeRecord(session);
    let fallback = null;
    let failure;
    try {
        fallback = deps.fallback();
    }
    catch (error) {
        failure = error;
    }
    if (record === undefined && fallback === null) {
        throw new ModeError('mode/config', `the configuration could not be read: ${redactError(failure)}`);
    }
    return {
        enabled: record === undefined ? fallback : record.enabled,
        source: record === undefined ? 'default' : 'record',
        setBy: record?.setBy ?? null,
        turn: record?.turn ?? null,
        workflowMode: record?.workflowMode ?? null,
        fallback,
    };
}
/**
 * Write the switch and report what the session's own log shows afterwards.
 *
 * The same record shape `/grok` writes (`src/command.ts`): enabling selects the
 * full workflow, disabling carries no shape. `setBy` names this writer so a reader
 * can tell a button click from a typed command. Success is only ever reported for a
 * record read back with exactly the requested value — a session can accept an
 * append without committing it, and a button stuck on a state that was never
 * written is worse than a stated failure.
 */
export function applyMode(deps, session, enabled) {
    const record = {
        v: 1,
        enabled,
        // The route has no acting Agent, so there is no turn to stamp; the field is
        // informational and every reader uses `enabled` only (see `src/mode.ts`).
        turn: 0,
        setBy: 'switch:mode',
        ...enabled ? { workflowMode: 'full' } : {},
    };
    const written = setMode(session, record, deps.logger);
    const current = readModeRecord(session);
    const applied = written.ok
        && current !== undefined
        && current.enabled === enabled
        && current.setBy === 'switch:mode';
    if (!applied) {
        throw new ModeError('mode/write', written.reason ?? 'the session did not record it');
    }
    return modeState(deps, session);
}
/**
 * Mount the route when the composition has the services it needs.
 *
 * Lazy `ctx.inject` keeps the plugin loading unchanged in a headless profile with
 * no web server: no route, no change to any other surface. The registration is
 * installed inside `effect`, so an unload withdraws the route instead of leaving it
 * answering for a plugin that is gone.
 * @param options - Host context plus the live fallback reader.
 */
export function installModeRoute(options) {
    const { ctx } = options;
    if (typeof ctx.inject !== 'function')
        return;
    const inject = ctx.inject;
    inject(['webServer', 'connection', 'sessions'], (child) => {
        const webServer = child.webServer;
        if (webServer === undefined)
            return;
        child.effect?.(() => asDisposer(webServer.register({
            kind: 'exact',
            path: MODE_ROUTE_PATH,
            handler: (req, res) => handleModeRoute({
                sessions: child.sessions ?? ctx.sessions,
                fallback: options.fallback,
                ...child.connection === undefined ? {} : { connection: child.connection },
                ...options.logger === undefined ? {} : { logger: options.logger },
            }, req, res),
        })));
    });
}
/**
 * Answer one browser request.
 *
 * Body: `{ action: 'status' | 'set', sessionId, enabled? }`. `status` only reads;
 * `set` writes and answers the read-back. Deliberately no GET form, so a status
 * read and a toggle share one body shape and the button has one code path.
 *
 * Exported as the production-path test seam: the tests drive this exact handler
 * with a real `IncomingMessage`-shaped stream, so a hand-mocked success cannot
 * stand in for the transport.
 * @param deps - session lookup, live fallback reader and optional logger.
 * @param req - the request.
 * @param res - the response.
 */
export async function handleModeRoute(deps, req, res) {
    try {
        // The fence is checked before anything else: a refused request must not be
        // able to read or move the switch, and it answers with the fence's own status.
        const rejection = deps.connection?.requestRejection(req);
        if (rejection !== undefined) {
            res.statusCode = rejection;
            res.end();
            return;
        }
        if (typeof deps.sessions?.get !== 'function') {
            throw new ModeError('mode/unavailable', 'this Host has no live-session store, so the switch cannot read a session');
        }
        if (req.method !== 'POST') {
            throw new ModeError('mode/method', 'POST only');
        }
        const body = await readJsonBody(req);
        if (body === undefined) {
            throw new ModeError('mode/body', 'a JSON object body is required');
        }
        const action = body.action;
        if (action !== 'status' && action !== 'set') {
            throw new ModeError('mode/action', `unknown action ${JSON.stringify(action)}; expected status or set`);
        }
        const sessionId = body.sessionId;
        if (typeof sessionId !== 'string' || sessionId.trim() === '') {
            throw new ModeError('mode/request', 'sessionId is required');
        }
        const session = deps.sessions.get(sessionId);
        if (session === undefined) {
            throw new ModeError('mode/session', `no live session ${sessionId}`);
        }
        if (action === 'status') {
            sendJson(res, 200, { ok: true, action, mode: modeState(deps, session) });
            return;
        }
        const enabled = body.enabled;
        if (typeof enabled !== 'boolean') {
            throw new ModeError('mode/enabled', 'enabled must be a boolean for action "set"');
        }
        sendJson(res, 200, { ok: true, action, mode: applyMode(deps, session, enabled) });
    }
    catch (error) {
        if (error instanceof BodyTooLarge) {
            sendJson(res, 413, { ok: false, code: 'mode/body', error: error.message });
            return;
        }
        if (error instanceof ModeError) {
            sendJson(res, statusForModeCode(error.code), { ok: false, code: error.code, error: error.message });
            return;
        }
        sendJson(res, 500, { ok: false, code: 'mode/internal', error: redactError(error) });
    }
}
/** HTTP status for one stated switch failure. */
function statusForModeCode(code) {
    switch (code) {
        case 'mode/method': return 405;
        case 'mode/body': return 400;
        case 'mode/action': return 400;
        case 'mode/enabled': return 400;
        case 'mode/request': return 400;
        case 'mode/session': return 404;
        case 'mode/unavailable': return 503;
        case 'mode/config': return 503;
        case 'mode/write': return 503;
        case 'mode/internal': return 500;
    }
}
/** Read one bounded JSON object body; `undefined` for anything else. */
async function readJsonBody(req) {
    const raw = await new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new BodyTooLarge());
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
        req.on('aborted', () => reject(new Error('aborted')));
    });
    if (raw.trim() === '')
        return undefined;
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return undefined;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        return undefined;
    return parsed;
}
/** Accept a registry disposer of unknown shape, or nothing to dispose. */
function asDisposer(value) {
    return typeof value === 'function' ? value : undefined;
}
/** JSON response with `no-store`, because the switch is a live fact. */
function sendJson(res, status, payload) {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(payload));
}
//# sourceMappingURL=mode-surface.js.map