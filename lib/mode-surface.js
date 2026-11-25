/**
 * Host surface of the workflow master switch: the browser button's HTTP route.
 *
 * The switch has exactly one source of truth — the session's own durable mode
 * record (`src/mode.ts`, `plugin:grok-workflow/mode`) — and one set of readers,
 * the session's own. This module adds the *write* path a
 * composer button needs: a browser request cannot call a slash command, and a
 * second copy of the state (a global file, a profile field) would let the record
 * say `on` while the button says `off`. So the route reads and writes that same
 * record through the same two functions the `/grok` command uses, and answers with
 * the state it read back — never with the state it merely asked for.
 *
 * `status` is the fallback-aware read: with no record written, the effective value
 * is the live `grokDefault === 'on'`, which is the fallback the plugin reports when
 * no record exists. The default is
 * therefore never restated here or in the button; both ask this route.
 *
 * Like `src/loop-surface.ts`, the route is optional in a composition (mounted when
 * `webServer` + `connection` exist; the live-session store is resolved per request, so
 * a store that mounts later cannot leave the switch unanswered) and sits behind the same
 * trust fence: `connection.requestRejection` is the Host/Origin + browser-auth
 * check DSH's shipped routes use, so a cross-site or unauthenticated request is
 * refused before any state is touched.
 */
import { readModeRecord, setMode } from './mode.js';
import { redactError } from './redact.js';
/** Exact Host route of the composer switch. */
export const MODE_ROUTE_PATH = '/grok-workflow/mode';
/**
 * Methods this route answers.
 *
 * Reads travel over GET (`?action=status`), writes over POST (`{action:"set"}`).
 * Kept as one list so the `Allow` header on a 405, the method gate below and the
 * client's retry cannot drift apart.
 */
export const MODE_ROUTE_METHODS = ['GET', 'POST'];
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
    // Only the two services the route cannot answer without are required. The
    // live-session store is resolved per request instead: requiring it here meant that a
    // composition listing `sessions` later than this fiber mounted *nothing*, and the
    // browser's POST then fell through to the Host's own unknown-route answer — the
    // `HTTP 405` the operator saw, with no plugin-side explanation attached to it.
    inject(['webServer', 'connection'], (child) => {
        const webServer = child.webServer;
        if (webServer === undefined) {
            options.logger?.warn?.('grok-workflow mode route not mounted: the Host composition has no webServer service, '
                + 'so the settings-page workflow switch answers through the Host fallback instead of this plugin');
            return;
        }
        const resolveSessions = () => storeOf(serviceOf(child, 'sessions'))
            ?? storeOf(serviceOf(ctx, 'sessions'));
        child.effect?.(() => asDisposer(webServer.register({
            kind: 'exact',
            path: MODE_ROUTE_PATH,
            handler: (req, res) => handleModeRoute({
                resolveSessions,
                fallback: options.fallback,
                ...child.connection === undefined ? {} : { connection: child.connection },
                ...options.logger === undefined ? {} : { logger: options.logger },
            }, req, res),
        })));
    });
}
/**
 * Read one service off a Host context, directly or through `ctx.get(name)`.
 *
 * Cordis exposes a service both as a context property and through `get`, and which of
 * the two is populated depends on the fiber that mounted it; asking both keeps the
 * route from concluding "no store" for a composition that has one.
 *
 * The direct read is isolate-guarded: a cordis context is a proxy whose `get` trap
 * throws `cannot get property "<name>" without inject` for a service this fiber did
 * not inject, instead of reading `undefined`. `sessions` is deliberately not in the
 * inject list — the route resolves it per request so a store that mounts later still
 * answers — so that throw is the *expected* outcome here, not a fault. Letting it
 * escape is what made the switch fail: the throw left this function before the
 * `?? serviceOf(ctx, …)` / `get(name)` fallbacks could run, and `handleModeRoute`
 * reported it as `500 mode/internal` — the composer's red "模式服务没有回应".
 * `get` is the unguarded lookup (it returns `undefined` for an unprovided name), so
 * the guard's failure falls through to it, exactly as `src/settings.ts` `serviceOf`
 * and `src/team-engine.ts` `resolveService` already do.
 * @param source - the context or injected child.
 * @param name - the service name.
 * @returns the service, or `undefined` when this composition has none.
 */
function serviceOf(source, name) {
    if (source === undefined)
        return undefined;
    let direct;
    try {
        direct = source[name];
    }
    catch {
        // Inject-guarded property read on a real cordis context; `get` below is the
        // resolution API that is not guarded.
        direct = undefined;
    }
    if (direct !== undefined && direct !== null)
        return direct;
    return typeof source.get === 'function' ? source.get(name) : undefined;
}
/** Accept a live-session lookup of unknown shape, or nothing. */
function storeOf(value) {
    const candidate = value;
    return typeof candidate?.get === 'function' ? candidate : undefined;
}
/**
 * Answer one browser request.
 *
 * Body: `{ action: 'status' | 'set', sessionId, enabled? }`. `status` only reads;
 * `set` writes and answers the read-back. A read is also accepted over `GET`
 * (`?action=status&sessionId=…`), because the switch is the one control that must keep
 * answering when a proxy or a browser refuses to POST; a write over `GET` is refused,
 * since a URL is not a place to keep a state change.
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
        const sessions = deps.resolveSessions !== undefined ? deps.resolveSessions() : deps.sessions;
        if (typeof sessions?.get !== 'function') {
            throw new ModeError('mode/unavailable', 'this Host has no live-session store, so the switch cannot read a session');
        }
        const method = (req.method ?? 'GET').toUpperCase();
        if (!MODE_ROUTE_METHODS.includes(method)) {
            // Name the method and the URL being refused: the operator's report was an
            // unexplained `HTTP 405`, and the request that produced it is the one fact no
            // later investigation can recover, so it is written down here instead.
            deps.logger?.warn?.(`grok-workflow mode route refused ${method} ${typeof req.url === 'string' ? req.url : MODE_ROUTE_PATH}: `
                + 'this route reads with GET ?action=status&sessionId=… and writes with POST {action:"set"}');
            throw new ModeError('mode/method', `${method} is not supported: read with GET, write with POST`);
        }
        const body = method === 'GET' ? readQueryBody(req) : await readJsonBody(req);
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
        const session = sessions.get(sessionId);
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
            const status = statusForModeCode(error.code);
            // RFC 9110 requires a 405 to name the methods the resource does accept.
            // The operator's report was an unexplained 405; the body already says how to
            // read and write, and the header states it where a client (or a proxy log)
            // reads it without parsing the payload.
            if (status === 405)
                res.setHeader('allow', MODE_ROUTE_METHODS.join(', '));
            sendJson(res, status, { ok: false, code: error.code, error: error.message });
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
/**
 * Read one `status` request out of the query string.
 *
 * Only a read travels in a URL. `action=set` is refused with the method code (405), so
 * a state change cannot be triggered by a link, a prefetch or an image tag — the same
 * reason the route has always written over POST.
 * @param req - the request carrying `?action=status&sessionId=…`.
 * @returns the body shape the POST path uses, or `undefined` when there is no query.
 */
function readQueryBody(req) {
    const url = typeof req.url === 'string' ? req.url : '';
    const at = url.indexOf('?');
    if (at < 0)
        return undefined;
    const query = new URLSearchParams(url.slice(at + 1));
    const action = query.get('action') ?? 'status';
    if (action !== 'status') {
        throw new ModeError('mode/method', `GET may only read: this route writes over POST (action=${JSON.stringify(action)})`);
    }
    return { action, sessionId: query.get('sessionId') ?? '' };
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