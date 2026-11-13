#!/usr/bin/env node
/**
 * Recovery fixture worker: one stand-in "workflow run" that can be killed.
 *
 * This file is a **test fixture**, not plugin code. It exists so the kill/restart
 * proof in `test/recovery-kill-restart.spec.ts` can SIGKILL a real OS process
 * mid-task instead of pretending to crash inside the test process.
 *
 * Boundary of the fake: the worker is the *work* side of a run (it executes
 * tasks and writes evidence), the parent test is the *host* side (it journals
 * task states and seals the resume document with the real `src/resume/`
 * modules). That split mirrors the plugin: `src/checkpoint/wiring.ts` is the
 * host recorder, the workflow script is the work. Nothing here reimplements the
 * checkpoint schema — the document bytes are always produced by the real
 * `sealResumeCheckpoint` / `canonicalJson` in `src/resume/validator.ts`, handed
 * to this process over a control file, and committed here only so that the
 * process that dies is the one that performed the durable write.
 *
 * Determinism: every byte this process writes is a pure function of its
 * environment (run id, task ids, attempt number, evidence content). No clock
 * value, no randomness, no network. Progress is gated by control files written
 * by the host, so the host — not a sleep — decides when a task starts, finishes
 * and when the process dies.
 *
 * Ledger protocol (append-only NDJSON, one fsync per line, at
 * `$RECOVERY_DATA/ledger.ndjson`):
 *
 *   { event: 'start',    task, seq, run, attempt, pid }  work began
 *   { event: 'end',      task, seq, run, attempt, pid }  work finished
 *   { event: 'retained', task, seq, run, attempt, pid }  skipped: already done
 *                                                        before the restart, and
 *                                                        its evidence re-verified
 *   { event: 'evidence-missing' | 'evidence-tampered' }  restart refused
 *   { event: 'timeout',  waitingFor }                    host handshake lost
 *   { event: 'worker-exit' }                             clean end of the loop
 *
 * Control-file handshake per executed task (`$RECOVERY_CTL`):
 *
 *   boot                <- worker: process is alive
 *   started-<task>      <- worker: start line + evidence file are on disk
 *   finish-<task>       -> worker: host allows the task to complete
 *   ended-<task>        <- worker: the 'end' line is on disk
 *   commit-<task>       -> worker: text of the sealed resume document to commit
 *   committed-<task>    <- worker: document committed durably
 *   done-<task>         <- worker: task fully settled
 *   retained-<task>     <- worker: a retained task's evidence was re-verified
 *
 * Exit codes: 0 clean, 4 evidence missing, 5 evidence digest mismatch,
 * 64 bad environment, 70 host handshake timeout.
 */

import { createHash } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from 'node:fs'
import { join } from 'node:path'

/* ------------------------------------------------------------------ setup -- */

function required(name) {
  const value = process.env[name]
  if (typeof value !== 'string' || value === '') {
    console.error(`recovery worker: ${name} is required`)
    process.exit(64)
  }
  return value
}

const ctlDir = required('RECOVERY_CTL')
const dataDir = required('RECOVERY_DATA')
const runId = required('RECOVERY_RUN_ID')
const attempt = required('RECOVERY_ATTEMPT')
const tasks = JSON.parse(required('RECOVERY_TASKS'))
const docPath = required('RECOVERY_DOC_PATH')
const retain = JSON.parse(process.env.RECOVERY_RETAIN ?? '{}')

const ledgerPath = join(dataDir, 'ledger.ndjson')
const evidenceDir = join(dataDir, 'evidence')

mkdirSync(ctlDir, { recursive: true })
mkdirSync(evidenceDir, { recursive: true })

/* ----------------------------------------------------------------- helpers -- */

/** Blocking sleep; the worker is deliberately synchronous and single-threaded. */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** Durable commit: sibling temp file, fsync, rename. Never leaves a torn file. */
function commitFile(path, text) {
  const tmp = `${path}.${process.pid}.tmp`
  const fd = openSync(tmp, 'w')
  try {
    writeSync(fd, text)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, path)
}

/** Append one ledger line and fsync it, so a SIGKILL cannot lose it. */
function appendLedger(record) {
  const line = `${JSON.stringify(record)}\n`
  const fd = openSync(ledgerPath, 'a')
  try {
    writeSync(fd, line)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

function signal(name, text = '') {
  commitFile(join(ctlDir, name), text)
}

function waitFor(name, timeoutMs = 30_000) {
  const path = join(ctlDir, name)
  const deadline = Date.now() + timeoutMs
  while (!existsSync(path)) {
    if (Date.now() > deadline) {
      appendLedger({ event: 'timeout', run: runId, attempt, pid: process.pid, waitingFor: name })
      process.exit(70)
    }
    sleepSync(5)
  }
  return readFileSync(path, 'utf8')
}

/** The one evidence file a task owns; content is a pure function of run + task. */
function evidencePath(task) {
  return join(evidenceDir, `${task}.txt`)
}

function evidenceContent(task) {
  return `evidence:${runId}:${task}\n`
}

function baseRecord(event, task, seq) {
  return { event, run: runId, attempt, pid: process.pid, task, seq }
}

/* -------------------------------------------------------------------- run -- */

signal('boot', String(process.pid))

for (const [index, task] of tasks.entries()) {
  const seq = index + 1

  // A retained task was completed by the attempt that died. It is not
  // re-executed: its evidence must still be on disk and unchanged.
  if (Object.prototype.hasOwnProperty.call(retain, task)) {
    const expected = retain[task]
    const file = expected.evidence
    if (!existsSync(file)) {
      appendLedger({ ...baseRecord('evidence-missing', task, seq), evidence: file })
      process.exit(4)
    }
    const digest = sha256(readFileSync(file, 'utf8'))
    if (digest !== expected.sha256) {
      appendLedger({ ...baseRecord('evidence-tampered', task, seq), evidence: file, digest })
      process.exit(5)
    }
    appendLedger(baseRecord('retained', task, seq))
    signal(`retained-${task}`)
    continue
  }

  appendLedger(baseRecord('start', task, seq))
  commitFile(evidencePath(task), evidenceContent(task))
  signal(`started-${task}`, String(seq))

  // The host decides when the work settles; a kill between the two waits is a
  // genuine interruption: the start line and the evidence stay on disk, the end
  // line never appears.
  waitFor(`finish-${task}`)
  appendLedger(baseRecord('end', task, seq))
  signal(`ended-${task}`)

  // The host seals the resume document for this boundary and hands over its
  // bytes; committing it here is what makes the artifact outlive this process.
  const document = waitFor(`commit-${task}`)
  commitFile(docPath, document)
  signal(`committed-${task}`)
  signal(`done-${task}`)
}

appendLedger({ event: 'worker-exit', run: runId, attempt, pid: process.pid })
process.exit(0)
