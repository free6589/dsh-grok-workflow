// Round 35 probe: does a configuration key one level down survive the load path?
// Reads the *committed* lib/ (the shipped build), not src/, so this measures what
// a profile patch reaches in production.
import { Config, resolveConfig, snapshotConfig } from '../../../lib/config.js'

const show = (label, fn) => {
  try {
    const value = fn()
    console.log(`${label}: ACCEPTED -> ${JSON.stringify(value)}`)
  } catch (error) {
    console.log(`${label}: REFUSED -> ${error.message}`)
  }
}

// 1. schema output for an unknown role (the host validates before calling apply())
const schemaOut = Config({ roles: { reviewer: [{ model: 'rv' }], worker: [{ model: 'w' }] } })
console.log('schema keeps roles.reviewer:', JSON.stringify(Object.keys(schemaOut.roles)))

// 2. the plugin's own read of that schema output
show('resolveConfig(schema output) roles', () => resolveConfig(snapshotConfig(schemaOut)).roles.worker)
show('roles.reviewer reaches the plugin?', () => Object.keys(resolveConfig(snapshotConfig(schemaOut)).roles))

// 3. a route key typo (`maxInflight` instead of `maxInFlight`)
show('route maxInflight', () => resolveConfig({ roles: { worker: [{ model: 'w', maxInflight: 3 }] } }).roles.worker)
show('route weight', () => resolveConfig({ roles: { worker: [{ model: 'w', weight: 3 }] } }).roles.worker)

// 4. a top-level key is refused (the contrast the pool entry names)
show('top-level maxRetires', () => resolveConfig({ maxRetires: 2 }))

// 5. `roles` that is not an object at all
show('roles as a string', () => resolveConfig({ roles: 'worker:m1' }).roles)
