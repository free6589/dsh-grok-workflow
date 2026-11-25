import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { CONFIG_NOTICES_ROUTE_PATH, CONFIG_NOTICES_ROUTE_METHODS, configNoticesBody, handleConfigNoticesRoute, installConfigNoticesRoute } from '../src/config-notices-surface.js'
import type { ConfigNoticesHostContext, ConfigNoticesRouteDeps } from '../src/config-notices-surface.js'
import { REMOVED_CONFIG_KEYS, removedKeyWarning } from '../src/config.js'

/**
 * D-155, page half: the plugin's read-only notice route.
 *
 * The settings page cannot read a removed key out of `settings/describe` — the Host
 * projects `user` through the namespace's schema — so the list travels over this route.
 * These cases drive the real handler with a real request stream (the same seam
 * `test/mode-surface.spec.ts` uses), so a hand-mocked success cannot stand in for the
 * transport, and they pin the three things the page depends on: a list with keys, an
 * empty list, and a refusal that changes nothing.
 */

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

function fakeRequest(method: string, url = CONFIG_NOTICES_ROUTE_PATH): never {
  return Object.assign(Readable.from([]), {
    method,
    headers: {},
    url,
    destroy: () => {},
  }) as never
}

async function call(
  deps: ConfigNoticesRouteDeps,
  method = 'GET',
): Promise<{ status: number, body: string, json: Record<string, unknown> | undefined }> {
  const response = fakeResponse()
  handleConfigNoticesRoute(deps, fakeRequest(method), response as never)
  let json: Record<string, unknown> | undefined
  try {
    json = JSON.parse(response.body) as Record<string, unknown>
  } catch {
    json = undefined
  }
  return { status: response.statusCode, body: response.body, json }
}

/* ---------------------------------------------------------------- bodies -- */

describe('config notices route: what the settings page is told', () => {
  it('names every leftover key, with the same sentence the load log uses', async () => {
    const result = await call({ leftovers: () => ['mode', 'legacyGate'] })
    expect(result.status).toBe(200)
    expect(result.json).toEqual({
      ok: true,
      notices: [
        { key: 'mode', message: removedKeyWarning('mode') },
        { key: 'legacyGate', message: removedKeyWarning('legacyGate') },
      ],
    })
    // The sentence is the log's own, so a reader comparing the two surfaces cannot find
    // two different descriptions of one fact.
    expect(result.body).toContain('removed in an earlier release')
    expect(result.body).toContain('"mode"')
  })

  it('answers an empty list when the patch carries no removed key', async () => {
    const result = await call({ leftovers: () => [] })
    expect(result.status).toBe(200)
    expect(result.json).toEqual({ ok: true, notices: [] })
    // The page's rule is one sentence — empty means render nothing — so the empty answer
    // must be a well-formed body, not a 204 and not a missing field.
    expect(result.body).toBe('{"ok":true,"notices":[]}')
  })

  it('is a reader, not a drain: asking twice answers the same list', async () => {
    // The load log owns the drain and its one-line-per-key dedupe. A page refresh must not
    // be able to consume the buffer and silence a warning nobody has read.
    const seen = ['mode']
    const deps = { leftovers: () => seen }
    expect((await call(deps)).json).toEqual(configNoticesBody(['mode']))
    expect((await call(deps)).json).toEqual(configNoticesBody(['mode']))
    expect((await call(deps)).json).toEqual(configNoticesBody(['mode']))
  })

  it('can name every removed key the config module knows', async () => {
    const result = await call({ leftovers: () => REMOVED_CONFIG_KEYS })
    const notices = (result.json?.notices ?? []) as Array<{ key: string }>
    expect(notices.map((notice) => notice.key)).toEqual([...REMOVED_CONFIG_KEYS])
    expect(result.status).toBe(200)
  })
})

describe('config notices route: what it refuses', () => {
  it('refuses a write with the method list, and reads nothing', async () => {
    const refused: string[] = []
    const result = await call({
      leftovers: () => ['mode'],
      logger: { warn: (message: string) => refused.push(message) },
    }, 'POST')
    expect(result.status).toBe(405)
    expect(result.json).toMatchObject({ ok: false, code: 'notices/method' })
    expect(result.body).not.toContain('"mode"')
    expect(refused).toHaveLength(1)
    expect(refused[0]).toContain('refused POST')
    // A 405 has to name what the resource does accept (RFC 9110).
    expect(CONFIG_NOTICES_ROUTE_METHODS).toEqual(['GET'])
  })

  it('answers the trust fence with its own status instead of the list', async () => {
    const result = await call({
      leftovers: () => ['mode'],
      connection: { requestRejection: () => 403 },
    })
    expect(result.status).toBe(403)
    expect(result.body).toBe('')
  })
})

/* --------------------------------------------------------------- mounting -- */

describe('config notices route: mounting is optional and unload-safe', () => {
  it('warns once and mounts nothing when the Host has no web server', () => {
    const warnings: string[] = []
    // The composition still loads; a missing notice is not worth a failed plugin.
    expect(() => installConfigNoticesRoute({
      ctx: {
        inject: (_deps: readonly string[], callback: (child: Record<string, unknown>) => unknown) => callback({}),
      } as unknown as ConfigNoticesHostContext,
      leftovers: () => [],
      logger: { warn: (message: string) => warnings.push(message) },
    })).not.toThrow()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('no webServer service')
  })

  it('registers the exact path inside an effect, so an unload withdraws it', () => {
    const registered: Array<{ kind: string, path: string }> = []
    let disposed = 0
    installConfigNoticesRoute({
      ctx: {
        inject: (_deps: readonly string[], callback: (child: Record<string, unknown>) => unknown) => callback({
          webServer: {
            register: (route: { kind: string, path: string }) => {
              registered.push({ kind: route.kind, path: route.path })
              return () => { disposed += 1 }
            },
          },
          effect: (installer: () => unknown) => installer(),
        }),
      } as unknown as ConfigNoticesHostContext,
      leftovers: () => ['mode'],
    })
    expect(registered).toEqual([{ kind: 'exact', path: CONFIG_NOTICES_ROUTE_PATH }])
    expect(CONFIG_NOTICES_ROUTE_PATH).toBe('/grok-workflow/config-notices')
    // Nothing is disposed yet: the registration lives with the fiber.
    expect(disposed).toBe(0)
  })
})
