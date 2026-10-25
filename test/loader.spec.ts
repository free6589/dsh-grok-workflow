import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0)) {
    try { await ctx.fiber.dispose() } catch { /* already disposed */ }
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('real DSH Loader composition', () => {
  it('loads the built bundle, registers grok_workflow with the real tool registry, and unregisters on fiber disposal', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-grok-workflow-loader-'))
    roots.push(root)
    const fakeEngine = join(root, 'fake-engine.mjs')
    writeFileSync(fakeEngine, [
      "export const name = 'fake-workflow-engine'",
      'export function apply(ctx) {',
      "  ctx.provide('workflowEngine', { start: async () => { throw new Error('not used in loader test') } })",
      '}',
      '',
    ].join('\n'))
    const plugin = pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href
    const yaml = join(root, 'cordis.yml')
    writeFileSync(yaml, [
      '- id: system-prompt',
      "  name: '@deepseek-ai/dsh-system-prompt'",
      '- id: tools',
      "  name: '@deepseek-ai/dsh-tools'",
      '- id: fake-workflow-engine',
      `  name: ${pathToFileURL(fakeEngine).href}`,
      '- id: grok-workflow',
      `  name: ${plugin}`,
      '  config:',
      '    maxConcurrency: 2',
      '    maxRetries: 1',
      '',
    ].join('\n'))

    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(yaml).href } })
    await ctx.loader.await()

    expect(ctx.get('systemPrompt')).toBeInstanceOf(SystemPrompt)
    expect(ctx.get('tools')).toBeInstanceOf(ToolRuntime)
    expect(ctx.tools.schemas().map(tool => tool.name)).toContain('grok_workflow')

    expect((await ctx.systemPrompt.assemble()).sections.some(section => section.name === 'tool:grok-workflow')).toBe(true)
    const entry = [...ctx.loader.entries()].find(item => item.options.id === 'grok-workflow')
    expect(entry?.fiber).toBeDefined()
    await entry!.fiber!.dispose()
    await ctx.loader.await()
    expect(ctx.tools.schemas().map(tool => tool.name)).not.toContain('grok_workflow')
    expect((await ctx.systemPrompt.assemble()).sections.some(section => section.name === 'tool:grok-workflow')).toBe(false)
  })

  it('is inert when the bundle row is disabled', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-grok-workflow-disabled-'))
    roots.push(root)
    const fakeEngine = join(root, 'fake-engine.mjs')
    writeFileSync(fakeEngine, [
      "export const name = 'fake-workflow-engine'",
      'export function apply(ctx) {',
      "  ctx.provide('workflowEngine', { start: async () => { throw new Error('not used') } })",
      '}',
      '',
    ].join('\n'))
    const yaml = join(root, 'cordis.yml')
    writeFileSync(yaml, [
      '- id: system-prompt',
      "  name: '@deepseek-ai/dsh-system-prompt'",
      '- id: tools',
      "  name: '@deepseek-ai/dsh-tools'",
      '- id: fake-workflow-engine',
      `  name: ${pathToFileURL(fakeEngine).href}`,
      '- id: grok-workflow',
      `  name: ${pathToFileURL(join(process.cwd(), 'lib', 'index.js')).href}`,
      '  disabled: true',
      '',
    ].join('\n'))

    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(yaml).href } })
    await ctx.loader.await()

    expect(ctx.tools.schemas().map(tool => tool.name)).not.toContain('grok_workflow')
    expect((await ctx.systemPrompt.assemble()).sections.some(section => section.name === 'tool:grok-workflow')).toBe(false)
  })
})
