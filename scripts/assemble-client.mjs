#!/usr/bin/env node
// Assemble the browser bundle from its moved fragments.
//
// `src/client/index.js` is the file the Host serves verbatim and the file ~25 specs
// read with `readFileSync` + `new Function()`. It must stay a complete, runnable bundle,
// so the split is text-level: the nine fragments below are concatenated in this exact
// order to reproduce it byte for byte. No import/export rewriting, no codegen —
// `cat` in this order equals `index.js` (asserted below and by test/client.spec.ts).
//
// Fragment map (boundaries fall on blank lines between top-level statements):
//   preamble.js         lines 1-225    header comment, factory prologue, FIELDS/ROLES/version consts
//   i18n.js             lines 226-897  EN/ZH dictionaries, translate/translator, locale helpers
//   draft.js            lines 898-1223 draft/validate/opsFor + config-notice store
//   styles.js           lines 1224-1319 HAIRLINE/styles/PageStyle
//   settings-page.js    lines 1320-2205 settings page components (namespace, rows, chains, UpdateCard)
//   task-panel.js       lines 2206-2684 chat task panel (workflow-run node re-registration)
//   progress-tab.js     lines 2685-6597 conversation progress tab
//   composer-toggles.js lines 6598-7537 composer tool-row switches (loop/iterate/mode)
//   shell.js            lines 7538-7994 inject/mount/apply + exports assembly

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dir = join(root, 'src', 'client')

const FRAGMENTS = [
  'preamble.js',
  'i18n.js',
  'draft.js',
  'styles.js',
  'settings-page.js',
  'task-panel.js',
  'progress-tab.js',
  'composer-toggles.js',
  'shell.js',
]

export function assembleClientBundle() {
  return FRAGMENTS.map((name) => readFileSync(join(dir, name), 'utf8')).join('')
}

const invoked = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (invoked) {
  const out = assembleClientBundle()
  const target = join(dir, 'index.js')
  if (readFileSync(target, 'utf8') !== out) {
    console.error('client fragments do not reassemble to src/client/index.js byte-identically; refusing to write.')
    process.exitCode = 1
  } else {
    writeFileSync(target, out)
    console.log(`client bundle assembled: ${out.length} bytes → src/client/index.js`)
  }
}
