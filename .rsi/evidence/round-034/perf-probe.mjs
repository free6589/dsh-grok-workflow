// Round 34 perf A/B: the working tree's lib/redact.js against the baseline build passed as argv[2].
// Reproduce: cd repo && git show HEAD:lib/redact.js > /tmp/baseline.mjs && node .rsi/evidence/round-034/perf-probe.mjs /tmp/baseline.mjs
const cur = await import(new URL('../../../lib/redact.js', import.meta.url).href)
const baselinePath = process.argv[2]
if (!baselinePath) throw new Error('usage: node perf-probe.mjs <baseline-lib-redact.mjs>')
const old = await import(baselinePath)

const prose = ('The workflow engine records each child report and forwards it. '
  + 'A token like sk-proj-abcdefghijklmnopqrstuvwxyz012345 is redacted on the way out. ').repeat(1200)

function time(fn, rounds = 12) {
  fn(); fn()
  const t = []
  for (let i = 0; i < rounds; i++) { const s = process.hrtime.bigint(); fn(); t.push(Number(process.hrtime.bigint() - s) / 1e6) }
  t.sort((a, b) => a - b)
  return t[Math.floor(rounds / 2)]
}
const bytes = Buffer.byteLength(prose)
const a = time(() => old.redactSecrets(prose))
const b = time(() => cur.redactSecrets(prose))
console.log(`${bytes} B prose: baseline ${a.toFixed(2)} ms -> now ${b.toFixed(2)} ms (x${(b/a).toFixed(2)})`)

const adv = 'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t\\\\n' + 'AAAA\\\\n'.repeat(6000)
const c = time(() => cur.redactSecrets(adv), 5)
console.log(`adversarial ${Buffer.byteLength(adv)} B: now ${c.toFixed(2)} ms`)
