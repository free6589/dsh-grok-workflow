/**
 * Host surface of the upgrade button: the settings card's one HTTP route.
 *
 * The card already prints the install line (`dsh plugin --profile <profile> add …`), which makes the
 * operator the installer. A browser cannot run that command, so this route is the
 * Host verb the button needs — and it is deliberately the *thinner* half: it does
 * not install anything of its own, it asks the profile's own plugin manager to
 * install one exact Git spec. One install channel, no second installer, no
 * package-managed copy of the plugin beside the profile's row.
 *
 * The spec is built here, never accepted from the browser. `github:free6589/dsh-grok-workflow#v<x.y.z>`
 * comes from {@link releaseSpec} over a tag that matched {@link RELEASE_TAG_PATTERN}
 * *and* that this repository's own tag list reported, so the worst a crafted request
 * can do is ask to install a release that exists. A package name, a registry spec, a
 * tarball, another repository: all refused before the manager is touched.
 *
 * Two facts decide whether an upgrade is offered at all: the installed version read
 * back from the profile (`listBundles`, never a stored copy) and the newest release
 * tag. Both can be missing — no plugin manager in this composition, an offline tag
 * list — and each degradation has its own answer rather than a guess: the card falls
 * back to the command it always printed. Mounted only when `webServer` + `connection`
 * exist, and the manager is resolved per request, so a manager that mounts later
 * still answers (the same reason `src/mode-surface.ts` resolves the session store
 * per request).
 *
 * Nothing here reloads, restarts, or schedules anything: this route installs in
 * response to exactly one POST, and the Host's own install lifecycle decides what an
 * installation does afterwards.
 */
import { readFileSync } from 'node:fs';
import { redactError } from './redact.js';
/** Exact Host route of the upgrade button. */
export const UPDATE_ROUTE_PATH = '/grok-workflow/update';
/**
 * Methods this route answers.
 *
 * A read travels over GET (`?action=status`), an installation over POST
 * (`{action:"install",tag}`). One list, so the `Allow` header on a 405, the method
 * gate below and the card's retry cannot drift apart.
 */
export const UPDATE_ROUTE_METHODS = ['GET', 'POST'];
/** The one repository an installation may name. */
export const UPDATE_REPO = 'free6589/dsh-grok-workflow';
/** The package name the profile row must carry; also the name an install must leave installed. */
export const UPDATE_BUNDLE_NAME = 'dsh-grok-workflow';
/**
 * The only tag shape this route installs: `v` and three dot-separated integers with
 * no leading zeros.
 *
 * A release tag is a value that names a published build; anything else (`main`, a
 * prerelease, a `V`-prefixed spelling, a path fragment) names something that can move
 * or was never published, and `installBundle` would happily hand it to pnpm. The
 * pattern refuses them here, before discovery, before the manager, before the network.
 */
export const RELEASE_TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
/** A version without the leading `v`, the shape {@link RELEASE_TAG_PATTERN} checks. */
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
/** Where the newest release tags are read from, when no discovery was injected. */
const RELEASE_TAGS_URL = `https://api.github.com/repos/${UPDATE_REPO}/tags?per_page=100`;
/** Deadline of the one tag lookup; the card answers from the command when it misses. */
const RELEASE_DISCOVERY_TIMEOUT_MS = 5_000;
/** Largest tag-list body accepted before it is parsed; a tags page is a few kilobytes. */
const MAX_TAGS_BYTES = 1024 * 1024;
/** Largest browser body accepted. A request names one tag and one action. */
const MAX_BODY_BYTES = 8 * 1024;
/** Largest `package.json` accepted when the command falls back to the build version. */
const MAX_PACKAGE_BYTES = 64 * 1024;
/** The plugin's own manifest, beside this module in both `src/` and `lib/`. */
const PACKAGE_JSON_URL = new URL('../package.json', import.meta.url);
/** A body past {@link MAX_BODY_BYTES}; its own answer is 413, not `update/internal`. */
class BodyTooLarge extends Error {
    constructor() {
        super(`request body exceeds ${MAX_BODY_BYTES} bytes`);
        this.name = 'BodyTooLarge';
    }
}
/** One stated refusal; the HTTP status is derived from the code, never guessed. */
export class UpdateError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'UpdateError';
        this.code = code;
    }
}
/**
 * Build the installation spec for one release version.
 *
 * The only place a spec comes from: the repository and the tag are constants and a
 * checked version, never browser text. A version outside the release shape throws,
 * because a spec built from it would name something this route cannot vouch for.
 * @param version - release version without the leading `v`.
 * @returns the Git spec `installBundle` accepts.
 */
export function releaseSpec(version) {
    if (!VERSION_PATTERN.test(version)) {
        throw new UpdateError('update/tag', `${JSON.stringify(version)} is not a release version, so no spec can be built from it`);
    }
    return `github:${UPDATE_REPO}#v${version}`;
}
/** Parse a release version into comparable numbers, or `undefined` for anything else. */
function versionParts(version) {
    const match = VERSION_PATTERN.exec(version);
    if (match === null)
        return undefined;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}
/**
 * Whether `candidate` is a strictly newer release than `current`.
 *
 * Numbers, not strings: `0.13.100` is newer than `0.13.99`, which a lexical compare
 * gets backwards. A version that is not a release version cannot be ordered against
 * one, so it is reported as not newer rather than assumed older.
 */
function isNewer(candidate, current) {
    const a = versionParts(candidate);
    const b = versionParts(current);
    if (a === undefined || b === undefined)
        return false;
    for (let index = 0; index < a.length; index += 1) {
        const left = a[index];
        const right = b[index];
        if (left !== right)
            return left > right;
    }
    return false;
}
/** The newest release version in a tag list, or `null` when it holds none. */
function newestTag(tags) {
    let best = null;
    for (const tag of tags) {
        if (typeof tag !== 'string' || !RELEASE_TAG_PATTERN.test(tag))
            continue;
        const version = tag.slice(1);
        if (best === null || isNewer(version, best))
            best = version;
    }
    return best;
}
/**
 * The version this build is, read from the manifest beside this module.
 *
 * The fallback for the copy-paste command when no release tag is known. Bounded and
 * guarded: an unreadable or malformed manifest means "no version to name", never an
 * invented one.
 */
function buildVersion() {
    try {
        const raw = readFileSync(PACKAGE_JSON_URL, 'utf8');
        if (raw.length > MAX_PACKAGE_BYTES)
            return null;
        const manifest = JSON.parse(raw);
        return typeof manifest.version === 'string' && VERSION_PATTERN.test(manifest.version)
            ? manifest.version
            : null;
    }
    catch {
        return null;
    }
}
/**
 * The `dsh plugin --profile <profile> add` line, pinned to one release; without a
 * version it names no tag.
 *
 * `--profile <profile>` is the same flag the settings card prints, and it is the whole
 * reason this line exists: a bare `dsh plugin add` installs into whichever profile the
 * command happens to default to, so an operator running a non-default profile would
 * paste a line that upgrades a profile they are not looking at. The literal
 * `<profile>` placeholder is left for the operator to fill in — this surface does not
 * know, and must not invent, the name of the profile the browser is talking to.
 */
function installCommand(version) {
    if (version === null)
        return `dsh plugin --profile <profile> add github:${UPDATE_REPO}`;
    try {
        return `dsh plugin --profile <profile> add ${releaseSpec(version)}`;
    }
    catch {
        return `dsh plugin --profile <profile> add github:${UPDATE_REPO}`;
    }
}
/**
 * Read this repository's release tags, once, with a deadline.
 *
 * The default discovery: a browser cannot list tags, and the route must not depend on
 * a new dependency or a child process for one HTTP GET. Any failure — no `fetch`, a
 * non-2xx answer, a body that is not a tag list, a timeout — answers `undefined`, which
 * the caller reports as "the release list could not be read" and never as "there are no
 * newer releases". Tests always inject their own discovery and never reach this.
 * @returns the tag names the repository reported, or `undefined` when it did not answer.
 */
export async function discoverReleaseTags() {
    const fetchImpl = globalThis.fetch;
    if (typeof fetchImpl !== 'function')
        return undefined;
    try {
        const response = await fetchImpl(RELEASE_TAGS_URL, {
            headers: { accept: 'application/vnd.github+json', 'user-agent': `${UPDATE_BUNDLE_NAME}-update-check` },
            signal: AbortSignal.timeout(RELEASE_DISCOVERY_TIMEOUT_MS),
        });
        if (!response.ok)
            return undefined;
        const raw = await response.text();
        if (raw.length > MAX_TAGS_BYTES)
            return undefined;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return undefined;
        const names = [];
        for (const entry of parsed) {
            const name = entry?.name;
            if (typeof name === 'string' && RELEASE_TAG_PATTERN.test(name))
                names.push(name);
        }
        return names;
    }
    catch {
        return undefined;
    }
}
/**
 * Mount the route when the composition has the services it needs.
 *
 * Lazy `ctx.inject` keeps the plugin loading unchanged in a headless profile with no
 * web server: no route, no change to any other surface. The registration is installed
 * inside `effect`, so an unload withdraws the route instead of leaving a button that
 * installs into a profile whose plugin is gone.
 * @param options - Host context, optional discovery and logger.
 */
export function installUpdateRoute(options) {
    const { ctx } = options;
    if (typeof ctx.inject !== 'function')
        return;
    const inject = ctx.inject;
    // Only the two services the route cannot answer without are required here. The
    // plugin manager is resolved per request instead: requiring it would have meant that
    // a composition listing `pluginManager` later than this fiber mounted *nothing*, and
    // the card would have kept offering a command in a profile that could have installed
    // it itself.
    inject(['webServer', 'connection'], (child) => {
        const webServer = child.webServer;
        if (webServer === undefined) {
            options.logger?.warn?.('grok-workflow update route not mounted: the Host composition has no webServer service, '
                + 'so the settings-page upgrade falls back to its copy-paste command instead of this plugin');
            return;
        }
        const resolvePluginManager = () => managerOf(serviceOf(child, 'pluginManager'))
            ?? managerOf(serviceOf(ctx, 'pluginManager'));
        const discover = options.discover ?? discoverReleaseTags;
        child.effect?.(() => asDisposer(webServer.register({
            kind: 'exact',
            path: UPDATE_ROUTE_PATH,
            handler: (req, res) => handleUpdateRoute({
                resolvePluginManager,
                discover,
                ...child.connection === undefined ? {} : { connection: child.connection },
                ...options.logger === undefined ? {} : { logger: options.logger },
            }, req, res),
        })));
    });
}
/**
 * Read one service off a Host context, directly or through `ctx.get(name)`.
 *
 * The same two paths `src/mode-surface.ts` documents: cordis populates either the
 * context property or `get`, and the direct read on a real context *throws* for a
 * service this fiber did not inject rather than reading `undefined`. `pluginManager` is
 * deliberately not in the inject list, so that throw is the expected outcome here and
 * must fall through to `get`.
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
        direct = undefined;
    }
    if (direct !== undefined && direct !== null)
        return direct;
    return typeof source.get === 'function' ? source.get(name) : undefined;
}
/**
 * Accept a plugin manager of unknown shape, or nothing.
 *
 * Both halves are required: a manager that can only list cannot install, and one that
 * can only install cannot be read back, so either half alone is "no manager here".
 */
function managerOf(value) {
    const candidate = value;
    return typeof candidate?.listBundles === 'function' && typeof candidate.installBundle === 'function'
        ? candidate
        : undefined;
}
/** The manager this request may use, preferring the per-request resolution. */
function managerFor(deps) {
    return deps.resolvePluginManager !== undefined
        ? deps.resolvePluginManager()
        : managerOf(deps.pluginManager);
}
/** The discovery this request uses, defaulted to the real lookup. */
function discoveryFor(deps) {
    return deps.discover ?? discoverReleaseTags;
}
/**
 * Ask for the release tags, and treat every way that can go wrong as one answer.
 *
 * `undefined` is "this route could not read the release list" — never "there is no newer
 * release". A discovery that throws, or that answers something that is not a list, is the
 * same miss: the card falls back to the command it always printed instead of the route
 * answering `500` over a check the operator cannot act on.
 * @param deps - route deps carrying the discovery.
 * @returns the tag names, or `undefined` when they could not be read.
 */
async function readTags(deps) {
    let tags;
    try {
        tags = await discoveryFor(deps)();
    }
    catch (error) {
        deps.logger?.warn?.(`grok-workflow update route could not read the release tags: ${redactError(error)}`);
        return undefined;
    }
    if (!Array.isArray(tags))
        return undefined;
    return tags.filter((tag) => typeof tag === 'string');
}
/**
 * Read the installed row's version and source.
 *
 * Read back every time, never cached: the profile is the authority, and a stored copy
 * would let the card claim an upgrade that already happened. A manager that throws, a
 * missing row, or a row without a usable version all answer `null` — the card says it
 * cannot tell, which is the truth.
 * @param manager - the plugin manager.
 * @param logger - optional warning channel for a failed read.
 * @returns the installed facts, with `read: false` when the read itself failed.
 */
async function readInstalledRow(manager, logger) {
    let rows;
    try {
        rows = await manager.listBundles();
    }
    catch (error) {
        logger?.warn?.(`grok-workflow update route could not read the installed bundles: ${redactError(error)}`);
        return { version: null, source: null, read: false };
    }
    const row = rows.find(candidate => candidate !== null && typeof candidate === 'object'
        && candidate.name === UPDATE_BUNDLE_NAME);
    const version = typeof row?.version === 'string' && row.version.trim() !== '' ? row.version.trim() : null;
    const source = typeof row?.source === 'string' && row.source.trim() !== '' ? row.source.trim() : null;
    return { version, source, read: true };
}
/**
 * Build the status answer.
 *
 * The reasons are ordered by what a reader needs first: no manager at all is a
 * different situation from "the tag list is down", which is different from "the
 * installed version cannot be read", which is different from "you are current". Each
 * one keeps the command, because the command is the fallback that always works.
 * @param deps - route deps.
 * @param manager - the manager for this request, when there is one.
 * @returns the status payload.
 */
async function buildStatus(deps, manager) {
    const tags = await readTags(deps);
    const latest = tags === undefined ? null : newestTag(tags);
    const installed = manager === undefined
        ? { version: null, source: null, read: false }
        : await readInstalledRow(manager, deps.logger);
    const current = installed.version;
    let reason;
    if (manager === undefined)
        reason = 'update/unavailable';
    else if (latest === null)
        reason = 'update/discover';
    else if (current === null)
        reason = 'update/current';
    else if (!isNewer(latest, current))
        reason = 'update/latest';
    return {
        current,
        latest,
        latestSource: tags === undefined ? 'none' : 'remote',
        canInstall: reason === undefined,
        ...reason === undefined ? {} : { reason },
        command: installCommand(latest ?? buildVersion()),
    };
}
/**
 * Put the previous version back after a failed or unlanded installation.
 *
 * Only ever reports what a second read-back proves: a rollback that cannot be verified
 * is `rolledBack: false`, because a card that says "restored" over a profile that is
 * not restored is worse than a card that says the upgrade failed.
 * @param manager - the plugin manager.
 * @param previous - the snapshot taken before installing.
 * @param currentVersion - the version the failed installation left installed.
 * @param logger - optional warning channel.
 * @returns whether a verified rollback happened, and the version it reached.
 */
async function rollBack(manager, previous, currentVersion, logger) {
    if (previous.version === null)
        return { rolledBack: false };
    // Already back at the previous version: nothing to install, and nothing to claim.
    if (currentVersion === previous.version)
        return { rolledBack: false };
    let spec;
    if (previous.source !== null)
        spec = previous.source;
    else {
        try {
            spec = releaseSpec(previous.version);
        }
        catch {
            // An installed version that is not a release (a development link) has no tag to
            // restore from, and guessing one would install something else.
            spec = undefined;
        }
    }
    if (spec === undefined)
        return { rolledBack: false };
    try {
        await manager.installBundle(spec, {
            saveExact: true,
            expected: { name: UPDATE_BUNDLE_NAME, version: previous.version },
        });
    }
    catch (error) {
        logger?.warn?.(`grok-workflow update route could not restore ${UPDATE_BUNDLE_NAME}@${previous.version}: ${redactError(error)}`);
    }
    const after = await readInstalledRow(manager, logger);
    return after.version === previous.version
        ? { rolledBack: true, restored: previous.version }
        : { rolledBack: false };
}
/**
 * Answer one browser request.
 *
 * `GET ?action=status` reads; `POST {action:"install",tag}` installs and answers the
 * version read back. The order below is the contract: trust fence, method, body,
 * action, repository/spec fence, tag shape, confirmed release, newer-than-installed,
 * snapshot, one installation, read-back, and a rollback only when the read-back proves
 * one was needed. Every refusal happens before the manager is touched.
 *
 * Exported as the production-path test seam: the tests drive this exact handler with a
 * real `IncomingMessage`-shaped stream and a fake plugin manager, so a hand-mocked
 * success cannot stand in for the transport.
 * @param deps - plugin manager, discovery, trust fence and optional logger.
 * @param req - the request.
 * @param res - the response.
 */
export async function handleUpdateRoute(deps, req, res) {
    try {
        // The fence is checked before anything else: a refused request must not be able to
        // read the profile or start an installation, and it answers with the fence's status.
        const rejection = deps.connection?.requestRejection(req);
        if (rejection !== undefined) {
            res.statusCode = rejection;
            res.end();
            return;
        }
        const method = (req.method ?? 'GET').toUpperCase();
        if (!UPDATE_ROUTE_METHODS.includes(method)) {
            deps.logger?.warn?.(`grok-workflow update route refused ${method} ${typeof req.url === 'string' ? req.url : UPDATE_ROUTE_PATH}: `
                + 'this route reads with GET ?action=status and installs with POST {action:"install",tag}');
            throw new UpdateError('update/method', `${method} is not supported: read with GET, install with POST`);
        }
        const body = method === 'GET'
            ? readQueryBody(req)
            : await readJsonBody(req);
        if (body === undefined) {
            throw new UpdateError('update/body', 'a JSON object body is required');
        }
        // A read never installs, and a write never rides a URL: the GET branch cannot reach
        // the install path below, which is the point of splitting the two methods.
        if (method === 'GET') {
            sendJson(res, 200, { ok: true, action: 'status', update: await buildStatus(deps, managerFor(deps)) });
            return;
        }
        const action = body.action;
        if (action !== 'install') {
            throw new UpdateError('update/action', `unknown action ${JSON.stringify(action)}; this route installs with {"action":"install","tag":"vX.Y.Z"}`);
        }
        // The browser cannot name a package. Refusing the field by name (rather than
        // ignoring it) is deliberate: an ignored `spec` would look honoured to the caller.
        const specFields = Object.keys(body).filter(key => /spec/i.test(key));
        if (specFields.length > 0) {
            throw new UpdateError('update/spec', `this route builds the installation spec itself; refuse ${specFields.join(', ')}`);
        }
        const tag = body.tag;
        if (typeof tag !== 'string' || !RELEASE_TAG_PATTERN.test(tag)) {
            throw new UpdateError('update/tag', `tag must be a release tag of ${UPDATE_REPO} (vX.Y.Z), not ${JSON.stringify(tag)}`);
        }
        const target = tag.slice(1);
        const manager = managerFor(deps);
        const tags = await readTags(deps);
        const latest = tags === undefined ? null : newestTag(tags);
        if (manager === undefined) {
            throw new UpdateError('update/unavailable', `this Host has no plugin-manager service, so the upgrade cannot run here; run ${installCommand(latest ?? buildVersion())} in a terminal`);
        }
        if (tags === undefined) {
            throw new UpdateError('update/discover', `the release list of ${UPDATE_REPO} could not be read, so ${tag} cannot be confirmed; run ${installCommand(target)} in a terminal`);
        }
        if (!tags.includes(tag)) {
            throw new UpdateError('update/unknown-tag', `${tag} is not a published release of ${UPDATE_REPO}`);
        }
        const previous = await readInstalledRow(manager, deps.logger);
        if (previous.version !== null && !isNewer(target, previous.version)) {
            throw new UpdateError('update/not-newer', `${target} is not newer than the installed ${previous.version}`);
        }
        const spec = releaseSpec(target);
        let failure;
        try {
            await manager.installBundle(spec, {
                saveExact: true,
                expected: { name: UPDATE_BUNDLE_NAME, version: target },
            });
        }
        catch (error) {
            // A throw is not yet a verdict: the profile may or may not have changed, and only
            // the read-back below can say which.
            failure = error;
        }
        const installed = await readInstalledRow(manager, deps.logger);
        // Success is a read-back, never the request and never a resolved promise.
        if (installed.version === target) {
            sendJson(res, 200, {
                ok: true,
                action: 'install',
                installed: { from: previous.version, to: installed.version, spec, saveExact: true },
            });
            return;
        }
        const restored = await rollBack(manager, previous, installed.version, deps.logger);
        const code = failure === undefined ? 'update/readback' : 'update/install';
        const message = failure === undefined
            ? `the installation did not land on ${target}${installed.version === null ? '' : ` (the profile reads ${installed.version})`}`
            : redactError(failure);
        sendJson(res, statusForUpdateCode(code), {
            ok: false,
            code,
            error: message,
            rolledBack: restored.rolledBack,
            ...restored.restored === undefined ? {} : { restored: restored.restored },
        });
    }
    catch (error) {
        if (error instanceof BodyTooLarge) {
            sendJson(res, 413, { ok: false, code: 'update/body', error: error.message });
            return;
        }
        if (error instanceof UpdateError) {
            const status = statusForUpdateCode(error.code);
            // RFC 9110 requires a 405 to name the methods the resource does accept.
            if (status === 405)
                res.setHeader('allow', UPDATE_ROUTE_METHODS.join(', '));
            // Every refusal reaching here happened before the manager was touched, so "no
            // rollback ran" is a fact, not a guess: the card must not imply otherwise.
            sendJson(res, status, { ok: false, code: error.code, error: error.message, rolledBack: false });
            return;
        }
        sendJson(res, 500, { ok: false, code: 'update/internal', error: redactError(error) });
    }
}
/** HTTP status for one stated upgrade failure. */
function statusForUpdateCode(code) {
    switch (code) {
        case 'update/method': return 405;
        case 'update/body': return 400;
        case 'update/action': return 400;
        case 'update/spec': return 400;
        case 'update/tag': return 400;
        case 'update/unknown-tag': return 409;
        case 'update/not-newer': return 409;
        case 'update/current': return 503;
        case 'update/discover': return 503;
        case 'update/unavailable': return 503;
        case 'update/install': return 502;
        case 'update/readback': return 502;
        case 'update/internal': return 500;
    }
}
/**
 * Read one `status` request out of the query string.
 *
 * Only a read travels in a URL. An `install` in a query string is refused with the
 * method code (405), so a link, a prefetch or an image tag cannot install a package —
 * the reason installation has always been a POST.
 * @param req - the request carrying `?action=status`.
 * @returns the body shape the POST path uses.
 */
function readQueryBody(req) {
    const url = typeof req.url === 'string' ? req.url : '';
    const at = url.indexOf('?');
    if (at < 0)
        return { action: 'status' };
    const query = new URLSearchParams(url.slice(at + 1));
    const action = query.get('action') ?? 'status';
    if (action !== 'status') {
        throw new UpdateError('update/method', `GET may only read: this route installs over POST (action=${JSON.stringify(action)})`);
    }
    return { action };
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
/** JSON response with `no-store`, because what is installed is a live fact. */
function sendJson(res, status, payload) {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(payload));
}
//# sourceMappingURL=update-surface.js.map