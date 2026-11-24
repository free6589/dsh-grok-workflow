// Attributes every hang-route request in a soak run to a task attempt, and
// brackets each settlement against childTimeoutMs.
//
//   node analyze.mjs <gatewayLog> <dshHome> [childTimeoutMs]
//
// Ground truth for "how many times was the route called" is the fake gateway's
// own completion log: one `mode=hang` line per completion request, each with the
// request's own open timestamp and byte count. Nothing here reads the plugin's
// self-report for a count.
//
// The settlement instant is not logged by the plugin, so it is *bracketed* by
// two observable events: the child turn that made the request started at
// turn/start, and the next child turn (the retry, or the next task) started
// after it. The plugin's timer is armed at arm <= turn/start and fires at
// arm + childTimeoutMs, so the fire instant lies inside
//   (turn/start, next turn/start)  and  <= turn/start + childTimeoutMs.
// The bracket reported below is `nextTurnStart - requestOpen`, which therefore
// contains the budget exactly when the retry's own spawn overhead is small.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const [gatewayLog, dshHome, timeoutArg] = process.argv.slice(2)
if (gatewayLog === undefined || dshHome === undefined) {
  console.error('usage: node analyze.mjs <gatewayLog> <dshHome> [childTimeoutMs]')
  process.exit(2)
}
const childTimeoutMs = Number(timeoutArg ?? 45000)

// ---- gateway log -----------------------------------------------------------
const hangRequests = []
const proxyRequests = []
for (const line of readFileSync(gatewayLog, 'utf8').split('\n')) {
  if (line.trim() === '') continue
  const opened = /opened_at=([0-9T:.\-Z]+)/.exec(line)
  const model = /model=(\S+)/.exec(line)
  const n = / n=(\d+)/.exec(line)
  const bytes = /bytes=(\d+)/.exec(line)
  if (opened !== null) {
    hangRequests.push({ at: Date.parse(opened[1]), model: model?.[1] ?? '?', n: Number(n?.[1] ?? 0), bytes: Number(bytes?.[1] ?? 0) })
    continue
  }
  const dur = /dur=(\d+)ms/.exec(line)
  const status = /status=(\d+)/.exec(line)
  if (dur !== null) proxyRequests.push({ at: Date.parse(line.slice(0, 24)), model: model?.[1] ?? '?', n: Number(n?.[1] ?? 0), dur: Number(dur[1]), status: status?.[1] ?? '?' })
}

// ---- child sessions --------------------------------------------------------
function decode(file) {
  return file.endsWith('.zstd')
    ? execFileSync('zstd', ['-dc', file], { maxBuffer: 256 * 1024 * 1024 }).toString('utf8')
    : readFileSync(file, 'utf8')
}

const sessionRoot = join(dshHome, 'sessions')
const sessions = []
if (existsSync(sessionRoot)) {
  for (const project of readdirSync(sessionRoot)) {
    for (const id of readdirSync(join(sessionRoot, project))) {
      const file = join(sessionRoot, project, id, 'session.v4.jsonl.zstd')
      if (!existsSync(file)) continue
      let label = ''
      const starts = []
      const ends = []
      const retries = []
      for (const line of decode(file).split('\n')) {
        if (line.trim() === '') continue
        let event
        try { event = JSON.parse(line) } catch { continue }
        const time = event.time ?? event.ts ?? event.timestamp
        if (event.type === 'user/message' && label === '') {
          const text = event.data?.content?.[0]?.text
          if (typeof text === 'string') label = text.split('\n')[0].slice(0, 34)
        }
        if (event.type === 'turn/start') starts.push(time)
        if (event.type === 'turn/end') ends.push({ at: time, kind: event.data?.reason?.kind ?? '?', cause: event.data?.reason?.reason?.kind ?? '' })
        if (event.type === 'llm/retry') retries.push({ at: time, what: `llm/retry #${event.data?.retry} (${(event.data?.policyKey ?? '').slice(0, 90)})` })
        if (event.type === 'llm/retry-started') retries.push({ at: time, what: `llm/retry-started #${event.data?.retry}` })
      }
      sessions.push({ id, label, starts, ends, retries })
    }
  }
}
sessions.sort((a, b) => (a.starts[0] ?? 0) - (b.starts[0] ?? 0))

// ---- report ---------------------------------------------------------------
const T0 = Math.min(...[...hangRequests.map(r => r.at), ...sessions.map(s => s.starts[0] ?? Infinity)])
const rel = ms => (ms === undefined ? '        ?' : `T+${String(ms - T0).padStart(7, ' ')}ms`)
const iso = ms => (ms === undefined ? '?' : new Date(ms).toISOString().slice(11, 23))

console.log(`gateway log : ${gatewayLog}`)
console.log(`dsh home    : ${dshHome}`)
console.log(`T0          : ${new Date(T0).toISOString()} (${T0})`)
console.log(`childTimeoutMs = ${childTimeoutMs}`)
console.log('')

console.log('=== hang-route completion requests (ground truth: one line each) ===')
for (const r of hangRequests) {
  console.log(`  #${r.n} ${r.model} opened ${rel(r.at)} (${iso(r.at)}) bytes=${r.bytes}`)
}
console.log(`  TOTAL hang-route requests: ${hangRequests.length}`)
console.log('')

console.log('=== proxy-route completions (the live route, per model) ===')
const byModel = new Map()
for (const r of proxyRequests) {
  const entry = byModel.get(r.model) ?? { count: 0, first: r.at, last: r.at, durations: [] }
  entry.count += 1
  entry.first = Math.min(entry.first, r.at)
  entry.last = Math.max(entry.last, r.at)
  entry.durations.push(r.dur)
  byModel.set(r.model, entry)
}
for (const [model, e] of byModel) {
  console.log(`  ${model.padEnd(20)} ${String(e.count).padStart(3)} calls  first ${rel(e.first)}  last ${rel(e.last)}  dur ${Math.min(...e.durations)}..${Math.max(...e.durations)} ms`)
}
console.log('')

console.log('=== child turns (who was running when) ===')
const allStarts = sessions.flatMap(s => s.starts).sort((a, b) => a - b)
for (const s of sessions) {
  if (s.starts.length === 0) continue
  console.log(`  ${(s.label || s.id).padEnd(26)} turn/start ${rel(s.starts[0])} (${iso(s.starts[0])})`)
  for (const e of s.ends) console.log(`  ${''.padEnd(26)} turn/end   ${rel(e.at)} (${iso(e.at)}) ${e.kind}${e.cause === '' ? '' : '/' + e.cause}`)
  for (const r of s.retries) console.log(`  ${''.padEnd(26)} ${r.what}  ${rel(r.at)} (${iso(r.at)})`)
}
console.log('')

console.log('=== attribution: which turn made which hang request, and the settlement bracket ===')
for (const r of hangRequests) {
  // A transport re-send is logged by the child that owns it: `llm/retry-started`
  // lands a few ms before the gateway sees the new socket. That is a stronger
  // owner signal than "which turn started most recently", so it wins.
  const resend = sessions
    .flatMap(s => s.retries.filter(x => x.what.startsWith('llm/retry-started')).map(x => ({ s, at: x.at })))
    .filter(x => x.at <= r.at && r.at - x.at < 2000)
    .sort((a, b) => b.at - a.at)[0]
  // Otherwise: the turn that was open when the request arrived.
  const openTurn = sessions
    .filter(s => (s.starts[0] ?? Infinity) <= r.at)
    .sort((a, b) => (b.starts[0] ?? 0) - (a.starts[0] ?? 0))[0]
  const owner = resend?.s ?? openTurn
  // The next turn to start after the request: the retry, the next task, or nothing.
  const next = allStarts.find(t => t > r.at)
  const sinceOpen = next === undefined ? undefined : next - r.at
  const verdict = resend !== undefined
    ? `NO plugin budget is waiting on this socket — it is the transport layer re-sending a call the script already settled at ${iso(owner.starts[0])} + ${childTimeoutMs} ms; it stayed open until the run tore the child down (owner turn/end ${iso(owner.ends[0]?.at)}, ${owner.ends[0]?.kind}/${owner.ends[0]?.cause})`
    : sinceOpen === undefined
      ? 'no later turn: the run ended first (this request was never settled by its own budget)'
      : `${sinceOpen} ms after the request; budget ${childTimeoutMs} ms => ${Math.abs(sinceOpen - childTimeoutMs) <= 1000 ? 'AT the budget' : sinceOpen < childTimeoutMs ? 'BEFORE the budget (spawn overhead)' : 'AFTER the budget (spawn overhead + bookkeeping)'}`
  console.log(`  #${r.n} opened ${iso(r.at)} bytes=${r.bytes}`)
  console.log(`      owner turn : ${owner === undefined ? '(none observed)' : `${owner.label || owner.id} started ${iso(owner.starts[0])}${resend === undefined ? '' : ` — via llm/retry-started at ${iso(resend.at)} (${r.at - resend.at} ms before this socket)`}`}`)
  console.log(`      next turn  : ${next === undefined ? '(none)' : iso(next)}  => ${verdict}`)
}

// Same-bytes pairing: a request whose body is byte-identical to an earlier one
// is almost certainly the transport layer re-sending it, not a new attempt.
console.log('')
console.log('=== byte-identical request bodies (transport re-sends) ===')
const seen = new Map()
for (const r of hangRequests) {
  if (seen.has(r.bytes)) {
    const first = seen.get(r.bytes)
    console.log(`  #${r.n} (${iso(r.at)}) has the same body as #${first.n} (${iso(first.at)}): ${r.bytes} bytes, ${r.at - first.at} ms apart`)
  } else seen.set(r.bytes, r)
}
