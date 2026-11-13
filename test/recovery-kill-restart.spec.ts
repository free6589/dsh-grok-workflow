/**
 * Kill/restart recovery proof: a real process is SIGKILLed mid-task, and a
 * second process restarts from the artifact the first one left on disk.
 *
 * What is real here:
 *
 * - two real OS processes (`node test/fixtures/recovery/worker.mjs`), killed with
 *   `SIGKILL` — not an in-process exception, not a simulated crash;
 * - real files: an append-only fsynced ledger, evidence files, and a sealed
 *   resume document committed with `fsync` + `rename`;
 * - the real recovery contract: the document is sealed by
 *   `buildResumeCheckpoint`/`canonicalJson` and read back through
 *   `validateResumeCheckpoint` → `planRestore` (via `evaluateResumeCheckpoint`),
 *   all from `src/resume/`.
 *
 * What is faked: the *work* itself (a task is "write this evidence file"). No
 * model is called, no network is used, no DSH engine is started. Every byte the
 * worker writes is a pure function of its environment, and the host drives the
 * worker through control files instead of sleeps, so the test is deterministic.
 *
 * The claim being proven is narrow and checkable:
 *
 * 1. work that was completed before the kill is **not** executed again after the
 *    restart (exactly one ledger `end` line per task, and no `start` line for the
 *    retained task in the second attempt);
 * 2. the evidence that completion is based on is **preserved** (same bytes, same
 *    inode mtime, and the restarted process re-verifies the recorded digest);
 * 3. the interrupted task is re-driven exactly once more, and only it;
 * 4. the resume document the dying process committed is still valid on disk.
 */
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, open, readFile, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildResumeCheckpoint,
  canonicalJson,
  evaluateResumeCheckpoint,
  validateResumeCheckpoint,
} from '../src/resume/index.js'
import type { ResumeTask } from '../src/resume/index.js'

/* ------------------------------------------------------------------ harness -- */

const WORKER = fileURLToPath(new URL('./fixtures/recovery/worker.mjs', import.meta.url))

/** Fixed identity and clock: the document bytes must not depend on wall time. */
const RUN_ID = 'run-recovery-kill'
const WORKFLOW_ID = 'grok-workflow'
const AT = '2026-11-12T03:00:00.000Z'
const TASKS = ['task-a', 'task-b', 'task-c']

const scratchDirs: string[] = []

afterEach(async () => {
  for (const dir of scratchDirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

/**
 * Publish the artifacts this proof produced into an evidence directory.
 *
 * Off by default so an ordinary suite run leaves nothing behind; set
 * `RECOVERY_EVIDENCE_DIR` to keep the ledger and the sealed documents a real
 * killed-then-restarted pair left on disk, exactly like the checkpoint wiring
 * spec's `GROK_WORKFLOW_CHECKPOINT_DIR` witness mode.
 */
async function publishWitness(paths: string[], label: string): Promise<void> {
  const target = process.env.RECOVERY_EVIDENCE_DIR
  if (target === undefined || target.trim() === '') return
  const out = join(target, label)
  await mkdir(out, { recursive: true })
  for (const path of paths) await copyFile(path, join(out, path.split('/').pop() ?? 'artifact'))
}

async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'recovery-kill-'))
  scratchDirs.push(dir)
  return dir
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** Durable commit, the same shape the plugin's writer uses: temp + fsync + rename. */
async function commit(path: string, text: string): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`
  const handle = await open(tmp, 'w')
  try {
    await handle.writeFile(text, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  await rename(tmp, path)
}

/** Poll for a control file; the worker's handshake is the only clock here. */
async function waitForFile(path: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (existsSync(path)) return readFile(path, 'utf8')
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`)
    await new Promise<void>(resolve => setTimeout(resolve, 2))
  }
}

interface LedgerRecord {
  event: string
  run?: string
  attempt?: string
  pid?: number
  task?: string
  seq?: number
  waitingFor?: string
  digest?: string
  evidence?: string
}

async function readLedger(path: string): Promise<LedgerRecord[]> {
  const text = await readFile(path, 'utf8')
  return text
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line) as LedgerRecord)
}

function evidencePathFor(dataDir: string, task: string): string {
  return join(dataDir, 'evidence', `${task}.txt`)
}

function evidenceContentFor(task: string): string {
  return `evidence:${RUN_ID}:${task}\n`
}

interface WorkerInput {
  ctl: string
  data: string
  tasks: string[]
  retain: Record<string, { evidence: string, sha256: string }>
  docPath: string
  attempt: string
}

interface WorkerHandle {
  child: ChildProcess
  done: Promise<{ code: number | null, signal: NodeJS.Signals | null, stderr: string }>
}

function spawnWorker(input: WorkerInput): WorkerHandle {
  const child = spawn(process.execPath, [WORKER], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      RECOVERY_CTL: input.ctl,
      RECOVERY_DATA: input.data,
      RECOVERY_RUN_ID: RUN_ID,
      RECOVERY_ATTEMPT: input.attempt,
      RECOVERY_TASKS: JSON.stringify(input.tasks),
      RECOVERY_RETAIN: JSON.stringify(input.retain),
      RECOVERY_DOC_PATH: input.docPath,
    },
  })
  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer | string) => { stderr += chunk.toString() })
  const done = new Promise<{ code: number | null, signal: NodeJS.Signals | null, stderr: string }>((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal, stderr }))
  })
  return { child, done }
}

/* ------------------------------------------------------- resume documents -- */

function completedRow(id: string, seq: number, file: string, digest: string): ResumeTask {
  return {
    id,
    seq,
    title: `Task ${id}`,
    status: 'completed',
    attempt: 1,
    updatedAt: AT,
    outputs: [`output:${id}`],
    files: [file],
    evidence: [{ kind: 'file', ref: file, note: `sha256=${digest}` }],
  }
}

function interruptedRow(id: string, seq: number, file: string): ResumeTask {
  return {
    id,
    seq,
    title: `Task ${id}`,
    status: 'interrupted',
    attempt: 1,
    updatedAt: AT,
    files: [file],
    evidence: [{ kind: 'file', ref: file, note: 'the task started; no completion was ever recorded' }],
  }
}

/** The exact file text the host hands to the worker; sealed by the real module. */
function documentText(tasks: ResumeTask[]): string {
  return `${canonicalJson(buildResumeCheckpoint({ runId: RUN_ID, workflowId: WORKFLOW_ID, updatedAt: AT, tasks }))}\n`
}

/* -------------------------------------------------------------------- tests -- */

describe('recovery: kill and restart', () => {
  it('SIGKILLs a run mid-task, then restarts from disk with exactly-once completion and preserved evidence', async () => {
    const root = await scratch()
    const data = join(root, 'data')
    const ctl1 = join(root, 'ctl-attempt-1')
    const ctl2 = join(root, 'ctl-attempt-2')
    const ledgerPath = join(data, 'ledger.ndjson')
    const docAfterA = join(root, 'resume-after-task-a.json')
    const docInterrupted = join(root, 'resume-interrupted.json')
    const docAfterRestart = join(root, 'resume-after-restart.json')
    await mkdir(data, { recursive: true })

    /* ---- attempt 1: settle task-a, then die inside task-b ---------------- */

    const first = spawnWorker({ ctl: ctl1, data, tasks: TASKS, retain: {}, docPath: docAfterA, attempt: '1' })
    await waitForFile(join(ctl1, 'boot'))

    await waitForFile(join(ctl1, 'started-task-a'))
    await commit(join(ctl1, 'finish-task-a'), 'allow')
    await waitForFile(join(ctl1, 'ended-task-a'))
    const digestA = sha256(await readFile(evidencePathFor(data, 'task-a'), 'utf8'))
    await commit(join(ctl1, 'commit-task-a'), documentText([completedRow('task-a', 1, evidencePathFor(data, 'task-a'), digestA)]))
    await waitForFile(join(ctl1, 'done-task-a'))

    // task-b has started and its evidence is on disk; it has not finished, and it
    // cannot finish until the host says so — which is where it gets killed.
    await waitForFile(join(ctl1, 'started-task-b'))
    const killedAt = await stat(evidencePathFor(data, 'task-a'))
    first.child.kill('SIGKILL')
    const killed = await first.done
    expect(killed.signal).toBe('SIGKILL')
    expect(killed.code).toBeNull()

    /* ---- what the dead process left behind ------------------------------- */

    const ledgerAfterKill = await readLedger(ledgerPath)
    expect(ledgerAfterKill.filter(record => record.event === 'start').map(record => record.task)).toEqual(['task-a', 'task-b'])
    expect(ledgerAfterKill.filter(record => record.event === 'end').map(record => record.task)).toEqual(['task-a'])
    // No task-b end line: the interruption is a fact in the journal, not a guess.

    const committedByDeadProcess = validateResumeCheckpoint(await readFile(docAfterA, 'utf8'), { runId: RUN_ID })
    expect(committedByDeadProcess.ok).toBe(true)
    if (!committedByDeadProcess.ok) throw new Error(committedByDeadProcess.detail)
    expect(committedByDeadProcess.checkpoint.tasks.map(task => [task.id, task.status])).toEqual([['task-a', 'completed']])

    /* ---- the recovering host records the interruption and plans ---------- */

    const interruptedText = documentText([
      completedRow('task-a', 1, evidencePathFor(data, 'task-a'), digestA),
      interruptedRow('task-b', 2, evidencePathFor(data, 'task-b')),
    ])
    await commit(docInterrupted, interruptedText)

    const decision = evaluateResumeCheckpoint(await readFile(docInterrupted, 'utf8'), { runId: RUN_ID })
    expect(decision.restorable).toBe(true)
    if (!decision.restorable) throw new Error(decision.detail)
    expect(decision.plan.counts).toEqual({ retain: 1, redrive: 1, reverify: 0, replan: 0 })
    expect(decision.plan.replanRequired).toBe(false)
    const retained = decision.plan.tasks.find(task => task.id === 'task-a')
    expect(retained?.action).toBe('retain')
    expect(retained?.preserve.files).toEqual([evidencePathFor(data, 'task-a')])
    expect(retained?.preserve.evidence).toEqual([
      { kind: 'file', ref: evidencePathFor(data, 'task-a'), note: `sha256=${digestA}` },
    ])
    expect(decision.plan.tasks.find(task => task.id === 'task-b')?.action).toBe('redrive')

    /* ---- attempt 2: restart from the document, not from memory ----------- */

    const second = spawnWorker({
      ctl: ctl2,
      data,
      tasks: TASKS,
      // Exactly the retained row the plan named, with the digest it recorded.
      retain: { 'task-a': { evidence: evidencePathFor(data, 'task-a'), sha256: digestA } },
      docPath: docAfterRestart,
      attempt: '2',
    })
    await waitForFile(join(ctl2, 'boot'))
    // The restarted process re-verified task-a's evidence instead of re-running it.
    await waitForFile(join(ctl2, 'retained-task-a'))

    await waitForFile(join(ctl2, 'started-task-b'))
    await commit(join(ctl2, 'finish-task-b'), 'allow')
    await waitForFile(join(ctl2, 'ended-task-b'))
    const digestB = sha256(await readFile(evidencePathFor(data, 'task-b'), 'utf8'))
    await commit(join(ctl2, 'commit-task-b'), documentText([
      completedRow('task-a', 1, evidencePathFor(data, 'task-a'), digestA),
      completedRow('task-b', 2, evidencePathFor(data, 'task-b'), digestB),
    ]))
    await waitForFile(join(ctl2, 'done-task-b'))

    await waitForFile(join(ctl2, 'started-task-c'))
    await commit(join(ctl2, 'finish-task-c'), 'allow')
    await waitForFile(join(ctl2, 'ended-task-c'))
    const digestC = sha256(await readFile(evidencePathFor(data, 'task-c'), 'utf8'))
    await commit(join(ctl2, 'commit-task-c'), documentText([
      completedRow('task-a', 1, evidencePathFor(data, 'task-a'), digestA),
      completedRow('task-b', 2, evidencePathFor(data, 'task-b'), digestB),
      completedRow('task-c', 3, evidencePathFor(data, 'task-c'), digestC),
    ]))
    await waitForFile(join(ctl2, 'done-task-c'))

    const restarted = await second.done
    expect(restarted.stderr).toBe('')
    expect(restarted.code).toBe(0)
    expect(restarted.signal).toBeNull()

    /* ---- the whole run, as the journal records it ------------------------ */

    const ledger = await readLedger(ledgerPath)
    const starts = ledger.filter(record => record.event === 'start')
    const ends = ledger.filter(record => record.event === 'end')

    // Every task completes exactly once across the two processes.
    expect(ends.map(record => record.task)).toEqual(['task-a', 'task-b', 'task-c'])
    for (const id of TASKS) expect(ends.filter(record => record.task === id)).toHaveLength(1)

    // No duplicate execution of the retained task: the second process never
    // started task-a, it only re-verified its evidence.
    expect(starts.filter(record => record.task === 'task-a' && record.attempt === '2')).toEqual([])
    expect(starts.filter(record => record.task === 'task-a')).toHaveLength(1)
    expect(ledger.filter(record => record.event === 'retained').map(record => record.task)).toEqual(['task-a'])

    // The interrupted task was re-driven exactly once more, and nothing else was.
    expect(starts.map(record => `${record.attempt}:${record.task}`)).toEqual([
      '1:task-a',
      '1:task-b',
      '2:task-b',
      '2:task-c',
    ])

    // Two distinct processes wrote the ledger.
    const attemptOnePids = new Set(starts.filter(record => record.attempt === '1').map(record => record.pid))
    const attemptTwoPids = new Set(starts.filter(record => record.attempt === '2').map(record => record.pid))
    expect(attemptOnePids.size).toBe(1)
    expect(attemptTwoPids.size).toBe(1)
    expect([...attemptOnePids][0]).not.toBe([...attemptTwoPids][0])

    /* ---- preserved evidence --------------------------------------------- */

    const afterRestart = await stat(evidencePathFor(data, 'task-a'))
    expect(sha256(await readFile(evidencePathFor(data, 'task-a'), 'utf8'))).toBe(digestA)
    expect(afterRestart.mtimeMs).toBe(killedAt.mtimeMs)
    expect(await readFile(evidencePathFor(data, 'task-a'), 'utf8')).toBe(evidenceContentFor('task-a'))
    expect(await readFile(evidencePathFor(data, 'task-b'), 'utf8')).toBe(evidenceContentFor('task-b'))
    expect(await readFile(evidencePathFor(data, 'task-c'), 'utf8')).toBe(evidenceContentFor('task-c'))

    /* ---- the document the restarted process committed ------------------- */

    const final = validateResumeCheckpoint(await readFile(docAfterRestart, 'utf8'), { runId: RUN_ID })
    expect(final.ok).toBe(true)
    if (!final.ok) throw new Error(final.detail)
    expect(final.checkpoint.tasks.map(task => [task.id, task.status])).toEqual([
      ['task-a', 'completed'],
      ['task-b', 'completed'],
      ['task-c', 'completed'],
    ])
    // Sealed, not merely written: the digest covers the whole document.
    expect(final.checkpoint.digest).toMatch(/^[0-9a-f]{64}$/)

    await publishWitness(
      [ledgerPath, docAfterA, docInterrupted, docAfterRestart],
      'kill-restart',
    )
  }, 60_000)

  it('refuses to restart, and executes nothing, when the evidence a checkpoint names no longer matches', async () => {
    const root = await scratch()
    const data = join(root, 'data')
    const ctl = join(root, 'ctl')
    const ledgerPath = join(data, 'ledger.ndjson')
    await mkdir(join(data, 'evidence'), { recursive: true })

    const evidence = evidencePathFor(data, 'task-a')
    await commit(evidence, evidenceContentFor('task-a'))

    // The document claims a digest that the file on disk no longer has: a
    // restarted run must not silently trust it, and must not re-run anything.
    const worker = spawnWorker({
      ctl,
      data,
      tasks: ['task-a'],
      retain: { 'task-a': { evidence, sha256: 'f'.repeat(64) } },
      docPath: join(root, 'resume.json'),
      attempt: '1',
    })
    const result = await worker.done

    expect(result.code).toBe(5)
    expect(result.signal).toBeNull()
    const ledger = await readLedger(ledgerPath)
    expect(ledger.map(record => record.event)).toEqual(['evidence-tampered'])
    expect(ledger[0]?.digest).toBe(sha256(evidenceContentFor('task-a')))
    // Fail closed: no task was executed at all.
    expect(ledger.some(record => record.event === 'start')).toBe(false)
  }, 30_000)

  it('refuses to start a restart from a torn checkpoint, so no work is executed', async () => {
    const root = await scratch()
    const doc = join(root, 'resume-torn.json')
    const sealed = documentText([completedRow('task-a', 1, join(root, 'a.txt'), 'a'.repeat(64))])
    // A crash in the middle of a write leaves a prefix of the document.
    await commit(doc, sealed.slice(0, Math.floor(sealed.length / 2)))

    const validated = validateResumeCheckpoint(await readFile(doc, 'utf8'))
    expect(validated.ok).toBe(false)
    if (validated.ok) throw new Error('a torn document must never validate')
    expect(validated.reason).toBe('corruption')

    const decision = evaluateResumeCheckpoint(await readFile(doc, 'utf8'))
    expect(decision.restorable).toBe(false)
    if (decision.restorable) throw new Error('a torn document must never produce a plan')
    expect(decision.reason).toBe('corruption')

    // Nothing was spawned and nothing was journalled: the refusal happens before
    // any work, which is what keeps a corrupt checkpoint from causing a re-run.
    expect(existsSync(join(root, 'data', 'ledger.ndjson'))).toBe(false)
  })
})
