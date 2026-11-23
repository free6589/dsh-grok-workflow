/**
 * Bounded drain on unload: an in-process reload must not throw away the child
 * call that is already running.
 *
 * The measured failure this pins: disabling or upgrading the plugin disposed it
 * on the first line, so a run that had been working for ten minutes lost its
 * in-flight child 200 ms before that child would have reported. The fixes under
 * test are the drain window (`disposeActiveState`), the honest record of what it
 * did (`record.drain`), and the notice that no longer calls a settled run
 * "interrupted".
 *
 * These tests drive the real `disposeActiveState` against the real guardian: the
 * open-child count comes from `openRunGuardianChildren`, which reads the same
 * `agent-start`/`agent-end` rows the engine emits in production. Only the engine
 * itself is a fake that hangs, and only the wait between two probes is injected,
 * so nothing here sleeps for the real 45 s ceiling.
 */
import { describe, expect, it, vi } from 'vitest'
import { Session, pluginRecordOf } from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import { resolveConfig } from '../src/config.js'
import { TERMINAL_RECORD } from '../src/records.js'
import { createActiveState, disposeActiveState, runWorkflow } from '../src/run.js'
import type { ActiveState, RunOutcome, WorkflowLogger } from '../src/run.js'

/* ------------------------------------------------------------------ harness -- */

class Recorder {
  readonly warnings: string[] = []
  readonly infos: string[] = []
  readonly logger: WorkflowLogger = {
    warn: (message: string) => { this.warnings.push(message) },
    info: (message: string) => { this.infos.push(message) },
  }
}

/** A cordis-shaped bus: `on(name, listener)` returns a disposer. */
class Bus {
  readonly handlers = new Map<string, Set<(...args: unknown[]) => void>>()

  readonly on = (name: string, listener: (...args: unknown[]) => void): (() => void) => {
    const set = this.handlers.get(name) ?? new Set<(...args: unknown[]) => void>()
    set.add(listener)
    this.handlers.set(name, set)
    return () => { set.delete(listener) }
  }

  emit(name: string, ...args: unknown[]): void {
    for (const listener of [...this.handlers.get(name) ?? []]) listener(...args)
  }
}

class HangingRun {
  readonly id: string
  readonly meta: WorkflowStartRequest['meta']
  readonly cancel = vi.fn((_reason?: string) => { this.settle('cancelled') })
  readonly dispose = vi.fn(async () => {})
  readonly result: Promise<{ value: unknown, stopReason: string, agentsStarted: number }>
  private resolve!: (value: { value: unknown, stopReason: string, agentsStarted: number }) => void

  constructor(request: WorkflowStartRequest, index: number) {
    this.id = `run-${index}`
    this.meta = request.meta
    this.result = new Promise(resolve => { this.resolve = resolve })
  }

  settle(stopReason: string, value: unknown = null): void {
    this.resolve({ value, stopReason, agentsStarted: 0 })
  }
}

class HangingEngine {
  readonly runs: HangingRun[] = []

  async start(request: WorkflowStartRequest): Promise<HangingRun> {
    const run = new HangingRun(request, this.runs.length + 1)
    this.runs.push(run)
    return run
  }
}

function session(id: string): Session {
  return Session.create(id as SessionId)
}

function noticeTexts(session_: Session): string[] {
  return session_.ownEvents()
    .map(event => pluginRecordOf(event))
    .filter(record => record !== undefined && record.type === TERMINAL_RECORD)
    .map(record => String((record!.data as { text?: unknown }).text ?? ''))
}

/** Start one run and wait until the plugin has registered (and adopted) it. */
async function startRun(
  state: ActiveState,
  engine: HangingEngine,
  recorder: Recorder,
  bus: Bus,
  session_: Session,
): Promise<{ pending: Promise<RunOutcome>, run: HangingRun }> {
  const target = state.runs.size + 1
  const pending = runWorkflow({
    ctx: {
      workflowEngine: engine,
      logger: () => recorder.logger,
      on: bus.on,
    } as never,
    config: resolveConfig({} as never),
    state,
    logger: recorder.logger,
    agent: { session: session_ } as never,
    objective: 'ship the thing',
    failureMode: 'report',
  })
  while (state.runs.size < target) await new Promise(resolve => { setImmediate(resolve) })
  const run = engine.runs[engine.runs.length - 1]
  if (run === undefined) throw new Error('the engine handed back no run')
  return { pending, run }
}

/** One child call opened on the bus, attributed to the run the engine handed back. */
function openChild(bus: Bus, run: HangingRun, seq = 1): void {
  bus.emit('workflow/agent-start', { id: run.id, seq, label: 'worker', childId: `child-${seq}` }, { seq, label: 'worker', childId: `child-${seq}` })
}

function closeChild(bus: Bus, run: HangingRun, seq = 1, outcome = 'completed'): void {
  bus.emit('workflow/agent-end', { id: run.id, seq, label: 'worker', outcome }, { seq, label: 'worker', outcome })
}

/* ------------------------------------------------------------ 1. the fix -- */

describe('the unload drain (bounded, before anything is cancelled)', () => {
  it('settles the child call already running before it cancels the run', async () => {
    const recorder = new Recorder()
    const bus = new Bus()
    const engine = new HangingEngine()
    const state = createActiveState()
    const only = session('sess-drain-settles')
    const { pending, run } = await startRun(state, engine, recorder, bus, only)
    openChild(bus, run)

    // The order of these two words is the whole fix: on the old code `cancel`
    // was the first thing that happened, so `agent-end` could never precede it.
    const order: string[] = []
    run.cancel.mockImplementation(() => {
      order.push('cancel')
      run.settle('cancelled')
    })
    let probes = 0
    const sleep = async (): Promise<void> => {
      probes += 1
      // The child reports during the window, exactly like a ten-minute call that
      // was nearly done when the plugin was reloaded.
      if (probes === 2) {
        order.push('agent-end')
        closeChild(bus, run)
      }
    }

    const record = await disposeActiveState(state, {
      logger: recorder.logger,
      sleep,
      drain: { maxMs: 5_000, stepMs: 100, quietMs: 300 },
    })
    await pending

    expect(order).toContain('agent-end')
    expect(order).toContain('cancel')
    expect(order.indexOf('agent-end')).toBeLessThan(order.indexOf('cancel'))
    // The wait happened, and it is recorded as having happened.
    expect(probes).toBeGreaterThan(1)
    expect(record.drain).toMatchObject({ openAtStart: 1, openAtEnd: 0, deadlineHit: false })
    expect(record.drain!.waitedMs).toBeGreaterThanOrEqual(0)
    // Nothing was cut short, because the only child call had settled.
    expect(record.drain!.runsSettled).toBe(0)
    // A reader of the log learns the same fact without the record.
    expect(recorder.infos.join('\n')).toContain('subagent call(s) in flight')
    expect(run.cancel).toHaveBeenCalledWith('grok-workflow plugin unloaded')
  })

  it('stops at the ceiling and says what it had to leave running', async () => {
    const recorder = new Recorder()
    const bus = new Bus()
    const engine = new HangingEngine()
    const state = createActiveState()
    const only = session('sess-drain-ceiling')
    const { pending, run } = await startRun(state, engine, recorder, bus, only)
    openChild(bus, run)

    // A child that never reports: the window must stay bounded, and the record
    // must admit that work was still open when it closed.
    const sleep = vi.fn(async (): Promise<void> => {})
    const record = await disposeActiveState(state, {
      logger: recorder.logger,
      sleep,
      drain: { maxMs: 1_000, stepMs: 100, quietMs: 300 },
    })
    await pending

    // Counted in steps, so the ceiling holds however fast the sleep returns.
    expect(sleep.mock.calls.length).toBeLessThanOrEqual(10)
    expect(record.drain).toMatchObject({ openAtStart: 1, openAtEnd: 1, deadlineHit: true })
    // The remaining run is still cancelled — the window delays the cut, it does
    // not turn an unload into a no-op.
    expect(run.cancel).toHaveBeenCalled()
    const text = noticeTexts(only).join('\n')
    expect(text).toContain('waited')
    expect(text).toContain('still open when the window closed')
  })

  it('opens no window when nothing is in flight, and says nothing about one', async () => {
    const recorder = new Recorder()
    const bus = new Bus()
    const engine = new HangingEngine()
    const state = createActiveState()
    const only = session('sess-drain-idle-run')
    const { pending, run } = await startRun(state, engine, recorder, bus, only)

    const sleep = vi.fn(async (): Promise<void> => {})
    const record = await disposeActiveState(state, { logger: recorder.logger, sleep })
    await pending

    // No child was open, so waiting could only delay the unload: absent `drain`
    // is the honest record, and it keeps an ordinary disable instant.
    expect(sleep).not.toHaveBeenCalled()
    expect(record.drain).toBeUndefined()
    expect(record.activeRuns).toBe(1)
    expect(run.cancel).toHaveBeenCalled()
  })

  it('skips the window when the process is shutting down', async () => {
    const recorder = new Recorder()
    const bus = new Bus()
    const engine = new HangingEngine()
    const state = createActiveState()
    state.signals = ['SIGTERM']
    const only = session('sess-drain-shutdown')
    const { pending, run } = await startRun(state, engine, recorder, bus, only)
    openChild(bus, run)

    const sleep = vi.fn(async (): Promise<void> => {})
    const record = await disposeActiveState(state, { logger: recorder.logger, sleep })
    await pending

    // A process on its way out gains nothing from holding its own exit open.
    expect(sleep).not.toHaveBeenCalled()
    expect(record.drain).toBeUndefined()
    expect(record.trigger).toBe('shutdown')
    expect(run.cancel).toHaveBeenCalled()
  })

  it('uses the fixed policy by default, so no caller can unbound the wait', async () => {
    const recorder = new Recorder()
    const bus = new Bus()
    const engine = new HangingEngine()
    const state = createActiveState()
    const only = session('sess-drain-default')
    const { pending, run } = await startRun(state, engine, recorder, bus, only)
    openChild(bus, run)

    const waits: number[] = []
    const record = await disposeActiveState(state, {
      logger: recorder.logger,
      sleep: async (ms: number): Promise<void> => { waits.push(ms) },
    })
    await pending

    // Pinned literals, not settings: the default probe interval (250 ms), quiet
    // period (1.5 s) and ceiling (45 s) are fixed values in `src/config.ts`, so no
    // caller can widen the wait and no reload can hide behind an unbounded one.
    expect(waits.length).toBeGreaterThan(0)
    expect(waits.every(ms => ms === 250)).toBe(true)
    // 45 s at 250 ms a step is the hard iteration bound, and a child that never
    // reports runs it out.
    expect(waits.length).toBe(180)
    expect(record.drain).toMatchObject({ openAtStart: 1, openAtEnd: 1, deadlineHit: true })
  })
})
