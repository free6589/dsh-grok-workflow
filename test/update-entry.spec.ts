import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Settings-page upgrade entry (task-4): the page shows the installed plugin
 * version next to the newest known release, and the upgrade reuses the existing
 * install channel (`dsh plugin add`) instead of a second installer.
 *
 * This suite only asserts the additive surface: no FIELDS/GROUPS/ROLES shape,
 * no dictionary key set outside the four `update.*` keys, and no save-path
 * behavior is pinned here — those stay owned by `test/client.spec.ts` and
 * `test/i18n-parity.spec.ts`.
 */

const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')

/** The package version this worktree ships. */
const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }

function loadBundle(): Record<string, any> {
  let registration: { id: string, factory: (require: (id: string) => unknown) => Record<string, any> } | undefined
  const record = globalThis as unknown as { window?: { __ModuleLoader__?: { load(spec: never): void } } | undefined }
  const previous = record.window
  record.window = { __ModuleLoader__: { load: (spec) => { registration = spec } } }
  try {
    new Function(SOURCE)()
  } finally {
    record.window = previous
  }
  expect(registration?.id).toBe('dsh-grok-workflow')
  const react = {
    createElement: (...args: unknown[]) => ({ args }),
    useState: (value: unknown) => [value, () => {}],
    useEffect: () => {},
    useRef: (value: unknown) => ({ current: value }),
    useSyncExternalStore: () => undefined,
  }
  return registration!.factory(() => react)
}

const bundle = loadBundle()

const isVersion = (value: unknown): value is string =>
  typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value)

describe('settings-page upgrade entry', () => {
  it('exposes the installed and latest versions plus the plugin-add command', () => {
    const update = bundle['GROK_WORKFLOW_UPDATE'] as { version: unknown, latest: unknown, command: unknown }
    expect(isVersion(update.version), String(update.version)).toBe(true)
    expect(isVersion(update.latest), String(update.latest)).toBe(true)
    expect(update.version).toBe(PKG.version)
    expect(typeof update.command).toBe('string')
    // The only supported channel: the README's `plugin add` line, never a
    // second installer.
    expect(update.command as string).toContain('dsh plugin')
    expect(update.command as string).toContain('add github:free6589/dsh-grok-workflow#v')
  })

  it('carries the four upgrade keys in both languages, with different prose', () => {
    for (const key of ['update.title', 'update.body', 'update.copy', 'update.current']) {
      const zh = bundle['GROK_WORKFLOW_DICT']['zh'][key] as unknown
      const en = bundle['GROK_WORKFLOW_DICT']['en'][key] as unknown
      expect(typeof zh, `zh ${key}`).toBe('string')
      expect(typeof en, `en ${key}`).toBe('string')
      expect((zh as string).length, `zh ${key}`).toBeGreaterThan(0)
      expect((en as string).length, `en ${key}`).toBeGreaterThan(0)
      expect(zh, key).not.toBe(en)
    }
    expect(bundle['GROK_WORKFLOW_DICT']['en']['update.body']).toContain('{current}')
    expect(bundle['GROK_WORKFLOW_DICT']['en']['update.body']).toContain('{target}')
    expect(bundle['GROK_WORKFLOW_DICT']['zh']['update.body']).toContain('{current}')
    expect(bundle['GROK_WORKFLOW_DICT']['zh']['update.body']).toContain('{target}')
  })

  it('renders the upgrade card outside the save form (read-only, additive)', () => {
    const { UpdateCard } = bundle['GROK_WORKFLOW_INTERNALS'] as { UpdateCard: (props: unknown) => unknown }
    expect(typeof UpdateCard).toBe('function')
    const zhT = bundle['GROK_WORKFLOW_INTERNALS'].translator('zh') as (key: string, params?: Record<string, unknown>) => string
    const rendered = JSON.stringify((UpdateCard as (props: unknown) => unknown)({ t: zhT }))
    expect(rendered).toContain('data-gw-update')
    expect(rendered).toContain('data-gw-update-command')
    expect(rendered).toContain('data-action')
    expect(rendered).toContain('update-copy')
    // No form field: the card never joins draft/ops/save.
    expect(rendered).not.toContain('data-field')
  })

  it('the card copy never renders a dictionary key id', () => {
    const internals = bundle['GROK_WORKFLOW_INTERNALS'] as {
      translator(locale: string): (key: string, params?: Record<string, unknown>) => string
      UpdateCard(props: unknown): unknown
    }
    for (const locale of ['zh', 'en']) {
      const t = internals.translator(locale)
      const rendered = JSON.stringify(internals.UpdateCard({ t }))
      for (const key of ['update.title', 'update.body', 'update.copy', 'update.current']) {
        expect(rendered, `${locale} ${key}`).not.toContain(key)
      }
    }
  })
})
