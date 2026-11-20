// Round 34 over-reach probe: the widened break must not start eating public material or prose.
const { redactSecrets } = await import(new URL('../../../lib/redact.js', import.meta.url).href)
const b64 = s => Buffer.from(s, 'utf8').toString('base64')
const fold = (s, w, br) => (s.match(new RegExp(`.{1,${w}}`, 'g')) ?? []).join(br)
const pgpPub = '-----BEGIN PGP PUBLIC KEY BLOCK-----\n' + 'M'.repeat(80) + '\n-----END PGP PUBLIC KEY BLOCK-----\n'
const cert = '-----BEGIN CERTIFICATE-----\n' + 'M'.repeat(80) + '\n-----END CERTIFICATE-----\n'
const priv = '-----BEGIN PRIVATE KEY-----\n' + 'M'.repeat(80) + '\n-----END PRIVATE KEY-----\n'
for (const [name, pem] of [['PGP public', pgpPub], ['CERTIFICATE', cert]]) {
  for (const br of ['\n', '\\n', '\\\\n']) {
    const out = redactSecrets(JSON.stringify({ payload: fold(b64(pem), 24, br) }))
    console.log(`${name} break=${JSON.stringify(br)} redacted=${out.includes('[REDACTED')}`)
  }
}
const prose = JSON.stringify({ note: 'C:\\\\new folder\\\\names stay; MMMM\\\\nMMMM is not a key' })
console.log('prose untouched =', redactSecrets(prose) === prose)
for (const br of ['\n', '\\n', '\\\\n']) {
  const out = redactSecrets(JSON.stringify({ keyring: fold(b64(priv), 24, br) }))
  const parses = (() => { try { JSON.parse(out); return true } catch { return false } })()
  console.log(`PRIVATE break=${JSON.stringify(br)} redacted=${out.includes('[REDACTED PRIVATE KEY]')} parses=${parses}`)
}
