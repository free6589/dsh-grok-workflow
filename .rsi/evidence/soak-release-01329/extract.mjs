// Extracts the grok_workflow evidence from a soak run's own session transcript.
//
//   node extract.mjs <path-to-session.v4.jsonl[.zstd]> [outPrefix]
//
// A child's (or a wrapper's) self-report is not evidence; the plugin's own tool
// result is. This walks the DSH session JSONL that the isolated home produced,
// picks the tool result of the workflow tool, and prints
//   * the report text the plugin handed back (what the reader gets), and
//   * the canonical report fields the three scenarios argue from:
//     plan.source, every attempt row (route / passed / resubmitted / judgeRetried /
//     failure.class+reason), the route ledger and the dead-route table.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const path = process.argv[2]
const prefix = process.argv[3]
if (path === undefined) {
  console.error('usage: node extract.mjs <session.v4.jsonl[.zstd]> [outPrefix]')
  process.exit(2)
}

const raw = path.endsWith('.zstd')
  ? execFileSync('zstd', ['-dc', path], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8')
  : readFileSync(path, 'utf8')

const lines = raw.split('\n').filter(line => line.trim() !== '')
const results = []
const calls = []
for (const line of lines) {
  let event
  try {
    event = JSON.parse(line)
  } catch {
    continue
  }
  if (event.type === 'tool/call') calls.push(event)
  if (event.type !== 'tool/result') continue
  const blob = JSON.stringify(event.data ?? {})
  if (!blob.includes('grok_workflow') && !blob.includes('Plan:')) continue
  results.push(event)
}

console.log(`tool/call events: ${calls.length}; candidate tool/result events: ${results.length}`)
const shape = results.map(event => {
  const d = event.data ?? {}
  return { keys: Object.keys(d), name: d.name ?? d.tool ?? d.toolName, contentTypes: Array.isArray(d.content) ? d.content.map(c => c.type) : typeof d.content }
})
console.log('shapes:', JSON.stringify(shape, null, 2))

function textsOf(data) {
  const out = []
  const push = value => { if (typeof value === 'string' && value.length > 40) out.push(value) }
  push(data.text)
  push(data.output)
  if (Array.isArray(data.content)) for (const part of data.content) { push(part?.text); push(part?.data) }
  for (const value of Object.values(data)) if (typeof value === 'object' && value !== null) push(JSON.stringify(value))
  return out
}

function findReport(blob) {
  // The canonical report is a JSON object that carries a plan with a source.
  const attempts = []
  const walk = value => {
    if (value === null || typeof value !== 'object') return
    if (Array.isArray(value)) { for (const item of value) walk(item); return }
    if (value.plan !== undefined && value.plan?.source !== undefined && Array.isArray(value.tasks)) attempts.push(value)
    for (const item of Object.values(value)) walk(item)
  }
  try { walk(typeof blob === 'string' ? JSON.parse(blob) : blob) } catch {}
  return attempts
}

let index = 0
for (const event of results) {
  const data = event.data ?? {}
  const texts = textsOf(data)
  const reports = []
  for (const text of texts) {
    if (text.startsWith('{') || text.includes('"plan"')) reports.push(...findReport(text))
    else reports.push(...findReport(text))
  }
  const out = []
  out.push(`### tool/result #${++index} (seq=${event.seq}) keys=${Object.keys(data).join(',')}`)
  for (const text of texts) out.push(text)
  const report = reports[0]
  if (report !== undefined) {
    out.push('--- canonical fields ---')
    out.push(`plan.source=${report.plan?.source} tasks=${report.tasks.length} status=${report.status}`)
    if (report.plan?.failure !== undefined) out.push(`plan.failure=${JSON.stringify(report.plan.failure)}`)
    for (const task of report.tasks) {
      out.push(`task ${task.id} status=${task.status} attempts=${task.attempts?.length}`)
      for (const [i, attempt] of (task.attempts ?? []).entries()) {
        out.push(`  attempt ${i + 1}: route=${attempt.route} passed=${attempt.passed} resubmitted=${attempt.resubmitted} judgeRetried=${attempt.judgeRetried} failure=${attempt.failure?.class}/${attempt.failure?.category}`)
        if (attempt.failure?.reason !== undefined) out.push(`    reason: ${String(attempt.failure.reason).replace(/\s+/g, ' ').slice(0, 400)}`)
      }
    }
    out.push(`routes (${report.routes?.length ?? 0}):`)
    for (const entry of report.routes ?? []) out.push(`  ${JSON.stringify(entry)}`)
    out.push(`deadRoutes=${JSON.stringify(report.deadRoutes ?? null)}`)
    out.push(`errors=${JSON.stringify(report.errors ?? null)}`)
    out.push(`limits=${JSON.stringify(report.limits ?? null)}`)
    out.push(`routing=${JSON.stringify(report.routing ?? null)}`)
  } else {
    out.push('--- no canonical report object found in this result ---')
  }
  const text = out.join('\n')
  if (prefix === undefined) console.log(text)
  else {
    const file = `${prefix}-${index}.txt`
    writeFileSync(file, `${text}\n`)
    console.log(`wrote ${file} (${text.length} bytes)`)
  }
}
