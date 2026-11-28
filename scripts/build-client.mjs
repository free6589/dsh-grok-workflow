#!/usr/bin/env node
// Rebuild the browser bundle from its fragments, then copy it into lib/ as-is.
//
// `src/client/index.js` is assembled from `src/client/{preamble,i18n,draft,styles,
// settings-page,task-panel,progress-tab,composer-toggles,shell}.js` (see
// `scripts/assemble-client.mjs` for the fragment map): the nine fragments concatenated
// in order reproduce it byte for byte, and the assembly refuses to write on mismatch.
//
// `lib/client.js` must stay byte-identical to `src/client/index.js`: the host serves it
// verbatim to the browser in its `__ModuleLoader__` format, so any compiler output would
// break the registration contract. `test/client.spec.ts` fails when the two differ, which
// is how a stale bundle gets caught instead of shipping.

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

// Step 1: reassemble src/client/index.js from its fragments (byte-identical or fail).
execFileSync(process.execPath, [join(root, 'scripts', 'assemble-client.mjs')], { cwd: root, stdio: 'inherit' })

const source = join(root, 'src', 'client', 'index.js')
const target = join(root, 'lib', 'client.js')

mkdirSync(dirname(target), { recursive: true })
copyFileSync(source, target)
console.log(`client bundle: ${readFileSync(target).length} bytes → lib/client.js`)
