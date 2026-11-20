/**
 * Deterministic stand-in for an OpenAI-completions model, for the compact E2E.
 *
 * The model is the one boundary AGENTS.md allows mocking (expensive and
 * nondeterministic). Everything else in the run — the fresh DSH profile, the
 * plugin's Loader row, the agent loop, the session journal, the token meter and
 * the `/compact` command — is the real thing.
 *
 * Usage: `node fake-model.mjs <port>`; prints `READY <port>` on stdout once the
 * listener is up. Every request is counted by kind so the driver can prove the
 * turn really did call a model.
 */

import { createServer } from 'node:http'

const port = Number(process.argv[2] ?? 0)
if (!Number.isInteger(port) || port <= 0) throw new Error('usage: node fake-model.mjs <port>')

const counts = { completions: 0, models: 0, other: 0 }

/** One short, harmless sentence; the plugin only needs non-empty text. */
const CONTENT = 'A local deterministic answer for the compact verification run.'

function completionBody(model) {
  return {
    id: 'chatcmpl-compact-e2e',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: CONTENT }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 64, completion_tokens: 16, total_tokens: 80 },
  }
}

function chunks(model) {
  const head = { id: 'chatcmpl-compact-e2e', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model }
  return [
    { ...head, choices: [{ index: 0, delta: { role: 'assistant', content: CONTENT }, finish_reason: null }] },
    { ...head, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  ]
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (req.method === 'GET' && url.pathname.endsWith('/models')) {
    counts.models += 1
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'compactfix/local', object: 'model', owned_by: 'local' }] }))
    return
  }
  if (req.method !== 'POST' || !url.pathname.endsWith('/chat/completions')) {
    counts.other += 1
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: `no route for ${req.method} ${url.pathname}` } }))
    return
  }
  const parts = []
  req.on('data', chunk => parts.push(chunk))
  req.on('end', () => {
    let body = {}
    try {
      body = JSON.parse(Buffer.concat(parts).toString('utf8'))
    } catch {
      // A malformed request still gets a well-formed answer: this stub's job is
      // to never be the reason a run hangs.
    }
    counts.completions += 1
    const model = typeof body.model === 'string' ? body.model : 'compactfix/local'
    if (body.stream === true) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      for (const chunk of chunks(model)) res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(completionBody(model)))
  })
})

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`READY ${server.address().port}\n`)
})

process.on('SIGTERM', () => {
  process.stdout.write(`COUNTS ${JSON.stringify(counts)}\n`)
  server.close(() => process.exit(0))
})
