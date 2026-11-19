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

import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { LOOP_ROUTE_PATH, LOOP_TOOL_NAME, ITERATE_ROUTE_PATH, LoopError } from './loop.js'
import type { LoopService, LoopSnapshot } from './loop.js'
import { redactError } from './redact.js'
import type { WorkflowLogger } from './run.js'

/** Largest browser body this route accepts; the switch sends three short fields. */
const MAX_BODY_BYTES = 64 * 1024

/** A body past {@link MAX_BODY_BYTES}; its own answer is 413, not an internal fault. */
class BodyTooLarge extends Error {
  constructor() {
    super(`request body exceeds ${MAX_BODY_BYTES} bytes`)
    this.name = 'BodyTooLarge'
  }
}

/** The route carrier slice this module registers on. */
export interface LoopWebServer {
  register(route: {
    readonly kind: 'exact'
    readonly path: string
    readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): unknown
}

/** The connection trust fence slice this module asks for a rejection. */
export interface LoopConnection {
  requestRejection(request: unknown): number | undefined
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
  readonly tools?: { register(tool: unknown): unknown }
  readonly webServer?: LoopWebServer
  readonly connection?: LoopConnection
  readonly inject?: unknown
  readonly on?: (event: string, listener: (request: { readonly sessionId?: unknown }) => unknown) => unknown
  readonly effect?: (installer: () => undefined | (() => unknown)) => unknown
}

/** Everything {@link installLoop} needs. */
export interface InstallLoopOptions {
  readonly ctx: LoopHostContext
  readonly loop: LoopService
  readonly logger: WorkflowLogger
  /**
   * The self-iteration service, when the composition arms one. Mounted as its own
   * exact route and nothing else: no tool, no unload sweep, no archive cleanup —
   * the self-iteration beat is the repository's own workflow and deliberately
   * outlives the plugin (`docs/knowledge/HEARTBEATS.md` §1); it is disarmed by the
   * same switch that armed it, or through DSH's own Automation tasks.
   */
  readonly iterate?: LoopService
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
export function installLoop(options: InstallLoopOptions): void {
  const { ctx, loop, logger } = options

  const onArchived = (request: { readonly sessionId?: unknown }): void => {
    const sessionId = typeof request?.sessionId === 'string' ? request.sessionId : ''
    if (sessionId === '') return
    void loop.forgetSession(sessionId).catch((error: unknown) => {
      logger.warn(`loop cleanup for archived session ${sessionId} failed: ${redactError(error)}`)
    })
  }
  ctx.on?.('workspace/session-stop', onArchived)
  ctx.on?.('workspace/session-archived', onArchived)

  ctx.effect?.(() => async () => {
    try {
      await loop.stopAll('plugin unload')
    } catch (error) {
      logger.warn(`loop cleanup on unload failed: ${redactError(error)}`)
    }
  })

  const mount = (services: readonly string[], callback: (child: LoopHostContext) => void): void => {
    if (typeof ctx.inject !== 'function') return
    const inject = ctx.inject as (deps: readonly string[], cb: (child: LoopHostContext) => void) => unknown
    inject(services, callback)
  }

  mount(['schedule', 'tools'], (child) => {
    // Registered inside `effect` so the tool is withdrawn with the fiber that mounted
    // it (a Schedule reload restarts this child); `ctx.effect` is the only lifetime the
    // tool registry itself gives us.
    child.effect?.(() => asDisposer(child.tools?.register(createLoopTool(loop))))
  })

  mount(['webServer', 'connection'], (child) => {
    const webServer = child.webServer
    if (webServer === undefined) return
    const connection = child.connection
    const register = (): undefined | (() => unknown) => {
      const dispose = webServer.register({
        kind: 'exact',
        path: LOOP_ROUTE_PATH,
        handler: (req, res) => handleLoopRoute(loop, connection, req, res),
      })
      if (options.iterate !== undefined) {
        const iterate = options.iterate
        const iterateDispose = webServer.register({
          kind: 'exact',
          path: ITERATE_ROUTE_PATH,
          handler: (req, res) => handleLoopRoute(iterate, connection, req, res, dispatchIterateAction),
        })
        return asDisposer(dispose) === undefined && asDisposer(iterateDispose) === undefined
          ? undefined
          : () => {
            asDisposer(dispose)?.()
            asDisposer(iterateDispose)?.()
          }
      }
      return asDisposer(dispose)
    }
    // `register` returns the route disposer; handing it to `effect` ties the route to
    // this plugin's lifetime instead of leaving it registered after an unload.
    child.effect?.(register)
  })
}

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
export function createLoopTool(loop: LoopService) {
  return defineTool({
    name: LOOP_TOOL_NAME,
    description: [
      'Read or stop this session\'s loop heartbeat (a durable schedule that resumes unfinished work).',
      'The heartbeat can only be opened by the user from the composer switch; `open` here is refused by design.',
    ].join(' '),
    parameters: {
      action: {
        type: 'string' as const,
        required: true as const,
        enum: ['status', 'close', 'open'],
        description: 'status reads the loop, close deletes it, open is refused (user-only).',
      },
      sessionId: {
        type: 'string' as const,
        description: 'Session whose loop is read. Defaults to the calling session; an agent may only address its own.',
      },
      intervalMinutes: {
        type: 'number' as const,
        description: 'Only meaningful for `open`, which this tool refuses.',
      },
      prompt: {
        type: 'string' as const,
        description: 'Only meaningful for `open`, which this tool refuses.',
      },
    },
    output: {
      schema: { type: 'json' as const },
      render: (_args, value) => [{ type: 'text' as const, text: renderLoopResult(value as unknown as LoopToolResult) }],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec: ToolRunContext) {
      const agentSessionId = String(exec.agent?.session?.id ?? '')
      if (agentSessionId === '') throw new Error(`${LOOP_TOOL_NAME} requires a calling agent`)
      const action = String(args.action ?? '')
      const requested = typeof args.sessionId === 'string' && args.sessionId.trim() !== ''
        ? args.sessionId.trim()
        : agentSessionId
      if (action === 'open') {
        throw new LoopError(
          'loop/user-only',
          "a loop heartbeat can be opened only by the user from the composer switch; an agent cannot open one on the user's behalf",
        )
      }
      if (action !== 'status' && action !== 'close') {
        throw new Error(`${LOOP_TOOL_NAME} action must be one of status, close, open (got "${action}")`)
      }
      if (requested !== agentSessionId) {
        throw new Error(`${LOOP_TOOL_NAME} may only address the calling session; "${requested}" is not "${agentSessionId}"`)
      }
      const loopState = action === 'close'
        ? await loop.close({ sessionId: requested }, agentSessionId)
        : await loop.status({ sessionId: requested })
      // The tool output is a JSON canonical value; the snapshot is plain data, cast at
      // this one boundary exactly as the workflow tool casts its report.
      return { ok: true, action, loop: loopState } as never
    },
  })
}

/** Tool result: the action taken plus the loop as it stands afterwards. */
export interface LoopToolResult {
  readonly ok: boolean
  readonly action?: string
  readonly loop?: LoopSnapshot
}

/** One text block for the model; no second report format. */
function renderLoopResult(result: LoopToolResult): string {
  const loop = result.loop
  if (loop === undefined) return 'Loop heartbeat: no state was read.'
  if (!loop.open) {
    return `Loop heartbeat: closed for session ${loop.sessionId}.`
  }
  const every = loop.intervalMinutes === undefined ? 'unknown interval' : `every ${loop.intervalMinutes} min`
  const rounds = loop.rounds === undefined ? 'unbounded' : `${loop.rounds} round${loop.rounds === 1 ? '' : 's'} at most`
  const next = loop.nextAt === undefined ? 'next occurrence unknown' : `next at ${loop.nextAt}`
  return `Loop heartbeat: open for session ${loop.sessionId} (${every}, ${rounds}; ${next}).`
}

/**
 * Answer one browser request.
 *
 * The body is one JSON object: `{ action, sessionId, intervalMinutes?, prompt? }`.
 * `open` and `close` mutate; `status` only reads. Deliberately no GET form: a status
 * read and a toggle share one body shape, so the switch has one code path.
 *
 * Exported as the production-path test seam: the page-level tests drive this exact
 * handler behind a real HTTP server with the page's own `fetch`, so a hand-mocked
 * success can never stand in for the transport (the v0.11.21 lesson).
 * @param loop - the service this route acts on.
 * @param connection - the trust fence, when the composition has one.
 * @param req - the request.
 * @param res - the response.
 * @param dispatch - action dispatch; the iterate route passes one that ignores
 *   `prompt`/`intervalMinutes`, so the stored template governs every open.
 */
export async function handleLoopRoute(
  loop: LoopService,
  connection: LoopConnection | undefined,
  req: IncomingMessage,
  res: ServerResponse,
  dispatch: typeof dispatchLoopAction = dispatchLoopAction,
): Promise<void> {
  try {
    const rejection = connection?.requestRejection(req)
    if (rejection !== undefined) {
      res.statusCode = rejection
      res.end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, code: 'loop/method', error: 'POST only' })
      return
    }
    const body = await readJsonBody(req)
    if (body === undefined) {
      sendJson(res, 400, { ok: false, code: 'loop/body', error: 'a JSON object body is required' })
      return
    }
    const sessionId = body.sessionId
    const action = body.action
    const snapshot = await dispatch(loop, action, sessionId, body)
    sendJson(res, 200, { ok: true, action, loop: snapshot })
  } catch (error) {
    if (error instanceof BodyTooLarge) {
      sendJson(res, 413, { ok: false, code: 'loop/body', error: error.message })
      return
    }
    if (error instanceof LoopError) {
      sendJson(res, statusForLoopCode(error.code), { ok: false, code: error.code, error: error.message })
      return
    }
    sendJson(res, 500, { ok: false, code: 'loop/internal', error: redactError(error) })
  }
}

/** Route one validated action to the shared service method. */
async function dispatchLoopAction(
  loop: LoopService,
  action: unknown,
  sessionId: unknown,
  body: Record<string, unknown>,
): Promise<LoopSnapshot> {
  if (typeof sessionId !== 'string') throw new LoopError('loop/session', 'sessionId is required')
  if (action === 'status') return loop.status({ sessionId })
  if (action === 'close') return loop.close({ sessionId })
  if (action === 'open') {
    const intervalMinutes = body.intervalMinutes
    if (intervalMinutes !== undefined && typeof intervalMinutes !== 'number') {
      throw new LoopError('loop/interval', 'intervalMinutes must be a number')
    }
    const prompt = body.prompt
    if (prompt !== undefined && typeof prompt !== 'string') {
      throw new LoopError('loop/prompt', 'prompt must be a string')
    }
    // No actor argument: a browser request is a user action, which is exactly what
    // `open` accepts and what an Agent-attributed caller is refused for.
    return loop.open({
      sessionId,
      ...intervalMinutes === undefined ? {} : { intervalMinutes },
      ...prompt === undefined ? {} : { prompt },
    })
  }
  throw new LoopError('loop/action', `unknown action ${JSON.stringify(action)}; expected open, close or status`)
}

/**
 * Route one validated action to the self-iteration service.
 *
 * The body carries only `{ action, sessionId }`: no prompt, no interval override.
 * The template persisted in the profile is the one source of the stored prompt, so
 * a stray field in a request can never arm a heartbeat that disagrees with what the
 * settings page shows.
 */
export async function dispatchIterateAction(
  loop: LoopService,
  action: unknown,
  sessionId: unknown,
): Promise<LoopSnapshot> {
  if (typeof sessionId !== 'string') throw new LoopError('loop/session', 'sessionId is required')
  if (action === 'status') return loop.status({ sessionId })
  if (action === 'close') return loop.close({ sessionId })
  if (action === 'open') return loop.open({ sessionId })
  throw new LoopError('loop/action', `unknown action ${JSON.stringify(action)}; expected open, close or status`)
}

/** HTTP status for one stated loop failure. */
function statusForLoopCode(code: string): number {
  switch (code) {
    case 'loop/user-only': return 403
    case 'loop/unavailable': return 503
    case 'loop/schedule-refused': return 409
    case 'loop/internal': return 500
    default: return 400
  }
}

/** Read one bounded JSON object body; `undefined` for anything else. */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const raw = await new Promise<string>((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new BodyTooLarge())
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
    req.on('aborted', () => reject(new Error('aborted')))
  })
  if (raw.trim() === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  return parsed as Record<string, unknown>
}

/** Accept a registry disposer of unknown shape, or nothing to dispose. */
function asDisposer(value: unknown): undefined | (() => unknown) {
  return typeof value === 'function' ? value as () => unknown : undefined
}

/** JSON response with `no-store`, because a loop's state is a live fact. */
function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}
