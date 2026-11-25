// Verification rig (not product code): a route that refuses the key ONCE.
//
//   node proxy.mjs <logPath>          refuse the first completion, then serve
//   PROBE_ALWAYS=1 node proxy.mjs <logPath>   refuse every completion
//
// The always mode exists for one measurement only: a run whose judge is refused
// twice never completes, and a non-completed report carries the audit trail
// (`judge re-fired`) that a green report does not print.
//
// Listens on 127.0.0.1:18190. The FIRST POST whose path ends with /responses is
// answered 401 with the gateway's own refusal shape; every other request is
// forwarded verbatim to the machine's real gateway on 127.0.0.1:18088. That is
// the shape a gateway minting its own upstream credential produces after a
// rotation (D-164): a refusal about this request, not about the route.
//
// The Authorization / x-bf-vk headers are forwarded, never logged.
import { createServer, request as httpRequest } from 'node:http'
import { appendFileSync, writeFileSync } from 'node:fs'

const logPath = process.argv[2]
if (logPath === undefined) {
  console.error('usage: node proxy.mjs <logPath>')
  process.exit(2)
}
writeFileSync(logPath, '')

const LISTEN_PORT = 18190
const UPSTREAM = { host: '127.0.0.1', port: 18088 }
let seq = 0
let injected = false
const ALWAYS = process.env.PROBE_ALWAYS === '1'

const logLine = (line) => appendFileSync(logPath, `${line}\n`)

const refusalBody = JSON.stringify({
  message: '401 Unauthorized: virtual key is required. Provide a virtual key via the x-bf-vk header.',
  type: 'authentication_error',
})

const server = createServer((req, res) => {
  const n = ++seq
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const raw = Buffer.concat(chunks)
    let model = ''
    try { model = JSON.parse(raw.toString('utf8') || '{}').model ?? '' } catch { /* not json */ }
    const path = req.url ?? ''
    const isCompletion = req.method === 'POST' && /\/responses(\?|$)/.test(path)
    if (isCompletion && (ALWAYS || !injected)) {
      injected = true
      logLine(`seq ${n} ${req.method} ${path} model ${model} -> 401 injected${ALWAYS ? ' (always mode)' : ''}`)
      res.writeHead(401, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(refusalBody) })
      res.end(refusalBody)
      return
    }
    const upstream = httpRequest({
      host: UPSTREAM.host,
      port: UPSTREAM.port,
      method: req.method,
      path,
      headers: { ...req.headers, host: `${UPSTREAM.host}:${UPSTREAM.port}` },
    }, (up) => {
      logLine(`seq ${n} ${req.method} ${path} model ${model} -> forwarded ${up.statusCode}`)
      res.writeHead(up.statusCode ?? 502, up.headers)
      up.pipe(res)
    })
    upstream.on('error', (error) => {
      logLine(`seq ${n} ${req.method} ${path} model ${model} -> upstream error ${String(error?.message ?? error)}`)
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
      res.end('upstream error')
    })
    upstream.end(raw)
  })
})

server.listen(LISTEN_PORT, '127.0.0.1', () => {
  logLine(`listening on 127.0.0.1:${LISTEN_PORT} -> ${UPSTREAM.host}:${UPSTREAM.port} (first completion refused)`)
})
