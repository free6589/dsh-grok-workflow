/**
 * Engine wiring for checkpointing: periodic writes, terminal writes, the unload
 * write, the host-side watchdog, and the four-role boundary.
 *
 * Everything here is deterministic and offline: no model is called, no session is
 * created, and the only real resources are a scratch directory and real files
 * written by the real writer. The event source is a fake bus whose payloads match
 * `@deepseek-ai/dsh-workflow` exactly (`workflow/phase` carries `info` + a title,
 * `workflow/end` carries `info` + `{ stopReason, error? }`).
 *
 * One test drives the real `runWorkflow`/`disposeActiveState` pair against a
 * fake hanging engine, because the unload path is the one wiring point that lives
 * in `src/run.ts` rather than in the recorder.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  CHECKPOINT_WIRING_LIMITS,
  HOST_ROLES,
  checkpointDir,
  checkpointFile,
  createCheckpointRecorder,
  findResumableCheckpoint,
  isHostRole,
  phaseFromTitle,
  RESUME_DECISION_WIRING,
  registeredCheckpointRecorders,
  resumeCarryover,
  resumeDecision,
} from '../src/checkpoint/wiring.js'
import type { CheckpointEventSource, RunCheckpointRecorder } from '../src/checkpoint/wiring.js'
import { buildCheckpoint, sealCheckpoint } from '../src/checkpoint/schema.js'
import type { WorkflowCheckpoint } from '../src/checkpoint/schema.js'
import { checkpointFileName, readCheckpoint, writeCheckpoint } from '../src/checkpoint/writer.js'
import { createActiveState, disposeActiveState, runWorkflow } from '../src/run.js'
import type { ActiveState, WorkflowLogger } from '../src/run.js'
import { resolveConfig } from '../src/config.js'
import type { RoleName, TaskReport, WorkflowReport } from '../src/types.js'

/* ------------------------------------------------------------------ harness -- */

/** A cordis-shaped event bus: `on(name, listener)` returns a disposer. */
class FakeEvents implements CheckpointEventSource {
  readonly on = (name: string, listener: (...args: unknown[]) => void): (() => void) => {
    const set = this.handlers.get(name) ?? new Set()
    set.add(listener)
    this.handlers.set(name, set)
    return () => { set.delete(listener) }
  }

  readonly handlers = new Map<string, Set<(...args: unknown[]) => void>>()

  emit(name: string, ...args: unknown[]): void {
    // Snapshot first: a listener may unsubscribe while it runs, exactly like a real
    // event bus, and mutating the set mid-iteration would skip listeners.
    const listeners = Array.from(this.handlers.get(name) ?? [])
    for (const listener of listeners) listener(...args)
  }

  get listeners(): number {
    let total = 0
    for (const set of this.handlers.values()) total += set.size
    return total
  }
}

class Recorder {
  readonly warnings: string[] = []
  readonly infos: string[] = []
  readonly logger: WorkflowLogger = {
    warn: (message: string) => { this.warnings.push(message) },
    info: (message: string) => { this.infos.push(message) },
  }
}

function taskReport(id: string, status: 'verified' | 'failed', error?: string): TaskReport {
  return {
    id,
    title: `Task ${id}`,
    objective: `Do ${id}`,
    expectedOutput: `Output ${id}`,
    acceptanceCriteria: [`${id} works`],
    context: '',
    constraints: [],
    writesPaths: null,
    status,
    attempts: [{
      attempt: 1,
      execution: null,
      verification: null,
      passed: status === 'verified',
      ...error === undefined ? {} : { error },
    }],
    ...error === undefined ? {} : { error },
  }
}

function reportOf(status: WorkflowReport['status'], tasks: TaskReport[]): WorkflowReport {
  return {
    schemaVersion: 'grok-workflow/v1',
    status,
    objective: 'ship the thing',
    plan: { source: 'planner', tasks: [] },
    tasks,
    confirmed: [{ taskId: tasks[0]?.id ?? 'task-1', criterion: 't1 works', evidence: 'observed' }],
    incomplete: [],
    errors: [],
    uncertainties: [],
    routes: [
      { role: 'planner', chainIndex: 0, route: 'p/m', attempt: 0, outcome: 'ok' },
      { role: 'worker', chainIndex: 0, route: 'p/m', attempt: 1, outcome: 'ok' },
      { role: 'verifier', chainIndex: 0, route: 'p/m', attempt: 1, outcome: 'failed', failureClass: 'format-error', reason: 'bad json' },
      // A report is untrusted input: a role the plugin does not run must be dropped.
      { role: 'auditor' as unknown as RoleName, chainIndex: 0, route: 'p/m', attempt: 1, outcome: 'ok' },
      { role: 'synthesizer', chainIndex: 0, route: 'p/m', attempt: 0, outcome: 'ok' },
    ],
    routing: { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] },
    synthesis: { mode: 'deterministic' },
    limits: { maxConcurrency: 3, maxRetries: 1, maxTasks: 12, maxTotalAgents: 48 },
  }
}

function options(overrides: { directory: string, events?: FakeEvents, recorder?: Recorder, now?: () => number }) {
  const recorder = overrides.recorder ?? new Recorder()
  return {
    ...overrides.events === undefined ? {} : { eventSource: overrides.events },
    logger: recorder.logger,
    directory: overrides.directory,
    objective: 'ship the thing',
    sessionId: 'sess-wire',
    limits: { maxConcurrency: 10, maxRetries: 1, maxTasks: 12 },
    ...overrides.now === undefined ? {} : { now: overrides.now },
  }
}

let scratch: string

/**
 * A directory whose files are meant to outlive the test.
 *
 * With `GROK_WORKFLOW_CHECKPOINT_DIR` pinned (the smoke lane in
 * `docs/knowledge/evidence/checkpoint-engine-wire-2026-11-12/SMOKE.md`) these
 * become the witness files the note quotes; in an ordinary suite run the same
 * paths land in the per-file scratch directory and are removed with it.
 */
function witnessDir(name: string): string {
  const pinned = process.env.GROK_WORKFLOW_CHECKPOINT_DIR
  if (pinned !== undefined && pinned.trim() !== '') return join(pinned, name)
  return join(scratch, name)
}

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'checkpoint-wiring-'))
})

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true })
})

/* ------------------------------------------------------- 1. periodic writes -- */

describe('periodic checkpoints', () => {
  it('writes a running checkpoint with the phases the script actually emitted', async () => {
    const events = new FakeEvents()
    const dir = witnessDir('witness-periodic')
    // Test-only deadline: 60 s only keeps the clock arithmetic below small. The
    // an explicit deadline *is* representable — `limits.timeoutMs` and
    // `watchdog.deadlineMs` are bounded by `msCeiling`, not by the count ceiling —
    // so nothing would be dropped there; the semantics (passed deadline -> host
    // fact) are identical either way.
    const recorder = createCheckpointRecorder({
      ...options({ directory: dir, events }),
      limits: { maxConcurrency: 10, maxRetries: 1, maxTasks: 12, timeoutMs: 60_000 },
    })
    recorder.adopt({ id: 'run-7' })

    // The engine's own payload shape: (info, title).
    events.emit('workflow/phase', { id: 'run-7' }, '规划')
    events.emit('workflow/phase', { id: 'run-7' }, '执行')
    // A phase title this plugin never emits must not become a stage row.
    events.emit('workflow/phase', { id: 'run-7' }, 'Somebody else’s phase')
    // A different run's events must not be filed under ours.
    events.emit('workflow/phase', { id: 'run-other' }, '规划')

    const written = await recorder.tick()
    expect(written?.ok).toBe(true)
    expect(recorder.stats.timerArmed).toBe(true)

    const checkpoint = await readCheckpoint(checkpointFile('run-7', { dir }))
    expect(checkpoint.run.runId).toBe('run-7')
    expect(checkpoint.run.status).toBe('running')
    expect(checkpoint.stages.map(stage => stage.phase)).toEqual(['plan', 'execute'])
    // The first phase is closed by the second starting, which is the only host-side
    // evidence that it ended.
    expect(checkpoint.stages[0]?.endedAtMs).toBeDefined()
    expect(checkpoint.stages[1]?.endedAtMs).toBeUndefined()
    expect(checkpoint.limits).toEqual({ maxConcurrency: 10, maxRetries: 1, maxTasks: 12, timeoutMs: 60_000 })
    expect(checkpoint.watchdog).toEqual({ deadlineHit: false, cancelled: false, deadlineMs: 60_000 })
    // Before a report exists the plan is unknown, not echoed back as if it were one.
    expect(checkpoint.plan).toEqual({ source: 'unavailable', taskCount: 0, tasks: [] })
    expect(checkpoint.tasks).toEqual([])
    expect(checkpoint.agents).toEqual([])
    recorder.dispose()
  })

  it('records child counts host-side without inventing roles', () => {
    const events = new FakeEvents()
    const dir = join(scratch, 'counts')
    const recorder = createCheckpointRecorder(options({ directory: dir, events }))
    recorder.adopt({ id: 'run-8' })
    events.emit('workflow/agent-start', { id: 'run-8' }, { seq: 1 })
    events.emit('workflow/agent-start', { id: 'run-8' }, { seq: 2 })
    events.emit('workflow/agent-end', { id: 'run-8' }, { seq: 1, outcome: 'completed' })
    events.emit('workflow/agent-end', { id: 'run-8' }, { seq: 2, outcome: 'failed' })
    expect(recorder.stats.agents).toEqual({ started: 2, failed: 1, cancelled: 0 })
    // Counts are diagnostics; the schema has no field for them, so nothing was written.
    expect(recorder.stats.writes).toBe(0)
    recorder.dispose()
  })

  it('latches the run\'s durable task identity at adopt (B12)', async () => {
    const dir = join(scratch, 'identity')
    const recorder = createCheckpointRecorder(options({ directory: dir }))
    // The engine run handle carries both: `id` is engine-generated, `meta.name` is
    // the durable task label `src/run.ts` also hands the memory archiver.
    recorder.adopt({ id: 'run-identity', meta: { name: '  checkpoint wiring round  ' } })
    expect(recorder.stats.runName).toBe('checkpoint wiring round')

    const written = await recorder.tick()
    expect(written?.ok).toBe(true)
    const checkpoint = await readCheckpoint(checkpointFile('run-identity', { dir }))
    expect(checkpoint.run.runId).toBe('run-identity')
    expect(checkpoint.run.name).toBe('checkpoint wiring round')
    recorder.dispose()
  })

  it('redacts a secret in the durable name before it reaches stats or disk (B12)', async () => {
    const dir = join(scratch, 'identity-secret')
    const secret = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789'
    const recorder = createCheckpointRecorder(options({ directory: dir }))
    recorder.adopt({ id: 'run-identity-secret', meta: { name: `round for ${secret}` } })
    expect(recorder.stats.runName).not.toContain(secret)
    await recorder.tick()
    expect(await readFile(checkpointFile('run-identity-secret', { dir }), 'utf8')).not.toContain(secret)
    recorder.dispose()
  })

  it('always fills agents and stages in the snapshot, before any report exists (B12)', () => {
    const events = new FakeEvents()
    const dir = join(scratch, 'snapshot-shape')
    const recorder = createCheckpointRecorder(options({ directory: dir, events }))
    recorder.adopt({ id: 'run-snapshot' })
    events.emit('workflow/phase', { id: 'run-snapshot' }, 'plan')

    const input = recorder.snapshot()
    // Not `undefined`: "no child call was observed yet" is a fact, and a consumer
    // must not have to know whether a report exists to read these two rows.
    expect(input?.agents).toEqual([])
    expect(input?.stages?.map(stage => stage.phase)).toEqual(['plan'])
    expect(input?.tasks).toBeUndefined()
    recorder.dispose()
  })

  it('never lets two writes overlap on the same run file (B14)', async () => {
    const dir = join(scratch, 'single-flight')
    const recorder = createCheckpointRecorder(options({ directory: dir }))
    recorder.adopt({ id: 'run-single-flight' })

    // Two ticks issued in the same synchronous block: the second one coalesces onto
    // the write already in flight instead of racing it on the same file.
    const [first, second] = await Promise.all([recorder.tick(), recorder.tick()])
    expect(first?.ok).toBe(true)
    expect(second).toBe(first)
    expect(recorder.stats.writes).toBe(1)

    // A terminal write queues behind an in-flight one and is what lands last.
    const terminal = await recorder.finish({ stopReason: 'completed' })
    expect(terminal?.terminal).toBe(true)
    expect(recorder.stats.writes).toBe(2)
    const checkpoint = await readCheckpoint(checkpointFile('run-single-flight', { dir }))
    expect(checkpoint.run.status).toBe('failed')
  })

  it('records a duration far past the 16-minute mark instead of dropping it', async () => {
    const dir = join(scratch, 'long-duration')
    // 30 min: longer than every run `src/config.ts` documents (878 s / 1148 s /
    // 1801 s) and, at 1,800,000 ms, above the 1,000,000 count ceiling — the bound
    // that used to swallow the field. `durationMs` is a millisecond value, so the
    // schema bounds it by `msCeiling` (MAX_SAFE_INTEGER), and the recorder must not
    // invent a tighter one of its own.
    const start = 1_000_000
    let now = start
    const recorder = createCheckpointRecorder({
      ...options({ directory: dir, now: () => now }),
      startedAtMs: start,
    })
    recorder.adopt({ id: 'run-long' })

    now = start + 1_800_000
    const written = await recorder.tick()
    expect(written?.ok).toBe(true)
    const checkpoint = await readCheckpoint(checkpointFile('run-long', { dir }))
    expect(checkpoint.time.startedAtMs).toBe(start)
    expect(checkpoint.time.updatedAtMs).toBe(start + 1_800_000)
    expect(checkpoint.time.durationMs).toBe(1_800_000)
    recorder.dispose()
  })

  it('maps only this plugin’s own phase labels', () => {
    expect(phaseFromTitle('plan')).toBe('plan')
    expect(phaseFromTitle('Execute')).toBe('execute')
    expect(phaseFromTitle('规划')).toBe('plan')
    expect(phaseFromTitle('执行')).toBe('execute')
    expect(phaseFromTitle('汇总')).toBe('synthesize')
    expect(phaseFromTitle('Answer')).toBe('answer')
    expect(phaseFromTitle('deploy everything')).toBeUndefined()
    expect(phaseFromTitle(undefined)).toBeUndefined()
  })
})

/* ------------------------------------------------------- 2. terminal writes -- */

describe('terminal checkpoints', () => {
  it('writes the report-derived rows and releases the timer and listeners', async () => {
    const events = new FakeEvents()
    const dir = join(scratch, 'terminal')
    const recorder = createCheckpointRecorder(options({ directory: dir, events }))
    recorder.adopt({ id: 'run-9' })
    events.emit('workflow/phase', { id: 'run-9' }, 'plan')

    const written = await recorder.finish({
      report: reportOf('partial', [taskReport('task-1', 'verified'), taskReport('task-2', 'failed', 'verifier rejected')]),
      stopReason: 'completed',
    })

    expect(written?.ok).toBe(true)
    expect(written?.terminal).toBe(true)
    const checkpoint = await readCheckpoint(checkpointFile('run-9', { dir }))
    expect(checkpoint.run.status).toBe('partial')
    expect(checkpoint.tasks.map(task => [task.id, task.status])).toEqual([['task-1', 'verified'], ['task-2', 'failed']])
    expect(checkpoint.evidence).toEqual([{ taskId: 'task-1', criterion: 't1 works', claim: 'observed' }])
    // Four roles only: the planted `auditor` row is gone.
    expect(checkpoint.agents.map(row => row.role)).toEqual(['planner', 'worker', 'verifier', 'synthesizer'])
    expect(checkpoint.plan.source).toBe('planner')
    // Released: no timer, no listeners, nothing left behind by a finished run.
    expect(recorder.stats.timerArmed).toBe(false)
    expect(recorder.stats.listeners).toBe(0)
    expect(events.listeners).toBe(0)
    expect(recorder.stats.disposed).toBe(true)
  })

  it('does not claim completion for a settled engine that produced no usable report', async () => {
    const dir = join(scratch, 'no-report')
    const recorder = createCheckpointRecorder(options({ directory: dir }))
    recorder.adopt({ id: 'run-10' })
    await recorder.finish({ stopReason: 'completed', cause: 'report-invalid' })
    const checkpoint = await readCheckpoint(checkpointFile('run-10', { dir }))
    expect(checkpoint.run.status).toBe('failed')
    expect(checkpoint.run.cause).toBe('report-invalid')
  })
})

/* --------------------------------------------------------- 3. unload writes -- */

describe('unload checkpoints', () => {
  it('writes a cancelled checkpoint before the run is gone, and a later finish is a no-op', async () => {
    const dir = witnessDir('witness-unload')
    const recorder = createCheckpointRecorder(options({ directory: dir }))
    recorder.adopt({ id: 'run-11' })

    const unloaded = await recorder.unload('the plugin was unloaded while the run was in flight')
    expect(unloaded?.ok).toBe(true)

    const first = await readCheckpoint(checkpointFile('run-11', { dir }))
    expect(first.run.status).toBe('cancelled')
    expect(first.watchdog.cancelled).toBe(true)
    expect(first.watchdog.cancelReason).toContain('unloaded')

    // A disposal-then-settlement race must not rewrite the terminal file.
    const late = await recorder.finish({ stopReason: 'cancelled', unloaded: true })
    expect(late).toBeUndefined()
    const second = await readCheckpoint(checkpointFile('run-11', { dir }))
    expect(second.integrity?.checksum).toBe(first.integrity?.checksum)
    expect(recorder.stats.timerArmed).toBe(false)
    // What a host should do with this file: nothing it can name — the run was cut
    // before any report existed, so there are no task rows to re-drive.
    const decision = resumeDecision(first)
    expect(decision.action).toBe('none')
    expect(decision.reason).toContain('no task rows')
  })

  it('keeps the status a drained run settled with instead of stamping it cancelled', async () => {
    const dir = witnessDir('witness-unload-settled')
    const recorder = createCheckpointRecorder(options({ directory: dir }))
    recorder.adopt({ id: 'run-13' })
    // The unload now drains in-flight work first (`src/run.ts`), so a run can
    // settle *while* the disposer is still waiting — which means its terminal
    // `finish()` can overlap the unload write. The file must carry the run's own
    // outcome: stamping `cancelled` over a report the user just watched finish
    // would be a durable lie, and the next session would resume work that is done.
    const finishing = recorder.finish({
      report: reportOf('completed', [taskReport('task-1', 'verified')]),
      stopReason: 'completed',
    })
    const unloading = recorder.unload('the plugin was unloaded while the run was in flight')
    await Promise.allSettled([finishing, unloading])

    const checkpoint = await readCheckpoint(checkpointFile('run-13', { dir }))
    expect(checkpoint.run.status).toBe('completed')
    expect(checkpoint.watchdog.cancelled).toBe(false)
    expect(checkpoint.tasks.map(task => [task.id, task.status])).toEqual([['task-1', 'verified']])
  })

  it('records a deadline that passed as a host fact', async () => {
    const dir = join(scratch, 'deadline')
    let now = 1_000_000
    const recorder = createCheckpointRecorder({
      ...options({ directory: dir, now: () => now }),
      startedAtMs: now,
      // Test-only deadline (see above): 60 s keeps the clock arithmetic small and
      // nothing more — an explicit deadline value is representable, because the
      // checkpoint bounds timeoutMs and deadlineMs by `msCeiling`. Same code path.
      limits: { maxConcurrency: 10, maxRetries: 1, maxTasks: 12, timeoutMs: 60_000 },
    })
    recorder.adopt({ id: 'run-12' })
    now = 1_000_000 + 60_001 // past the 60 s test deadline
    await recorder.tick()
    const checkpoint = await readCheckpoint(checkpointFile('run-12', { dir }))
    expect(checkpoint.watchdog.deadlineHit).toBe(true)
    expect(checkpoint.run.status).toBe('failed')
    recorder.dispose()
  })
})

/* ------------------------------------------- 3b. a cut run keeps its body -- */

describe('no report: the observed child calls still fill the body', () => {
  /**
   * The cancellation shape: the engine ran children, then the run was cut before
   * any report existed (unload, deadline, `report-invalid`). The file used to
   * carry `tasks: []`, `agents: []` and nothing else about the work — a corpse
   * with the pockets emptied. Every fact asserted below is one the engine's own
   * `workflow/agent-start` / `workflow/agent-end` events stated; nothing here is
   * derived from a child's self-report, and no role is guessed.
   */
  it('writes task and agent rows from the engine events when no report exists', async () => {
    const events = new FakeEvents()
    const dir = join(scratch, 'observed-body')
    let now = 1_000
    const recorder = createCheckpointRecorder({
      ...options({ directory: dir, events, now: () => now }),
      startedAtMs: 1_000,
    })
    recorder.adopt({ id: 'run-13' })

    // Payload shape the engine really emits: (runInfo, member).
    const start = (member: Record<string, unknown>): void => { events.emit('workflow/agent-start', { id: 'run-13' }, member) }
    const end = (member: Record<string, unknown>): void => { events.emit('workflow/agent-end', { id: 'run-13' }, member) }

    start({ seq: 1, label: '执行', phase: '任务 1 · 修好取消路径', childId: 'child-a' })
    now = 1_150
    end({ seq: 1, label: '执行', phase: '任务 1 · 修好取消路径', childId: 'child-a', outcome: 'completed' })
    start({ seq: 2, label: '执行（尝试 2）', phase: '任务 1 · 修好取消路径', childId: 'child-b' })
    now = 1_200
    end({ seq: 2, label: '执行（尝试 2）', phase: '任务 1 · 修好取消路径', childId: 'child-b', outcome: 'cancelled' })
    start({ seq: 3, label: '检查', phase: '验证任务 2', childId: 'child-c' })
    // A label that names no host role: the call gets a task row, never an
    // invented role.
    start({ seq: 4, label: '临时帮手', phase: '任务 4 · 无关工作', childId: 'child-d' })
    now = 1_400
    end({ seq: 4, label: '临时帮手', phase: '任务 4 · 无关工作', childId: 'child-d', outcome: 'completed' })
    // A different run's events must not be filed under ours.
    events.emit('workflow/agent-start', { id: 'run-other' }, { seq: 9, label: '执行', childId: 'child-x' })

    const written = await recorder.unload('the plugin was unloaded while the run was in flight')
    expect(written?.ok).toBe(true)
    const checkpoint = await readCheckpoint(checkpointFile('run-13', { dir }))

    expect(checkpoint.run.status).toBe('cancelled')
    // Task rows: id, task name, status, attempts — from the events alone.
    expect(checkpoint.tasks.map(task => [task.id, task.title, task.status, task.attempts])).toEqual([
      // `completed` is not `verified`: only a verifier's verdict says verified, and
      // a row claimed as verified would drop out of `resumeDecision.unfinished`.
      ['child-a', '任务 1 · 修好取消路径', 'running', 1],
      ['child-b', '任务 1 · 修好取消路径', 'cancelled', 2],
      ['child-c', '验证任务 2', 'running', 1],
      ['child-d', '任务 4 · 无关工作', 'running', 1],
    ])

    // Agent rows: only settled calls, only roles a label actually names.
    expect(checkpoint.agents.map(row => [row.role, row.attempt, row.outcome, row.startedAtMs, row.durationMs])).toEqual([
      ['worker', 1, 'ok', 1_000, 150],
      ['worker', 2, 'failed', 1_150, 50],
    ])

    // An observation is not a plan: the plan source stays honestly unavailable.
    expect(checkpoint.plan).toEqual({ source: 'unavailable', taskCount: 0, tasks: [] })
    // Evidence needs a verification verdict, which only a report carries.
    expect(checkpoint.evidence).toEqual([])

    // What the body is for: a cut run now names the work to re-drive instead of
    // answering "the checkpoint carries no task rows".
    const decision = resumeDecision(checkpoint)
    expect(decision.action).toBe('resume')
    expect(decision.unfinished).toEqual(['child-a', 'child-b', 'child-c', 'child-d'])
    recorder.dispose()
  })

  it('keeps a row for a call whose start predates the recorder', async () => {
    // The recorder subscribes when it is created, but a plugin that is set up mid
    // run can miss the start. Dropping the call would erase work that plainly ran,
    // and inventing a start time would claim a span nobody witnessed — so the row
    // records the end alone, with no timestamps it did not observe.
    const events = new FakeEvents()
    const dir = join(scratch, 'end-only')
    const recorder = createCheckpointRecorder(options({ directory: dir, events }))
    recorder.adopt({ id: 'run-15' })
    events.emit('workflow/agent-end', { id: 'run-15' }, {
      seq: 1, label: '执行', phase: '任务 1 · 早于订阅', childId: 'child-e', outcome: 'failed',
    })

    await recorder.tick()
    const checkpoint = await readCheckpoint(checkpointFile('run-15', { dir }))
    expect(checkpoint.tasks.map(task => [task.id, task.title, task.status, task.attempts])).toEqual([
      ['child-e', '任务 1 · 早于订阅', 'failed', 1],
    ])
    expect(checkpoint.agents).toEqual([{ role: 'worker', outcome: 'failed', attempt: 1 }])
    recorder.dispose()
  })

  it('lets a report win over the observed rows, as before', async () => {
    const events = new FakeEvents()
    const dir = join(scratch, 'report-wins')
    const recorder = createCheckpointRecorder(options({ directory: dir, events }))
    recorder.adopt({ id: 'run-14' })
    events.emit('workflow/agent-start', { id: 'run-14' }, { seq: 1, label: '执行', phase: '任务 1 · observed', childId: 'child-a' })

    await recorder.finish({
      report: reportOf('partial', [taskReport('task-1', 'verified')]),
      stopReason: 'completed',
    })
    const checkpoint = await readCheckpoint(checkpointFile('run-14', { dir }))
    // The report's own rows are the ones that run really produced.
    expect(checkpoint.tasks.map(task => [task.id, task.status])).toEqual([['task-1', 'verified']])
    expect(checkpoint.agents.map(row => row.role)).toEqual(['planner', 'worker', 'verifier', 'synthesizer'])
    expect(checkpoint.plan.source).toBe('planner')
    recorder.dispose()
  })
})

/* ------------------------------------------------------------- 4. no roles -- */

describe('four roles, host-side only', () => {
  it('routes the resume decision through runWorkflow (wired)', () => {
    // The marker keeps "exported and tested" from being mistaken for an
    // unwired feature: it names the production caller that asks the question.
    expect(RESUME_DECISION_WIRING.wired).toBe(true)
    expect(RESUME_DECISION_WIRING.entry).toBe('src/run.ts:runWorkflow')
    expect(RESUME_DECISION_WIRING.note).not.toContain('no production caller')
  })

  it('knows exactly the five roles the plugin runs', () => {
    expect([...HOST_ROLES]).toEqual(['planner', 'worker', 'verifier', 'supervisor', 'synthesizer'])
    expect(isHostRole('planner')).toBe(true)
    expect(isHostRole('auditor')).toBe(false)
    expect(isHostRole(undefined)).toBe(false)
  })
})

/* ---------------------------------------------------------- 5. inert states -- */

describe('inert when there is nothing to describe', () => {
  it('arms no timer and writes nothing before a run is adopted', async () => {
    const dir = join(scratch, 'inert')
    const recorder = createCheckpointRecorder(options({ directory: dir }))
    expect(recorder.stats.timerArmed).toBe(false)
    expect(await recorder.tick()).toBeUndefined()
    expect(await recorder.finish({ stopReason: 'completed' })).toBeUndefined()
    expect(recorder.snapshot()).toBeUndefined()
    expect(recorder.stats.writes).toBe(0)
  })

  it('releases every listener and stops writing once disposed', async () => {
    const events = new FakeEvents()
    const dir = join(scratch, 'disposed')
    const recorder = createCheckpointRecorder(options({ directory: dir, events }))
    recorder.adopt({ id: 'run-13' })
    expect(events.listeners).toBeGreaterThan(0)
    recorder.dispose()
    expect(events.listeners).toBe(0)
    expect(recorder.stats.timerArmed).toBe(false)
    expect(await recorder.tick()).toBeUndefined()
    expect(await recorder.unload('anything')).toBeUndefined()
    expect(recorder.stats.writes).toBe(0)
  })

  it('registers with the plugin instance only after adoption', () => {
    const state = createActiveState()
    const dir = join(scratch, 'registry')
    const recorder = createCheckpointRecorder({ ...options({ directory: dir }), state })
    expect(registeredCheckpointRecorders(state)).toBe(0)
    recorder.adopt({ id: 'run-14' })
    expect(registeredCheckpointRecorders(state)).toBe(1)
    recorder.dispose()
    expect(registeredCheckpointRecorders(state)).toBe(0)
  })

  it('records the contract defaults when a run supplies no limits at all (B15)', async () => {
    const dir = join(scratch, 'no-limits')
    // No `limits` at all: the schema fills the documented defaults. Coercing the
    // missing numbers to 0 used to make every single write fail as `invalid`.
    const recorder = createCheckpointRecorder({
      logger: new Recorder().logger,
      directory: dir,
      objective: 'ship the thing',
    })
    recorder.adopt({ id: 'run-no-limits' })
    const written = await recorder.tick()
    expect(written?.ok).toBe(true)
    const checkpoint = await readCheckpoint(checkpointFile('run-no-limits', { dir }))
    expect(checkpoint.limits).toEqual({ maxConcurrency: 10, maxRetries: 1, maxTasks: 10 })
    recorder.dispose()
  })

  it('surfaces a limits row outside the engine-hook contract once, visibly (B07)', async () => {
    const dir = join(scratch, 'contract')
    const recorder = new Recorder()
    // A programmatic caller that bypasses the config schema is the only way these
    // numbers can arrive: `resolveConfig` itself refuses anything above 100 / 3.
    const violations = createCheckpointRecorder({
      ...options({ directory: dir, recorder }),
      limits: { maxConcurrency: 101, maxRetries: 5, maxTasks: 4 },
    })
    violations.adopt({ id: 'run-contract' })
    const warned = recorder.warnings.filter(message => message.includes('engine-hook contract'))
    expect(warned).toHaveLength(1)
    expect(warned[0]).toContain('maxConcurrency 101 exceeds the documented maximum 100')
    expect(warned[0]).toContain('maxRetries 5 exceeds the documented maximum 3')
    // Idempotent: re-adopting the same run does not repeat the warning.
    violations.adopt({ id: 'run-contract' })
    expect(recorder.warnings.filter(message => message.includes('engine-hook contract'))).toHaveLength(1)
    // And the run is not broken: the recorder refuses the *write*, not the run.
    const refused = await violations.tick()
    if (refused === undefined || refused.ok) throw new Error('expected the write to be refused')
    expect(refused.reason).toBe('invalid')
    violations.dispose()

    // A compliant run says nothing at all.
    const quiet = new Recorder()
    const compliant = createCheckpointRecorder(options({ directory: join(scratch, 'contract-ok'), recorder: quiet }))
    compliant.adopt({ id: 'run-contract-ok' })
    expect(quiet.warnings).toEqual([])
    compliant.dispose()
  })

  it('stops retrying after repeated write failures instead of warning forever', async () => {
    // A directory path that is a file: every write fails with `io`.
    const blocker = join(scratch, 'blocked')
    await rm(blocker, { recursive: true, force: true })
    const { writeFile } = await import('node:fs/promises')
    await writeFile(blocker, 'not a directory', 'utf8')
    const recorder = createCheckpointRecorder(options({ directory: blocker }))
    recorder.adopt({ id: 'run-15' })
    await recorder.tick()
    await recorder.tick()
    await recorder.tick()
    expect(recorder.stats.failures).toBe(3)
    expect(await recorder.tick()).toBeUndefined()
    recorder.dispose()
  })
})

/* ------------------------------------------------------- 6. resume decision -- */

describe('resume carry-over (the second half of the item: a run that really continues)', () => {
  const decisionOf = (seed: string, unfinished: string[]) => ({
    action: 'resume' as const,
    reason: 'run run-r was failed when the checkpoint was taken (2026-11-23T01:00:00.000Z)',
    runId: 'run-r',
    unfinished,
    seed,
  })
  const resumedOf = (seed: string, unfinished: string[]) => ({
    path: '/nonexistent/checkpoint-run-r.json',
    checkpoint: { run: { runId: 'run-r' } } as never,
    decision: decisionOf(seed, unfinished),
  })

  it('composes the three lines the planner reads when a run resumes', () => {
    const text = resumeCarryover(undefined, resumedOf('DIGEST', ['task-2', 'task-3']))
    expect(text?.split('\n')).toEqual([
      'run run-r was failed when the checkpoint was taken (2026-11-23T01:00:00.000Z)',
      'unfinished: task-2, task-3',
      'context: DIGEST',
    ])
  })

  it('lets a caller carry-over win over a checkpoint from an older crash', () => {
    expect(resumeCarryover('this round has its own context', resumedOf('DIGEST', ['task-2'])))
      .toBe('this round has its own context')
    // A blank caller value is not context: the resume seed still applies.
    expect(resumeCarryover('   ', resumedOf('DIGEST', ['task-2']))).toContain('context: DIGEST')
  })

  it('starts fresh when there is no resume, or the resumed seed is blank', () => {
    expect(resumeCarryover(undefined, undefined)).toBeUndefined()
    expect(resumeCarryover(undefined, resumedOf('   ', ['task-2']))).toBeUndefined()
  })
})



describe('resume decision', () => {
  const checkpointOf = (
    status: 'running' | 'completed' | 'partial' | 'failed' | 'cancelled',
    tasks: { id: string, status: 'verified' | 'failed' | 'pending' | 'running' | 'cancelled' }[],
    updatedAtMs = 1_000_000,
  ) => sealCheckpoint(buildCheckpoint({
    run: { runId: 'run-r', objective: 'ship it', status },
    plan: { source: 'planner', tasks: [] },
    tasks: tasks.map(task => ({ id: task.id, title: task.id, status: task.status, attempts: 1 })),
    time: { startedAtMs: 1_000_000, updatedAtMs },
    minContext: { objective: 'ship it', digest: 'DIGEST' },
  }))

  it('ignores a completed run', () => {
    const decision = resumeDecision(checkpointOf('completed', [{ id: 'task-1', status: 'verified' }]))
    expect(decision.action).toBe('none')
    expect(decision.reason).toContain('already completed')
  })

  it('waits on a checkpoint that may still be owned by a live process', () => {
    const decision = resumeDecision(checkpointOf('running', [{ id: 'task-1', status: 'running' }]), { now: 1_000_500 })
    expect(decision.action).toBe('wait')
    expect(decision.unfinished).toEqual(['task-1'])
  })

  it('resumes a stale running checkpoint and names what to re-drive', () => {
    const decision = resumeDecision(checkpointOf('running', [
      { id: 'task-1', status: 'verified' },
      { id: 'task-2', status: 'running' },
    ]), { now: 1_000_000 + CHECKPOINT_WIRING_LIMITS.staleAfterMs.default + 1 })
    expect(decision.action).toBe('resume')
    expect(decision.unfinished).toEqual(['task-2'])
    expect(decision.seed).toBe('DIGEST')
  })

  it('resumes a cut run and refuses to re-drive work it has no rows for', () => {
    expect(resumeDecision(checkpointOf('cancelled', [{ id: 'task-1', status: 'pending' }])).action).toBe('resume')
    const empty = resumeDecision(checkpointOf('cancelled', []))
    expect(empty.action).toBe('none')
    expect(empty.reason).toContain('no task rows')
  })

  it('bounds staleness on its own range, 1 s to 24 h, not the write interval (B13)', () => {
    const sixHours = 6 * 60 * 60 * 1000
    const twelveHours = 12 * 60 * 60 * 1000
    const running = checkpointOf('running', [{ id: 'task-1', status: 'running' }])
    // Inside the staleness range but far outside the interval range (1 s .. 5 min):
    // the shared clamp used to fold a 12-hour request into 5 minutes and resume a
    // run that was still in flight.
    expect(resumeDecision(running, { now: 1_000_000 + sixHours, staleAfterMs: twelveHours }).action).toBe('wait')
    // Below the floor (500 ms) the bound is raised to 1 s, so a 500 ms old file waits.
    expect(resumeDecision(running, { now: 1_000_000 + 500, staleAfterMs: 1 }).action).toBe('wait')
    // Above the ceiling the bound stays 24 h: a week-long request cannot make a
    // day-old checkpoint look live.
    expect(resumeDecision(running, { now: 1_000_000 + 86_400_000 + 1, staleAfterMs: 7 * 86_400_000 }).action).toBe('resume')
    // The default is still two minutes.
    expect(CHECKPOINT_WIRING_LIMITS.staleAfterMs).toEqual({ min: 1_000, max: 86_400_000, default: 120_000 })
  })

  it('treats a stamp in the future as possibly live, never as stale (B13)', () => {
    // A clock behind the writer (or a replayed file) must not read as "old": age is
    // floored at 0, and the answer stays `wait`, which is the fail-safe direction
    // because `resume` starts a second run over work another process may hold.
    const ahead = checkpointOf('running', [{ id: 'task-1', status: 'running' }], 1_000_000 + 60_000)
    const decision = resumeDecision(ahead, { now: 1_000_000 })
    expect(decision.action).toBe('wait')
    expect(decision.reason).toContain('in the future')
    expect(decision.unfinished).toEqual(['task-1'])
  })

  it('never claims engine-level resume', () => {
    const decision = resumeDecision(checkpointOf('partial', [{ id: 'task-1', status: 'failed' }]))
    expect(decision.action).toBe('resume')
    expect(decision.reason).toContain('a new run can re-drive them from the recorded context')
  })

  it('finds nothing in an empty or missing directory', async () => {
    expect(await findResumableCheckpoint({ dir: join(scratch, 'resume-empty') })).toBeUndefined()
    const missing = join(scratch, 'resume-missing', `no-such-dir-${Date.now()}`)
    expect(await findResumableCheckpoint({ dir: missing })).toBeUndefined()
  })

  it('skips a torn file and resumes from the intact one', async () => {
    const dir = join(scratch, 'resume-torn')
    const torn: WorkflowCheckpoint = sealCheckpoint(buildCheckpoint({
      run: { runId: 'run-torn', objective: 'ship it', status: 'cancelled' },
      plan: { source: 'planner', tasks: [] },
      tasks: [{ id: 'task-torn', title: 'torn', status: 'pending', attempts: 0 }],
      time: { startedAtMs: 1_000_000, updatedAtMs: 1_000_000 },
      minContext: { objective: 'ship it', digest: 'TORN-DIGEST' },
    }))
    const intact: WorkflowCheckpoint = sealCheckpoint(buildCheckpoint({
      run: { runId: 'run-intact', objective: 'ship it', status: 'cancelled' },
      plan: { source: 'planner', tasks: [] },
      tasks: [{ id: 'task-intact', title: 'intact', status: 'pending', attempts: 0 }],
      time: { startedAtMs: 1_000_000, updatedAtMs: 1_000_000 },
      minContext: { objective: 'ship it', digest: 'INTACT-DIGEST' },
    }))
    await writeCheckpoint(checkpointFile('run-torn', { dir }), {
      run: { runId: 'run-torn', objective: 'ship it', status: 'cancelled' },
      plan: { source: 'planner', tasks: [] },
      tasks: [{ id: 'task-torn', title: 'torn', status: 'pending', attempts: 0 }],
      time: { startedAtMs: 1_000_000, updatedAtMs: 1_000_000 },
      minContext: { objective: 'ship it', digest: 'TORN-DIGEST' },
    })
    await writeCheckpoint(checkpointFile('run-intact', { dir }), {
      run: { runId: 'run-intact', objective: 'ship it', status: 'cancelled' },
      plan: { source: 'planner', tasks: [] },
      tasks: [{ id: 'task-intact', title: 'intact', status: 'pending', attempts: 0 }],
      time: { startedAtMs: 1_000_000, updatedAtMs: 1_000_000 },
      minContext: { objective: 'ship it', digest: 'INTACT-DIGEST' },
    })
    // Tear one file after sealing: the checksum no longer matches, so the scan
    // must pass over it instead of throwing.
    const { writeFile } = await import('node:fs/promises')
    await writeFile(checkpointFile('run-torn', { dir }), JSON.stringify({ ...torn, run: { ...torn.run, objective: 'tampered' } }))
    const found = await findResumableCheckpoint({ dir })
    expect(found?.decision.runId).toBe('run-intact')
    expect(found?.decision.seed).toBe('INTACT-DIGEST')
    expect(found?.decision.unfinished).toEqual(['task-intact'])
    void intact
  })

  it('ignores files that answer completed or wait', async () => {
    const dir = join(scratch, 'resume-skip')
    const nowSeed = Date.now()
    // A `completed` file has nothing left to re-drive.
    await writeCheckpoint(checkpointFile('run-done', { dir }), {
      run: { runId: 'run-done', objective: 'ship it', status: 'completed' },
      plan: { source: 'planner', tasks: [] },
      tasks: [{ id: 'task-done', title: 'done', status: 'verified', attempts: 1 }],
      time: { startedAtMs: 1_000_000, updatedAtMs: 1_000_000 },
      minContext: { objective: 'ship it', digest: 'DONE-DIGEST' },
    })
    // A fresh `running` file may still be owned by a live process: fail-safe `wait`.
    await writeCheckpoint(checkpointFile('run-live', { dir }), {
      run: { runId: 'run-live', objective: 'ship it', status: 'running' },
      plan: { source: 'planner', tasks: [] },
      tasks: [{ id: 'task-live', title: 'live', status: 'running', attempts: 1 }],
      time: { startedAtMs: nowSeed, updatedAtMs: nowSeed },
      minContext: { objective: 'ship it', digest: 'LIVE-DIGEST' },
    })
    expect(await findResumableCheckpoint({ dir, now: nowSeed + 500 })).toBeUndefined()
  })

  it('stays inside one session: another chat crash never seeds this run', async () => {
    const dir = join(scratch, 'resume-session')
    await writeCheckpoint(checkpointFile('run-other-chat', { dir }), {
      run: { runId: 'run-other-chat', objective: 'other chat', status: 'cancelled', sessionId: 'sess-other' },
      plan: { source: 'planner', tasks: [] },
      tasks: [{ id: 'task-other', title: 'other', status: 'pending', attempts: 0 }],
      time: { startedAtMs: 1_000_000, updatedAtMs: 1_000_000 },
      minContext: { objective: 'other chat', digest: 'OTHER-DIGEST' },
    })
    await writeCheckpoint(checkpointFile('run-my-chat', { dir }), {
      run: { runId: 'run-my-chat', objective: 'my chat', status: 'cancelled', sessionId: 'sess-mine' },
      plan: { source: 'planner', tasks: [] },
      tasks: [{ id: 'task-mine', title: 'mine', status: 'pending', attempts: 0 }],
      time: { startedAtMs: 1_000_001, updatedAtMs: 1_000_001 },
      minContext: { objective: 'my chat', digest: 'MINE-DIGEST' },
    })
    // Same directory, but only my chat's crash is visible to my session.
    expect((await findResumableCheckpoint({ dir, sessionId: 'sess-mine' }))?.decision.runId).toBe('run-my-chat')
    expect((await findResumableCheckpoint({ dir, sessionId: 'sess-other' }))?.decision.runId).toBe('run-other-chat')
    expect(await findResumableCheckpoint({ dir, sessionId: 'sess-stranger' })).toBeUndefined()
  })
})

/* ------------------------------------------- 7. the run/disposal integration -- */

class HangingRun {
  readonly id = 'run-wire-1'
  readonly meta = { name: 'grok-workflow', description: 'wiring' }
  readonly dispose = vi.fn(async () => {})
  readonly cancel = vi.fn((_reason?: string) => { this.settle() })
  readonly result: Promise<{ value: unknown, stopReason: string, agentsStarted: number }>
  private resolve!: (value: { value: unknown, stopReason: string, agentsStarted: number }) => void

  constructor() {
    this.result = new Promise(resolve => { this.resolve = resolve })
  }

  settle(): void {
    this.resolve({ value: null, stopReason: 'cancelled', agentsStarted: 0 })
  }
}

describe('run lifecycle and disposal', () => {
  it('writes one cancelled checkpoint when the plugin is unloaded mid-run', async () => {
    const dir = await mkdtemp(join(scratch, 'lifecycle-'))
    const previous = process.env.GROK_WORKFLOW_CHECKPOINT_DIR
    process.env.GROK_WORKFLOW_CHECKPOINT_DIR = dir
    const events = new FakeEvents()
    const recorder = new Recorder()
    const run = new HangingRun()
    const state: ActiveState = createActiveState()
    const ctx = {
      on: events.on,
      workflowEngine: { start: async () => run },
      logger: () => recorder.logger,
    } as never
    const agent = { session: { id: 'sess-lifecycle', header: { delegationDepth: 0 } } } as never
    try {
      const pending = runWorkflow({
        ctx,
        config: resolveConfig({} as never),
        state,
        logger: recorder.logger,
        agent,
        objective: 'ship the thing',
        failureMode: 'report',
      })
      // Wait until the plugin has registered the run (and therefore adopted it).
      while (state.runs.size === 0) await new Promise(resolve => { setImmediate(resolve) })
      expect(registeredCheckpointRecorders(state)).toBe(1)
      events.emit('workflow/phase', { id: run.id }, 'plan')

      await disposeActiveState(state, { logger: recorder.logger })
      await pending

      const checkpoint = await readCheckpoint(checkpointFile(run.id, { dir }))
      expect(checkpoint.run.status).toBe('cancelled')
      expect(checkpoint.watchdog.cancelled).toBe(true)
      // End to end, through the real `runWorkflow`: the durable task label the
      // engine hands back reaches the file, not only a synthetic `adopt` (B12).
      expect(checkpoint.run.name).toBe(run.meta.name)
      // The default deadline is 0 = unlimited, which the checkpoint omits
      // (absent and 0 both name "no deadline"), so the file records no bound.
      expect(checkpoint.limits.timeoutMs).toBeUndefined()
      expect(checkpoint.time.deadlineAtMs).toBeUndefined()
      expect(checkpoint.stages.map(stage => stage.phase)).toEqual(['plan'])
      const decision = resumeDecision(checkpoint)
      expect(decision.action).toBe('none')
      expect(decision.reason).toContain('no task rows')
      expect(registeredCheckpointRecorders(state)).toBe(0)
      expect(events.listeners).toBe(0)
    } finally {
      if (previous === undefined) delete process.env.GROK_WORKFLOW_CHECKPOINT_DIR
      else process.env.GROK_WORKFLOW_CHECKPOINT_DIR = previous
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('says once, visibly, that it has stopped writing checkpoints (B15)', async () => {
    const blocker = join(scratch, 'blocked-give-up')
    await rm(blocker, { recursive: true, force: true })
    const { writeFile } = await import('node:fs/promises')
    await writeFile(blocker, 'not a directory', 'utf8')
    const recorder = new Recorder()
    const checkpointing = createCheckpointRecorder(options({ directory: blocker, recorder }))
    checkpointing.adopt({ id: 'run-give-up' })
    await checkpointing.tick()
    await checkpointing.tick()
    await checkpointing.tick()
    expect(checkpointing.stats.writesStopped).toBe(false)

    // The next tick is the one that gives up, and it is the only one that says so:
    // without this line the run went quiet after three per-write warnings, which
    // reads exactly like a run whose checkpoints are healthy.
    expect(await checkpointing.tick()).toBeUndefined()
    expect(checkpointing.stats.writesStopped).toBe(true)
    const giveUp = recorder.warnings.filter(message => message.includes('stopped after 3 consecutive failures'))
    expect(giveUp).toHaveLength(1)
    expect(giveUp[0]).toContain('run-give-up')
    await checkpointing.tick()
    expect(recorder.warnings.filter(message => message.includes('stopped after 3 consecutive failures'))).toHaveLength(1)
    checkpointing.dispose()
  })

  it('resolves the default directory from the environment', async () => {
    const previous = process.env.GROK_WORKFLOW_CHECKPOINT_DIR
    process.env.GROK_WORKFLOW_CHECKPOINT_DIR = '/tmp/wiring-explicit'
    try {
      expect(checkpointDir()).toBe('/tmp/wiring-explicit')
      expect(checkpointDir({ dir: '/tmp/wiring-arg' })).toBe('/tmp/wiring-arg')
      expect(checkpointFile('run x/y')).toBe(`/tmp/wiring-explicit/${checkpointFileName('run x/y')}`)
      // Two ids a sanitizer alone would merge must not share a file.
      expect(checkpointFile('run x/y')).not.toBe(checkpointFile('run x_y'))
    } finally {
      if (previous === undefined) delete process.env.GROK_WORKFLOW_CHECKPOINT_DIR
      else process.env.GROK_WORKFLOW_CHECKPOINT_DIR = previous
    }
  })

  it('runs fresh when no checkpoint says resume, and resumes from the newest resumable one', async () => {
    // No-checkpoint path: the scratch checkpoint dir is empty for this run id,
    // so the scan answers "start fresh" and a fresh run leaves its own
    // cancelled file (cut before any report: nothing to re-drive).
    const emptyDir = await mkdtemp(join(scratch, 'resume-run-fresh-'))
    const previous = process.env.GROK_WORKFLOW_CHECKPOINT_DIR
    process.env.GROK_WORKFLOW_CHECKPOINT_DIR = emptyDir
    const events = new FakeEvents()
    const recorder = new Recorder()
    const fresh = new HangingRun()
    const freshState = createActiveState()
    const freshCtx = {
      on: events.on,
      workflowEngine: { start: async () => fresh },
      logger: () => recorder.logger,
    } as never
    const freshAgent = { session: { id: 'sess-resume-fresh', header: { delegationDepth: 0 } } } as never
    let freshCheckpoint: WorkflowCheckpoint | undefined
    let seeded: Awaited<ReturnType<typeof findResumableCheckpoint>>
    const seedDir = await mkdtemp(join(scratch, 'resume-run-seed-'))
    // Seed the session-scoped checkpoint BEFORE starting the fresh run: if the
    // scan ever crossed sessions, the fresh run in 'sess-resume-fresh' would
    // pick up 'sess-resume-mine''s crash and the request check below would fail.
    const staleSeed = Date.now() - CHECKPOINT_WIRING_LIMITS.staleAfterMs.default - 60_000
    await writeCheckpoint(checkpointFile('run-old-unfinished', { dir: seedDir }), {
      run: { runId: 'run-old-unfinished', objective: 'finish the parser', status: 'cancelled', sessionId: 'sess-resume-mine' },
      plan: { source: 'planner', tasks: [] },
      tasks: [
        { id: 'task-a', title: 'done work', status: 'verified', attempts: 1 },
        { id: 'task-b', title: 'open work', status: 'pending', attempts: 1 },
      ],
      time: { startedAtMs: staleSeed, updatedAtMs: staleSeed },
      minContext: { objective: 'finish the parser', digest: 'SEED-DIGEST-9f3c' },
    })
    try {
      process.env.GROK_WORKFLOW_CHECKPOINT_DIR = emptyDir
      // The empty dir has no file for this session: the scan says "start
      // fresh" and the engine receives no seeded carry-over.
      expect(await findResumableCheckpoint({ dir: emptyDir, sessionId: 'sess-resume-fresh' })).toBeUndefined()
      const pending = runWorkflow({
        ctx: freshCtx,
        config: resolveConfig({} as never),
        state: freshState,
        logger: recorder.logger,
        agent: freshAgent,
        objective: 'start fresh',
        failureMode: 'report',
      })
      while (freshState.runs.size === 0) await new Promise(resolve => { setImmediate(resolve) })
      await disposeActiveState(freshState, { logger: recorder.logger })
      await pending
      const freshFile = checkpointFile(fresh.id, { dir: emptyDir })
      freshCheckpoint = await readCheckpoint(freshFile)
      expect(freshCheckpoint.run.status).toBe('cancelled')
      expect(resumeDecision(freshCheckpoint).action).toBe('none')
      // Resume path: the seeded file answers `resume` for its own session only.
      seeded = await findResumableCheckpoint({ dir: seedDir, sessionId: 'sess-resume-mine' })
      expect(await findResumableCheckpoint({ dir: seedDir, sessionId: 'sess-resume-fresh' })).toBeUndefined()
    } finally {
      if (previous === undefined) delete process.env.GROK_WORKFLOW_CHECKPOINT_DIR
      else process.env.GROK_WORKFLOW_CHECKPOINT_DIR = previous
      await rm(emptyDir, { recursive: true, force: true })
      await rm(seedDir, { recursive: true, force: true })
    }
    // Assert outside the env-var window: the seeded file names what a fresh
    // run in the same session would continue from.
    expect(freshCheckpoint?.run.status).toBe('cancelled')
    expect(seeded?.decision.action).toBe('resume')
    expect(seeded?.decision.unfinished).toEqual(['task-b'])
    expect(String(seeded?.decision.seed)).toContain('SEED-DIGEST-9f3c')
  })
})

/* ------------------------------------------------------------------ exports -- */

describe('recorder surface', () => {
  it('exposes exactly the operations the lifecycle needs', () => {
    const recorder: RunCheckpointRecorder = createCheckpointRecorder(options({ directory: join(scratch, 'surface') }))
    for (const name of ['adopt', 'finish', 'unload', 'tick', 'dispose', 'snapshot', 'noteDeadline', 'noteCancel'] as const) {
      expect(typeof recorder[name]).toBe('function')
    }
    recorder.dispose()
  })

  it('records durationMs up to msCeiling, not countCeiling (R10)', () => {
    // The schema reader accepts durations to `msCeiling` (MAX_SAFE_INTEGER,
    // `schema.ts:624`); the writer used to stop at `countCeiling` (1e6 ms =
    // 16m40s), so any run past that recorded no duration at all. Both sides
    // now read the same ceiling: a run that ran long says how long it ran.
    const day = 86_400_000
    let now = 1_000_000
    const recorder = createCheckpointRecorder(options({
      directory: join(scratch, 'long-run'),
      now: () => now,
    }))
    recorder.adopt({ id: 'run-long' })
    now = 1_000_000 + 2 * day // 48h elapsed, past countCeiling, within msCeiling
    const snap = recorder.snapshot()
    recorder.dispose()
    expect((snap?.time as { durationMs?: number } | undefined)?.durationMs).toBe(2 * day)
  })
})
