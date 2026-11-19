/**
 * What the user would now see for the exact argument the stall carried.
 *
 * Reads the operator's own session file, takes the `/grok` argument that was
 * discarded, and prints the refusal the fixed handler produces for it. The
 * prompt itself is never printed: only its measured length appears, because that
 * is what the refusal says.
 *
 * Usage: node docs/knowledge/evidence/prompt-intake-2026-11-19/fixed-message-demo.mjs
 */
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { refuseDiscardedCommandPrompt } from '../../../../lib/intake.js'

const SESSION = 'session-042dfe19-f236-4cbf-8a96-d357455238da'
const path = join(
  homedir(), '.dsh', 'sessions', '--home-fish-projects_mine-dsh-grok-workflow--', SESSION, 'session.v4.jsonl.zstd',
)

const raw = execFileSync('zstd', ['-dc', path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
const events = raw.split('\n').filter(Boolean).map(line => JSON.parse(line))
const run = events.find(event => event.type === 'command/run' && event.data?.name === 'grok')
const settle = events.find(event => event.type === 'command/done' && event.data?.kind === 'error')
if (run === undefined) throw new Error(`no /grok command in ${SESSION}`)

const args = String(run.data.args ?? '')
console.log(`session ${SESSION}: /grok argument ${args.length} characters / ${Buffer.byteLength(args)} bytes`)
console.log(`before the fix it settled: ${settle?.data?.text ?? '(none)'}`)
console.log('after the fix it settles:')
console.log(refuseDiscardedCommandPrompt(args).text)
