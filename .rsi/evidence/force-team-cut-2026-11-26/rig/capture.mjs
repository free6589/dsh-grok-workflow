// Soak rig (not product code): a pass-through in front of this machine's model gateway
// that records the request bodies it forwards, byte for byte.
//
// Why: the forced-team instruction is appended at `agent/pre-step` and writes no
// session event, so a session log cannot show it. The only place it is observable is
// the request the loop actually sent to the model provider.
//
//   PORT=<n> UPSTREAM_PORT=<n> OUT=<dir> node capture.mjs
//
// Writes into <dir>:
//   index.txt        one line per request: seq, time, method, path, model, bytes, status
//   req-<seq>.json   the raw request body, unmodified
//
// Nothing is rewritten: the body is forwarded exactly as received, and the response is
// streamed back untouched. Request headers are forwarded but never logged, because they
// carry the gateway credential.
import { createServer, request as httpRequest } from 'node:http'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PORT = Number(process.env.PORT ?? 18190)
const UPSTREAM = { host: '127.0.0.1', port: Number(process.env.UPSTREAM_PORT ?? 18088) }
const OUT = process.env.OUT ?? '.'

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'index.txt'), '')
const note = (line) => appendFileSync(join(OUT, 'index.txt'), `${line}\n`)

let seq = 0

const server = createServer((req, res) => {
  const n = ++seq
  const chunks = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    const raw = Buffer.concat(chunks)
    const path = req.url ?? ''
    const at = new Date().toISOString()
    let model = ''
    try { model = JSON.parse(raw.toString('utf8') || '{}').model ?? '' } catch { /* not json */ }

    if (raw.length > 0) writeFileSync(join(OUT, `req-${String(n).padStart(3, '0')}.json`), raw)
    const head = `seq=${String(n).padStart(3, '0')} t=${at} ${req.method} ${path} model=${model} bytes=${raw.length}`

    const headers = { ...req.headers, host: `${UPSTREAM.host}:${UPSTREAM.port}`, 'content-length': String(Buffer.byteLength(raw)) }
    delete headers['transfer-encoding']

    const upstream = httpRequest({
      host: UPSTREAM.host,
      port: UPSTREAM.port,
      method: req.method,
      path,
      headers,
    }, (up) => {
      note(`${head} -> ${up.statusCode}`)
      res.writeHead(up.statusCode ?? 502, up.headers)
      up.pipe(res)
    })
    upstream.on('error', (error) => {
      note(`${head} -> upstream error ${String(error?.message ?? error)}`)
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
      res.end('upstream error')
    })
    upstream.end(raw)
  })
})

server.listen(PORT, '127.0.0.1', () => {
  note(`listening on 127.0.0.1:${PORT} -> ${UPSTREAM.host}:${UPSTREAM.port}`)
})
