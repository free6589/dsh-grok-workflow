import { beforeEach, describe, expect, it } from 'vitest'
import { REMOVED_CONFIG_KEYS, removedKeyWarning, resolveConfig, takeRemovedKeys } from '../src/config.js'
import { apply } from '../src/index.js'

/**
 * D-155: a removed key is ignored with a warning, and nothing else about R-06 moves.
 *
 * The previous contract (R-06, as amended by M3.3) refused the whole row for a leftover
 * `mode:` line, which is how a routine upgrade removed the workflow from someone's
 * interface. The contract now: the row loads, the stored value contributes nothing, and
 * the leftover is named — once in the load log, once on the settings page.
 *
 * This file is the guard for both halves of that change, plus the boundary that makes it
 * safe: relaxing "removed" must not relax "unknown". A typo is still fatal, because a
 * typo that loads is a setting that silently does nothing, and that failure mode is the
 * one the key check exists for.
 */

/**
 * The minimum context `apply()` touches, with the load-time warnings recorded.
 *
 * The real plugin registers a tool, a settings surface and several listeners; this
 * double provides the three services `apply()` reads and keeps every `logger.warn` line
 * so a case can assert what the reader would actually see in the load log.
 */
class FakeCtx {
  readonly warnings: string[] = []
  readonly infos: string[] = []
  readonly toolsByName = new Map<string, { name: string, execute: (args: unknown, exec: unknown) => Promise<unknown> }>()
  get tool(): { name: string, execute: (args: unknown, exec: unknown) => Promise<unknown> } | undefined {
    return this.toolsByName.get('grok_workflow')
  }
  readonly tools = {
    register: (tool: { name: string, execute: (args: unknown, exec: unknown) => Promise<unknown> }) => {
      this.toolsByName.set(tool.name, tool)
      return () => { if (this.toolsByName.get(tool.name) === tool) this.toolsByName.delete(tool.name) }
    },
  }
  readonly systemPrompt = {
    section: () => () => {},
    getSectionOrder: () => 2600,
  }
  logger = () => ({
    warn: (message: string) => { this.warnings.push(message) },
    info: (message: string) => { this.infos.push(message) },
  })
  effect = (installer: () => unknown) => installer()
  readonly on = (): (() => void) => () => {}
}

beforeEach(() => { takeRemovedKeys() })

describe('D-155: every removed key loads, contributes nothing, and is named', () => {
  it('loads all 25, records each one once, and carries no value into the result', () => {
    // The two keys M3.3 deleted are the ones a real profile still carries, so they are
    // asserted with a realistic value rather than the shared `1`.
    const samples: Record<string, unknown> = { mode: 'triage', legacyGate: true }
    for (const key of REMOVED_CONFIG_KEYS) {
      expect(() => resolveConfig({ [key]: samples[key] ?? 1 } as never), key).not.toThrow()
      // "Ignored" has to mean the whole document resolves exactly like a patch that never
      // carried the key — no field moves, including the fixed fields that share a removed
      // key's name (`maxRetries` is fixed at 1 and is always present in the result).
      expect(resolveConfig({ [key]: samples[key] ?? 1 } as never), key).toEqual(resolveConfig({}))
      // Two reads, one note: the buffer is a set, not a queue of reads.
      expect(takeRemovedKeys(), key).toEqual([key])
      expect(takeRemovedKeys(), key).toEqual([])
      expect(removedKeyWarning(key), key).toContain(`"${key}"`)
    }
    expect(takeRemovedKeys()).toEqual([])
  })

  it('warns through the load path, with the key named, once — not once per message', async () => {
    // The host path, end to end: `apply()` reads the config at load, and the tool reads it
    // again on every call. A patch that keeps a leftover line must produce one log line for
    // the life of the load, not one per call — the reason the announcement is a drain plus
    // a per-load set instead of a `logger.warn` inside the check.
    const ctx = new FakeCtx()
    expect(() => apply(ctx as never, { mode: 'triage' } as never)).not.toThrow()
    const tool = ctx.tool
    expect(tool?.name).toBe('grok_workflow')
    const lines = () => ctx.warnings.filter((line) => line.includes('was removed in an earlier release'))
    expect(lines()).toHaveLength(1)
    expect(lines()[0]).toContain('"mode"')
    // The row really activated: the effective-configuration line is the log's own proof,
    // and it does not mention the leftover key.
    expect(ctx.infos.some((info) => info.startsWith('configuration in effect:'))).toBe(true)
    expect(lines()[0]).not.toContain('legacyGate')

    // Two more reads through the tool's own entry point. An empty objective throws right
    // after the read, which is exactly what this case needs: the read happened, the run
    // did not.
    const exec = { agent: { session: { header: {} } }, signal: { aborted: false } }
    await expect(tool!.execute({ objective: '' }, exec)).rejects.toThrow(/objective/)
    await expect(tool!.execute({ objective: '' }, exec)).rejects.toThrow(/objective/)
    expect(lines()).toHaveLength(1)
  })

  it('says nothing at all when the patch carries no removed key', () => {
    const ctx = new FakeCtx()
    expect(() => apply(ctx as never, {} as never)).not.toThrow()
    expect(ctx.warnings.filter((line) => line.includes('was removed in an earlier release'))).toEqual([])
    expect(takeRemovedKeys()).toEqual([])
  })
})

describe('D-155 does not widen R-06: unknown keys and misspellings still refuse', () => {
  it('refuses an unknown key with the did-you-mean suggestion on the live surface', () => {
    // The nearest neighbour of `mode` is not asserted by name: `closestKey` answers with
    // the closest *accepted* key, and the point here is that the refusal still carries a
    // suggestion at all.
    expect(() => resolveConfig({ maxConcurreny: 2 } as never))
      .toThrow(/unknown configuration key "maxConcurreny" \(did you mean "maxConcurrency"\?\)/)
    expect(takeRemovedKeys()).toEqual([])
  })

  it('refuses an unknown key that only looks like a removed one', () => {
    // `mode` is gone and ignored; `modes` is a typo and must not ride in on that.
    expect(() => resolveConfig({ modes: 'triage' } as never)).toThrow(/unknown configuration key "modes"/)
    expect(() => resolveConfig({ legacyGates: true } as never)).toThrow(/unknown configuration key "legacyGates"/)
    expect(takeRemovedKeys()).toEqual([])
  })

  it('refuses an unknown role, an unknown route field and an unknown guardian field', () => {
    expect(() => resolveConfig({ roles: { reviewer: [] } } as never))
      .toThrow(/unknown configuration key "roles\.reviewer"/)
    expect(() => resolveConfig({ roles: { worker: [{ model: 'm', maxInflight: 2 }] } } as never))
      .toThrow(/unknown configuration key "roles\.worker\[0\]\.maxInflight" \(did you mean "maxInFlight"\?\)/)
    expect(() => resolveConfig({ guardianModel: { model: 'm', maxInFlight: 2 } } as never))
      .toThrow(/unknown configuration key "guardianModel\.maxInFlight"/)
    expect(takeRemovedKeys()).toEqual([])
  })

  it('refuses a removed key written one level down, where only real keys live', () => {
    // The exemption is for the top-level surface a patch actually carries. Inside a route
    // object a leftover is indistinguishable from a typo, and there is no migration story
    // to honour, so it stays a refusal with a suggestion.
    expect(() => resolveConfig({ roles: { worker: [{ model: 'm', maxRetries: 2 }] } } as never))
      .toThrow(/unknown configuration key "roles\.worker\[0\]\.maxRetries"/)
    expect(takeRemovedKeys()).toEqual([])
  })
})
