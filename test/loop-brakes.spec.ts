import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { Session } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'
import { HARD_LIMITS, resolveConfig, takeRemovedKeys } from '../src/config.js'
import { installHeartbeatListen, readHeartbeatListenObservations } from '../src/heartbeat-listen.js'
import { LOOP_PROMPT_PREFIX, LOOP_TASK_TITLE, loopPolicyFromConfig } from '../src/loop.js'
import {
  LOOP_ROUND_RECORD,
  LOOP_TOKEN_ALLOWANCE_PER_ROUND,
  MAX_LOOP_ROUNDS_PER_DAY,
  MAX_LOOP_TOKENS,
  appendLoopRound,
  createLoopBrakes,
  dailyRoundCap,
  evaluateLoopBrakes,
  loopBrakeFacts,
  loopStopFile,
  loopTimeCapMs,
  readLoopRounds,
} from '../src/loop-brakes.js'
import type { LoopBrakeFacts, LoopBrakeInput, LoopBrakePort, LoopRoundRecord } from '../src/loop-brakes.js'
import { createActiveState } from '../src/run.js'
import type { WorkflowLogger } from '../src/run.js'

/**
 * The `agent/pre-step` payload this listener reads.
 *
 * The type used to live in `src/gate.ts`; M3.3 deleted that module, and the narrow
 * listener is the only consumer left, so the shape is stated here.
 */
interface PreStepPayload {
  agent: { session: Session }
  messages: UserMessage[]
  turn: number
  step: number
  signal: AbortSignal
}

/**
 * The loop's finite brakes and the pre-step listener that applies them.
 *
 * A heartbeat is one Host Schedule delivery and the driver owns no timer, so these
 * tests pin the two things a timer would otherwise have guaranteed: that every stop
 * condition is evaluated on the delivery itself, and that a stopped heartbeat spends
 * nothing (a `reject`, not a turn).
 *
 * Since M3.2 the listener is the narrow one (`src/heartbeat-listen.ts`): the old front
 * desk no longer routes a beat, so the cases that drive a stop install that listener
 * rather than the gate.
 */

const silent: WorkflowLogger = { warn: () => {}, info: () => {} }

function config(overrides: Record<string, unknown> = {}) {
  return resolveConfig({ grokDefault: 'on', ...overrides })
}

const NOW = Date.UTC(2026, 10, 19, 4, 0, 0)

/** Facts with every brake clear; each test overrides exactly the one it pins. */
function facts(overrides: Partial<LoopBrakeFacts> = {}): LoopBrakeFacts {
  return {
    stopFile: false,
    disposed: false,
    consecutiveFailures: 0,
    failStreak: 3,
    roundsToday: 0,
    dailyCap: 24,
    tokensSpent: 0,
    tokenCap: MAX_LOOP_TOKENS,
    elapsedMs: 0,
    timeCapMs: 10 * 60 * 60_000,
    ...overrides,
  }
}

function round(overrides: Partial<LoopRoundRecord> = {}): LoopRoundRecord {
  return {
    v: 1,
    sessionId: 'sess-loop',
    round: 1,
    day: '2026-11-19',
    at: NOW - 60 * 60_000,
    tokens: LOOP_TOKEN_ALLOWANCE_PER_ROUND,
    assistantCount: 0,
    failureStreak: 0,
    ...overrides,
  }
}

/**
 * Session double for the read-only brake path.
 *
 * `loopBrakeFacts` only reads two things — plugin records and derived messages — so the
 * double exposes exactly those and refuses to append, which keeps a test from silently
 * passing through a write it never meant to make.
 */
class LoopSession {
  readonly id: string
  readonly header = {}
  readonly rounds: LoopRoundRecord[]
  assistant: number

  constructor(options: { id?: string; assistant?: number; rounds?: LoopRoundRecord[] } = {}) {
    this.id = options.id ?? 'sess-loop'
    this.assistant = options.assistant ?? 0
    this.rounds = options.rounds ?? []
  }

  ownEvents(): unknown[] {
    return this.rounds.map((data, seq) => ({ type: LOOP_ROUND_RECORD, ignorable: true, seq, time: 0, data }))
  }

  deriveMessages(): unknown[] {
    return Array.from({ length: this.assistant }, () => ({ role: 'assistant' }))
  }

  append(): never {
    throw new Error('the read-only brake path must not append')
  }
}

function sessionOf(session: LoopSession): Session {
  return session as unknown as Session
}

function brakeInput(session: LoopSession, overrides: Partial<LoopBrakeInput> = {}): LoopBrakeInput & { policy: ReturnType<typeof loopPolicyFromConfig> } {
  return {
    sessionId: session.id,
    session: sessionOf(session),
    config: config(),
    policy: loopPolicyFromConfig(0, 0, 10, 3),
    ...overrides,
  }
}

/* ----------------------------------------------------------------- brakes -- */

describe('each brake stops on its own observed fact', () => {
  it('continues when every brake is clear', () => {
    expect(evaluateLoopBrakes(facts())).toEqual({ kind: 'continue' })
  })

  it('stops on the operator marker, and says where it looked', () => {
    const verdict = evaluateLoopBrakes(facts({ stopFile: true }))
    expect(verdict).toMatchObject({ kind: 'stop', code: 'loop/stop-file' })
    expect((verdict as { detail: string }).detail).toContain('STOP')
  })

  it('stops after a plugin unload, because the loop has no owner left', () => {
    expect(evaluateLoopBrakes(facts({ disposed: true }))).toMatchObject({ kind: 'stop', code: 'loop/disposed' })
  })

  it('stops at the failure streak and not one round earlier', () => {
    expect(evaluateLoopBrakes(facts({ consecutiveFailures: 2, failStreak: 3 })).kind).toBe('continue')
    expect(evaluateLoopBrakes(facts({ consecutiveFailures: 3, failStreak: 3 })))
      .toMatchObject({ kind: 'stop', code: 'loop/fail-streak' })
  })

  it('stops on the single-day round cap, counting the day it is given', () => {
    expect(evaluateLoopBrakes(facts({ roundsToday: 23, dailyCap: 24 })).kind).toBe('continue')
    expect(evaluateLoopBrakes(facts({ roundsToday: 24, dailyCap: 24 })))
      .toMatchObject({ kind: 'stop', code: 'loop/daily-cap' })
  })

  it('stops when the reserved token budget is spent', () => {
    expect(evaluateLoopBrakes(facts({ tokensSpent: MAX_LOOP_TOKENS - 1 })).kind).toBe('continue')
    expect(evaluateLoopBrakes(facts({ tokensSpent: MAX_LOOP_TOKENS })))
      .toMatchObject({ kind: 'stop', code: 'loop/token-cap' })
  })

  it('stops when the loop outlives its own envelope', () => {
    expect(evaluateLoopBrakes(facts({ elapsedMs: 599_999, timeCapMs: 600_000 })).kind).toBe('continue')
    expect(evaluateLoopBrakes(facts({ elapsedMs: 600_000, timeCapMs: 600_000 })))
      .toMatchObject({ kind: 'stop', code: 'loop/time-cap' })
  })

  it('lets the operator marker outrank every automatic brake', () => {
    const verdict = evaluateLoopBrakes(facts({ stopFile: true, disposed: true, consecutiveFailures: 99 }))
    expect(verdict).toMatchObject({ kind: 'stop', code: 'loop/stop-file' })
  })

  it('treats a zero cap as "no cap" rather than "already spent"', () => {
    expect(evaluateLoopBrakes(facts({ tokenCap: 0, tokensSpent: 0, timeCapMs: 0, elapsedMs: 0 })).kind).toBe('continue')
  })
})

describe('the caps are derived, so they cannot disagree with the rule', () => {
  it('bounds a day by the interval it already enforces', () => {
    expect(dailyRoundCap(60)).toBe(24)
    expect(dailyRoundCap(120)).toBe(12)
    expect(dailyRoundCap(10)).toBe(MAX_LOOP_ROUNDS_PER_DAY)
    expect(dailyRoundCap(0)).toBe(MAX_LOOP_ROUNDS_PER_DAY)
  })

  it('gives a loop one interval per round as its envelope', () => {
    expect(loopTimeCapMs(10, 60)).toBe(10 * 60 * 60_000)
    expect(loopTimeCapMs(0, 0)).toBe(60_000)
  })

  it('moves the stop marker by environment, and defaults to this repository switch', () => {
    expect(loopStopFile('/work', {})).toBe(join('/work', '.rsi', 'STOP'))
    expect(loopStopFile('/work', { GROK_WORKFLOW_STOP_FILE: '/elsewhere/STOP' })).toBe('/elsewhere/STOP')
  })
})

/* ---------------------------------------------------------------- records -- */

describe('the accounting a brake reads is the session log', () => {
  it('charges one reservation per admitted round and reports the streak', () => {
    const session = new LoopSession({ rounds: [round({ round: 1 }), round({ round: 2 })] })
    const computed = loopBrakeFacts(brakeInput(session), { stopFile: false, disposed: false, now: NOW })
    expect(computed.tokensSpent).toBe(2 * LOOP_TOKEN_ALLOWANCE_PER_ROUND)
    expect(computed.roundsToday).toBe(2)
    expect(computed.elapsedMs).toBe(60 * 60_000)
  })

  it('counts only the current local day against the daily cap', () => {
    const session = new LoopSession({
      rounds: [round({ round: 1, day: '2026-11-18' }), round({ round: 2, day: '2026-11-19' })],
    })
    const computed = loopBrakeFacts(brakeInput(session), { stopFile: false, disposed: false, now: NOW })
    expect(computed.roundsToday).toBe(1)
    expect(computed.tokensSpent).toBe(2 * LOOP_TOKEN_ALLOWANCE_PER_ROUND)
  })

  it('does not inherit an older day when measuring the day span', () => {
    const session = new LoopSession({
      rounds: [
        round({ round: 1, day: '2026-10-01', at: NOW - 30 * 24 * 60 * 60_000 }),
        round({ round: 2, day: '2026-11-19' }),
      ],
    })
    const computed = loopBrakeFacts(brakeInput(session), { stopFile: false, disposed: false, now: NOW })
    // Measured from today's first round (one hour ago), not from last month's: a loop
    // opened in a session with old history must not stop on its first beat.
    expect(computed.elapsedMs).toBe(60 * 60_000)
    expect(evaluateLoopBrakes(computed).kind).toBe('continue')
  })

  it('counts a silent round as a failure and any assistant output as a success', () => {
    const silent = new LoopSession({ assistant: 0, rounds: [round({ assistantCount: 0, failureStreak: 0 })] })
    expect(loopBrakeFacts(brakeInput(silent), { stopFile: false, disposed: false, now: NOW }).consecutiveFailures).toBe(1)

    const spoke = new LoopSession({ assistant: 2, rounds: [round({ assistantCount: 0, failureStreak: 0 })] })
    expect(loopBrakeFacts(brakeInput(spoke), { stopFile: false, disposed: false, now: NOW }).consecutiveFailures).toBe(0)
  })

  it('carries a streak forward instead of restarting it every heartbeat', () => {
    const session = new LoopSession({ assistant: 0, rounds: [round({ round: 1 }), round({ round: 2, failureStreak: 1 })] })
    const computed = loopBrakeFacts(brakeInput(session), { stopFile: false, disposed: false, now: NOW })
    expect(computed.consecutiveFailures).toBe(2)
    expect(evaluateLoopBrakes(computed).kind).toBe('continue')
    expect(evaluateLoopBrakes({ ...computed, failStreak: 2 })).toMatchObject({ kind: 'stop', code: 'loop/fail-streak' })
  })

  it('persists an admitted round on a real session, and reads it back', () => {
    const session = Session.create('sess-record' as never)
    appendLoopRound(session, round({ round: 1 }), silent)
    const stored = readLoopRounds(session)
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ round: 1, tokens: LOOP_TOKEN_ALLOWANCE_PER_ROUND, sessionId: 'sess-loop' })
  })

  it('warns and keeps going when the session refuses the record', () => {
    const warns: string[] = []
    const logger: WorkflowLogger = { warn: (message: string) => warns.push(message) }
    appendLoopRound({ append: () => { throw new Error('append refused') } } as unknown as Session, round(), logger)
    expect(warns[0]).toContain('loop round record not persisted')
  })
})

/* -------------------------------------------------------------- the port -- */

describe('the port the listener calls', () => {
  function port(options: { root?: string; disposed?: boolean; rows?: FakeRow[] } = {}) {
    const schedule = new FakeSchedule(options.rows ?? [])
    const brakes = createLoopBrakes({
      schedule: () => schedule as never,
      logger: silent,
      stopFile: () => join(options.root ?? mkdtempSync(join(tmpdir(), 'loop-brakes-')), '.rsi', 'STOP'),
      disposed: () => options.disposed ?? false,
      now: () => NOW,
    })
    return { brakes, schedule }
  }

  it('reviews and charges a round without writing to Schedule', async () => {
    const session = Session.create('sess-port' as never)
    const { brakes, schedule } = port()
    const input = { sessionId: 'sess-port', session, config: config() }
    expect(brakes.review(input)).toEqual({ kind: 'continue' })
    brakes.admit(input)
    expect(readLoopRounds(session)).toHaveLength(1)
    expect(schedule.calls).toEqual([])
  })

  it('stops a loop by deleting its stored heartbeat', async () => {
    const { brakes, schedule } = port({ rows: [loopRow('sess-port')] })
    await brakes.stop({ sessionId: 'sess-port', code: 'loop/fail-streak', detail: 'three silent rounds' })
    expect(schedule.calls).toContain('edit:delete:task-loop')
    expect(schedule.rows).toHaveLength(0)
  })

  it('still reports a stop when no Schedule service is composed', async () => {
    const warns: string[] = []
    const brakes = createLoopBrakes({ logger: { warn: (message: string) => warns.push(message) }, stopFile: () => '/nonexistent/STOP' })
    await brakes.stop({ sessionId: 'sess-none', code: 'loop/disposed', detail: 'unloaded' })
    expect(warns.join('\n')).toContain('loop/disposed')
  })
})

/* --------------------------------------------------------- pre-step hook -- */

describe('the narrow listener routes a heartbeat instead of reading it as a request', () => {
  it('charges exactly one round and hands the step on', async () => {
    const review = vi.fn(() => ({ kind: 'continue' as const }))
    const admit = vi.fn()
    const wired = listenForTest({ loop: stubPort({ review, admit }) })
    const next = vi.fn(async () => ({ kind: 'enter' as const, messages: [] }))

    const decision = await wired.handler(payloadFor(new LoopSession()), next)

    expect(review).toHaveBeenCalledTimes(1)
    expect(admit).toHaveBeenCalledTimes(1)
    // The continuation decision is the session's own ordinary turn: the listener hands
    // the step on and starts no run, whatever the workflow mode says.
    expect(decision).toEqual({ kind: 'enter', messages: [] })
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('never continues a loop inside a delegated child session', async () => {
    const review = vi.fn(() => ({ kind: 'continue' as const }))
    const admit = vi.fn()
    const child = new LoopSession()
    // A child's header carries the delegation depth; a heartbeat there is mis-targeted.
    Object.assign(child, { header: { origin: 'subagent', delegationDepth: 1 } })
    const wired = listenForTest({ loop: stubPort({ review, admit }) })
    const next = vi.fn(async () => ({ kind: 'enter' as const, messages: [] }))

    const decision = await wired.handler(payloadFor(child), next)

    expect(decision).toEqual({ kind: 'enter', messages: [] })
    expect(review).not.toHaveBeenCalled()
    expect(admit).not.toHaveBeenCalled()
  })

  it('refuses the step when the brakes trip, and charges nothing', async () => {
    const review = vi.fn(() => ({ kind: 'stop' as const, code: 'loop/daily-cap' as const, detail: '24 rounds already ran today' }))
    const admit = vi.fn()
    const stop = vi.fn(async () => {})
    const wired = listenForTest({ loop: stubPort({ review, admit, stop }) })
    const next = vi.fn(async () => ({ kind: 'enter' as const, messages: [] }))

    const decision = await wired.handler(payloadFor(new LoopSession()), next)

    expect(decision).toEqual({ kind: 'reject' })
    expect(admit).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
    // The row is deleted by the listener, not by the caller: the beat must not come back.
    expect(stop).toHaveBeenCalledWith({ sessionId: 'sess-loop', code: 'loop/daily-cap', detail: '24 rounds already ran today' })
  })

  it('still passes a heartbeat when no driver is wired, and counts nothing', async () => {
    const wired = listenForTest()
    // A real session, so "counts nothing" is read off the same log the brakes write.
    const session = Session.create('sess-loop' as never)
    const next = vi.fn(async () => ({ kind: 'enter' as const, messages: [] }))

    const decision = await wired.handler(payloadFor(session), next)

    expect(decision).toEqual({ kind: 'enter', messages: [] })
    expect(next).toHaveBeenCalledTimes(1)
    expect(readLoopRounds(session)).toHaveLength(0)
    // A beat it let through is still recorded — as what it did, not as a decision.
    expect(readHeartbeatListenObservations({ dir: wired.dir })).toMatchObject([
      { sessionId: 'sess-loop', outcome: 'continued' },
    ])
  })

  it('leaves a user message that merely quotes the marker to the next listener', () => {
    // The marker alone is not a beat: the delivery source has to agree with it. The
    // narrow listener is the only dispatcher left, so "a person typing the prefix is not
    // a heartbeat" is its answer, and it must cost nothing: no review, no round.
    const session = Session.create('sess-own-note' as never)
    const message = text(`${LOOP_PROMPT_PREFIX} this is my own note`, 'user')
    const wired = listenForTest()
    const next = vi.fn(async () => ({ kind: 'enter' as const, messages: [message] }))

    return wired.handler(
      { agent: agentOf(session) as never, messages: [message], turn: 1, step: 1, signal: new AbortController().signal },
      next,
    ).then(decision => {
      expect(decision).toEqual({ kind: 'enter', messages: [message] })
      expect(next).toHaveBeenCalledTimes(1)
      expect(readLoopRounds(session)).toHaveLength(0)
    })
  })
})

describe('a tripped brake refuses the step and removes the driver', () => {
  it('rejects the heartbeat, spends no model call and deletes the stored row', async () => {
    const root = mkdtempSync(join(tmpdir(), 'loop-stop-'))
    mkdirSync(join(root, '.rsi'), { recursive: true })
    writeFileSync(join(root, '.rsi', 'STOP'), 'operator pause\n')
    const schedule = new FakeSchedule([loopRow('sess-hooked')])
    const session = Session.create('sess-hooked' as never)
    const wired = listenForTest({ schedule, stopFile: () => join(root, '.rsi', 'STOP') })
    const next = vi.fn(async () => ({ kind: 'enter' as const, messages: [] }))

    const decision = await wired.handler(payloadFor(session), next)

    expect(decision).toEqual({ kind: 'reject' })
    expect(next).not.toHaveBeenCalled()
    expect(schedule.rows).toHaveLength(0)
  })

  it('lets a clean heartbeat through and charges it', async () => {
    const schedule = new FakeSchedule([loopRow('sess-clean')])
    const session = Session.create('sess-clean' as never)
    const wired = listenForTest({ schedule, stopFile: () => join(mkdtempSync(join(tmpdir(), 'loop-clean-')), 'STOP') })
    const next = vi.fn(async () => ({ kind: 'enter' as const, messages: [] }))

    const decision = await wired.handler(payloadFor(session), next)

    expect(decision).toEqual({ kind: 'enter', messages: [] })
    expect(next).toHaveBeenCalledTimes(1)
    expect(readLoopRounds(session)).toHaveLength(1)
    expect(schedule.rows).toHaveLength(1)
  })

  it('rejects after the failure streak reaches its configured point', async () => {
    const schedule = new FakeSchedule([loopRow('sess-fail')])
    const session = new LoopSession({
      id: 'sess-fail',
      assistant: 0,
      rounds: [round({ sessionId: 'sess-fail', failureStreak: 2 })],
    })
    const wired = listenForTest({ schedule, stopFile: () => '/nonexistent/STOP' })
    const next = vi.fn(async () => ({ kind: 'enter' as const, messages: [] }))

    const decision = await wired.handler(payloadFor(session), next)

    expect(decision).toEqual({ kind: 'reject' })
    expect(schedule.rows).toHaveLength(0)
  })
})

describe('an unloaded plugin cannot continue a loop', () => {
  it('rejects a heartbeat once the plugin is disposed, and deletes the row', async () => {
    const schedule = new FakeSchedule([loopRow('sess-unloaded')])
    const session = Session.create('sess-unloaded' as never)
    const wired = listenForTest({ schedule, stopFile: () => '/nonexistent/STOP' })
    wired.state.disposed = true
    const next = vi.fn(async () => ({ kind: 'enter' as const, messages: [] }))

    const decision = await wired.handler(payloadFor(session), next)

    expect(decision).toEqual({ kind: 'reject' })
    expect(next).not.toHaveBeenCalled()
    expect(schedule.rows).toHaveLength(0)
  })
})

describe('the continuation path leaves the engine bounds exactly as configured', () => {
  it('keeps the documented defaults and hard limits', () => {
    const resolved = config()
    expect(resolved.maxConcurrency).toBe(10)
    expect(resolved.maxRetries).toBe(1)
    expect(HARD_LIMITS.maxConcurrency).toBe(100)
    expect(HARD_LIMITS.maxRetries).toBe(3)
    expect(() => config({ maxConcurrency: 101 })).toThrow(/maxConcurrency/)
    // `maxRetries` is a removed key (D-155): a stored 4 loads, is ignored, and the run
    // keeps the fixed retry count, so no narrower bound can be widened through a patch.
    takeRemovedKeys()
    expect(config({ maxRetries: 4 }).maxRetries).toBe(1)
    expect(takeRemovedKeys()).toEqual(['maxRetries'])
  })

  it('starts no run for a heartbeat, so it cannot widen concurrency or retries', async () => {
    const schedule = new FakeSchedule([loopRow('sess-bounds')])
    const session = Session.create('sess-bounds' as never)
    const wired = listenForTest({ schedule, stopFile: () => '/nonexistent/STOP' })
    const next = vi.fn(async () => ({ kind: 'enter' as const, messages: [] }))

    const decision = await wired.handler(payloadFor(session), next)

    // The continuation decision is the session's own ordinary turn: the listener hands
    // the step to the next listener and starts no workflow, so neither bound can be
    // widened.
    expect(decision).toEqual({ kind: 'enter', messages: [] })
    expect(next).toHaveBeenCalledTimes(1)
  })
})

/* ---------------------------------------------------------------- helpers -- */

interface FakeRow {
  id: string
  title: string
  prompt: string
  kind: string
  rrule?: string
  scheduledAt: string
  status: 'active' | 'paused' | 'ended'
  target: { kind: string; sessionId?: string }
}

function loopRow(sessionId: string): FakeRow {
  return {
    id: 'task-loop',
    title: LOOP_TASK_TITLE,
    prompt: `${LOOP_PROMPT_PREFIX} Loop heartbeat: continue`,
    kind: 'rrule',
    rrule: 'DTSTART:20261119T030000Z\nRRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=10',
    scheduledAt: '2026-11-19T05:00:00.000Z',
    status: 'active',
    target: { kind: 'session', sessionId },
  }
}

/** Schedule double: records every call and honours `delete` for owned rows. */
class FakeSchedule {
  readonly calls: string[] = []
  rows: FakeRow[]

  constructor(rows: FakeRow[]) {
    this.rows = rows
  }

  async create(): Promise<never> {
    this.calls.push('create')
    throw new Error('a brake must never create a task')
  }

  async catalog(): Promise<FakeRow[]> {
    this.calls.push('catalog')
    return this.rows.map(row => ({ ...row }))
  }

  async edit(request: { id: string; action: string }): Promise<unknown> {
    this.calls.push(`edit:${request.action}:${request.id}`)
    if (request.action === 'delete') this.rows = this.rows.filter(row => row.id !== request.id)
    return {}
  }
}

function text(value: string, kind: 'user' | 'schedule'): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text: value }], source: { kind } as never }) as UserMessage
}

function agentOf(session: LoopSession | Session): { session: Session } {
  return { session: session as unknown as Session }
}

function payloadFor(session: LoopSession | Session): PreStepPayload {
  return {
    agent: agentOf(session) as never,
    messages: [text(`${LOOP_PROMPT_PREFIX} Loop heartbeat: the previous round has ended.`, 'schedule')],
    turn: 2,
    step: 1,
    signal: new AbortController().signal,
  }
}

function stubPort(overrides: Partial<LoopBrakePort> = {}): LoopBrakePort {
  return {
    review: () => ({ kind: 'continue' }),
    admit: () => {},
    stop: async () => {},
    ...overrides,
  }
}

/**
 * Install the real narrow listener over a minimal context and hand back its handler.
 *
 * Since M3.2 this listener is the only thing on the chain that decides a heartbeat's
 * fate, so these cases drive it directly. A case that names a Schedule double and a
 * stop-marker path gets the real brake port (clock and marker injected, so no test
 * depends on the repository's own `.rsi/STOP` or on wall time); every other case gets a
 * stub. Nothing else is stubbed: the review, the refusal, the deleted row and the
 * recorded line are the shipped ones.
 */
function listenForTest(options: {
  schedule?: FakeSchedule
  stopFile?: () => string
  loop?: LoopBrakePort
  state?: ReturnType<typeof createActiveState>
} = {}): {
  handler: (payload: PreStepPayload, next: () => Promise<unknown>) => Promise<unknown>
  state: ReturnType<typeof createActiveState>
  dir: string
} {
  const state = options.state ?? createActiveState()
  const loop = options.loop ?? (options.schedule === undefined
    ? undefined
    : createLoopBrakes({
      schedule: () => options.schedule as never,
      logger: silent,
      stopFile: options.stopFile ?? (() => '/nonexistent/STOP'),
      disposed: () => state.disposed,
      now: () => NOW,
    }))
  const dir = mkdtempSync(join(tmpdir(), 'loop-listen-'))
  let listener: unknown
  const ctx = {
    on: (event: string, registered: unknown) => {
      if (event === 'agent/pre-step') listener = registered
      return () => {}
    },
  }
  installHeartbeatListen({
    ctx: ctx as never,
    logger: silent,
    enabled: true,
    ...loop === undefined ? {} : { loop },
    config: config(),
    options: { dir },
  })
  return {
    handler: listener as (payload: PreStepPayload, next: () => Promise<unknown>) => Promise<unknown>,
    state,
    dir,
  }
}
