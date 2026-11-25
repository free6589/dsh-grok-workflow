// Verification rig (not product code): read the soak's own record back.
//
//   node extract.mjs <sessionsDir> <rootSessionId> <checkpointFile> <outDir>
//
// Emits, from the scratch instance's session archive and checkpoint alone:
//   agent-legs.txt       every workflow child leg, in order, with its route
//   verifier-legs.txt    the judge legs only, plus the first one's verbatim death
//   routing-record.json  the plugin's routing ledger for that run
//   report.txt           the grok_workflow tool result text, verbatim
//   checkpoint-excerpt.txt
// Child sessions are zstd-compressed jsonl; the root session names each child by
// id, and each child's own first records name its provider and model, so the
// join here is the same one an operator would do by hand.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const [sessionsDir, rootId, checkpointFile, outDir] = process.argv.slice(2)
if (!sessionsDir || !rootId || !checkpointFile || !outDir) {
  console.error('usage: node extract.mjs <sessionsDir> <rootSessionId> <checkpointFile> <outDir>')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })

const readSession = (id) => {
  const file = join(sessionsDir, id, 'session.v4.jsonl.zstd')
  if (!existsSync(file)) return []
  const text = execFileSync('zstd', ['-dc', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return text.split('\n').filter(Boolean).map((line) => { try { return JSON.parse(line) } catch { return null } }).filter(Boolean)
}

const root = readSession(rootId)
const legs = []
const routing = []
let reportText = ''
let callArgs = ''
for (const ev of root) {
  const d = ev.data ?? {}
  if (ev.type === 'tool/call' && d.name === 'grok_workflow') callArgs = d.arguments ?? ''
  if (ev.type === 'tool/result') {
    const content = d.message?.content ?? []
    const text = content.map((c) => c?.text ?? '').join('\n')
    if (text.startsWith('Grok workflow:')) reportText = text
  }
  if (ev.type === 'tool-workflow/agent-start') legs.push({ seq: d.seq, kind: 'start', label: d.label, phase: d.phase, childId: d.childId })
  if (ev.type === 'tool-workflow/agent-end') {
    const leg = legs.find((l) => l.kind === 'start' && l.seq === d.seq)
    if (leg) leg.outcome = d.outcome
  }
  if (ev.type === 'plugin:grok-workflow/routing') routing.push(d)
}

// One line per leg, with the route the child itself recorded plus how it ended.
const lines = ['# every workflow child leg of this run, in order', '']
for (const leg of legs) {
  const child = leg.childId ? readSession(leg.childId) : []
  const descriptor = child.find((e) => e.type === 'subagent/descriptor')?.data ?? {}
  const death = child.find((e) => e.type === 'turn/end')?.data?.reason ?? {}
  const where = `${descriptor.agentProvider ?? '?'}/${descriptor.agentModel ?? '?'}`
  const end = death.kind === 'error' ? `error: ${death.error?.message ?? ''}` : String(death.kind ?? '?')
  lines.push(`seq ${String(leg.seq).padStart(2)} ${(leg.label ?? '').padEnd(14)} ${(leg.phase ?? '').padEnd(34)} ${leg.childId}  route ${where}  end ${end}`)
}
writeFileSync(join(outDir, 'agent-legs.txt'), `${lines.join('\n')}\n`)

// The judge legs, and the first one's refusal word for word.
const judge = legs.filter((l) => (l.label ?? '').startsWith('检查') || (l.label ?? '').startsWith('复核'))
const vlines = ['# the judging legs only (verifier 检查 / supervisor 复核)', '']
for (const leg of judge) {
  const child = leg.childId ? readSession(leg.childId) : []
  const descriptor = child.find((e) => e.type === 'subagent/descriptor')?.data ?? {}
  const end = child.find((e) => e.type === 'turn/end')?.data?.reason ?? {}
  vlines.push(`${(leg.label ?? '').padEnd(14)} ${(leg.phase ?? '').padEnd(34)} ${descriptor.agentProvider ?? '?'}  ${end.kind === 'error' ? 'ERROR' : 'completed'}`)
  if (end.kind === 'error') {
    vlines.push(`  refusal, verbatim: ${end.error?.message ?? ''}`)
    vlines.push(`  code: ${end.error?.code ?? ''}`)
  }
}
writeFileSync(join(outDir, 'verifier-legs.txt'), `${vlines.join('\n')}\n`)

writeFileSync(join(outDir, 'routing-record.json'), `${JSON.stringify(routing[0] ?? null, null, 2)}\n`)
writeFileSync(join(outDir, 'report.txt'), reportText === '' ? '(no report found)\n' : `${reportText}\n`)
writeFileSync(join(outDir, 'tool-call-args.txt'), `${callArgs}\n`)

const cp = JSON.parse(readFileSync(checkpointFile, 'utf8'))
const cplines = [
  `# ${checkpointFile}`,
  '',
  `/run/status = ${JSON.stringify(cp.run?.status ?? null)}`,
  `/time/durationMs = ${JSON.stringify(cp.time?.durationMs ?? null)}`,
  `/plan/source = ${JSON.stringify(cp.plan?.source ?? null)}`,
  `/plan/taskCount = ${JSON.stringify(cp.plan?.taskCount ?? null)}`,
  `/plan/tasks = ${JSON.stringify((cp.plan?.tasks ?? []).map((t) => ({ id: t.id, title: t.title })))}`,
  `/stages = ${JSON.stringify((cp.stages ?? []).map((s) => s?.status ?? null))}`,
  `/tasks = ${JSON.stringify((cp.tasks ?? []).map((t) => ({ id: t.id, status: t.status, attempts: t.attempts })))}`,
  `# the checkpoint carries no per-attempt judgeRetried flag (see README §4)`,
]
writeFileSync(join(outDir, 'checkpoint-excerpt.txt'), `${cplines.join('\n')}\n`)
console.log(`legs ${legs.length}, judge legs ${judge.length}, routing records ${routing.length}, report ${reportText.length} chars`)
