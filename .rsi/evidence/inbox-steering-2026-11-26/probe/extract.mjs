#!/usr/bin/env node
// Evidence extractor (not product code).
//
//   node extract.mjs <scratch-home> <probe-jsonl> [rootSessionId]
//
// Prints the two readings the probe had to produce, from the durable records
// themselves rather than from a screenshot:
//
//   1. every `agent/inbox/spliced` in the root conversation, with its target, and
//      every `tool/call` around it — so "the message went in while the call was in
//      flight" is visible as splice seq > tool/call seq with no tool/result between;
//   2. the `agent/inbox/inserted` stream the probe bundle recorded, filtered to the
//      root conversation.
//
// The probe bundle only observes; it changes nothing about how the Host behaves.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const [home, probeLog, rootArg] = process.argv.slice(2)
if (!home || !probeLog) {
  console.error('usage: node extract.mjs <scratch-home> <probe-jsonl> [rootSessionId]')
  process.exit(2)
}

/** Read one zstd session log as newline-delimited JSON. */
function events(file) {
  const text = execFileSync('zstd', ['-dc', file], { encoding: 'utf8', maxBuffer: 1 << 28 })
  const out = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try { out.push(JSON.parse(trimmed)) } catch { /* a torn tail line is not a reading */ }
  }
  return out
}

/** Every session log under the scratch home, newest last. */
function sessionLogs(dir) {
  const found = []
  for (const workspace of readdirSync(dir)) {
    const workspacePath = join(dir, workspace)
    if (!statSync(workspacePath).isDirectory()) continue
    for (const session of readdirSync(workspacePath)) {
      const file = join(workspacePath, session, 'session.v4.jsonl.zstd')
      try { found.push({ session, file, mtime: statSync(file).mtimeMs }) } catch { /* no log */ }
    }
  }
  return found.sort((a, b) => a.mtime - b.mtime)
}

const logs = sessionLogs(join(home, 'sessions'))
if (logs.length === 0) {
  console.error('no session logs under', join(home, 'sessions'))
  process.exit(1)
}

// The root conversation is the one that opened the run: it is the session whose log
// carries a `grok_workflow` tool call. `rootArg` overrides it by id prefix.
const root = rootArg === undefined
  ? logs.filter(({ file }) => events(file).some(event =>
      event.type === 'tool/call' && String(event.data?.name ?? '') === 'grok_workflow')).at(-1)
  : logs.find(({ session }) => session.startsWith(rootArg))
if (root === undefined) {
  console.error('no session log carries a grok_workflow call')
  process.exit(1)
}

console.log('== root conversation:', root.session)
for (const event of events(root.file)) {
  const data = event.data ?? {}
  if (event.type === 'agent/inbox/spliced') {
    const texts = (data.inserted ?? []).map(message =>
      (message.content ?? []).filter(part => part.type === 'text').map(part => part.text).join(' ').slice(0, 60))
    console.log(`seq ${event.seq}  spliced  target=${data.target}  removed=${data.removedCount ?? 0}  ${JSON.stringify(texts)}`)
  } else if (event.type === 'tool/call' || event.type === 'tool/result') {
    console.log(`seq ${event.seq}  ${event.type}  ${String(data.name ?? data.callId ?? '')}`)
  }
}

console.log('\n== inserted events recorded by the probe bundle (root conversation only)')
for (const line of readFileSync(probeLog, 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed === 'start') continue
  const record = JSON.parse(trimmed)
  if (record.sessionId !== root.session) continue
  if (record.kind !== 'inserted' && record.kind !== 'claimed') continue
  console.log(`${record.at}  ${record.kind}  sourceKind=${record.sourceKind}  ${String(record.text ?? '').slice(0, 60)}`)
}

console.log('\n== boundary children that pulled demands')
for (const { session, file } of logs) {
  if (session === root.session) continue
  for (const event of events(file)) {
    const name = String(event.data?.name ?? '')
    if (event.type !== 'tool/call' || name !== 'grok_replan_intents') continue
    console.log(`${session}  seq ${event.seq}  arguments=${String(event.data?.arguments ?? '')}`)
  }
}
