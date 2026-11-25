/**
 * Host surface of the settings page's configuration notice: one read-only HTTP route.
 *
 * Why a route and not a settings field (D-155): the page reads its data from
 * `settings/describe`, whose `user` layer is the stored document **projected through the
 * namespace's schema** (`projectForm` walks the schema's `dict`). A removed key is by
 * definition not in the schema, so it can never appear there — a banner that read
 * `entry.user` was correct code over data that does not exist. The plugin is the only
 * party that still sees the leftover (it is in the raw config the Host hands `apply()`),
 * so it publishes the list over its own route, which is the same mechanism the composer
 * switch (`src/mode-surface.ts`) and the upgrade card (`src/update-surface.ts`) already
 * use. No new dependency, no second source of truth: the list is read off the same
 * per-load set the load log drains.
 *
 * Read-only by construction: `GET` answers, everything else is refused with a 405 that
 * names the method. The route answers an **empty list** when the patch carries no
 * removed key, so the page's rule is one sentence — non-empty, render; empty, nothing.
 *
 * Optional in a composition, like its siblings: mounted only when `webServer` +
 * `connection` exist, and a Host without them gets one `warn` line instead of a failed
 * load, because a missing notice is not worth taking the settings page down for.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WorkflowLogger } from './run.js';
/** Exact Host route of the settings page's configuration notice. */
export declare const CONFIG_NOTICES_ROUTE_PATH = "/grok-workflow/config-notices";
/**
 * Methods this route answers.
 *
 * One method, because the notice is a fact about the load and nothing here writes.
 * Kept as a list so the `Allow` header on a 405 and the gate below cannot drift.
 */
export declare const CONFIG_NOTICES_ROUTE_METHODS: readonly string[];
/** One leftover key and the sentence the page may show for it. */
export interface ConfigNotice {
    /** The removed key the patch still carries (`mode`, `legacyGate`, …). */
    readonly key: string;
    /** The load log's sentence for that key, in both languages. */
    readonly message: string;
}
/** The web-server slice this route registers against. */
export interface ConfigNoticesWebServer {
    register(route: {
        readonly kind: 'exact';
        readonly path: string;
        readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
    }): unknown;
}
/** The connection trust fence slice this module asks for a rejection. */
export interface ConfigNoticesConnection {
    requestRejection(request: unknown): number | undefined;
}
/** The Host context slice the wiring needs, typed structurally like the other surfaces. */
export interface ConfigNoticesHostContext {
    readonly webServer?: ConfigNoticesWebServer | undefined;
    readonly connection?: ConfigNoticesConnection | undefined;
    readonly inject?: unknown;
    readonly effect?: (installer: () => undefined | (() => unknown)) => unknown;
}
/** Everything one request needs. */
export interface ConfigNoticesRouteDeps {
    /**
     * The removed keys this load has seen, in the order the check met them.
     *
     * A **reader**, never a drain: the load log owns the buffer and its one-line-per-key
     * dedupe (`apply()`'s `announcedRemovedKeys`), and a page refresh must not be able to
     * silence a warning the operator has not read yet. Reading is idempotent, which is
     * what makes a route safe here at all.
     */
    readonly leftovers: () => readonly string[];
    /** The connection trust fence; absent in a composition without one. */
    readonly connection?: ConfigNoticesConnection | undefined;
    /** Optional Host logger, for a refused method. */
    readonly logger?: WorkflowLogger | undefined;
}
/**
 * The body this route answers with.
 *
 * A stable shape instead of a bare array, so a page can tell "no leftovers" apart from
 * "an answer I do not understand" — and so a future field can be added without
 * changing what the current page reads.
 * @param keys - the removed keys still present in the patch.
 * @returns `{ ok: true, notices: [{ key, message }] }`.
 */
export declare function configNoticesBody(keys: readonly string[]): {
    ok: true;
    notices: ConfigNotice[];
};
/**
 * Answer one browser request.
 *
 * Exported as the production-path test seam, like `handleModeRoute`: the tests drive
 * this exact handler with a real `IncomingMessage`-shaped request, so a hand-mocked
 * success cannot stand in for the transport.
 * @param deps - the leftover reader, the fence and the logger.
 * @param req - the request.
 * @param res - the response.
 */
export declare function handleConfigNoticesRoute(deps: ConfigNoticesRouteDeps, req: IncomingMessage, res: ServerResponse): void;
/**
 * Mount the route when the composition has the services it needs.
 *
 * Lazy `ctx.inject` keeps the plugin loading unchanged in a headless profile with no
 * web server, and the registration is installed inside `effect`, so an unload withdraws
 * the route instead of leaving it answering for a plugin that is gone.
 * @param options - Host context plus the leftover reader.
 */
export declare function installConfigNoticesRoute(options: {
    readonly ctx: ConfigNoticesHostContext;
    readonly leftovers: () => readonly string[];
    readonly logger?: WorkflowLogger | undefined;
}): void;
//# sourceMappingURL=config-notices-surface.d.ts.map