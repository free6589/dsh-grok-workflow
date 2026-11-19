import { describe, expect, it } from 'vitest'
import { DEFAULT_ITERATE_TEMPLATE } from '../src/config.js'
import {
  DEFAULT_LOOP_INTERVAL_MINUTES,
  ITERATE_TASK_TITLE,
  LOOP_TASK_TITLE,
  LoopError,
  createLoopService,
  isLoopSlot,
  loopPolicyFromConfig,
} from '../src/loop.js'
import type {
  LoopOpenRequest,
  LoopScheduleCreate,
  LoopScheduleEdit,
  LoopScheduleLike,
  LoopScheduleTask,
} from '../src/loop.js'
import type { WorkflowLogger } from '../src/run.js'

/**
 * The self-iteration service (`/grok-workflow/iterate`) is a second `createLoopService`
 * instance bound to its own Schedule slot (`RSI heartbeat`), so the acceptance this file
 * pins is the independence contract the settings page's two switches depend on:
 *
 * - one switch's open creates only its own title's row;
 * - one switch's close deletes only its own title's rows;
 * - neither open, close, status nor unload sweep can adopt, charge or delete the other's
 *   row, even when both rows target the same session;
 * - the iterate prompt is the profile's template (whitespace falls back to the built-in
 *   default), and a template edit reaches the next open.
 *
 * Everything real here is the shipped service: policy, rule building, row selection,
 * serialization and cleanup all run as in production. DSH's Schedule is the boundary and
 * is replaced by the same in-memory fake `test/loop.spec.ts` uses, with the documented
 * semantics: `create` appends an active row, `catalog` reads, `edit` updates or deletes.
 */

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

class FakeSchedule implements LoopScheduleLike {
  rows: MutableRow[] = []
  calls: string[] = []
  private next = 1

  async create(request: LoopScheduleCreate): Promise<LoopScheduleTask> {
    this.calls.push('create')
    const row: MutableRow = {
      id: `task-${this.next++}`,
      title: request.title,
      prompt: request.prompt,
      kind: request.timing.kind,
      rrule: request.timing.rrule,
      scheduledAt: '2026-11-20T01:00:00.000Z',
      status: 'active',
      createdAt: '2026-11-20T00:00:00.000Z',
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
      if (row === undefined) return undefined
      this.rows = this.rows.filter(candidate => candidate.id !== request.id)
      return undefined
    }
    if (row === undefined) throw new Error('no such task')
    Object.assign(row, request.patch.prompt === undefined ? {} : { prompt: request.patch.prompt })
    Object.assign(row, request.patch.active === undefined ? {} : { status: request.patch.active ? 'active' : 'paused' })
    Object.assign(row, request.patch.timing === undefined ? {} : { rrule: request.patch.timing.rrule })
    return row
  }

  /** Seed one row as if another actor (the operator's Automation task) had stored it. */
  seed(row: Partial<MutableRow> & { title: string }): MutableRow {
    const full: MutableRow = {
      id: `seeded-${this.next++}`,
      prompt: 'seeded prompt',
      kind: 'rrule',
      rrule: 'DTSTART:20261120T010000Z\nRRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=5',
      scheduledAt: '2026-11-20T01:00:00.000Z',
      status: 'active',
      createdAt: '2026-11-20T00:00:00.000Z',
      target: { kind: 'session', sessionId: '2d7bd1e7-1111-2222-3333-444455556666' },
      ...row,
    }
    this.rows.push(full)
    return full
  }
}

const SESSION = '2d7bd1e7-1111-2222-3333-444455556666'
const silentLogger = { info: () => {}, warn: () => {}, error: () => {} } as unknown as WorkflowLogger

/** The loop service exactly as `src/index.ts` builds it (policy from the loop keys). */
function makeLoopService(schedule: FakeSchedule) {
  return createLoopService({
    schedule: () => schedule,
    logger: silentLogger,
    policy: () => loopPolicyFromConfig(0, 0, 10, 3),
  })
}

/** The self-iteration service exactly as `src/index.ts` builds it. */
function makeIterateService(schedule: FakeSchedule, template?: string) {
  return createLoopService({
    schedule: () => schedule,
    logger: silentLogger,
    identity: {
      title: ITERATE_TASK_TITLE,
      defaultPrompt: () => {
        const trimmed = (template ?? '').trim()
        return trimmed === '' ? DEFAULT_ITERATE_TEMPLATE : trimmed
      },
    },
    policy: () => loopPolicyFromConfig(0, 0, 10, 3),
  })
}

const titles = (schedule: FakeSchedule): string[] => schedule.rows.map(row => row.title).sort()

describe('the self-iteration service owns its own slot, and only that slot', () => {
  it('open creates an RSI heartbeat row and never a Loop heartbeat row (and the reverse)', async () => {
    const schedule = new FakeSchedule()
    const loop = makeLoopService(schedule)
    const iterate = makeIterateService(schedule)

    const opened = await iterate.open({ sessionId: SESSION } as LoopOpenRequest)
    expect(opened.open).toBe(true)
    expect(titles(schedule)).toEqual([ITERATE_TASK_TITLE])
    expect(schedule.rows[0]!.prompt).toBe(DEFAULT_ITERATE_TEMPLATE)

    await loop.open({ sessionId: SESSION })
    expect(titles(schedule)).toEqual([ITERATE_TASK_TITLE, LOOP_TASK_TITLE].sort())
    const loopRow = schedule.rows.find(row => row.title === LOOP_TASK_TITLE)!
    expect(loopRow.prompt.startsWith('[grok-workflow loop]')).toBe(true)
    expect(schedule.rows.find(row => row.title === ITERATE_TASK_TITLE)!.prompt).toBe(DEFAULT_ITERATE_TEMPLATE)
  })

  it('close deletes only its own rows, even with both rows live for the same session', async () => {
    const schedule = new FakeSchedule()
    const loop = makeLoopService(schedule)
    const iterate = makeIterateService(schedule)
    await loop.open({ sessionId: SESSION })
    await iterate.open({ sessionId: SESSION })
    expect(titles(schedule)).toEqual([ITERATE_TASK_TITLE, LOOP_TASK_TITLE].sort())

    const closed = await iterate.close({ sessionId: SESSION })
    expect(closed.open).toBe(false)
    expect(titles(schedule)).toEqual([LOOP_TASK_TITLE])
    const stored = schedule.rows[0]!
    expect(stored.status).toBe('active')

    const loopClosed = await loop.close({ sessionId: SESSION })
    expect(loopClosed.open).toBe(false)
    expect(schedule.rows).toHaveLength(0)
  })

  it('status reads its own row only, so the two switches cannot report each other', async () => {
    const schedule = new FakeSchedule()
    const loop = makeLoopService(schedule)
    const iterate = makeIterateService(schedule)
    await iterate.open({ sessionId: SESSION })

    expect((await loop.status({ sessionId: SESSION })).open).toBe(false)
    const seen = await iterate.status({ sessionId: SESSION })
    expect(seen.open).toBe(true)
    expect(seen.taskId).toBe(schedule.rows[0]!.id)
  })

  it('the loop unload sweep never takes the iterate row', async () => {
    const schedule = new FakeSchedule()
    const loop = makeLoopService(schedule)
    const iterate = makeIterateService(schedule)
    await loop.open({ sessionId: SESSION })
    await iterate.open({ sessionId: SESSION })

    const deleted = await loop.stopAll('plugin unload')
    expect(deleted).toBe(1)
    expect(titles(schedule)).toEqual([ITERATE_TASK_TITLE])
    // And the iterate instance is not mounted with a sweep either (index.ts registers
    // no stopAll for it): closing is the switch's or the operator's own action.
    expect(await iterate.stopAll('not mounted')).toBe(1)
    expect(schedule.rows).toHaveLength(0)
  })

  it('reclaims an operator-armed RSI row by its title, and rewrites the template prompt in', async () => {
    const schedule = new FakeSchedule()
    const iterate = makeIterateService(schedule, DEFAULT_ITERATE_TEMPLATE)
    const seeded = schedule.seed({ title: ITERATE_TASK_TITLE, prompt: 'an operator prompt edited by hand' })

    const opened = await iterate.open({ sessionId: SESSION })
    expect(opened.taskId).toBe(seeded.id)
    // The template is the one source of the stored prompt: an armed row always carries it.
    expect(schedule.rows[0]!.prompt).toBe(DEFAULT_ITERATE_TEMPLATE)
    expect(schedule.calls.filter(call => call === 'create')).toHaveLength(0)
  })

  it('never matches the loop slot, and the loop slot never matches it', async () => {
    const schedule = new FakeSchedule()
    const seeded = schedule.seed({ title: ITERATE_TASK_TITLE, prompt: DEFAULT_ITERATE_TEMPLATE })
    expect(isLoopSlot(seeded)).toBe(false)
    expect(isLoopSlot(seeded, SESSION)).toBe(false)
    // ...while the loop identity still recognises only its own title, marker or not.
    const loopRow = schedule.seed({ title: LOOP_TASK_TITLE, prompt: 'marker edited away' })
    expect(isLoopSlot(loopRow)).toBe(true)
    expect(isLoopSlot(seeded, 'other-session')).toBe(false)
    void seeded
  })

  it('a whitespace-only template falls back to the built-in default', async () => {
    const schedule = new FakeSchedule()
    const iterate = makeIterateService(schedule, '   \n\t  ')
    await iterate.open({ sessionId: SESSION })
    expect(schedule.rows[0]!.prompt).toBe(DEFAULT_ITERATE_TEMPLATE)
  })

  it('a template edit reaches the next open: refresh rewrites the row prompt', async () => {
    const schedule = new FakeSchedule()
    let current = DEFAULT_ITERATE_TEMPLATE
    const iterate = createLoopService({
      schedule: () => schedule,
      logger: silentLogger,
      identity: { title: ITERATE_TASK_TITLE, defaultPrompt: () => current.trim() || DEFAULT_ITERATE_TEMPLATE },
      policy: () => loopPolicyFromConfig(0, 0, 10, 3),
    })
    await iterate.open({ sessionId: SESSION })
    expect(schedule.rows[0]!.prompt).toBe(DEFAULT_ITERATE_TEMPLATE)

    // The profile's template changes (a settings save); the next open refreshes the
    // row in place instead of minting a second one.
    current = DEFAULT_ITERATE_TEMPLATE.replace('self-iteration', 'self-iteration (edited)')
    await iterate.open({ sessionId: SESSION, intervalMinutes: DEFAULT_LOOP_INTERVAL_MINUTES })
    expect(schedule.rows).toHaveLength(1)
    expect(schedule.rows[0]!.prompt).toContain('(edited)')
  })

  it('still refuses an agent-attributed open, on the iterate service too', async () => {
    const schedule = new FakeSchedule()
    const iterate = makeIterateService(schedule)
    await expect(iterate.open({ sessionId: SESSION }, SESSION)).rejects.toMatchObject({ code: 'loop/user-only' })
    expect(schedule.rows).toHaveLength(0)
  })
})
