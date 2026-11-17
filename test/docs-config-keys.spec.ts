import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONFIG_KEYS, REMOVED_CONFIG_KEYS } from '../src/config.js'

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

  it('keeps the two lists disjoint', () => {
    const accepted = new Set<string>(CONFIG_KEYS)
    for (const key of REMOVED_CONFIG_KEYS) expect(accepted.has(key)).toBe(false)
  })
})
