// Soak scratch (not product code): read the session archives this run wrote and report,
// per session, the numbers the dispatcher must quote.
//
//   node analyze.mjs <zstd-dir> <jsonl-out-dir>
//
// For every session: turn/step counts, every tool/call name per step, the turn/end
// reason, the rows whose source.kind is grok-workflow-force-team (must be 0), the
// tool-workflow/* events, and the assistant text of the last step.
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const srcDir = process.argv[2]
const outDir = process.argv[3]
mkdirSync(outDir, { recursive: true })

const sessions = []
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) { walk(full); continue }
    if (!/\.jsonl(\.zstd)?$/.test(entry.name)) continue
    const jsonl = entry.name.endsWith('.zstd')
      ? execFileSync('zstd', ['-d', '-c', '--long=31', full], { maxBuffer: 1024 * 1024 * 512 }).toString('utf8')
      : execFileSync('cat', [full], { maxBuffer: 1024 * 1024 * 512 }).toString('utf8')
    const id = full.slice(srcDir.length + 1).replace(/\/session\.v4\.jsonl\.zstd$/, '').replace(/\//g, '__')
    const outName = `${id}.jsonl`
    writeFileSync(join(outDir, outName), jsonl)
    sessions.push({ id, path: join(outDir, outName), lines: jsonl.split('\n').filter((l) => l.trim() !== '') })
  }
}
walk(srcDir)

const text = (data) => {
  const holder = data?.message ?? data
  const blocks = Array.isArray(holder?.content) ? holder.content : []
  return blocks.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n')
}

for (const session of sessions) {
  const events = []
  for (const line of session.lines) {
    try { events.push(JSON.parse(line)) } catch { /* torn tail line */ }
  }
  const steps = []
  const toolCalls = []
  const ends = []
  const refusals = []
  const workflowEvents = []
  const userRows = []
  let assistant = ''
  for (const event of events) {
    const type = event.type ?? ''
    const data = event.data ?? {}
    if (type === 'turn/start') steps.push({ turn: data.turn, start: true })
    if (type === 'turn/end') ends.push({ turn: data.turn, reason: data.reason?.kind ?? JSON.stringify(data.reason) })
    if (type === 'step/start') steps.push({ turn: data.turn, step: data.step, start: true })
    if (type === 'tool/call') toolCalls.push({ turn: data.turn, step: data.step, name: data.name })
    if (type === 'tool-workflow/run-start' || type.startsWith('tool-workflow/')) workflowEvents.push({ type, data })
    if (type === 'user/message') {
      const kind = data.source?.kind
      const body = text(data)
      userRows.push({ seq: event.seq, kind, role: data.role, chars: body.length, body })
      if (kind === 'grok-workflow-force-team') refusals.push({ seq: event.seq, body })
    }
    if (type === 'assistant/message') assistant = text(data)
  }
  const stepStarts = steps.filter((s) => s.start && s.step !== undefined)
  const turns = ends.length
  const summary = {
    session: session.id,
    turns,
    turnEnds: ends,
    stepCount: stepStarts.length,
    steps: stepStarts.map((s) => `${s.turn}.${s.step}`),
    toolCalls: toolCalls.map((c) => `${c.turn}.${c.step}:${c.name}`),
    toolNames: [...new Set(toolCalls.map((c) => c.name))],
    workflowEventCount: workflowEvents.length,
    workflowEventTypes: [...new Set(workflowEvents.map((e) => e.type))],
    refusalRows: refusals.length,
    forceTeamRows: userRows.filter((r) => r.kind === 'grok-workflow-force-team').length,
    userRowKinds: userRows.map((r) => r.kind),
    injectedUserRows: userRows.filter((r) => r.kind === 'user' && r.body.includes('【强制：这一轮走团队模式】')).length,
    assistantTail: assistant.slice(-1500),
  }
  console.log(`\n===== ${session.id} =====`)
  console.log(JSON.stringify(summary, null, 1))
  writeFileSync(join(outDir, `${session.id}.summary.json`), JSON.stringify(summary, null, 2))
}
console.log(`\nSESSIONS=${sessions.length}`)