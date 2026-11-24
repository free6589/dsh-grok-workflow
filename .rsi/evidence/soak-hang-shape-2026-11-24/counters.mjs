// Summarises the soak gateway log into per-route (port, model) counters.
//
//   node counters.mjs gateway.log
//
// "requests" counts every /chat/completions the endpoint received — the number the
// scenarios are argued from. /models listings are counted separately because they
// are route resolution, not calls.
import { readFileSync } from 'node:fs'

const text = readFileSync(process.argv[2], 'utf8')
const rows = new Map()
const bump = (key, field, by = 1) => {
  const row = rows.get(key) ?? { requests: 0, modes: {}, statuses: {}, hangOpened: 0, hangClosed: 0, models: 0 }
  row[field] = (row[field] ?? 0) + by
  rows.set(key, row)
}
for (const line of text.split('\n')) {
  if (line.trim() === '') continue
  const get = name => line.match(new RegExp(`\\b${name}=(\\S+)`))?.[1]
  const port = get('port')
  if (port === undefined) continue
  if (line.includes('mode=models')) {
    bump(`${port}|--models--`, 'models')
    continue
  }
  const model = get('model')
  if (model === undefined) continue
  const key = `${port}|${model}`
  const mode = get('mode') ?? '?'
  bump(key, 'requests')
  const row = rows.get(key)
  row.modes[mode] = (row.modes[mode] ?? 0) + 1
  if (mode === 'hang') {
    if (line.includes('opened')) row.hangOpened += 1
    if (line.includes('closed by client')) row.hangClosed += 1
    continue
  }
  const status = get('status') ?? '?'
  row.statuses[status] = (row.statuses[status] ?? 0) + 1
}

const indent = obj => Object.entries(obj).sort().map(([k, v]) => `${k}=${v}`).join(' ')
console.log('port|model                                  requests  detail')
for (const key of [...rows.keys()].sort()) {
  const row = rows.get(key)
  if (row.models > 0 && row.requests === 0) {
    console.log(`${key.padEnd(42)} /models*${row.models}`)
    continue
  }
  const detail = [indent(row.modes), row.hangOpened > 0 ? `hang-opened=${row.hangOpened} hang-closed=${row.hangClosed}` : '', indent(row.statuses)]
    .filter(Boolean)
    .join(' ')
  console.log(`${key.padEnd(42)} ${String(row.requests).padStart(8)}  ${detail}`)
}
