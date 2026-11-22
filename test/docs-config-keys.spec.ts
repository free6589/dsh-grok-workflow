import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { CONFIG_KEYS, DEFAULT_TIMEOUT_MS, FIXED_HISTORY_CHARS, FIXED_HISTORY_TURNS, FIXED_MAX_ACTIVE_RUNS, FIXED_MAX_ACTIVE_RUNS_TOTAL, FIXED_MAX_QUEUED_MESSAGES, FIXED_MAX_RETRIES, FIXED_RECORD_LIMIT, REMOVED_CONFIG_KEYS, resolveConfig } from '../src/config.js'

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
      13: { en: 'thirteen', zh: '十三个' },
      15: { en: 'fifteen', zh: '十五个' },
      16: { en: 'sixteen', zh: '十六个' },
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

/**
 * `docs/LOCAL-TESTING.md` is the document an operator follows to install and run this
 * plugin, so every number in it is a promise the code has to keep. RSI round 6 audited
 * the paragraph against `src/config.ts`: the key count and the fixed caps were right,
 * while four install examples still named a `0.2.0`/`0.2.1` tarball that this release
 * never produced, and one troubleshooting example described a *repaired* value as a
 * load-time rejection.
 */
describe('docs/LOCAL-TESTING.md agrees with the code', () => {
  const local = readFileSync(new URL('../docs/LOCAL-TESTING.md', import.meta.url), 'utf8')

  it('names every accepted key and states the count the code enforces', () => {
    const words: Record<number, string> = { 13: 'thirteen', 15: 'fifteen', 16: 'sixteen' }
    const spelled = words[CONFIG_KEYS.length]
    expect(spelled, 'add the spelled-out form for the new key count').toBeDefined()
    expect(local).toContain(`exactly ${spelled} keys`)
    for (const key of CONFIG_KEYS) {
      expect(local, `LOCAL-TESTING.md never names the accepted key ${key}`).toContain(`\`${key}\``)
    }
  })

  it('quotes the fixed caps and the deadline default from the constants', () => {
    expect(local).toContain(`maxRetries=${FIXED_MAX_RETRIES}`)
    expect(local).toContain(`maxActiveRuns=${FIXED_MAX_ACTIVE_RUNS}`)
    expect(local).toContain(`\`${FIXED_MAX_ACTIVE_RUNS_TOTAL}\` per process`)
    expect(local).toContain(`defaults to \`${DEFAULT_TIMEOUT_MS}\``)
  })

  it('pins every packed-artifact name to the package version', () => {
    const version = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version
    const named = [...local.matchAll(/dsh-grok-workflow-(\d+\.\d+\.\d+)\.tgz/g)].map((match) => match[1] as string)
    expect(named.length, 'LOCAL-TESTING.md no longer names the packed artifact').toBeGreaterThan(0)
    for (const found of named) {
      expect(found, 'LOCAL-TESTING.md names a tarball this release never produced').toBe(version)
    }
  })

  it('quotes only load-time messages the code can produce', () => {
    const source = readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8')
    for (const quoted of ['unknown configuration key', 'accepted keys:', 'synthesis must be "model" or "layered", got']) {
      expect(source, `config.ts no longer produces "${quoted}"`).toContain(quoted)
      expect(local, `LOCAL-TESTING.md no longer shows the real message "${quoted}"`).toContain(quoted)
    }
  })
})

describe('both READMEs quote the fixed caps from the constants', () => {
  const readmes = {
    'README.md': readFileSync(new URL('../README.md', import.meta.url), 'utf8'),
    'README.zh-CN.md': readFileSync(new URL('../README.zh-CN.md', import.meta.url), 'utf8'),
  }

  it('keeps every fixed cap in step with src/config.ts', () => {
    const facts = [
      `maxRetries=${FIXED_MAX_RETRIES}`,
      `maxActiveRuns=${FIXED_MAX_ACTIVE_RUNS}`,
      `maxActiveRunsTotal=${FIXED_MAX_ACTIVE_RUNS_TOTAL}`,
      `historyTurns=${FIXED_HISTORY_TURNS}`,
      `historyChars=${FIXED_HISTORY_CHARS}`,
      `maxQueuedMessages=${FIXED_MAX_QUEUED_MESSAGES}`,
      `recordLimit=${FIXED_RECORD_LIMIT}`,
    ]
    for (const fact of facts) {
      for (const [name, text] of Object.entries(readmes)) {
        expect(text, `${name} no longer states ${fact.split('=')[0]} as ${fact.split('=')[1]}`).toContain(fact)
      }
    }
  })
})
