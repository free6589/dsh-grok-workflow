/**
 * Reproduction: `/compact` fails on a session this plugin wrote a receipt into.
 *
 * The chain, measured end to end with the installed DSH (no model, no network):
 *
 * 1. `src/records.ts` writes an `assistant/message` while no `step/start` is open
 *    (the gate's instant receipt runs in `agent/pre-step`, i.e. before the step
 *    begins). `src/gate.ts`'s cancelled terminal and the unload notice do the same.
 * 2. `@deepseek-ai/dsh-token-meter` replays the journal with one hard pairing rule:
 *    an `assistant/message` is legal only between a `step/start` and its `step/end`
 *    for the same `(turn, step)` (`advanceMeasurement`, 0.2.1-rc.2). The first
 *    replay throws `token meter: assistant/message at seq N has no matching
 *    step/start event`; the fold cursor never advances, so every later replay
 *    throws at the same seq.
 * 3. `BasicCompactionEngine.compactNow()` measures before it selects a range, and
 *    its catch wraps *any* failure as `ManualCompactionError('busy', …)`, so
 *    `/compact` answers with the "not idle / active compaction" error instead of
 *    compacting. Automatic compaction fails the same way and is only warned about
 *    (`step compaction failed: …; continuing the turn`).
 *
 * This script drives the real `/compact` command, so the printed text is the text
 * a user sees. It is read-only: the session it builds lives in memory and is never
 * attached to a store.
 *
 * Usage:
 *   node scripts/repro-compact.mjs [--keep-orphan]
 *
 * `--keep-orphan` appends the receipt directly (bypassing the plugin's own writer)
 * to show what the pre-fix build did; the default path uses the shipped writer, so
 * the script is the before/after harness for the fix.
 *
 * Requires a local DSH install: `DSH_INSTALL_DIR` (set by the DSH shell) or
 * `npm root -g`-style discovery below.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/* --------------------------------------------------------------- DSH install -- */

function installDir() {
  const candidates = [
    process.env.DSH_INSTALL_DIR,
    path.join(path.dirname(execFileSync('which', ['dsh']).toString().trim()), '..'),
  ].filter(Boolean)
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate)
    if (existsSync(path.join(resolved, 'node_modules', '@deepseek-ai', 'dsh-token-meter', 'lib', 'index.js'))) {
      return resolved
    }
  }
  throw new Error('local DSH install not found: set DSH_INSTALL_DIR to the @deepseek-ai/dsh package directory')
}

const DSH = installDir()
const core = (pkg, sub = 'lib/index.js') => pathToFileURL(path.join(DSH, 'node_modules', '@deepseek-ai', pkg, sub)).href

const { default: TokenMeter } = await import(core('dsh-token-meter'))
const { ManualCompactionError } = await import(core('dsh-compaction'))
const { default: BasicCompactionEngine } = await import(core('dsh-compaction-basic'))
const compactCommand = await import(core('dsh-command-compact'))

/* ------------------------------------------------------------- repo under test -- */

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const { Session } = await import(pathToFileURL(path.join(repo, 'node_modules/@deepseek-ai/dsh-session/lib/index.js')).href)
const { createUserMessage } = await import(pathToFileURL(path.join(repo, 'node_modules/@deepseek-ai/dsh-llm/lib/index.js')).href)
const records = await import(pathToFileURL(path.join(repo, 'lib/records.js')).href)
const { FIXED_INSTANT_RECEIPT } = await import(pathToFileURL(path.join(repo, 'lib/config.js')).href)

const keepOrphan = process.argv.includes('--keep-orphan')
const logger = { warn: () => {}, info: () => {} }

/** A session shaped like the gate sees it: a turn opened, the user's words in, no step yet. */
function sessionAtPreStep() {
  const session = Session.create('repro-compact')
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'run the workflow' }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  return session
}

function meter() {
  const instance = Object.create(TokenMeter.prototype)
  instance.states = new WeakMap()
  instance.ctx = { get: () => undefined }
  return instance
}

function compaction(session) {
  const engine = Object.create(BasicCompactionEngine.prototype)
  engine.config = {}
  engine.ctx = { tokenMeter: meter(), get: () => undefined }
  engine.warnedPressureConfigTargets = new Set()
  engine.overflowRetries = new WeakMap()
  engine.overflowAgents = new WeakMap()
  const agent = {
    session,
    runMaintenance: async (operation) => operation(new AbortController().signal),
  }
  return { engine, agent }
}

/** Register the real `/compact` command against a fake registry, then invoke it. */
async function compactText(session) {
  let definition
  const ctx = {
    commands: { register: (def) => { definition = def; return () => {} } },
    effect: (generator) => {
      const iterator = generator()
      for (let step = iterator.next(); step.done !== true; step = iterator.next());
    },
    compaction: {
      compactNow: (agent, signal, commandId) => compaction(session).engine.compactNow(agent, signal, commandId),
    },
  }
  compactCommand.apply(ctx)
  const { agent } = compaction(session)
  return definition.handler({
    agent,
    rawInput: '',
    signal: new AbortController().signal,
    commandId: undefined,
  })
}

/* ------------------------------------------------------------------- the probe -- */

const session = sessionAtPreStep()
let wrote
if (keepOrphan) {
  // What the pre-fix writer did: `lastTurnOf()` reports (turn 1, step 0) and the
  // row is appended with no step/start behind it.
  const { createAssistantMessage } = await import(pathToFileURL(path.join(repo, 'node_modules/@deepseek-ai/dsh-llm/lib/index.js')).href)
  session.append('assistant/message', {
    turn: 1,
    step: 0,
    message: createAssistantMessage({
      content: [{ type: 'text', text: '档位：团队档' }],
      source: { provider: 'grok-workflow', model: 'workflow-receipt' },
    }),
    stream: [],
  }, { surfaceOp: 'append' })
  wrote = 'forced (--keep-orphan)'
} else {
  wrote = records.appendInstantReceipt(session, '档位：团队档', logger) ? 'appended' : 'refused'
}

const rows = session.ownEvents().map(event => ({
  seq: event.seq,
  type: event.type,
  turn: event.data?.turn,
  step: event.data?.step,
  source: event.data?.message?.source,
}))

let measureError = null
let measurement = null
try {
  measurement = meter().measure(session)
} catch (error) {
  measureError = error.message
}

let compactNowError = null
try {
  const { engine, agent } = compaction(session)
  await engine.compactNow(agent, new AbortController().signal)
} catch (error) {
  compactNowError = error instanceof ManualCompactionError ? `${error.code}: ${error.message}` : `raw: ${error.message}`
}

let answer
let commandError = null
try {
  answer = await compactText(session)
} catch (error) {
  commandError = error.message
  answer = { kind: 'threw', text: error.message }
}

console.log(JSON.stringify({
  receiptEnabled: FIXED_INSTANT_RECEIPT,
  writer: wrote,
  events: rows,
  measure: measureError === null
    ? { ok: true, totalTokens: measurement.totalTokens, nodes: measurement.nodes.length }
    : { ok: false, error: measureError },
  compactNow: compactNowError === null ? { ok: true } : { ok: false, error: compactNowError },
  slashCompact: { kind: answer.kind, text: answer.text, ...commandError === null ? {} : { rejected: true } },
}, null, 2))

// Non-zero when the failure mode is present: this script doubles as the check.
process.exitCode = answer.kind === 'success' ? 0 : 1
