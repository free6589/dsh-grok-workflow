// Pull the recorded workflow stream + the report text out of one session, verbatim.
// usage: node extract-stream.mjs <sessionDir> <outFile>
// Nothing is reworded: the payloads are printed as the session recorded them.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const [sessionDir, outFile] = process.argv.slice(2)
const raw = execFileSync('zstd', ['-dc', `${sessionDir}/session.v4.jsonl.zstd`], { maxBuffer: 256 * 1024 * 1024 }).toString('utf8')
const rows = []
for (const line of raw.split('\n')) {
  if (line.trim() === '') continue
  try { rows.push(JSON.parse(line)) } catch { /* a torn tail line is not a record */ }
}

const out = []
out.push(`# session: ${sessionDir}`)
out.push('')
out.push('## recorded workflow events (verbatim payloads)')
for (const row of rows) {
  const type = String(row.type ?? '')
  if (!type.startsWith('tool-workflow/') && !type.startsWith('plugin:grok-workflow/')) continue
  out.push(`${type} ${JSON.stringify(row.data ?? {}, 'utf8')}`)
}
out.push('')
out.push('## the run report, as the tool returned it')
for (const row of rows) {
  const message = (row.data ?? {}).message ?? {}
  if (message.role !== 'tool') continue
  for (const block of message.content ?? []) {
    if (block.type !== 'text') continue
    const text = String(block.text ?? '')
    if (!text.startsWith('Grok workflow:')) continue
    out.push(text)
    out.push('')
  }
}
out.push('')
out.push('## what the assistant said to the operator afterwards')
for (const row of rows) {
  const message = (row.data ?? {}).message ?? {}
  if (message.role !== 'assistant') continue
  for (const block of message.content ?? []) {
    if (block.type === 'text' && String(block.text ?? '').trim() !== '') out.push(String(block.text).trim())
  }
}
writeFileSync(outFile, out.join('\n'))
console.log(`wrote ${outFile}`)
