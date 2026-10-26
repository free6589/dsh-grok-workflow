import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { isVolatile } from '@deepseek-ai/cosmokit'
import { Config } from '../src/config.js'

/**
 * Settings descriptors shaped by the runtime's **own** projection rules.
 *
 * Twice a hand-written descriptor fixture disagreed with what the runtime
 * produces — first a fake `schema.properties`, then a `value` that still carried
 * non-volatile keys like `toolName` — and both times the test passed while the
 * shipped diagnostics line said "no generated descriptor was readable yet".
 * `SettingsForms.describe()` (@deepseek-ai/dsh-settings 0.2.1-rc.2,
 * `lib/index.js`) computes exactly:
 *
 *     form  = volatileForm(schema)                       // → { uid, refs } JSON
 *     value = projectForm(form, plainConfig(config))
 *
 * and the three helpers below are transcribed **verbatim** from that package's
 * `lib/types/schema.js` (same version), because importing them directly is not
 * possible without adding `@deepseek-ai/dsh-settings` to this package's
 * dependency tree — and installing it pulls `@deepseek-ai/dsh-config-editor`,
 * which breaks the real-Loader composition test in `test/loader.spec.ts`
 * (measured: `npm i -D @deepseek-ai/dsh-settings` → 2 loader tests fail, and
 * bisecting showed `dsh-config-editor` is the package that does it).
 *
 * The transcription cannot drift silently: `settings-projection.spec.ts` stores
 * the concrete facts the runtime produced (17 volatile fields, no `toolName`,
 * `{uid, refs}` schema) and, when a real `dsh-settings` happens to be installed,
 * cross-checks this copy against it function by function.
 */

/** Remove runtime references from a configuration snapshot. */
export function plainConfig(value: unknown): unknown {
  if (isVolatile(value as never)) return plainConfig((value as { get(): unknown }).get())
  if (Array.isArray(value)) return value.map(plainConfig)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, plainConfig(child)]))
  }
  return value
}

/** Select fields whose nearest volatile ancestor makes them editable without remounting. */
export function volatileForm(schema: unknown): unknown {
  const node = schema as { meta?: { volatile?: unknown }, type?: string, dict?: Record<string, unknown> }
  if (node.meta?.volatile) return schema
  if (node.type === 'object') {
    const dict = Object.fromEntries(Object.entries(node.dict ?? {}).flatMap(([key, child]) => {
      const field = volatileForm(child)
      return field === undefined ? [] : [[key, field]]
    }))
    return Object.keys(dict).length === 0 ? undefined : z.object(dict as never)
  }
  return undefined
}

/** Project only schema-declared fields, excluding ordinary configuration. */
export function projectForm(schema: unknown, value: unknown): unknown {
  const node = schema as { type?: string, dict?: Record<string, unknown> }
  if (node.type === 'object' && value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(node.dict ?? {}).flatMap(([key, child]) => {
      const field = Reflect.get(value, key)
      return field === undefined ? [] : [[key, projectForm(child, field)]]
    }))
  }
  return value
}

/** One descriptor exactly as `SettingsForms.describe()` would build it. */
export interface RealDescriptor {
  ns: string
  schema: unknown
  value: Record<string, unknown>
  autoGenerate: boolean
  applies: 'live'
  revision: number
}

/**
 * Build the descriptor a live runtime reports for this plugin.
 * @param config - the configuration the profile entry carries.
 * @param ns - profile entry id; defaults to the documented row id.
 * @returns The descriptor, produced by the runtime's projection rules.
 */
export function realSettingsDescriptor(
  config: Record<string, unknown> = {},
  ns = 'grok-workflow',
): RealDescriptor {
  const form = volatileForm(Config) as { toJSON(): unknown } | undefined
  if (form === undefined) throw new Error('volatileForm returned no form for this plugin Config')
  // The runtime projects the entry's *resolved* config; validate ours the same way
  // so the fixture carries exactly the fields a live entry would carry.
  const resolved = Config(config as never) as Record<string, unknown>
  return {
    ns,
    schema: form.toJSON(),
    value: projectForm(form, plainConfig(resolved)) as Record<string, unknown>,
    autoGenerate: true,
    applies: 'live',
    revision: 0,
  }
}

/**
 * Locate the real `dsh-settings` module of the installation that runs this plugin.
 *
 * `dsh-settings` is not a dependency of this package on purpose: installing it pulls
 * `@deepseek-ai/dsh-config-editor`, which breaks the real-Loader composition test. The
 * installation that actually mounts the plugin does have it, so it is discovered there —
 * first as a resolvable dependency, then next to the `dsh` executable on `PATH`.
 * @returns Absolute path to `lib/types/schema.js`, or `''` when nothing was found.
 */
export function resolveRealProjectionModule(): string {
  const requireFromHere = createRequire(import.meta.url)
  const candidates: string[] = []
  const fromPackage = (name: string, suffix: string[]): void => {
    try {
      const packageJson = requireFromHere.resolve(name)
      candidates.push(join(dirname(packageJson), ...suffix, 'lib/types/schema.js'))
    } catch { /* not a dependency of this package */ }
  }
  fromPackage('@deepseek-ai/dsh-settings/package.json', [])
  fromPackage('@deepseek-ai/dsh/package.json', ['node_modules', '@deepseek-ai', 'dsh-settings'])
  try {
    const executable = realpathSync(execFileSync('which', ['dsh'], { encoding: 'utf8' }).trim())
    // <prefix>/lib/node_modules/@deepseek-ai/dsh/lib/bin.js
    const dshRoot = dirname(dirname(executable))
    const scope = dirname(dshRoot)
    candidates.push(join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-settings', 'lib/types/schema.js'))
    candidates.push(join(scope, 'dsh-settings', 'lib/types/schema.js'))
  } catch { /* no dsh on PATH */ }
  const override = process.env.DSH_SETTINGS_MODULE
  if (override !== undefined && override !== '') candidates.unshift(override)
  return candidates.find(candidate => existsSync(candidate)) ?? ''
}
