/**
 * Loop *surfaces*: the model-facing tool, the browser switch route, and the lifecycle
 * cleanups that stop a heartbeat outliving its owner.
 *
 * `test/loop.spec.ts` owns the service's own semantics (rule shape, policy, state
 * machine, cleanup counting). This file owns the two callers of that one service and the
 * wiring around it:
 * - the tool must refuse `open` and may only address its own session;
 * - the route is the user path, so it opens without an acting Agent, and it sits behind
 *   the composition's connection fence;
 * - unload deletes every heartbeat, archive/stop delete one session's heartbeat.
 *
 * No timers, no network, no model: a recording fake stands in for Schedule, and the HTTP
 * pair is a `Readable` plus a tiny response recorder.
 */
import { Readable } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import {
  createLoopService, DEFAULT_LOOP_INTERVAL_MINUTES, defaultLoopPrompt, ITERATE_ROUTE_PATH, ITERATE_TASK_TITLE,
  LOOP_PROMPT_PREFIX, LOOP_ROUTE_PATH, LOOP_TASK_TITLE,
  LOOP_TOOL_NAME, loopRrule, scheduleServiceOf,
} from '../src/loop.js'
import type { LoopScheduleCreate, LoopScheduleEdit, LoopScheduleLike, LoopScheduleTask, LoopSnapshot } from '../src/loop.js'
import { createLoopTool, installLoop } from '../src/loop-surface.js'
import type { LoopHostContext } from '../src/loop-surface.js'
import type { WorkflowLogger } from '../src/run.js'

const NOW = Date.UTC(2026, 10, 18, 23, 0, 0)
const SESSION = '2d7bd1e7-1111-2222-3333-444455556666'
const OTHER = '3c296b9a-aaaa-bbbb-cccc-ddddeeeeffff'

class FakeSchedule implements LoopScheduleLike {
  readonly tasks = new Map<string, LoopScheduleTask>()
  readonly createCalls: { request: LoopScheduleCreate; actorSessionId?: string }[] = []
  readonly editCalls: LoopScheduleEdit[] = []
  /** Set to make `create` refuse, so the route's refusal mapping is reachable. */
  failCreate?: Error
  private seq = 0

  async create(request: LoopScheduleCreate, actorSessionId?: string): Promise<LoopScheduleTask> {
    this.createCalls.push({ request, ...actorSessionId === undefined ? {} : { actorSessionId } })
    if (this.failCreate !== undefined) throw this.failCreate
    const id = `task-${++this.seq}`
    const task: LoopScheduleTask = {
      id,
      title: request.title,
      prompt: request.prompt,
      kind: 'rrule',
      rrule: request.timing.rrule,
      scheduledAt: '2026-11-19T00:00:00.000Z',
      status: 'active',
      createdAt: '2026-11-18T23:00:00.000Z',
      target: request.target,
    }
    this.tasks.set(id, task)
    return task
  }

  async catalog(): Promise<LoopScheduleTask[]> {
    return [...this.tasks.values()]
  }

  async edit(request: LoopScheduleEdit): Promise<unknown> {
    this.editCalls.push(request)
    const task = this.tasks.get(request.id)
    if (request.action === 'delete') {
      this.tasks.delete(request.id)
      return { id: request.id, deleted: true }
    }
    if (task === undefined) return { id: request.id, code: 'schedule_not_found' }
    const patched: LoopScheduleTask = {
      ...task,
      status: request.patch.active === true ? 'active' : task.status,
    }
    this.tasks.set(task.id, patched)
    return patched
  }
}

function logger(): { logger: WorkflowLogger; warnings: string[] } {
  const warnings: string[] = []
  return { logger: { warn: (message: string) => warnings.push(message), info: () => {} }, warnings }
}

function serviceFor(schedule: LoopScheduleLike | undefined) {
  const { logger: log } = logger()
  return createLoopService({
    schedule: () => schedule,
    logger: log,
    now: () => NOW,
    policy: () => ({ intervalMinutes: DEFAULT_LOOP_INTERVAL_MINUTES, rounds: 10, failStreak: 3 }),
  })
}

/* ----------------------------------------------------------------------- tool -- */

describe('the agent tool cannot open or reach outside its own session', () => {
  const exec = (sessionId: string | undefined) => (sessionId === undefined ? {} : { agent: { session: { id: sessionId } } })

  it('refuses open before the service is touched', async () => {
    const schedule = new FakeSchedule()
    const tool = createLoopTool(serviceFor(schedule))
    await expect(tool.execute({ action: 'open' } as never, exec(SESSION) as never))
      .rejects.toMatchObject({ code: 'loop/user-only' })
    expect(schedule.createCalls).toHaveLength(0)
    expect(schedule.editCalls).toHaveLength(0)
  })

  it('reads and closes the calling session loop through the shared service', async () => {
    const schedule = new FakeSchedule()
    const loop = serviceFor(schedule)
    await loop.open({ sessionId: SESSION })
    const tool = createLoopTool(loop)

    const read = await tool.execute({ action: 'status' } as never, exec(SESSION) as never) as unknown as {
      ok: boolean
      action: string
      loop: LoopSnapshot
    }
    expect(read.ok).toBe(true)
    expect(read.loop).toMatchObject({ open: true, intervalMinutes: 60, rounds: 10 })

    const closed = await tool.execute({ action: 'close' } as never, exec(SESSION) as never) as unknown as { loop: LoopSnapshot }
    expect(closed.loop.open).toBe(false)
    expect(schedule.tasks.size).toBe(0)
  })

  it('names the session in the tool description and refuses a foreign target', async () => {
    const tool = createLoopTool(serviceFor(new FakeSchedule()))
    expect(tool.name).toBe(LOOP_TOOL_NAME)
    await expect(tool.execute({ action: 'status', sessionId: OTHER } as never, exec(SESSION) as never))
      .rejects.toThrow(/calling session/)
    await expect(tool.execute({ action: 'status' } as never, exec(undefined) as never))
      .rejects.toThrow(/calling agent/)
    // The schema refuses an unknown action before `execute` runs; the executor keeps its
    // own branch as a second line of defence for a direct call.
    await expect(tool.execute({ action: 'restart' } as never, exec(SESSION) as never))
      .rejects.toThrow(/action/)
  })

  it('states a closed loop in one line rather than an empty report', async () => {
    const tool = createLoopTool(serviceFor(new FakeSchedule()))
    const result = await tool.execute({ action: 'status' } as never, exec(SESSION) as never) as unknown as {
      output: { render(args: unknown, value: unknown): { type: string; text: string }[] }
    }
    const value = { ok: true, action: 'status', loop: { open: false, sessionId: SESSION } }
    const render = tool.output.render({}, value) as { text: string }[]
    expect(render[0]!.text).toContain('closed')
    void result
  })
})

/* ---------------------------------------------------------------------- wiring -- */

interface FakeRoute {
  kind: string
  path: string
  handler: (req: unknown, res: FakeResponse) => void | Promise<void>
}

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

function fakeRequest(method: string, body?: unknown): unknown {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  return Object.assign(stream, { method, headers: {}, destroy: () => {} })
}

function wiring(schedule: LoopScheduleLike | undefined, rejection?: number) {
  const { logger: log } = logger()
  const loop = serviceFor(schedule)
  const routes: FakeRoute[] = []
  const tools: unknown[] = []
  const listeners = new Map<string, (request: { sessionId?: unknown }) => unknown>()
  const effects: (() => unknown)[] = []
  const webServer = {
    register: (route: FakeRoute) => {
      routes.push(route)
      return () => {}
    },
  }
  const connection = { requestRejection: () => rejection }
  const child: LoopHostContext = {
    webServer: webServer as unknown as NonNullable<LoopHostContext['webServer']>,
    connection,
    tools: { register: (tool: unknown) => { tools.push(tool); return () => {} } },
    effect: ((installer: () => unknown) => {
      const disposer = installer()
      if (typeof disposer === 'function') effects.push(disposer as () => unknown)
      return disposer
    }) as unknown as NonNullable<LoopHostContext['effect']>,
  }
  const ctx: LoopHostContext = {
    webServer: webServer as unknown as NonNullable<LoopHostContext['webServer']>,
    connection,
    inject: (_deps: readonly string[], callback: (child: LoopHostContext) => void) => { callback(child) },
    on: (event: string, listener: (request: { sessionId?: unknown }) => unknown) => {
      listeners.set(event, listener)
      return () => {}
    },
    effect: ((installer: () => unknown) => {
      const disposer = installer()
      if (typeof disposer === 'function') effects.push(disposer as () => unknown)
      return disposer
    }) as unknown as NonNullable<LoopHostContext['effect']>,
  }
  installLoop({ ctx, loop, logger: log })
  return { loop, routes, tools, listeners, effects }
}

/**
 * Both switches mounted on one composition: two services, two routes, one Schedule.
 *
 * This is the isolation the operator depends on — the Loop switch must never close the
 * RSI task, and the Self-iterate switch must never close the loop — proven at the layer
 * that actually dispatches a browser click (the route handler), not only in the service.
 */
function wiringBoth(schedule: LoopScheduleLike) {
  const { logger: log } = logger()
  const loop = serviceFor(schedule)
  const iterate = createLoopService({
    schedule: () => schedule,
    logger: log,
    now: () => NOW,
    identity: { title: ITERATE_TASK_TITLE, defaultPrompt: () => '# RSI heartbeat — self-iteration round' },
    policy: () => ({ intervalMinutes: DEFAULT_LOOP_INTERVAL_MINUTES, rounds: 10, failStreak: 3 }),
  })
  const routes: FakeRoute[] = []
  const tools: unknown[] = []
  const effects: (() => unknown)[] = []
  const webServer = {
    register: (route: FakeRoute) => {
      routes.push(route)
      return () => {}
    },
  }
  const connection = { requestRejection: () => undefined }
  const child: LoopHostContext = {
    webServer: webServer as unknown as NonNullable<LoopHostContext['webServer']>,
    connection,
    tools: { register: (tool: unknown) => { tools.push(tool); return () => {} } },
    effect: ((installer: () => unknown) => {
      const disposer = installer()
      if (typeof disposer === 'function') effects.push(disposer as () => unknown)
      return disposer
    }) as unknown as NonNullable<LoopHostContext['effect']>,
  }
  const ctx: LoopHostContext = {
    webServer: webServer as unknown as NonNullable<LoopHostContext['webServer']>,
    connection,
    inject: (_deps: readonly string[], callback: (child: LoopHostContext) => void) => { callback(child) },
    on: () => () => {},
    effect: ((installer: () => unknown) => {
      const disposer = installer()
      if (typeof disposer === 'function') effects.push(disposer as () => unknown)
      return disposer
    }) as unknown as NonNullable<LoopHostContext['effect']>,
  }
  installLoop({ ctx, loop, logger: log, iterate })
  const routeAt = (path: string) => routes.find(route => route.path === path)!
  return { loop, iterate, routes, tools, effects, routeAt }
}

describe('two switches, two routes: one heartbeat never drives the other', () => {
  it('registers one exact route per heartbeat, with distinct paths', () => {
    const wired = wiringBoth(new FakeSchedule())
    expect(wired.routes.map(route => route.path)).toEqual([LOOP_ROUTE_PATH, ITERATE_ROUTE_PATH])
    expect(LOOP_ROUTE_PATH).not.toBe(ITERATE_ROUTE_PATH)
    // One tool, and it is the loop's: the self-iteration beat is armed by the switch,
    // never by a model-facing tool.
    expect(wired.tools).toHaveLength(1)
    expect((wired.tools[0] as { name?: string }).name).toBe(LOOP_TOOL_NAME)
  })

  it('arms the RSI slot through its own route and leaves the loop row alone', async () => {
    const schedule = new FakeSchedule()
    const wired = wiringBoth(schedule)
    const loopRoute = wired.routeAt(LOOP_ROUTE_PATH)
    const iterateRoute = wired.routeAt(ITERATE_ROUTE_PATH)

    await loopRoute.handler(fakeRequest('POST', { action: 'open', sessionId: SESSION }), fakeResponse())
    const iterateOpened = fakeResponse()
    await iterateRoute.handler(fakeRequest('POST', { action: 'open', sessionId: SESSION }), iterateOpened)
    expect(JSON.parse(iterateOpened.body)).toMatchObject({ ok: true, loop: { open: true } })

    const titles = [...schedule.tasks.values()].map(task => task.title)
    expect(titles).toEqual([LOOP_TASK_TITLE, ITERATE_TASK_TITLE])
    const iterateTask = [...schedule.tasks.values()].find(task => task.title === ITERATE_TASK_TITLE)!
    // The template is the stored prompt, and it carries none of the loop's marker.
    expect(iterateTask.prompt).toBe('# RSI heartbeat — self-iteration round')
    expect(iterateTask.prompt.startsWith(LOOP_PROMPT_PREFIX)).toBe(false)
  })

  it('closes only its own row when each switch is flipped off', async () => {
    const schedule = new FakeSchedule()
    const wired = wiringBoth(schedule)
    await wired.loop.open({ sessionId: SESSION })
    await wired.iterate.open({ sessionId: SESSION })

    const iterateClosed = fakeResponse()
    await wired.routeAt(ITERATE_ROUTE_PATH).handler(fakeRequest('POST', { action: 'close', sessionId: SESSION }), iterateClosed)
    expect(JSON.parse(iterateClosed.body)).toMatchObject({ ok: true, loop: { open: false } })
    expect([...schedule.tasks.values()].map(task => task.title)).toEqual([LOOP_TASK_TITLE])

    const loopClosed = fakeResponse()
    await wired.routeAt(LOOP_ROUTE_PATH).handler(fakeRequest('POST', { action: 'close', sessionId: SESSION }), loopClosed)
    expect(JSON.parse(loopClosed.body)).toMatchObject({ ok: true, loop: { open: false } })
    expect(schedule.tasks.size).toBe(0)
  })

  it('unload takes the loop row and leaves the RSI row stored', async () => {
    const schedule = new FakeSchedule()
    const wired = wiringBoth(schedule)
    await wired.loop.open({ sessionId: SESSION })
    await wired.iterate.open({ sessionId: SESSION })
    for (const dispose of wired.effects) await dispose()
    expect([...schedule.tasks.values()].map(task => task.title)).toEqual([ITERATE_TASK_TITLE])
  })
})

describe('lifecycle wiring', () => {
  it('mounts the tool and the switch route, and deletes every heartbeat on unload', async () => {
    const schedule = new FakeSchedule()
    const wired = wiring(schedule)
    expect(wired.tools).toHaveLength(1)
    expect(wired.routes).toHaveLength(1)
    expect(wired.routes[0]).toMatchObject({ kind: 'exact', path: LOOP_ROUTE_PATH })

    await wired.loop.open({ sessionId: SESSION })
    await wired.loop.open({ sessionId: OTHER })
    for (const dispose of wired.effects) await dispose()
    expect(schedule.tasks.size).toBe(0)
  })

  it('deletes one heartbeat when its session is stopped or archived', async () => {
    const schedule = new FakeSchedule()
    const wired = wiring(schedule)
    await wired.loop.open({ sessionId: SESSION })
    await wired.loop.open({ sessionId: OTHER })

    const stopped = wired.listeners.get('workspace/session-stop')
    const archived = wired.listeners.get('workspace/session-archived')
    expect(stopped).toBeDefined()
    expect(archived).toBeDefined()

    await stopped!({ sessionId: SESSION })
    // The listener fires its delete without holding the archive up; the service's write
    // queue is the barrier, so a no-op call on the same queue settles the earlier delete.
    await wired.loop.forgetSession('no-such-session')
    expect([...schedule.tasks.values()].map(task => task.target.sessionId)).toEqual([OTHER])

    await archived!({ sessionId: OTHER })
    await wired.loop.forgetSession('no-such-session')
    expect(schedule.tasks.size).toBe(0)
  })

  it('activates through a real cordis context and leaves no heartbeat on dispose', async () => {
    // The wiring above uses a hand-rolled fake; this one uses cordis itself, so the
    // `inject` activation and the `effect` disposer are the real ones. It is the check
    // that "the tool exists in a profile" and "an unload deletes the heartbeat" are not
    // artifacts of the fake.
    const ctx = new Context()
    const schedule = new FakeSchedule()
    const tools: unknown[] = []
    const routes: unknown[] = []
    ctx.provide('schedule', schedule)
    ctx.provide('tools', { register: (tool: unknown) => { tools.push(tool); return () => {} } })
    ctx.provide('webServer', { register: (route: unknown) => { routes.push(route); return () => {} } })
    ctx.provide('connection', { requestRejection: () => undefined })

    const { logger: log } = logger()
    const loop = serviceFor(schedule)
    installLoop({ ctx: ctx as unknown as LoopHostContext, loop, logger: log })
    await new Promise(resolve => setTimeout(resolve, 25))

    expect(tools).toHaveLength(1)
    expect(routes).toHaveLength(1)
    await loop.open({ sessionId: SESSION })
    expect(schedule.tasks.size).toBe(1)

    await ctx.fiber.dispose()
    expect(schedule.tasks.size).toBe(0)
  })

  it('ignores an event payload without a session id and keeps loading without inject', async () => {
    const schedule = new FakeSchedule()
    const wired = wiring(schedule)
    await wired.loop.open({ sessionId: SESSION })
    await wired.listeners.get('workspace/session-archived')!({})
    await wired.loop.forgetSession('no-such-session')
    expect(schedule.tasks.size).toBe(1)

    const { logger: log } = logger()
    installLoop({ ctx: {}, loop: serviceFor(schedule), logger: log })
    expect(schedule.tasks.size).toBe(1)
  })
})

/* ----------------------------------------------------------------------- route -- */

describe('the switch route', () => {
  it('opens as a user action (no acting Agent) and reads the loop back', async () => {
    const schedule = new FakeSchedule()
    const route = wiring(schedule).routes[0]!

    const opened = fakeResponse()
    await route.handler(fakeRequest('POST', { action: 'open', sessionId: SESSION }), opened)
    expect(opened.statusCode).toBe(200)
    expect(JSON.parse(opened.body)).toMatchObject({ ok: true, action: 'open', loop: { open: true, intervalMinutes: 60 } })
    expect(schedule.createCalls[0]!.actorSessionId).toBeUndefined()
    expect(schedule.createCalls[0]!.request.title).toBe(LOOP_TASK_TITLE)
    expect(schedule.createCalls[0]!.request.prompt.startsWith(defaultLoopPrompt(3).slice(0, 20))).toBe(true)
    expect(schedule.createCalls[0]!.request.timing.rrule).toBe(loopRrule(60, 10, NOW))

    const read = fakeResponse()
    await route.handler(fakeRequest('POST', { action: 'status', sessionId: SESSION }), read)
    expect(JSON.parse(read.body)).toMatchObject({ ok: true, loop: { open: true, taskId: 'task-1' } })

    const closed = fakeResponse()
    await route.handler(fakeRequest('POST', { action: 'close', sessionId: SESSION }), closed)
    expect(JSON.parse(closed.body)).toMatchObject({ ok: true, loop: { open: false } })
    expect(schedule.tasks.size).toBe(0)
  })

  it('honours an interval override and refuses malformed bodies', async () => {
    const schedule = new FakeSchedule()
    const route = wiring(schedule).routes[0]!

    const raised = fakeResponse()
    await route.handler(fakeRequest('POST', { action: 'open', sessionId: SESSION, intervalMinutes: 180 }), raised)
    expect(JSON.parse(raised.body).loop.intervalMinutes).toBe(180)

    const get = fakeResponse()
    await route.handler(fakeRequest('GET'), get)
    expect(get.statusCode).toBe(405)

    const empty = fakeResponse()
    await route.handler(fakeRequest('POST'), empty)
    expect(empty.statusCode).toBe(400)
    expect(JSON.parse(empty.body).code).toBe('loop/body')

    const unknown = fakeResponse()
    await route.handler(fakeRequest('POST', { action: 'explode', sessionId: SESSION }), unknown)
    expect(unknown.statusCode).toBe(400)
    expect(JSON.parse(unknown.body).code).toBe('loop/action')

    const badInterval = fakeResponse()
    await route.handler(fakeRequest('POST', { action: 'open', sessionId: SESSION, intervalMinutes: 'soon' }), badInterval)
    expect(badInterval.statusCode).toBe(400)
    expect(JSON.parse(badInterval.body).code).toBe('loop/interval')

    const badPrompt = fakeResponse()
    await route.handler(fakeRequest('POST', { action: 'open', sessionId: SESSION, prompt: '   ' }), badPrompt)
    expect(badPrompt.statusCode).toBe(400)
    expect(JSON.parse(badPrompt.body).code).toBe('loop/prompt')
  })

  it('answers 401 before reading the body when the connection fence rejects', async () => {
    const schedule = new FakeSchedule()
    const route = wiring(schedule, 401).routes[0]!
    const res = fakeResponse()
    await route.handler(fakeRequest('POST', { action: 'open', sessionId: SESSION }), res)
    expect(res.statusCode).toBe(401)
    expect(res.body).toBe('')
    expect(schedule.createCalls).toHaveLength(0)
  })

  it('answers 413 for a body past the route limit', async () => {
    const schedule = new FakeSchedule()
    const route = wiring(schedule).routes[0]!
    const huge = { action: 'open', sessionId: SESSION, prompt: 'x'.repeat(70 * 1024) }
    const res = fakeResponse()
    await route.handler(fakeRequest('POST', huge), res)
    expect(res.statusCode).toBe(413)
    expect(JSON.parse(res.body).code).toBe('loop/body')
    expect(schedule.createCalls).toHaveLength(0)
  })

  it('reports a Host Schedule refusal as 409 instead of an internal error', async () => {
    const schedule = new FakeSchedule()
    schedule.failCreate = new Error('target session is archived')
    const route = wiring(schedule).routes[0]!
    const res = fakeResponse()
    await route.handler(fakeRequest('POST', { action: 'open', sessionId: SESSION }), res)
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, code: 'loop/schedule-refused' })
    expect(JSON.parse(res.body).error).toContain('target session is archived')
  })

  it('reports an unavailable Schedule as 503 instead of a generic failure', async () => {
    const route = wiring(undefined).routes[0]!
    const res = fakeResponse()
    await route.handler(fakeRequest('POST', { action: 'status', sessionId: SESSION }), res)
    expect(res.statusCode).toBe(503)
    expect(JSON.parse(res.body).code).toBe('loop/unavailable')
  })
})

/* -------------------------------------------------------------- service lookup -- */

describe('scheduleServiceOf', () => {
  it('returns the service only when all three calls exist', () => {
    const schedule = new FakeSchedule()
    expect(scheduleServiceOf({ get: () => schedule })).toBe(schedule)
    expect(scheduleServiceOf({ get: () => ({ create: () => {} }) })).toBeUndefined()
    expect(scheduleServiceOf({ get: () => undefined })).toBeUndefined()
    expect(scheduleServiceOf({})).toBeUndefined()
  })

  it('reads the service from `get` and refuses a non-object answer', () => {
    let asked: string | undefined
    const loop = vi.fn()
    expect(scheduleServiceOf({ get: (name: string) => { asked = name; return loop } })).toBeUndefined()
    expect(asked).toBe('schedule')
  })
})
