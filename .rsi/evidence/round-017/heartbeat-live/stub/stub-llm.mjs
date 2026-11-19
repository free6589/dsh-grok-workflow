// Local model-boundary stub for the live DSH probe (round 17).
// It stands in ONLY for the remote LLM: DSH core, the Loader, the tool
// registry, the plugin lifecycle and the workflow engine are all real.
// Every request is recorded so the probe can show what DSH actually sent.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const PORT = Number(process.env.STUB_PORT ?? 3197)
const DIR = path.dirname(new URL(import.meta.url).pathname)
const LOG = path.join(DIR, 'stub-requests.jsonl')
const BODIES = path.join(DIR, 'stub-bodies.jsonl')
// 'text' -> always answer with text; 'tool' -> first chat reply is a
// grok_workflow tool call, every later reply is text.
const MODE = process.env.STUB_MODE ?? 'text'
let firstChatSeen = false

function record(obj) {
  fs.appendFileSync(LOG, `${JSON.stringify(obj)}\n`)
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => resolve(raw))
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const raw = await readBody(req)

  if (req.method === 'GET' && url.pathname.endsWith('/models')) {
    record({ ts: new Date().toISOString(), method: 'GET', path: url.pathname })
    const body = { object: 'list', data: [{ id: 'probe-stub', object: 'model', owned_by: 'local-probe' }] }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
    return
  }

  if (req.method === 'POST' && url.pathname.endsWith('/chat/completions')) {
    let body = {}
    try { body = JSON.parse(raw) } catch { /* recorded below as unparsable */ }
    const tools = Array.isArray(body.tools) ? body.tools : []
    const toolNames = tools.map((t) => t?.function?.name ?? t?.name).filter(Boolean)
    const isFirst = !firstChatSeen
    firstChatSeen = true
    record({
      ts: new Date().toISOString(),
      method: 'POST',
      path: url.pathname,
      stream: body.stream === true,
      model: body.model,
      messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
      toolCount: toolNames.length,
      toolNames,
      toolSchema: tools.find((t) => (t?.function?.name ?? t?.name) === 'grok_workflow')?.function ?? null,
      reply: MODE === 'tool' && isFirst ? 'tool_call' : 'text',
    })
    fs.appendFileSync(BODIES, `${JSON.stringify({ ts: new Date().toISOString(), body })}\n`)

    const useTool = MODE === 'tool' && isFirst
    const base = { id: 'stub-1', object: 'chat.completion.chunk', created: 0, model: body.model ?? 'probe-stub' }

    if (body.stream === true) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
      const send = (delta, finish = null) => {
        res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
      }
      send({ role: 'assistant', content: useTool ? '' : 'STUB_HEARTBEAT_ROUND_OK' })
      if (useTool) {
        send({
          tool_calls: [{
            index: 0,
            id: 'call_probe_1',
            type: 'function',
            function: { name: 'grok_workflow', arguments: JSON.stringify({ objective: 'probe: report the DSH version as a single trivial task' }) },
          }],
        }, 'tool_calls')
      } else {
        send({}, 'stop')
      }
      res.write(`data: ${JSON.stringify({ ...base, choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }

    const message = useTool
      ? {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_probe_1',
            type: 'function',
            function: { name: 'grok_workflow', arguments: JSON.stringify({ objective: 'probe: report the DSH version as a single trivial task' }) },
          }],
        }
      : { role: 'assistant', content: 'STUB_HEARTBEAT_ROUND_OK' }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      id: 'stub-1', object: 'chat.completion', created: 0, model: body.model ?? 'probe-stub',
      choices: [{ index: 0, message, finish_reason: useTool ? 'tool_calls' : 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }))
    return
  }

  record({ ts: new Date().toISOString(), method: req.method, path: url.pathname, note: 'unhandled' })
  res.writeHead(404, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ error: { message: 'stub: unhandled path' } }))
})

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`stub-llm listening on http://127.0.0.1:${PORT}/v1 mode=${MODE}\n`)
})
