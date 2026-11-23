/**
 * Round 70 / experience pack — five reader-facing fixes, pinned offline.
 *
 * Each test below fails on the pre-round-70 code and passes on this one; the
 * red/green pairs are recorded in `.rsi/evidence/round-070/`.
 *
 * 1. A cancelled run says *why* in everyday words and what survived — an unload
 *    used to read as "stopped on purpose", and nothing said "resend continues".
 * 2. The guard's conclusion is in the answer body: one fixed tail line naming the
 *    findings, that no subagent was terminated, and who ended the round.
 * 3. Child calls that were still running when the run stopped are written into the
 *    checkpoint (child id + last observed step), and the report says so.
 * 4. `/grok status` answers with the last run's state, cause, guard conclusion,
 *    resumable checkpoint and unfinished list.
 * 5. The archive can be corrected: a later round that carried the work through
 *    leaves a `superseded by` link on the earlier cancelled/failed round.
 *
 * Boundaries: real report validator, real delivery composer, real archive writer,
 * real checkpoint writer/reader and a real `Session`; the engine and the model are
 * not involved (no clock, no network).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Session } from '@deepseek-ai/dsh-session'
import { grokCommand } from '../src/command.js'
import { deliverReport, machineLedger } from '../src/delivery/index.js'
import { FIXED_MAX_RETRIES, resolveConfig } from '../src/config.js'
import { assertWorkflowReport, guardLine, renderReport, stopNarration } from '../src/report.js'
import { maxTotalAgentsFor, routeBudgetFor } from '../src/script.js'
import type { RoleName, WorkflowReport } from '../src/types.js'
import { execution, failingVerification, task, verification } from './fixtures.js'
import { appendArchiveEntry, appendSupersedeEntry, formatArchiveEntry, readArchive, recentArchiveDigest, supersessionMap } from '../src/memory/archive.js'
import { createMemoryArchiver } from '../src/memory/recorder.js'
import { buildMinContextDigest, buildCheckpoint, assertCheckpoint } from '../src/checkpoint/schema.js'
import { createCheckpointRecorder, readLatestCheckpointSync } from '../src/checkpoint/wiring.js'
import { createActiveState, runWorkflow } from '../src/run.js'
import { createEngineHarness, type ChildAnswer, type ChildCall } from './engine-harness.js'
import { PROGRESS_AGENT_START, PROGRESS_RUN_END, PROGRESS_RUN_START } from '../src/records.js'

const LIMITS = { maxConcurrency: 2, maxTasks: 4 } as const
const config = resolveConfig(LIMITS)
const OBJECTIVE = '查一下新加坡这周的天气并给出出行建议'

/** Directory the checkpoint reader resolves, pinned per test so nothing touches $HOME. */
let scratch: string
let previousCheckpointDir: string | undefined
let previousArchiveDir: string | undefined

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'grok-exp-pack-'))
  previousCheckpointDir = process.env.GROK_WORKFLOW_CHECKPOINT_DIR
  previousArchiveDir = process.env.GROK_WORKFLOW_MEMORY_DIR
  process.env.GROK_WORKFLOW_CHECKPOINT_DIR = join(scratch, 'checkpoints')
  process.env.GROK_WORKFLOW_MEMORY_DIR = join(scratch, 'memory')
})

afterEach(() => {
  if (previousCheckpointDir === undefined) delete process.env.GROK_WORKFLOW_CHECKPOINT_DIR
  else process.env.GROK_WORKFLOW_CHECKPOINT_DIR = previousCheckpointDir
  if (previousArchiveDir === undefined) delete process.env.GROK_WORKFLOW_MEMORY_DIR
  else process.env.GROK_WORKFLOW_MEMORY_DIR = previousArchiveDir
  rmSync(scratch, { recursive: true, force: true })
})

/* --------------------------------------------------------------- fixtures -- */

/** A legal PARTIAL report: one task verified, one not — the shape an unload leaves. */
function stoppedReport(cause: 'unloaded' | 'caller' | 'deadline' | 'engine' = 'unloaded'): WorkflowReport {
  const ok = task('a', ['天气已核验'])
  const aborted = { ...task('b', ['酒店价格已核验']), title: '酒店价格' }
  const checked = verification(ok)
  const built = assertWorkflowReport({
    schemaVersion: 'grok-workflow/v1',
    status: 'partial',
    objective: OBJECTIVE,
    plan: { source: 'caller', tasks: [ok, aborted], error: '' },
    tasks: [
      {
        ...ok,
        status: 'verified',
        attempts: [{ attempt: 1, execution: execution('查到新加坡本周多雨'), verification: checked, passed: true, error: '' }],
        error: '',
      },
      {
        ...aborted,
        status: 'failed',
        attempts: [{
          attempt: 1,
          execution: execution('', { status: 'failed' }),
          verification: failingVerification(aborted, '价格来源打不开'),
          passed: false,
          error: 'interrupted: the run was stopped before this task produced a verified result',
        }],
        error: 'interrupted: the run was stopped before this task produced a verified result',
      },
    ],
    confirmed: [{ taskId: 'a', criterion: '天气已核验', evidence: checked.criteria[0]!.evidence }],
    incomplete: [{
      taskId: 'b',
      reason: 'interrupted: the run was stopped before this task produced a verified result',
      category: 'cancelled',
    }],
    // The error phase and category are what `src/run.ts` records for each cause, and
    // the delivery layer reads the category back — so the fixture has to be shaped
    // like the real exit, not like a generic failure.
    errors: [{
      phase: cause === 'unloaded' ? 'Unloaded' : cause === 'deadline' ? 'Timeout' : 'Cancelled',
      message: 'the run was stopped in flight',
      category: cause === 'deadline' || cause === 'engine' ? 'infrastructure' : 'cancelled',
    }],
    uncertainties: [],
    routing: { planner: [], worker: [], verifier: [], supervisor: [], synthesizer: [] },
    routes: [],
    synthesis: { mode: 'deterministic' },
    limits: {
      maxConcurrency: 2,
      maxRetries: FIXED_MAX_RETRIES,
      maxTasks: 4,
      maxTotalAgents: maxTotalAgentsFor(2, FIXED_MAX_RETRIES, routeBudgetFor(config)),
    },
  }, OBJECTIVE, config)
  // `stop` is written by `src/run.ts`, after validation — the same order the run uses.
  return { ...built, stop: { cause } }
}

/** A legal COMPLETED report, for the guard line's "nobody cancelled" half. */
function completedReport(): WorkflowReport {
  const only = task('a', ['天气已核验'])
  const checked = verification(only)
  return {
    ...assertWorkflowReport({
      schemaVersion: 'grok-workflow/v1',
      status: 'completed',
      objective: OBJECTIVE,
      plan: { source: 'caller', tasks: [only], error: '' },
      tasks: [{
        ...only,
        status: 'verified',
        attempts: [{ attempt: 1, execution: execution('查到新加坡本周多雨'), verification: checked, passed: true, error: '' }],
        error: '',
      }],
      confirmed: [{ taskId: 'a', criterion: '天气已核验', evidence: checked.criteria[0]!.evidence }],
      incomplete: [],
      errors: [],
      uncertainties: [],
      synthesis: { mode: 'deterministic', summary: '新加坡本周多雨，出行请带伞。' },
      limits: {
        maxConcurrency: 2,
        maxRetries: FIXED_MAX_RETRIES,
        maxTasks: 4,
        maxTotalAgents: maxTotalAgentsFor(1, FIXED_MAX_RETRIES, routeBudgetFor(config)),
      },
    }, OBJECTIVE, config),
    guard: { findings: 0, terminated: 0 },
  }
}

/** One child call record as the checkpoint schema accepts it. */
function checkpointInput(overrides: {
  status?: 'running' | 'completed' | 'partial' | 'failed' | 'cancelled'
  inFlight?: { seq: number, childId?: string, lastStep: string }[]
  cause?: string
} = {}) {
  return {
    run: {
      runId: 'run-exp-1',
      objective: OBJECTIVE,
      status: overrides.status ?? 'cancelled',
      ...overrides.cause === undefined ? {} : { cause: overrides.cause },
    },
    plan: { source: 'caller' as const, tasks: [{ id: 'a', title: '天气', writesPaths: null }, { id: 'b', title: '酒店价格', writesPaths: null }] },
    tasks: [
      { id: 'a', title: '天气', status: 'verified' as const, attempts: 1 },
      { id: 'b', title: '酒店价格', status: 'pending' as const, attempts: 0 },
    ],
    ...overrides.inFlight === undefined ? {} : { inFlight: overrides.inFlight },
    watchdog: { cancelled: overrides.status === 'cancelled' },
  }
}

/* ------------------------------------------------------- 1. plain-language -- */

describe('1 — a stopped run says why, what survived, and that resending continues', () => {
  it('names the unload in everyday words and never blames the reader', () => {
    const text = deliverReport(stoppedReport('unloaded'), { lang: 'zh' }).human
    // The cause, stated as the reader's own question asks it.
    expect(text).toContain('插件在运行中被卸载')
    expect(text).toContain('不是超时')
    expect(text).toContain('也不是你手动停的')
    // The tally: one finished, one not.
    expect(text).toContain('已经做完 1 项')
    expect(text).toContain('还剩 1 项没做完')
    // The instruction, in the reader's own words.
    expect(text).toContain('原样再发一次就接着跑')
    // And the wrong-actor advice it replaced is gone.
    expect(text).not.toContain('这次是被主动停下的')
  })

  it('does the same in English, and keeps the category advice for a deadline', () => {
    const english = deliverReport(stoppedReport('unloaded'), { lang: 'en' }).human
    expect(english).toContain('the plugin was unloaded')
    expect(english).toContain('not a timeout')
    expect(english).toContain('1 item(s) were finished')
    // A deadline keeps its existing advice: that text already says "not your fault".
    const deadline = deliverReport(stoppedReport('deadline'), { lang: 'zh' }).human
    expect(deadline).toContain('这次卡在外部服务或时限上')
  })

  it('renders the same account in the machine ledger', () => {
    const ledger = machineLedger(stoppedReport('caller'))
    expect(ledger).toContain('Stop: You stopped this run on purpose')
  })

  it('returns nothing at all for a report that recorded no stop', () => {
    expect(stopNarration(completedReport(), 'zh')).toBeUndefined()
  })
})

/* ------------------------------------------------------------- 2. guard -- */

describe('2 — the guard conclusion is a fixed line in the report body', () => {
  it('closes the human block with findings, "nothing killed", and who cancelled', () => {
    const text = deliverReport(stoppedReport('unloaded'), {
      lang: 'zh',
      guard: { findings: 2, terminated: 0, by: 'unloaded' },
    }).human
    expect(text.split('\n').at(-1)).toBe('守卫：2 条发现，未终止任何子代理；本轮由插件卸载取消。')
  })

  it('says nobody cancelled a run that finished on its own, in both languages', () => {
    const zh = guardLine({ findings: 0, terminated: 0, by: 'none' }, 'zh')
    expect(zh).toBe('守卫：0 条发现，未终止任何子代理；本轮无人取消（正常跑完）。')
    const en = guardLine({ findings: 3, terminated: 0, by: 'deadline' }, 'en')
    expect(en).toBe('Guard: 3 finding(s), no subagent was terminated; cancelled by the deadline.')
  })

  it('renders off the report itself, so a later reader prints the same line', () => {
    const report: WorkflowReport = { ...completedReport(), guard: { findings: 1, terminated: 0 } }
    expect(renderReport(report).split('\n').at(-1))
      .toBe('Guard: 1 finding(s), no subagent was terminated; nobody cancelled this round (it finished on its own).')
    expect(machineLedger(report)).toContain('Guard: 1 finding(s)')
  })

  it('does not invent a guard line for a report that carries no settlement', () => {
    const report = stoppedReport('caller')
    expect(renderReport(report)).not.toContain('Guard:')
  })
})

describe('2 — end to end: a real run puts the guard line in the answer it delivers', () => {
  it('closes the delivered block and records the settlement on the report', async () => {
    const only = task('a', ['天气已核验'])
    const checked = verification(only)
    const engine = createEngineHarness((call: ChildCall): ChildAnswer => {
      if (call.prompt.includes('You are the execution agent')) return { structured: execution('查到新加坡本周多雨') }
      return { structured: checked }
    })
    const outcome = await runWorkflow({
      ctx: engine.ctx as never,
      config: resolveConfig({ maxConcurrency: 1, maxTasks: 2 }),
      state: createActiveState(),
      logger: { warn: () => {} },
      agent: { session: Session.create('sess-exp-pack-guard' as never) } as never,
      objective: OBJECTIVE,
      callerTasks: [only],
      failureMode: 'report',
    })
    expect(outcome.ok).toBe(true)
    // The data and the text agree, and the line is the last one a reader sees.
    expect(outcome.report.guard).toEqual({ findings: 0, terminated: 0 })
    expect(outcome.delivery?.human.split('\n').at(-1)).toBe('守卫：0 条发现，未终止任何子代理；本轮无人取消（正常跑完）。')
  })
})

/* --------------------------------------------------- 3. in-flight children -- */

describe('3 — child calls cut by the stop are recorded, and the report says so', () => {
  it('keeps child id and last observed step in the checkpoint', () => {
    const checkpoint = buildCheckpoint(checkpointInput({
      inFlight: [{ seq: 2, childId: 'child-42', lastStep: '执行' }],
    }), 1_700_000_000_000)
    expect(checkpoint.inFlight?.[0]).toMatchObject({ seq: 2, childId: 'child-42', lastStep: '执行' })
    // The read side accepts it, checksum included.
    const reread = assertCheckpoint(JSON.parse(JSON.stringify(checkpoint)))
    expect(reread.inFlight?.[0]?.childId).toBe('child-42')
    expect(reread.inFlight?.[0]?.lastStep).toBe('执行')
  })

  it('leaves the section out entirely when no child was in flight', () => {
    const checkpoint = buildCheckpoint(checkpointInput(), 1_700_000_000_000)
    expect('inFlight' in checkpoint).toBe(false)
    expect(checkpoint.inFlight).toBeUndefined()
  })

  it('writes the in-flight child into the checkpoint on unload, and status can read it back', async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>()
    const eventSource = {
      on(name: string, listener: (...args: unknown[]) => void) {
        listeners.set(name, listener)
        return () => { listeners.delete(name) }
      },
    }
    const recorder = createCheckpointRecorder({
      eventSource,
      objective: OBJECTIVE,
      sessionId: 'session-exp',
      limits: { maxConcurrency: 2, maxRetries: 1, maxTasks: 4 },
    })
    recorder.adopt({ id: 'run-exp-1', meta: { name: '天气与酒店' } })
    // The engine's own payload shape: a run info first, then the `WorkflowAgentInfo`
    // member (seq, label, phase, childId) — see `emitWorkflowEvent('workflow/agent-start', info, agent)`.
    listeners.get('workflow/agent-start')?.({ id: 'run-exp-1' }, { seq: 1, label: '任务 2 · 酒店价格', phase: '执行', childId: 'child-42' })
    expect(recorder.stats.inFlight).toBe(1)
    const written = await recorder.unload('the grok-workflow plugin was unloaded')
    expect(written?.ok).toBe(true)
    const stored = readLatestCheckpointSync({ sessionId: 'session-exp' })
    expect(stored?.checkpoint.run.status).toBe('cancelled')
    expect(stored?.checkpoint.inFlight).toEqual([
      { seq: 1, childId: 'child-42', lastStep: '执行', startedAtMs: expect.any(Number) },
    ])
    recorder.dispose()
  })

  it('tells the reader how many child calls were still running', () => {
    const text = deliverReport(stoppedReport('unloaded'), { lang: 'zh', inFlight: 2 }).human
    expect(text).toContain('停下时还有 2 个子代理在跑')
  })
})

/* ------------------------------------------------------------- 4. status -- */

describe('4 — /grok status answers from the session journal and the checkpoint', () => {
  function realSession(id: string): Session {
    return Session.create(id as never)
  }

  it('reports an empty session honestly instead of guessing', () => {
    const result = grokCommand().handler({ agent: { session: realSession('status-empty') }, rawInput: 'status' })
    expect(result.kind).toBe('success')
    expect(result.text).toContain('Grok workflow status:')
    expect(result.text).toContain('- Toggle: never set in this session')
    expect(result.text).toContain('Last run: none recorded in this session')
  })

  it('reports the run state, the guard conclusion and the in-flight child', () => {
    const session = realSession('status-run')
    // The plugin's own record types, written through the real session so the fold
    // reads exactly what a live run leaves behind.
    const append = session.append.bind(session) as unknown as (type: string, data: Record<string, unknown>) => unknown
    append(PROGRESS_RUN_START, { runId: 'run-exp-1', name: '天气与酒店' })
    append(PROGRESS_AGENT_START, { runId: 'run-exp-1', seq: 1, label: '任务 2 · 酒店价格', phase: '执行', childId: 'child-42' })
    append('tool-workflow/guardian-end', { runId: 'run-exp-1', cancelled: false, findingCount: 2 })
    append(PROGRESS_RUN_END, { runId: 'run-exp-1', stopReason: 'cancelled' })
    const result = grokCommand().handler({ agent: { session }, rawInput: 'status' })
    expect(result.text).toContain('Last run: 天气与酒店 (run-exp-1)')
    expect(result.text).toContain('- State: cancelled')
    expect(result.text).toContain('- Guard: 2 finding(s); it never terminated a subagent')
    expect(result.text).toContain('child-42 (执行)')
  })

  it('points at the resumable checkpoint and lists what is unfinished', async () => {
    const { writeCheckpoint } = await import('../src/checkpoint/writer.js')
    const file = join(process.env.GROK_WORKFLOW_CHECKPOINT_DIR!, 'run-exp-1.json')
    const sealed = buildCheckpoint({
      ...checkpointInput({ status: 'cancelled', cause: 'the grok-workflow plugin was unloaded' }),
      run: { runId: 'run-exp-1', objective: OBJECTIVE, status: 'cancelled' as const, sessionId: 'status-resume', name: '天气与酒店', cause: 'the grok-workflow plugin was unloaded' },
      inFlight: [{ seq: 1, childId: 'child-42', lastStep: '执行' }],
    }, 1_700_000_000_000)
    await writeCheckpoint(file, {
      run: sealed.run,
      plan: sealed.plan,
      tasks: sealed.tasks,
      ...sealed.inFlight === undefined ? {} : { inFlight: sealed.inFlight },
      watchdog: sealed.watchdog,
      limits: { maxConcurrency: 2, maxRetries: 1, maxTasks: 4 },
      time: sealed.time,
    })
    const session = realSession('status-resume')
    const result = grokCommand().handler({ agent: { session }, rawInput: 'status' })
    expect(result.text).toContain('- Resumable checkpoint: cancelled')
    expect(result.text).toContain('Checkpointed in-flight calls: child-42 — 执行')
    expect(result.text).toContain('- Unfinished (1): b')
    expect(result.text).toContain('send the same request again')
    // The file the status line quotes is a real, checksummed checkpoint.
    const sealedText = readFileSync(file, 'utf8')
    expect(sealedText).toContain('"checksum"')
    expect(sealedText).toContain('"inFlight"')
  })

  it('never writes the toggle', () => {
    const session = realSession('status-nowrite')
    const before = session.ownEvents().length
    grokCommand().handler({ agent: { session }, rawInput: 'status' })
    expect(session.ownEvents().length).toBe(before)
  })
})

/* ------------------------------------------------------------ 5. archive -- */

describe('5 — the ledger can be corrected with a superseded-by link', () => {
  it('appends a correction and reads it back as one', () => {
    appendArchiveEntry({
      v: 1, id: 'run:old', kind: 'round', at: new Date(1_700_000_000_000).toISOString(), atMs: 1_700_000_000_000,
      runId: 'old', sessionId: 's1', status: 'cancelled', summary: 'the run was cancelled before it finished',
    })
    const written = appendSupersedeEntry({ supersedes: 'run:old', supersededBy: 'run:new', sessionId: 's1', reason: 'a later round ended completed' })
    expect(written.written).toBe(true)
    const entries = readArchive()
    const correction = entries.find(entry => entry.id === 'supersede:run:old:run:new')
    expect(correction?.supersedes).toBe('run:old')
    expect(correction?.supersededBy).toBe('run:new')
    expect(supersessionMap(entries).get('run:old')?.by).toBe('run:new')
    // Repeating the same correction is a no-op, by identity.
    expect(appendSupersedeEntry({ supersedes: 'run:old', supersededBy: 'run:new' }).written).toBe(false)
    // A correction with a missing side is refused, never written as a dangling link.
    expect(appendSupersedeEntry({ supersedes: '', supersededBy: 'run:new' }).reason).toBe('invalid')
  })

  it('renders the link on the correction and on the round it corrects', () => {
    appendArchiveEntry({
      v: 1, id: 'run:old', kind: 'round', at: new Date(1_700_000_000_000).toISOString(), atMs: 1_700_000_000_000,
      runId: 'old', status: 'failed', summary: 'the run failed',
    })
    appendSupersedeEntry({ supersedes: 'run:old', supersededBy: 'run:new' })
    const digested = recentArchiveDigest()
    expect(digested).toContain('superseded by: run:new')
    const correction = readArchive().find(entry => entry.supersedes === 'run:old')!
    expect(formatArchiveEntry(correction)).toContain('supersedes: run:old → replaced by run:new')
  })

  it('writes the link automatically when a later round carries the work through', () => {
    const logger = { warnings: [] as string[], warn(message: string) { this.warnings.push(message) } }
    const archiver = createMemoryArchiver({ logger, now: () => 1_700_000_000_000 })
    archiver.round({
      runId: 'run-old', sessionId: 's1', objective: OBJECTIVE, status: 'cancelled',
      cause: 'unloaded', summary: 'stopped when the plugin unloaded',
    })
    archiver.round({
      runId: 'run-new', sessionId: 's1', objective: OBJECTIVE, status: 'completed',
      summary: 'finished the same request',
    })
    archiver.dispose()
    const corrections = readArchive().filter(entry => entry.supersedes === 'run:run-old')
    expect(corrections.length).toBe(1)
    expect(corrections[0]!.supersededBy).toBe('run:run-new')
    expect(logger.warnings).toEqual([])
  })

  it('does not supersede anything when the later round also failed', () => {
    const archiver = createMemoryArchiver({ logger: { warn: () => {} } })
    archiver.round({ runId: 'run-a', sessionId: 's1', objective: OBJECTIVE, status: 'failed', summary: 'nothing verified' })
    archiver.round({ runId: 'run-b', sessionId: 's1', objective: OBJECTIVE, status: 'failed', summary: 'still nothing verified' })
    archiver.dispose()
    expect(readArchive().filter(entry => entry.supersedes !== undefined)).toEqual([])
  })
})

/* --------------------------------------------------------------- sanity -- */

describe('the fixtures this file rests on', () => {
  it('builds a partial report the real validator accepts', () => {
    const report = stoppedReport()
    expect(report.status).toBe('partial')
    expect(report.tasks.filter(row => row.status === 'verified').length).toBe(1)
  })

  it('keeps the checkpoint digest builder usable for a caller-shaped input', () => {
    expect(buildMinContextDigest({ objective: OBJECTIVE, tasks: [], evidence: [] })).toContain(OBJECTIVE)
  })

  it('names the routed roles the report renders', () => {
    const roles: RoleName[] = ['planner', 'worker', 'verifier', 'supervisor', 'synthesizer']
    expect(renderReport(completedReport())).toContain('Grok workflow: COMPLETED')
    expect(roles.length).toBe(5)
  })
})
