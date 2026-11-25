import { afterEach, describe, expect, it } from 'vitest'
import { Session } from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import { resolveConfig } from '../src/config.js'
import { parseMemberLabel } from '../src/naming.js'
import { REPLAN_LIMITS, mergeReplan, replanMergeSource } from '../src/replan.js'
import type { ReplanEdit, ReplanState } from '../src/replan.js'
import { assertWorkflowReport } from '../src/report.js'
import { createActiveState, runWorkflow } from '../src/run.js'
import type { RunOutcome, WorkflowLogger } from '../src/run.js'
import { buildWorkflowRequest, WORKFLOW_SCRIPT } from '../src/script.js'
import {
  STEERING_TOOL_NAME, SteeringQueue, closeAllSteering, closeSteering, openSteering, pullSteering, steeringForSession,
} from '../src/steering.js'
import { teamWorkflowEngine } from '../src/team-engine.js'
import type { NormalizedTask, WorkflowReport } from '../src/types.js'
import { createEngineHarness, type ChildAnswer, type ChildCall } from './engine-harness.js'
import { execution, task, verification } from './fixtures.js'
import { roleOf, runWorkflowScript, settledWithin, taskFromPrompt, type ScriptAgent } from './helpers.js'

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

  it('reads a task body written beside "action" (a live boundary wrote one there)', () => {
    // The words are the live boundary child's own, copied out of the 2026-11-26 soak
    // (`soak-pull-and-merge.txt`): it put id/title/objective beside `action` instead
    // of under `task`, and the merge refused a demand it had understood.
    const flat = {
      action: 'add' as const,
      id: 'task-4',
      title: '报告 CHANGELOG 与 README 行数差值',
      objective: '基于已统计的 README.md 与 CHANGELOG.md 行数，计算两者行数差值（CHANGELOG - README）并在最终报告中额外给出',
      expectedOutput: '一行差值，带算式',
      acceptanceCriteria: ['差值等于 CHANGELOG 行数减 README 行数'],
      dependsOn: ['b'],
    } as ReplanEdit & Record<string, unknown>
    const outcome = mergeReplan(state(), { version: 2, edits: [flat] })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.addedTaskIds).toEqual(['task-4'])
    expect(outcome.waves.map(wave => wave.map(item => item.id))).toEqual([['b'], ['c'], ['task-4']])
    expect(outcome.waves[2]![0]!.title).toBe('报告 CHANGELOG 与 README 行数差值')
    // Lifting is about the nesting level only: the dependency the same child made up
    // ("changelog_count" is a name it invented, no task has that id) is still refused
    // and named, because a silently dropped dependency is a task that runs too early.
    const invented = { ...flat, dependsOn: ['changelog_count'] }
    const refused = mergeReplan(state(), { version: 2, edits: [invented] })
    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toMatch(/depends on unknown task changelog_count/)
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

  it('closes only its own token, so an older run cannot unsteer a newer one', () => {
    const first = openSteering('session-3')
    const second = openSteering('session-3')
    // One queue per session: the newest run owns it.
    expect(steeringForSession('session-3')?.token).toBe(second.token)
    closeSteering(first.token)
    expect(steeringForSession('session-3')?.token).toBe(second.token)
    expect(pullSteering(second.token)).toEqual({ intents: [], dropped: 0 })
    closeSteering(second.token)
    expect(steeringForSession('session-3')).toBeUndefined()
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

  /**
   * The two cases below replay, word for word, the answer a live boundary child
   * gave on 2026-11-26 (`.rsi/evidence/inbox-steering-2026-11-26/soak-pull-and-merge.txt`).
   * It had read the queued demand correctly and argued it correctly; the merge still
   * refused, because the task's own fields sat beside `action` instead of under
   * `task` and two mandatory fields were never written at all. Those are two
   * different faults and the plan answers them differently: the nesting is lifted,
   * the missing content is refused with the field named.
   */
  const LIVE_BODY = {
    id: 'task-4',
    title: '报告 CHANGELOG 与 README 行数差值',
    objective: '基于已统计的 README.md 与 CHANGELOG.md 行数，计算两者行数差值（CHANGELOG - README）并在最终报告中额外给出',
  }
  const LIVE_REASON = '新增差值报告需求依赖两文件的行数统计，将其作为依赖 changelog_count 的新收尾任务追加，不改动已沉淀任务。'

  it('lifts a task body written beside "action" and runs the added task', async () => {
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      replanArgs(),
      scripted(
        { waves: [[planTask('a')], [planTask('b')], [planTask('c')]] },
        [
          {
            action: 'apply',
            reason: LIVE_REASON,
            // The live shape: the body's fields live on the edit, not under `task`.
            edits: [
              { ...LIVE_BODY, action: 'add', expectedOutput: '一行差值，带算式', acceptanceCriteria: ['差值等于 CHANGELOG 行数减 README 行数'], dependsOn: ['c'] },
            ],
          },
          { action: 'none', reason: 'nothing new' },
        ],
      ),
    )
    expect(run.report.plan.version).toBe(2)
    expect(run.report.plan.replans?.[0]?.decision).toBe('applied')
    expect(run.report.plan.replans?.[0]?.addedTaskIds).toEqual(['task-4'])
    expect(run.report.plan.waves).toEqual([['a'], ['b'], ['c'], ['task-4']])
    const workerIds = run.calls.filter(call => roleOf(call.label) === 'worker').map(call => taskFromPrompt(call.prompt).id)
    expect(workerIds).toEqual(['a', 'b', 'c', 'task-4'])
    expect(run.report.tasks.map(row => row.status)).toEqual(['verified', 'verified', 'verified', 'verified'])
  })

  it('refuses the same answer for the content it never wrote, not for where it wrote it', async () => {
    const run = await runWorkflowScript(
      WORKFLOW_SCRIPT,
      replanArgs(),
      scripted(
        { waves: [[planTask('a')], [planTask('b')]] },
        [
          {
            action: 'apply',
            reason: LIVE_REASON,
            edits: [{ ...LIVE_BODY, action: 'add', dependsOn: ['changelog_count'] }],
          },
        ],
      ),
    )
    expect(run.report.plan.version).toBe(1)
    const decision = run.report.plan.replans?.[0]
    expect(decision?.decision).toBe('rejected')
    // The nesting was tolerated (no "no body"), and the refusal names what is
    // missing: a task with no expected output and no criterion cannot be verified.
    expect(decision?.reason).not.toMatch(/no body/)
    expect(decision?.reason).toMatch(/missing or unusable: expectedOutput, acceptanceCriteria/)
    expect(run.report.status).toBe('completed')
    expect(run.report.tasks.map(row => row.status)).toEqual(['verified', 'verified'])
  })
})

/**
 * The boundary prompt is the only place a settled task is described to the child
 * that edits the plan. Until 2026-11-26 the script handed `replanPrompt` a bare
 * id → status map while the prompt reads `row.status` and `row.task.title`, so a
 * live boundary read every settled line as `- count-agents [undefined] ` — the
 * child could not see what had already passed, and its only evidence about the
 * settled half of the plan was a blank. This case drives the real engine (script
 * VM, twin, generated script) and pins the line the child actually reads.
 */
describe('script: the boundary prompt names what already settled', () => {
  const OBJECTIVE = 'Ship the settled rows'

  /** The role a child belongs to, read the way the panel reads it (prompt first line). */
  function roleOfCall(call: { prompt: string }): string {
    const head = call.prompt.split('\n')[0]!.trim()
    return parseMemberLabel(head, 'zh')?.role
      ?? parseMemberLabel(head.split('·')[0]!.trim(), 'zh')?.role
      ?? ''
  }

  /** Run the generated script over the real engine and the plugin's twin. */
  async function runReal(
    answer: (call: ChildCall) => ChildAnswer,
    cfg: ReturnType<typeof resolveConfig>,
    token: string,
  ): Promise<{ report: WorkflowReport, children: ChildCall[] }> {
    const harness = createEngineHarness(async call => answer(call))
    try {
      const payload = buildWorkflowRequest(OBJECTIVE, undefined, cfg, 'zh', undefined, undefined, undefined, token)
      const engine = teamWorkflowEngine(harness.ctx as never, { warn() {} })
      const run = engine.start({
        script: payload.script,
        meta: { name: '任务团队', description: 'settled rows run' },
        args: payload.args,
        parent: { session: { header: {}, id: 'settled-rows-parent' } } as never,
        maxTotalAgents: payload.maxTotalAgents,
      })
      const result = await settledWithin(run.result, 15_000, 'the settled rows twin run')
      await run.dispose()
      return { report: assertWorkflowReport(result.value, OBJECTIVE, cfg), children: harness.children }
    } finally {
      await harness.dispose()
    }
  }

  it('prints each settled row with its verdict and its title, and no "undefined"', async () => {
    const run = await runReal(call => {
      const role = roleOfCall(call)
      if (role === 'planner') {
        if (call.prompt.includes('REPLAN:')) return { structured: { action: 'none', reason: 'nothing queued' } }
        return { structured: { waves: [[planTask('a')], [planTask('b')]] } }
      }
      if (role === 'worker') return { structured: execution('did the work') }
      return { structured: verification(taskFromPrompt(call.prompt)) }
    }, config({ replan: true }), 'tok-settled')

    const boundary = run.children.find(call => call.prompt.includes('REPLAN:'))
    expect(boundary).toBeDefined()
    // task `a` has already verified when the boundary asks, so the row the child
    // reads carries both the verdict and the title the plan gave it.
    const settledLine = boundary!.prompt.split('\n').find(line => line.startsWith('- a '))
    expect(settledLine).toBe('- a [verified] Task a')
    expect(boundary!.prompt).not.toContain('undefined')
    expect(run.report.tasks.map(row => row.status)).toEqual(['verified', 'verified'])
  })
})

/**
 * Wiring: the run itself owns the live channel.
 *
 * The queue, the pull tool and the boundary merge were all in place, but nothing
 * opened a queue any more: the entry chain that used to do it was deleted as a
 * whole, taking `openSteering` with it, so a demand queued for a live run had no
 * channel to land in. These cases pin the restored wiring at the seam that can
 * prove it without a model — the request the engine is actually handed, and the
 * module-level registry the pull tool reads — and they pin both directions of the
 * switch, because "a channel exists" and "the payload never changed for callers
 * that did not ask for one" are the two halves of the same claim.
 */
describe('wiring: the run owns the live channel', () => {
  const OBJECTIVE = 'Ship the replanned waves'

  interface WireResult { value: unknown, stopReason: string, agentsStarted: number }

  class WireRun {
    readonly id: string
    readonly meta: WorkflowStartRequest['meta']
    readonly dispose = async (): Promise<void> => {}
    readonly result: Promise<WireResult>
    private settleWith!: (result: WireResult) => void

    constructor(meta: WorkflowStartRequest['meta'], index: number) {
      this.id = `wire-run-${index}`
      this.meta = meta
      this.result = new Promise(resolve => { this.settleWith = resolve })
    }

    cancel(): void { this.settle('cancelled') }

    settle(stopReason: string, value: unknown = null): void {
      this.settleWith({ value, stopReason, agentsStarted: 0 })
    }
  }

  class WireEngine {
    readonly starts: WorkflowStartRequest[] = []
    readonly runs: WireRun[] = []

    async start(request: WorkflowStartRequest): Promise<WireRun> {
      this.starts.push(request)
      const run = new WireRun(request.meta, this.runs.length + 1)
      this.runs.push(run)
      return run
    }
  }

  function loggerWith(warnings: string[]): WorkflowLogger {
    return { warn: (message: string) => { warnings.push(message) }, info: () => {} }
  }

  /** Start one run against the fake engine; `steering: false` asks for no channel. */
  function begin(
    engine: WireEngine,
    warnings: string[],
    options: { steering?: boolean, config?: Record<string, unknown> } = {},
  ): Promise<RunOutcome> {
    const logger = loggerWith(warnings)
    return runWorkflow({
      // The fake engine is the whole context these cases touch: no event bus, no
      // session store, no filesystem seam beyond the suite's scratch directories.
      ctx: { workflowEngine: engine, logger: () => logger } as never,
      config: config(options.config ?? {}),
      state: createActiveState(),
      logger,
      agent: { session: Session.create('sess-wire' as SessionId) } as never,
      objective: OBJECTIVE,
      callerTasks: [normalized('a')],
      resumeLister: 'skip',
      ...options.steering === false ? {} : { steering: { sessionId: 'sess-wire' } },
      failureMode: 'report',
    })
  }

  async function waitForStart(engine: WireEngine): Promise<WorkflowStartRequest> {
    while (engine.starts.length === 0) await new Promise(resolve => { setImmediate(resolve) })
    return engine.starts[0]!
  }

  afterEach(() => closeAllSteering())

  it('hands the boundary planner the live token, then closes the queue with the run', async () => {
    const engine = new WireEngine()
    const warnings: string[] = []
    const pending = begin(engine, warnings)
    const request = await waitForStart(engine)
    const replan = (request.args as { replan?: { enabled?: boolean, token?: string, tool?: string } }).replan
    expect(replan).toEqual({ enabled: true, token: expect.any(String), tool: STEERING_TOOL_NAME })

    // The queue the pull tool reads is the one this run quotes: this is the whole
    // wiring — a demand pressed into `grok_steer` lands here, and the boundary
    // child's one call takes it away.
    const queue = steeringForSession('sess-wire')
    expect(queue?.token).toBe(replan!.token)
    queue!.push('also do D')
    expect(pullSteering(replan!.token).intents.map(intent => intent.text)).toEqual(['also do D'])
    expect(pullSteering(replan!.token).intents).toEqual([])

    // A demand that arrives after the last boundary is counted, never silently
    // dropped and never carried under this token into a later run.
    queue!.push('and cover E')
    engine.runs[0]!.settle('cancelled')
    const outcome = await pending
    expect(outcome.ok).toBe(false)
    expect(warnings.some(line => line.includes('1 demand(s)'))).toBe(true)
    expect(steeringForSession('sess-wire')).toBeUndefined()
    expect(pullSteering(replan!.token)).toEqual({ intents: [], dropped: 0 })
  })

  it('keeps the payload byte-identical for a caller that asks for no channel', async () => {
    const engine = new WireEngine()
    const warnings: string[] = []
    const pending = begin(engine, warnings, { steering: false })
    const request = await waitForStart(engine)
    expect('replan' in (request.args as Record<string, unknown>)).toBe(false)
    expect(steeringForSession('sess-wire')).toBeUndefined()
    engine.runs[0]!.settle('cancelled')
    await pending
  })

  it('opens nothing when the live replan switch is off, even with a session named', async () => {
    const engine = new WireEngine()
    const warnings: string[] = []
    const pending = begin(engine, warnings, { config: { replan: false } })
    const request = await waitForStart(engine)
    expect('replan' in (request.args as Record<string, unknown>)).toBe(false)
    // No channel, so `grok_steer` says "no live run" instead of queueing into a
    // run that will never visit a boundary.
    expect(steeringForSession('sess-wire')).toBeUndefined()
    engine.runs[0]!.settle('cancelled')
    await pending
  })
})