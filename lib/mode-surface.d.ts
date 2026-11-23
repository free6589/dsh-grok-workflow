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
 * Like `src/loop-surface.ts`, the route is optional in a composition (mounted when
 * `webServer` + `connection` exist; the live-session store is resolved per request, so
 * a store that mounts later cannot leave the switch unanswered) and sits behind the same
 * trust fence: `connection.requestRejection` is the Host/Origin + browser-auth
 * check DSH's shipped routes use, so a cross-site or unauthenticated request is
 * refused before any state is touched.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Session } from '@deepseek-ai/dsh-session';
import type { WorkflowLogger } from './run.js';
/** Exact Host route of the composer switch. */
export declare const MODE_ROUTE_PATH = "/grok-workflow/mode";
/** Stable failure codes this route answers with. */
export type ModeErrorCode = 'mode/method' | 'mode/body' | 'mode/action' | 'mode/enabled' | 'mode/request' | 'mode/session' | 'mode/unavailable' | 'mode/config' | 'mode/write' | 'mode/internal';
/** One stated refusal; the HTTP status is derived from the code, never guessed. */
export declare class ModeError extends Error {
    readonly code: ModeErrorCode;
    constructor(code: ModeErrorCode, message: string);
}
/**
 * The switch as both the button and a test need to read it.
 *
 * `source` distinguishes a written record from the deployment default, so a caller
 * can say "off (session)" or "off (default)" instead of presenting one as the other.
 */
export interface ModeState {
    /** Effective value: the record's `enabled`, or the fallback when none exists. */
    enabled: boolean;
    /** Where {@link enabled} came from. */
    source: 'record' | 'default';
    /** Who wrote the current record; `null` when there is none. */
    setBy: string | null;
    /** Informational turn stamp of the current record; `null` when there is none. */
    turn: number | null;
    /** Workflow shape an explicit enable selected; `null` when the record carries none. */
    workflowMode: 'full' | 'triage' | null;
    /**
     * What an absent record would mean right now (live `grokDefault === 'on'`), or
     * `null` when the live configuration cannot be read. A written record is still
     * reported in that case: the switch does not depend on the configuration being
     * valid, and an unreadable config must not hide a switch the user did set.
     */
    fallback: boolean | null;
}
/** The session lookup slice this route needs. */
export interface ModeSessionStore {
    get(id: string): Session | undefined;
}
/** Everything one route request needs. */
export interface ModeRouteDeps {
    /** Live-session lookup; absent in a composition without the store. */
    readonly sessions?: ModeSessionStore | undefined;
    /**
     * Live-session lookup resolved per request, when the store is a service that may
     * arrive after this route mounted. Preferred over {@link sessions} when both are
     * given, so a route never answers from a snapshot of a service that has since
     * been replaced; `undefined` means "the composition has no store right now" and
     * is answered as `mode/unavailable` (503), never as a missing session (404).
     */
    readonly resolveSessions?: (() => ModeSessionStore | undefined) | undefined;
    /**
     * The effective default with no record: the same rule the gate applies, read live.
     * Kept a function so a settings edit reaches the next request.
     */
    readonly fallback: () => boolean;
    /** The composition's trust fence, when it has one. */
    readonly connection?: ModeConnection | undefined;
    readonly logger?: WorkflowLogger | undefined;
}
/**
 * Read the effective switch for one session, without writing anything.
 *
 * Two facts, in this order: the record (authoritative when present), then the live
 * fallback. A config that cannot be read is stated only when it is *needed* —
 * with a record in hand the switch is answerable anyway, and failing that read
 * would make a set switch look unset.
 */
export declare function modeState(deps: Pick<ModeRouteDeps, 'fallback'>, session: Session): ModeState;
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
export declare function applyMode(deps: Pick<ModeRouteDeps, 'fallback' | 'logger'>, session: Session, enabled: boolean): ModeState;
/** The route carrier slice this module registers on. */
export interface ModeWebServer {
    register(route: {
        readonly kind: 'exact';
        readonly path: string;
        readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
    }): unknown;
}
/** The connection trust fence slice this module asks for a rejection. */
export interface ModeConnection {
    requestRejection(request: unknown): number | undefined;
}
/**
 * The Host context slice the wiring needs, typed structurally like
 * `LoopHostContext`: `webServer`/`connection`/`sessions` are services this external
 * bundle does not own, so nothing here imports the Host's own type graph.
 */
export interface ModeHostContext {
    readonly webServer?: ModeWebServer | undefined;
    readonly connection?: ModeConnection | undefined;
    readonly sessions?: ModeSessionStore | undefined;
    /** Cordis service lookup, the second way a mounted service is reachable. */
    readonly get?: ((name: string) => unknown) | undefined;
    readonly inject?: unknown;
    readonly effect?: (installer: () => undefined | (() => unknown)) => unknown;
}
/** Options of {@link installModeRoute}. */
export interface InstallModeRouteOptions {
    readonly ctx: ModeHostContext;
    readonly fallback: () => boolean;
    readonly logger?: WorkflowLogger | undefined;
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
export declare function installModeRoute(options: InstallModeRouteOptions): void;
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
export declare function handleModeRoute(deps: ModeRouteDeps, req: IncomingMessage, res: ServerResponse): Promise<void>;
//# sourceMappingURL=mode-surface.d.ts.map