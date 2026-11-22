import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { REPLAN_LIMITS, mergeReplan, replanMergeSource } from '../src/replan.js'
import type { ReplanState } from '../src/replan.js'
import { assertWorkflowReport } from '../src/report.js'
import { buildWorkflowRequest, WORKFLOW_SCRIPT } from '../src/script.js'
import { STEERING_TOOL_NAME, SteeringQueue, closeAllSteering, openSteering, pullSteering, steeringForSession } from '../src/steering.js'
import type { NormalizedTask } from '../src/types.js'
import { execution, task, verification } from './fixtures.js'
import { roleOf, runWorkflowScript, taskFromPrompt, type ScriptAgent } from './helpers.js'

/**
 * Mid-run replan (L2): the planner behind a run accepts a new demand without
 * restarting the round.
 *
 * Two layers are pinned here:
 *
 * - the merge itself (host, pure): what it may change, what it must refuse, and
 *   that a refusal leaves the plan byte-identical;
 * - the generated script end to end: a demand merged at a wave boundary runs in the
 *   next wave, completed tasks keep their single execution, and the report carries
 *   the plan version and the boundary ledger.
 */

function config(overrides: Record<string, unknown> = {}) {
  return resolveConfig({ maxConcurrency: 4, maxTasks: 8, ...overrides })
}

function planTask(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `Task ${id}`,
    objective: `Do ${id}`,
    expectedOutput: `Output ${id}`,
    acceptanceCriteria: [`${id} works`],
    context: '',
    constraints: [],
    ...extra,
  }
}

function normalized(id: string, extra: Partial<NormalizedTask> = {}): NormalizedTask {
  return {
    id,
    title: `Task ${id}`,
    objective: `Do ${id}`,
    expectedOutput: `Output ${id}`,
    acceptanceCriteria: [`${id} works`],
    context: '',
    constraints: [],
    writesPaths: [],
    ...extra,
  }
}

function state(overrides: Partial<ReplanState> = {}): ReplanState {
  return {
    version: 1,
    settled: { a: 'verified' },
    inFlight: [],
    waves: [[normalized('b')], [normalized('c')]],
    wavesUsed: 1,
    maxTasks: 8,
    waveLimit: 8,
    ...overrides,
  }
}

describe('merge API: what a boundary may change', () => {
  it('adds a task as its own wave and keeps the plan version moving', () => {
    const outcome = mergeReplan(state(), {
      version: 2,
      edits: [{ action: 'add', task: normalized('d') }],
      reason: 'the user asked for D as well',
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.version).toBe(2)
    expect(outcome.addedTaskIds).toEqual(['d'])
    expect(outcome.waves.map(wave => wave.map(item => item.id))).toEqual([['b'], ['c'], ['d']])
    expect(outcome.decisions[0]).toContain('version 2')
  })

  it('updates and removes only unstarted tasks', () => {
    const outcome = mergeReplan(state(), {
      version: 2,
      edits: [
        { action: 'update', id: 'c', task: { title: 'Task c (revised)' } },
        { action: 'remove', id: 'b' },
      ],
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.updatedTaskIds).toEqual(['c'])
    expect(outcome.removedTaskIds).toEqual(['b'])
    expect(outcome.waves.map(wave => wave.map(item => item.id))).toEqual([['c']])
    expect(outcome.waves[0]![0]!.title).toBe('Task c (revised)')
  })

  it('refuses to touch a settled task, naming why', () => {
    const before = state()
    const outcome = mergeReplan(before, {
      version: 2,
      edits: [{ action: 'update', id: 'a', task: { title: 'rewritten' } }],
    })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toMatch(/already settled as verified/)
    expect(outcome.reason).toMatch(/preserved/)
    // A refusal changes nothing: the caller's plan is still exactly what it was.
    expect(before.waves.map(wave => wave.map(item => item.id))).toEqual([['b'], ['c']])
    expect(before.version).toBe(1)
  })

  it('refuses to touch a running task: in-flight work continues', () => {
    const outcome = mergeReplan(state({ inFlight: ['b'] }), {
      version: 2,
      edits: [{ action: 'update', id: 'b', task: { objective: 'something else' } }],
    })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toMatch(/it is running/)
  })

  it('refuses a stale version instead of merging into the wrong plan', () => {
    const outcome = mergeReplan(state({ version: 3 }), { version: 3, edits: [{ action: 'remove', id: 'b' }] })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toMatch(/does not follow plan version 3/)
  })

  it('re-orders the remaining waves when the boundary says so', () => {
    const outcome = mergeReplan(state(), {
      version: 2,
      edits: [{ action: 'add', task: normalized('d') }],
      order: [['c', 'b'], ['d']],
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.reordered).toBe(true)
    expect(outcome.waves.map(wave => wave.map(item => item.id))).toEqual([['c', 'b'], ['d']])
  })

  it('refuses an order that drops or invents a task', () => {
    const outcome = mergeReplan(state(), {
      version: 2,
      edits: [{ action: 'update', id: 'b', task: { title: 'B' } }],
      order: [['c']],
    })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toMatch(/covers 1 task/)
  })

  it('refuses a dependency that points at the same or a later wave', () => {
    const outcome = mergeReplan(state(), {
      version: 2,
      edits: [{ action: 'add', task: normalized('d', { dependsOn: ['d'] }) }],
    })
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.reason).toMatch(/depends on itself/)
  })

  it('keeps the wave ceiling and the task ceiling enforced', () => {
    const waves = Array.from({ length: 7 }, (_, index) => [normalized(`w${index}`)])
    const tooManyWaves = mergeReplan(state({ waves, wavesUsed: 2, waveLimit: 8, maxTasks: 20 }), {
      version: 2,
      edits: [{ action: 'add', task: normalized('extra') }],
    })
    expect(tooManyWaves.ok).toBe(false)
    if (!tooManyWaves.ok) expect(tooManyWaves.reason).toMatch(/the limit is 8/)

    const tooManyTasks = mergeReplan(state({ maxTasks: 2 }), {
      version: 2,
      edits: [{ action: 'add', task: normalized('d') }],
    })
    expect(tooManyTasks.ok).toBe(false)
    if (!tooManyTasks.ok) expect(tooManyTasks.reason).toMatch(/maxTasks is 2/)
  })

  it('emits the guest source and evaluates it to the same function', () => {
    const guest = new Function(`${replanMergeSource()}\nreturn mergeReplan;`)() as typeof mergeReplan
    const request = { version: 2, edits: [{ action: 'add' as const, task: normalized('d') }] }
    expect(guest(state(), request)).toEqual(mergeReplan(state(), request))
  })
})

describe('steering queue: bounded, consumed exactly once', () => {
  afterEach(() => closeAllSteering())

  it('hands every queued demand to the pull tool once', () => {
    const { token } = openSteering('session-1')
    const queue = steeringForSession('session-1')!
    queue.push('also do D')
    queue.push('and cover E')
    const first = pullSteering(token)
    expect(first.intents.map(intent => intent.text)).toEqual(['also do D', 'and cover E'])
    expect(pullSteering(token).intents).toEqual([])
  })

  it('drops the oldest demand past the queue bound and counts it', () => {
    const queue = new SteeringQueue('tok')
    for (let index = 0; index < REPLAN_LIMITS.maxIntents + 2; index++) queue.push(`demand ${index}`)
    expect(queue.size).toBe(REPLAN_LIMITS.maxIntents)
    expect(queue.dropped).toBe(2)
    expect(queue.take().intents[0]!.text).toBe('demand 2')
  })

  it('answers an unknown token with an empty list instead of failing', () => {
    expect(pullSteering('nope')).toEqual({ intents: [], dropped: 0 })
    expect(pullSteering(undefined)).toEqual({ intents: [], dropped: 0 })
  })

  it('closes the session channel with the run', () => {
    const { token } = openSteering('session-2')
    expect(steeringForSession('session-2')?.token).toBe(token)
    closeAllSteering()
    expect(steeringForSession('session-2')).toBeUndefined()
  })
})

describe('script: a demand merged at a wave boundary does not restart the round', () => {
  const OBJECTIVE = 'Ship the replanned waves'

  function replanArgs(): Record<string, unknown> {
    const request = buildWorkflowRequest(OBJECTIVE, undefined, config({ replan: true }), 'zh', undefined, undefined, undefined, 'tok-script')
    return { ...request.args, replan: { enabled: true, token: 'tok-script', tool: STEERING_TOOL_NAME } }
  }

  function scripted(plan: unknown, boundaryAnswers: unknown[]): ScriptAgent {
    let plannerCalls = 0
    return async (prompt, options) => {
      const role = roleOf(options.label)
      if (role === 'planner') {
        if (prompt.includes('REPLAN:')) {
          plannerCalls += 1
          return boundaryAnswers.shift() ?? { action: 'none', reason: 'nothing queued' }
        }
        return plan
      }
      const taskValue = taskFromPrompt(prompt)
      if (role === 'worker') return execution(`did ${taskValue.id}`)
      return verification(taskValue as never)
    }
  }

  it('runs the merged task in the next wave and never re-runs settled work', async () => {
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      replanArgs(),
      scripted(
        { waves: [[planTask('a')], [planTask('b')], [planTask('c')]] },
        [
          { action: 'apply', reason: 'user asked for D', edits: [{ action: 'add', task: planTask('d') }] },
          { action: 'none', reason: 'nothing new' },
        ],
      ),
    )
    // Every completed task executed exactly once: the merge kept the settled rows
    // and only appended the new one.
    const workerIds = run.calls.filter(call => roleOf(call.label) === 'worker').map(call => taskFromPrompt(call.prompt).id)
    expect(workerIds).toEqual(['a', 'b', 'c', 'd'])
    expect(run.report.plan.version).toBe(2)
    expect(run.report.plan.waves).toEqual([['a'], ['b'], ['c'], ['d']])
    expect(run.report.tasks.map(row => row.status)).toEqual(['verified', 'verified', 'verified', 'verified'])
    // Four waves means three boundaries: one merged, two found nothing to merge.
    expect(run.report.plan.replans?.map(row => row.decision)).toEqual(['applied', 'none', 'none'])
    expect(run.report.plan.replans?.[0]?.addedTaskIds).toEqual(['d'])
    // Progress in the session: one member group per boundary, and a log line that
    // names the version and the decision.
    const boundaryCall = run.calls.find(call => call.prompt.includes('REPLAN:'))
    expect(boundaryCall?.phase).toBe('规划 · 波 1 边界')
    expect(run.events.some(event => event.includes('replan v2 applied at wave 1 boundary'))).toBe(true)
    // The report the run produced is a valid report, not just an object.
    expect(() => assertWorkflowReport(run.report, OBJECTIVE, config({ replan: true }))).not.toThrow()
  })

  it('continues on the old plan when the merge is refused, and says why', async () => {
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      replanArgs(),
      scripted(
        { waves: [[planTask('a')], [planTask('b')]] },
        [
          { action: 'apply', reason: 'rewrite finished work', edits: [{ action: 'update', id: 'a', task: { title: 'Task a again' } }] },
        ],
      ),
    )
    expect(run.report.plan.version).toBe(1)
    expect(run.report.plan.replans?.[0]?.decision).toBe('rejected')
    expect(run.report.plan.replans?.[0]?.reason).toMatch(/already settled as verified/)
    // Work is preserved and not re-executed.
    expect(run.calls.filter(call => roleOf(call.label) === 'worker')).toHaveLength(2)
    expect(run.report.tasks.every(row => row.status === 'verified')).toBe(true)
    expect(run.report.status).toBe('completed')
  })

  it('stays completely inert when the run carries no replan channel', async () => {
    const request = buildWorkflowRequest(OBJECTIVE, undefined, config())
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      request.args,
      scripted({ waves: [[planTask('a')], [planTask('b')]] }, []),
    )
    expect(run.calls.filter(call => roleOf(call.label) === 'planner')).toHaveLength(1)
    expect(run.report.plan.version).toBe(1)
    expect(run.report.plan.replans).toEqual([])
  })
})