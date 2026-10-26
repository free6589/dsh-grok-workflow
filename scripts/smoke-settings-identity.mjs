#!/usr/bin/env node
// End-to-end check of the settings identity decision (t31/F1) against the *real*
// projection module of the DSH installation that runs this plugin.
//
// It answers one question that unit fixtures historically got wrong twice: when the
// runtime reports this plugin's settings descriptor — `volatileForm(schema)` rebuilt,
// `value = projectForm(form, plainConfig(config))` — does the *built* plugin still
// recognise the descriptor as its own page and print an informative line instead of
// "no generated descriptor was readable yet"?
//
// Usage: node scripts/smoke-settings-identity.mjs [path/to/dsh-settings/lib/types/schema.js]

import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require_ = createRequire(import.meta.url)

function resolveProjection() {
  if (process.argv[2] !== undefined) return process.argv[2]
  if (process.env.DSH_SETTINGS_MODULE) return process.env.DSH_SETTINGS_MODULE
  const candidates = []
  try {
    const executable = realpathSync(execFileSync('which', ['dsh'], { encoding: 'utf8' }).trim())
    const dshRoot = dirname(dirname(executable))
    candidates.push(join(dshRoot, 'node_modules', '@deepseek-ai', 'dsh-settings', 'lib/types/schema.js'))
    candidates.push(join(dirname(dshRoot), 'dsh-settings', 'lib/types/schema.js'))
  } catch { /* no dsh on PATH */ }
  return candidates.find(candidate => existsSync(candidate)) ?? ''
}

const modulePath = resolveProjection()
if (modulePath === '') {
  console.log('SKIP: no dsh-settings module found; pass one as an argument')
  process.exit(0)
}

const real = await import(pathToFileURL(modulePath).href)
const { Config } = await import('../lib/config.js')
const { describeSelf, describeSurface } = await import('../lib/settings.js')

// Exactly what SettingsForms.describe() produces for one entry.
const form = real.volatileForm(Config)
const descriptor = {
  ns: 'grok-workflow',
  autoGenerate: true,
  applies: 'live',
  revision: 0,
  schema: form.toJSON(),
  value: real.projectForm(form, real.plainConfig(Config({}))),
}

// The plugin reads optional services through `ctx.get(name)`, exactly like the runtime.
const services = { settings: { configure: () => () => {}, describe: () => [descriptor] } }
const ctx = { get: name => services[name] }
const view = describeSelf(ctx)
const surface = describeSurface(ctx)
// The wiring in src/index.ts picks the channel from the level; emulate it to show the line.
const printed = surface.level === 'warn' ? `WARN  ${surface.text}` : `INFO  ${surface.text}`

const failures = []
if (view === undefined) failures.push('describeSelf() did not recognise the descriptor')
if (view?.matchedBy !== 'value') failures.push(`matchedBy was ${String(view?.matchedBy)}, expected "value"`)
if (view?.fields?.length !== 21) failures.push(`fields was ${String(view?.fields?.length)}, expected 21`)
if (surface.level !== 'info') failures.push(`diagnostics level was ${surface.level}, expected "info"`)
if (!surface.text.includes('identified by value')) failures.push('diagnostics line does not name the identity path')
if (surface.text.includes('no generated descriptor')) failures.push('diagnostics still claims the page is unreadable')

console.log(`projection module: ${modulePath}`)
console.log(`projected fields: ${Object.keys(descriptor.value).length} (toolName present: ${'toolName' in descriptor.value})`)
console.log(`descriptor line: ${printed}`)
if (failures.length > 0) {
  console.log(`FAIL: ${failures.join('; ')}`)
  process.exit(1)
}
console.log('PASS: the built plugin recognises the runtime descriptor and prints an informative line')
