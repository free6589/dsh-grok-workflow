/**
 * Plugin lifecycle: unload observability, the interruption notice, per-session
 * run slots, and the deadline default (t45, from t41's diagnosis).
 *
 * What went wrong in t41, precisely: two runs in two different workspaces were
 * cancelled 573 ms apart, their reports read "was cancelled before it produced a
 * report", and nothing anywhere recorded who unloaded the plugin or how many runs
 * died. Separately, the active-run cap was process-wide, so two long runs in one
 * session refused three other sessions ("already has 2 active run(s)"), and the
 * 30-minute deadline killed two four-task runs at exactly 30m00s/30m01s.
 *
 * These tests pin the four fixes. They run `runWorkflow` and `disposeActiveState`
 * against a fake engine that only starts runs (and hangs them), because the
 * behaviour under test is the plugin's own — the engine contract is covered by
 * test/engine-contract.spec.ts and test/progress.spec.ts.
 */
import { describe, expect, it, vi } from 'vitest'
import { Session, pluginRecordOf } from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import { resolveConfig } from '../src/config.js'
import { DISPOSE_RECORD, callSiteFrames, classifyDisposeTrigger } from '../src/records.js'
import {
  activeCountOfSession,
  createActiveState,
  disposeActiveState,
  formatElapsed,
  runWorkflow,
} from '../src/run.js'
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
  readonly startCalls: WorkflowStartRequest[] = []
  /** When set, `start` waits for it — a run that is admitted but not yet running. */
  gate: Promise<void> | undefined

  async start(request: WorkflowStartRequest): Promise<HangingRun> {
    this.startCalls.push(request)
    if (this.gate !== undefined) await this.gate
    const run = new HangingRun(request, this.runs.length + 1)
    this.runs.push(run)
    return run
  }
}

/** The slice of a cordis context these two entry points actually touch. */
function context(engine: HangingEngine, recorder: Recorder): never {
  return {
    workflowEngine: engine,
    logger: () => recorder.logger,
  } as never
}

function agentOf(session: Session): never {
  return { session } as never
}

function session(id: string): Session {
  return Session.create(id as SessionId)
}

function configOf(overrides: Record<string, unknown> = {}): ReturnType<typeof resolveConfig> {
  return resolveConfig(overrides as never)
}

/** Start one run and wait until the engine has handed back a run object. */
async function start(
  state: ActiveState,
  engine: HangingEngine,
  recorder: Recorder,
  session_: Session,
  overrides: Record<string, unknown> = {},
): Promise<{ pending: Promise<RunOutcome> }> {
  const target = state.runs.size + 1
  const pending = runWorkflow({
    ctx: context(engine, recorder),
    config: configOf(overrides),
    state,
    logger: recorder.logger,
    agent: agentOf(session_),
    objective: 'ship the thing',
    failureMode: 'report',
  })
  // Wait for the plugin to have *registered* this run: `engine.start` returning is
  // one microtask too early, and a dispose in that window would cancel nothing.
  while (state.runs.size < target) await new Promise(resolve => { setImmediate(resolve) })
  // A bare promise returned from an async function would be adopted (awaited), so
  // the handle is boxed: the tests need the *unsettled* run, not its outcome yet.
  return { pending }
}

/** Events this plugin wrote into one real session. */
function disposeRecords(session_: Session): { v: number, activeRuns: number, runs: { runId: string, sessionId?: string, elapsedMs: number }[], trigger: string, callSite: string[], notices: number }[] {
  return session_.ownEvents()
    .map(event => pluginRecordOf(event))
    .filter(record => record !== undefined && record.type === DISPOSE_RECORD)
    .map(record => record!.data as never)
}

/**
 * Every notice row the plugin appended: an assistant message attributed to the
 * plugin's `workflow-notice` model, carrying the `[grok-workflow]` prefix.
 */
function noticeTexts(session_: Session): string[] {
  const texts: string[] = []
  for (const event of session_.ownEvents()) {
    if ((event as { type?: string }).type !== 'assistant/message') continue
    const data = (event as { data?: { message?: { source?: { model?: string }, content?: { text?: string }[] } } }).data
    if (data?.message?.source?.model !== 'workflow-notice') continue
    const text = (data.message.content ?? []).map(block => block.text ?? '').join('')
    texts.push(text)
  }
  return texts
}

const MANAGEMENT_STACK = [
  'Error: dsh-grok-workflow disposer',
  '    at disposer (/profile/node_modules/@deepseek-ai/dsh-plugin-manager/lib/index.js:412:21)',
  '    at Context.#dispose (/node_modules/@deepseek-ai/cordis/lib/index.js:900:11)',
].join('\n')

/* ------------------------------------------------- 1. dispose is observable -- */

describe('unload is observable (P0-1)', () => {
  it('treats an observed shutdown signal as proof, whatever the stack says', () => {
    expect(classifyDisposeTrigger(MANAGEMENT_STACK, ['SIGTERM'])).toBe('shutdown')
    expect(classifyDisposeTrigger('', ['SIGINT'])).toBe('shutdown')
  })

  it('names the trigger from the disposal call path, and says so when it cannot', () => {
    expect(classifyDisposeTrigger(MANAGEMENT_STACK)).toBe('management')
    expect(classifyDisposeTrigger('at process.exit (node:internal/process/per_thread:210:13)')).toBe('shutdown')
    expect(classifyDisposeTrigger('at FakeContext.dispose (/repo/test/plugin-lifecycle.spec.ts:99:5)')).toBe('test')
    expect(classifyDisposeTrigger('at somethingElse (file:///x.js:1:1)')).toBe('unknown')
    // The measured management path goes through the loader, not the manager name.
    expect(classifyDisposeTrigger('at updatePlugin (/x/@deepseek-ai/cordis-plugin-loader/lib/index.js:120:9)')).toBe('management')
    expect(classifyDisposeTrigger('')).toBe('unknown')
  })

  it('keeps a bounded, redacted head of the disposal stack', () => {
    const frames = callSiteFrames(MANAGEMENT_STACK)
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.length).toBeLessThanOrEqual(12)
    expect(frames[0]).toContain('plugin-manager')
    expect(callSiteFrames(undefined)).toEqual([])
  })

  it('records what it cancelled before it cancels it', async () => {
    const recorder = new Recorder()
    const engine = new HangingEngine()
    const state = createActiveState()
    const first = session('sess-dispose-a')
    const second = session('sess-dispose-b')
    const { pending: pendingA } = await start(state, engine, recorder, first)
    const { pending: pendingB } = await start(state, engine, recorder, second)

    const record = await disposeActiveState(state, { logger: recorder.logger, callSite: MANAGEMENT_STACK })

    // The record travels with the cancellation: both runs are named, oldest first.
    expect(record.activeRuns).toBe(2)
    expect(record.trigger).toBe('management')
    expect(record.runs.map(run => run.runId)).toEqual(['run-1', 'run-2'])
    expect(record.pending).toBe(0)
    expect(record.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(record.signals).toEqual([])
    expect(record.uptimeMs).toBeGreaterThanOrEqual(0)

    // Each session gets the record for *its* run, not the other session's.
    for (const [session_, runId] of [[first, 'run-1'], [second, 'run-2']] as const) {
      const records = disposeRecords(session_)
      expect(records).toHaveLength(1)
      expect(records[0]!.runs.map(run => run.runId)).toEqual([runId])
      expect(records[0]!.activeRuns).toBe(2)
      expect(records[0]!.trigger).toBe('management')
      expect(records[0]!.callSite[0]).toContain('plugin-manager')
      expect(records[0]!.notices).toBe(1)
    }

    // And the diagnostics line carries the same facts, so a log-only reader sees them.
    expect(recorder.warnings.join('\n')).toContain('disposing with 2 active and 0 starting run(s)')
    expect(recorder.warnings.join('\n')).toContain('trigger=management')

    const [outcomeA, outcomeB] = await Promise.all([pendingA, pendingB])
    expect(outcomeA.cause).toBe('unloaded')
    expect(outcomeB.cause).toBe('unloaded')
  })

  it('distinguishes an unload cancellation from a caller cancellation', async () => {
    const recorder = new Recorder()
    const engine = new HangingEngine()
    const state = createActiveState()
    const callerStop = new AbortController()
    const pending = runWorkflow({
      ctx: context(engine, recorder),
      config: configOf(),
      state,
      logger: recorder.logger,
      agent: agentOf(session('sess-caller-stop')),
      objective: 'stop me',
      signals: [callerStop.signal],
      failureMode: 'report',
    })
    while (state.runs.size === 0) await new Promise(resolve => { setImmediate(resolve) })
    callerStop.abort()
    const outcome = await pending
    expect(outcome.cause).toBe('cancelled')
    const text = JSON.stringify(outcome.report)
    expect(text).toContain('cancelled by its caller')
    expect(text).not.toContain('because the plugin was unloaded')
  })
})

/* --------------------------------------------- 2. the one-shot interruption -- */

describe('the unload notice (P0-2, damage-based)', () => {
  it('tells the interrupted session exactly once, and says what was lost', async () => {
    const recorder = new Recorder()
    const engine = new HangingEngine()
    const state = createActiveState()
    const only = session('sess-notice')
    // Two runs in one session: the notice must still be one row, not one per run.
    const { pending: pendingA } = await start(state, engine, recorder, only)
    const { pending: pendingB } = await start(state, engine, recorder, only)
    await disposeActiveState(state, { logger: recorder.logger, callSite: MANAGEMENT_STACK })
    await Promise.all([pendingA, pendingB])

    const texts = noticeTexts(only)
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain('[grok-workflow]')
    expect(texts[0]).toContain('2 workflow runs')
    expect(texts[0]).toContain('unloaded inside a running process')
    expect(texts[0]).toContain('the host does not disclose which')
    // The user is told what the silence afterwards means, in the same breath.
    expect(texts[0]).toContain('answered')
    expect(texts[0]).toContain('mandatory workflow')
  })

  it('says the process was shutting down when a signal arrived first', async () => {
    const recorder = new Recorder()
    const engine = new HangingEngine()
    const state = createActiveState()
    state.signals = ['SIGTERM']
    const only = session('sess-signal')
    const pending = await start(state, engine, recorder, only)
    const record = await disposeActiveState(state, { logger: recorder.logger, callSite: MANAGEMENT_STACK })
    await pending

    expect(record.trigger).toBe('shutdown')
    expect(record.signals).toEqual(['SIGTERM'])
    const texts = noticeTexts(only)
    expect(texts).toHaveLength(1)
    expect(texts[0]).toContain('the process is shutting down (SIGTERM)')
    expect(texts[0]).toContain('not a plugin setting')
  })

  it('stays completely silent for an idle unload — the case a user causes on purpose', async () => {
    const recorder = new Recorder()
    const state = createActiveState()
    const idle = session('sess-idle')
    const record = await disposeActiveState(state, { logger: recorder.logger, callSite: MANAGEMENT_STACK })

    expect(record.activeRuns).toBe(0)
    expect(record.notices).toBe(0)
    expect(noticeTexts(idle)).toEqual([])
    expect(disposeRecords(idle)).toEqual([])
    // One diagnostics line, at info level: the log keeps the fact, the user is not nagged.
    expect(recorder.infos.join('\n')).toContain('disposed with no active run')
    expect(recorder.warnings).toEqual([])
  })

  it('cancels the runs even when the session refuses both the notice and the record', async () => {
    const recorder = new Recorder()
    const engine = new HangingEngine()
    const state = createActiveState()
    const real = session('sess-refusing-dispose')
    const refusing = new Proxy(real, {
      get(target, property, receiver) {
        if (property === 'append') {
          return (): never => { throw new Error('this session is closed to writes') }
        }
        return Reflect.get(target, property, receiver)
      },
    })
    const pending = runWorkflow({
      ctx: context(engine, recorder),
      config: configOf({ showProgress: false }),
      state,
      logger: recorder.logger,
      agent: agentOf(refusing as never),
      objective: 'refuse the bookkeeping',
      failureMode: 'report',
    })
    while (state.runs.size === 0) await new Promise(resolve => { setImmediate(resolve) })

    const record = await disposeActiveState(state, { logger: recorder.logger, callSite: MANAGEMENT_STACK })
    const outcome = await pending

    expect(record.activeRuns).toBe(1)
    expect(record.notices).toBe(0)
    expect(outcome.cause).toBe('unloaded')
    expect(engine.runs[0]!.cancel).toHaveBeenCalled()
    expect(engine.runs[0]!.dispose).toHaveBeenCalled()
    expect(recorder.warnings.join('\n')).toContain('unload notice not written')
    expect(recorder.warnings.join('\n')).toContain('dispose record not persisted')
  })
})

/* ------------------------------------------------ 3. per-session run slots -- */

describe('the active-run cap is per session (P1-3)', () => {
  it('one session can no longer starve every other session', async () => {
    const recorder = new Recorder()
    const engine = new HangingEngine()
    const state = createActiveState()
    const busy = session('sess-busy')
    const other = session('sess-other')

    const { pending: pendingA } = await start(state, engine, recorder, busy, { maxActiveRuns: 2 })
    const { pending: pendingB } = await start(state, engine, recorder, busy, { maxActiveRuns: 2 })
    // Before t45 this third run was refused *and* so was every other session's,
    // because the cap counted the whole process. Now only this session is full.
    await expect(runWorkflow({
      ctx: context(engine, recorder),
      config: configOf({ maxActiveRuns: 2 }),
      state,
      logger: recorder.logger,
      agent: agentOf(busy),
      objective: 'third in the busy session',
      failureMode: 'report',
    })).rejects.toThrow(/maxActiveRuns is 2 per session/)
    // And the refusal names the holders with their age, so the user can act.
    await expect(runWorkflow({
      ctx: context(engine, recorder),
      config: configOf({ maxActiveRuns: 2 }),
      state,
      logger: recorder.logger,
      agent: agentOf(busy),
      objective: 'third again',
      failureMode: 'report',
    })).rejects.toThrow(/holding: run run-1 \(running [0-9]+(?:ms|s|m[0-9]{2}s|h[0-9]{2}m)\), run run-2/)

    const { pending: pendingC } = await start(state, engine, recorder, other, { maxActiveRuns: 2 })
    expect(engine.runs).toHaveLength(3)
    expect(activeCountOfSession(state, 'sess-busy')).toBe(2)
    expect(activeCountOfSession(state, 'sess-other')).toBe(1)

    await disposeActiveState(state, { logger: recorder.logger, callSite: MANAGEMENT_STACK })
    await Promise.all([pendingA, pendingB, pendingC])
  })

  it('counts an admitted run that has not started yet against its own session only', async () => {
    const recorder = new Recorder()
    const engine = new HangingEngine()
    const state = createActiveState()
    const gated = session('sess-starting')
    const other = session('sess-starting-other')

    let release!: () => void
    engine.gate = new Promise(resolve => { release = resolve })
    const pendingA = runWorkflow({
      ctx: context(engine, recorder),
      config: configOf({ maxActiveRuns: 1 }),
      state,
      logger: recorder.logger,
      agent: agentOf(gated),
      objective: 'starting slowly',
      failureMode: 'report',
    })
    while (engine.startCalls.length === 0) await new Promise(resolve => { setImmediate(resolve) })
    expect(activeCountOfSession(state, 'sess-starting')).toBe(1)
    await expect(runWorkflow({
      ctx: context(engine, recorder),
      config: configOf({ maxActiveRuns: 1 }),
      state,
      logger: recorder.logger,
      agent: agentOf(gated),
      objective: 'second in the same session while starting',
      failureMode: 'report',
    })).rejects.toThrow(/already has 1 active run\(s\) in this session/)
    // A different session is unaffected by the first session's starting run.
    expect(activeCountOfSession(state, 'sess-starting-other')).toBe(0)

    engine.gate = undefined
    release()
    while (state.runs.size === 0) await new Promise(resolve => { setImmediate(resolve) })
    const { pending: pendingB } = await start(state, engine, recorder, other, { maxActiveRuns: 1 })
    expect(engine.runs).toHaveLength(2)

    await disposeActiveState(state, { logger: recorder.logger, callSite: MANAGEMENT_STACK })
    await Promise.all([pendingA, pendingB])
  })

  it('keeps a process-wide backstop and names the sessions holding it', async () => {
    const recorder = new Recorder()
    const engine = new HangingEngine()
    const state = createActiveState()
    const first = session('sess-total-a')
    const second = session('sess-total-b')
    const third = session('sess-total-c')
    const { pending: pendingA } = await start(state, engine, recorder, first, { maxActiveRuns: 2, maxActiveRunsTotal: 2 })
    const { pending: pendingB } = await start(state, engine, recorder, second, { maxActiveRuns: 2, maxActiveRunsTotal: 2 })

    await expect(runWorkflow({
      ctx: context(engine, recorder),
      config: configOf({ maxActiveRuns: 2, maxActiveRunsTotal: 2 }),
      state,
      logger: recorder.logger,
      agent: agentOf(third),
      objective: 'third session',
      failureMode: 'report',
    })).rejects.toThrow(/maxActiveRunsTotal is 2/)
    await expect(runWorkflow({
      ctx: context(engine, recorder),
      config: configOf({ maxActiveRuns: 2, maxActiveRunsTotal: 2 }),
      state,
      logger: recorder.logger,
      agent: agentOf(third),
      objective: 'third session again',
      failureMode: 'report',
    })).rejects.toThrow(/holding: session sess-total-a \(1 run\(s\), oldest/)

    await disposeActiveState(state, { logger: recorder.logger, callSite: MANAGEMENT_STACK })
    await Promise.all([pendingA, pendingB])
  })

  it('formats elapsed time the way a refusal has to read', () => {
    expect(formatElapsed(820)).toBe('820ms')
    expect(formatElapsed(3_200)).toBe('3s')
    expect(formatElapsed(878_000)).toBe('14m38s')
    expect(formatElapsed(3_600_000)).toBe('1h00m')
    expect(formatElapsed(-5)).toBe('0ms')
  })
})

/* ---------------------------------------------------- 4. the deadline default -- */

describe('the deadline default (P1-4)', () => {
  it('is 60 minutes, not the 30 that killed two real runs at 30m00s', () => {
    expect(configOf().timeoutMs).toBe(3_600_000)
    // The hard ceiling is unchanged, so a profile can still raise one objective.
    expect(configOf({ timeoutMs: 86_400_000 }).timeoutMs).toBe(86_400_000)
  })

  it('reports the deadline it actually used', async () => {
    const recorder = new Recorder()
    const engine = new HangingEngine()
    const state = createActiveState()
    const pending = runWorkflow({
      ctx: context(engine, recorder),
      config: configOf({ timeoutMs: 1_000, maxActiveRuns: 2 }),
      state,
      logger: recorder.logger,
      agent: agentOf(session('sess-deadline')),
      objective: 'outlive the deadline',
      failureMode: 'report',
    })
    while (state.runs.size === 0) await new Promise(resolve => { setImmediate(resolve) })
    const outcome = await pending
    expect(outcome.cause).toBe('timeout')
    expect(JSON.stringify(outcome.report)).toContain('1000 ms deadline')
    await disposeActiveState(state, { logger: recorder.logger })
  })
})
