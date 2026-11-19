/**
 * The repeat-run keys, read by the *running* plugin.
 *
 * `test/loop.spec.ts` proves the service's semantics against a hand-built service and
 * `test/loop-surface.spec.ts` proves the two surfaces against a recording Schedule. Both
 * start from a service the test constructed itself, so neither can answer the one
 * question this file exists for: does the built bundle wired into a real DSH
 * composition actually read the operator's `loop*` configuration, or do the keys stop at
 * the settings page?
 *
 * That was a real defect once. Round 14 found the four keys "stored, validated and
 * projected, and nothing read them"; the repair is `src/index.ts` building the policy
 * from a live `readConfig()` at open time. A unit test cannot see that line, because it
 * never loads the bundle. This file loads `lib/index.js` through the real Loader with the
 * real tool registry and system prompt, puts a recording Schedule and a minimal web
 * server beside it, and then reads the one thing that matters: what Schedule was asked
 * to store, for a configuration the operator wrote.
 *
 * What is deliberately not real here: Schedule and the web server are fakes, because the
 * host's own timer and durable store are expensive and nondeterministic and this file
 * makes no claim about them. Everything that decides *whether the keys are read* — the
 * Loader, the composition, the plugin's `apply`, the service, the route registration —
 * is the shipped code path.
 */
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'

/** One Schedule row, as the fake host keeps it. */
interface FakeRow {
  id: string
  title: string
  prompt: string
  kind: string
  rrule: string
  scheduledAt: string
  status: 'active' | 'paused' | 'ended'
  target: { kind: string; sessionId: string }
}

/** One `create` request the plugin issued, verbatim. */
interface FakeCreate {
  title: string
  prompt: string
  timing: { kind: string; rrule: string }
  target: { kind: string; sessionId: string }
}

/**
 * State the fake service modules publish.
 *
 * The composition loads those modules by file URL, so the test cannot close over them;
 * one object on `globalThis` is the shared handle. It is reset per test.
 */
interface Capture {
  rows: FakeRow[]
  creates: FakeCreate[]
  edits: { id: string; action: string; patch?: { prompt?: string; active?: boolean; timing?: { rrule: string } } }[]
  /** The route the bundle registered, with the handler it registered. */
  route?: { kind: string; path: string; handler: (req: never, res: never) => void | Promise<void> }
  /** Every registered route by exact path: the loop route and the iterate route. */
  routes: Record<string, { kind: string; path: string; handler: (req: never, res: never) => void | Promise<void> }>
  /** What the composition's connection fence answers; `undefined` = accept. */
  rejectWith?: number
}

const scope = globalThis as typeof globalThis & { __loopWiring?: Capture }

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) {
    try { await ctx.fiber.dispose() } catch { /* already disposed */ }
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  delete scope.__loopWiring
})

/** A response recorder standing in for `ServerResponse`, restricted to what the route uses. */
class FakeResponse {
  statusCode = 0
  readonly headers = new Map<string, string>()
  body = ''

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value)
  }

  end(chunk?: string): void {
    this.body = chunk ?? ''
  }
}

/** POST one JSON body to the registered route and read its answer back. */
async function post(
  handler: (req: never, res: never) => void | Promise<void>,
  payload: unknown,
  method = 'POST',
): Promise<{ status: number; body: Record<string, unknown> | undefined }> {
  const req = Object.assign(new EventEmitter(), { method })
  const res = new FakeResponse()
  const answered = Promise.resolve(handler(req as never, res as never))
  // The body is emitted on the next macrotask: the handler attaches its listeners
  // synchronously, so this is after them without racing the read.
  setTimeout(() => {
    req.emit('data', Buffer.from(JSON.stringify(payload)))
    req.emit('end')
  }, 0)
  await answered
  return {
    status: res.statusCode,
    body: res.body === '' ? undefined : JSON.parse(res.body) as Record<string, unknown>,
  }
}

/** Wait for a condition the Loader reaches on its own schedule (an inject child callback). */
async function until(check: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`timed out waiting for ${what}`)
}

/** One composition: the built bundle plus a recording Schedule and a minimal web server. */
interface Composition {
  ctx: Context
  capture: Capture
}

/**
 * Load `lib/index.js` into a real Loader composition.
 * @param config - plugin configuration written into `cordis.yml`, i.e. what an operator's
 *   settings save would produce for these keys.
 * @param options - `withWeb` false leaves the web surface out, so the route stays unmounted.
 * @returns the context and the shared capture the fake services write to.
 */
async function compose(
  config: Record<string, number | boolean>,
  options: { withWeb?: boolean } = {},
): Promise<Composition> {
  const capture: Capture = { rows: [], creates: [], edits: [], routes: {} }
  scope.__loopWiring = capture
  const withWeb = options.withWeb ?? true

  const root = mkdtempSync(join(tmpdir(), 'dsh-grok-workflow-loop-wiring-'))
  roots.push(root)
  const module = (name: string, lines: string[]): string => {
    const file = join(root, `${name}.mjs`)
    writeFileSync(file, lines.join('\n'))
    return pathToFileURL(file).href
  }

  const engine = module('fake-engine', [
    "export const name = 'fake-workflow-engine'",
    'export function apply(ctx) {',
    "  ctx.provide('workflowEngine', { start: async () => { throw new Error('not used in a wiring test') } })",
    '}',
    '',
  ])
  // The recording Schedule: it keeps every row, answers `catalog` with copies, and
  // records the exact request the plugin built — the request is the evidence.
  const schedule = module('fake-schedule', [
    "export const name = 'fake-schedule'",
    'export function apply(ctx) {',
    '  const state = globalThis.__loopWiring',
    '  ctx.provide(\'schedule\', {',
    '    async create(request) {',
    '      state.creates.push(request)',
    "      const row = { id: `task-${state.rows.length + 1}`, title: request.title, prompt: request.prompt, kind: 'rrule', rrule: request.timing.rrule, scheduledAt: '2026-11-19T00:00:00.000Z', status: 'active', target: request.target }",
    '      state.rows.push(row)',
    '      return { ...row }',
    '    },',
    '    async catalog() { return state.rows.map(row => ({ ...row })) },',
    '    async edit(request) {',
    '      state.edits.push(request)',
    '      const row = state.rows.find(candidate => candidate.id === request.id)',
    "      if (row === undefined) return { id: request.id, deleted: true }",
    "      if (request.action === 'delete') {",
    '        state.rows = state.rows.filter(candidate => candidate.id !== request.id)',
    "        return { id: request.id, deleted: true }",
    '      }',
    '      if (request.patch && request.patch.prompt !== undefined) row.prompt = request.patch.prompt',
    '      if (request.patch && request.patch.timing && request.patch.timing.rrule !== undefined) row.rrule = request.patch.timing.rrule',
    '      if (request.patch && request.patch.active === true) row.status = \'active\'',
    '      return { ...row }',
    '    },',
    '  })',
    '}',
    '',
  ])
  // The web surface: one `register` that keeps every route by path (the loop route
  // additionally as `route`, the historical handle), and the composition's own
  // connection fence, which the route must consult before doing anything.
  const web = module('fake-web', [
    "export const name = 'fake-web'",
    'export function apply(ctx) {',
    '  const state = globalThis.__loopWiring',
    '  ctx.provide(\'webServer\', {',
    '    register(route) {',
    '      state.routes[route.path] = route',
    '      if (state.routes[\'/grok-workflow/loop\'] !== undefined) state.route = state.routes[\'/grok-workflow/loop\']',
    '      return () => { delete state.routes[route.path] }',
    '    },',
    '  })',
    '  ctx.provide(\'connection\', {',
    '    requestRejection() { return state.rejectWith },',
    '  })',
    '}',
    '',
  ])

  const yamlLines = [
    '- id: system-prompt',
    "  name: '@deepseek-ai/dsh-system-prompt'",
    '- id: tools',
    "  name: '@deepseek-ai/dsh-tools'",
    '- id: fake-workflow-engine',
    `  name: ${engine}`,
    '- id: fake-schedule',
    `  name: ${schedule}`,
  ]
  if (withWeb) {
    yamlLines.push('- id: fake-web', `  name: ${web}`)
  }
  yamlLines.push('- id: grok-workflow', `  name: ${pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href}`)
  const keys = Object.entries(config)
  if (keys.length > 0) {
    yamlLines.push('  config:')
    for (const [key, value] of keys) yamlLines.push(`    ${key}: ${String(value)}`)
  }
  const yaml = join(root, 'cordis.yml')
  writeFileSync(yaml, [...yamlLines, ''].join('\n'))

  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(yaml).href } })
  await ctx.loader.await()
  return { ctx, capture }
}

describe('the loop keys reach the running plugin, not only the settings page', () => {
  it('opens a heartbeat whose rule is the operator\'s own round cap and interval', async () => {
    // 180 minutes of configured wait, a 7-round cap, and a 60-minute worst-case round.
    // 180 is above both floors, so it must survive verbatim; `COUNT=7` is the cap the
    // operator wrote, not the default 10.
    const { ctx, capture } = await compose({
      timeoutMs: 3_600_000,
      loopIntervalMin: 180,
      loopMaxRounds: 7,
      loopFailStreak: 4,
    })
    expect(ctx.get('tools')).toBeInstanceOf(ToolRuntime)
    expect(ctx.get('systemPrompt')).toBeInstanceOf(SystemPrompt)
    expect(ctx.tools.schemas().map(tool => tool.name)).toContain('grok_loop')
    await until(() => capture.route !== undefined, 'the loop route registration')

    const sessionId = '2d7bd1e7-1111-2222-3333-444455556666'
    const answer = await post(capture.route!.handler, { action: 'open', sessionId })
    expect(answer.status).toBe(200)
    expect(answer.body).toMatchObject({
      ok: true,
      action: 'open',
      loop: { open: true, sessionId, intervalMinutes: 180, rounds: 7 },
    })

    const created = capture.creates[0]
    expect(created).toBeDefined()
    if (created === undefined) return
    expect(created.title).toBe('Loop heartbeat')
    expect(created.target).toEqual({ kind: 'session', sessionId })
    expect(created.timing.kind).toBe('rrule')
    // The two numbers an operator can raise, read out of the rule Schedule stores.
    expect(created.timing.rrule).toContain('INTERVAL=180')
    expect(created.timing.rrule).toContain('COUNT=7')
    expect(created.timing.rrule).toMatch(/^DTSTART:\d{8}T\d{6}Z\nRRULE:FREQ=MINUTELY;/)
    // `loopFailStreak` is guidance carried in the text, and the text says so with the
    // configured number rather than the default 3.
    expect(created.prompt.startsWith('[grok-workflow loop]')).toBe(true)
    expect(created.prompt).toContain('the last 4 rounds failed in a row')
  })

  it('keeps the configured interval as a floor, and refreshes instead of minting a second row', async () => {
    const { ctx: _ctx, capture } = await compose({ timeoutMs: 0, loopIntervalMin: 180, loopMaxRounds: 7 })
    await until(() => capture.route !== undefined, 'the loop route registration')
    const sessionId = '2d7bd1e7-1111-2222-3333-444455556666'

    const first = await post(capture.route!.handler, { action: 'open', sessionId, intervalMinutes: 90 })
    expect(first.status).toBe(200)
    // 90 is below the configured 180, so the floor wins: a request may never shorten
    // the wait the operator set.
    expect(first.body).toMatchObject({ loop: { intervalMinutes: 180, rounds: 7 } })

    const second = await post(capture.route!.handler, { action: 'open', sessionId, intervalMinutes: 120 })
    expect(second.status).toBe(200)
    expect(second.body).toMatchObject({ loop: { intervalMinutes: 180, rounds: 7 } })
    expect(capture.creates).toHaveLength(1)
    expect(capture.rows).toHaveLength(1)
  })

  it('refuses through the composition\'s connection fence before Schedule is touched', async () => {
    const { ctx: _ctx, capture } = await compose({ timeoutMs: 0 })
    await until(() => capture.route !== undefined, 'the loop route registration')
    capture.rejectWith = 403

    const answer = await post(capture.route!.handler, { action: 'open', sessionId: 'session-fenced' })
    expect(answer.status).toBe(403)
    expect(capture.creates).toHaveLength(0)
  })

  it('deletes every heartbeat it owns when the plugin is disposed', async () => {
    const { ctx, capture } = await compose({ timeoutMs: 0 })
    await until(() => capture.route !== undefined, 'the loop route registration')
    const sessionId = '2d7bd1e7-1111-2222-3333-444455556666'
    // The Iterate heartbeat (the RSI loop) delivers to the same session from its own
    // Schedule task. Unload is the sharpest test of identity the composition offers:
    // it deletes every row this plugin owns, so a row it does not own surviving here is
    // the proof that the two heartbeats are stored apart.
    capture.rows.push({
      id: 'task-iterate',
      title: 'RSI heartbeat',
      prompt: '# RSI heartbeat — round 23\n\nThis message was delivered by an Automation task',
      kind: 'rrule',
      rrule: 'DTSTART:20261119T230000Z\nRRULE:FREQ=MINUTELY;INTERVAL=60',
      scheduledAt: '2026-11-19T23:00:00.000Z',
      status: 'active',
      target: { kind: 'session', sessionId },
    })
    expect((await post(capture.route!.handler, { action: 'open', sessionId })).status).toBe(200)
    expect(capture.rows).toHaveLength(2)

    const entry = [...ctx.loader.entries()].find(item => item.options.id === 'grok-workflow')
    expect(entry?.fiber).toBeDefined()
    await entry!.fiber!.dispose()
    await ctx.loader.await()
    // No timer, no row, no obligation nobody owns: the unload cleanup is the only thing
    // that can delete a heartbeat, so a surviving row here would be an orphan. The
    // Iterate row is not an orphan — it is another owner's beat and must stay stored.
    await until(() => !capture.rows.some(row => row.title === 'Loop heartbeat'), 'the unload cleanup')
    expect(capture.rows.map(row => row.id)).toEqual(['task-iterate'])
    expect(capture.edits.some(edit => edit.action === 'delete')).toBe(true)
    expect(ctx.tools.schemas().map(tool => tool.name)).not.toContain('grok_loop')
  })

  it('mounts no route where the composition has no web surface, while the tool and workflow still load', async () => {
    const { ctx, capture } = await compose({ timeoutMs: 0 }, { withWeb: false })
    // The Loader has settled; the inject child for the web surface can never resolve,
    // because neither service exists in this composition. The loop tool needs only
    // Schedule + tools, which this composition does have, so the model-facing half
    // must still mount: the missing switch is a headless profile, not a broken plugin.
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(capture.route).toBeUndefined()
    expect(capture.creates).toHaveLength(0)
    expect(ctx.tools.schemas().map(tool => tool.name)).toContain('grok_workflow')
    expect(ctx.tools.schemas().map(tool => tool.name)).toContain('grok_loop')
  })
})
