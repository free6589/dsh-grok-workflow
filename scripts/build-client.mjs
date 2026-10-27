#!/usr/bin/env node
// Copy the browser bundle into lib/ as-is.
//
// `lib/client.js` must stay byte-identical to `src/client/index.js`: the host serves it
// verbatim to the browser in its `__ModuleLoader__` format, so any compiler output would
// break the registration contract. `test/client.spec.ts` fails when the two differ, which
// is how a stale bundle gets caught instead of shipping.

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = join(root, 'src', 'client', 'index.js')
const target = join(root, 'lib', 'client.js')

mkdirSync(dirname(target), { recursive: true })
copyFileSync(source, target)
console.log(`client bundle: ${readFileSync(target).length} bytes → lib/client.js`)
