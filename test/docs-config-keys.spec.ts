import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { CONFIG_KEYS, REMOVED_CONFIG_KEYS, resolveConfig } from '../src/config.js'

/**
 * Configuration-surface docs guard (RSI round 3).
 *
 * `src/config.ts` rejects a patch that carries a key it no longer accepts, naming the
 * key. If the READMEs never mention a removed key, the person holding an old patch has
 * no way to learn why the row stopped loading — that was true for `triageModel` and
 * `maxActiveRunsTotal`, both rejected and both undocumented. This spec makes the two
 * lists in the code the contract for what both READMEs must document.
 */

const readme = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')
const readmes = {
  'README.md': readme('README.md'),
  'README.zh-CN.md': readme('README.zh-CN.md'),
}

describe('README documents exactly the configuration surface the code accepts', () => {
  it('tabulates every accepted key', () => {
    for (const [name, text] of Object.entries(readmes)) {
      const tabulated = new Set(
        [...text.matchAll(/^\| `([a-zA-Z]+)` \|/gm)].map((match) => match[1] as string),
      )
      for (const key of CONFIG_KEYS) {
        expect(tabulated, `${name} does not tabulate the accepted key ${key}`).toContain(key)
      }
    }
  })

  it('names every removed key', () => {
    for (const [name, text] of Object.entries(readmes)) {
      for (const key of REMOVED_CONFIG_KEYS) {
        expect(
          new RegExp(`\`${key}(?![A-Za-z0-9_])`).test(text),
          `${name} never mentions the removed key ${key}`,
        ).toBe(true)
      }
    }
  })

  it('states the same configuration-surface size the code enforces', () => {
    const words: Record<number, { en: string; zh: string }> = {
      9: { en: 'nine', zh: '九个' },
    }
    const expected = words[CONFIG_KEYS.length]
    expect(expected, 'add the spelled-out form for the new key count').toBeDefined()
    expect(readmes['README.md']).toContain(`exactly ${expected!.en} keys`)
    expect(readmes['README.zh-CN.md']).toContain(expected!.zh)
  })

  it('publishes only configuration examples the loader actually accepts', () => {
    for (const [name, text] of Object.entries(readmes)) {
      const blocks = [...text.matchAll(/```ya?ml\n([\s\S]*?)```/g)].map((match) => match[1] as string)
      const configs = blocks
        .map((block) => {
          try {
            return load(block) as unknown
          } catch {
            return undefined
          }
        })
        .filter((doc): doc is Array<{ id?: string; config?: Record<string, unknown> }> => Array.isArray(doc))
        .flatMap((rows) => rows.filter((row) => row?.id === 'grok-workflow').map((row) => row?.config))
        .filter((config): config is Record<string, unknown> => !!config)
      expect(configs.length, `${name} has no config example to check`).toBeGreaterThan(0)
      for (const config of configs) {
        expect(() => resolveConfig(config), `${name} example is not loadable`).not.toThrow()
      }
    }
  })

  it('quotes the chain limit and the role count the code enforces', () => {
    for (const [name, text] of Object.entries(readmes)) {
      for (const stale of ['three routes', '三条路由', '3 条', 'four role chains', '四条角色链']) {
        expect(text.includes(stale), `${name} still claims "${stale}"`).toBe(false)
      }
    }
    expect(readmes['README.md']).toContain('50 routes')
    expect(readmes['README.zh-CN.md']).toContain('50 条')
  })

  it('sets the per-role-chain hard limit to the chainLength the code enforces', () => {
    expect(readmes['README.md']).toContain('| Routes per role chain | 0 (inherit) | 50 |')
    expect(readmes['README.zh-CN.md']).toContain('| 每角色链路由数 | 0（继承） | 50 |')
  })

  it('keeps the two lists disjoint', () => {
    const accepted = new Set<string>(CONFIG_KEYS)
    for (const key of REMOVED_CONFIG_KEYS) expect(accepted.has(key)).toBe(false)
  })
})
