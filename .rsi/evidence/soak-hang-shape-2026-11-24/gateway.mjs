// Fake provider endpoints for the 2026-11-24 hang-shape soak.
//
//   node gateway.mjs <logPath>
//
// Three ports — 18591 / 18592 / 18593 — picked fresh for this round (the
// 0.13.27 round used 18471/18472, the 0.13.29 round 18491/18492/18493; nothing
// is reused). Every port answers /models and /chat/completions. A *completion*
// is decided per (port, model) by a scripted plan, so one model id can hang
// forever while another one really answers without either counter disturbing
// the other.
//
// Modes
//   proxy    forward to the machine's own gateway (127.0.0.1:18088) and pass the
//            response through; body.model is rewritten from the soak id to the
//            real upstream id so the upstream accepts it.
//   hang     read the body, then hold the socket open forever (a provider that
//            never answers: the child dies of its own budget, not of an HTTP code)
//   auth401  HTTP 401 with a provider-shaped error body (a refused key)
//   dead503  HTTP 503 with a provider-shaped error body (a provider that is down)
//
// Every completion is logged as one line: ts, port, model, per-model request
// number, mode, and (for hang) a body snippet that identifies which task the
// call belongs to, plus the moment the client gave up on it. The Authorization
// header is never logged.
import { createServer, request as httpRequest } from 'node:http'
import { appendFileSync } from 'node:fs'

const logPath = process.argv[2]
if (logPath === undefined) {
  console.error('usage: node gateway.mjs <logPath>')
  process.exit(2)
}

const UPSTREAM = {
  host: '127.0.0.1',
  port: 18088,
  // The brief's wb/cn route is 503 no_healthy_account on this machine (probed
  // 2026-11-24 14:5x, see README "Honest gaps"); wb/global is 200 healthy and
  // is the same model id served by the same gateway with the same key.
  model: process.env.SOAK_UPSTREAM_MODEL ?? 'wb/global:deepseek-v4.1-flash',
}
const PORTS = [18591, 18592, 18593]

// A plan is consumed one entry per completion request for that (port, model);
// the last entry repeats. Unknown models proxy — a mistake in the overlay then
// shows up as "this route answered", never as a silent fake failure.
const PLANS = {
  'soak/work-live': ['proxy'],
  'soak/plan-live': ['proxy'],
  'soak/judge-live': ['proxy'],
  'soak/sup-live': ['proxy'],
  'soak/synth-live': ['proxy'],
  // The route under test: it never answers, on any request number. Two
  // consecutive CHILD_TIMEOUT settlements on it are what the dead-route table
  // is supposed to notice.
  'soak/hang-always': ['hang'],
  'soak/auth-bad': ['auth401'],
  'soak/dead-503': ['dead503'],
}

const counters = new Map()
const t0 = Date.now()
const stamp = () => `${new Date().toISOString()} +${String(Date.now() - t0).padStart(6, ' ')}ms`
const note = line => appendFileSync(logPath, `${stamp()} ${line}\n`)

function bump(port, model) {
  const key = `${port}|${model}`
  const n = (counters.get(key) ?? 0) + 1
  counters.set(key, n)
  return n
}

function planFor(model, n) {
  const plan = PLANS[model] ?? ['proxy']
  return plan[Math.min(n - 1, plan.length - 1)]
}

function sendJson(res, status, payload) {
  const text = JSON.stringify(payload)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) })
  res.end(text)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function modelOf(buf) {
  try {
    const parsed = JSON.parse(buf.toString('utf8'))
    if (typeof parsed?.model === 'string') return parsed.model
  } catch {}
  return '(unparsed)'
}

// Which task this call belongs to. The worker prompt carries the task's own
// title/objective, so the body names it; only the shape of the request is
// logged, never the credential (which travels in a header, never here).
function snippetOf(buf) {
  try {
    const parsed = JSON.parse(buf.toString('utf8'))
    const text = (parsed.messages ?? [])
      .map(message => (typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? '')))
      .join(' ⏎ ')
    const oneLine = text.replace(/\s+/g, ' ').trim()
    return oneLine.length > 220 ? `${oneLine.slice(0, 220)}…` : oneLine
  } catch {
    return '(unparsed body)'
  }
}

function providerError(res, status, message, code, type) {
  sendJson(res, status, { error: { message, type, code } })
}

function proxy(req, res, buf, model, port, n, started) {
  const rewritten = (() => {
    try {
      const parsed = JSON.parse(buf.toString('utf8'))
      parsed.model = UPSTREAM.model
      return Buffer.from(JSON.stringify(parsed))
    } catch {
      return buf
    }
  })()
  const headers = { ...req.headers, host: `${UPSTREAM.host}:${UPSTREAM.port}`, 'content-length': String(rewritten.length) }
  const upstream = httpRequest(
    { host: UPSTREAM.host, port: UPSTREAM.port, method: req.method, path: req.url, headers },
    up => {
      note(`port=${port} model=${model} n=${n} mode=proxy status=${up.statusCode} dur=${Date.now() - started}ms`)
      res.writeHead(up.statusCode ?? 502, up.headers)
      up.pipe(res)
    },
  )
  upstream.on('error', err => {
    note(`port=${port} model=${model} n=${n} mode=proxy status=upstream-error ${err.message} dur=${Date.now() - started}ms`)
    if (!res.headersSent) providerError(res, 502, `soak gateway could not reach the live provider: ${err.message}`, 'upstream_unreachable', 'server_error')
    else res.end()
  })
  upstream.end(rewritten)
}

function handle(port) {
  return async (req, res) => {
    const url = req.url ?? ''
    const started = Date.now()
    if (url.includes('/models')) {
      // The provider catalog: listing a model here is what lets the plugin's route
      // label resolve, so the failure under test is the transport, not a 404.
      const ids = Object.keys(PLANS)
      note(`port=${port} GET ${url} mode=models`)
      return sendJson(res, 200, { object: 'list', data: ids.map(id => ({ id, object: 'model', owned_by: 'soak' })) })
    }
    const buf = await readBody(req)
    const model = modelOf(buf)
    const n = bump(port, model)
    const mode = planFor(model, n)
    if (mode === 'proxy') return proxy(req, res, buf, model, port, n, started)
    if (mode === 'hang') {
      note(
        `port=${port} model=${model} n=${n} mode=hang opened_at=${new Date(started).toISOString()} `
        + `bytes=${buf.length} snipped=${JSON.stringify(snippetOf(buf))}`,
      )
      // The client gives up when the plugin's child budget settles the call and
      // the child is disposed; that moment is the settlement latency this
      // round measures.
      req.on('close', () => note(
        `port=${port} model=${model} n=${n} mode=hang closed_at=${new Date().toISOString()} `
        + `settled_ms=${Date.now() - started}`,
      ))
      res.on('close', () => {})
      return // never answer
    }
    if (mode === 'auth401') {
      note(`port=${port} model=${model} n=${n} mode=auth401 status=401`)
      return providerError(
        res,
        401,
        'Incorrect API key provided: the virtual key presented to this provider was refused (soak fake provider, 401)',
        'invalid_api_key',
        'invalid_request_error',
      )
    }
    if (mode === 'dead503') {
      note(`port=${port} model=${model} n=${n} mode=dead503 status=503`)
      return providerError(res, 503, 'service unavailable (soak endpoint: this provider is down)', '503', 'server_error')
    }
    note(`port=${port} model=${model} n=${n} mode=unknown(${mode})`)
    providerError(res, 500, `soak gateway: unknown mode ${mode}`, 'soak_unknown_mode', 'server_error')
  }
}

for (const port of PORTS) {
  createServer(handle(port)).listen(port, '127.0.0.1', () => note(`listening on 127.0.0.1:${port}`))
}

note(`gateway up; plans=${JSON.stringify(PLANS)}; upstream=${UPSTREAM.host}:${UPSTREAM.port}/${UPSTREAM.model}`)
