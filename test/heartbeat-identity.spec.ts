/**
 * Two heartbeats, one repository: **Loop** (auto-continue) and **Iterate** (the RSI
 * self-iteration loop). They are independent drivers that happen to deliver the same
 * shape of message — a Schedule task whose prompt lands in a session as
 * `source.kind === 'schedule'` — so the only thing keeping them apart is *identity*:
 * a stored task name, a prompt marker, a route and a tool.
 *
 * This file is that identity, pinned. It reads the Iterate heartbeat from the artifact
 * that actually ships it (`.rsi/HEARTBEAT.md`), not from a copy in the test, so an edit
 * to the operator's template that collides with the Loop marker fails here instead of
 * silently steering one heartbeat into the other's handler.
 *
 * What is real: the shipped constants (`LOOP_*` and `ITERATE_*`), `isLoopHeartbeat` /
 * `isLoopSlot` / `isLoopTask`, the real `classifyPreStep` dispatcher, and two real
 * `createLoopService` instances — the same wiring `src/index.ts` builds. What is a
 * boundary fake: DSH's Schedule service (a durable Host service this bundle cannot
 * start in CI) and the brake port, which is a spy here precisely because the property
 * under test is *not being called*.
 *
 * What a unit test cannot answer — whether the Host really fires a delivery, and what
 * the operator's Automation UI shows — is `NOT_RUN` here and stated as such in
 * `docs/knowledge/HEARTBEATS.md`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { describe, expect, it, vi } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { classifyPreStep } from '../src/gate.js'
import type { PreStepPayload } from '../src/gate.js'
import {
  ITERATE_ROUTE_PATH,
  ITERATE_TASK_TITLE,
  LOOP_PROMPT_PREFIX,
  LOOP_ROUTE_PATH,
  LOOP_TASK_TITLE,
  LOOP_TOOL_NAME,
  createLoopService,
  defaultLoopPrompt,
  isLoopHeartbeat,
  isLoopSlot,
  isLoopTask,
} from '../src/loop.js'
import type { LoopScheduleCreate, LoopScheduleEdit, LoopScheduleLike, LoopScheduleTask } from '../src/loop.js'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * The Iterate heartbeat exactly as the RSI turn receives it.
 *
 * Rendered from `.rsi/HEARTBEAT.md` the same way `.rsi/tools/heartbeat-guard.sh
 * --prompt` renders it: the template between the markers, with this round's numbers
 * filled in. The placeholders are the guard's own names, so a rename of the template
 * shows up here as a failure rather than as a heartbeat that stopped matching.
 * @returns the delivered prompt text.
 */
function iterateHeartbeatPrompt(): string {
  const template = readFileSync(join(REPO_ROOT, '.rsi', 'HEARTBEAT.md'), 'utf8')
  const between = /<!-- heartbeat-template:start -->([\s\S]*?)<!-- heartbeat-template:end -->/.exec(template)
  if (between === null) throw new Error('.rsi/HEARTBEAT.md has no heartbeat template between its markers')
  return (between[1] ?? '')
    .replaceAll('{{NEXT_ROUND}}', '23')
    .replaceAll('{{LAST_ROUND_SUMMARY}}', 'round 22 — checkpoint durationMs (OK)')
}

/** One Schedule delivery in DSH's own framing, measured live in RSI round 17. */
function delivery(prompt: string): UserMessage {
  return createUserMessage({
    content: [{
      type: 'text',
      text: '[SCHEDULE REMINDER]\nThis is a scheduled message from the user\n' +
        'schedule_id_json: "schedule-identity"\noccurrence_at: 2026-11-19T01:07:01.365Z\n' +
        `reminder_prompt_json: ${JSON.stringify(prompt)}`,
    }],
    source: { kind: 'schedule' } as never,
  }) as unknown as UserMessage
}

/** The minimal agent surface the dispatcher reads: a session id and its header. */
function agentOf(sessionId = 'session-a'): unknown {
  return { session: { id: sessionId, header: {} } }
}

/** A brake port that records every call; `review` says "continue" unless told otherwise. */
function brakePort(verdict: { kind: 'continue' } | { kind: 'stop'; code: string; detail: string } = { kind: 'continue' }) {
  return {
    review: vi.fn(() => verdict as never),
    admit: vi.fn(),
    stop: vi.fn(async () => {}),
  }
}

/** One Schedule row; only the fields this plugin reads. */
function row(over: Partial<LoopScheduleTask> & { id: string }): LoopScheduleTask {
  return {
    title: LOOP_TASK_TITLE,
    prompt: `${LOOP_PROMPT_PREFIX} Loop heartbeat: continue`,
    kind: 'rrule',
    rrule: 'RRULE:FREQ=MINUTELY;INTERVAL=60;COUNT=3',
    scheduledAt: '2026-11-19T01:00:00.000Z',
    status: 'active',
    target: { kind: 'session', sessionId: 'session-a' },
    ...over,
  }
}

/** One row under the Iterate identity, as the operator's own Automation task stores it. */
function iterateRow(): LoopScheduleTask {
  return row({
    id: 'task-iterate',
    title: ITERATE_TASK_TITLE,
    prompt: '# RSI heartbeat — round 23\n\nThis message was delivered by an Automation task',
  })
}

/** Recording Schedule: enough of the Host service for ownership, cleanup and one open. */
class RecordingSchedule implements LoopScheduleLike {
  constructor(public rows: LoopScheduleTask[]) {}
  readonly edits: LoopScheduleEdit[] = []
  readonly creates: LoopScheduleCreate[] = []

  async create(request: LoopScheduleCreate): Promise<LoopScheduleTask> {
    this.creates.push(request)
    const task = row({
      id: `task-created-${this.creates.length}`,
      title: request.title,
      prompt: request.prompt,
      rrule: request.timing.rrule,
      target: request.target,
    })
    this.rows = [...this.rows, task]
    return task
  }

  async catalog(): Promise<LoopScheduleTask[]> {
    return this.rows.map(entry => ({ ...entry }))
  }

  async edit(request: LoopScheduleEdit): Promise<unknown> {
    this.edits.push(request)
    const found = this.rows.find(entry => entry.id === request.id)
    if (request.action === 'delete') {
      this.rows = this.rows.filter(entry => entry.id !== request.id)
      return { id: request.id, action: 'delete' }
    }
    return found === undefined ? undefined : { ...found }
  }
}

describe('the two heartbeats have identities that cannot be confused', () => {
  it('gives the Loop heartbeat its own name, marker, route and tool', () => {
    // Code-owned, so the audit has one authority to point at: `src/loop.ts`.
    expect(LOOP_TASK_TITLE).toBe('Loop heartbeat')
    expect(LOOP_PROMPT_PREFIX).toBe('[grok-workflow loop]')
    expect(LOOP_ROUTE_PATH).toBe('/grok-workflow/loop')
    expect(LOOP_TOOL_NAME).toBe('grok_loop')
  })

  it('gives the Iterate heartbeat a prompt that carries none of the Loop identity', () => {
    const iterate = iterateHeartbeatPrompt()
    // Its own first line, and the round number the guard filled in.
    expect(iterate.trimStart().startsWith('# RSI heartbeat — round 23')).toBe(true)
    // Not one byte of the Loop's ownership marker, in any shape the gate accepts.
    expect(iterate.includes(LOOP_PROMPT_PREFIX)).toBe(false)
    expect(iterate.includes('grok-workflow loop')).toBe(false)
    expect(iterate.includes(LOOP_TASK_TITLE)).toBe(false)
    // And the Loop's own prompt does not borrow the Iterate identity.
    const loop = defaultLoopPrompt(3)
    expect(loop.includes('RSI heartbeat')).toBe(false)
    expect(loop.trimStart().startsWith('# RSI heartbeat')).toBe(false)
  })

  it('reads each prompt as exactly one identity, and the Iterate one as the plugin\'s none', () => {
    const iterate = iterateHeartbeatPrompt()
    // The stored Loop prompt verbatim, and the same prompt inside DSH's framing: both
    // shapes the gate accepts, and the one identity they may read as.
    expect(isLoopHeartbeat(defaultLoopPrompt(3))).toBe(true)
    expect(isLoopHeartbeat(
      'reminder_prompt_json: ' + JSON.stringify(defaultLoopPrompt(3)),
    )).toBe(true)
    expect(isLoopHeartbeat(iterate)).toBe(false)
    // A delivery of the Iterate prompt inside DSH's framing is still not a Loop heartbeat.
    const framedIterate = '[SCHEDULE REMINDER]\nThis is a scheduled message from the user\n' +
      'schedule_id_json: "schedule-identity"\noccurrence_at: 2026-11-19T01:07:01.365Z\n' +
      `reminder_prompt_json: ${JSON.stringify(iterate)}`
    expect(isLoopHeartbeat(framedIterate)).toBe(false)
  })
})

describe('the dispatcher routes a delivery to exactly one handler', () => {
  const config = resolveConfig({ grokDefault: 'on' })
  const classify = (loop: unknown, message: UserMessage) =>
    classifyPreStep({ config, loop } as never, { agent: agentOf(), messages: [message], turn: 1, step: 1 } as unknown as PreStepPayload)

  it('sends an Iterate delivery through the non-user pass, never into the Loop handler', () => {
    const loop = brakePort()
    const verdict = classify(loop, delivery(iterateHeartbeatPrompt()))
    // The generic pass is the *only* correct destination: it starts no run and charges
    // no round. `loop-continuation` here would mean the RSI turn was billed to the loop.
    expect(verdict).toEqual({ kind: 'pass', reason: 'non-user-source' })
    expect(loop.review).not.toHaveBeenCalled()
    expect(loop.admit).not.toHaveBeenCalled()
    expect(loop.stop).not.toHaveBeenCalled()
  })

  it('sends a Loop delivery into the Loop handler, and charges exactly one round', () => {
    const loop = brakePort()
    const verdict = classify(loop, delivery(defaultLoopPrompt(3)))
    expect(verdict).toEqual({ kind: 'pass', reason: 'loop-continuation' })
    expect(loop.review).toHaveBeenCalledTimes(1)
    expect(loop.admit).toHaveBeenCalledTimes(1)
  })

  it('treats a user message that pastes the Loop marker as an ordinary request', () => {
    // The marker alone is not identity: a person can type it. Only the pair
    // (`source.kind === 'schedule'` *and* the marker) enters the Loop handler, so a
    // pasted marker must still be admitted as the request it is.
    const loop = brakePort()
    const pasted = createUserMessage({
      content: [{ type: 'text', text: `${LOOP_PROMPT_PREFIX} Loop heartbeat: continue` }],
      source: { kind: 'user' } as never,
    }) as unknown as UserMessage
    expect(classify(loop, pasted)).toMatchObject({ kind: 'admit' })
    expect(loop.review).not.toHaveBeenCalled()
    expect(loop.admit).not.toHaveBeenCalled()
  })

  it('cannot let an Iterate delivery trip a Loop brake and delete the loop row', () => {
    // A brake verdict that would stop the loop is the sharpest probe available: if the
    // Iterate prompt reached `review`, this delivery would spend the loop's row.
    const loop = brakePort({ kind: 'stop', code: 'loop/stop-file', detail: 'stop marker exists' })
    expect(classify(loop, delivery(iterateHeartbeatPrompt()))).toEqual({ kind: 'pass', reason: 'non-user-source' })
    expect(loop.review).not.toHaveBeenCalled()
    expect(loop.stop).not.toHaveBeenCalled()
    // The positive control: the same brake does stop a real Loop delivery. Policy is
    // the caller's half — `classifyPreStep` returns the verdict and the gate's handler
    // is what deletes the row — so the verdict is what this level can honestly assert.
    expect(classify(loop, delivery(defaultLoopPrompt(3)))).toMatchObject({ kind: 'loop-stop' })
    expect(loop.review).toHaveBeenCalledTimes(1)
    expect(loop.admit).not.toHaveBeenCalled()
  })
})

describe('the Loop service never adopts, charges or deletes the Iterate task', () => {
  it('ignores an Iterate row when it reads the switch state', async () => {
    const schedule = new RecordingSchedule([iterateRow()])
    const service = createLoopService({ schedule: () => schedule, logger: { warn: vi.fn() } })
    // The composer switch must not read the RSI task as "the loop is on".
    expect(await service.status({ sessionId: 'session-a' })).toEqual({ open: false, sessionId: 'session-a' })
    expect(isLoopSlot(iterateRow())).toBe(false)
    expect(isLoopTask(iterateRow())).toBe(false)
  })

  it('leaves the Iterate row stored when the loop is closed, archived, or unloaded', async () => {
    const schedule = new RecordingSchedule([row({ id: 'task-loop' }), iterateRow()])
    const service = createLoopService({ schedule: () => schedule, logger: { warn: vi.fn() } })
    // Close removes the Loop row and nothing else.
    expect(await service.close({ sessionId: 'session-a' })).toEqual({ open: false, sessionId: 'session-a' })
    expect(schedule.rows.map(entry => entry.id)).toEqual(['task-iterate'])
    // Archive cleanup and unload are the same rule, so the RSI task survives both.
    expect(await service.forgetSession('session-a')).toBe(0)
    expect(await service.stopAll('plugin unload')).toBe(0)
    expect(schedule.rows.map(entry => entry.id)).toEqual(['task-iterate'])
    expect(schedule.edits).toEqual([{ id: 'task-loop', action: 'delete' }])
  })
})

/** The second service instance: same class, the Iterate identity (src/index.ts wiring). */
function iterateService(schedule: LoopScheduleLike) {
  return createLoopService({
    schedule: () => schedule,
    logger: { warn: vi.fn() },
    identity: { title: ITERATE_TASK_TITLE, defaultPrompt: () => '# RSI heartbeat — self-iteration round' },
  })
}

/**
 * The other direction of the same rule.
 *
 * The two switches are two instances of one service class, so isolation has to hold
 * from *both* ends: the previous block proves the loop ignores the RSI row, this one
 * proves the RSI service ignores the loop's. The archive sweep is the case that caught
 * a real leak — it used the loop's slot predicate for every instance, so an iterate
 * sweep deleted the loop's row and left its own.
 */
describe('the Iterate service never adopts, charges or deletes the Loop task', () => {
  it('reads its own row only, never the loop\'s', async () => {
    const schedule = new RecordingSchedule([row({ id: 'task-loop' })])
    const service = iterateService(schedule)
    expect(await service.status({ sessionId: 'session-a' })).toEqual({ open: false, sessionId: 'session-a' })
    expect(schedule.rows.map(entry => entry.id)).toEqual(['task-loop'])
  })

  it('closes its own row and leaves the loop\'s', async () => {
    const schedule = new RecordingSchedule([row({ id: 'task-loop' }), iterateRow()])
    const service = iterateService(schedule)
    expect(await service.close({ sessionId: 'session-a' })).toEqual({ open: false, sessionId: 'session-a' })
    expect(schedule.rows.map(entry => entry.id)).toEqual(['task-loop'])
    expect(schedule.edits).toEqual([{ id: 'task-iterate', action: 'delete' }])
  })

  it('sweeps its own row only on archive and on unload', async () => {
    const schedule = new RecordingSchedule([row({ id: 'task-loop' }), iterateRow()])
    const service = iterateService(schedule)
    // Archive cleanup: the loop's row is not this service's to delete.
    expect(await service.forgetSession('session-a')).toBe(1)
    expect(schedule.rows.map(entry => entry.id)).toEqual(['task-loop'])
    // Unload: same rule, and the loop service's own sweep is what takes its row away.
    expect(await service.stopAll('plugin unload')).toBe(0)
    expect(schedule.rows.map(entry => entry.id)).toEqual(['task-loop'])
  })

  it('drops a duplicate RSI row on open instead of delivering twice', async () => {
    // The same one-row invariant the loop enforces, per slot: two `RSI heartbeat` rows
    // would deliver two rounds per interval.
    const schedule = new RecordingSchedule([
      row({ id: 'task-loop' }),
      iterateRow(),
      row({ id: 'task-iterate-2', title: ITERATE_TASK_TITLE, prompt: '# RSI heartbeat — round 22' }),
    ])
    const service = iterateService(schedule)
    await service.open({ sessionId: 'session-a' })
    expect(schedule.rows.map(entry => entry.id)).toEqual(['task-loop', 'task-iterate'])
  })

  it('opens the RSI slot with an unmarked prompt and leaves the loop\'s row alone', async () => {
    const schedule = new RecordingSchedule([row({ id: 'task-loop' })])
    const service = iterateService(schedule)
    const opened = await service.open({ sessionId: 'session-a' })
    expect(opened.open).toBe(true)
    const created = schedule.creates[0]!
    expect(created.title).toBe(ITERATE_TASK_TITLE)
    // The identity that keeps the gate from reading this as a continuation.
    expect(created.prompt.startsWith(LOOP_PROMPT_PREFIX)).toBe(false)
    expect(isLoopHeartbeat(created.prompt)).toBe(false)
    expect(schedule.rows.map(entry => entry.title)).toEqual([LOOP_TASK_TITLE, ITERATE_TASK_TITLE])
  })
})

describe('the reserved name is a slot, and the marker is the routing identity', () => {
  it('treats a row named Loop heartbeat without the marker as this plugin\'s slot, not as a heartbeat', () => {
    // A prompt is editable text (DSH's own `schedule_edit` takes `prompt`), so a row
    // whose marker was edited away is still the row this plugin opened: the switch must
    // be able to close it, and unload must be able to take it away. It must never route
    // as a heartbeat, because routing is what the marker proves.
    const edited = row({ id: 'task-edited', prompt: 'a prompt the operator rewrote' })
    expect(isLoopSlot(edited)).toBe(true)
    expect(isLoopTask(edited)).toBe(false)
    expect(isLoopHeartbeat(edited.prompt)).toBe(false)
  })

  it('stays out of every other task, whatever its prompt says', () => {
    // The two directions of the same rule: our name is ours, and another name is not.
    expect(isLoopSlot(row({ id: 'x', title: 'Someone else task' }))).toBe(false)
    expect(isLoopSlot(row({ id: 'x', kind: 'every' }))).toBe(false)
    expect(isLoopSlot(row({ id: 'x' }), 'session-b')).toBe(false)
    // The Iterate task, under its own name, is never in this slot.
    expect(isLoopSlot(row({ id: 'x', title: 'RSI heartbeat', prompt: '# RSI heartbeat — round 23' }))).toBe(false)
  })
})
