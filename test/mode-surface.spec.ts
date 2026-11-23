/**
 * The workflow master switch's Host surface (`POST /grok-workflow/mode`).
 *
 * What this file owns, and why each assertion is here rather than in
 * `test/gate.spec.ts` or `test/command.spec.ts`:
 * - `src/mode.ts` owns the durable record (`test/mode.spec.ts`), the command owns
 *   the typed path and the gate owns the read (`mode-off`). Neither of those can
 *   prove the *button* path, which is a browser request with no acting Agent: this
 *   route must write the same record, answer the read-back, and report the live
 *   `grokDefault` fallback when no record exists.
 * - The gate integration case below is the one fact spanning two modules: a switch
 *   set off through this route is what `classifyPreStep` reads on the next message.
 *   That is the "no second source" acceptance in executable form.
 *
 * No model, no network, no timers: the request pair is a `Readable` plus a small
 * response recorder, and the session store is a map over real `Session` objects.
 */
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import type { Session } from '@deepseek-ai/dsh-session'
import { Session as SessionClass } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { grokCommand } from '../src/command.js'
import { resolveConfig } from '../src/config.js'
import { classifyPreStep } from '../src/gate.js'
import { readModeRecord } from '../src/mode.js'
import { handleModeRoute, installModeRoute, MODE_ROUTE_PATH } from '../src/mode-surface.js'
import type { ModeHostContext, ModeRouteDeps, ModeState } from '../src/mode-surface.js'

/* ------------------------------------------------------------- transport -- */

interface FakeResponse {
  statusCode: number
  headers: Record<string, string>
  setHeader(name: string, value: string): void
  end(chunk?: string): void
  readonly body: string
}

function fakeResponse(): FakeResponse {
  const chunks: string[] = []
  return {
    statusCode: 0,
    headers: {},
    setHeader(name, value) { this.headers[name] = value },
    end(chunk) { if (chunk !== undefined) chunks.push(chunk) },
    get body() { return chunks.join('') },
  }
}

function fakeRequest(method: string, body?: unknown, url?: string): never {
  const payload = body === undefined
    ? []
    : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]
  const stream = Readable.from(payload)
  return Object.assign(stream, {
    method,
    headers: {},
    url: url ?? MODE_ROUTE_PATH,
    destroy: () => {},
  }) as never
}

/* ---------------------------------------------------------------- fixtures -- */

const SESSION = '7f2c5b64-1111-2222-3333-444455556666'
const OTHER_SESSION = '9a1db8e2-aaaa-bbbb-cccc-ddddeeeeffff'

function session(id = SESSION): Session {
  return SessionClass.create(id as never)
}

/** A live-session lookup over an explicit list; `undefined` proves the miss path. */
function storeOf(sessions: readonly Session[]): { get(id: string): Session | undefined } {
  return { get: (id: string) => sessions.find(candidate => String(candidate.id) === id) }
}

function deps(
  sessions: readonly Session[],
  fallback = true,
  extra: Partial<ModeRouteDeps> = {},
): ModeRouteDeps {
  return { sessions: storeOf(sessions), fallback: () => fallback, ...extra }
}

async function call(
  routeDeps: ModeRouteDeps,
  method: string,
  body?: unknown,
  url?: string,
): Promise<{ status: number; body: string; json: Record<string, unknown> | undefined; response: FakeResponse }> {
  const response = fakeResponse()
  await handleModeRoute(routeDeps, fakeRequest(method, body, url), response as never)
  let json: Record<string, unknown> | undefined
  try {
    json = JSON.parse(response.body) as Record<string, unknown>
  } catch {
    json = undefined
  }
  return { status: response.statusCode, body: response.body, json, response }
}

function modeOf(result: { json: Record<string, unknown> | undefined }): ModeState {
  const mode = result.json?.mode
  expect(mode).toBeTypeOf('object')
  return mode as ModeState
}

/* ------------------------------------------------------------------ reads -- */

describe('switch status: one record, and the live fallback when there is none', () => {
  it('reports the deployment default when the session has no record', async () => {
    const target = session()
    const on = await call(deps([target], true), 'POST', { action: 'status', sessionId: SESSION })
    expect(on.status).toBe(200)
    expect(on.json).toMatchObject({ ok: true, action: 'status' })
    expect(modeOf(on)).toEqual({
      enabled: true,
      source: 'default',
      setBy: null,
      turn: null,
      workflowMode: null,
      fallback: true,
    })
    // Reading never writes: the session's log still has no mode record.
    expect(readModeRecord(target)).toBeUndefined()

    const off = await call(deps([target], false), 'POST', { action: 'status', sessionId: SESSION })
    expect(modeOf(off)).toMatchObject({ enabled: false, source: 'default', fallback: false })
  })

  it('reports the record over the fallback, in both directions', async () => {
    const target = session()
    await call(deps([target], true), 'POST', { action: 'set', sessionId: SESSION, enabled: false })
    const read = await call(deps([target], true), 'POST', { action: 'status', sessionId: SESSION })
    expect(modeOf(read)).toMatchObject({
      enabled: false,
      source: 'record',
      setBy: 'switch:mode',
      fallback: true,
    })

    await call(deps([target], false), 'POST', { action: 'set', sessionId: SESSION, enabled: true })
    const again = await call(deps([target], false), 'POST', { action: 'status', sessionId: SESSION })
    expect(modeOf(again)).toMatchObject({ enabled: true, source: 'record', fallback: false })
  })

  it('leaves another session\'s switch untouched', async () => {
    const first = session(SESSION)
    const second = session(OTHER_SESSION)
    await call(deps([first, second], true), 'POST', { action: 'set', sessionId: SESSION, enabled: false })
    const secondRead = await call(deps([first, second], true), 'POST', { action: 'status', sessionId: OTHER_SESSION })
    expect(modeOf(secondRead)).toMatchObject({ enabled: true, source: 'default' })
    expect(readModeRecord(second)).toBeUndefined()
  })
})

/* ----------------------------------------------------------------- writes -- */

describe('switch set: writes the same durable record the command writes', () => {
  it('off writes { enabled:false, setBy:"switch:mode" } and carries no workflow shape', async () => {
    const target = session()
    const result = await call(deps([target], true), 'POST', { action: 'set', sessionId: SESSION, enabled: false })
    expect(result.status).toBe(200)
    expect(result.json).toMatchObject({ ok: true, action: 'set' })
    expect(modeOf(result)).toEqual({
      enabled: false,
      source: 'record',
      setBy: 'switch:mode',
      // The route has no acting agent: the record's informational turn is 0.
      turn: 0,
      workflowMode: null,
      fallback: true,
    })
    // The response is the read-back, not the request: the session's own log says it.
    expect(readModeRecord(target)).toMatchObject({ v: 1, enabled: false, setBy: 'switch:mode', turn: 0 })
    expect(readModeRecord(target)?.workflowMode).toBeUndefined()
  })

  it('on selects the full workflow, exactly like an explicit `/grok`', async () => {
    const target = session()
    const result = await call(deps([target], false), 'POST', { action: 'set', sessionId: SESSION, enabled: true })
    expect(modeOf(result)).toMatchObject({
      enabled: true,
      source: 'record',
      setBy: 'switch:mode',
      turn: 0,
      workflowMode: 'full',
      fallback: false,
    })
    expect(readModeRecord(target)).toMatchObject({ enabled: true, setBy: 'switch:mode', workflowMode: 'full' })
  })

  it('refuses a non-boolean `enabled` without touching the record', async () => {
    const target = session()
    for (const enabled of ['false', 0, null, {}]) {
      const refused = await call(deps([target], true), 'POST', { action: 'set', sessionId: SESSION, enabled })
      expect(refused.status).toBe(400)
      expect(refused.json).toMatchObject({ ok: false, code: 'mode/enabled' })
    }
    expect(readModeRecord(target)).toBeUndefined()
  })

  it('answers mode/write when the session refuses the append, and does not claim the state', async () => {
    // A real Session that accepts the append but never shows the record back —
    // the "a session can accept an append without committing it" case `setMode`
    // exists to catch. Only a real instance can stand in: the brand check inside
    // `appendPluginRecord` rejects a structural double.
    const refusing = session()
    Object.defineProperty(refusing, 'ownEvents', { value: () => [], configurable: true })
    const routeDeps: ModeRouteDeps = {
      sessions: { get: () => refusing },
      fallback: () => true,
    }
    const result = await call(routeDeps, 'POST', { action: 'set', sessionId: SESSION, enabled: false })
    expect(result.status).toBe(503)
    expect(result.json).toMatchObject({ ok: false, code: 'mode/write' })
    expect(String(result.json?.error)).toContain('not readable back')
    // No state is reported on failure, so a button cannot show a toggle nobody wrote.
    expect(result.json?.mode).toBeUndefined()
  })
})

/* --------------------------------------------------------------- refusals -- */

describe('switch route refusals', () => {
  it('reads the switch over GET, so a method-refusing middle box cannot blank the button', async () => {
    const target = session()
    const result = await call(
      deps([target], true),
      'GET',
      undefined,
      `${MODE_ROUTE_PATH}?action=status&sessionId=${SESSION}`,
    )
    expect(result.status).toBe(200)
    expect(result.json).toMatchObject({ ok: true, action: 'status' })
    expect(modeOf(result)).toMatchObject({ enabled: true, source: 'default' })
    // A read never writes: the record is still absent afterwards.
    expect(readModeRecord(target)).toBeUndefined()
  })

  it('refuses a write over GET and any other method, and says which method it refused', async () => {
    const target = session()
    const written = await call(
      deps([target], true),
      'GET',
      undefined,
      `${MODE_ROUTE_PATH}?action=set&sessionId=${SESSION}&enabled=true`,
    )
    expect(written.status).toBe(405)
    expect(written.json).toMatchObject({ ok: false, code: 'mode/method' })
    // RFC 9110: a 405 names the methods the resource does accept. Without it the
    // answer is the same unexplained 405 the operator reported.
    expect(written.response.headers['allow']).toBe('GET, POST')
    expect(readModeRecord(target)).toBeUndefined()

    const warned: string[] = []
    const put = await call(
      deps([target], true, { logger: { warn: (message: string) => { warned.push(message) } } as never }),
      'PUT',
      { action: 'status', sessionId: SESSION },
    )
    expect(put.status).toBe(405)
    expect(put.json).toMatchObject({ ok: false, code: 'mode/method' })
    expect(put.response.headers['allow']).toBe('GET, POST')
    // The refused request itself is recorded: an unexplained 405 was the reported bug.
    expect(warned.some(message => message.includes('PUT'))).toBe(true)
  })

  it('rejects an unknown action and a body that is not a JSON object', async () => {
    const target = session()
    const unknown = await call(deps([target], true), 'POST', { action: 'toggle', sessionId: SESSION })
    expect(unknown.status).toBe(400)
    expect(unknown.json).toMatchObject({ ok: false, code: 'mode/action' })

    const notJson = await call(deps([target], true), 'POST', 'not json')
    expect(notJson.status).toBe(400)
    expect(notJson.json).toMatchObject({ ok: false, code: 'mode/body' })

    const arrayBody = await call(deps([target], true), 'POST', '[1,2]')
    expect(arrayBody.status).toBe(400)
    expect(arrayBody.json).toMatchObject({ ok: false, code: 'mode/body' })

    const empty = await call(deps([target], true), 'POST')
    expect(empty.status).toBe(400)
    expect(empty.json).toMatchObject({ ok: false, code: 'mode/body' })
  })

  it('names a missing sessionId separately from an unknown session', async () => {
    const target = session()
    const missing = await call(deps([target], true), 'POST', { action: 'status' })
    expect(missing.status).toBe(400)
    expect(missing.json).toMatchObject({ ok: false, code: 'mode/request' })

    const unknown = await call(deps([target], true), 'POST', { action: 'status', sessionId: OTHER_SESSION })
    expect(unknown.status).toBe(404)
    expect(unknown.json).toMatchObject({ ok: false, code: 'mode/session', error: expect.stringContaining(OTHER_SESSION) })
  })

  it('says the Host has no session store rather than answering an invented state', async () => {
    const unavailable = await call({ fallback: () => true }, 'POST', { action: 'status', sessionId: SESSION })
    expect(unavailable.status).toBe(503)
    expect(unavailable.json).toMatchObject({ ok: false, code: 'mode/unavailable' })
  })

  it('states an unreadable configuration rather than guessing a default', async () => {
    const target = session()
    const broken = () => { throw new Error('config is invalid') }
    const result = await call({ sessions: storeOf([target]), fallback: broken }, 'POST', {
      action: 'status',
      sessionId: SESSION,
    })
    expect(result.status).toBe(503)
    expect(result.json).toMatchObject({ ok: false, code: 'mode/config' })
  })

  it('still answers a written record when the configuration is unreadable', async () => {
    // The switch must not depend on the config being valid: a broken edit would
    // otherwise make a switch the user just set look unset.
    const target = session()
    const broken = () => { throw new Error('config is invalid') }
    await call(deps([target], true), 'POST', { action: 'set', sessionId: SESSION, enabled: false })
    const read = await call({ sessions: storeOf([target]), fallback: broken }, 'POST', {
      action: 'status',
      sessionId: SESSION,
    })
    expect(read.status).toBe(200)
    expect(modeOf(read)).toMatchObject({ enabled: false, source: 'record', fallback: null })
  })

  it('refuses a request the composition\'s fence rejects, before any read', async () => {
    const target = session()
    const result = await call(
      deps([target], true, { connection: { requestRejection: () => 403 } }),
      'POST',
      { action: 'set', sessionId: SESSION, enabled: false },
    )
    expect(result.status).toBe(403)
    expect(result.body).toBe('')
    expect(readModeRecord(target)).toBeUndefined()
  })
})

/* ----------------------------------------------------------------- wiring -- */

interface FakeRoute {
  kind: string
  path: string
  handler: (req: unknown, res: FakeResponse) => void | Promise<void>
}

function wiring(options: { webServer?: boolean; sessions?: Session[] } = {}) {
  const routes: FakeRoute[] = []
  const effects: (() => unknown)[] = []
  const webServer = {
    register: (route: FakeRoute) => {
      routes.push(route)
      return () => {}
    },
  }
  const sessions = options.sessions ?? []
  const child: ModeHostContext = {
    ...options.webServer === false ? {} : { webServer: webServer as unknown as NonNullable<ModeHostContext['webServer']> },
    connection: { requestRejection: () => undefined },
    sessions: storeOf(sessions),
    effect: ((installer: () => unknown) => {
      const disposer = installer()
      if (typeof disposer === 'function') effects.push(disposer as () => unknown)
      return disposer
    }) as unknown as NonNullable<ModeHostContext['effect']>,
  }
  const ctx: ModeHostContext = {
    sessions: storeOf(sessions),
    inject: (_deps: readonly string[], callback: (child: ModeHostContext) => void) => { callback(child) },
    effect: ((installer: () => unknown) => {
      const disposer = installer()
      if (typeof disposer === 'function') effects.push(disposer as () => unknown)
      return disposer
    }) as unknown as NonNullable<ModeHostContext['effect']>,
  }
  installModeRoute({ ctx, fallback: () => true })
  return { routes, effects }
}

describe('mounting the switch route', () => {
  it('registers one exact route on the switch path, tied to the plugin lifetime', () => {
    const wired = wiring()
    expect(wired.routes).toHaveLength(1)
    expect(wired.routes[0]!.kind).toBe('exact')
    expect(wired.routes[0]!.path).toBe(MODE_ROUTE_PATH)
    expect(MODE_ROUTE_PATH).toBe('/grok-workflow/mode')
    expect(wired.effects).toHaveLength(1)
  })

  it('registers nothing without a web server, and stays inert without `inject`', () => {
    expect(wiring({ webServer: false }).routes).toHaveLength(0)
    const noInject: ModeHostContext = {}
    expect(() => installModeRoute({ ctx: noInject, fallback: () => true })).not.toThrow()
  })

  it('warns when the composition has no web server, so a silent 405 is diagnosable', () => {
    const warned: string[] = []
    const child: ModeHostContext = {
      connection: { requestRejection: () => undefined },
      effect: (() => {}) as unknown as NonNullable<ModeHostContext['effect']>,
    }
    const ctx: ModeHostContext = {
      inject: (_deps: readonly string[], callback: (child: ModeHostContext) => void) => { callback(child) },
    }
    installModeRoute({ ctx, fallback: () => true, logger: { warn: (message: string) => { warned.push(message) } } as never })
    expect(warned.some(message => message.includes('no webServer'))).toBe(true)
  })

  it('mounts without a `sessions` service and resolves the store when the request arrives', async () => {
    const target = session()
    const routes: FakeRoute[] = []
    const webServer = {
      register: (route: FakeRoute) => {
        routes.push(route)
        return () => {}
      },
    }
    // The reported 405: a composition that reaches `sessions` through `get` only. The
    // old inject list required the property itself, mounted nothing, and let the Host
    // answer the browser's POST — so the switch failed with no plugin-side explanation.
    const child: ModeHostContext = {
      webServer: webServer as unknown as NonNullable<ModeHostContext['webServer']>,
      connection: { requestRejection: () => undefined },
      get: (name: string) => (name === 'sessions' ? storeOf([target]) : undefined),
      effect: ((installer: () => unknown) => {
        installer()
        return () => {}
      }) as unknown as NonNullable<ModeHostContext['effect']>,
    }
    const ctx: ModeHostContext = {
      inject: (_deps: readonly string[], callback: (child: ModeHostContext) => void) => { callback(child) },
    }
    installModeRoute({ ctx, fallback: () => true })
    expect(routes).toHaveLength(1)

    const read = fakeResponse()
    await routes[0]!.handler(
      fakeRequest('GET', undefined, `${MODE_ROUTE_PATH}?action=status&sessionId=${SESSION}`),
      read,
    )
    expect(read.statusCode).toBe(200)
    expect(JSON.parse(read.body)).toMatchObject({ ok: true, mode: { enabled: true } })
  })

  it('answers a composition with no store at all as unavailable, never as a missing session', async () => {
    const routes: FakeRoute[] = []
    const child: ModeHostContext = {
      webServer: { register: (route: FakeRoute) => { routes.push(route); return () => {} } } as unknown as NonNullable<ModeHostContext['webServer']>,
      connection: { requestRejection: () => undefined },
      effect: ((installer: () => unknown) => {
        installer()
        return () => {}
      }) as unknown as NonNullable<ModeHostContext['effect']>,
    }
    installModeRoute({
      ctx: { inject: (_deps: readonly string[], callback: (child: ModeHostContext) => void) => { callback(child) } },
      fallback: () => true,
    })
    const answer = fakeResponse()
    await routes[0]!.handler(fakeRequest('POST', { action: 'status', sessionId: SESSION }), answer)
    expect(answer.statusCode).toBe(503)
    expect(JSON.parse(answer.body)).toMatchObject({ ok: false, code: 'mode/unavailable' })
  })

  it('drives the switch through the registered handler', async () => {    const target = session()
    const wired = wiring({ sessions: [target] })
    const route = wired.routes[0]!
    const off = fakeResponse()
    await route.handler(
      fakeRequest('POST', { action: 'set', sessionId: SESSION, enabled: false }),
      off,
    )
    expect(off.statusCode).toBe(200)
    expect(readModeRecord(target)).toMatchObject({ enabled: false, setBy: 'switch:mode' })
  })
})

/* ------------------------------------------------------- gate integration -- */

describe('the gate reads the switch this route wrote', () => {
  const userMessage = (text: string): UserMessage =>
    createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } as never }) as UserMessage

  const payload = (target: Session): never => ({
    agent: { session: target },
    messages: [userMessage('do the thing')],
    turn: 1,
    step: 1,
    signal: new AbortController().signal,
  }) as never

  it('off through the route passes the next message; on admits it again', async () => {
    const target = session()
    const on = { config: resolveConfig({ grokDefault: 'on' }) }

    // No record: the live grokDefault decides, exactly as before this feature.
    expect(classifyPreStep(on, payload(target))).toMatchObject({ kind: 'admit' })

    await call(deps([target], true), 'POST', { action: 'set', sessionId: SESSION, enabled: false })
    expect(classifyPreStep(on, payload(target))).toEqual({ kind: 'pass', reason: 'mode-off' })

    await call(deps([target], true), 'POST', { action: 'set', sessionId: SESSION, enabled: true })
    expect(classifyPreStep(on, payload(target))).toMatchObject({ kind: 'admit' })

    // And the switch still wins over a deployment default in the other direction.
    await call(deps([target], true), 'POST', { action: 'set', sessionId: SESSION, enabled: false })
    expect(classifyPreStep({ config: resolveConfig({ grokDefault: 'off' }) }, payload(target)))
      .toEqual({ kind: 'pass', reason: 'mode-off' })
  })
})

/* ------------------------------------------------------------ persistence -- */

describe('the switch survives a restart, because it is the session log', () => {
  it('reads the same value from a session restored from the written events', async () => {
    const target = session()
    await call(deps([target], true), 'POST', { action: 'set', sessionId: SESSION, enabled: false })
    // A restart is a new Session built from the stored events: no memory of the
    // click exists, and the fallback is `true` (grokDefault on), so only the
    // durable record can make this read `false`.
    const restored = SessionClass.create(OTHER_SESSION as never, target.ownEvents() as never)
    const read = await call(deps([restored], true), 'POST', { action: 'status', sessionId: OTHER_SESSION })
    expect(read.status).toBe(200)
    expect(modeOf(read)).toMatchObject({ enabled: false, source: 'record', setBy: 'switch:mode', fallback: true })
  })
})

/* ---------------------------------------------------------- same source -- */

describe('the button and `/grok` write one record, never two', () => {
  it('reads back the state the command wrote, and the command reads back the button', async () => {
    const target = session()
    // `/grok off` through the real handler (no model message, no run).
    expect(grokCommand().handler({ agent: { session: target, turn: 3 }, rawInput: 'off' }))
      .toMatchObject({ kind: 'success' })
    const afterCommand = await call(deps([target], true), 'POST', { action: 'status', sessionId: SESSION })
    expect(modeOf(afterCommand)).toMatchObject({ enabled: false, source: 'record', setBy: 'command:/grok off' })

    // The button's own write, then the command's read path.
    await call(deps([target], true), 'POST', { action: 'set', sessionId: SESSION, enabled: true })
    expect(readModeRecord(target)).toMatchObject({ enabled: true, setBy: 'switch:mode', workflowMode: 'full' })

    // One record, one reader: `/grok on` is a no-op change of the same value and
    // still rewrites that same record rather than a second copy.
    expect(grokCommand().handler({ agent: { session: target, turn: 4 }, rawInput: 'on' }))
      .toMatchObject({ kind: 'success' })
    expect(readModeRecord(target)).toMatchObject({ enabled: true, setBy: 'command:/grok' })
    const final = await call(deps([target], true), 'POST', { action: 'status', sessionId: SESSION })
    expect(modeOf(final)).toMatchObject({ enabled: true, source: 'record', setBy: 'command:/grok' })
  })
})
