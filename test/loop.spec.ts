import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_LOOP_FAIL_STREAK,
  DEFAULT_LOOP_INTERVAL_MIN,
  DEFAULT_LOOP_MAX_ROUNDS,
  HARD_LIMITS,
  Config,
  resolveConfig,
  snapshotConfig,
} from '../src/config.js'
import {
  DEFAULT_LOOP_INTERVAL_MINUTES,
  LOOP_PROMPT_PREFIX,
  LOOP_TASK_TITLE,
  LoopError,
  MAX_LOOP_INTERVAL_MINUTES,
  MAX_LOOP_PROMPT_CHARS,
  createLoopService,
  defaultLoopPrompt,
  intervalMinutesOf,
  isLoopHeartbeat,
  isLoopTask,
  loopPolicyFromConfig,
  loopRrule,
  roundsOf,
  scheduleServiceOf,
} from '../src/loop.js'
import type {
  LoopPolicy,
  LoopScheduleCreate,
  LoopScheduleEdit,
  LoopScheduleLike,
  LoopScheduleTask,
} from '../src/loop.js'
import type { WorkflowLogger } from '../src/run.js'

/**
 * The repeat-run state machine (`src/loop.ts`), its breaker counters, and the four
 * configuration keys it reads.
 *
 * What is real here and what is a boundary fake: `createLoopService` is the real
 * module — authorization, policy, rule building, row selection, serialization and
 * cleanup all run as shipped. DSH's Schedule service is the boundary (a durable Host
 * service this bundle does not depend on and cannot start in CI), so it is replaced
 * by {@link FakeSchedule}, which implements the three methods the service calls with
 * the documented semantics: `create` appends an active row, `catalog` reads rows,
 * `edit` updates or deletes one by id.
 *
 * Every case is deterministic and offline: the clock is injected, the Schedule fake
 * is in-memory, and no timer is armed. A heartbeat that DSH itself has to fire is
 * `NOT_RUN` here by design — what a unit test can pin is the row this service writes
 * and the decisions it refuses, not the Host's delivery.
 */

/** A row the fake can mutate; the shipped type is readonly because callers only read it. */
interface MutableRow {
  id: string
  title: string
  prompt: string
  kind: string
  rrule?: string
  scheduledAt: string
  status: 'active' | 'paused' | 'ended'
  createdAt?: string
  target: { kind: string; sessionId?: string }
  lastDelivery?: { scheduledAt: string; deliveredAt: string }
}

/**
 * In-memory stand-in for DSH's Schedule service.
 *
 * It records every call so a test can assert "no write happened" — the property that
 * keeps a refresh from moving a committed anchor, and the one a mutation such as
 * dropping the serialization queue would break.
 */
class FakeSchedule implements LoopScheduleLike {
  rows: MutableRow[] = []
  calls: string[] = []
  /** Id whose delete must fail, so the "already gone is success / real error warns" path is reachable. */
  failDeleteOf?: string
  private next = 1

  async create(request: LoopScheduleCreate, actorSessionId?: string): Promise<LoopScheduleTask> {
    this.calls.push('create')
    // Schedule records the acting Agent when it is passed; the service must never
    // pass one when it claims to act for the user.
    if (actorSessionId !== undefined) throw new Error(`create received an acting agent: ${actorSessionId}`)
    const row: MutableRow = {
      id: `task-${this.next++}`,
      title: request.title,
      prompt: request.prompt,
      kind: request.timing.kind,
      rrule: request.timing.rrule,
      // The Host commits the next occurrence; its exact value is not this service's
      // decision, only that an active row carries one.
      scheduledAt: '2026-11-18T01:00:00.000Z',
      status: 'active',
      createdAt: '2026-11-18T00:00:00.000Z',
      target: { kind: request.target.kind, ...request.target.sessionId === undefined ? {} : { sessionId: request.target.sessionId } },
    }
    this.rows.push(row)
    return row
  }

  async catalog(): Promise<LoopScheduleTask[]> {
    this.calls.push('catalog')
    return this.rows.map(row => ({ ...row }))
  }

  async edit(request: LoopScheduleEdit): Promise<unknown> {
    this.calls.push(`edit:${request.action}:${request.id}`)
    const row = this.rows.find(candidate => candidate.id === request.id)
    if (request.action === 'delete') {
      if (this.failDeleteOf === request.id) throw new Error('schedule refused the delete')
      if (row === undefined) throw new Error(`no task ${request.id}`)
      this.rows = this.rows.filter(candidate => candidate.id !== request.id)
      return { id: request.id, action: 'delete' }
    }
    if (row === undefined) throw new Error(`no task ${request.id}`)
    const next: MutableRow = { ...row }
    if (request.patch.prompt !== undefined) next.prompt = request.patch.prompt
    if (request.patch.active !== undefined) next.status = request.patch.active ? 'active' : 'paused'
    if (request.patch.timing !== undefined) next.rrule = request.patch.timing.rrule
    this.rows = this.rows.map(candidate => candidate.id === row.id ? next : candidate)
    return next
  }
}

/** Deterministic clock: one whole UTC second, so `DTSTART` is stable across machines. */
const NOW = 1_700_000_000_000

interface Harness {
  service: ReturnType<typeof createLoopService>
  schedule: FakeSchedule
  logger: WorkflowLogger & { warn: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> }
}

/** A service over the fake Schedule, with the clock and (optionally) the policy injected. */
function harness(options: { policy?: LoopPolicy; schedule?: FakeSchedule | undefined } = {}): Harness {
  const schedule = options.schedule === undefined ? new FakeSchedule() : options.schedule
  const logger = { warn: vi.fn(), info: vi.fn() }
  const service = createLoopService({
    schedule: () => schedule,
    logger,
    now: () => NOW,
    ...options.policy === undefined ? {} : { policy: () => options.policy as LoopPolicy },
  })
  return { service, schedule: schedule as FakeSchedule, logger }
}

/** The policy the shipped defaults resolve to: one hour, ten rounds, three failures. */
const DEFAULT_POLICY: LoopPolicy = { intervalMinutes: 60, rounds: 10, failStreak: 3 }

describe('repeat-run policy: the counts a loop may not exceed', () => {
  it('charges one worst-case round as the interval floor, so rounds cannot stack', () => {
    // A heartbeat that lands while the previous round still runs would add a second
    // concurrent run to the same session. The floor is therefore one full deadline.
    expect(loopPolicyFromConfig(3_600_000, 0, 10, 3).intervalMinutes).toBe(60)
    expect(loopPolicyFromConfig(7_200_000, 0, 10, 3).intervalMinutes).toBe(120)
    // A sub-minute deadline still cannot schedule anything faster than the default
    // hour, and `timeoutMs = 0` (no deadline) has no honest bound: the default stands.
    expect(loopPolicyFromConfig(30_000, 0, 10, 3).intervalMinutes).toBe(60)
    expect(loopPolicyFromConfig(0, 0, 10, 3).intervalMinutes).toBe(60)
    expect(loopPolicyFromConfig(0, 0, 10, 3).intervalMinutes).toBe(DEFAULT_LOOP_INTERVAL_MINUTES)
    // A configured interval is a wait, not a budget: it may raise the floor, never lower it.
    expect(loopPolicyFromConfig(0, 5, 10, 3).intervalMinutes).toBe(60)
    expect(loopPolicyFromConfig(0, 180, 10, 3).intervalMinutes).toBe(180)
    // Seven days is the ceiling, so a typo cannot park a loop for a year.
    expect(loopPolicyFromConfig(0, 20_000, 10, 3).intervalMinutes).toBe(MAX_LOOP_INTERVAL_MINUTES)
    expect(MAX_LOOP_INTERVAL_MINUTES).toBe(HARD_LIMITS.loopIntervalMin)
  })

  it('keeps the round cap and the failure streak inside their hard counts', () => {
    // The two numbers are quota envelopes: each round is a full workflow run.
    expect(loopPolicyFromConfig(0, 0, 0, 0)).toMatchObject({ rounds: 1, failStreak: 1 })
    expect(loopPolicyFromConfig(0, 0, 250, 7)).toMatchObject({ rounds: 250, failStreak: 7 })
    expect(loopPolicyFromConfig(0, 0, 5_000, 5_000)).toMatchObject({ rounds: 1_000, failStreak: 1_000 })
    expect(loopPolicyFromConfig(0, 0, 3.9, 2.9)).toMatchObject({ rounds: 3, failStreak: 2 })
    // A non-finite value cannot come from the schema; the fallback keeps a directly
    // constructed dependency from producing NaN instead of a count.
    expect(loopPolicyFromConfig(0, 0, Number.NaN, Number.NaN)).toMatchObject({ rounds: 10, failStreak: 3 })
    expect(loopPolicyFromConfig(0, 0, Number.NaN, Number.NaN)).toEqual(DEFAULT_POLICY)
    // The defaults the config documents are the same three numbers.
    expect(loopPolicyFromConfig(0, DEFAULT_LOOP_INTERVAL_MIN, DEFAULT_LOOP_MAX_ROUNDS, DEFAULT_LOOP_FAIL_STREAK))
      .toEqual(DEFAULT_POLICY)
  })

  it('carries the failure streak into the heartbeat text, and says it is guidance', () => {
    const text = defaultLoopPrompt(5)
    expect(text.startsWith(LOOP_PROMPT_PREFIX)).toBe(true)
    expect(text).toContain('If the last 5 rounds failed in a row, stop and report why')
    // Stated limitation, pinned so it cannot be quietly reworded into a claim: the
    // host cannot enforce the streak, so the prompt asks for it instead.
    expect(defaultLoopPrompt(DEFAULT_LOOP_FAIL_STREAK)).toContain('If the last 3 rounds failed in a row')
  })

  it('recognises a heartbeat inside DSH delivery framing, not only at the start', () => {
    // Round 17 live evidence: DSH 0.2.2 wraps the stored prompt as
    // `[SCHEDULE REMINDER] … reminder_prompt_json: "<stored prompt>"`, so the
    // marker is embedded, never leading. A real delivery must still be recognised.
    const framed =
      '[SCHEDULE REMINDER]\nThis is a scheduled message from the user\n' +
      'schedule_id_json: "schedule-aaa"\noccurrence_at: 2026-11-19T01:07:01.365Z\n' +
      `reminder_prompt_json: "${LOOP_PROMPT_PREFIX} Loop heartbeat: the round ended."`
    expect(isLoopHeartbeat(framed)).toBe(true)
    // The direct shape (stored prompt verbatim) keeps working.
    expect(isLoopHeartbeat(`${LOOP_PROMPT_PREFIX} Loop heartbeat`)).toBe(true)
    // A user pasting the marker into ordinary text is not a heartbeat by text
    // alone: the gate additionally requires source.kind === 'schedule'.
    expect(isLoopHeartbeat(`please ${LOOP_PROMPT_PREFIX} do not match`)).toBe(false)
    expect(isLoopHeartbeat('ordinary text')).toBe(false)
  })
})

describe('the stored rule is the bound Schedule enforces', () => {
  /**
   * The occurrences Schedule would deliver: `DTSTART` + k intervals, counting the
   * anchor, with the first one strictly after `now` — DSH's `scheduledAt = next(now)`
   * contract followed by `COUNT` occurrences. Recomputed here from the rule text so
   * the assertion does not borrow the service's own arithmetic.
   */
  function occurrencesAfter(rrule: string, now: number): number[] {
    const stamp = /DTSTART:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(rrule)
    if (stamp === null) throw new Error(`no DTSTART in ${rrule}`)
    const start = Date.parse(`${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}Z`)
    const interval = (intervalMinutesOf(rrule) ?? 0) * 60_000
    const bound = roundsOf(rrule) ?? 0
    const occurrences: number[] = []
    let cursor = now
    for (let index = 0; index < bound; index += 1) {
      // Occurrences are `start + k intervals` for k >= 0, so an anchor still ahead of
      // the clock starts the count at k = 0 rather than at a negative index.
      const steps = Math.max(0, Math.floor((cursor - start) / interval) + 1)
      occurrences.push(start + steps * interval)
      cursor = start + steps * interval
    }
    return occurrences
  }

  it('writes a two-line UTC rule whose COUNT is the round cap', () => {
    // The anchor sits one interval ahead of the next whole second, so the first beat is
    // a full interval out and every stored occurrence is still to come.
    expect(loopRrule(90, 7, NOW)).toBe('DTSTART:20231114T234320Z\nRRULE:FREQ=MINUTELY;INTERVAL=90;COUNT=7')
    expect(loopRrule(60, 3, NOW + 999)).toContain('DTSTART:20231114T231321Z')
    expect(loopRrule(60, 3, NOW)).toContain('FREQ=MINUTELY;INTERVAL=60;COUNT=3')
  })

  it('waits a whole interval before the first beat, whatever the clock phase', () => {
    // Regression: an anchor at or just ahead of the clock is itself the first
    // occurrence, because Schedule takes the first occurrence strictly after creation.
    // A loop opened at 22:13:20.4 fired at 22:13:21 — a round starting while the
    // session was still settling, and rounds that could stack.
    for (const offset of [0, 1, 250, 999]) {
      const opened = NOW + offset
      const rrule = loopRrule(60, 10, opened)
      const [first] = occurrencesAfter(rrule, opened)
      const wait = (first ?? 0) - opened
      // Never early: the wait is the interval plus at most the sub-second rounding the
      // whole-second anchor forces.
      expect(wait).toBeGreaterThanOrEqual(60 * 60_000)
      expect(wait).toBeLessThanOrEqual(60 * 60_000 + 1_000)
    }
    // An open at a whole second needs no rounding: exactly one interval out.
    expect((occurrencesAfter(loopRrule(60, 10, NOW), NOW)[0] ?? 0) - NOW).toBe(60 * 60_000)
  })

  it('spends no stored occurrence before the clock, so COUNT rounds are delivered', () => {
    // `COUNT` counts occurrences from the anchor. An anchor at or behind the clock is
    // already past, so it consumes one count and the loop delivers `rounds - 1` beats
    // — a quiet off-by-one against the configured cap. Every occurrence must be ahead
    // of the clock for the round cap to be the number of rounds the user gets.
    for (const offset of [0, 413, 999]) {
      const opened = NOW + offset
      const occurrences = occurrencesAfter(loopRrule(60, 4, opened), opened)
      expect(occurrences).toHaveLength(4)
      for (const at of occurrences) expect(at).toBeGreaterThan(opened)
      // Spacing is the interval, so rounds cannot stack on each other.
      for (let index = 1; index < occurrences.length; index += 1) {
        expect((occurrences[index] ?? 0) - (occurrences[index - 1] ?? 0)).toBe(60 * 60_000)
      }
    }
  })

  it('opens a loop without arming an immediate heartbeat', async () => {
    // The same guarantee through the public operation, with an unaligned clock: the
    // row the service creates is the row Schedule will fire an hour out, four times.
    const schedule = new FakeSchedule()
    const opened = NOW + 413
    const service = createLoopService({
      schedule: () => schedule,
      logger: { warn: vi.fn() },
      now: () => opened,
      policy: () => ({ intervalMinutes: 60, rounds: 4, failStreak: 3 }),
    })
    await service.open({ sessionId: 'session-a' })
    const stored = schedule.rows[0]?.rrule ?? ''
    const occurrences = occurrencesAfter(stored, opened)
    expect(occurrences).toHaveLength(4)
    expect((occurrences[0] ?? 0) - opened).toBeGreaterThanOrEqual(60 * 60_000)
    expect((occurrences[0] ?? 0) - opened).toBeLessThanOrEqual(60 * 60_000 + 1_000)
  })

  it('reads the interval and the bound back off a stored rule', () => {
    expect(intervalMinutesOf('RRULE:FREQ=MINUTELY;INTERVAL=90')).toBe(90)
    expect(intervalMinutesOf('RRULE:FREQ=MINUTELY')).toBe(1)
    expect(intervalMinutesOf('RRULE:FREQ=HOURLY;INTERVAL=2')).toBe(120)
    expect(intervalMinutesOf('RRULE:FREQ=DAILY;INTERVAL=1')).toBe(1_440)
    // A rule this service cannot read yields `undefined` instead of a guessed number.
    expect(intervalMinutesOf('RRULE:FREQ=WEEKLY;INTERVAL=1')).toBeUndefined()
    expect(intervalMinutesOf('RRULE:FREQ=MINUTELY;INTERVAL=0')).toBeUndefined()
    expect(intervalMinutesOf('nonsense')).toBeUndefined()
    expect(roundsOf('RRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=7')).toBe(7)
    expect(roundsOf('RRULE:FREQ=MINUTELY;INTERVAL=60')).toBeUndefined()
    expect(roundsOf('RRULE:FREQ=MINUTELY;COUNT=0')).toBeUndefined()
  })

  it('owns only rows matching title, marker and shape', () => {
    const row = (over: Partial<MutableRow>): LoopScheduleTask => ({
      id: 'task-1',
      title: LOOP_TASK_TITLE,
      prompt: `${LOOP_PROMPT_PREFIX} heartbeat`,
      kind: 'rrule',
      rrule: 'RRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=3',
      scheduledAt: '2026-11-18T01:00:00.000Z',
      status: 'active',
      target: { kind: 'session', sessionId: 'session-a' },
      ...over,
    })
    expect(isLoopTask(row({}))).toBe(true)
    expect(isLoopTask(row({}), 'session-a')).toBe(true)
    expect(isLoopTask(row({}), 'session-b')).toBe(false)
    expect(isLoopTask(row({ title: 'Another task' }))).toBe(false)
    expect(isLoopTask(row({ prompt: 'no marker' }))).toBe(false)
    expect(isLoopTask(row({ kind: 'every' }))).toBe(false)
    // The marker must be the first line, not merely present in the prompt.
    expect(isLoopTask(row({ prompt: `please ${LOOP_PROMPT_PREFIX}` }))).toBe(false)
  })
})

describe('the switch state machine: open, refresh, resume, replace, close', () => {
  it('opens exactly one heartbeat for a session that has none', async () => {
    const { service, schedule } = harness()
    const snapshot = await service.open({ sessionId: 'session-a' })
    expect(snapshot).toMatchObject({
      open: true,
      sessionId: 'session-a',
      taskStatus: 'active',
      intervalMinutes: DEFAULT_POLICY.intervalMinutes,
      rounds: DEFAULT_POLICY.rounds,
      nextAt: '2026-11-18T01:00:00.000Z',
    })
    expect(schedule.rows).toHaveLength(1)
    expect(schedule.calls.filter(call => call === 'create')).toHaveLength(1)
    // The row is target-bound to the session that receives every heartbeat, and its
    // prompt carries the failure-streak instruction rather than a bare "continue".
    expect(schedule.rows[0]).toMatchObject({
      title: LOOP_TASK_TITLE,
      target: { kind: 'session', sessionId: 'session-a' },
    })
    expect(schedule.rows[0]?.prompt).toContain(`If the last ${DEFAULT_POLICY.failStreak} rounds failed in a row`)
    expect(roundsOf(schedule.rows[0]?.rrule ?? '')).toBe(DEFAULT_POLICY.rounds)
  })

  it('refreshes an unchanged loop without writing or moving its anchor', async () => {
    const { service, schedule } = harness()
    const first = await service.open({ sessionId: 'session-a' })
    const writesAfterOpen = schedule.calls.filter(call => call.startsWith('edit') || call === 'create').length
    const second = await service.open({ sessionId: 'session-a' })
    expect(second.taskId).toBe(first.taskId)
    expect(second.nextAt).toBe(first.nextAt)
    // Idempotent open: an unchanged switch is a read, not a new Schedule write.
    expect(schedule.calls.filter(call => call.startsWith('edit') || call === 'create')).toHaveLength(writesAfterOpen)
    expect(schedule.rows).toHaveLength(1)
  })

  it('rebuilds the rule when the round bound changes, keeping the same row', async () => {
    const { service, schedule } = harness({ policy: DEFAULT_POLICY })
    const first = await service.open({ sessionId: 'session-a' })
    const raised = harness({ schedule, policy: { ...DEFAULT_POLICY, rounds: 25 } })
    const second = await raised.service.open({ sessionId: 'session-a' })
    expect(second.taskId).toBe(first.taskId)
    expect(schedule.rows).toHaveLength(1)
    expect(roundsOf(schedule.rows[0]?.rrule ?? '')).toBe(25)
    expect(schedule.calls.some(call => call.startsWith('edit:update'))).toBe(true)
    expect(schedule.calls.filter(call => call === 'create')).toHaveLength(1)
  })

  it('resumes a paused row instead of minting a second one', async () => {
    const schedule = new FakeSchedule()
    schedule.rows.push({
      id: 'task-paused',
      title: LOOP_TASK_TITLE,
      prompt: `${LOOP_PROMPT_PREFIX} stale text`,
      kind: 'rrule',
      rrule: 'RRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=3',
      scheduledAt: '2026-11-18T01:00:00.000Z',
      status: 'paused',
      target: { kind: 'session', sessionId: 'session-a' },
    })
    const { service } = harness({ schedule })
    const snapshot = await service.open({ sessionId: 'session-a' })
    expect(snapshot).toMatchObject({ open: true, taskId: 'task-paused' })
    expect(schedule.rows).toHaveLength(1)
    expect(schedule.rows[0]?.status).toBe('active')
    expect(schedule.rows[0]?.prompt).not.toContain('stale text')
    expect(schedule.calls.filter(call => call === 'create')).toHaveLength(0)
  })

  it('replaces an ended row, because an exhausted rule cannot resume', async () => {
    const schedule = new FakeSchedule()
    schedule.rows.push({
      id: 'task-ended',
      title: LOOP_TASK_TITLE,
      prompt: `${LOOP_PROMPT_PREFIX} done`,
      kind: 'rrule',
      rrule: 'RRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=3',
      scheduledAt: '2026-11-17T01:00:00.000Z',
      status: 'ended',
      target: { kind: 'session', sessionId: 'session-a' },
    })
    const { service } = harness({ schedule })
    const snapshot = await service.open({ sessionId: 'session-a' })
    expect(snapshot.open).toBe(true)
    expect(snapshot.taskId).not.toBe('task-ended')
    expect(schedule.rows.map(row => row.id)).toEqual([snapshot.taskId])
    expect(schedule.calls).toContain('edit:delete:task-ended')
    expect(schedule.calls.filter(call => call === 'create')).toHaveLength(1)
  })

  it('closes by deleting every owned row and leaving everything else alone', async () => {
    const schedule = new FakeSchedule()
    const owned = (id: string, sessionId: string): MutableRow => ({
      id,
      title: LOOP_TASK_TITLE,
      prompt: `${LOOP_PROMPT_PREFIX} heartbeat`,
      kind: 'rrule',
      rrule: 'RRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=3',
      scheduledAt: '2026-11-18T01:00:00.000Z',
      status: 'active',
      target: { kind: 'session', sessionId },
    })
    schedule.rows.push(
      owned('task-a1', 'session-a'),
      owned('task-a2', 'session-a'),
      owned('task-b1', 'session-b'),
      { ...owned('task-foreign', 'session-a'), title: 'Someone else task' },
      { ...owned('task-other-kind', 'session-a'), kind: 'every' },
    )
    const { service } = harness({ schedule })
    expect(await service.status({ sessionId: 'session-a' })).toMatchObject({ open: true, taskId: 'task-a1' })
    expect(await service.close({ sessionId: 'session-a' })).toEqual({ open: false, sessionId: 'session-a' })
    expect(schedule.rows.map(row => row.id).sort()).toEqual(['task-b1', 'task-foreign', 'task-other-kind'])
    // A paused row is still a stored heartbeat, so closing removes it too: nothing of
    // this plugin's may outlive the switch that owns it.
    expect(await service.status({ sessionId: 'session-a' })).toEqual({ open: false, sessionId: 'session-a' })
  })

  it('serializes concurrent opens so one session cannot end up with two rows', async () => {
    const { service, schedule } = harness()
    const [first, second] = await Promise.all([
      service.open({ sessionId: 'session-a' }),
      service.open({ sessionId: 'session-a' }),
    ])
    expect(schedule.calls.filter(call => call === 'create')).toHaveLength(1)
    expect(schedule.rows).toHaveLength(1)
    expect(second.taskId).toBe(first.taskId)
  })

  it('warns but still closes when Schedule refuses one delete', async () => {
    const { service, schedule, logger } = harness()
    await service.open({ sessionId: 'session-a' })
    schedule.failDeleteOf = 'task-1'
    // "Already gone" is success; a real refusal is logged with its id and the close
    // reports the row that survived instead of claiming the loop is off.
    expect(await service.close({ sessionId: 'session-a' })).toMatchObject({
      open: true,
      sessionId: 'session-a',
      taskId: 'task-1',
      taskStatus: 'active',
    })
    expect(logger.warn).toHaveBeenCalledTimes(2)
    expect(String(logger.warn.mock.calls[0]?.[0])).toContain('could not delete loop heartbeat task-1')
    expect(String(logger.warn.mock.calls[1]?.[0])).toContain('left 1 heartbeat stored')
    expect(schedule.rows).toHaveLength(1)
  })

  it('reports the stored facts of a loop, including the last acknowledged delivery', async () => {
    const schedule = new FakeSchedule()
    schedule.rows.push({
      id: 'task-7',
      title: LOOP_TASK_TITLE,
      prompt: `${LOOP_PROMPT_PREFIX} heartbeat`,
      kind: 'rrule',
      rrule: 'RRULE:FREQ=MINUTELY;INTERVAL=120;COUNT=4',
      scheduledAt: '2026-11-18T02:00:00.000Z',
      status: 'active',
      createdAt: '2026-11-18T00:00:00.000Z',
      target: { kind: 'session', sessionId: 'session-a' },
      lastDelivery: { scheduledAt: '2026-11-18T01:00:00.000Z', deliveredAt: '2026-11-18T01:00:01.000Z' },
    })
    const { service } = harness({ schedule })
    expect(await service.status({ sessionId: 'session-a' })).toEqual({
      open: true,
      sessionId: 'session-a',
      taskId: 'task-7',
      taskStatus: 'active',
      intervalMinutes: 120,
      rounds: 4,
      nextAt: '2026-11-18T02:00:00.000Z',
      createdAt: '2026-11-18T00:00:00.000Z',
      lastDeliveredAt: '2026-11-18T01:00:01.000Z',
    })
    expect(await service.status({ sessionId: 'session-b' })).toEqual({ open: false, sessionId: 'session-b' })
  })

  it('cleans up by reason across sessions, counting only its own rows', async () => {
    const { service, schedule } = harness()
    await service.open({ sessionId: 'session-a' })
    await service.open({ sessionId: 'session-b' })
    schedule.rows.push({
      id: 'task-foreign',
      title: 'Someone else task',
      prompt: 'x',
      kind: 'rrule',
      scheduledAt: '2026-11-18T01:00:00.000Z',
      status: 'active',
      target: { kind: 'session', sessionId: 'session-a' },
    })
    expect(await service.forgetSession('session-a')).toBe(1)
    expect(schedule.rows.map(row => row.id).sort()).toEqual(['task-2', 'task-foreign'])
    expect(await service.stopAll('plugin unload')).toBe(1)
    expect(schedule.rows.map(row => row.id)).toEqual(['task-foreign'])
    expect(await service.stopAll('plugin unload')).toBe(0)
  })
})

describe('the switch refuses what it cannot honestly do', () => {
  it('lets only the user open a loop; an acting agent is refused before any write', async () => {
    const { service, schedule } = harness()
    expect(service.available()).toBe(true)
    const refusal = service.open({ sessionId: 'session-a' }, 'session-a')
    await expect(refusal).rejects.toBeInstanceOf(LoopError)
    await expect(refusal).rejects.toMatchObject({ code: 'loop/user-only' })
    // Refused means no Schedule call at all — not "created and then rolled back".
    expect(schedule.calls).toEqual([])
  })

  it('still lets an agent or the user close a loop it did not open', async () => {
    const { service } = harness()
    await service.open({ sessionId: 'session-a' })
    await expect(service.close({ sessionId: 'session-a' }, 'agent-session')).resolves.toMatchObject({ open: false })
    await expect(service.close({ sessionId: 'session-a' })).resolves.toMatchObject({ open: false })
  })

  it('says the composition has no Schedule instead of pretending a loop exists', async () => {
    const service = createLoopService({ schedule: () => undefined, logger: { warn: vi.fn() } })
    expect(service.available()).toBe(false)
    await expect(service.open({ sessionId: 'session-a' })).rejects.toMatchObject({ code: 'loop/unavailable' })
    await expect(service.status({ sessionId: 'session-a' })).rejects.toMatchObject({ code: 'loop/unavailable' })
    await expect(service.close({ sessionId: 'session-a' })).rejects.toMatchObject({ code: 'loop/unavailable' })
    // The lifecycle cleanups are silent when nothing can have been stored.
    await expect(service.stopAll('unload')).resolves.toBe(0)
    await expect(service.forgetSession('session-a')).resolves.toBe(0)
  })

  it('refuses a session id that is not a usable target', async () => {
    const { service, schedule } = harness()
    for (const sessionId of ['', '   ', `s${'x'.repeat(128)}`, 'has space', 'nul\u0000byte', undefined as never]) {
      await expect(service.open({ sessionId })).rejects.toMatchObject({ code: 'loop/session' })
    }
    await expect(service.status({ sessionId: '' })).rejects.toMatchObject({ code: 'loop/session' })
    expect(schedule.calls).toEqual([])
  })

  it('refuses an interval outside its bounds, and never lowers the floor', async () => {
    const { service } = harness()
    await expect(service.open({ sessionId: 'session-a', intervalMinutes: 0 })).rejects.toMatchObject({ code: 'loop/interval' })
    await expect(service.open({ sessionId: 'session-a', intervalMinutes: 1.5 })).rejects.toMatchObject({ code: 'loop/interval' })
    await expect(service.open({ sessionId: 'session-a', intervalMinutes: MAX_LOOP_INTERVAL_MINUTES + 1 }))
      .rejects.toMatchObject({ code: 'loop/interval' })
    // Above the floor is a wait the user asked for; below it is clamped up.
    await expect(service.open({ sessionId: 'session-a', intervalMinutes: 5 }))
      .resolves.toMatchObject({ intervalMinutes: DEFAULT_LOOP_INTERVAL_MINUTES })
    await expect(service.open({ sessionId: 'session-a', intervalMinutes: 180 }))
      .resolves.toMatchObject({ intervalMinutes: 180 })
  })

  it('refuses an empty or over-long replacement prompt', async () => {
    const { service } = harness()
    await expect(service.open({ sessionId: 'session-a', prompt: '   ' })).rejects.toMatchObject({ code: 'loop/prompt' })
    await expect(service.open({ sessionId: 'session-a', prompt: 'x'.repeat(MAX_LOOP_PROMPT_CHARS + 1) }))
      .rejects.toMatchObject({ code: 'loop/prompt' })
    const accepted = await service.open({ sessionId: 'session-a', prompt: `  ${LOOP_PROMPT_PREFIX} custom  ` })
    expect(accepted.open).toBe(true)
  })
})

describe('the Schedule lookup is duck-typed, so a profile without it still loads', () => {
  it('returns the service only when all three methods exist', () => {
    const schedule = new FakeSchedule()
    expect(scheduleServiceOf({ get: () => schedule })).toBe(schedule)
    expect(scheduleServiceOf({ get: () => undefined })).toBeUndefined()
    expect(scheduleServiceOf({ get: () => ({ create: () => {}, catalog: () => [] }) })).toBeUndefined()
    expect(scheduleServiceOf({ get: () => 'schedule' })).toBeUndefined()
    expect(scheduleServiceOf({})).toBeUndefined()
  })
})

describe('the repeat-run configuration surface', () => {
  it('resolves the four keys and defaults them to off / ten / three / immediate', () => {
    const resolved = resolveConfig({} as never)
    expect({
      loopEnabled: resolved.loopEnabled,
      loopMaxRounds: resolved.loopMaxRounds,
      loopFailStreak: resolved.loopFailStreak,
      loopIntervalMin: resolved.loopIntervalMin,
    }).toEqual({ loopEnabled: false, loopMaxRounds: 10, loopFailStreak: 3, loopIntervalMin: 0 })
    // Off is the only safe default: an enabled-by-default loop would turn one message
    // into an unbounded series of full runs.
    expect([DEFAULT_LOOP_MAX_ROUNDS, DEFAULT_LOOP_FAIL_STREAK, DEFAULT_LOOP_INTERVAL_MIN]).toEqual([10, 3, 0])
    // Volatile fields reach the plugin as live holders; `snapshotConfig` is the one
    // place that turns them back into the plain value a run reads.
    expect((snapshotConfig(Config({} as never)) as Record<string, unknown>).loopEnabled).toBe(false)
  })

  it('accepts the four keys at their documented bounds', () => {
    const narrowest = resolveConfig({ loopEnabled: true, loopMaxRounds: 1, loopFailStreak: 1, loopIntervalMin: 0 } as never)
    expect([narrowest.loopEnabled, narrowest.loopMaxRounds, narrowest.loopFailStreak, narrowest.loopIntervalMin])
      .toEqual([true, 1, 1, 0])
    const widest = resolveConfig({
      loopMaxRounds: HARD_LIMITS.loopMaxRounds,
      loopFailStreak: HARD_LIMITS.loopFailStreak,
      loopIntervalMin: HARD_LIMITS.loopIntervalMin,
    } as never)
    expect([widest.loopMaxRounds, widest.loopFailStreak, widest.loopIntervalMin])
      .toEqual([100, 20, 10_080])
  })

  it('refuses a switch that is not a real boolean', () => {
    for (const value of ['on', 1, 0, null]) {
      expect(() => resolveConfig({ loopEnabled: value } as never))
        .toThrow(new RegExp(`loopEnabled must be true or false, got "${String(value)}"`))
    }
    // The schema layer refuses it too, before the resolver ever sees it.
    expect(() => Config({ loopEnabled: 'on' } as never)).toThrow(/loopEnabled/)
  })

  it('refuses each loop number outside its range, naming the key and both bounds', () => {
    expect(() => resolveConfig({ loopMaxRounds: 0 } as never)).toThrow(/loopMaxRounds must be an integer between 1 and 100/)
    expect(() => resolveConfig({ loopMaxRounds: HARD_LIMITS.loopMaxRounds + 1 } as never))
      .toThrow(/loopMaxRounds must be an integer between 1 and 100/)
    expect(() => resolveConfig({ loopMaxRounds: 2.5 } as never)).toThrow(/loopMaxRounds must be an integer/)
    expect(() => resolveConfig({ loopFailStreak: 0 } as never)).toThrow(/loopFailStreak must be an integer between 1 and 20/)
    expect(() => resolveConfig({ loopFailStreak: HARD_LIMITS.loopFailStreak + 1 } as never))
      .toThrow(/loopFailStreak must be an integer between 1 and 20/)
    expect(() => resolveConfig({ loopIntervalMin: -1 } as never))
      .toThrow(/loopIntervalMin must be an integer between 0 and/)
    expect(() => resolveConfig({ loopIntervalMin: 0.5 } as never)).toThrow(/loopIntervalMin must be an integer/)
    expect(() => resolveConfig({ loopIntervalMin: HARD_LIMITS.loopIntervalMin + 1 } as never))
      .toThrow(/loopIntervalMin must be an integer between 0 and 10080/)
  })
})
