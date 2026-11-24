/**
 * The upgrade button's Host surface (`GET|POST /grok-workflow/update`).
 *
 * Why this file exists next to `test/update-entry.spec.ts` rather than inside it:
 * the card there only *offers* a command, so it cannot prove anything about the
 * path that actually installs. This route is the one place a browser can make the
 * profile install a newer release, which makes it the one place the whole change
 * can go wrong: an arbitrary package name, an arbitrary tag, a tag this repository
 * never published, a downgrade, or a "successful" install that never landed. Each
 * of those is one case below, and each one asserts the install count — a refusal
 * that still called the manager would be the failure that matters.
 *
 * No network, no real installs, no timers: the plugin manager and the release-tag
 * discovery are injected fakes, and the request pair is a `Readable` plus a small
 * response recorder, the same transport `test/mode-surface.spec.ts` drives.
 */
import { readFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import {
  handleUpdateRoute,
  installUpdateRoute,
  releaseSpec,
  RELEASE_TAG_PATTERN,
  UPDATE_BUNDLE_NAME,
  UPDATE_REPO,
  UPDATE_ROUTE_METHODS,
  UPDATE_ROUTE_PATH,
} from '../src/update-surface.js'
import type {
  UpdateHostContext,
  UpdateInstallOptions,
  UpdatePluginManager,
  UpdateRouteDeps,
} from '../src/update-surface.js'

/** The version this build ships, which the command falls back to. */
const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }

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
    url: url ?? UPDATE_ROUTE_PATH,
    destroy: () => {},
  }) as never
}

/* ---------------------------------------------------------------- fixtures -- */

interface Row { name: string, version?: string, source?: string }

interface ManagerState {
  rows: Row[]
  installs: { spec: string, options: UpdateInstallOptions | undefined }[]
  listCalls: number
}

interface InstallCall {
  spec: string
  options: UpdateInstallOptions | undefined
  state: ManagerState
  /** 1 for the upgrade, 2 for the rollback the route runs after a failure. */
  index: number
}

/**
 * A plugin-manager double over an explicit row list.
 *
 * It records every call, because half the contract is *absence*: a refusal that
 * still reached `installBundle` would be the bug that ships a downgrade. The
 * default install behaviour is the manager's own contract — the requested
 * `expected` version is what the profile ends up with — and a test that needs a
 * different outcome (a read-back mismatch, a throw) replaces it wholesale.
 */
function fakeManager(options: {
  rows?: Row[]
  onInstall?: (call: InstallCall) => void
  onList?: (state: ManagerState) => void
} = {}): { manager: UpdatePluginManager, state: ManagerState } {
  const state: ManagerState = {
    rows: options.rows?.map(row => ({ ...row })) ?? [{ name: UPDATE_BUNDLE_NAME, version: '0.13.31' }],
    installs: [],
    listCalls: 0,
  }
  const manager: UpdatePluginManager = {
    async listBundles() {
      state.listCalls += 1
      options.onList?.(state)
      return state.rows.map(row => ({ ...row }))
    },
    async installBundle(spec: string, installOptions?: UpdateInstallOptions) {
      const index = state.installs.length + 1
      state.installs.push({ spec, options: installOptions })
      if (options.onInstall !== undefined) {
        options.onInstall({ spec, options: installOptions, state, index })
        return { changed: true }
      }
      const expected = installOptions?.expected
      if (expected !== undefined) {
        // The manager's own contract: an installation leaves `expected` installed, even
        // for a profile that had no row at all.
        state.rows = state.rows.some(row => row.name === expected.name)
          ? state.rows.map(row => row.name === expected.name ? { ...row, version: expected.version } : row)
          : [...state.rows, { name: expected.name, version: expected.version }]
      }
      return { changed: true }
    },
  }
  return { manager, state }
}

interface DepsOptions {
  manager?: UpdatePluginManager
  discover?: () => Promise<readonly string[] | undefined>
  connection?: { requestRejection(request: unknown): number | undefined }
  logger?: unknown
}

function deps(options: DepsOptions = {}): UpdateRouteDeps {
  return {
    ...options.manager === undefined ? {} : { pluginManager: options.manager },
    discover: options.discover ?? (async () => ['v0.13.31', 'v0.13.32']),
    ...options.connection === undefined ? {} : { connection: options.connection },
    ...options.logger === undefined ? {} : { logger: options.logger as never },
  }
}

async function call(
  routeDeps: UpdateRouteDeps,
  method: string,
  body?: unknown,
  url?: string,
): Promise<{ status: number, body: string, json: Record<string, unknown> | undefined, response: FakeResponse }> {
  const response = fakeResponse()
  await handleUpdateRoute(routeDeps, fakeRequest(method, body, url), response as never)
  let json: Record<string, unknown> | undefined
  try {
    json = JSON.parse(response.body) as Record<string, unknown>
  } catch {
    json = undefined
  }
  return { status: response.statusCode, body: response.body, json, response }
}

interface StatusPayload {
  current: string | null
  latest: string | null
  latestSource: 'remote' | 'none'
  canInstall: boolean
  reason?: string
  command: string
}

function statusOf(result: { json: Record<string, unknown> | undefined }): StatusPayload {
  const update = result.json?.update
  expect(update).toBeTypeOf('object')
  return update as StatusPayload
}

const STATUS_URL = `${UPDATE_ROUTE_PATH}?action=status`

/* ---------------------------------------------------- the pinned constants -- */

describe('the surface constants', () => {
  it('pins the path, the methods, and the one repository the spec may name', () => {
    expect(UPDATE_ROUTE_PATH).toBe('/grok-workflow/update')
    expect([...UPDATE_ROUTE_METHODS]).toEqual(['GET', 'POST'])
    expect(UPDATE_REPO).toBe('free6589/dsh-grok-workflow')
    expect(UPDATE_BUNDLE_NAME).toBe('dsh-grok-workflow')
  })

  it('accepts only a released tag shape, and builds the spec itself', () => {
    for (const tag of ['v0.1.0', 'v1.2.3', 'v10.20.30', 'v0.0.0']) {
      expect(RELEASE_TAG_PATTERN.test(tag), tag).toBe(true)
    }
    for (const tag of ['main', 'v0.13', 'v0.13.31-rc1', 'V0.13.31', 'v01.2.3', '../x', 'v1.2.3.4', '1.2.3']) {
      expect(RELEASE_TAG_PATTERN.test(tag), tag).toBe(false)
    }
    expect(releaseSpec('0.13.32')).toBe('github:free6589/dsh-grok-workflow#v0.13.32')
    // A version that is not a release is refused here rather than turned into a spec.
    expect(() => releaseSpec('../evil')).toThrow()
  })
})

/* ------------------------------------------------------------- GET status -- */

describe('status: what is installed, what is offered, and whether to offer it', () => {
  it('reports the installed version, the newest release and the exact command', async () => {
    const { manager, state } = fakeManager()
    const result = await call(
      deps({ manager, discover: async () => ['v0.13.31', 'v0.13.32'] }),
      'GET',
      undefined,
      STATUS_URL,
    )
    expect(result.status).toBe(200)
    expect(result.json).toMatchObject({ ok: true, action: 'status' })
    const update = statusOf(result)
    expect(update.current).toBe('0.13.31')
    expect(update.latest).toBe('0.13.32')
    expect(update.latestSource).toBe('remote')
    expect(update.canInstall).toBe(true)
    expect(update.reason).toBeUndefined()
    expect(update.command).toContain('dsh plugin')
    expect(update.command).toContain('#v0.13.32')
    expect(update.command).toContain(UPDATE_REPO)
    // The profile flag is the point of the line: without it the pasted command installs
    // into whichever profile is default, not the one the operator is using. The
    // placeholder stays literal — this surface never invents a profile name.
    expect(update.command).toContain('--profile <profile>')
    expect(update.command).toContain('add github:free6589/dsh-grok-workflow#v')
    // Reading is not installing: the whole point of separating GET from POST.
    expect(state.installs).toHaveLength(0)
  })

  it('answers "nothing newer" when the installed version is the newest release', async () => {
    const { manager } = fakeManager({
      rows: [{ name: UPDATE_BUNDLE_NAME, version: '0.13.32' }],
    })
    const update = statusOf(await call(
      deps({ manager, discover: async () => ['v0.13.31', 'v0.13.32'] }),
      'GET',
      undefined,
      STATUS_URL,
    ))
    expect(update.latest).toBe('0.13.32')
    expect(update.canInstall).toBe(false)
    expect(update.reason).toBe('update/latest')
  })

  it('says the release list could not be read, and still prints the fallback command', async () => {
    const { manager, state } = fakeManager()
    const result = await call(
      deps({ manager, discover: async () => undefined }),
      'GET',
      undefined,
      STATUS_URL,
    )
    expect(result.status).toBe(200)
    const update = statusOf(result)
    expect(update.latest).toBeNull()
    expect(update.latestSource).toBe('none')
    expect(update.canInstall).toBe(false)
    expect(update.reason).toBe('update/discover')
    // The card always keeps a copy-paste line; with no known release it names the
    // version this build already is.
    expect(update.command).toContain('dsh plugin')
    expect(update.command).toContain(`#v${PKG.version}`)
    expect(state.installs).toHaveLength(0)
  })

  it('degrades to a read-only card when the Host has no plugin manager', async () => {
    const update = statusOf(await call(deps(), 'GET', undefined, STATUS_URL))
    expect(update.current).toBeNull()
    expect(update.canInstall).toBe(false)
    expect(update.reason).toBe('update/unavailable')
    expect(update.command).toContain('dsh plugin')
  })

  it('treats a discovery that throws as "could not read", not as a server fault', async () => {
    const { manager, state } = fakeManager()
    const result = await call(
      deps({ manager, discover: async () => { throw new Error('getaddrinfo ENOTFOUND api.github.com') } }),
      'GET',
      undefined,
      STATUS_URL,
    )
    expect(result.status).toBe(200)
    const update = statusOf(result)
    expect(update.latest).toBeNull()
    expect(update.latestSource).toBe('none')
    expect(update.canInstall).toBe(false)
    expect(update.reason).toBe('update/discover')
    expect(update.command).toContain('dsh plugin')
    expect(state.installs).toHaveLength(0)
  })

  it('states an unreadable installed version instead of inventing one', async () => {
    const { manager } = fakeManager({ onList: () => { throw new Error('profile is unreadable') } })
    const result = await call(
      deps({ manager, discover: async () => ['v0.13.32'] }),
      'GET',
      undefined,
      STATUS_URL,
    )
    expect(result.status).toBe(200)
    const update = statusOf(result)
    expect(update.current).toBeNull()
    expect(update.canInstall).toBe(false)
    expect(update.reason).toBe('update/current')
  })
})

/* ------------------------------------------------------------ POST install -- */

describe('install: one POST, one spec the route builds itself', () => {
  it('installs the exact release spec and answers the version read back', async () => {
    const { manager, state } = fakeManager()
    const result = await call(
      deps({ manager, discover: async () => ['v0.13.31', 'v0.13.32'] }),
      'POST',
      { action: 'install', tag: 'v0.13.32' },
    )
    expect(result.status).toBe(200)
    expect(result.json).toEqual({
      ok: true,
      action: 'install',
      installed: {
        from: '0.13.31',
        to: '0.13.32',
        spec: 'github:free6589/dsh-grok-workflow#v0.13.32',
        saveExact: true,
      },
    })
    expect(state.installs).toHaveLength(1)
    expect(state.installs[0]!.spec).toBe('github:free6589/dsh-grok-workflow#v0.13.32')
    expect(state.installs[0]!.options).toEqual({
      saveExact: true,
      expected: { name: 'dsh-grok-workflow', version: '0.13.32' },
    })
  })

  it('refuses a body that names its own spec, in any spelling', async () => {
    const { manager, state } = fakeManager()
    for (const body of [
      { action: 'install', spec: 'github:evil/pkg#v1.0.0' },
      { action: 'install', tag: 'v0.13.32', spec: 'github:free6589/dsh-grok-workflow#v0.13.32' },
      { action: 'install', tag: 'v0.13.32', installSpec: 'npm:left-pad' },
      { action: 'install', tag: 'v0.13.32', packageSpec: 'file:/tmp/x.tgz' },
    ]) {
      const refused = await call(deps({ manager }), 'POST', body)
      expect(refused.status, JSON.stringify(body)).toBe(400)
      expect(refused.json, JSON.stringify(body)).toMatchObject({ ok: false, code: 'update/spec', rolledBack: false })
    }
    expect(state.installs).toHaveLength(0)
  })

  it('refuses every tag that is not exactly a release tag', async () => {
    const { manager, state } = fakeManager()
    for (const tag of ['main', 'v0.13', 'v0.13.31-rc1', 'V0.13.31', '../x', 'github:evil/pkg#v1.0.0', 'v01.2.3']) {
      const refused = await call(deps({ manager }), 'POST', { action: 'install', tag })
      expect(refused.status, tag).toBe(400)
      expect(refused.json, tag).toMatchObject({ ok: false, code: 'update/tag', rolledBack: false })
    }
    expect(state.installs).toHaveLength(0)
  })

  it('refuses a well-shaped tag this repository never published', async () => {
    const { manager, state } = fakeManager()
    const refused = await call(
      deps({ manager, discover: async () => ['v0.13.31', 'v0.13.32'] }),
      'POST',
      { action: 'install', tag: 'v9.9.9' },
    )
    expect(refused.status).toBe(409)
    expect(refused.json).toMatchObject({ ok: false, code: 'update/unknown-tag', rolledBack: false })
    expect(state.installs).toHaveLength(0)
  })

  it('refuses an install it cannot confirm, because the release list is unreadable', async () => {
    const { manager, state } = fakeManager()
    const refused = await call(
      deps({ manager, discover: async () => undefined }),
      'POST',
      { action: 'install', tag: 'v0.13.32' },
    )
    expect(refused.status).toBe(503)
    expect(refused.json).toMatchObject({ ok: false, code: 'update/discover', rolledBack: false })
    expect(state.installs).toHaveLength(0)
  })

  it('refuses an older or equal tag instead of downgrading the profile', async () => {
    const { manager, state } = fakeManager()
    for (const tag of ['v0.13.30', 'v0.13.31']) {
      const refused = await call(
        deps({ manager, discover: async () => ['v0.13.30', 'v0.13.31', 'v0.13.32'] }),
        'POST',
        { action: 'install', tag },
      )
      expect(refused.status, tag).toBe(409)
      expect(refused.json, tag).toMatchObject({ ok: false, code: 'update/not-newer', rolledBack: false })
    }
    expect(state.installs).toHaveLength(0)
  })

  it('installs even when the installed version cannot be read, and says so', async () => {
    // Nothing to compare is not a reason to refuse an explicit, confirmed release:
    // `from: null` is the honest statement of that.
    const { manager } = fakeManager({ rows: [] })
    const result = await call(
      deps({ manager, discover: async () => ['v0.13.32'] }),
      'POST',
      { action: 'install', tag: 'v0.13.32' },
    )
    expect(result.status).toBe(200)
    expect(result.json).toMatchObject({
      ok: true,
      action: 'install',
      installed: { from: null, to: '0.13.32' },
    })
  })

  it('refuses to install at all when the Host has no plugin manager', async () => {
    const result = await call(deps(), 'POST', { action: 'install', tag: 'v0.13.32' })
    expect(result.status).toBe(503)
    expect(result.json).toMatchObject({ ok: false, code: 'update/unavailable' })
    // The answer keeps the fallback the card offers, so a terminal is one copy away.
    expect(String(result.json?.error)).toContain('dsh plugin')
  })
})

/* ------------------------------------------------------- rollback honesty -- */

describe('rollback: only what the read-back proves', () => {
  it('restores the previous source when the install lands on another version', async () => {
    const source = 'github:free6589/dsh-grok-workflow#0123456789abcdef'
    const { manager, state } = fakeManager({
      rows: [{ name: UPDATE_BUNDLE_NAME, version: '0.13.31', source }],
      onInstall: ({ options, state: s, index }) => {
        if (index === 1) {
          // The install succeeded but did not land on the requested version.
          s.rows = [{ ...s.rows[0]!, version: '0.13.33' }]
          return
        }
        s.rows = [{ ...s.rows[0]!, version: options?.expected?.version ?? '0.13.31' }]
      },
    })
    const result = await call(
      deps({ manager, discover: async () => ['v0.13.31', 'v0.13.32'] }),
      'POST',
      { action: 'install', tag: 'v0.13.32' },
    )
    expect(result.json).toMatchObject({
      ok: false,
      code: 'update/readback',
      rolledBack: true,
      restored: '0.13.31',
    })
    expect(state.installs).toHaveLength(2)
    // The previous copy came from a Git spec: restoring it must reuse that spec, not
    // invent a tag URL that may not describe what was installed.
    expect(state.installs[1]!.spec).toBe(source)
    expect(state.installs[1]!.options).toEqual({
      saveExact: true,
      expected: { name: 'dsh-grok-workflow', version: '0.13.31' },
    })
  })

  it('falls back to the release spec of the previous version when it has no source', async () => {
    const { manager, state } = fakeManager({
      onInstall: ({ options, state: s, index }) => {
        if (index === 1) {
          s.rows = [{ ...s.rows[0]!, version: '0.13.33' }]
          return
        }
        s.rows = [{ ...s.rows[0]!, version: options?.expected?.version ?? '0.13.31' }]
      },
    })
    const result = await call(
      deps({ manager, discover: async () => ['v0.13.31', 'v0.13.32'] }),
      'POST',
      { action: 'install', tag: 'v0.13.32' },
    )
    expect(result.json).toMatchObject({ code: 'update/readback', rolledBack: true, restored: '0.13.31' })
    expect(state.installs[1]!.spec).toBe('github:free6589/dsh-grok-workflow#v0.13.31')
  })

  it('claims no rollback when the failed install left the previous version in place', async () => {
    const token = `ghp_${'A'.repeat(36)}`
    const { manager, state } = fakeManager({
      onInstall: () => { throw new Error(`pnpm run failed: token ${token}`) },
    })
    const result = await call(
      deps({ manager, discover: async () => ['v0.13.31', 'v0.13.32'] }),
      'POST',
      { action: 'install', tag: 'v0.13.32' },
    )
    expect(result.status).toBe(502)
    expect(result.json).toMatchObject({ ok: false, code: 'update/install', rolledBack: false })
    expect(result.json?.restored).toBeUndefined()
    // No second install: the read-back already showed the previous version, so a
    // "restore" would only be a claim about something that never happened.
    expect(state.installs).toHaveLength(1)
    // The message is redacted on the way out.
    expect(String(result.json?.error)).not.toContain(token)
  })

  it('rolls back a half-applied failure and reports the version it truly read back', async () => {
    let secondReadBack = '0.13.31'
    const { manager, state } = fakeManager({
      onInstall: ({ options, state: s, index }) => {
        if (index === 1) {
          s.rows = [{ ...s.rows[0]!, version: '0.14.0' }]
          throw new Error('pnpm exited 1')
        }
        s.rows = [{ ...s.rows[0]!, version: secondReadBack }]
        if (options?.expected?.version !== '0.13.31') throw new Error('the route named the wrong previous version')
      },
    })
    const restored = await call(
      deps({ manager, discover: async () => ['v0.13.31', 'v0.13.32'] }),
      'POST',
      { action: 'install', tag: 'v0.13.32' },
    )
    expect(restored.json).toMatchObject({ code: 'update/install', rolledBack: true, restored: '0.13.31' })
    expect(state.installs).toHaveLength(2)

    // Same failure, but the rollback does not reach the previous version either:
    // the answer must not claim it did.
    secondReadBack = '0.14.0'
    const { manager: second, state: secondState } = fakeManager({
      onInstall: ({ state: s, index }) => {
        if (index === 1) {
          s.rows = [{ ...s.rows[0]!, version: '0.14.0' }]
          throw new Error('pnpm exited 1')
        }
        s.rows = [{ ...s.rows[0]!, version: '0.14.0' }]
      },
    })
    const unverified = await call(
      deps({ manager: second, discover: async () => ['v0.13.31', 'v0.13.32'] }),
      'POST',
      { action: 'install', tag: 'v0.13.32' },
    )
    expect(unverified.json).toMatchObject({ code: 'update/install', rolledBack: false })
    expect(unverified.json?.restored).toBeUndefined()
    expect(secondState.installs).toHaveLength(2)
  })
})

/* --------------------------------------------------------------- refusals -- */

describe('the route refuses what a URL or a stray method must not do', () => {
  it('answers 405 with the methods it does accept', async () => {
    const warned: string[] = []
    const { manager, state } = fakeManager()
    const put = await call(
      deps({ manager, logger: { warn: (message: string) => { warned.push(message) } } }),
      'PUT',
      { action: 'install', tag: 'v0.13.32' },
    )
    expect(put.status).toBe(405)
    expect(put.json).toMatchObject({ ok: false, code: 'update/method' })
    expect(put.response.headers['allow']).toBe('GET, POST')
    expect(warned.some(message => message.includes('PUT'))).toBe(true)
    expect(state.installs).toHaveLength(0)
  })

  it('never installs from a URL', async () => {
    const { manager, state } = fakeManager()
    const result = await call(
      deps({ manager }),
      'GET',
      undefined,
      `${UPDATE_ROUTE_PATH}?action=install&tag=v0.13.32`,
    )
    expect(result.status).toBe(405)
    expect(result.json).toMatchObject({ ok: false, code: 'update/method' })
    expect(result.response.headers['allow']).toBe('GET, POST')
    expect(state.installs).toHaveLength(0)
  })

  it('refuses an unknown action and a body that is not a JSON object', async () => {
    const { manager, state } = fakeManager()
    const unknown = await call(deps({ manager }), 'POST', { action: 'upgrade', tag: 'v0.13.32' })
    expect(unknown.status).toBe(400)
    expect(unknown.json).toMatchObject({ ok: false, code: 'update/action' })

    for (const body of ['not json', '[1,2]', undefined]) {
      const refused = await call(deps({ manager }), 'POST', body)
      expect(refused.status).toBe(400)
      expect(refused.json).toMatchObject({ ok: false, code: 'update/body' })
    }
    expect(state.installs).toHaveLength(0)
  })

  it('answers the fence\'s status before reading or writing anything', async () => {
    const { manager, state } = fakeManager()
    const result = await call(
      deps({ manager, connection: { requestRejection: () => 403 } }),
      'POST',
      { action: 'install', tag: 'v0.13.32' },
    )
    expect(result.status).toBe(403)
    expect(result.body).toBe('')
    expect(state.listCalls).toBe(0)
    expect(state.installs).toHaveLength(0)
  })
})

/* ----------------------------------------------------------------- wiring -- */

interface FakeRoute {
  kind: string
  path: string
  handler: (req: unknown, res: FakeResponse) => void | Promise<void>
}

interface CordisDouble {
  /** Injected names: readable as properties, as a real fiber's injections are. */
  injected: Record<string, unknown>
  /** Every service in scope, whether or not this fiber injected it. */
  lookup: Record<string, unknown>
}

/** A Host context whose property reads are guarded the way cordis guards them. */
function cordisContext(double: CordisDouble): UpdateHostContext {
  const target = {
    inject: (_names: readonly string[], callback: (child: UpdateHostContext) => void) => { callback(proxy) },
    get: (name: string) => double.lookup[name],
    effect: (installer: () => undefined | (() => unknown)) => installer(),
  }
  const proxy: UpdateHostContext = new Proxy(target as unknown as UpdateHostContext, {
    get(object, property, receiver) {
      if (typeof property !== 'string' || Reflect.has(object, property)) {
        return Reflect.get(object, property, receiver)
      }
      if (Reflect.has(double.injected, property)) return double.injected[property]
      throw new Error(`cannot get property "${property}" without inject`)
    },
    has: (object, property) => Reflect.has(object, property) || Reflect.has(double.injected, property as string),
  })
  return proxy
}

function wiring(options: { webServer?: boolean, manager?: UpdatePluginManager } = {}) {
  const routes: FakeRoute[] = []
  const disposers: (() => unknown)[] = []
  const effects: (() => unknown)[] = []
  const webServer = {
    register: (route: FakeRoute) => {
      routes.push(route)
      const disposer = (): undefined => undefined
      disposers.push(disposer)
      return disposer
    },
  }
  const child: UpdateHostContext = {
    ...options.webServer === false ? {} : { webServer: webServer as unknown as NonNullable<UpdateHostContext['webServer']> },
    connection: { requestRejection: () => undefined },
    effect: ((installer: () => unknown) => {
      const disposer = installer()
      if (typeof disposer === 'function') effects.push(disposer as () => unknown)
      return disposer
    }) as unknown as NonNullable<UpdateHostContext['effect']>,
    ...options.manager === undefined ? {} : { pluginManager: options.manager },
  }
  const ctx: UpdateHostContext = {
    inject: (_names: readonly string[], callback: (child: UpdateHostContext) => void) => { callback(child) },
  }
  installUpdateRoute({ ctx, discover: async () => ['v0.13.31', 'v0.13.32'] })
  return { routes, disposers, effects }
}

describe('mounting the update route', () => {
  it('registers one exact route whose disposer is the plugin\'s own effect', () => {
    const wired = wiring()
    expect(wired.routes).toHaveLength(1)
    expect(wired.routes[0]!.kind).toBe('exact')
    expect(wired.routes[0]!.path).toBe(UPDATE_ROUTE_PATH)
    expect(wired.effects).toHaveLength(1)
    // The withdrawal an unload runs is exactly what `register` handed back.
    expect(wired.effects[0]).toBe(wired.disposers[0])
  })

  it('registers nothing without a web server, and warns instead of failing silently', () => {
    expect(wiring({ webServer: false }).routes).toHaveLength(0)
    const warned: string[] = []
    const child: UpdateHostContext = {
      connection: { requestRejection: () => undefined },
      effect: (() => {}) as unknown as NonNullable<UpdateHostContext['effect']>,
    }
    const ctx: UpdateHostContext = {
      inject: (_names: readonly string[], callback: (child: UpdateHostContext) => void) => { callback(child) },
    }
    installUpdateRoute({ ctx, logger: { warn: (message: string) => { warned.push(message) } } as never })
    expect(warned.some(message => message.includes('no webServer'))).toBe(true)
  })

  it('stays inert without `ctx.inject`', () => {
    expect(() => installUpdateRoute({ ctx: {} })).not.toThrow()
  })

  it('finds a plugin manager that mounts after the route did', async () => {
    const { manager } = fakeManager()
    const routes: FakeRoute[] = []
    const double: CordisDouble = {
      injected: {
        webServer: { register: (route: FakeRoute) => { routes.push(route); return () => {} } },
        connection: { requestRejection: () => undefined },
      },
      // The manager is not in scope yet: this fiber injected it nothing else.
      lookup: {},
    }
    installUpdateRoute({ ctx: cordisContext(double), discover: async () => ['v0.13.31', 'v0.13.32'] })
    expect(routes).toHaveLength(1)

    const before = fakeResponse()
    await routes[0]!.handler(fakeRequest('GET', undefined, STATUS_URL), before)
    expect(JSON.parse(before.body)).toMatchObject({ update: { current: null, reason: 'update/unavailable' } })

    // A manager that mounts later still answers: the service is resolved per request,
    // through the unguarded `get` lookup, not snapshotted at mount time.
    double.lookup.pluginManager = manager
    const after = fakeResponse()
    await routes[0]!.handler(fakeRequest('GET', undefined, STATUS_URL), after)
    expect(after.statusCode).toBe(200)
    expect(JSON.parse(after.body)).toMatchObject({
      ok: true,
      update: { current: '0.13.31', latest: '0.13.32', canInstall: true },
    })
  })

  it('drives an install through the registered handler', async () => {
    const { manager, state } = fakeManager()
    const wired = wiring({ manager })
    const response = fakeResponse()
    await wired.routes[0]!.handler(fakeRequest('POST', { action: 'install', tag: 'v0.13.32' }), response)
    expect(response.statusCode).toBe(200)
    expect(state.installs).toHaveLength(1)
    expect(JSON.parse(response.body)).toMatchObject({
      ok: true,
      installed: { to: '0.13.32', spec: 'github:free6589/dsh-grok-workflow#v0.13.32' },
    })
  })
})
