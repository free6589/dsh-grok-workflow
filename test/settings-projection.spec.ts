import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Config } from '../src/config.js'
import { plainConfig, projectForm, realSettingsDescriptor, resolveRealProjectionModule, volatileForm } from './settings-fixture.js'

/**
 * The settings fixture must track what the runtime really does.
 *
 * Two hand-written fixtures were wrong in ways that hid a broken identity check
 * (a fake `schema.properties`, then a `value` still carrying non-volatile keys),
 * so the facts below are pinned: they were measured against the installed
 * `@deepseek-ai/dsh-settings@0.2.1-rc.2`, and a change in any of them means this
 * fixture — and probably `describeSelf()` — has to be revisited.
 */
describe('the settings fixture matches the runtime projection', () => {
  it('projects exactly the volatile fields, dropping structural ones', () => {
    const descriptor = realSettingsDescriptor()
    const projected = Object.keys(descriptor.value).sort()
    // 22 keys exist in the config surface, but the runtime's form only carries the
    // 19 volatile ones; `toolName`, `enforceGate`, `gateRequired` and
    // `configVersion` are plain and therefore invisible to the form.
    expect(projected).toHaveLength(19)
    expect(projected).toEqual([
      'answerStrategy', 'gatePreset', 'gateScope', 'historyChars', 'historyTurns',
      'maxActiveRuns', 'maxActiveRunsTotal', 'maxConcurrency', 'maxQueuedMessages', 'maxRetries',
      'maxTasks', 'recordLimit', 'recordRuns', 'roles', 'showProgress',
      'subagentProvider', 'switchOn', 'synthesis', 'timeoutMs',
    ])
    for (const structural of ['toolName', 'enforceGate', 'gateRequired', 'configVersion']) {
      expect(projected).not.toContain(structural)
    }
  })

  it('reports a rebuilt schema whose uid differs from the plain Config', () => {
    const descriptor = realSettingsDescriptor()
    const form = descriptor.schema as { uid?: unknown, refs?: unknown }
    expect(Object.keys(form).sort()).toEqual(['refs', 'uid'])
    // This is why identity cannot rely on the uid alone: the form is a *different*
    // schemastery node than `Config`, so the two uids do not match.
    expect(form.uid).not.toBe((Config.toJSON() as { uid: number }).uid)
  })

  it('carries the configured values through the projection unchanged', () => {
    const descriptor = realSettingsDescriptor({ maxConcurrency: 2, switchOn: ['timeout'] })
    expect(descriptor.value.maxConcurrency).toBe(2)
    expect(descriptor.value.switchOn).toEqual(['timeout'])
    expect(descriptor.value.roles).toBeDefined()
  })

  it('agrees with the installed dsh-settings when one is available', async () => {
    // CI installs this package's declared dependencies only, so `dsh-settings` is
    // usually absent there. When it *is* resolvable (a dev box or a DSH checkout),
    // the transcription is compared against it directly instead of being trusted.
    const modulePath = resolveRealProjectionModule()
    if (modulePath === '') {
      // Documented skip: neither this package nor the DSH installation on PATH carries
      // `dsh-settings`, so there is nothing to compare the transcription against here.
      expect(modulePath).toBe('')
      return
    }
    const real = await import(pathToFileURL(modulePath).href) as Record<string, (input: unknown, extra?: unknown) => unknown>
    // Every `volatileForm()` call builds a *fresh* schemastery node, so serialized forms
    // differ in uid numbering by construction. The comparable part is the field tree.
    const shape = (form: unknown): unknown => {
      const json = JSON.parse(JSON.stringify((form as { toJSON(): unknown }).toJSON())) as Record<string, unknown>
      delete json.uid
      delete json.refs
      return json
    }
    const ours = volatileForm(Config)
    const theirs = real.volatileForm!(Config)
    expect(shape(ours)).toEqual(shape(theirs))
    expect(Object.keys((ours as { dict: object }).dict).sort())
      .toEqual(Object.keys((theirs as { dict: object }).dict).sort())
    const sample = { maxConcurrency: 2, roles: { worker: [{ provider: 'p', model: 'm' }] }, switchOn: ['timeout'] }
    const resolved = Config(sample as never)
    expect(JSON.stringify(plainConfig(resolved))).toBe(JSON.stringify(real.plainConfig!(resolved)))
    expect(JSON.stringify(projectForm(ours, plainConfig(resolved))))
      .toBe(JSON.stringify(real.projectForm!(theirs, real.plainConfig!(resolved))))
    // And the descriptor our fixture hands to the tests equals the one this module yields.
    expect(realSettingsDescriptor().value)
      .toEqual(real.projectForm!(theirs, real.plainConfig!(Config({} as never))) as unknown)
  })
})
