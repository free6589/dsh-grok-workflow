// Two fake provider endpoints for the 0.13.27 dead-route soak.
//
// :18471 answers every completion with 503 (a provider that is down).
// :18472 accepts the connection and never answers (a provider that hangs).
// Both serve /models so the plugin's route label resolves and the failure is
// the transport, not a missing model.
import { createServer } from 'node:http'
import { appendFileSync } from 'node:fs'

const log = process.argv[2]
const note = line => appendFileSync(log, `${new Date().toISOString()} ${line}\n`)

function body(res, status, payload) {
  const text = JSON.stringify(payload)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) })
  res.end(text)
}

function readBody(req) {
  return new Promise(resolve => {
    let bytes = 0
    req.on('data', chunk => { bytes += chunk.length })
    req.on('end', () => resolve(bytes))
    req.on('error', () => resolve(bytes))
  })
}

const dead = createServer(async (req, res) => {
  const url = req.url ?? ''
  if (url.includes('/models')) {
    return body(res, 200, { object: 'list', data: [{ id: 'soak/dead-model', object: 'model' }] })
  }
  const bytes = await readBody(req)
  note(`DEAD ${req.method} ${url} bytes=${bytes}`)
  body(res, 503, { error: { message: 'service unavailable (soak endpoint: this provider is down)', type: 'server_error', code: 503 } })
})

const hang = createServer(async (req, res) => {
  const url = req.url ?? ''
  if (url.includes('/models')) {
    return body(res, 200, { object: 'list', data: [{ id: 'soak/hang-model', object: 'model' }] })
  }
  const bytes = await readBody(req)
  note(`HANG ${req.method} ${url} bytes=${bytes}`)
  // Hold the connection open with no response: the child never settles.
  req.on('close', () => note(`HANG closed ${url}`))
})

dead.listen(18471, '127.0.0.1', () => note('dead gateway on 127.0.0.1:18471'))
hang.listen(18472, '127.0.0.1', () => note('hang gateway on 127.0.0.1:18472'))
