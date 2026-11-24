#!/usr/bin/env bash
# Verification rig (not product code). Builds a scenario's session ledger from the
# session HEADER's `createdAt` (not file mtime — a background workflow keeps
# touching its file long after the scenario ends, which makes mtime windows lie).
#   ./session-report.sh <runDir> <sinceISO> <untilISO>
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
DIR=${1:?usage: session-report.sh <runDir> <sinceISO> <untilISO>}
SINCE=${2:?}
UNTIL=${3:?}
node --input-type=module -e "
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
const root = '$HERE/dsh-home/sessions'
const since = new Date('$SINCE').getTime()
const until = new Date('$UNTIL').getTime()
const rows = []
for (const ws of readdirSync(root)) {
  const wsDir = join(root, ws)
  for (const sid of readdirSync(wsDir)) {
    const f = join(wsDir, sid, 'session.v4.jsonl.zstd')
    let text = ''
    try { text = execFileSync('zstd', ['-dc', f], { maxBuffer: 1 << 28 }).toString() } catch { continue }
    const lines = text.split('\n').filter((l) => l.trim())
    if (!lines.length) continue
    let header
    try { header = JSON.parse(lines[0]) } catch { continue }
    const born = header.createdAt ?? 0
    if (!(born > since && born < until)) continue
    const types = {}
    let title = ''
    for (const l of lines) {
      let j
      try { j = JSON.parse(l) } catch { continue }
      types[j.type] = (types[j.type] ?? 0) + 1
      if (j.type === 'session/title') title = j.data?.title ?? ''
    }
    rows.push({
      sid,
      born: new Date(born).toISOString().replace('T', ' ').slice(0, 19),
      parent: header.parentSession ?? null,
      runs: types['tool-workflow/run-start'] ?? 0,
      agents: types['tool-workflow/agent-start'] ?? 0,
      toolCalls: types['tool/call'] ?? 0,
      mode: types['plugin:grok-workflow/mode'] ?? 0,
      title: title.slice(0, 40),
    })
  }
}
rows.sort((a, b) => a.born.localeCompare(b.born))
const ledger = rows.map((r) => \`\${r.sid} | born=\${r.born} run-start=\${r.runs} agent-start=\${r.agents} tool-calls=\${r.toolCalls} grok-mode=\${r.mode} | parent=\${r.parent ?? '-'} | \${r.title}\`).join('\n') + (rows.length ? '\n' : '')
writeFileSync(join('$DIR', 'sessions.txt'), ledger)
const wf = rows.filter((r) => r.runs > 0)
writeFileSync(join('$DIR', 'workflow-evidence.txt'), wf.length
  ? wf.map((r) => \`\${r.sid} run-start=\${r.runs} agent-start=\${r.agents} | \${r.title}\`).join('\n') + '\n'
  : 'no session in this window started a workflow run (tool-workflow/run-start = 0)\n')
process.stdout.write(ledger || '(no sessions in window)\n')
"
