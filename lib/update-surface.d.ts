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
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WorkflowLogger } from './run.js';
/** Exact Host route of the upgrade button. */
export declare const UPDATE_ROUTE_PATH = "/grok-workflow/update";
/**
 * Methods this route answers.
 *
 * A read travels over GET (`?action=status`), an installation over POST
 * (`{action:"install",tag}`). One list, so the `Allow` header on a 405, the method
 * gate below and the card's retry cannot drift apart.
 */
export declare const UPDATE_ROUTE_METHODS: readonly string[];
/** The one repository an installation may name. */
export declare const UPDATE_REPO = "free6589/dsh-grok-workflow";
/** The package name the profile row must carry; also the name an install must leave installed. */
export declare const UPDATE_BUNDLE_NAME = "dsh-grok-workflow";
/**
 * The only tag shape this route installs: `v` and three dot-separated integers with
 * no leading zeros.
 *
 * A release tag is a value that names a published build; anything else (`main`, a
 * prerelease, a `V`-prefixed spelling, a path fragment) names something that can move
 * or was never published, and `installBundle` would happily hand it to pnpm. The
 * pattern refuses them here, before discovery, before the manager, before the network.
 */
export declare const RELEASE_TAG_PATTERN: RegExp;
/** Stable failure codes this route answers with. */
export type UpdateErrorCode = 'update/method' | 'update/body' | 'update/action' | 'update/spec' | 'update/tag' | 'update/unknown-tag' | 'update/not-newer' | 'update/current' | 'update/discover' | 'update/unavailable' | 'update/install' | 'update/readback' | 'update/internal';
/** One stated refusal; the HTTP status is derived from the code, never guessed. */
export declare class UpdateError extends Error {
    readonly code: UpdateErrorCode;
    constructor(code: UpdateErrorCode, message: string);
}
/**
 * One bundle row, read structurally.
 *
 * The plugin manager is a service this external bundle does not own, so its type
 * graph is not imported here; each field is type-checked where it is used instead of
 * trusted, because `version` is exactly the value an upgrade decision rests on.
 */
export interface UpdateBundleRow {
    readonly name?: unknown;
    readonly version?: unknown;
    readonly source?: unknown;
}
/** The install options this route uses: the exact version it asked for, saved exactly. */
export interface UpdateInstallOptions {
    readonly saveExact?: boolean;
    readonly expected?: {
        readonly name: string;
        readonly version: string;
    };
}
/** The plugin-manager slice this route needs; both halves are required to install. */
export interface UpdatePluginManager {
    listBundles(): Promise<readonly UpdateBundleRow[]>;
    installBundle(spec: string, options?: UpdateInstallOptions): Promise<unknown>;
}
/** The connection trust fence slice this module asks for a rejection. */
export interface UpdateConnection {
    requestRejection(request: unknown): number | undefined;
}
/** The route carrier slice this module registers on. */
export interface UpdateWebServer {
    register(route: {
        readonly kind: 'exact';
        readonly path: string;
        readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
    }): unknown;
}
/**
 * The Host context slice the wiring needs, typed structurally like `ModeHostContext`:
 * `webServer` / `connection` / `pluginManager` are services this external bundle does
 * not own.
 */
export interface UpdateHostContext {
    readonly webServer?: UpdateWebServer | undefined;
    readonly connection?: UpdateConnection | undefined;
    readonly pluginManager?: unknown;
    /** Cordis service lookup, the second way a mounted service is reachable. */
    readonly get?: ((name: string) => unknown) | undefined;
    readonly inject?: unknown;
    readonly effect?: (installer: () => undefined | (() => unknown)) => unknown;
}
/** Options of {@link installUpdateRoute}. */
export interface InstallUpdateRouteOptions {
    readonly ctx: UpdateHostContext;
    /** Release-tag discovery; defaults to one bounded lookup of this repository's tags. */
    readonly discover?: (() => Promise<readonly string[] | undefined>) | undefined;
    readonly logger?: WorkflowLogger | undefined;
}
/** Everything one route request needs. */
export interface UpdateRouteDeps {
    /** The plugin manager, when the caller already resolved one for this request. */
    readonly pluginManager?: UpdatePluginManager | undefined;
    /**
     * Plugin-manager lookup resolved per request, when the manager is a service that may
     * arrive after this route mounted. Preferred over {@link pluginManager} when both are
     * given, so a manager replaced by a later mount is still found.
     */
    readonly resolvePluginManager?: (() => UpdatePluginManager | undefined) | undefined;
    /** Release-tag discovery; defaults to the real lookup. */
    readonly discover?: (() => Promise<readonly string[] | undefined>) | undefined;
    /** The composition's trust fence, when it has one. */
    readonly connection?: UpdateConnection | undefined;
    readonly logger?: WorkflowLogger | undefined;
}
/** Why an offered upgrade is not installable from here. */
export type UpdateReason = 'update/unavailable' | 'update/latest' | 'update/discover' | 'update/current';
/** The `GET ?action=status` answer: what is installed, what is offered, and the command. */
export interface UpdateStatus {
    /** Installed version read back from the profile; `null` when it cannot be read. */
    current: string | null;
    /** Newest release version, without the leading `v`; `null` when the tag list is unreadable. */
    latest: string | null;
    /** Where {@link latest} came from. */
    latestSource: 'remote' | 'none';
    /** Whether this Host can install the upgrade itself right now. */
    canInstall: boolean;
    /** The stated degradation when {@link canInstall} is false. */
    reason?: UpdateReason;
    /** The copy-paste line the card keeps offering, whether or not the button can work. */
    command: string;
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
export declare function releaseSpec(version: string): string;
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
export declare function discoverReleaseTags(): Promise<readonly string[] | undefined>;
/**
 * Mount the route when the composition has the services it needs.
 *
 * Lazy `ctx.inject` keeps the plugin loading unchanged in a headless profile with no
 * web server: no route, no change to any other surface. The registration is installed
 * inside `effect`, so an unload withdraws the route instead of leaving a button that
 * installs into a profile whose plugin is gone.
 * @param options - Host context, optional discovery and logger.
 */
export declare function installUpdateRoute(options: InstallUpdateRouteOptions): void;
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
export declare function handleUpdateRoute(deps: UpdateRouteDeps, req: IncomingMessage, res: ServerResponse): Promise<void>;
//# sourceMappingURL=update-surface.d.ts.map