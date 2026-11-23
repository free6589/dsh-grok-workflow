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

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Session } from '@deepseek-ai/dsh-session'
import { readModeRecord, setMode } from './mode.js'
import type { ModeRecord } from './mode.js'
import { redactError } from './redact.js'
import type { WorkflowLogger } from './run.js'

/** Exact Host route of the composer switch. */
export const MODE_ROUTE_PATH = '/grok-workflow/mode'

/** Largest browser body this route accepts; the switch sends two short fields. */
const MAX_BODY_BYTES = 64 * 1024

/** A body past {@link MAX_BODY_BYTES}; its own answer is 413, not `mode/internal`. */
class BodyTooLarge extends Error {
  constructor() {
    super(`request body exceeds ${MAX_BODY_BYTES} bytes`)
    this.name = 'BodyTooLarge'
  }
}

/** Stable failure codes this route answers with. */
export type ModeErrorCode =
  | 'mode/method'
  | 'mode/body'
  | 'mode/action'
  | 'mode/enabled'
  | 'mode/request'
  | 'mode/session'
  | 'mode/unavailable'
  | 'mode/config'
  | 'mode/write'
  | 'mode/internal'

/** One stated refusal; the HTTP status is derived from the code, never guessed. */
export class ModeError extends Error {
  readonly code: ModeErrorCode

  constructor(code: ModeErrorCode, message: string) {
    super(message)
    this.name = 'ModeError'
    this.code = code
  }
}

/**
 * The switch as both the button and a test need to read it.
 *
 * `source` distinguishes a written record from the deployment default, so a caller
 * can say "off (session)" or "off (default)" instead of presenting one as the other.
 */
export interface ModeState {
  /** Effective value: the record's `enabled`, or the fallback when none exists. */
  enabled: boolean
  /** Where {@link enabled} came from. */
  source: 'record' | 'default'
  /** Who wrote the current record; `null` when there is none. */
  setBy: string | null
  /** Informational turn stamp of the current record; `null` when there is none. */
  turn: number | null
  /** Workflow shape an explicit enable selected; `null` when the record carries none. */
  workflowMode: 'full' | 'triage' | null
  /**
   * What an absent record would mean right now (live `grokDefault === 'on'`), or
   * `null` when the live configuration cannot be read. A written record is still
   * reported in that case: the switch does not depend on the configuration being
   * valid, and an unreadable config must not hide a switch the user did set.
   */
  fallback: boolean | null
}

/** The session lookup slice this route needs. */
export interface ModeSessionStore {
  get(id: string): Session | undefined
}

/** Everything one route request needs. */
export interface ModeRouteDeps {
  /** Live-session lookup; absent in a composition without the store. */
  readonly sessions?: ModeSessionStore | undefined
  /**
   * Live-session lookup resolved per request, when the store is a service that may
   * arrive after this route mounted. Preferred over {@link sessions} when both are
   * given, so a route never answers from a snapshot of a service that has since
   * been replaced; `undefined` means "the composition has no store right now" and
   * is answered as `mode/unavailable` (503), never as a missing session (404).
   */
  readonly resolveSessions?: (() => ModeSessionStore | undefined) | undefined
  /**
   * The effective default with no record: the same rule the gate applies, read live.
   * Kept a function so a settings edit reaches the next request.
   */
  readonly fallback: () => boolean
  /** The composition's trust fence, when it has one. */
  readonly connection?: ModeConnection | undefined
  readonly logger?: WorkflowLogger | undefined
}

/**
 * Read the effective switch for one session, without writing anything.
 *
 * Two facts, in this order: the record (authoritative when present), then the live
 * fallback. A config that cannot be read is stated only when it is *needed* —
 * with a record in hand the switch is answerable anyway, and failing that read
 * would make a set switch look unset.
 */
export function modeState(deps: Pick<ModeRouteDeps, 'fallback'>, session: Session): ModeState {
  const record = readModeRecord(session)
  let fallback: boolean | null = null
  let failure: unknown
  try {
    fallback = deps.fallback()
  } catch (error) {
    failure = error
  }
  if (record === undefined && fallback === null) {
    throw new ModeError('mode/config', `the configuration could not be read: ${redactError(failure)}`)
  }
  return {
    enabled: record === undefined ? fallback as boolean : record.enabled,
    source: record === undefined ? 'default' : 'record',
    setBy: record?.setBy ?? null,
    turn: record?.turn ?? null,
    workflowMode: record?.workflowMode ?? null,
    fallback,
  }
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
export function applyMode(
  deps: Pick<ModeRouteDeps, 'fallback' | 'logger'>,
  session: Session,
  enabled: boolean,
): ModeState {
  const record: ModeRecord = {
    v: 1,
    enabled,
    // The route has no acting Agent, so there is no turn to stamp; the field is
    // informational and every reader uses `enabled` only (see `src/mode.ts`).
    turn: 0,
    setBy: 'switch:mode',
    ...enabled ? { workflowMode: 'full' as const } : {},
  }
  const written = setMode(session, record, deps.logger)
  const current = readModeRecord(session)
  const applied = written.ok
    && current !== undefined
    && current.enabled === enabled
    && current.setBy === 'switch:mode'
  if (!applied) {
    throw new ModeError('mode/write', written.reason ?? 'the session did not record it')
  }
  return modeState(deps, session)
}

/** The route carrier slice this module registers on. */
export interface ModeWebServer {
  register(route: {
    readonly kind: 'exact'
    readonly path: string
    readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): unknown
}

/** The connection trust fence slice this module asks for a rejection. */
export interface ModeConnection {
  requestRejection(request: unknown): number | undefined
}

/**
 * The Host context slice the wiring needs, typed structurally like
 * `LoopHostContext`: `webServer`/`connection`/`sessions` are services this external
 * bundle does not own, so nothing here imports the Host's own type graph.
 */
export interface ModeHostContext {
  readonly webServer?: ModeWebServer | undefined
  readonly connection?: ModeConnection | undefined
  readonly sessions?: ModeSessionStore | undefined
  /** Cordis service lookup, the second way a mounted service is reachable. */
  readonly get?: ((name: string) => unknown) | undefined
  readonly inject?: unknown
  readonly effect?: (installer: () => undefined | (() => unknown)) => unknown
}

/** Options of {@link installModeRoute}. */
export interface InstallModeRouteOptions {
  readonly ctx: ModeHostContext
  readonly fallback: () => boolean
  readonly logger?: WorkflowLogger | undefined
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
export function installModeRoute(options: InstallModeRouteOptions): void {
  const { ctx } = options
  if (typeof ctx.inject !== 'function') return
  const inject = ctx.inject as (deps: readonly string[], cb: (child: ModeHostContext) => void) => unknown
  // Only the two services the route cannot answer without are required. The
  // live-session store is resolved per request instead: requiring it here meant that a
  // composition listing `sessions` later than this fiber mounted *nothing*, and the
  // browser's POST then fell through to the Host's own unknown-route answer — the
  // `HTTP 405` the operator saw, with no plugin-side explanation attached to it.
  inject(['webServer', 'connection'], (child) => {
    const webServer = child.webServer
    if (webServer === undefined) {
      options.logger?.warn?.(
        'grok-workflow mode route not mounted: the Host composition has no webServer service, '
        + 'so the settings-page workflow switch answers through the Host fallback instead of this plugin',
      )
      return
    }
    const resolveSessions = (): ModeSessionStore | undefined => storeOf(serviceOf(child, 'sessions'))
      ?? storeOf(serviceOf(ctx, 'sessions'))
    child.effect?.(() => asDisposer(webServer.register({
      kind: 'exact',
      path: MODE_ROUTE_PATH,
      handler: (req, res) => handleModeRoute({
        resolveSessions,
        fallback: options.fallback,
        ...child.connection === undefined ? {} : { connection: child.connection },
        ...options.logger === undefined ? {} : { logger: options.logger },
      }, req, res),
    })))
  })
}

/**
 * Read one service off a Host context, directly or through `ctx.get(name)`.
 *
 * Cordis exposes a service both as a context property and through `get`, and which of
 * the two is populated depends on the fiber that mounted it; asking both keeps the
 * route from concluding "no store" for a composition that has one.
 * @param source - the context or injected child.
 * @param name - the service name.
 * @returns the service, or `undefined` when this composition has none.
 */
function serviceOf(source: ModeHostContext | undefined, name: string): unknown {
  if (source === undefined) return undefined
  const direct = (source as unknown as Record<string, unknown>)[name]
  if (direct !== undefined && direct !== null) return direct
  return typeof source.get === 'function' ? source.get(name) : undefined
}

/** Accept a live-session lookup of unknown shape, or nothing. */
function storeOf(value: unknown): ModeSessionStore | undefined {
  const candidate = value as ModeSessionStore | undefined
  return typeof candidate?.get === 'function' ? candidate : undefined
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
export async function handleModeRoute(
  deps: ModeRouteDeps,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    // The fence is checked before anything else: a refused request must not be
    // able to read or move the switch, and it answers with the fence's own status.
    const rejection = deps.connection?.requestRejection(req)
    if (rejection !== undefined) {
      res.statusCode = rejection
      res.end()
      return
    }
    const sessions = deps.resolveSessions !== undefined ? deps.resolveSessions() : deps.sessions
    if (typeof sessions?.get !== 'function') {
      throw new ModeError('mode/unavailable', 'this Host has no live-session store, so the switch cannot read a session')
    }
    const method = (req.method ?? 'GET').toUpperCase()
    if (method !== 'POST' && method !== 'GET') {
      // Name the method and the URL being refused: the operator's report was an
      // unexplained `HTTP 405`, and the request that produced it is the one fact no
      // later investigation can recover, so it is written down here instead.
      deps.logger?.warn?.(
        `grok-workflow mode route refused ${method} ${typeof req.url === 'string' ? req.url : MODE_ROUTE_PATH}: `
        + 'this route reads with GET ?action=status&sessionId=… and writes with POST {action:"set"}',
      )
      throw new ModeError('mode/method', `${method} is not supported: read with GET, write with POST`)
    }
    const body = method === 'GET' ? readQueryBody(req) : await readJsonBody(req)
    if (body === undefined) {
      throw new ModeError('mode/body', 'a JSON object body is required')
    }
    const action = body.action
    if (action !== 'status' && action !== 'set') {
      throw new ModeError('mode/action', `unknown action ${JSON.stringify(action)}; expected status or set`)
    }
    const sessionId = body.sessionId
    if (typeof sessionId !== 'string' || sessionId.trim() === '') {
      throw new ModeError('mode/request', 'sessionId is required')
    }
    const session = sessions.get(sessionId)
    if (session === undefined) {
      throw new ModeError('mode/session', `no live session ${sessionId}`)
    }
    if (action === 'status') {
      sendJson(res, 200, { ok: true, action, mode: modeState(deps, session) })
      return
    }
    const enabled = body.enabled
    if (typeof enabled !== 'boolean') {
      throw new ModeError('mode/enabled', 'enabled must be a boolean for action "set"')
    }
    sendJson(res, 200, { ok: true, action, mode: applyMode(deps, session, enabled) })
  } catch (error) {
    if (error instanceof BodyTooLarge) {
      sendJson(res, 413, { ok: false, code: 'mode/body', error: error.message })
      return
    }
    if (error instanceof ModeError) {
      sendJson(res, statusForModeCode(error.code), { ok: false, code: error.code, error: error.message })
      return
    }
    sendJson(res, 500, { ok: false, code: 'mode/internal', error: redactError(error) })
  }
}

/** HTTP status for one stated switch failure. */
function statusForModeCode(code: ModeErrorCode): number {
  switch (code) {
    case 'mode/method': return 405
    case 'mode/body': return 400
    case 'mode/action': return 400
    case 'mode/enabled': return 400
    case 'mode/request': return 400
    case 'mode/session': return 404
    case 'mode/unavailable': return 503
    case 'mode/config': return 503
    case 'mode/write': return 503
    case 'mode/internal': return 500
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
function readQueryBody(req: IncomingMessage): Record<string, unknown> | undefined {
  const url = typeof req.url === 'string' ? req.url : ''
  const at = url.indexOf('?')
  if (at < 0) return undefined
  const query = new URLSearchParams(url.slice(at + 1))
  const action = query.get('action') ?? 'status'
  if (action !== 'status') {
    throw new ModeError('mode/method', `GET may only read: this route writes over POST (action=${JSON.stringify(action)})`)
  }
  return { action, sessionId: query.get('sessionId') ?? '' }
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

/** JSON response with `no-store`, because the switch is a live fact. */
function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}
