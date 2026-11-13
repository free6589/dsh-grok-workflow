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
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  CHECKPOINT_WIRING_LIMITS,
  HOST_ROLES,
  checkpointDir,
  checkpointFile,
  createCheckpointRecorder,
  isHostRole,
  phaseFromTitle,
  registeredCheckpointRecorders,
  resumeDecision,
} from '../src/checkpoint/wiring.js'
import type { CheckpointEventSource, RunCheckpointRecorder } from '../src/checkpoint/wiring.js'
import { buildCheckpoint, sealCheckpoint } from '../src/checkpoint/schema.js'
import { readCheckpoint } from '../src/checkpoint/writer.js'
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
    routing: { planner: [], worker: [], verifier: [], synthesizer: [] },
    synthesis: { mode: 'deterministic' },
    limits: { maxConcurrency: 3, maxRetries: 1, maxTasks: 12, maxTotalAgents: 48, timeoutMs: 60_000 },
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
    limits: { maxConcurrency: 3, maxRetries: 1, maxTasks: 12, timeoutMs: 60_000 },
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
    const recorder = createCheckpointRecorder(options({ directory: dir, events }))
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
    expect(checkpoint.limits).toEqual({ maxConcurrency: 3, maxRetries: 1, maxTasks: 12, timeoutMs: 60_000 })
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

  it('records a deadline that passed as a host fact', async () => {
    const dir = join(scratch, 'deadline')
    let now = 1_000_000
    const recorder = createCheckpointRecorder({ ...options({ directory: dir, now: () => now }), startedAtMs: now })
    recorder.adopt({ id: 'run-12' })
    now = 1_000_000 + 60_001 // past the 60 s deadline
    await recorder.tick()
    const checkpoint = await readCheckpoint(checkpointFile('run-12', { dir }))
    expect(checkpoint.watchdog.deadlineHit).toBe(true)
    expect(checkpoint.run.status).toBe('failed')
    recorder.dispose()
  })
})

/* ------------------------------------------------------------- 4. no roles -- */

describe('four roles, host-side only', () => {
  it('knows exactly the four roles the plugin runs', () => {
    expect([...HOST_ROLES]).toEqual(['planner', 'worker', 'verifier', 'synthesizer'])
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
    ]), { now: 1_000_000 + CHECKPOINT_WIRING_LIMITS.resumeStaleAfterMs + 1 })
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

  it('never claims engine-level resume', () => {
    const decision = resumeDecision(checkpointOf('partial', [{ id: 'task-1', status: 'failed' }]))
    expect(decision.action).toBe('resume')
    expect(decision.reason).toContain('a new run can re-drive them from the recorded context')
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

      const checkpoint = await readCheckpoint(join(dir, 'checkpoint-run-wire-1.json'))
      expect(checkpoint.run.status).toBe('cancelled')
      expect(checkpoint.watchdog.cancelled).toBe(true)
      // The default deadline (1 h) is above the schema's count ceiling, so the file
      // says nothing about it rather than recording a number it cannot express.
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

  it('resolves the default directory from the environment', async () => {
    const previous = process.env.GROK_WORKFLOW_CHECKPOINT_DIR
    process.env.GROK_WORKFLOW_CHECKPOINT_DIR = '/tmp/wiring-explicit'
    try {
      expect(checkpointDir()).toBe('/tmp/wiring-explicit')
      expect(checkpointDir({ dir: '/tmp/wiring-arg' })).toBe('/tmp/wiring-arg')
      expect(checkpointFile('run x/y')).toBe('/tmp/wiring-explicit/checkpoint-run_x_y.json')
    } finally {
      if (previous === undefined) delete process.env.GROK_WORKFLOW_CHECKPOINT_DIR
      else process.env.GROK_WORKFLOW_CHECKPOINT_DIR = previous
    }
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
})
