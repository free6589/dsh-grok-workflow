/**
 * Host surfaces of the loop service: the model-facing tool, the browser switch's HTTP
 * route, and the two lifecycle cleanups that keep a heartbeat from outliving its owner.
 *
 * One operation, two callers. Both the tool and the route call the same
 * {@link LoopService} method — `status` from either, `close` from either, `open` from
 * the route only. That asymmetry is the authorization: the route is a browser request
 * and therefore carries no acting Agent, so `open(request)` is a user action; the tool
 * always has an Agent, so `open` refuses before it reaches Schedule.
 *
 * Both surfaces are optional in a composition and are mounted only when the services
 * they need exist (`schedule` + `tools` for the tool, `webServer` + `connection` for the
 * route). A headless profile without Schedule therefore loads this plugin unchanged;
 * it simply gets no loop command.
 *
 * The route is guarded by the composition's own `connection.requestRejection`, the same
 * fence DSH's shipped routes use (Host/Origin check plus browser authentication), so the
 * switch cannot be driven by a cross-site request or an unauthenticated one.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LoopService, LoopSnapshot } from './loop.js';
import type { WorkflowLogger } from './run.js';
/** The route carrier slice this module registers on. */
export interface LoopWebServer {
    register(route: {
        readonly kind: 'exact';
        readonly path: string;
        readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
    }): unknown;
}
/** The connection trust fence slice this module asks for a rejection. */
export interface LoopConnection {
    requestRejection(request: unknown): number | undefined;
}
/**
 * The Host context slice the wiring needs.
 *
 * Typed structurally (like this repository's `SettingsFormsLike`): the plugin is an
 * external bundle, and `webServer`/`connection`/`schedule` are services its own type
 * graph does not own. `inject` is optional because a test harness may hand over the
 * services directly.
 */
export interface LoopHostContext {
    readonly tools?: {
        register(tool: unknown): unknown;
    };
    readonly webServer?: LoopWebServer;
    readonly connection?: LoopConnection;
    readonly inject?: unknown;
    readonly on?: (event: string, listener: (request: {
        readonly sessionId?: unknown;
    }) => unknown) => unknown;
    readonly effect?: (installer: () => undefined | (() => unknown)) => unknown;
}
/** Everything {@link installLoop} needs. */
export interface InstallLoopOptions {
    readonly ctx: LoopHostContext;
    readonly loop: LoopService;
    readonly logger: WorkflowLogger;
}
/**
 * Mount the optional surfaces and the lifecycle cleanups.
 *
 * Cleanups, and why each exists:
 * - `workspace/session-stop` and `workspace/session-archived` both delete this session's
 *   heartbeat. Stop runs when the caller archived with `stopActivity`, archived runs
 *   after the durable write; whichever lands first removes the row and the other finds
 *   nothing, so no ordering leaves a heartbeat targeting an archived session.
 * - The unload disposer deletes **every** row this plugin owns. A heartbeat is only
 *   meaningful while the plugin that opened it is loaded; leaving one behind would be an
 *   obligation nobody owns, which is exactly the residual work this service exists to
 *   avoid. The cleanup is awaited so the disposer does not report done before the deletes
 *   were issued.
 */
export declare function installLoop(options: InstallLoopOptions): void;
/**
 * Build the model-facing tool.
 *
 * `open` is in the schema on purpose: a model that tries it gets a stated refusal with
 * the reason (only the user may open a loop) instead of a "no such action" dead end, and
 * the refusal is testable. `status` and `close` are the operations an agent may use — it
 * may report the loop and stop it, never start one on the user's behalf.
 * @param loop - the Host loop service.
 * @returns the definition to hand to `ctx.tools.register`.
 */
export declare function createLoopTool(loop: LoopService): import("@deepseek-ai/dsh-tools").ToolDefinition;
/** Tool result: the action taken plus the loop as it stands afterwards. */
export interface LoopToolResult {
    readonly ok: boolean;
    readonly action?: string;
    readonly loop?: LoopSnapshot;
}
//# sourceMappingURL=loop-surface.d.ts.map