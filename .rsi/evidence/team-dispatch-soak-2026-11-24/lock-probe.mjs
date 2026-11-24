// Verification rig (not product code). Differential probe for the taskboard's
// cross-process claim behaviour.
//
// Question it answers: when N independent processes claim N *different* pending
// rows at the same instant against the same board directory, do all N claims
// survive? A board that serializes a whole-file rewrite from an in-memory
// snapshot (no cross-process lock) loses rows; a board that takes an exclusive
// claim lock re-reads on disk and keeps every row.
//
//   node lock-probe.mjs --lib <abs path to lib/taskboard/index.js> --board <dir> --n 12
//
// Prints one JSON object: {lib, board, rows, inProgress, lost, results}.

import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}

const libPath = arg('lib')
const board = arg('board')
const n = Number(arg('n', '12'))
const childId = arg('child')
const childOwner = arg('owner')
const startAt = Number(arg('start', '0'))

if (!libPath || !board) {
  console.error('usage: node lock-probe.mjs --lib <lib/taskboard/index.js> --board <dir> [--n 12]')
  process.exit(2)
}

const lib = await import(libPath)
const openTaskboard = lib.openTaskboard ?? lib.openBoard
if (typeof openTaskboard !== 'function') {
  console.error(`no openTaskboard export on ${libPath}: ${Object.keys(lib).join(',')}`)
  process.exit(2)
}

const pad = (i) => `t${String(i).padStart(2, '0')}`

if (childId) {
  // Child: open its own handle, wait for the shared start instant, then claim.
  const tb = await openTaskboard(board)
  const wait = startAt - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  try {
    const row = await tb.claim(childId, childOwner, 1)
    console.log(JSON.stringify({ child: childId, ok: true, status: row.status, version: row.version }))
  } catch (error) {
    console.log(JSON.stringify({ child: childId, ok: false, code: error?.code, message: String(error?.message ?? error) }))
  }
  process.exit(0)
}

// Parent: build the board, fan the claims out, then read the board back.
rmSync(board, { recursive: true, force: true })
mkdirSync(board, { recursive: true })
{
  const tb = await openTaskboard(board)
  for (let i = 1; i <= n; i++) await tb.create({ id: pad(i), title: `probe ${i}` })
}

const fireAt = Date.now() + 1200
const children = []
for (let i = 1; i <= n; i++) {
  const child = spawn(process.execPath, [
    new URL(import.meta.url).pathname,
    '--lib', libPath,
    '--board', board,
    '--child', pad(i),
    '--owner', `w${i}`,
    '--start', String(fireAt),
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  let err = ''
  child.stdout.on('data', (d) => { out += d })
  child.stderr.on('data', (d) => { err += d })
  children.push(new Promise((resolve) => child.on('close', (code) => resolve({ code, out: out.trim(), err: err.trim() }))))
}
const results = await Promise.all(children)

// Fresh handle: what actually landed on disk.
const after = await openTaskboard(board)
const rows = await after.list()
const inProgress = rows.filter((r) => r.status === 'in_progress')
const claimed = new Set(inProgress.map((r) => r.id))
const lost = []
for (let i = 1; i <= n; i++) if (!claimed.has(pad(i))) lost.push(pad(i))

console.log(JSON.stringify({
  lib: libPath,
  board,
  rows: rows.length,
  inProgress: inProgress.length,
  lost,
  childFailures: results.filter((r) => r.code !== 0).map((r) => r.err.slice(0, 200)),
  childAnswers: results.map((r) => r.out).filter(Boolean),
}, null, 2))
