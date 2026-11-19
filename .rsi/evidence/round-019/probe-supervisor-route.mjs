// Read-only probe: does load-time route validation cover roles.supervisor?
import { validateRoutes } from '../../../lib/settings.js'
import { resolveConfig } from '../../../lib/config.js'

const ctx = {
  get(name) {
    if (name === 'llm') {
      return {
        listProviders: () => [{ id: 'p1' }],
        listConfigurableProviders: () => [{ provider: 'p1', settingsNs: 'ns-p1', settingsPath: [] }],
      }
    }
    if (name === 'settings') {
      return { describe: () => [{ ns: 'ns-p1', value: { models: [{ id: 'm1' }] } }] }
    }
    return undefined
  },
}

for (const role of ['planner', 'worker', 'verifier', 'synthesizer', 'supervisor']) {
  const cfg = resolveConfig({ roles: { [role]: [{ provider: 'p1', model: 'no-such-model' }] } })
  const badModel = validateRoutes(ctx, cfg).errors
  const cfg2 = resolveConfig({ roles: { [role]: [{ provider: 'no-such-provider', model: 'm1' }] } })
  const badProvider = validateRoutes(ctx, cfg2).errors
  console.log(`${role}: unknown-model errors=${badModel.length} ${JSON.stringify(badModel)}`)
  console.log(`${role}: unknown-provider errors=${badProvider.length} ${JSON.stringify(badProvider)}`)
}
