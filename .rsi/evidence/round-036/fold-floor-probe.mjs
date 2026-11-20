// Round 36 probe: what a base64-wrapped armor block leaves behind, by fold width, on both
// boundaries. Usage: node fold-floor-probe.mjs <module-path>  (defaults to lib/redact.js)
//
// Read-only: prints measurements, writes nothing.
import vm from 'node:vm'
import { pathToFileURL } from 'node:url'

const modulePath = process.argv[2] ?? new URL('../../../lib/redact.js', import.meta.url).pathname
const { redactSecrets } = await import(pathToFileURL(modulePath).href)
const { WORKFLOW_SCRIPT } = await import(pathToFileURL(new URL('../../../lib/script.js', import.meta.url).pathname).href)

function scriptRedactPromptText() {
  const start = WORKFLOW_SCRIPT.indexOf('function redactPromptText(value) {')
  const end = WORKFLOW_SCRIPT.indexOf('\n}\n', start)
  const source = WORKFLOW_SCRIPT.slice(start, end + 3)
  return vm.runInContext(`(() => { ${source}; return redactPromptText })()`, vm.createContext({}))
}
const inScript = scriptRedactPromptText()

const PLACEHOLDER = '[REDACTED PRIVATE KEY]'
const pgp = `-----BEGIN PGP PRIVATE KEY BLOCK-----\n\n${'m'.repeat(120)}\n=abcd\n-----END PGP PRIVATE KEY BLOCK-----\n`
const blob = Buffer.from(pgp, 'utf8').toString('base64')
const fold = width => (blob.match(new RegExp(`.{1,${width}}`, 'g')) ?? []).join('\n')
const leftover = output => output.replace(PLACEHOLDER, '').replace(/\n/g, '')

console.log(`module: ${modulePath}`)
console.log(`encoded blob: ${blob.length} characters\n`)

console.log('fold width | placeholder | surviving encoded chars | prompt realm identical')
for (let width = 1; width <= 24; width += 1) {
  const folded = fold(width)
  const output = redactSecrets(folded)
  console.log(
    `${String(width).padStart(10)} | ${String(output.includes(PLACEHOLDER)).padStart(11)} | ` +
    `${String(leftover(output).length).padStart(23)} | ${inScript(folded) === output}`,
  )
}

console.log('\nfooter boundary: 64-column wrap, final line length -> what survives')
const head = blob.slice(0, blob.length - 12)
for (const length of [1, 3, 5, 7, 8, 9, 12]) {
  const tail = blob.slice(-12).slice(0, length)
  const text = `${head}\n${tail}`
  const output = redactSecrets(text)
  console.log(
    `tail ${String(length).padStart(2)} | survives=${String(output.includes(tail)).padStart(5)} | ` +
    `output=${JSON.stringify(output)} | prompt realm identical=${inScript(text) === output}`,
  )
}

console.log('\nover-reach boundary: short one-word lines directly after a wrapped blob')
const wrapped = (blob.match(/.{1,64}/g) ?? []).join('\n')
const one = redactSecrets(`dump:\n${wrapped}\nhello\nend of paragraph`)
const two = redactSecrets(`dump:\n${wrapped}\nhello\nworld\nend of paragraph`)
console.log(`one short line kept=${one.includes('hello')} | two short lines kept=${two.includes('hello')} | paragraph kept=${two.includes('end of paragraph')}`)

console.log('\npublic material and prose are untouched')
const publicBlob = Buffer.from('-----BEGIN PGP PUBLIC KEY BLOCK-----\n\nmQENBFfake\n-----END PGP PUBLIC KEY BLOCK-----\n', 'utf8').toString('base64')
const prose = 'The password policy has 12 characters.\nRotate the secret before Friday.\nnext line stays'
console.log(`base64 PGP PUBLIC KEY BLOCK unchanged=${redactSecrets(`tool: ${publicBlob}`) === `tool: ${publicBlob}`}`)
console.log(`prose unchanged=${redactSecrets(prose) === prose}`)

console.log('\nperformance (single run, milliseconds)')
const bigBlob = Buffer.from(`-----BEGIN PGP PRIVATE KEY BLOCK-----\n\n${'m'.repeat(70000)}\n-----END PGP PRIVATE KEY BLOCK-----\n`, 'utf8').toString('base64')
for (const width of [5, 76]) {
  const folded = (bigBlob.match(new RegExp(`.{1,${width}}`, 'g')) ?? []).join('\n')
  const started = performance.now()
  redactSecrets(folded)
  console.log(`fold ${String(width).padStart(2)} | ${folded.length} chars | ${(performance.now() - started).toFixed(2)} ms`)
}
const adversarial = 'a_'.repeat(50_000)
const started = performance.now()
redactSecrets(adversarial)
console.log(`adversarial 100 KB | ${(performance.now() - started).toFixed(2)} ms`)
